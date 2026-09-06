# Ferry Telecom Wholesale Parts

B2B wholesale parts store for mobile repair shops: real catalog imported from the ferrytelecom.com WooCommerce export (~7,850 products with brand/model/category/quality/stock/images), assigned customer groups (Big Repairshop = default, Wholesale, Partner) with explicit per-product prices in `product_tier_prices` (fallback: listPrice minus group discount %), smart natural-language part search, cart, and one-step checkout. Customers do NOT auto-upgrade groups by spend — Ferry Telecom assigns them (sentinel `min_annual_spend = 999999999` marks manually assigned groups). Small Repairshop customers are intentionally excluded (they buy on ferryxpress/Shopify). Re-import script: `scripts/import-products.mjs <csv>`.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- DB schema: `lib/db/src/schema/` (catalog, customers, orders)
- API contract: `lib/api-spec/openapi.yaml` (source of truth; run codegen after edits)
- API routes: `artifacts/api-server/src/routes/` — `admin.ts` holds all `/admin/*` back-office endpoints
- Storefront + admin UI: `artifacts/parts-store/src/pages/` (admin pages under `pages/admin/`, shell in `components/admin/AdminLayout.tsx`)

## Architecture decisions

_Populate as you build — non-obvious choices a reader couldn't infer from the code (3-5 bullets)._

## Product

_Describe the high-level user-facing capabilities of this app once they exist._

## Existing-site research and rebuild scope

- The live store at ferrytelecom.com remains untouched. This project is a separate build, not an instruction to publish, replace the live site, or change its domain/DNS.
- Inventory the existing store's customer journeys, staff workflows, business rules, and integrations before further migration work. Compare these with the new app; do not assume a visual copy or product CSV captures the complete behavior.
- Rebuild all existing business capabilities first, rather than reducing the store to an MVP. Preserve behavior, not necessarily the original plugins or implementation. Only later, with the owner's agreement, disable unnecessary functions reversibly instead of deleting them or their data.
- Initial investigation is read-only. Prefer a sanitized backup and an isolated staging copy for deeper inspection and test transactions.
- Redesign the full customer experience to be substantially more attractive while retaining Ferry Telecom's identity and fast B2B ordering. A homepage-only facelift is insufficient: catalog, product details, cart, checkout, and account flows are included.
- Keep the prominent “Wat zoekt u?” search experience. The owner liked that entry point but rejected the category/filter/sorting presentation as too cluttered and hard to navigate; prioritize a substantially clearer discovery experience, not a cosmetic restyle.
- The owner wants an Apple.com-like storefront while retaining Ferry Telecom branding. Preserve the direct live model search, which the owner explicitly likes. Alongside it, category browsing must offer device families (iPhone, iPad, Samsung, etc.), then ALL corresponding models newest to oldest; autocomplete limits must not truncate this browse list. Device families are not product-manufacturer filters.
- The oversized retail interpretation was explicitly rejected: keep native discovery compact and scannable on an ordinary laptop, with normal headings, small category/family/model controls and little wasted space. Show models in a single flat newest-to-oldest list, without visible year headings or year sections; retain exact model names and every matching model.
- The owner explicitly permits departing from the existing Ferry website's visual design. Research other specialist suppliers and optimize for fewer steps to the right part rather than copying the old storefront.
- Improve category structure and device compatibility together. Support both category → brand/model → product and brand/model → part type → product; do not rely on imported category labels as evidence of compatibility.
- Competitor research informs design and navigation improvements, not wholesale copying or unverified claims about competitors' private account and checkout behavior. Initial public references: https://www.mobileparts.shop/nl (separate assortment/service navigation), https://foneday.shop/catalog (device/category/quality filters), https://gsmnetshop.nl/ (brand → model selector).
- Requested rebuild target: core PHP backend, MySQL, and a headless HTML/CSS/vanilla-JavaScript frontend; no CMS, Laravel, third-party application frameworks, Composer/npm libraries, or external fonts. Standard PHP extensions are permitted for the native build. The separate native version is authorized; replacement of the existing prototype database or live site is not.
- Uploaded product images must be automatically converted to compressed WebP, with responsive sizes and legibility checks. Preserve the existing Picqer inventory integration's business behavior after inspecting its actual configuration and ownership rules.
- Load the complete source-backed catalog imagery, not just featured items or a small sample, before judging the storefront design. Match photos by the existing product SKU; do not replace missing real product photos with generated or unrelated parts.
- Detailed scope and acceptance gates: `docs/rebuild-plan.md`; authenticated read-only source findings: `docs/wordpress-audit.md`. Active configuration, database mapping and safe functional walkthroughs are still required; source presence is not proof of live behavior.
- Native implementation lives in `artifacts/parts-store/native/` and is served at `/test-shop/`; the original prototype remains separate. See `docs/native-test-status.md` for functional coverage and remaining parity gates.
- Current B2B storefront direction (2026-09-06): compact product tables with same-row information, quantity and direct add-to-cart, without blocking success dialogs. Primary live search suggests actual products from three characters, including quick-add controls. Keep integrated, visible brand/department navigation on desktop and an Assortiment toggle on mobile, with complete chronological family/model lists. The isolated blue button and narrow desktop drill-down were explicitly rejected; evaluate the open menu and the surrounding catalog density together. Reviews remain explicitly unavailable until verified data is imported; never invent ratings.
- The development root opens `/test-shop/` directly so a copied hostname does not lead to the old shop. The original React homepage remains at `/?prototype=1`, with its other routes unchanged. This redirect is development-only; do not change live routing.
- The owner permits using data for isolated testing, never changes to real stock. The native app uses the offline catalog with fictional customers and synthetic group prices. **Why:** public customer demos must not expose confidential live customer tariffs.
- Purchase costs and selling/group prices are administered in EUR. Delivery country CH uses CHF; other delivery countries use EUR. Staff enter normal decimal amounts, never raw cents. On 2026-09-06 the owner explicitly chose automatic ECB reference rates; the previously unknown live-shop conversion is not being claimed as verified or copied.
- The native workflow retrieves the official ECB reference at startup and hourly through an isolated, read-only CLI process; web PHP remains egress-disabled. Convert with integer ppm, half-up to cents; disclose the publication date and reject conversions using quotes older than seven days. Preserve original CHF source columns and immutable historical order/document money. See `docs/native-currency-contract.md` for pricing, bulk-edit and quote contracts.
- Never enable public staff impersonation, outbound mail, payment execution, inventory writes or provider credentials in the native test service. It uses a socket-only local MySQL database and an explicitly stripped/egress-disabled PHP runtime.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
