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
- Improve category structure and device compatibility together. Support both category → brand/model → product and brand/model → part type → product; do not rely on imported category labels as evidence of compatibility.
- Competitor research informs design and navigation improvements, not wholesale copying or unverified claims about competitors' private account and checkout behavior. Initial public references: https://www.mobileparts.shop/nl (separate assortment/service navigation), https://foneday.shop/catalog (device/category/quality filters), https://gsmnetshop.nl/ (brand → model selector).
- Requested rebuild target: core PHP backend, MySQL, and a headless HTML/CSS/vanilla-JavaScript frontend; no CMS, Laravel, third-party application frameworks, Composer/npm libraries, or external fonts. Treat standard PHP extensions as a proposed prerequisite to confirm in the hosting audit. This is a planning decision, not authorization to replace the current runtime/database immediately.
- Uploaded product images must be automatically converted to compressed WebP, with responsive sizes and legibility checks. Preserve the existing Picqer inventory integration's business behavior after inspecting its actual configuration and ownership rules.
- Detailed scope and acceptance gates: `docs/rebuild-plan.md`; authenticated read-only source findings: `docs/wordpress-audit.md`. Active configuration, database mapping and safe functional walkthroughs are still required; source presence is not proof of live behavior.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
