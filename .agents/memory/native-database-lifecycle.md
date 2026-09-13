---
name: Native database lifecycle
description: Why a blank native preview can result from process metadata surviving a workspace restart.
---

Treat socket, lock and PID files as process metadata, not proof that a database is still running after the workspace resumes. Check real socket ownership and the matching database process before removing only stale runtime files.

**Why:** The isolated PHP preview once failed before its web server started because an old MySQL socket lock survived the previous process and blocked the replacement server. The publishing history shown alongside the white preview was unrelated to that startup failure.

Reclaiming those files must fail closed: canonicalize the data directory before comparing it with a running database, treat unreadable or missing ownership information as "still owned", and re-verify ownership immediately before and after removal rather than trusting one earlier snapshot.

**How to apply:** Inspect the native workflow and database startup logs before changing frontend code or publishing settings. Preserve the data directory and existing catalog/orders; do not reinitialize or replace the database to clear a runtime lock. Ensure owned child processes are allowed to shut down cleanly.

Native schema migrations must not rely on `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`; the isolated MySQL build rejects that syntax. Use an `information_schema.columns` check plus a prepared `ALTER TABLE` statement so startup migrations remain repeatable.

**Why:** The base schema is reapplied before every migration, and every migration runs again on each preview start. A non-idempotent or unsupported column addition prevents the PHP service from opening its port.

**How to apply:** For additive native columns, update the base schema and add a migration that conditionally prepares the plain `ALTER TABLE` only when the column is absent.