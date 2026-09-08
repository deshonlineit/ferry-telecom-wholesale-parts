---
name: Mobile zoom viewport
description: Why zoom-safe mobile headers must account for both layout and Visual Viewport widths.
---

Browser or page scaling can reduce the visible viewport without changing `innerWidth`, so a narrow CSS media query alone is not sufficient for zoom-safe header reflow.

**Why:** At 200% CDP page scale, the Visual Viewport measured half the layout width while the narrow media query did not activate, leaving controls outside the visible area.

**How to apply:** For zoom-critical header work, verify both classic reflow at the effective CSS width and scaling where `visualViewport.width` shrinks while the layout viewport remains unchanged.