---
name: Mega-menu page scrolling
description: Navigation menus use normal document scrolling rather than fixed-height internal scroll areas.
---

Catalogue mega menus must expand to their content height and must not own vertical scrolling. A downward wheel or touch gesture may reveal the complete model list, but the same gesture must remain passive so the document scrolls immediately.

**Why:** A fixed-height menu with its own scrollbar traps normal page browsing and makes the model list appear to change without the page moving.

**How to apply:** Keep dropdown and model containers free of viewport-capped heights and `overflow-y: auto`. Horizontal family-tab scrolling may remain where needed.

On desktop, a sticky site header must stop being sticky while its long mega menu
is open. The menu heading and close control may remain sticky within the menu.

**Why:** An overflow-visible dropdown attached to a sticky header can appear to
scroll while its lower rows remain permanently below a short desktop viewport.

**How to apply:** Let the open header and dropdown move with document scrolling,
then restore normal header stickiness when the menu closes. Verify this on a
short desktop viewport, not only a wide or tall monitor.