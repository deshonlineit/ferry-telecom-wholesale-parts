---
name: Click-only top navigation
description: The owner's interaction rule for desktop catalogue dropdowns.
---

Desktop catalogue dropdowns open and close only through deliberate clicks. The complete visible label and chevron form one button; never split a brand label into a navigation link plus a tiny separate toggle. Pointer entry and exit must not change their open state; outside click and Escape may close them.

**Why:** Hover activation made large menus appear while merely moving or scrolling across the header. A separate label link and caret also made the first click navigate instead of opening the menu, so the control felt unreliable.

**How to apply:** Keep hover styles visual only. Make the whole label an explicit button, including the cold-start state before menu metadata arrives. Preserve `aria-expanded`, outside-click closing, Escape handling, and the separate mobile toggle.