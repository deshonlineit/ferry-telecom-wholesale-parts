---
name: Account metadata updates
description: External identity-provider API behavior affecting staff-role test fixtures and administration
---

Use the dedicated user metadata endpoint (or SDK metadata method) for account
role changes. A partial metadata update merges fields; revoke a role with an
explicit non-staff value or documented deletion, not an empty merge.

**Why:** The installed identity SDK separates ordinary user updates from
metadata updates. Directly PATCHing metadata onto the ordinary user endpoint
returned 422 during authorization verification, even though metadata supplied
when creating a user was accepted.

**How to apply:** Before writing account-role fixtures or an administration
integration, verify the current SDK's update-versus-replace semantics. Keep
role checks on the trusted server account, never client-editable metadata.