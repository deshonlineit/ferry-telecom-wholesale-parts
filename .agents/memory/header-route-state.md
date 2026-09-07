---
name: Header route state
description: Preventing transient header-mode flashes during asynchronous storefront navigation.
---

The storefront header’s compact or full search mode must be selected
synchronously from the destination route before page content is replaced.

**Why:** inferring header mode only from mounted homepage or catalogue
descendants creates an empty interval during asynchronous route loading. In
that interval the global search briefly becomes visible, then disappears when
the catalogue mounts.

**How to apply:** keep route-owned header state stable through loading, success
and error states. Descendant-aware selectors may enhance the final page but
must never be the only authority for header visibility.