---
name: PostgreSQL outer-join row locks
description: Portable locking rule for commerce queries that join optional product data.
---

When a commerce query selects a product through a LEFT JOIN and must lock stock, PostgreSQL must use a table-qualified lock such as `FOR UPDATE OF p`. Keep plain `FOR UPDATE` only for MySQL.

**Why:** PostgreSQL rejects an unqualified `FOR UPDATE` on the nullable side of an outer join before any cart or checkout work can proceed. This affected both quick-add and final checkout independently.

**How to apply:** Review every stock-locking query containing a LEFT or RIGHT JOIN. Parse the PostgreSQL branch against production-compatible PostgreSQL and retain a separate MySQL branch where needed.