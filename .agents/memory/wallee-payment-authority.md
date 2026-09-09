---
name: Wallee payment authority
description: Safety boundary for TWINT transactions, callbacks, environments, and payment proof.
---

Wallee/TWINT checkout defaults to PREVIEW until acquiring readiness is explicitly
confirmed. A browser return or webhook payload is only a hint: reread the
transaction through the official SDK and accept payment only in COMPLETED state.

**Why:** Redirects and notification bodies are not authoritative, and account
configuration may expose multiple payment methods or a live processor
unexpectedly.

**How to apply:** Restrict checkout to the space's explicit TWINT payment-method
configuration, keep Stripe card-only, fail webhook authentication closed, reuse
existing transaction IDs on retries, and switch to LIVE only as a deliberate
production activation.