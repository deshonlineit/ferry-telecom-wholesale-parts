---
name: Custom-schema production copies
description: Replit automatic migrations only track public; populated custom schemas require an explicit database copy.
---

Replit's automatic publishing migration tracks only the default `public` PostgreSQL schema. A populated custom schema must be transferred with the deployment option that copies the development database to production, or applied manually outside the automatic migration.

**Why:** Replit Support confirmed this boundary after successful publishes left production with only the older public schema. The diff service had no custom-schema difference to report because custom schemas are outside its tracking scope.

**How to apply:** When development is the approved source of truth, enable “Copy your development database to production database” in the deployment database settings, then publish. This overwrites all current production contents, so obtain informed approval first. For later custom-schema changes, use the copy option again or apply them manually. After promotion, query production and exercise a real data-backed page.