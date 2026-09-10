---
name: Deployment context exclusions
description: Why generated native-shop media must stay out of the production deployment image.
---

Local native-shop media, runtime storage, dependency directories, and tool caches must be excluded from the publishing context. A Git ignore rule does not necessarily remove those files from the deployment image.

**Why:** A publish uploaded several gigabytes and more than one hundred thousand generated files, then failed while creating the Autoscale service without producing application logs. The source build and readiness route were healthy.

**How to apply:** Keep generated media and private runtime storage in development, but exclude those directories through the deployment-specific ignore file. Also exclude reinstallable dependencies and caches. Never delete or exclude source assets required by the build.