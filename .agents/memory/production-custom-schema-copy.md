---
name: Custom-schema production copies
description: Publishing behavior and verification for PostgreSQL application data stored outside the public schema.
---

Do not treat a successful code build or a generic database connection check as proof that a custom PostgreSQL schema reached production. Verify the required schema, table count, and minimum application data through the production database after promotion.

**Why:** The native storefront used a populated custom schema in development, while successful publishes left production with only the older public schema. One publish correctly failed because readiness required an uncommitted schema, but after fixing that, two successful publishes still omitted the custom schema even though the UI generated and validated its migrations. The platform then incorrectly reported no remaining schema diff.

**How to apply:** Before publishing an app backed by a non-public schema, ensure that schema is represented in the database source of truth. Startup readiness may check database connectivity but must not require schema changes that the same publish commits only after promotion. For a test environment that needs development data, explicitly choose initialization from current development data after informed approval. If an existing production database prevents that option from appearing, remove it through the Database tool first. After promotion, query production and exercise a real data-backed page. If validated migrations are omitted by multiple successful publishes while the diff service reports no difference, stop republishing: production is read-only to the agent and the platform migration state needs repair.