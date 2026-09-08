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
