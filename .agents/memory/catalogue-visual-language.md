---
name: Catalogue visual language
description: Owner-confirmed presentation rules for the storefront catalogue and product rows.
---

The catalogue is product-led, not heading-led: omit the breadcrumb and large device/count heading; begin with image-led part-category tiles using real catalogue imagery and a small label beneath.

**Why:** the owner found the old gray database-like screen and wide text pills dated, and supplied a MobileParts category row as the reference for stronger imagery and quieter labels.

**How to apply:** keep the catalogue on a light Ferry-blue-derived surface. Concrete device models stay hidden inside closed family disclosures until a visitor deliberately opens one. Product rows keep their dense structure, but images are larger with a restrained hover scale. Product-title links never underline on hover or keyboard focus; use colour only.

Product-card imagery must align by the visible product contour, not by the raw
source canvas. Normalize embedded white margins so products appear centered and
at a consistent perceived size without distortion or clipping.

**Why:** supplier images use inconsistent canvas sizes and internal whitespace;
plain `object-fit: contain` leaves matching products visibly uneven.

**How to apply:** use contour-aware scaling for image-led card grids while
preserving the complete product silhouette and a deliberate missing-image state.

The top mega menu follows a different rule: start with the 12 newest models for quick scanning, but always provide an in-panel “Show all models” toggle. Expansion must reveal every real model without closing the menu and offer a matching collapse control. For Apple families with recognizable product lines, group the expanded list for scanning: iPad Pro/Air/mini/base iPad, MacBook Pro/Air/base, and Apple Watch Ultra/SE/Series/base. Keep newest-to-oldest ordering inside each group; search remains one ungrouped relevance-ranked list.