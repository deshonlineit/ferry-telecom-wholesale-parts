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