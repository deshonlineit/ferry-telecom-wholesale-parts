import { timingSafeEqual } from "node:crypto";
import { createHash } from "node:crypto";
import { logger } from "./logger";

export type NativePaymentState = "paid" | "failed" | "expired";

type NativePaymentUpdate = {
  event_id: string;
  event_created_at: number;
  order_id: string;
  order_number: string;
  checkout_session_id: string;
  payment_intent_id: string | null;
  provider?: "stripe" | "wallee";
  state: NativePaymentState;
};

function bridgeSecret(): string | undefined {
  if (process.env.NATIVE_STRIPE_BRIDGE_SECRET) return process.env.NATIVE_STRIPE_BRIDGE_SECRET;
  if (!process.env.SESSION_SECRET) return undefined;
  return createHash("sha256")
    .update(`ferry-stripe-bridge-v1:${process.env.SESSION_SECRET}`)
    .digest("hex");
}

function configuredCallback(): { url: URL; secret: string } {
  const secret = bridgeSecret();
  const configuredUrl = process.env.NATIVE_PAYMENT_CALLBACK_URL;
  const domain = process.env.REPLIT_DOMAINS?.split(",")[0]?.trim();
  const urlValue = configuredUrl ?? (process.env.NODE_ENV === "production" && domain
    ? `https://${domain}/test-shop/api/internal/payments/callback`
    : "http://localhost:80/test-shop/api/internal/payments/callback");
  if (!secret) {
    throw new Error(
      "NATIVE_STRIPE_BRIDGE_SECRET or SESSION_SECRET is required to derive native bridge authentication.",
    );
  }

  let url: URL;
  try {
    url = new URL(urlValue);
  } catch {
    throw new Error("NATIVE_PAYMENT_CALLBACK_URL must be an absolute URL.");
  }
  if (url.protocol !== "https:" && !(process.env.NODE_ENV !== "production" && url.protocol === "http:")) {
    throw new Error("NATIVE_PAYMENT_CALLBACK_URL must use HTTPS outside development.");
  }
  return { url, secret };
}

export function isNativeBridgeAuthorized(header: string | undefined): boolean {
  const expected = bridgeSecret();
  if (!expected || !header) return false;
  const received = Buffer.from(header);
  const expectedBuffer = Buffer.from(expected);
  return received.length === expectedBuffer.length && timingSafeEqual(received, expectedBuffer);
}

/**
 * This callback intentionally carries payment facts only. The native service is
 * responsible for idempotency (eventId) and monotonic state handling using
 * eventCreatedAt; it must never use this callback to fulfil or ship an order.
 */
export async function notifyNativePaymentState(update: NativePaymentUpdate): Promise<void> {
  const { url, secret } = configuredCallback();
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(update),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    logger.warn(
      { status: response.status, eventId: update.event_id, orderId: update.order_id },
      "Native payment-state callback rejected Stripe event",
    );
    throw new Error(`Native payment-state callback failed (${response.status}).`);
  }
}