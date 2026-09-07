---
name: Catalogue thumbnail performance
description: Owner-prioritized loading strategy for product images in catalogue and Smart Search lists.
---

Catalogue and Smart Search list views should request the 320px product variant,
never the 1280px source. A 24-row catalogue page should eagerly preload its
small thumbnails, with higher priority for the first visible rows.

**Why:** speed is a high owner priority, and lazy-loading list thumbnails left
visible blank cells during scrolling. The 320px files average about 5.4 KB, so
preloading a page is inexpensive compared with loading 1280px files.

**How to apply:** convert hashed 1280px media URLs to their 320px sibling in the
shared thumbnail helper; reserve large variants for detail/gallery views. Cache
content-hashed product media as immutable for one year. Keep a clear missing
photo state for products that genuinely have no source image.