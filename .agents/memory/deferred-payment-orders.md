---
name: Deferred-payment order lifecycle
description: Defines the stable boundary between pay-later selection, payment evidence, and manual order processing.
---

Every newly submitted order starts `on_hold` because payment has not yet been
confirmed. Swiss deliveries use the stable method identifier
`swiss_qr_invoice`; other supported countries use `pay_later`. Staff move an
order from on hold to processing manually.

**Why:** Swiss customers usually pay later with a QR invoice and foreign
customers usually pay later without Swiss QR. Selecting either method records
how payment is expected, not that payment happened and not that fulfillment
may begin.

**How to apply:** validate the method against delivery country on the server.
Keep payment/accounting updates independent from order lifecycle transitions.
Future payment automation may confirm payment evidence but must not silently
turn an order into processing.