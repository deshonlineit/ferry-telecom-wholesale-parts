---
name: Keyboard commit paths in suggestion lists
description: Why Enter in a combobox must navigate itself instead of dispatching a synthetic click, and how to fix an unreproducible "Enter does nothing" report.
---

A keyboard commit (Enter on a highlighted suggestion) must perform the navigation
itself. Dispatching a synthetic click on the anchor is not equivalent to a mouse
click.

**Why:** in this storefront a mouse click only works because a document-level
listener intercepts anchor clicks and hands the URL to the router. A synthetic
click therefore depends on that event surviving every intermediate handler and on
the anchor still being attached. Mouse and keyboard then fail in different
environments, which is exactly the report that cannot be reproduced in a headless
browser while the user sees it in theirs.

**How to apply:** on Enter, resolve the chosen option, record it in whatever
"recent" store the mouse path uses, close the popover and call the router with the
anchor's own href (with a plain location assignment as fallback). Do the same in
any dialog variant and close that dialog first.

Enter must also cover the states where the old handler silently did nothing:
the option list is still loading (await the shared load instead of returning), and
the popover was closed by a blur (reopen, then commit). Guard the whole commit with
a flag so a repeated Enter during the same wait cannot navigate twice, and read the
highlighted index *after* the await, never from a snapshot taken before it.

**When a bug report will not reproduce:** do not keep hunting for the browser
difference. Enumerate every branch in which the handler can return without acting,
and remove them; then unit-test those branches with a DOM-less harness that fakes
the input, popover and result list, since a real browser cannot easily be held in
the "still loading" state.
