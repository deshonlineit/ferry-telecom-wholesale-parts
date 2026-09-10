---
name: Custom-schema production copies
description: Publishing behavior and verification for PostgreSQL application data stored outside the public schema.
---

Do not treat a successful code build or a generic database connection check as proof that a custom PostgreSQL schema reached production. Verify the required schema, table count, and minimum application data through the production database, and make the startup readiness route enforce the same boundary.

**Why:** The native storefront used a populated custom schema in development, while a successful publish left production with only the older public schema. The schema-diff helper reported no difference, the original readiness branch did not actually query the database, and the first real storefront request failed.

**How to apply:** Before publishing an app backed by a non-public schema, ensure that schema is represented in the database source of truth. For a test environment that needs development data, explicitly choose the publish option that initializes production from current development data, after informed approval because this overwrites production. If an existing production database prevents that option from appearing, remove it through the Database tool first; the next publish then offers creation from current development data. Finally, query production and exercise a real data-backed page.