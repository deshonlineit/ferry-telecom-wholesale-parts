---
name: Catalog compatibility evidence
description: Why offline model tags must not automatically be treated as confirmed product compatibility.
---

Treat imported model tags as evidence requiring validation, not authoritative compatibility.

**Why:** inspection of the supplied wholesale export found some Samsung rows carrying unrelated bulk Apple model tag sets. Blindly preserving every tag would introduce false compatibility even though the many-to-many implementation is technically correct.

**How to apply:** compare source model/manufacturer evidence, keep every supported compatible model regardless of frequency, and quarantine ambiguous or contradictory assignments. Do not infer a primary model, discard low-frequency models, or claim technical verification from category/tag parsing alone.

Keep source-taxonomy and title-inferred compatibility as separate, durable provenance.

**Why:** an additive title repair can safely fill missing links, but without provenance a later title or brand correction cannot distinguish a stale inference from a trusted source link. Re-running a backfill on every startup also silently promotes inferred links into trusted links.

**How to apply:** backfill pre-existing links exactly once, record each subsequent evidence source independently, recompute inferred links on every reconciliation, and remove a stale link only when no other evidence remains.

Do not infer compatibility to a generic model-family label when specific generations exist.

**Why:** shorthand such as “iPhone 8 / SE 2020 / SE 2022” can otherwise leak current-generation parts into the broad first-generation “iPhone SE” filter.

**How to apply:** suppress non-numeric prefix models such as a generic SE/Air family whenever more specific child models exist; preserve independently sourced generic links.

Keep “housing with pre-installed parts” separate from “complete housing”.

**Why:** Supplier titles explicitly describe pre-installed small components without establishing that every required component is included. Calling those products complete would turn a navigation aid into an unsupported contents guarantee.

**How to apply:** Use the precise source-supported parts label; reserve “complete” for explicit evidence. Do not promote generic housing or display assemblies into complete phone housings just to populate a filter.

Category-first model refinement must not silently add the device manufacturer's product-brand filter.

**Why:** Contextual catalog checks found compatible Universal-branded products alongside manufacturer-branded products. Adding a brand inferred from the selected device can hide valid matches and make the displayed model count disagree with the resulting product count.

**How to apply:** Refine the existing category/search with the model itself. Preserve an explicitly selected brand and the part search; change brand only through an explicit brand choice.