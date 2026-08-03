---
name: Taxonomy sync & deterministic category moves
description: How to add a category and ship DB category moves to production
---
The product taxonomy lives in TWO places that must stay identical: the reclassify script's TAXONOMY and the API server's classifyProduct taxonomy (used for auto-categorizing new admin products). They have drifted before.

**Why:** if a category exists only in one, new products can never be classified into it, or the reclassifier rejects it.

**How to apply:** when adding/renaming a category, update both taxonomies, add CATEGORY_SYNONYMS in smart-search, AND ship the DB change via a deterministic, idempotent `scripts/split-*.mjs` script invoked from `scripts/post-merge.sh` (dev-DB edits alone don't reach production). Split scripts must also rewrite `scripts/reclassify-cache.tsv` so reclassify reruns don't revert the moves.
