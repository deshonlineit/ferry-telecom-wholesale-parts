---
name: Admin diagnostics boundary
description: Separation between operational diagnostics and customer or account messaging.
---

Operational debug failures belong in a dedicated database-backed, staff-only
Diagnostics area. Store only bounded, recursively redacted context and an opaque
reference; never send diagnostics through email, a message queue, or a local
mailbox.

Account recovery and future customer transactional messages are a separate
business channel. They must not be exposed as a generic Admin Messages screen
and must never receive diagnostic events.

**Why:** Debug records can contain sensitive implementation context and should
not create noisy or unsafe communications. Staff still need persistent,
filterable incident history that survives process restarts.

**How to apply:** diagnostic recording must be best-effort and recursion-safe,
public errors expose only the reference, staff access is enforced server-side,
and resolution changes are audited without mutating the diagnostic payload.