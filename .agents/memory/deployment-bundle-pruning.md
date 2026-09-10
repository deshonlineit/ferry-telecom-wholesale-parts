---
name: Deployment bundle pruning
description: Runnable artifact bundles must be tested without workspace dependencies because publishing prunes packages after building.
---

A production bundle may not leave ordinary runtime packages external unless the
published image is guaranteed to retain them. Validate the built output from an
isolated directory with no ancestor `node_modules`, not only from the workspace.

**Why:** Local production startup passed because workspace dependencies masked an
externalized storage package. Publishing pruned that package after the build, so
the API crashed with `ERR_MODULE_NOT_FOUND` before opening its declared port.

**How to apply:** After changing bundler externals or runtime imports, copy only
the production output to a temporary isolated directory, start it there, wait
for background initialization, and exercise any bundled client through a real
route before considering the artifact publishable.