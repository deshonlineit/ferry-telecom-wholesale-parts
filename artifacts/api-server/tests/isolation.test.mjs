/**
 * Cross-customer isolation test.
 *
 * Creates two real Clerk users via the Clerk Backend API, mints session
 * tokens for each, and exercises /api/me, /api/cart and /api/orders to
 * verify that:
 *   - each new customer is JIT-provisioned on the lowest-rank group (Big Repairshop)
 *   - carts are fully isolated between customers
 *   - orders are fully isolated (list + direct id access)
 * Cleans up Clerk users and all DB rows afterward.
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
  const email = `isolation-test-${tag}-${Date.now()}@example.com`;
  const user = await clerk("POST", "/users", {
    email_address: [email],
    password: `Test-${crypto.randomUUID()}`,
    first_name: "Isolation",
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
let failed = false;

try {
  // Unauthenticated requests are rejected.
  for (const path of ["/me", "/cart", "/orders"]) {
    const res = await fetch(`${API}${path}`);
    assert.equal(res.status, 401, `unauthenticated ${path} should be 401`);
  }
  console.log("PASS unauthenticated requests rejected (401)");

  const a = await createTestUser("a");
  const b = await createTestUser("b");
  users.push(a, b);

  // --- /api/me: own identity + default group for new accounts ---
  const meA = await api(a, "GET", "/me");
  const meB = await api(b, "GET", "/me");
  assert.equal(meA.status, 200);
  assert.equal(meB.status, 200);
  assert.equal(meA.json.email, a.email, "A sees own email");
  assert.equal(meB.json.email, b.email, "B sees own email");
  assert.notEqual(meA.json.id, meB.json.id, "distinct customer records");
  assert.equal(meA.json.tier.name, "Big Repairshop", "A starts on Big Repairshop");
  assert.equal(meB.json.tier.name, "Big Repairshop", "B starts on Big Repairshop");
  console.log("PASS /me: distinct customers, own emails, default group");

  // --- carts start empty ---
  const cartA0 = await api(a, "GET", "/cart");
  const cartB0 = await api(b, "GET", "/cart");
  assert.equal(cartA0.json.items.length, 0, "A cart starts empty");
  assert.equal(cartB0.json.items.length, 0, "B cart starts empty");

  // --- A adds an in-stock product; B's cart must stay empty ---
  const { rows: productRows } = await pool.query(
    "select id from products where stock > 0 order by id limit 1",
  );
  assert.ok(productRows.length, "need at least one in-stock product");
  const productId = productRows[0].id;

  const add = await api(a, "POST", "/cart/items", { productId, quantity: 1 });
  assert.equal(add.status, 200, `add to cart failed: ${JSON.stringify(add.json)}`);
  assert.equal(add.json.items.length, 1);
  const aCartItemId = add.json.items[0].id;

  const cartA1 = await api(a, "GET", "/cart");
  const cartB1 = await api(b, "GET", "/cart");
  assert.equal(cartA1.json.items.length, 1, "A sees own cart item");
  assert.equal(cartB1.json.items.length, 0, "B does NOT see A's cart item");
  console.log("PASS cart isolation: A's item invisible to B");

  // --- B cannot modify or delete A's cart item ---
  const patch = await api(b, "PATCH", `/cart/items/${aCartItemId}`, {
    quantity: 5,
  });
  assert.ok(patch.status === 404 || patch.status === 403,
    `B patching A's cart item should 403/404, got ${patch.status}`);
  const del = await api(b, "DELETE", `/cart/items/${aCartItemId}`);
  assert.ok(del.status === 404 || del.status === 403,
    `B deleting A's cart item should 403/404, got ${del.status}`);
  const cartA2 = await api(a, "GET", "/cart");
  assert.equal(cartA2.json.items[0].quantity, 1, "A's cart untouched by B");
  console.log("PASS B cannot modify or delete A's cart item");

  // --- A places an order; B must not see it ---
  const order = await api(a, "POST", "/orders", {
    shippingAddress: "1 Test Way, Testville",
    notes: "isolation test",
  });
  assert.equal(order.status, 201, `create order failed: ${JSON.stringify(order.json)}`);
  const orderId = order.json.id;

  const ordersA = await api(a, "GET", "/orders");
  const ordersB = await api(b, "GET", "/orders");
  assert.ok(ordersA.json.some((o) => o.id === orderId), "A sees own order");
  assert.equal(ordersB.json.length, 0, "B sees no orders");

  const orderByIdB = await api(b, "GET", `/orders/${orderId}`);
  assert.ok(orderByIdB.status === 404 || orderByIdB.status === 403,
    `B fetching A's order by id should 403/404, got ${orderByIdB.status}`);
  const orderByIdA = await api(a, "GET", `/orders/${orderId}`);
  assert.equal(orderByIdA.status, 200, "A can fetch own order by id");
  console.log("PASS order isolation: list + direct id access");

  console.log("\nALL ISOLATION TESTS PASSED");
} catch (err) {
  failed = true;
  console.error("\nISOLATION TEST FAILED:", err);
} finally {
  // Cleanup: Clerk users, then DB rows for the provisioned customers.
  for (const u of users) {
    try {
      await clerk("DELETE", `/users/${u.userId}`);
    } catch (e) {
      console.error(`cleanup: failed to delete Clerk user ${u.userId}:`, e.message);
    }
  }
  if (users.length) {
    const clerkIds = users.map((u) => u.userId);
    try {
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
        // Restore stock consumed by the test order.
        console.log(`cleanup: removed ${ids.length} test customer(s) and their rows`);
      }
    } catch (e) {
      console.error("cleanup: DB cleanup failed:", e.message);
    }
  }
  await pool.end();
  process.exit(failed ? 1 : 0);
}
