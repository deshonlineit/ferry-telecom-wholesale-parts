---
name: Native media isolation
description: Bulk PHP media imports can affect a sibling JavaScript preview through shared filesystem watchers.
---

Keep generated native media and import caches outside the JavaScript development-server watch set, even when the two applications share an artifact directory.

**Why:** A successful full-catalog PHP image import exhausted the shared inotify watch limit and crashed the separate Vite preview without changing its application code or database. A healthy native storefront alone did not demonstrate environment isolation.

**How to apply:** Preserve the boundary between generated PHP data and JavaScript source watching. Prefer a narrow watcher exclusion over deleting catalog assets or blindly increasing system limits.