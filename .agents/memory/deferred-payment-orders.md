---
name: Deferred-payment order lifecycle
description: Defines the stable boundary between pay-later selection, payment evidence, and manual order processing.
---

Every newly submitted order starts `on_hold` because payment has not yet been
confirmed. Staff grant card and one canonical Pay Later entitlement. Delivery
country determines the Pay Later document: Swiss delivery uses the Swiss QR
code on the invoice; other supported European delivery uses a normal invoice
without Swiss QR. Until a live Picer integration exists, staff move orders
manually.

For the future Picer mapping, `Bezig met verwerken` / `Aan het verwerken` means
shop status `processing`. Picer `Compleet` means both processed and shipped, so
the shop order becomes `completed`; it is not merely a `shipped` notification.

**Why:** Swiss QR is not a separate customer choice; it is the Swiss form of Pay
Later. Selecting a payment method records how payment is expected, not that
payment happened and not that fulfillment may begin.

**How to apply:** quote and checkout expose only canonical Pay Later, then the
server resolves it from the validated delivery country. Never expose or accept
Swiss QR as a separate new-checkout choice. Keep legacy Swiss QR orders
readable, and keep payment/accounting updates independent from order lifecycle
transitions.
Future payment automation may confirm payment evidence but must not silently
turn an order into processing. Picer callbacks must be authenticated,
correlated through a durable external order identifier, idempotent, monotonic,
and audited. Duplicate completion is a no-op, and late events never revive a
cancelled order. Picer fulfillment status never marks an invoice as paid.

Staff may deliberately reopen a cancelled order to `on_hold`. Reopening must
lock and re-reserve every product atomically, fail if any stock is insufficient,
and clear the stock-restored marker. It must never alter payment state.