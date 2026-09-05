---
name: Native shared-script verification
description: Why per-file JavaScript syntax checks are insufficient for the isolated native shop.
---

Verify native frontend scripts together in their shared browser scope, not only one file at a time, after cross-screen changes.

**Why:** Separate redesigns twice introduced duplicate top-level declarations. Individual files parsed successfully and the storefront still worked, while a later staff script failed before registering its routes.

**How to apply:** Keep the combined-script route check alongside syntax checks. Shared helper initializers must not compete for top-level lexical names. Browser-check affected staff operations as well as the storefront before claiming the complete interface works.