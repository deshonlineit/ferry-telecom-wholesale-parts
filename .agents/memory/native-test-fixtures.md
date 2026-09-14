---
name: Native test fixture ownership
description: Safe cleanup when synthetic customers also add pre-existing catalog products.
---

Clean up the entire cart owned by a synthetic test customer, not just cart lines for newly created test products. Any test that creates or imports a catalogue product must archive it in `finally`, including when a later assertion fails. Keep deletion of catalog products limited to the exact fixtures created for that run.

**Why:** Browser ordering checks can add both a temporary SKU and an existing SKU. A remaining cart reference can prevent deleting the synthetic customer and roll back the entire cleanup transaction. A CSV integration test once left dozens of visible products because its cleanup covered only users. Older QA-labelled catalog records may also be part of the retained baseline, not disposable leftovers.

**How to apply:** Record fixture ownership and the baseline before testing; clean dependent cart/audit/address rows for the exact synthetic user and only its newly created catalog fixtures. Confirm cleanup from the same native database connection, checking both fixture absence and restored baseline counts. Never bulk-delete records merely because their names contain QA or test.