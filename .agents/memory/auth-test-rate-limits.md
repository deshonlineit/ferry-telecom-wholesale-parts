---
name: Authentication test rate limits
description: Avoid exhausting the shared authentication provider quota during API regression suites.
---

Reuse short-lived session tokens within an API regression suite instead of minting one for every request. Keep tokens in memory only, and honor bounded `Retry-After` delays for rate-limited fixture operations.

**Why:** A small address-book regression suite exhausted the development provider's shared request quota before its final assertion, and the same limit then blocked deletion of its fictional users. The application checks had passed; the test harness caused the failure.

**How to apply:** Cache tokens for less than their lifetime, share in-flight mint requests during concurrent tests, and register newly created users for cleanup before creating their sessions. Treat unsuccessful cleanup as a failed run.