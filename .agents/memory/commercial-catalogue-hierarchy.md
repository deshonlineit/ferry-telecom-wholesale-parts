---
name: Commercial catalogue hierarchy
description: Defines the default product-type browse order and its interaction with customer pricing and search.
---

Default catalogue browsing follows a commercial product hierarchy: real
screens, batteries, small parts, housings/frames, rear covers, rear glass, then
the remaining accessory groups. Source-category mistakes must not let screen
protectors or display protection rank as real screens.

Within real screens, available products precede unavailable products; available
screens use the signed-in buyer's assigned price in ascending order. Guest
ordering must not use or expose hidden prices.

**Why:** supplier categories are broad and occasionally incorrect. Buyers need
repair-flow ordering, while exact searches and customer-specific prices must
remain trustworthy.

**How to apply:** rank products server-side before pagination using category and
reliable subtype evidence. Preserve exact-SKU/search relevance and every
explicit user-selected sort as higher authority than the default browse order.