---
name: Swiss destination VAT
description: Destination-based Swiss VAT treatment for domestic and export orders.
---

Resolve Swiss VAT exclusively from the validated delivery destination. Apply
8.1% to Swiss deliveries, including shipping. Apply 0% Swiss VAT to exported
goods delivered outside Switzerland under Article 23 paragraph 2 item 1 of the
Swiss VAT Act; destination import VAT and duties are separate and not presented
as collected by the shop.

**Why:** VAT is a legal destination rule, not an editable commercial setting.
Allowing staff or the browser to choose the rate can produce incorrect quotes,
invoices, refunds, and tax records.

**How to apply:** derive the rate server-side during quote and checkout, retain
country-specific shipping prices, and persist the resolved tax in each order.
Invoices, returns, and credit notes must use that immutable order snapshot rather
than recalculating historical documents from the current policy.