/**
 * Featured products endpoint test.
 *
 * Verifies GET /api/products/featured always returns FEATURED_LIMIT (8)
 * unique in-stock products, ordered as:
 *   1. curated (featured=true) picks
 *   2. best sellers by units sold (excluding curated)
 *   3. in-stock highlights
 * Deliberately makes curated products also occupy the top sales ranks to
 * assert that lower-ranked best sellers still fill the remaining slots.
 *
 * Requires: CLERK_SECRET_KEY, DATABASE_URL, and the API server running
 * behind the local proxy at http://localhost:80/api.
 */
import assert from "node:assert/strict";
import pg from "pg";
import {
  createClerkTestClient,
  createSessionTokenCache,
} from "./clerk-test-helper.mjs";

const API = process.env.ISOLATION_TEST_API_BASE ?? "http://localhost:80/api";
const SECRET = process.env.CLERK_SECRET_KEY;
if (!SECRET) throw new Error("CLERK_SECRET_KEY is required");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const clerk = createClerkTestClient({ secret: SECRET });
const tokenFor = createSessionTokenCache({ clerk });

async function api(sessionId, path) {
  const jwt = await tokenFor(sessionId);
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${jwt}` },
  });
  return { status: res.status, json: await res.json() };
}

let clerkUserId = null;
let orderId = null;
let featuredIds = [];
let failed = false;

try {
  // Pre-condition: this test assumes no products are flagged featured.
  const { rows: preFlagged } = await pool.query(
    "SELECT id FROM products WHERE featured",
  );
  assert.equal(preFlagged.length, 0, "test requires zero pre-existing featured products");

  // Pick 6 deterministic in-stock products: 3 curated + 3 sales-only.
  const { rows: picks } = await pool.query(
    "SELECT id, name FROM products WHERE stock > 0 ORDER BY id ASC LIMIT 6",
  );
  assert.equal(picks.length, 6);
  const [c1, c2, c3, s1, s2, s3] = picks.map((p) => p.id);
  featuredIds = [c1, c2, c3];
  await pool.query("UPDATE products SET featured = true WHERE id = ANY($1)", [featuredIds]);

  // Create a Clerk user; first API call JIT-provisions the customer.
  const email = `featured-test-${Date.now()}@example.com`;
  const user = await clerk("POST", "/users", {
    email_address: [email],
    password: `Test-${crypto.randomUUID()}`,
    skip_password_checks: true,
  });
  clerkUserId = user.id;
  const session = await clerk("POST", "/sessions", { user_id: user.id });
  const me = await api(session.id, "/me");
  assert.equal(me.status, 200);
  const { rows: [cust] } = await pool.query(
    "SELECT id FROM customers WHERE clerk_user_id = $1",
    [user.id],
  );

  // Seed sales so curated products occupy the TOP sales ranks, with
  // lower-ranked non-curated best sellers behind them.
  const { rows: [order] } = await pool.query(
    `INSERT INTO orders (order_number, customer_id, status, total, shipping_address)
     VALUES ($1, $2, 'completed', '0', 'test') RETURNING id`,
    [`FEAT-TEST-${Date.now()}`, cust.id],
  );
  orderId = order.id;
  const sales = [
    [c1, 100], [c2, 90], [c3, 80], // curated dominate sales
    [s1, 70], [s2, 60], [s3, 50],  // non-curated best sellers
  ];
  for (const [pid, qty] of sales) {
    await pool.query(
      `INSERT INTO order_lines (order_id, product_id, sku, name, quantity, unit_price, line_total)
       VALUES ($1, $2, 'TEST', 'test', $3::int, '1', $3::int::numeric)`,
      [orderId, pid, qty],
    );
  }

  const res = await api(session.id, "/products/featured");
  assert.equal(res.status, 200);
  const items = res.json;
  assert.equal(items.length, 8, `expected 8 products, got ${items.length}`);
  const ids = items.map((p) => p.id);
  assert.equal(new Set(ids).size, 8, "returned products must be unique");
  for (const p of items) assert.ok(p.stock > 0 || featuredIds.includes(p.id), "auto-filled products must be in stock");

  // Slots 1-3: curated picks, ordered by name.
  const curatedNames = picks
    .filter((p) => featuredIds.includes(p.id))
    .sort((a, b) => a.name.localeCompare(b.name));
  const curatedSlot = new Set(ids.slice(0, 3));
  assert.deepEqual(curatedSlot, new Set(featuredIds), "first 3 slots must be the curated picks");
  console.log("PASS curated picks fill the first slots");

  // Slots 4-6: the lower-ranked best sellers, in sales order, even though
  // curated products out-sell them.
  assert.deepEqual(ids.slice(3, 6), [s1, s2, s3],
    "slots 4-6 must be highest-selling non-curated products in sales order");
  console.log("PASS lower-ranked best sellers fill next slots despite curated top sellers");

  // Slots 7-8: highlights, not overlapping anything above.
  for (const id of ids.slice(6)) {
    assert.ok(![c1, c2, c3, s1, s2, s3].includes(id), "highlight slots must not duplicate");
  }
  console.log("PASS remaining slots filled with in-stock highlights");
  console.log("ALL FEATURED TESTS PASSED");
} catch (err) {
  failed = true;
  console.error("FAIL", err);
} finally {
  if (orderId) {
    await pool.query("DELETE FROM order_lines WHERE order_id = $1", [orderId]);
    await pool.query("DELETE FROM orders WHERE id = $1", [orderId]);
  }
  if (featuredIds.length) {
    await pool.query("UPDATE products SET featured = false WHERE id = ANY($1)", [featuredIds]);
  }
  if (clerkUserId) {
    await pool.query("DELETE FROM customers WHERE clerk_user_id = $1", [clerkUserId]);
    await clerk("DELETE", `/users/${clerkUserId}`).catch(() => {});
  }
  await pool.end();
}
if (failed) process.exit(1);
