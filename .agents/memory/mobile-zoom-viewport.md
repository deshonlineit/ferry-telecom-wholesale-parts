---
name: Mobile zoom viewport
description: Why zoom-safe mobile headers must account for both layout and Visual Viewport widths.
---

Browser zoom and page/pinch scaling are separate regression paths. Real browser zoom reduces the effective CSS layout width, raises `devicePixelRatio`, and leaves `visualViewport.scale` at 1; page scaling reduces only the Visual Viewport and raises its scale.

**Why:** CDP page-scale emulation can pass a 200% geometry check while never exercising browser-zoom media-query reflow. In Chromium, browser UI zoom must be driven separately and identified by its layout and pixel-ratio metrics.

**How to apply:** Verify browser zoom with `visualViewport.scale === 1`, a reduced layout width, and increased pixel ratio. Test page/pinch scaling independently where the Visual Viewport shrinks without layout reflow.