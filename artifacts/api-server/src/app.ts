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
import crypto from "node:crypto";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { timingSafeSecretEqual, verifyPicqerSignature } from "./lib/picqerSecurity";
import { picqerFreeStock, picqerWebhookKey } from "./lib/picqerPayload";
import { picqerEnabled } from "./lib/picqerGate";
import { acceptNativeCatalogRelay, acceptNativeRelay, authorizeNativeSignedRead } from "./lib/nativeRelay";
import nativeMediaRouter from "./routes/nativeMedia";

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
// JSON parsing. The route secret is mandatory defense-in-depth authentication.
app.post(["/api/webhooks/picqer", "/api/webhooks/picqer/:routeSecret"], express.raw({ type: "application/json", limit: "256kb" }),
  async (req, res): Promise<void> => {
    const route = process.env.PICQER_WEBHOOK_ROUTE_SECRET ?? "";
    const routeParam = typeof req.params.routeSecret === "string" ? req.params.routeSecret : undefined;
    if (!picqerEnabled()) {
      res.status(503).json({ error: "Picqer connector is disabled" }); return;
    }
    if (!route || !routeParam || !timingSafeSecretEqual(route, routeParam)) {
      res.status(403).json({ error: "Webhook route authentication failed" }); return;
    }
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      res.status(400).json({ error: "Malformed webhook payload" }); return;
    }
    if (!verifyPicqerSignature(req.body, req.header("x-picqer-signature"))) {
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
        const sourceEventAt = new Date(triggeredAt);
        if (!triggeredAt || Number.isNaN(sourceEventAt.valueOf())) throw new Error("invalid-stock-time");
        const stockHash = crypto.createHash("sha256").update(`${sku}:${freeStock}`).digest("hex");
        const changed = await tx.execute(sql`UPDATE native_stock_state SET free_stock=${freeStock},version=version+1,
          content_hash=${stockHash},source_event_at=${sourceEventAt},updated_at=now()
          WHERE sku=${sku} AND (source_event_at IS NULL OR source_event_at<${sourceEventAt}) RETURNING sku`);
        if (!changed.rows[0]) {
          const known = await tx.execute(sql`SELECT sku FROM native_stock_state WHERE sku=${sku}`);
          if (!known.rows[0]) throw new Error("unknown-product");
          // Authenticated stale/equal delivery is recorded but cannot advance
          // stock or the local feed version.
        }
      } else {
        const nativeChanged = await tx.execute(sql`INSERT INTO native_fulfilment_state(native_order_id,picqer_order_id,tracking,status,version,updated_at)
          SELECT native_order_id,picqer_order_id,${tracking},'shipped',1,now() FROM native_picqer_order_mappings
          WHERE picqer_order_id=${remote}
          ON CONFLICT(native_order_id) DO UPDATE SET tracking=EXCLUDED.tracking,status='shipped',version=native_fulfilment_state.version+1,updated_at=now()
          RETURNING native_order_id`);
        if (nativeChanged.rows[0]) {
          // Native ownership is isolated; do not touch shared API orders.
        } else {
          const changed = await tx.execute(sql`UPDATE orders o SET tracking=${tracking},status=CASE WHEN o.status='fulfillment_ready' THEN 'shipped' ELSE o.status END
          FROM picqer_order_mappings m WHERE m.order_id=o.id AND m.picqer_order_id=${remote} RETURNING o.id`);
          if (!changed.rows[0]) throw new Error("unknown-order");
        }
      }
      await tx.execute(sql`INSERT INTO picqer_webhook_events(event_key,event_type,outcome,processed_at) VALUES(${key},${type},'processed',now())`);
    }); } catch (error) {
      if ((error as { code?: string }).code === "23505") { res.json({ accepted: true, duplicate: true }); return; }
      if (error instanceof Error && (error.message === "unknown-product" || error.message === "unknown-order" || error.message === "invalid-stock-time")) {
        res.status(error.message === "invalid-stock-time" ? 400 : 422).json({
          error: error.message === "unknown-product" ? "Unknown product webhook"
            : error.message === "unknown-order" ? "Unknown shipment webhook" : "Malformed stock event time",
        }); return;
      }
      throw error;
    }
    res.json({ accepted: true });
  });

app.get("/api/native/stock-feed", async (req, res): Promise<void> => {
  const page = Math.max(1, Number(req.query.page ?? 1) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 50) || 50));
  const canonical = `/api/native/stock-feed?limit=${limit}&page=${page}`;
  try {
    const fresh = await authorizeNativeSignedRead("GET", canonical,
      String(req.header("x-ferry-relay-timestamp") ?? ""), String(req.header("x-ferry-relay-event-id") ?? ""),
      req.header("x-ferry-relay-signature") ?? undefined);
    if (!fresh) { res.status(409).json({ error: "Relay request replayed" }); return; }
  } catch (error) {
    const status = Number((error as { status?: number }).status);
    res.status(status >= 400 && status < 600 ? status : 403).json({ error: error instanceof Error ? error.message : "Feed authentication failed" }); return;
  }
  const rows = await db.execute(sql`SELECT sku,native_product_id,free_stock,version,content_hash
    FROM native_stock_state ORDER BY sku LIMIT ${limit} OFFSET ${(page - 1) * limit}`);
  const normalized = rows.rows.map((row) => ({ ...row, free_stock: Number((row as Record<string, unknown>).free_stock),
    version: String((row as Record<string, unknown>).version), native_product_id: String((row as Record<string, unknown>).native_product_id) }));
  const body = JSON.stringify({ schema_version: 1, page, limit, rows: normalized });
  const signature = crypto.createHmac("sha256", process.env.PICQER_RELAY_SECRET ?? "").update(body).digest("hex");
  res.setHeader("x-ferry-stock-signature", signature);
  res.type("application/json").send(body);
});
app.get("/api/native/fulfilment-feed", async (req, res): Promise<void> => {
  const page = Math.max(1, Number(req.query.page ?? 1) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 50) || 50));
  const canonical = `/api/native/fulfilment-feed?limit=${limit}&page=${page}`;
  try {
    const fresh = await authorizeNativeSignedRead("GET", canonical,
      String(req.header("x-ferry-relay-timestamp") ?? ""), String(req.header("x-ferry-relay-event-id") ?? ""),
      req.header("x-ferry-relay-signature") ?? undefined);
    if (!fresh) { res.status(409).json({ error: "Relay request replayed" }); return; }
  } catch (error) {
    const status = Number((error as { status?: number }).status);
    res.status(status >= 400 && status < 600 ? status : 403).json({ error: error instanceof Error ? error.message : "Feed authentication failed" }); return;
  }
  const rows = await db.execute(sql`SELECT native_order_id,picqer_order_id,tracking,status,version,
    reservation_acknowledged,processed_at,updated_at
    FROM native_fulfilment_state ORDER BY native_order_id LIMIT ${limit} OFFSET ${(page - 1) * limit}`);
  const normalized = rows.rows.map((row) => ({ ...row, picqer_order_id: String((row as Record<string, unknown>).picqer_order_id),
    version: String((row as Record<string, unknown>).version) }));
  const body = JSON.stringify({ schema_version: 1, page, limit, rows: normalized });
  res.setHeader("x-ferry-fulfilment-signature", crypto.createHmac("sha256", process.env.PICQER_RELAY_SECRET ?? "").update(body).digest("hex"));
  res.type("application/json").send(body);
});

// Native PHP relay uses an exact raw JSON body and versioned HMAC. Keep this
// before the process-wide JSON parser; it is disabled until cutover activation.
app.post("/api/native/relay/orders", express.raw({ type: "application/json", limit: "512kb" }),
  async (req, res): Promise<void> => {
    if (!Buffer.isBuffer(req.body)) { res.status(400).json({ error: "Raw JSON body required" }); return; }
    try {
      const result = await acceptNativeRelay(
        req.body,
        String(req.header("x-ferry-relay-timestamp") ?? ""),
        String(req.header("x-ferry-relay-event-id") ?? ""),
        req.header("x-ferry-relay-signature") ?? undefined,
      );
      res.json({ accepted: true, duplicate: result === "duplicate" });
    } catch (error) {
      const status = Number((error as { status?: number }).status);
      res.status(status >= 400 && status < 600 ? status : 422).json({
        error: error instanceof Error ? error.message : "Relay rejected",
      });
    }
  });
app.post("/api/native/relay/catalog", express.raw({ type: "application/json", limit: "2mb" }),
  async (req, res): Promise<void> => {
    if (!Buffer.isBuffer(req.body)) { res.status(400).json({ error: "Raw JSON body required" }); return; }
    try {
      await acceptNativeCatalogRelay(req.body, String(req.header("x-ferry-relay-timestamp") ?? ""),
        String(req.header("x-ferry-relay-event-id") ?? ""), req.header("x-ferry-relay-signature") ?? undefined);
      res.json({ accepted: true });
    } catch (error) {
      const status = Number((error as { status?: number }).status);
      res.status(status >= 400 && status < 600 ? status : 422).json({ error: error instanceof Error ? error.message : "Relay rejected" });
    }
  });

app.use(cors({ credentials: true, origin: true }));
app.use("/api", nativeMediaRouter);
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
