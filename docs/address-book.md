# Shipping address book

This feature belongs to the React storefront and its PostgreSQL API. The isolated
PHP shop and its separate database are unchanged.

## Schema and existing customers

- The schema source of truth is `lib/db/src/schema/customers.ts`.
- The configured, automatic post-merge setup runs
  `scripts/migrate-customer-addresses.mjs` against development before workflows
  restart. This creates the table and indexes without replacing customer data.
  The setup script refuses production mode.
- Production schema changes use the managed publish flow, which compares the
  development and production schemas and applies the additive table/index change
  before the new service starts. Do not add schema changes to API startup or
  deployment build commands.
- The actual API entrypoint awaits `backfillCustomerAddresses` before listening,
  including when the production bundle is launched directly. It copies nonblank
  legacy defaults using data-only SQL. Customer-row locks and the unique default
  index make this safe to repeat and prevent duplicate defaults during concurrent
  starts. Existing default entries and free-form address text are preserved.
- Missing schema or failed backfill prevents startup and logs an explicit error;
  it does not serve a silently empty address book. Apply the schema through the
  normal merge/publish flow, then start the service again.

No production deployment is performed as part of development work.

## Verification

- `node --test artifacts/api-server/tests/address-migration.test.mjs` uses only
  transaction-scoped temporary tables, populated with pre-address-book fixtures.
- `node artifacts/api-server/tests/address-book.test.mjs` exercises authenticated
  address CRUD, ownership, concurrent default changes, and profile compatibility
  against a running development API using disposable customers.
- `pnpm --filter @workspace/api-server run test:profile` checks profile behavior.

At checkout the saved entry with `isDefault: true` is selected automatically.
Choosing “new address” keeps a one-time draft without modifying the address book.