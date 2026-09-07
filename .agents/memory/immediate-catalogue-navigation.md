---
name: Immediate catalogue navigation
description: Keeps primary storefront navigation usable while catalogue metadata loads or refreshes.
---

The top catalogue navigation must never wait behind a skeleton for the full
catalogue-facet response. A cold visit gets immediate real destination links;
a returning visit gets the last complete menu from local cache while fresh
metadata replaces it silently.

**Why:** The catalogue endpoint is fast when warm but can take about two
seconds during cold database startup. Blocking the entire navigation made the
otherwise-rendered page feel broken.

**How to apply:** keep fallback links useful without metadata, cache only
public catalogue-menu data, refresh in the background, and test navigation
skeletons separately from legitimate product/content loading placeholders.