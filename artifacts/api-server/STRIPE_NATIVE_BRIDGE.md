# Stripe native checkout bridge

The browser never calls the Stripe bridge. The native commerce service calls:

`POST /api/stripe/native/checkout-session`

with `X-Native-Stripe-Bridge-Secret` equal to `NATIVE_STRIPE_BRIDGE_SECRET` and:

```json
{
  "orderId": "123",
  "attemptId": "456",
  "orderNumber": "TS-20250101-ABCDE",
  "currency": "eur",
  "totalCents": 1234,
  "lines": [{"name": "Part", "sku": "SKU-1", "quantity": 2, "unitAmountCents": 617}]
}
```

The bridge rejects malformed quotes and totals that do not equal the submitted
line total. It creates a one-time Stripe Checkout Session using its own fixed
redirects based on `NATIVE_SHOP_ORIGIN`; neither redirect URL is browser input.
The Stripe idempotency key is
`native-order:<orderId>:attempt:<attemptId>`. Replaying an active attempt
returns the same Checkout Session; a terminal failed/expired invoice retry gets
a new native attempt id and therefore a new session.

Required server configuration:

- Replit Stripe connector (secret key and webhook secret)
- `DATABASE_URL`, `REPLIT_DOMAINS`
- `NATIVE_STRIPE_BRIDGE_SECRET` (optional dedicated override). When absent, both
  services derive the same domain-separated bridge key from `SESSION_SECRET`;
  the raw session secret is never passed to PHP.
- `NATIVE_SHOP_ORIGIN`
- `NATIVE_PAYMENT_CALLBACK_URL`

Verified Stripe checkout events call `NATIVE_PAYMENT_CALLBACK_URL` with bearer
authentication using the same bridge secret. The native callback must accept
only this payload and persist idempotently by `eventId`, retaining the latest
payment state by `eventCreatedAt`:

```json
{
  "eventId": "evt_...",
  "eventCreatedAt": 1735689600,
  "orderId": "123",
  "orderNumber": "TS-20250101-ABCDE",
  "checkoutSessionId": "cs_...",
  "paymentIntentId": "pi_...",
  "state": "paid"
}
```

Supported states are `paid`, `failed`, and `expired`. This callback is payment
state only: it must not fulfil, ship, decrement stock, or otherwise progress
the order lifecycle.