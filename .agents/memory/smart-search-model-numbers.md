---
name: Smart-search model numbers
description: Owner-confirmed interpretation of standalone numeric terms in product searches.
---

A standalone numeric search term should be interpreted as a complete device
model number, not as an arbitrary digit fragment.

**Why:** searching `14 oled` surfaced Galaxy A33 parts because `14` appeared
inside supplier identifiers such as `GH82-28143A`. The owner expects actual
model-14 screens instead.

**How to apply:** in mixed smart-search queries, match standalone numbers only
as complete boundaries in the descriptive product-name segment or an actual
device-model relation; retain exact numeric SKU matching. Never satisfy them
with digits buried in SKUs or trailing supplier/part codes.