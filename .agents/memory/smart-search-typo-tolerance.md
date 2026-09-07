---
name: Smart-search typo tolerance
description: Safety boundary for forgiving misspellings without making product identity fuzzy.
---

Smart Search should correct clear, uniquely resolvable spelling mistakes in
brands, device words, part types, colours, and catalogue terminology.

**Why:** buyers commonly omit a brand or type queries such as “14 scren” and
“samsng s22 batery”. A hard AND search made these valid intents look like empty
catalogue searches.

**How to apply:** perform correction in the shared server-side tokenizer so
every search surface behaves identically. Keep it bounded to a known catalogue
vocabulary and accept only a unique close match. Never alter standalone model
numbers, alphanumeric SKU-like tokens, or ambiguous words. Exact SKU and strict
numeric-boundary behavior always take priority.