---
name: Picqer fulfilment boundary
description: Safety and lifecycle rules for Ferry Telecom's Picqer warehouse connection.
---

Live Picqer traffic belongs exclusively in the production API and must remain disabled unless production, live integrations, and Picqer are all explicitly enabled. The isolated PHP test shop may simulate fulfilment but must never contact Picqer. The current WooCommerce shop owns fulfilment until a declared cutover; only the new shop may own it afterwards.

**Why:** Test orders or overlapping shops reaching a live warehouse could reserve stock or create duplicate picklists. Order creation also does not prove payment or manual fulfilment approval.

**How to apply:** Queue only immutable post-cutover snapshots after verified payment or explicit audited approval. Keep local reservations subtracted until Picqer successfully processes the concept; mapping alone is not acknowledgment. Use signed relays/webhooks, leases, exact SKU reconciliation, and no pre-cutover backfill.