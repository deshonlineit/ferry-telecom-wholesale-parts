import express, { type ErrorRequestHandler, type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";
import router from "./routes";
import { logger } from "./lib/logger";
import { WebhookHandlers } from "./webhookHandlers";
import crypto from "node:crypto";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { timingSafeSecretEqual, verifyPicqerSignature } from "./lib/picqerSecurity";
import { picqerFreeStock, picqerWebhookKey } from "./lib/picqerPayload";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

// Official Picqer HMAC validation needs exact raw bytes and therefore precedes
// JSON parsing. A route secret is optional defense-in-depth, not authentication.
app.post(["/api/webhooks/picqer", "/api/webhooks/picqer/:routeSecret"], express.raw({ type: "application/json", limit: "256kb" }),
  async (req, res): Promise<void> => {
    const route = process.env.PICQER_WEBHOOK_ROUTE_SECRET ?? "";
    const routeParam = typeof req.params.routeSecret === "string" ? req.params.routeSecret : undefined;
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      res.status(400).json({ error: "Malformed webhook payload" }); return;
    }
    if ((route && !timingSafeSecretEqual(route, routeParam))
      || !verifyPicqerSignature(req.body, req.header("x-picqer-signature"))) {
      res.status(403).json({ error: "Webhook authentication failed" }); return;
    }
    let event: Record<string, unknown>;
    try { event = JSON.parse(req.body.toString("utf8")) as Record<string, unknown>; } catch {
      res.status(400).json({ error: "Malformed webhook payload" }); return;
    }
    const type = typeof event.event === "string" ? event.event : event.type;
    if (type !== "picklists.shipments.created" && type !== "products.free_stock_changed") {
      res.status(422).json({ error: "Unsupported webhook event" }); return;
    }
    const hookId = typeof event.idhook === "string" || typeof event.idhook === "number" ? String(event.idhook) : "";
    const triggeredAt = typeof event.event_triggered_at === "string" ? event.event_triggered_at : "";
    const key = picqerWebhookKey(String(type), hookId, triggeredAt, req.body);
    const data = event.data && typeof event.data === "object" && !Array.isArray(event.data) ? event.data as Record<string, unknown> : null;
    if (!data) { res.status(400).json({ error: "Malformed webhook payload" }); return; }
    let sku: string | undefined, freeStock: number | undefined, remote: number | undefined, tracking: string | undefined;
    if (type === "products.free_stock_changed") {
      sku = typeof data.productcode === "string" ? data.productcode : undefined;
      freeStock = picqerFreeStock(data) ?? undefined;
      if (!sku || freeStock === undefined) { res.status(400).json({ error: "Malformed stock webhook" }); return; }
    } else {
      remote = typeof data.idorder === "number" && Number.isInteger(data.idorder) ? data.idorder
        : typeof data.order_id === "number" && Number.isInteger(data.order_id) ? data.order_id : undefined;
      tracking = typeof data.trackingcode === "string" ? data.trackingcode
        : typeof data.tracktrace === "string" ? data.tracktrace
        : typeof data.tracking === "string" ? data.tracking : undefined;
      if (!remote || tracking === undefined || tracking.length > 190) { res.status(400).json({ error: "Malformed shipment webhook" }); return; }
    }
    try { await db.transaction(async (tx) => {
      if (type === "products.free_stock_changed") {
        const changed = await tx.execute(sql`UPDATE products p SET stock=${freeStock} FROM picqer_product_state s WHERE s.product_id=p.id AND s.productcode=${sku} RETURNING p.id`);
        if (!changed.rows[0]) throw new Error("unknown-product");
        await tx.execute(sql`UPDATE picqer_product_state SET last_free_stock=${freeStock},last_stock_event_at=now(),updated_at=now() WHERE productcode=${sku}`);
      } else {
        const changed = await tx.execute(sql`UPDATE orders o SET tracking=${tracking},status=CASE WHEN o.status='fulfillment_ready' THEN 'shipped' ELSE o.status END
          FROM picqer_order_mappings m WHERE m.order_id=o.id AND m.picqer_order_id=${remote} RETURNING o.id`);
        if (!changed.rows[0]) throw new Error("unknown-order");
      }
      await tx.execute(sql`INSERT INTO picqer_webhook_events(event_key,event_type,outcome,processed_at) VALUES(${key},${type},'processed',now())`);
    }); } catch (error) {
      if ((error as { code?: string }).code === "23505") { res.json({ accepted: true, duplicate: true }); return; }
      if (error instanceof Error && (error.message === "unknown-product" || error.message === "unknown-order")) {
        res.status(422).json({ error: error.message === "unknown-product" ? "Unknown product webhook" : "Unknown shipment webhook" }); return;
      }
      throw error;
    }
    res.json({ accepted: true });
  });

// Stripe requires the exact raw bytes for signature verification. This must
// remain before every JSON parser, including the scoped CSV parser below.
app.post(
  "/api/stripe/webhook",
  express.raw({ type: "application/json" }),
  async (req, res): Promise<void> => {
    const header = req.headers["stripe-signature"];
    const signature = Array.isArray(header) ? header[0] : header;
    if (!signature) {
      res.status(400).json({ error: "Missing stripe-signature" });
      return;
    }
    if (!Buffer.isBuffer(req.body)) {
      req.log.error("Stripe webhook body was not raw");
      res.status(500).json({ error: "Webhook body parsing error" });
      return;
    }
    try {
      await WebhookHandlers.processWebhook(req.body, signature);
      res.status(200).json({ received: true });
    } catch (err) {
      req.log.error({ err }, "Stripe webhook processing failed");
      res.status(400).json({ error: "Webhook processing failed" });
    }
  },
);

app.use(cors({ credentials: true, origin: true }));
// CSV imports carry the file text in JSON. Keep the larger parser scoped so
// every other endpoint retains Express's normal body limit.
app.use("/api/admin/products/import", express.json({ limit: "2mb" }));
const csvImportBodyErrorHandler: ErrorRequestHandler = (error, _req, res, next) => {
  if ((error as { type?: string }).type === "entity.too.large") {
    res.status(400).json({ error: "CSV request exceeds the allowed size" });
    return;
  }
  next(error);
};
app.use("/api/admin/products/import", csvImportBodyErrorHandler);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
  })),
);

app.use("/api", router);

export default app;
