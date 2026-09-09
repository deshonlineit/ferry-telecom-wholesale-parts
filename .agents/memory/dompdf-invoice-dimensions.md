---
name: Dompdf invoice dimensions
description: Prevent blank pages and clipped Swiss QR fields in fixed-size invoice PDFs.
---

Treat CSS `height` in dompdf as content height even when global `box-sizing: border-box` is declared. Fixed A4 and Swiss QR child blocks must subtract their vertical padding from the declared height.

**Why:** Using the full physical height plus padding produced a blank intermediate A4 page and pushed the receipt currency and amount below the printable Swiss QR area.

**How to apply:** For any fixed physical block, set content height to target height minus top and bottom padding, then verify the page count, rasterized bottom edge, extracted text, and embedded fonts.