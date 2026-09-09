# Picqer fulfillment integration

This connector is disabled by default. Enable it only in production with
`LIVE_INTEGRATIONS=1`, `PICQER_ENABLED=1`, a dedicated `PICQER_API_KEY`, and
either HTTPS `PICQER_BASE_URL` or `PICQER_ACCOUNT`. Register the callback as
`https://<host>/api/webhooks/picqer` (or append the configured
`PICQER_WEBHOOK_ROUTE_SECRET`). Configure Picqer with
`PICQER_WEBHOOK_SECRET`: requests are verified using the official
`X-Picqer-Signature`, base64 HMAC-SHA256 over exact raw bytes.

Register `picklists.shipments.created` and `products.free_stock_changed`.
The receiver accepts Picqer's `idhook`, `name`, `event`, `event_triggered_at`,
and `data` envelope (using `event`, not the arbitrary hook `name`), and dedupes an exact delivery using the hook, trigger
time, event type, and raw-body hash (not `idhook` alone). Free stock is the
sum of nonnegative `data.stock[].freestock` warehouse entries; legacy
top-level `data.free_stock` is accepted only as a compatibility fallback. It does bounded
database work only.
It never accepts payment, price, or order-content changes from callbacks.

Order enqueue is intentionally explicit: call
`queuePicqerFulfillmentReadyOrder` only after a verified payment/manual
fulfillment transition has set `fulfillment_ready`. It will not infer payment
from order creation or `processing`. Run `pnpm picqer-worker -- --dry-run
--limit 20` to inspect a bounded batch.

## Confirmed ownership cutover (disabled deployment)

Until cutover, WooCommerce remains the sole Picqer owner. Keep
`PICQER_ENABLED=0`, `PICQER_RELAY_ENABLED=0`, and do not configure or expose
relay secrets. The native shop may stage immutable paid-order snapshots locally,
but no dispatcher, worker, catalog reconciliation, stock pull, or webhook is
started. The API native relay routes return `503`; they perform no database
mutation while disabled. Do not register Picqer hooks during this phase.

Activation is a deliberately ordered change:

1. Freeze the native catalog and send a signed manifest; resolve every active
   SKU exactly once with the read-only reconciliation command
   (`--read-only-reconcile`). It must make GET requests only.
2. Audit the dedicated SKU mappings and stock feed, and confirm 100% active SKU
   coverage. **No Picqer hook may be registered before this check passes.**
3. Set and verify `PICQER_CUTOVER_AT` (never backfill orders before it), deploy
   the signed relay endpoint/dispatcher with a new `PICQER_RELAY_SECRET`, and
   dry-run both one-shot workers.
4. In production only, set `LIVE_INTEGRATIONS=1`, `PICQER_RELAY_ENABLED=1`,
   and then `PICQER_ENABLED=1`; register Picqer hooks last.

The native dispatcher posts only to the API relay endpoint, never directly to
Picqer. Every relay body is signed as
`v1.timestamp.event-id.body` and accepted only once per immutable hash. The
native Picqer worker is one-shot and lease-safe; use an external scheduler,
not an in-process autoscale timer.

There is no separate explicit staff fulfilment-approval endpoint in the native
shop. Generic status edits are intentionally never treated as approval.