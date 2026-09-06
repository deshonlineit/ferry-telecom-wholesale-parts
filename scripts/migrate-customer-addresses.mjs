import { createRequire } from "node:module";

if (process.env.NODE_ENV === "production") {
  throw new Error("Development schema setup only. Production schema changes use the managed publish flow.");
}
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

const requireDb = createRequire(
  new URL("../lib/db/package.json", import.meta.url).pathname,
);
const pg = requireDb("pg");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

try {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS customer_addresses (
      id serial PRIMARY KEY,
      customer_id integer NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      label text NOT NULL,
      shipping_address text NOT NULL,
      is_default boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS customer_addresses_customer_id_idx
      ON customer_addresses (customer_id);
    CREATE UNIQUE INDEX IF NOT EXISTS customer_addresses_one_default_idx
      ON customer_addresses (customer_id) WHERE is_default = true;
    INSERT INTO customer_addresses (customer_id, label, shipping_address, is_default)
    SELECT c.id, 'Default address', c.default_shipping_address, true
    FROM customers c
    WHERE c.default_shipping_address IS NOT NULL
      AND c.default_shipping_address ~ '[^[:space:]]'
      AND NOT EXISTS (
        SELECT 1
        FROM customer_addresses a
        WHERE a.customer_id = c.id AND a.is_default = true
      )
    ON CONFLICT (customer_id) WHERE is_default = true DO NOTHING;
  `);
  console.log("migrate-customer-addresses: schema and legacy backfill applied");
} finally {
  await pool.end();
}