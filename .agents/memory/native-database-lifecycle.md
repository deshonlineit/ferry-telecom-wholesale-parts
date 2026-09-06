---
name: Native database lifecycle
description: Why a blank native preview can result from process metadata surviving a workspace restart.
---

Treat socket, lock and PID files as process metadata, not proof that a database is still running after the workspace resumes. Check real socket ownership and the matching database process before removing only stale runtime files.

**Why:** The isolated PHP preview once failed before its web server started because an old MySQL socket lock survived the previous process and blocked the replacement server. The publishing history shown alongside the white preview was unrelated to that startup failure.

**How to apply:** Inspect the native workflow and database startup logs before changing frontend code or publishing settings. Preserve the data directory and existing catalog/orders; do not reinitialize or replace the database to clear a runtime lock. Ensure owned child processes are allowed to shut down cleanly.