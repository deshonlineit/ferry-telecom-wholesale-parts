---
name: Commercial catalogue hierarchy
description: Defines the default product-type browse order and its interaction with customer pricing and search.
---

Default catalogue browsing follows the exact category order shown in the
left-hand rail: screens, batteries, charging ports, cameras, flex, audio,
adhesive, housing, tools, protection, accessories, then other. Keep products
from the same visible category together across pagination.

Within the screens category, real screens precede misclassified display
protection. Available real screens use the signed-in buyer's assigned price in
ascending order. Guest ordering must not use or expose hidden prices.

**Why:** buyers expect “All parts” results to match the category sequence they
see on the left, rather than appearing mixed. Exact searches and
customer-specific prices must remain trustworthy.

**How to apply:** rank products server-side before pagination using the shared
visible category order, with subtype ordering only inside a category. Preserve
exact-SKU/search relevance and every explicit user-selected sort as higher
authority than the default browse order.