---
name: Brand asset rendering rules
description: Preserve the owner's lockup exactly; separate icon-mark rendering rules apply only to browser and home-screen icons.
---

**The supplied horizontal lockup is authoritative.** Keep the owner's blue angular
Ferry mark and lowercase `ferrytelecom` wordmark exactly as provided in the
AI/PDF master; do not redraw it, add a subtitle, or “improve” its geometry. If a
dark surface cannot show it correctly, change that surface.

**Why:** the owner explicitly rejected a generated replacement and asked that
only his own logo be used. Brand ownership takes priority over visual
normalisation.

**How to apply:** compare the horizontal lockup byte-for-byte or visually with
the supplied master before changing brand artwork. Tests should reject
replacement geometry, not require it. The separate browser/home-screen icon may
still use its own masked mark; it is not the horizontal lockup.

**Home-screen icons need an opaque bitmap.** An SVG `apple-touch-icon` is not
reliably supported, and a transparent PNG renders on a black plate. Render the
square mark onto an opaque canvas instead. There is no `rsvg-convert` or Inkscape
in this environment; headless `chromium --screenshot` on a tiny HTML wrapper is
the available rasterizer, and `convert` (ImageMagick) is present as a fallback.

**How to verify without a rendering library:** assert geometry from the SVG source
(each letter stroke must stay inside the diamond, arms attached to the spine), then
sample pixels of the generated PNG through PHP's GD — corner, body, and the middle
of a letter stroke prove the cut-out really is transparent.

**Static-file quirk:** the shop's PHP front controller serves only known asset
extensions. A scratch `.html` under `public/assets/` returns "Not found", so build
throwaway visual comparisons as a single `.svg` instead, and append a cache-busting
query when re-screenshotting it — the preview browser caches assets aggressively.
