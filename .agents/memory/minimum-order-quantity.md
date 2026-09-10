---
name: Minimum order quantity versus stock
description: How a per-product minimum interacts with available stock on bulk ordering.
---

A product's minimum order quantity is a commercial rule, not a stock rule. When
available stock is lower than the minimum, the line must be refused and shown as
below-minimum — never quietly reduced to the stock level.

**Why:** clamping the quantity down to stock silently produced order lines that
break the very rule the minimum exists to enforce, and the customer only found
out after the order was placed.

**How to apply:** bulk-ordering paths that resolve quantities (paste lists,
reorder, saved lists) need three distinct outcomes, each visible per line:
raised to the minimum, reduced to available stock, and refused because stock
cannot satisfy the minimum. Cover the third case in tests; it is the one that
disappears when the other two are implemented first.
