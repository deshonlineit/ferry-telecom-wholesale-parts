# Native EUR pricing and country currency contract

Scope: isolated PHP/MySQL shop only. No live hosting, stock-provider, mail, payment or DNS actions. The owner selected automatic latest ECB EUR/CHF reference rates on 2026-09-06. CH delivery country uses CHF; every other supported delivery country uses EUR. Administration and purchase costs use EUR. Customer groups remain explicitly assigned.

## Storage and migration

- Retain original `products.list_price_cents` and `group_prices.price_cents` as legacy CHF source values. Never relabel those values, and never migrate historical order/return amounts.
- Add nullable `products.purchase_price_eur_cents`, nullable `products.list_price_eur_cents`, and `products.pricing_version` (integer, default 0).
- Add nullable `group_prices.price_eur_cents`. An absent group row means inheritance from the base EUR selling price.
- `exchange_rates`: `base_currency`, `quote_currency` (composite primary key), `rate_ppm` (integer CHF per EUR times 1,000,000), `rate_date` (DATE), `fetched_at` (UTC DATETIME), `source_url`.
- New orders additionally snapshot nullable `exchange_rate_ppm`, `exchange_rate_date`, and `base_currency`; new order items snapshot nullable `price_eur_cents`. Existing snapshots remain untouched.
- Once a valid ECB quote is stored, initialize only missing EUR selling/group prices by converting legacy CHF cents to EUR, half-up to a cent. Preserve the CHF source columns and record the initialization rate/date in settings/audit. Never invent purchase costs.
- Shipping/free-shipping configuration must have explicit EUR values; preserve old CHF settings and initialize EUR values using the same recorded migration rate. Tax rules/percentages are not changed by this work.
- All money uses integer cents. Conversion uses integer ppm and half-up cent rounding. Never round individual line subtotals differently from displayed rounded unit price times quantity.

## Shared PHP helpers (currency engine owns)

- `currencyExchangeRate(): ?array`: quote metadata, including `source: ECB`, `rate_ppm`, decimal `rate`, `rate_date`, `fetched_at`, `status` (`fresh`, `stale`, `unavailable`).
- `currencyCountry(string): string`: map delivery country to currency; CH -> CHF, others -> EUR.
- `currencyContext(?string $country = null): array`: `country`, `currency`, `base_currency: EUR`, `exchange_rate`, `pricing_ready`. Default explicit session choice, then owned default address, then CH; staff's administrative prices remain explicitly EUR.
- `currencyConvert(int $cents, string $from, string $to, ?array $rate = null): int`: EUR/CHF only; reject unavailable/unusable quotes when conversion is required.
- `currencyInitializeEurPrices(): array`: idempotent additive conversion after first valid stored quote; original money columns/order snapshots remain intact.
- Public product normalization strips purchase costs, base/group tariffs and legacy source columns from nonstaff responses. Guest `price_cents` stays null.
- Country selected in the actual checkout delivery address is authoritative, never a posted currency, group, exchange rate or amount.
- Existing historical money always formats with its stored currency, not the current browsing currency. Credit notes inherit their original order's currency. Legacy buyback amounts remain explicitly CHF unless a separate stored currency exists; never relabel them.

## Rates

- Official source: `https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml`.
- A separate CLI synchronizer fetches only this allowlisted HTTPS endpoint with normal certificate verification, no credentials, no redirects, bounded response/time, safe XML parsing and validated date/positive decimal CHF rate. The web PHP runtime stays egress-disabled.
- Synchronizer runs on native workflow startup, then hourly while running. A lock prevents duplicate imports; never overwrite a newer quote with an older one.
- Weekends use the last published quote. Older than seven calendar days is unusable for new conversions/CHF checkout; show an explicit unavailable/stale message, never manufacture a rate. A fetch failure preserves the previous quote and logs a safe error. EUR canonical pricing remains usable without conversion.
- GET `/api/currency` returns current context, no credentials or costs.
- POST `/api/currency` with `{country}` updates only the authenticated/guest session's display country and returns context. Existing CSRF protection applies.

## Shopping contracts (currency engine and buyer UI)

- Session, products, cart and quotes expose `currency` and relevant country/rate metadata. `Core.formatMoney(cents, currency = Core.currency)` supports explicit historical/admin currencies.
- GET `/api/cart` uses current context.
- POST `/api/checkout/quote` accepts `{address_id}` or `{address}` using the existing owned-address rules. Returns the cart shape plus `quote_token`; selected delivery country determines all prices, shipping, tax and total.
- Checkout posts the same address plus `quote_token` with its existing payment/notes/idempotency fields. Reprice and validate the quote under the existing stock transaction before order creation. A changed price, quantity, country or rate yields 409 and requires a new displayed quote; never silently charge changed totals.
- Country controls must be present in saved-address and checkout address forms and in a compact storefront delivery-country selector. Changing country refreshes visible amounts, not just currency labels.

## Staff pricing API (admin backend owns)

- GET `/api/admin/prices`: filters compatible with current product list (`q`, `category`, `brand`, `quality`, `stock`, `status`, `sort`, `page`, `limit`), maximum 500/page. Returns `{products, groups, total, page, pages, currency: "EUR", exchange_rate}`.
- Each product includes `id`, `sku`, `name`, `purchase_price_eur_cents`, `list_price_eur_cents`, `pricing_version`, `group_prices: [{group_id, price_eur_cents}]`, plus useful existing metadata.
- POST `/api/admin/prices/resolve` with `{skus: string[]}` (max 1000) returns the same products/groups metadata plus `unknown_skus`; read-only lookup for pasted Excel rows.
- POST `/api/admin/prices/bulk` with `{rows: [{id, version, purchase_price_eur_cents?, list_price_eur_cents?, group_prices?: [{group_id, price_eur_cents}]}]}`; max 1000 rows. Missing fields unchanged; cost null clears unknown cost; group null removes override; selling price cannot be null. Zero is valid, negatives/noninteger cents invalid.
- Validate all rows, IDs, group IDs, duplicates and versions before applying one atomic transaction. Lock products in ID order, reject conflicts with 409 and actionable error, increment pricing versions and audit before/after. No partial writes and no unrelated product fields changed.
- Whole-filter adjustments: POST `/api/admin/prices/adjust/preview` accepts `{filters, field, operation, value}`. `field` is `list_price_eur_cents`, `purchase_price_eur_cents` or `group:<id>`; `operation` is `set`, `add` (value in cents) or `percent` (value in basis points, e.g. 500 = +5%). Require explicit values for missing costs; never manufacture them.
- Preview returns `{count, samples, token, expires_at}`. POST `/api/admin/prices/adjust/apply` accepts `{token}`. Store preview/session-bound selection and versions; expire after five minutes, max 10,000 products. Recheck every version atomically before apply, then consume token and audit.
- Existing product create/edit/detail and quick-edit/import flows must use the same EUR fields and increment versions for price changes. Group edits cannot bypass version checks. Existing source CHF columns must not be rewritten as EUR.
- Admin settings use explicit EUR shipping values. Dashboard/invoice totals must be grouped by stored currency rather than adding CHF and EUR together.

## UI ownership and coverage

- Admin UI: dedicated `/admin/prices`, compact editable price grid, keyboard input, page drafts, selected-row bulk changes, Excel paste preview, whole-filter adjustment preview, one save action, conflicts/errors and dirty-navigation warning. Clearly label all administrative inputs EUR and purchase cost as unknown when empty; retain group inheritance.
- Product list links prominently to prices. Product edit adds EUR purchase/base/group fields. Existing admin order/invoice/return displays use the record's currency, and mixed-currency statistics remain separated.
- Buyer UI: country selector + saved/checkout country input, live country/quote recalculation, explicit quote acceptance on changed prices, all customer history/PDF links and totals using stored currencies. Keep guests masked.
- Main integration owns script/CSS registration in `public/index.php`, rate synchronizer/startup, documentation and final verification.

## Verification

Test EUR/CHF conversion and rounding, all non-CH country routing, group override/inheritance, cost confidentiality, legacy preservation, stale/missing rate handling, quote/checkout drift rejection, historical invoice/credit currency, bulk rollback/conflicts/invalid rows, Excel comma decimals and empty cells, and authenticated browser pricing/edit-to-customer consistency. Use isolated synthetic fixtures and clean up; never submit real orders.