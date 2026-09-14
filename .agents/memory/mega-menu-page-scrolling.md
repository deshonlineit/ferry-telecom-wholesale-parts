---
name: Mega-menu page scrolling
description: Navigation menus use normal document scrolling rather than fixed-height internal scroll areas.
---

Catalogue mega menus must expand to their content height and must not own vertical scrolling. A downward wheel or touch gesture may reveal the complete model list, but the same gesture must remain passive so the document scrolls immediately.

**Why:** A fixed-height menu with its own scrollbar traps normal page browsing and makes the model list appear to change without the page moving.

**How to apply:** Keep dropdown and model containers free of viewport-capped heights and `overflow-y: auto`. Horizontal family-tab scrolling may remain where needed.