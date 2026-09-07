---
name: Native shared-script verification
description: Why syntax and backend checks alone do not establish working native UI behavior.
---

Verify native frontend scripts together in their shared browser scope, not only one file at a time, after cross-screen changes.

**Why:** Separate redesigns twice introduced duplicate top-level declarations. Individual files parsed successfully and the storefront still worked, while a later staff script failed before registering its routes.

**How to apply:** Keep the combined-script route check alongside syntax checks. Shared helper initializers must not compete for top-level lexical names. Browser-check affected staff operations as well as the storefront before claiming the complete interface works.

Assert shared helper capabilities after loading the actual script sequence; do not test copied versions of production functions.

**Why:** A money parser defined inside an unrelated “toast not initialized” guard was absent in the real page, although a copied-parser test passed and every route registered. Both grid editing and Excel paste then failed.

**How to apply:** Initialize each capability independently, and run validation against the real shared globals after all scripts load, including when earlier modules have already populated the shared object.

Verify the actual control-to-request connection when redesigning discovery, not just the server's filtering or sorting capabilities.

**Why:** Backend sorting tests passed while the visible sort control still constructed an invalid URL. A redesign also left contextual facets disconnected from their new endpoint behavior. These failures are invisible to script registration and API-only tests.

**How to apply:** Cover changing sort on an already-filtered URL, changing a brand after choosing a model, and late responses after navigation. Native dialog state and model-picker interactions require actual browser interaction, not just an attractive static screenshot.

Trace discovery feedback from the user's actual entry screen and count opening, confirming and dismissing controls as interactions.

**Why:** Catalog filtering passed functional checks, but the owner still rejected the multi-step homepage finder. Correct results alone did not demonstrate an easier path to those results.

**How to apply:** Verify the journey from the homepage itself; do not substitute a direct catalog URL for the starting experience shown in feedback.

Hand styling work the real rendered markup when behavior and presentation are implemented separately, not only a list of intended class names.

**Why:** A parallel native design handoff treated wrapper elements as inputs and assumed dialog controls that the actual controller did not render. Successful behavior tests did not expose the resulting unstyled controls and mobile intrinsic-width overflow.

**How to apply:** Share the actual render contract before final styling, then check the integrated mobile surface. For density changes, measure where the first product actually appears and check touch targets, complete names and wrapped headers. Do not treat a helper's “responsive” or “compact” completion report as evidence.

Exercise pointer entry followed by click as a single interaction for hover-enabled navigation, and verify both open and closed layouts.

**Why:** Real pointer clicks first enter the target. A click-only test double can pass while the preceding hover opens the menu and the click immediately closes it. Browser focus restoration must also target a control that remains visible after mobile navigation closes.

**How to apply:** Include the real pointer sequence and mobile Escape in the controller regression; assess the navigation and surrounding catalog controls together, not the trigger alone.

Park the pointer away from the element before measuring or screenshotting a rest state.

**Why:** a headless driver keeps its virtual cursor where the last interaction left it, and that survives navigation and reloads. A correct resting style then reports and renders as its hover style, which looks like a failed fix and invites a second, wrong change.

**How to apply:** move the pointer to a neutral coordinate first, measure the rest state, then hover explicitly and measure again; report both. Treat a "rest" measurement that exactly equals the hover rule as a parked cursor until proven otherwise.

Authenticated native browser checks must use dedicated synthetic credentials rather than depending on workspace-only staff secrets.

**Why:** Browser automation cannot read the native staff password secret, so a test can reach the correct sign-in form yet remain blocked before exercising the storefront.

**How to apply:** Create an isolated active QA identity with a unique synthetic address and disposable password, verify the authenticated session in the browser, and delete every owned fixture after the check.