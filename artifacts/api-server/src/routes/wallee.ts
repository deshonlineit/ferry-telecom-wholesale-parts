import { Router, type IRouter, type Request } from "express";
import { z } from "zod";
import {
  Configuration, DefaultConfig, Environment, HttpBearerAuth, LineItemType, RefundType,
  RefundsService, TransactionState, TransactionsService,
  type RefundCreate, type TransactionCreate,
} from "wallee";
import { isNativeBridgeAuthorized, notifyNativePaymentState } from "../lib/nativePaymentCallback";

const router: IRouter = Router();
const space = () => Number(process.env.WALLEE_SPACE_ID ?? 24285);
function services() {
  const id = Number(process.env.WALLEE_APPLICATION_USER_ID);
  const key = process.env.WALLEE_AUTHENTICATION_KEY;
  if (!Number.isSafeInteger(id) || id < 1 || !key) throw new Error("Wallee credentials are not configured.");
  // Never mutate DefaultConfig: a request-local Configuration prevents credential
  // races when multiple spaces/requests are served concurrently.
  const config = new Configuration({ basePath: DefaultConfig.basePath, httpBearerAuth: new HttpBearerAuth(id, key) });
  return { transactions: new TransactionsService(config), refunds: new RefundsService(config) };
}
function auth(req: Request) {
  return isNativeBridgeAuthorized(req.get("X-Native-Stripe-Bridge-Secret"));
}
function safePaymentUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (
      url.hostname === "wallee.com"
      || url.hostname.endsWith(".wallee.com")
      || url.hostname === "app-wallee.com"
      || url.hostname.endsWith(".app-wallee.com")
    );
  } catch { return false; }
}

const quote = z.object({
  orderId: z.string().min(1).max(128), attemptId: z.string().min(1).max(128),
  orderNumber: z.string().min(1).max(128), totalCents: z.number().int().positive(),
  currency: z.literal("chf"),
  transactionId: z.number().int().positive().optional(),
  lines: z.array(z.object({ name: z.string().min(1).max(500), sku: z.string().max(200), quantity: z.number().int().positive(), unitAmountCents: z.number().int().nonnegative() })).min(1).max(100),
});
function urls(orderId: string) {
  const origin = process.env.NATIVE_SHOP_ORIGIN ?? `https://${process.env.REPLIT_DOMAINS?.split(",")[0]}/test-shop/`;
  const root = new URL(origin.endsWith("/") ? origin : `${origin}/`);
  return { successUrl: new URL(`account/orders/${encodeURIComponent(orderId)}`, root).href, failedUrl: new URL("checkout", root).href };
}

router.post("/wallee/native/checkout", async (req, res): Promise<void> => {
  if (!auth(req)) { res.status(401).json({ error: "Unauthorized" }); return; }
  const parsed = quote.safeParse(req.body);
  if (!parsed.success || parsed.data.lines.reduce((n, l) => n + l.quantity * l.unitAmountCents, 0) !== parsed.data.totalCents) {
    res.status(400).json({ error: "Invalid native CHF checkout quote" }); return;
  }
  const q = parsed.data; const api = services(); const redirect = urls(q.orderId);
  if (q.transactionId) {
    const existing = await api.transactions.getPaymentTransactionsId({ space: space(), id: q.transactionId });
    if (
      existing.linkedSpaceId !== space()
      || existing.currency !== "CHF"
      || existing.merchantReference !== q.orderNumber
      || existing.metaData?.native_order_id !== q.orderId
      || existing.metaData?.native_order_number !== q.orderNumber
    ) {
      res.status(409).json({ error: "Existing Wallee transaction does not belong to this order" });
      return;
    }
    const existingUrl = await api.transactions.getPaymentTransactionsIdPaymentPageUrl({ space: space(), id: q.transactionId });
    if (!safePaymentUrl(existingUrl)) throw new Error("Wallee returned an unsafe payment-page URL.");
    res.json({ id: String(q.transactionId), url: existingUrl, reused: true });
    return;
  }
  const transactionCreate: TransactionCreate = {
    currency: "CHF", merchantReference: q.orderNumber,
    environment: process.env.WALLEE_ENVIRONMENT === "LIVE" ? Environment.Live : Environment.Preview,
    autoConfirmationEnabled: true, successUrl: redirect.successUrl, failedUrl: redirect.failedUrl,
    allowedPaymentMethodConfigurations: [Number(process.env.WALLEE_TWINT_PAYMENT_METHOD_CONFIGURATION_ID ?? 82134)],
    metaData: { native_order_id: q.orderId, native_order_number: q.orderNumber },
    lineItems: q.lines.map((line) => ({
      name: line.name,
      uniqueId: line.sku,
      sku: line.sku,
      quantity: line.quantity,
      amountIncludingTax: (line.quantity * line.unitAmountCents) / 100,
      type: LineItemType.Product,
    })),
  };
  const transaction = await api.transactions.postPaymentTransactions({ space: space(), transactionCreate });
  if (!transaction.id) throw new Error("Wallee did not return a transaction ID.");
  const url = await api.transactions.getPaymentTransactionsIdPaymentPageUrl({ space: space(), id: transaction.id });
  if (!safePaymentUrl(url)) throw new Error("Wallee returned an unsafe payment-page URL.");
  res.status(201).json({ id: String(transaction.id), url });
});

router.post("/wallee/native/refund", async (req, res): Promise<void> => {
  if (!auth(req)) { res.status(401).json({ error: "Unauthorized" }); return; }
  const input = z.object({ transactionId: z.number().int().positive(), amount: z.number().int().positive(), currency: z.literal("CHF"), idempotencyKey: z.string().min(1).max(255) }).safeParse(req.body);
  if (!input.success) { res.status(400).json({ error: "Invalid Wallee refund request" }); return; }
  const refundCreate: RefundCreate = { transaction: input.data.transactionId, amount: input.data.amount / 100, externalId: input.data.idempotencyKey, type: RefundType.MerchantInitiatedOnline };
  const refund = await services().refunds.postPaymentRefunds({ space: space(), refundCreate });
  res.status(201).json({ id: String(refund.id), status: refund.state ?? "PENDING" });
});

router.post("/wallee/webhook", async (req, res): Promise<void> => {
  const secret = process.env.WALLEE_WEBHOOK_SECRET;
  if (!secret || (req.get("X-Wallee-Webhook-Secret") !== secret && req.get("Authorization") !== `Bearer ${secret}`)) {
    res.status(401).json({ error: "Webhook authentication failed" }); return;
  }
  const hint = req.body && typeof req.body === "object" ? req.body as Record<string, unknown> : {};
  const entity = hint.entity && typeof hint.entity === "object" ? hint.entity as Record<string, unknown> : {};
  const transactionId = Number(hint.entityId ?? entity.id ?? hint.id);
  if (!Number.isSafeInteger(transactionId) || transactionId < 1) { res.status(400).json({ error: "Missing transaction ID" }); return; }
  const transaction = await services().transactions.getPaymentTransactionsId({ space: space(), id: transactionId });
  if (transaction.linkedSpaceId !== space()) { res.status(403).json({ error: "Wrong Wallee space" }); return; }
  const metadata = transaction.metaData ?? {};
  const orderId = String(metadata.native_order_id ?? "");
  const orderNumber = String(transaction.merchantReference ?? "");
  if (!orderId || metadata.native_order_number !== undefined && String(metadata.native_order_number) !== orderNumber) { res.status(409).json({ error: "Transaction is not bound to the native order" }); return; }
  const state = transaction.state;
  if (state !== TransactionState.Completed && state !== TransactionState.Failed && state !== TransactionState.Decline) { res.json({ accepted: true, pending: true }); return; }
  const eventCreatedAt = transaction.version ?? 0;
  await notifyNativePaymentState({ event_id: `wallee:${transactionId}:v${eventCreatedAt}`, event_created_at: eventCreatedAt, order_id: orderId, order_number: orderNumber, checkout_session_id: String(transactionId), payment_intent_id: null, provider: "wallee", state: state === TransactionState.Completed ? "paid" : "failed" });
  res.json({ accepted: true });
});
export default router;