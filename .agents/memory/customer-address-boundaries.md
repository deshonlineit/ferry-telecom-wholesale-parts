---
name: Customer address boundaries
description: Defines billing, shipping-location, and historical order-address semantics.
---

Customer billing is one independent address. Shipping is a multi-location
address book with exactly one primary location; staff may maintain both on the
customer’s behalf.

**Why:** treating the primary shipping destination as billing made application
reviews misleading and prevented customers with multiple locations from being
represented correctly. Current profile edits must also never rewrite old order
or invoice addresses.

**How to apply:** new registrations initialize billing and primary shipping from
the submitted company address, after which they diverge. Legacy/imported
customers may initially derive billing from primary shipping. Address edits and
deletions affect only the current customer record; orders retain their stored
address snapshots permanently.