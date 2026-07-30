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

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
