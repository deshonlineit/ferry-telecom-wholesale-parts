---
name: Catalogue thumbnail performance
description: Owner-prioritized loading strategy for product images in catalogue and Smart Search lists.
---

Catalogue and Smart Search list views should request the 320px product variant,
never the 1280px source. Eagerly load only the first visible catalogue rows;
lazy-load the remainder and keep higher priority limited to the first two.

**Why:** speed is a high owner priority. Eager-loading all 50 thumbnails caused
network contention in a measured mobile Lighthouse run; loading the first four
eagerly preserves above-fold photos without starting the whole page at once.

**How to apply:** convert hashed 1280px media URLs to their 320px sibling in the
shared thumbnail helper; reserve large variants for detail/gallery views. Cache
content-hashed product media as immutable for one year. Keep a clear missing
photo state for products that genuinely have no source image. Preserve intrinsic
dimensions and asynchronous decoding so deferred thumbnails do not shift rows.