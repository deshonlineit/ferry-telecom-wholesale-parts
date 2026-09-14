---
name: Immediate catalogue navigation
description: Keeps primary storefront navigation usable while catalogue metadata loads or refreshes.
---

The top catalogue navigation must never wait behind a skeleton for the full
catalogue-facet response. A cold visit gets immediate real controls; a
returning visit gets the last complete menu from local cache while fresh
metadata replaces it silently. Menu taxonomy also uses a short shared
server-side cache rather than recomputing general filter counts per visitor.

**Why:** The catalogue endpoint is fast when warm but can take about two
seconds during cold database startup. Blocking the entire navigation made the
otherwise-rendered page feel broken.

**How to apply:** keep fallback controls useful without metadata, use a
menu-specific response, cache only public catalogue-menu data, refresh in the
background, and version the server cache filename when its response shape
changes. Test navigation separately from legitimate content loading states.