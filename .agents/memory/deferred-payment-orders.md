---
name: Deferred-payment order lifecycle
description: Defines the stable boundary between pay-later selection, payment evidence, and manual order processing.
---

Every newly submitted order starts `on_hold` because payment has not yet been
confirmed. Swiss deliveries use the stable method identifier
`swiss_qr_invoice`; other supported countries use `pay_later`. Until a live
Picer integration exists, staff move orders manually.

For the future Picer mapping, `Bezig met verwerken` / `Aan het verwerken` means
shop status `processing`. Picer `Compleet` means both processed and shipped, so
the shop order becomes `completed`; it is not merely a `shipped` notification.

**Why:** Swiss customers usually pay later with a QR invoice and foreign
customers usually pay later without Swiss QR. Selecting either method records
how payment is expected, not that payment happened and not that fulfillment
may begin.

**How to apply:** validate the method against delivery country on the server.
Keep payment/accounting updates independent from order lifecycle transitions.
Future payment automation may confirm payment evidence but must not silently
turn an order into processing. Picer callbacks must be authenticated,
correlated through a durable external order identifier, idempotent, monotonic,
and audited. Duplicate completion is a no-op, and late events never revive a
cancelled order. Picer fulfillment status never marks an invoice as paid.