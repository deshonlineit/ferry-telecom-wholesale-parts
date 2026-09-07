---
name: Catalogue filter transitions
description: Defines the storefront interaction model for fast, stable catalogue refinements.
---

Catalogue-to-catalogue refinements must preserve the settled shell and rows
while the replacement result loads. Show restrained progress without collapsing
the table, and temporarily prevent interaction with stale product rows while
leaving filter controls available.

**Why:** replacing the whole route with a spinner made fast API responses feel
slow, caused layout jumps, discarded focus, and wasted earlier requests during
rapid filter changes.

**How to apply:** abort superseded requests, commit only the latest navigation,
cache/deduplicate facet metadata, update results atomically, and retain the
previous result with a local error message if refreshing fails. Only a true
first load should use a layout-shaped skeleton. That skeleton must name the
destination being loaded and resemble the real sidebar, toolbar, thumbnails,
product text, stock, price, and order controls; broad anonymous grey blocks
look like a broken page even when the request is healthy.