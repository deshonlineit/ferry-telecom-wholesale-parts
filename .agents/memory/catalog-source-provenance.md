---
name: Catalog compatibility evidence
description: Why offline model tags must not automatically be treated as confirmed product compatibility.
---

Treat imported model tags as evidence requiring validation, not authoritative compatibility.

**Why:** inspection of the supplied wholesale export found some Samsung rows carrying unrelated bulk Apple model tag sets. Blindly preserving every tag would introduce false compatibility even though the many-to-many implementation is technically correct.

**How to apply:** compare source model/manufacturer evidence, keep every supported compatible model regardless of frequency, and quarantine ambiguous or contradictory assignments. Do not infer a primary model, discard low-frequency models, or claim technical verification from category/tag parsing alone.