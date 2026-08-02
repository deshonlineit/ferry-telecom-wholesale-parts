/**
 * Concurrent checkout stock-race test.
 *
 * Creates a dedicated product with stock = 1 and two real Clerk users,
 * puts the last unit in both carts, then fires both checkouts at the
 * same time. Verifies:
 *   - exactly one order succeeds (201)
 *   - the other fails with a clear out-of-stock error (400, code OUT_OF_STOCK)
 *   - stock ends at 0 and never goes negative
 * Cleans up Clerk users, DB rows, and the test product afterward.
 *
 * Requires: CLERK_SECRET_KEY, DATABASE_URL, and the API server running
 * behind the local proxy at http://localhost:80/api.
 */
import assert from "node:assert/strict";
import pg from "pg";

const CLERK_API = "https://api.clerk.com/v1";
const API = process.env.ISOLATION_TEST_API_BASE ?? "http://localhost:80/api";
const SECRET = process.env.CLERK_SECRET_KEY;
if (!SECRET) throw new Error("CLERK_SECRET_KEY is required");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function clerk(method, path, body) {
  const res = await fetch(`${CLERK_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${SECRET}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    throw new Error(
      `Clerk ${method} ${path} -> ${res.status}: ${await res.text()}`,
    );
  }
  return res.status === 204 ? null : res.json();
}

async function createTestUser(tag) {
  const email = `stock-race-test-${tag}-${Date.now()}@example.com`;
  const user = await clerk("POST", "/users", {
    email_address: [email],
    password: `Test-${crypto.randomUUID()}`,
    first_name: "StockRace",
    last_name: `Test${tag.toUpperCase()}`,
    skip_password_checks: true,
  });
  const session = await clerk("POST", "/sessions", { user_id: user.id });
  return { email, userId: user.id, sessionId: session.id };
}

// Session tokens expire after ~60s; mint a fresh one per API call.
async function api(user, method, path, body) {
  const { jwt } = await clerk("POST", `/sessions/${user.sessionId}/tokens`, {});
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${jwt}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON body */
  }
  return { status: res.status, json };
}

const users = [];
let productId = null;
let failed = false;

try {
  // --- create a dedicated last-unit product ---
  const { rows: catRows } = await pool.query("select id from categories limit 1");
  const { rows: brandRows } = await pool.query("select id from brands limit 1");
  assert.ok(catRows.length && brandRows.length, "need a category and brand");
  const sku = `RACE-TEST-${Date.now()}`;
  const { rows: prodRows } = await pool.query(
    `insert into products (sku, name, category_id, brand_id, quality, list_price, stock)
     values ($1, 'Stock Race Test Part', $2, $3, 'OEM', 9.99, 1)
     returning id`,
    [sku, catRows[0].id, brandRows[0].id],
  );
  productId = prodRows[0].id;

  const a = await createTestUser("a");
  const b = await createTestUser("b");
  users.push(a, b);

  // --- both shops put the last unit in their cart ---
  const addA = await api(a, "POST", "/cart/items", { productId, quantity: 1 });
  const addB = await api(b, "POST", "/cart/items", { productId, quantity: 1 });
  assert.equal(addA.status, 200, `A add to cart: ${JSON.stringify(addA.json)}`);
  assert.equal(addB.status, 200, `B add to cart: ${JSON.stringify(addB.json)}`);
  console.log("PASS both shops added the last unit to their carts");

  // --- fire both checkouts concurrently ---
  const [resA, resB] = await Promise.all([
    api(a, "POST", "/orders", { shippingAddress: "1 Race Way, Testville" }),
    api(b, "POST", "/orders", { shippingAddress: "2 Race Way, Testville" }),
  ]);

  const results = [resA, resB];
  const ok = results.filter((r) => r.status === 201);
  const rejected = results.filter((r) => r.status === 400);
  assert.equal(ok.length, 1,
    `exactly one checkout should succeed, got: ${JSON.stringify(results.map((r) => [r.status, r.json]))}`);
  assert.equal(rejected.length, 1, "exactly one checkout should be rejected");
  console.log("PASS exactly one of two concurrent checkouts succeeded");

  // --- the loser gets a clear out-of-stock error ---
  const err = rejected[0].json;
  assert.ok(err && typeof err.error === "string" && err.error.length > 0,
    "rejected checkout carries an error message");
  assert.equal(err.code, "OUT_OF_STOCK",
    `rejected checkout should have code OUT_OF_STOCK, got ${JSON.stringify(err)}`);
  assert.ok(/stock|sold out/i.test(err.error),
    `error message should mention stock, got: ${err.error}`);
  console.log(`PASS loser got clear out-of-stock error: "${err.error}"`);

  // --- stock is exactly 0, never negative ---
  const { rows: stockRows } = await pool.query(
    "select stock from products where id = $1",
    [productId],
  );
  assert.equal(stockRows[0].stock, 0, "stock must end at exactly 0");
  console.log("PASS stock ended at 0 (never negative)");

  // --- the loser's cart is preserved so they can review it ---
  const loser = rejected[0] === resA ? a : b;
  const loserCart = await api(loser, "GET", "/cart");
  assert.equal(loserCart.json.items.length, 1,
    "loser's cart is preserved after failed checkout");
  console.log("PASS loser's cart preserved after failed checkout");

  console.log("\nALL STOCK RACE TESTS PASSED");
} catch (err) {
  failed = true;
  console.error("\nSTOCK RACE TEST FAILED:", err);
} finally {
  for (const u of users) {
    try {
      await clerk("DELETE", `/users/${u.userId}`);
    } catch (e) {
      console.error(`cleanup: failed to delete Clerk user ${u.userId}:`, e.message);
    }
  }
  try {
    if (users.length) {
      const clerkIds = users.map((u) => u.userId);
      const { rows } = await pool.query(
        "select id from customers where clerk_user_id = any($1)",
        [clerkIds],
      );
      const ids = rows.map((r) => r.id);
      if (ids.length) {
        await pool.query(
          "delete from order_lines where order_id in (select id from orders where customer_id = any($1))",
          [ids],
        );
        await pool.query("delete from orders where customer_id = any($1)", [ids]);
        await pool.query("delete from cart_items where customer_id = any($1)", [ids]);
        await pool.query("delete from customers where id = any($1)", [ids]);
        console.log(`cleanup: removed ${ids.length} test customer(s) and their rows`);
      }
    }
    if (productId != null) {
      await pool.query("delete from cart_items where product_id = $1", [productId]);
      await pool.query("delete from order_lines where product_id = $1", [productId]);
      await pool.query("delete from products where id = $1", [productId]);
      console.log("cleanup: removed test product");
    }
  } catch (e) {
    console.error("cleanup: DB cleanup failed:", e.message);
  }
  await pool.end();
  process.exit(failed ? 1 : 0);
}
