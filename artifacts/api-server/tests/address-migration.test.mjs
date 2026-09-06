import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { transform } from "esbuild";
import pg from "pg";

const source = await readFile(
  new URL("../src/lib/backfillCustomerAddresses.ts", import.meta.url),
  "utf8",
);
const { code } = await transform(source, { loader: "ts", format: "esm" });
const { backfillCustomerAddresses } = await import(
  `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`
);

test("startup backfill preserves populated legacy address data", async (t) => {
  assert.notEqual(process.env.NODE_ENV, "production", "development test only");
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required");
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Only temporary tables are visible. Persistent customer data is never read.
    await client.query("SET LOCAL search_path = pg_temp");
    await client.query(`
      CREATE TEMP TABLE customers (
        id integer PRIMARY KEY,
        default_shipping_address text
      ) ON COMMIT DROP;
      INSERT INTO customers VALUES
        (1, 'Teststraat 10
1000 AA Teststad
Nederland'),
        (2, '  Unparsed building / unit / drop-off instructions  '),
        (3, ''), (4, NULL), (5, E' \\t\\n '),
        (6, 'Existing legacy mirror');
    `);

    await t.test("missing managed schema fails rather than losing the default", async () => {
      await client.query("SAVEPOINT before_schema");
      await assert.rejects(backfillCustomerAddresses(client), { code: "42P01" });
      await client.query("ROLLBACK TO SAVEPOINT before_schema");
    });

    // Represents the additive managed schema migration, after old rows exist.
    await client.query(`
      CREATE TEMP TABLE customer_addresses (
        id serial PRIMARY KEY,
        customer_id integer NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        label text NOT NULL,
        shipping_address text NOT NULL,
        is_default boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now()
      ) ON COMMIT DROP;
      CREATE UNIQUE INDEX ON customer_addresses (customer_id) WHERE is_default = true;
      INSERT INTO customer_addresses (customer_id, label, shipping_address, is_default)
      VALUES (6, 'Existing shop', 'Saved default must win', true);
    `);

    await t.test("legacy defaults become selectable saved defaults without parsing", async () => {
      assert.equal(await backfillCustomerAddresses(client), 2);
      const { rows } = await client.query(`
        SELECT c.default_shipping_address, a.shipping_address, a.label, a.is_default
        FROM customers c JOIN customer_addresses a ON a.customer_id = c.id
        WHERE c.id IN (1, 2) ORDER BY c.id
      `);
      assert.equal(rows.length, 2);
      for (const row of rows) {
        assert.equal(row.shipping_address, row.default_shipping_address);
        assert.equal(row.label, "Default address");
        assert.equal(row.is_default, true);
      }
    });

    await t.test("blank defaults are ignored and saved defaults are not overwritten", async () => {
      const { rows } = await client.query("SELECT customer_id, shipping_address FROM customer_addresses ORDER BY customer_id");
      assert.deepEqual(rows.map((row) => row.customer_id), [1, 2, 6]);
      assert.equal(rows[2].shipping_address, "Saved default must win");
    });

    await t.test("repeated startup creates no duplicate addresses", async () => {
      assert.equal(await backfillCustomerAddresses(client), 0);
      assert.equal(await backfillCustomerAddresses(client), 0);
      const { rows } = await client.query("SELECT count(*)::int AS count FROM customer_addresses");
      assert.equal(rows[0].count, 3);
    });

    await t.test("an explicitly cleared default stays cleared on startup", async () => {
      await client.query("UPDATE customers SET default_shipping_address = NULL WHERE id = 1");
      await client.query("UPDATE customer_addresses SET is_default = false WHERE customer_id = 1");
      assert.equal(await backfillCustomerAddresses(client), 0);
      const { rows } = await client.query("SELECT is_default FROM customer_addresses WHERE customer_id = 1");
      assert.deepEqual(rows, [{ is_default: false }]);
    });
  } finally {
    await client.query("ROLLBACK");
    client.release();
    await pool.end();
  }
});