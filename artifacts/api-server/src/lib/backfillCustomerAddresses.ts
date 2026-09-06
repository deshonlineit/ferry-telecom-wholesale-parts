import type { Pool } from "pg";

/**
 * Copies legacy defaults after the managed schema migration, before serving API
 * requests. This is data-only: schema changes belong to the publish/merge flow.
 */
export async function backfillCustomerAddresses(database: Pick<Pool, "query">) {
  const result = await database.query(`
    WITH legacy_defaults AS (
      SELECT c.id, c.default_shipping_address
      FROM customers c
      WHERE c.default_shipping_address IS NOT NULL
        AND c.default_shipping_address ~ '[^[:space:]]'
        AND NOT EXISTS (
          SELECT 1 FROM customer_addresses a
          WHERE a.customer_id = c.id AND a.is_default = true
        )
      ORDER BY c.id
      FOR UPDATE OF c
    )
    INSERT INTO customer_addresses (customer_id, label, shipping_address, is_default)
    SELECT id, 'Default address', default_shipping_address, true
    FROM legacy_defaults
    ON CONFLICT (customer_id) WHERE is_default = true DO NOTHING
    RETURNING id
  `);
  return result.rowCount ?? 0;
}