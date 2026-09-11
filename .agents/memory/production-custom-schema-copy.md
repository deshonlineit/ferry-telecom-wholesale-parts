---
name: Custom-schema production copies
description: Publishing behavior and verification for PostgreSQL application data stored outside the public schema.
---

Do not treat a successful code build or a generic database connection check as proof that a custom PostgreSQL schema reached production. Verify the required schema, table count, and minimum application data through the production database after promotion.

**Why:** The native storefront used a populated custom schema in development, while a successful publish left production with only the older public schema. A later publish generated the missing-schema migration transaction, but a readiness check that required the uncommitted schema caused promotion to fail and the transaction to roll back.

**How to apply:** Before publishing an app backed by a non-public schema, ensure that schema is represented in the database source of truth. Startup readiness may check database connectivity but must not require schema changes that the same publish commits only after promotion. For a test environment that needs development data, explicitly choose initialization from current development data after informed approval. If an existing production database prevents that option from appearing, remove it through the Database tool first. After promotion, query production and exercise a real data-backed page.