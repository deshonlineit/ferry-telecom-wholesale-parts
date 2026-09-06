---
name: Publishing preflight visibility
description: Limits of build-history evidence when publishing is still validating database changes.
---

A pending database-validation screen is not necessarily represented by a new build-history entry. An older failed build alone does not explain the user's current validation spinner.

**Why:** In this workspace, a user showed pending migration validation, the read-only schema comparison confirmed the exact pending statement, but build history returned only substantially older attempts with no logs for the current validation.

**How to apply:** Compare timestamps before using a build failure as evidence. Use the read-only schema comparison and narrowly scoped production checks to investigate the pending change. If current validation logs are unavailable, say that the precise cause is unconfirmed; do not invent a duplicate-data error or bypass a publication guard to clear the spinner.