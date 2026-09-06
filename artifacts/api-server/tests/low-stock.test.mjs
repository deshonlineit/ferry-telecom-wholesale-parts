/**
 * Focused regression test for GET /api/admin/products low-stock filtering.
 *
 * Uses uniquely named catalog fixtures and a temporary Clerk test user. It
 * never updates existing products or stock, and removes every created row.
 *
 * Requires: a Clerk development secret, DATABASE_URL, and the API server at
 * http://localhost:80/api (or another explicitly local LOW_STOCK_TEST_API_BASE).
 */
import assert from "node:assert/strict";
import pg from "pg";

const CLERK_API = "https://api.clerk.com/v1";
const API = process.env.LOW_STOCK_TEST_API_BASE ?? "http://localhost:80/api";
const SECRET = process.env.CLERK_SECRET_KEY;

if (!SECRET) throw new Error("CLERK_SECRET_KEY is required");
if (!SECRET.startsWith("sk_test_")) {
  throw new Error("Refusing to run with a non-development Clerk secret");
}
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

const apiUrl = new URL(API);
if (
  apiUrl.protocol !== "http:" ||
  !["localhost", "127.0.0.1", "::1"].includes(apiUrl.hostname) ||
  apiUrl.pathname.replace(/\/$/, "") !== "/api"
) {
  throw new Error("LOW_STOCK_TEST_API_BASE must be a local http URL ending in /api");
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function clerk(method, path, body) {
  const res = await fetch(`${CLERK_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${SECRET}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Clerk ${method} ${path} failed with status ${res.status}`);
  }
  return res.status === 204 ? null : res.json();
}

async function api(sessionId, path) {
  const token = await clerk("POST", `/sessions/${sessionId}/tokens`, {});
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${token.jwt}` },
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // Assertions below report only status and whether a JSON body was present.
  }
  return { status: res.status, json };
}

function assertSuccessfulPage(result, expected) {
  assert.equal(result.status, 200);
  assert.ok(result.json, "expected a JSON response");
  assert.equal(result.json.lowStockThreshold, 5, "default threshold must be 5");
  assert.equal(result.json.total, expected.total);
  assert.equal(result.json.totalPages, expected.totalPages);
  assert.equal(result.json.page, expected.page);
  assert.equal(result.json.pageSize, expected.pageSize);
}

const tag = `low-stock-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
let clerkUserId = null;
let categoryIds = [];
let brandId = null;
let productIds = [];
let failed = false;

try {
  const categoryA = await pool.query(
    "INSERT INTO categories (name, slug, description) VALUES ($1, $2, $3) RETURNING id",
    [`${tag} category A`, `${tag}-category-a`, "temporary low-stock test fixture"],
  );
  categoryIds.push(categoryA.rows[0].id);
  const categoryB = await pool.query(
    "INSERT INTO categories (name, slug, description) VALUES ($1, $2, $3) RETURNING id",
    [`${tag} category B`, `${tag}-category-b`, "temporary low-stock test fixture"],
  );
  categoryIds.push(categoryB.rows[0].id);

  const brand = await pool.query(
    "INSERT INTO brands (name) VALUES ($1) RETURNING id",
    [`${tag} brand`],
  );
  brandId = brand.rows[0].id;

  const fixtures = [
    ["A zero", categoryIds[0], 0, false],
    ["B four", categoryIds[0], 4, false],
    ["C five featured", categoryIds[0], 5, true],
    ["D six", categoryIds[0], 6, false],
    ["E four other category", categoryIds[1], 4, false],
  ];
  for (let index = 0; index < fixtures.length; index += 1) {
    const [suffix, categoryId, stock, featured] = fixtures[index];
    const inserted = await pool.query(
      `INSERT INTO products
         (sku, name, category_id, brand_id, quality, list_price, stock, featured)
       VALUES ($1, $2, $3, $4, 'Test', '1.00', $5, $6)
       RETURNING id`,
      [`${tag}-sku-${index}`, `${tag} ${suffix}`, categoryId, brandId, stock, featured],
    );
    productIds.push(inserted.rows[0].id);
  }

  const user = await clerk("POST", "/users", {
    email_address: [`${tag}@example.com`],
    password: `Test-${crypto.randomUUID()}`,
    first_name: "LowStock",
    last_name: "Regression",
    skip_password_checks: true,
  });
  clerkUserId = user.id;
  const session = await clerk("POST", "/sessions", { user_id: user.id });

  const search = encodeURIComponent(tag);
  const omitted = await api(
    session.id,
    `/admin/products?search=${search}&pageSize=2&page=1`,
  );
  assertSuccessfulPage(omitted, { total: 5, totalPages: 3, page: 1, pageSize: 2 });
  assert.equal(omitted.json.items.length, 2);

  const explicitFalse = await api(
    session.id,
    `/admin/products?search=${search}&lowStockOnly=false&pageSize=100`,
  );
  assertSuccessfulPage(explicitFalse, {
    total: 5,
    totalPages: 1,
    page: 1,
    pageSize: 100,
  });
  assert.deepEqual(
    explicitFalse.json.items.map((item) => item.stock).sort((a, b) => a - b),
    [0, 4, 4, 5, 6],
    "false must leave stock unfiltered",
  );
  console.log("PASS omitted and false leave stock unfiltered");

  const lowPage1 = await api(
    session.id,
    `/admin/products?search=${search}&lowStockOnly=true&pageSize=2&page=1`,
  );
  assertSuccessfulPage(lowPage1, { total: 4, totalPages: 2, page: 1, pageSize: 2 });
  assert.deepEqual(lowPage1.json.items.map((item) => item.stock), [0, 4]);

  const lowPage2 = await api(
    session.id,
    `/admin/products?search=${search}&lowStockOnly=true&pageSize=2&page=2`,
  );
  assertSuccessfulPage(lowPage2, { total: 4, totalPages: 2, page: 2, pageSize: 2 });
  assert.deepEqual(lowPage2.json.items.map((item) => item.stock), [5, 4]);
  assert.deepEqual(
    [...lowPage1.json.items, ...lowPage2.json.items]
      .map((item) => item.stock)
      .sort((a, b) => a - b),
    [0, 4, 4, 5],
    "threshold must include 0, 4, and 5 while excluding 6",
  );
  console.log("PASS inclusive threshold, totals, totalPages, and pagination");

  const composed = await api(
    session.id,
    `/admin/products?search=${search}&categoryId=${categoryIds[0]}&featured=false&lowStockOnly=true&pageSize=100`,
  );
  assertSuccessfulPage(composed, {
    total: 2,
    totalPages: 1,
    page: 1,
    pageSize: 100,
  });
  assert.deepEqual(composed.json.items.map((item) => item.stock), [0, 4]);
  assert.ok(composed.json.items.every((item) => item.featured === false));
  assert.ok(composed.json.items.every((item) => item.categoryId === categoryIds[0]));
  console.log("PASS low stock composes with search, category, and featured=false");

  const invalidQueries = [
    "lowStockOnly=",
    "lowStockOnly=yes",
    "lowStockOnly=1",
    "lowStockOnly=TRUE",
    "lowStockOnly=true&lowStockOnly=false",
  ];
  for (const query of invalidQueries) {
    const invalid = await api(session.id, `/admin/products?${query}`);
    assert.equal(invalid.status, 400, `expected 400 for ${query}`);
  }
  console.log("PASS empty, invalid, and duplicate boolean queries return 400");
  console.log("ALL LOW-STOCK TESTS PASSED");
} catch (error) {
  failed = true;
  console.error("LOW-STOCK TEST FAILED:", error.message);
} finally {
  if (productIds.length) {
    await pool.query("DELETE FROM products WHERE id = ANY($1)", [productIds]).catch((error) => {
      failed = true;
      console.error("cleanup: failed to delete products:", error.message);
    });
  }
  if (categoryIds.length) {
    await pool.query("DELETE FROM categories WHERE id = ANY($1)", [categoryIds]).catch((error) => {
      failed = true;
      console.error("cleanup: failed to delete categories:", error.message);
    });
  }
  if (brandId !== null) {
    await pool.query("DELETE FROM brands WHERE id = $1", [brandId]).catch((error) => {
      failed = true;
      console.error("cleanup: failed to delete brand:", error.message);
    });
  }
  if (clerkUserId) {
    await pool.query("DELETE FROM customers WHERE clerk_user_id = $1", [clerkUserId]).catch((error) => {
      failed = true;
      console.error("cleanup: failed to delete customer:", error.message);
    });
    await clerk("DELETE", `/users/${clerkUserId}`).catch((error) => {
      failed = true;
      console.error("cleanup: failed to delete Clerk test user:", error.message);
    });
  }
  await pool.end();
}

if (failed) process.exit(1);