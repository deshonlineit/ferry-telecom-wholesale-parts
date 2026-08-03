---
name: AI catalog taxonomy
description: The product categories are AI-assigned; how to re-run and what depends on the slugs
---
The WooCommerce CSV categories were unreliable (screen protectors and chargers inside "Screens & LCDs"), so the catalog is classified by AI, not by the import source.

Brand/model links are also AI-extracted: `scripts/extract-models.mjs` (cache `scripts/extract-models-cache.tsv`) rebuilds brands/device_models (models kept only when ≥3 products) and sets products.brand_id/model_id; the old WooCommerce model data was junk ("NPC06"). Re-run it too after imports. `device_models(brand_id,name)` has a unique index (also in the drizzle schema).

**Rule:** category assignments come from `scripts/reclassify-products.mjs` (taxonomy + prompt live in the script; results cached in `scripts/reclassify-cache.tsv` so runs are resumable; change log in `scripts/reclassify-report.tsv`). After any new product import, re-run it (delete cache lines only if you want re-classification).

**Why:** the user explicitly rejected CSV-based sorting and asked for AI-structured categories (Aug 2026).

**How to apply:**
- Uses Replit OpenAI integration env vars (`AI_INTEGRATIONS_OPENAI_*`), model gpt-5.6-luna, batches of 40, low concurrency — the proxy rate-limits hard; honor retry-after.
- Category *slugs* are referenced in `artifacts/api-server/src/lib/smart-search.ts` CATEGORY_SYNONYMS — keep in sync when adding/renaming categories. Slug `apple-watch` is displayed as "Smartwatch Parts"; `tempered-glass-protection` as "Screen Protectors".
- Background `nohup` node jobs die when a ShellExec session ends — run long jobs in foreground chunks with a resumable cache instead.
