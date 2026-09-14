---
name: Pricing model — assigned customer groups
description: The store uses assigned customer groups with mandatory explicit per-product prices, not base-price fallbacks or spend tiers
---

Price tiers are assigned customer groups (Big Repairshop = default, Wholesale, Partner), not earned by spend. Every sellable product must have one explicit price for every customer group. Legacy base/list prices may remain for import compatibility, but they are never a customer-price fallback.

Once the replacement shop is ready, it becomes the catalogue and pricing source
of truth. WooCommerce exports are a transition/import source, not a permanent
runtime dependency or bidirectional API integration.

All back-office purchase costs, base prices and customer-group price tables use
canonical EUR amounts. Swiss customers see those selling prices converted to
CHF; CHF presentation does not make the stored price table CHF-denominated.

**Why:** the user's real business has role-based price lists (3 prices per product), imported from their WooCommerce export; a fallback price can silently charge the wrong commercial price. Small Repairshop customers are deliberately excluded (they buy on ferryxpress/Shopify). The owner confirmed the new shop should become the main source when the transition is complete, so a permanent WooCommerce sync would preserve an unnecessary second authority.

**How to apply:** any new price display or checkout path must resolve only the signed-in customer's explicit group price. Never compute from discountPercent or fall back to a list/base price. A product may become visible only after SKU, name, category, brand, and all group prices are present; incomplete imports stay draft. Back-office tables label EUR explicitly and show one column per group. Use controlled one-way imports during migration; after cutover, edit catalogue data only in this shop. `min_annual_spend >= 100000000` is the sentinel for "assigned manually"; never show it as an upgrade threshold or allow auto-upgrade past it. Do not resurrect spend-progress UI.
