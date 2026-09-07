---
name: Search minimum length
description: Why the storefront search accepts a single character, and what to bound instead if it ever needs throttling.
---

The storefront search has no character minimum. Any non-empty term is searched, in the suggestion dropdown as well as in the product search endpoint. Only an empty box, or a term that contains no letters or digits at all, is refused.

**Why:** the owner asked for the three-character gate to go — buyers type short SKU fragments and bare model numbers, and being told to type more is friction on the one screen that has to feel instant. A single-character term across the whole catalogue stayed far below a fifth of a second, because the result set is bounded by the row limit plus a has_more probe rather than by a COUNT.

**How to apply:** if search ever gets expensive again, bound it with the row limit, the client debounce, the abort of superseded requests, or an index — never by refusing short terms. When you change the gate, three places move together: the search endpoint, the suggestion route and the client-side input handler, plus the hint line under the search field.
