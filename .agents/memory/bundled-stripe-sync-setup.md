---
name: Bundled Stripe sync setup
description: Runtime conventions for Stripe connector credentials and stripe-replit-sync migrations in the bundled API server.
---

The Stripe connector credential is exposed as `settings.secret`, not
`settings.secret_key`. A bundled server must copy the package-owned
`stripe-replit-sync` migrations beside its output because the library resolves
them relative to its runtime `__dirname`.

**Why:** Bundling relocates the library code while its SQL files remain in the
installed package. Without the copy, `runMigrations()` silently skips a missing
output-directory path and StripeSync later fails because its schema tables do
not exist.

**How to apply:** Keep migration ownership in `stripe-replit-sync`; never create
its schema manually. After package or bundler changes, verify startup logs show
migrations, managed webhook setup, and backfill before the server listens.