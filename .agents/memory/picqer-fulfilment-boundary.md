---
name: Picqer fulfilment boundary
description: Safety and lifecycle rules for Ferry Telecom's Picqer warehouse connection.
---

Live Picqer traffic belongs exclusively in the production API and must remain disabled unless production, live integrations, and Picqer are all explicitly enabled. The isolated PHP test shop may simulate fulfilment but must never contact Picqer.

**Why:** Test orders reaching a live warehouse could reserve stock or create real picklists. Order creation also does not prove payment or manual fulfilment approval.

**How to apply:** Queue an order only after a verified payment or explicit manual fulfilment transition marks it ready. Use durable idempotency, SKU product codes, signed raw-body webhooks, and Picqer free-stock/shipment callbacks; never infer readiness from checkout creation.