---
name: Quick-add animation timing
description: How to implement and verify cart feedback when quick-add waits for a server response.
---

Anchor cart motion and its verification to the successful quick-add response, not the original button click. Start the cart-receiving state at success and keep it visible slightly longer than the product flyer.

**Why:** Network latency can consume most of a click-relative observation window, making a working transition appear absent. A pulse that begins only after the flyer finishes is also easy to miss.

**How to apply:** For quick-add UX changes, observe DOM and animation state immediately after the cart badge or success feedback changes. Keep reduced-motion behavior intact and restore only the exact test SKU after authenticated checks.