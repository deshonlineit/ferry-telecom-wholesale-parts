import type Stripe from "stripe";
import { notifyNativePaymentState, type NativePaymentState } from "./lib/nativePaymentCallback";
import {
  getStripeSync,
} from "./stripeClient";

function stringMetadata(
  event: Stripe.Event,
): { orderId: string; orderNumber: string } | undefined {
  if (!event.data.object || !("metadata" in event.data.object)) return undefined;
  const metadata = event.data.object.metadata;
  const orderId = metadata?.native_order_id;
  const orderNumber = metadata?.native_order_number;
  return orderId && orderNumber ? { orderId, orderNumber } : undefined;
}

function paymentState(event: Stripe.Event): NativePaymentState | undefined {
  const session = event.data.object as Stripe.Checkout.Session;
  if (event.type === "checkout.session.completed" && session.payment_status === "paid") {
    return "paid";
  }
  if (event.type === "checkout.session.async_payment_succeeded") return "paid";
  if (event.type === "checkout.session.async_payment_failed") return "failed";
  if (event.type === "checkout.session.expired") return "expired";
  return undefined;
}

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string): Promise<void> {
    if (!Buffer.isBuffer(payload)) {
      throw new Error("Stripe webhook payload must be a Buffer.");
    }

    // StripeSync verifies the signature before persisting. Only parse and act
    // on the event after that verification has completed successfully.
    await (await getStripeSync()).processWebhook(payload, signature);
    const event = JSON.parse(payload.toString("utf8")) as Stripe.Event;

    const state = paymentState(event);
    const reference = state ? stringMetadata(event) : undefined;
    if (!state || !reference) return;

    const session = event.data.object as Stripe.Checkout.Session;
    await notifyNativePaymentState({
      event_id: event.id,
      event_created_at: event.created,
      order_id: reference.orderId,
      order_number: reference.orderNumber,
      checkout_session_id: session.id,
      payment_intent_id:
        typeof session.payment_intent === "string" ? session.payment_intent : null,
      state,
    });
  }
}