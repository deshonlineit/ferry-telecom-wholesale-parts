---
name: Device scope navigation
description: How compatibility scope (device brand / family / model) must behave in catalog URLs and facets, and why an escape-hatch facet must ignore that scope.
---

Compatibility scope is one single axis with three widths: device brand > device family > concrete model.

**Rule 1 — selecting a narrower scope clears every wider one.** Every link builder that sets a family or a model must also clear the device-brand parameter (and a family that no longer matches). Do this in each builder, not only in the menu: the mega-menu, the on-page family/model picker and the quick finder all produce these links, and a single builder that forgets it lets two scopes AND together into a contradictory, near-empty result set (e.g. "parts for an Apple device AND for a Galaxy S22").

**Why:** the SQL predicates are independent EXISTS clauses, so stacking them silently intersects instead of replacing. A user reaching a foreign model through the cross-family fallback then lands on a page with zero results and no explanation.

**Rule 2 — a facet used as an escape hatch must exclude the whole scope axis, not just its own key.** The model facet exists so a visitor can jump to a device outside the current one; if it is computed with the device-brand filter still applied, every model of another brand reports zero and the fallback list is permanently empty. Facets meant to stay scoped (the device-family chips shown as "which device do you have") keep the device brand on purpose.

**How to apply:** when adding any new compatibility filter, walk all link builders that change the device scope and add the new key to the clear-list, and check every facet's exclude-list to decide whether that facet is a within-scope refinement or an escape hatch.

**Rule 3 — global navigation picks a destination, contextual pickers refine the page.** A pick in the top menu must start a fresh scope: besides the wider device keys it also drops the part axis (category, part) and the facets (quality, stock, featured), keeping only presentation keys (sort, page size). The on-page family/model chips and the finder next to the heading do the opposite: they keep the part context on purpose, and only normalise the device axis.

**Why:** the owner reported picking a brand and then a model from the top menu and landing on the part type he had browsed earlier, with zero results. Carrying a filter across a destination pick reads as a broken menu, while dropping it inside a contextual picker would throw away the refinement the visitor just made.

**How to apply:** keep the reset list in the menu's own URL builder (one place, applied before the pick's own parameters are set, so a department link can still set its category), and encode the split in the QA scripts: menu links assert the filters are gone, contextual pickers assert they survive.

**Related trap:** a part-manufacturer filter is a different axis. Deriving it from the chosen device (setting manufacturer = the device's maker) looks harmless while every imported part happens to be branded like the device it fits, and starts hiding third-party parts the moment that stops being true.
