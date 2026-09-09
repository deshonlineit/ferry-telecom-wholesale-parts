---
name: Pricing model — assigned customer groups
description: The store uses assigned customer groups with explicit per-product prices, not spend-based discount tiers
---

Price tiers are assigned customer groups (Big Repairshop = default, Wholesale, Partner), not earned by spend. Explicit per-product prices live in `product_tier_prices`; `resolvePrice()` falls back to `listPrice * (1 - discount%)` only when no explicit row exists. `list_price` = the Big Repairshop price from the user's WooCommerce export.

All back-office purchase costs, base prices and customer-group price tables use
canonical EUR amounts. Swiss customers see those selling prices converted to
CHF; CHF presentation does not make the stored price table CHF-denominated.

**Why:** the user's real business has role-based price lists (3 prices per product), imported from their WooCommerce export; Small Repairshop customers deliberately excluded (they buy on ferryxpress/Shopify).

**How to apply:** any new price display or checkout path must go through `getExplicitTierPrices`/`resolvePrice` — never compute prices from discountPercent alone. Back-office tables label EUR explicitly and order selling prices as EUR Price, Partner Price, Wholesale Price, then Big Repair Shop Price. `min_annual_spend >= 100000000` is the sentinel for "assigned manually"; never show it as an upgrade threshold or allow auto-upgrade past it. Do not resurrect spend-progress UI. Re-import: `node scripts/import-products.mjs <csv>`.
