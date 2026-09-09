import { Router, type IRouter } from "express";
import { z } from "zod";
import { isNativeBridgeAuthorized } from "../lib/nativePaymentCallback";
import { getUncachableStripeClient } from "../stripeClient";

const router: IRouter = Router();

type NativeLine = {
  name: string;
  sku: string;
  quantity: number;
  unitAmountCents: number;
};

type NativeCheckoutQuote = {
  orderId: string;
  attemptId: string;
  orderNumber: string;
  currency: "eur" | "chf";
  totalCents: number;
  lines: NativeLine[];
};

const nativeRefundRequest = z
  .object({
    returnId: z.string().trim().min(1).max(128),
    settlementId: z.string().trim().min(1).max(128),
    orderId: z.string().trim().min(1).max(128),
    orderNumber: z.string().trim().min(1).max(128),
    amount: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    currency: z.string().regex(/^[a-z]{3}$/),
    paymentIntentId: z.string().regex(/^pi_[A-Za-z0-9]+$/).max(255),
    idempotencyKey: z.string().trim().min(1).max(255),
  })
  .strict();

function parseQuote(value: unknown): NativeCheckoutQuote | undefined {
  if (!value || typeof value !== "object") return undefined;
  const input = value as Record<string, unknown>;
  const orderId = input.orderId;
  const attemptId = input.attemptId;
  const orderNumber = input.orderNumber;
  const currency = input.currency;
  const totalCents = input.totalCents;
  const lines = input.lines;
  if (
    typeof orderId !== "string" ||
    !orderId ||
    orderId.length > 128 ||
    typeof attemptId !== "string" ||
    !attemptId ||
    attemptId.length > 128 ||
    typeof orderNumber !== "string" ||
    !orderNumber ||
    orderNumber.length > 128 ||
    (currency !== "eur" && currency !== "chf") ||
    typeof totalCents !== "number" ||
    !Number.isSafeInteger(totalCents) ||
    totalCents < 1 ||
    !Array.isArray(lines) ||
    lines.length === 0 ||
    lines.length > 100
  ) {
    return undefined;
  }

  const parsedLines: NativeLine[] = [];
  let computedTotal = 0;
  for (const line of lines) {
    if (!line || typeof line !== "object") return undefined;
    const candidate = line as Record<string, unknown>;
    if (
      typeof candidate.name !== "string" ||
      !candidate.name ||
      candidate.name.length > 500 ||
      typeof candidate.sku !== "string" ||
      candidate.sku.length > 200 ||
      typeof candidate.quantity !== "number" ||
      !Number.isSafeInteger(candidate.quantity) ||
      candidate.quantity < 1 ||
      candidate.quantity > 100_000 ||
      typeof candidate.unitAmountCents !== "number" ||
      !Number.isSafeInteger(candidate.unitAmountCents) ||
      candidate.unitAmountCents < 0 ||
      candidate.unitAmountCents > 100_000_000
    ) {
      return undefined;
    }
    const lineTotal = candidate.quantity * candidate.unitAmountCents;
    if (!Number.isSafeInteger(lineTotal)) return undefined;
    computedTotal += lineTotal;
    if (!Number.isSafeInteger(computedTotal)) return undefined;
    parsedLines.push({
      name: candidate.name,
      sku: candidate.sku,
      quantity: candidate.quantity,
      unitAmountCents: candidate.unitAmountCents,
    });
  }
  if (computedTotal !== totalCents) return undefined;
  return { orderId, attemptId, orderNumber, currency, totalCents, lines: parsedLines };
}

function nativeCheckoutUrls(orderId: string): { successUrl: string; cancelUrl: string } {
  const domain = process.env.REPLIT_DOMAINS?.split(",")[0]?.trim();
  const origin = process.env.NATIVE_SHOP_ORIGIN ?? (domain ? `https://${domain}/test-shop/` : undefined);
  if (!origin) throw new Error("NATIVE_SHOP_ORIGIN or REPLIT_DOMAINS is required for Stripe Checkout redirects.");
  const base = new URL(origin);
  if (base.protocol !== "https:" && !(process.env.NODE_ENV !== "production" && base.protocol === "http:")) {
    throw new Error("NATIVE_SHOP_ORIGIN must use HTTPS outside development.");
  }
  const root = base.href.endsWith("/") ? base.href : `${base.href}/`;
  const checkout = new URL("checkout", root);
  const order = new URL(`account/orders/${encodeURIComponent(orderId)}`, root);
  return {
    successUrl: `${order.href}?stripe_session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: checkout.href,
  };
}

router.post("/stripe/native/checkout-session", async (req, res): Promise<void> => {
  const secret = req.get("X-Native-Stripe-Bridge-Secret");
  if (!isNativeBridgeAuthorized(secret)) {
    req.log.warn("Rejected unauthenticated native Stripe bridge request");
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const quote = parseQuote(req.body);
  if (!quote) {
    res.status(400).json({ error: "Invalid native checkout quote" });
    return;
  }

  const { successUrl, cancelUrl } = nativeCheckoutUrls(quote.orderId);
  const session = await (await getUncachableStripeClient()).checkout.sessions.create(
    {
      mode: "payment",
      payment_method_types: ["card"],
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: quote.orderId,
      metadata: {
        native_order_id: quote.orderId,
        native_order_number: quote.orderNumber,
      },
      payment_intent_data: {
        metadata: {
          native_order_id: quote.orderId,
          native_order_number: quote.orderNumber,
        },
      },
      line_items: quote.lines.map((line) => ({
        quantity: line.quantity,
        price_data: {
          currency: quote.currency,
          unit_amount: line.unitAmountCents,
          product_data: { name: line.name, metadata: { sku: line.sku } },
        },
      })),
    },
    { idempotencyKey: `native-order:${quote.orderId}:attempt:${quote.attemptId}` },
  );
  if (!session.url) throw new Error("Stripe did not return a Checkout Session URL.");
  res.status(201).json({ id: session.id, url: session.url });
});

router.post("/stripe/native/refund", async (req, res): Promise<void> => {
  const secret = req.get("X-Native-Stripe-Bridge-Secret");
  if (!isNativeBridgeAuthorized(secret)) {
    req.log.warn("Rejected unauthenticated native Stripe bridge refund request");
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const parsed = nativeRefundRequest.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid native refund request" });
    return;
  }

  const refundRequest = parsed.data;
  const stripe = await getUncachableStripeClient();
  const paymentIntent = await stripe.paymentIntents.retrieve(refundRequest.paymentIntentId);

  if (
    paymentIntent.status !== "succeeded" ||
    paymentIntent.amount_received < 1 ||
    paymentIntent.currency !== refundRequest.currency ||
    paymentIntent.metadata.native_order_id !== refundRequest.orderId ||
    paymentIntent.metadata.native_order_number !== refundRequest.orderNumber
  ) {
    req.log.warn(
      { paymentIntentId: refundRequest.paymentIntentId, orderId: refundRequest.orderId },
      "Rejected native Stripe refund that did not match its PaymentIntent",
    );
    res.status(409).json({ error: "PaymentIntent is not refundable for this order" });
    return;
  }

  let priorRefundedAmount = 0;
  await stripe.refunds
    .list({ payment_intent: paymentIntent.id, limit: 100 })
    .autoPagingEach((refund) => {
      // Failed and cancelled refunds do not consume the captured balance.
      if (refund.status !== "failed" && refund.status !== "canceled") {
        priorRefundedAmount += refund.amount;
      }
    });

  const refundableAmount = paymentIntent.amount_received - priorRefundedAmount;
  if (
    !Number.isSafeInteger(priorRefundedAmount) ||
    !Number.isSafeInteger(refundableAmount) ||
    refundableAmount < refundRequest.amount
  ) {
    req.log.warn(
      {
        paymentIntentId: paymentIntent.id,
        orderId: refundRequest.orderId,
        amount: refundRequest.amount,
      },
      "Rejected native Stripe refund exceeding captured balance",
    );
    res.status(409).json({ error: "Requested amount exceeds the refundable balance" });
    return;
  }

  const refund = await stripe.refunds.create(
    {
      payment_intent: paymentIntent.id,
      amount: refundRequest.amount,
      metadata: {
        native_return_id: refundRequest.returnId,
        native_settlement_id: refundRequest.settlementId,
        native_order_id: refundRequest.orderId,
        native_order_number: refundRequest.orderNumber,
      },
    },
    { idempotencyKey: refundRequest.idempotencyKey },
  );

  res.status(201).json({
    id: refund.id,
    status: refund.status,
    amount: refund.amount,
    currency: refund.currency,
  });
});

export default router;
