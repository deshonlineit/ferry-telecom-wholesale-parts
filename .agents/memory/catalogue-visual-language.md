---
name: Catalogue visual language
description: Owner-confirmed presentation rules for the storefront catalogue and product rows.
---

The catalogue is product-led, not heading-led: omit the breadcrumb and large device/count heading; begin with image-led part-category tiles using real catalogue imagery and a small label beneath.

**Why:** the owner found the old gray database-like screen and wide text pills dated, and supplied a MobileParts category row as the reference for stronger imagery and quieter labels.

**How to apply:** keep the catalogue on a light Ferry-blue-derived surface. Concrete device models stay hidden inside closed family disclosures until a visitor deliberately opens one. Product rows keep their dense structure, but images are larger with a restrained hover scale. Product-title links never underline on hover or keyboard focus; use colour only.

Show only one Smart Search input per page. The homepage uses its hero search,
the catalogue keeps its larger search panel hidden until the compact header
Search button is deliberately clicked, and other storefront pages use the
header search. Ordinary catalogue navigation, filtering, pagination, history
restoration, and submitted searches must render the panel closed again. The
catalogue device picker is one closed “Choose a device” row until the visitor
deliberately opens it.

**Why:** the owner found a header search plus a second page search visually
duplicated, and the always-visible catalogue search panel looked as though
unrelated clicks had opened it. An always-visible list of device families also
slowed scanning.

**How to apply:** every search surface must use the same conversational intent
and live-product result behavior; do not fall back to a simpler keyword-only
header search. Give the opened catalogue Smart Search a restrained thin
blue-purple-pink-warm spectral edge and soft shadow so it is recognizable as a
smart tool without becoming loud.

The storefront logo stays deliberately prominent rather than shrinking to a
small utility mark. On mobile and tablet, the header has a strict hierarchy:
logo and compact account actions share the first row, Search spans the second
row, and the Catalogue menu follows as its own navigation row.

**Why:** the owner found the previous narrow header visually illogical: a small
logo, wrapped account actions, and a floating Search pill created excess empty
space with no clear reading order.

**How to apply:** preserve a roughly 40–42px-high logo on narrow screens and a
46px-high logo on desktop. At the narrowest width, retain an accessible
icon-only sign-in action so the customer CTA remains readable without colliding
with the brand.

Product-card imagery must align by the visible product contour, not by the raw
source canvas. Normalize embedded white margins so products appear centered and
at a consistent perceived size without distortion or clipping.

**Why:** supplier images use inconsistent canvas sizes and internal whitespace;
plain `object-fit: contain` leaves matching products visibly uneven.

**How to apply:** use contour-aware scaling for image-led card grids while
preserving the complete product silhouette and a deliberate missing-image state.

The top mega menu follows a different rule: start with the 12 newest models for quick scanning, but always provide an in-panel “Show all models” toggle. Expansion must reveal every real model without closing the menu and offer a matching collapse control. For Apple families with recognizable product lines, group the expanded list for scanning: iPad Pro/Air/mini/base iPad, MacBook Pro/Air/base, and Apple Watch Ultra/SE/Series/base. Keep newest-to-oldest ordering inside each group; search remains one ungrouped relevance-ranked list.