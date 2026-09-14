---
name: Click-only top navigation
description: The owner's interaction rule for desktop catalogue dropdowns.
---

Desktop catalogue dropdowns open and close only through deliberate clicks. Pointer entry and exit must not change their open state; outside click and Escape may close them.

**Why:** Hover activation made large menus appear while merely moving or scrolling across the header, and accidental closing made them unreliable to use.

**How to apply:** Keep hover styles visual only. Bind dropdown state to the explicit trigger, preserve `aria-expanded`, outside-click closing, Escape handling, and the separate mobile toggle.