---
name: AI catalog taxonomy
description: The product categories are AI-assigned; how to re-run and what depends on the slugs
---
The WooCommerce CSV categories were unreliable (screen protectors and chargers inside "Screens & LCDs"), so the catalog is classified by AI, not by the import source.

Brand/model links are also AI-extracted: `scripts/extract-models.mjs` (cache `scripts/extract-models-cache.tsv`) rebuilds brands/device_models (models kept only when ≥3 products) and sets products.brand_id/model_id; the old WooCommerce model data was junk ("NPC06"). Re-run it too after imports. `device_models(brand_id,name)` has a unique index (also in the drizzle schema).

**Rule:** use the shared AI taxonomy, not supplier category labels. A catalog-wide reclassification pass is necessary only for imports that have not already classified their new products.

**Why:** the user explicitly rejected CSV-based sorting and asked for AI-structured categories (Aug 2026). Re-running a cached catalog-wide classification unnecessarily can overwrite later manual category decisions on unrelated products.

**How to apply:**
- Check whether the import path already uses the shared classifier before running a catalog-wide script. Preserve unrelated staff edits rather than treating reclassification as unconditional import cleanup.
- Uses OpenAI integration env vars (`AI_INTEGRATIONS_OPENAI_*`), model gpt-5.6-luna, batches of 40, low concurrency — the proxy rate-limits hard; honor retry-after.
- Category *slugs* are referenced in `artifacts/api-server/src/lib/smart-search.ts` CATEGORY_SYNONYMS — keep in sync when adding/renaming categories. Slug `apple-watch` is displayed as "Smartwatch Parts"; `tempered-glass-protection` as "Screen Protectors".
- New products created via the admin API without a categoryId are auto-classified server-side (`artifacts/api-server/src/lib/classifyProduct.ts`); its taxonomy + prompt duplicate the script's — keep both in sync when changing categories.
- Background `nohup` node jobs die when a ShellExec session ends — run long jobs in foreground chunks with a resumable cache instead.

## One-off category splits
Manual category moves must be shipped as an idempotent script wired into `scripts/post-merge.sh` (ad-hoc SQL alone is rejected — other environments never see it), and the `scripts/reclassify-cache.tsv` entries for moved products must be rewritten to the new slug or a reclassify rerun reverts them. Pattern: `scripts/split-photo-video.mjs`.
