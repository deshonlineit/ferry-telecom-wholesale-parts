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

When a query identifies a device and quality but spans several part types, show
real part-type shortcuts before the mixed product rows.

**Why:** the owner expects `pulled 15 pro` to offer visual routes such as
screens and back housings instead of making the buyer inspect a mixed list.

**How to apply:** derive shortcuts from all actual matching products, include a
real local product image and count, omit zero-result types, and link directly to
the catalogue with the original query plus the selected category. Do not infer
or display unavailable part types.

Customer colour words must match equivalent Dutch, German, and English product
wording.

**Why:** customers search in Dutch, while supplier titles may use German or
English; for example, `zwart`, `schwarz`, and `black` must find the same parts.

**How to apply:** keep one shared multilingual colour dictionary for Smart
Search and full-catalogue filtering. Aliases should remain an AND constraint:
every result must have one equivalent of the requested colour.

Search must accept ordinary conversational requests, not require catalogue
syntax.

**Why:** the owner expects even inexperienced customers to find a part with
phrases such as `ik wil een iPhone 13 scherm`.

**How to apply:** Smart Search and full-catalogue search must share one intent
tokenizer. Remove conversational filler only in multiword input, preserve
one-character searches, and interpret exact part words as categories so
`screen` cannot leak into screen protectors. When both are known, explain the
recognized device and part type together.