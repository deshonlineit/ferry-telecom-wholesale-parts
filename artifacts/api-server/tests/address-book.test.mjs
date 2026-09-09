/**
 * Address book API regression test.
 *
 * Uses isolated fictional Clerk users and removes their database rows afterward.
 * Requires CLERK_SECRET_KEY, DATABASE_URL, and a running API behind the local proxy.
 */
import assert from "node:assert/strict";
import pg from "pg";
import { assertDevelopmentClerkSecret } from "./clerk-test-helper.mjs";

const CLERK_API = "https://api.clerk.com/v1";
const API = process.env.ADDRESS_TEST_API_BASE ?? "http://localhost:80/api";
const SECRET = process.env.CLERK_SECRET_KEY;
if (!SECRET) throw new Error("CLERK_SECRET_KEY is required");
assertDevelopmentClerkSecret(SECRET);
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function clerk(method, path, body, attempt = 0) {
  const response = await fetch(`${CLERK_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${SECRET}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (response.status === 429 && attempt < 3) {
    const delaySeconds = Math.min(60, Math.max(1, Number(response.headers.get("retry-after")) || 10));
    await new Promise((resolve) => setTimeout(resolve, delaySeconds * 1000));
    return clerk(method, path, body, attempt + 1);
  }
  if (!response.ok) {
    throw new Error(
      `Clerk ${method} ${path} -> ${response.status}: ${await response.text()}`,
    );
  }
  return response.status === 204 ? null : response.json();
}

async function createUser(tag) {
  const email = `address-contract-${tag}-${Date.now()}@example.com`;
  const user = await clerk("POST", "/users", {
    email_address: [email],
    password: `Test-${crypto.randomUUID()}`,
    first_name: "Address",
    last_name: `Contract${tag.toUpperCase()}`,
    skip_password_checks: true,
  });
  const fixture = { userId: user.id, sessionId: null, tokenPromise: null, tokenExpiresAt: 0 };
  users.push(fixture);
  const session = await clerk("POST", "/sessions", { user_id: user.id });
  fixture.sessionId = session.id;
  return fixture;
}

async function api(user, method, path, body) {
  // Reuse a short-lived session token across requests, including concurrent writes.
  if (!user.tokenPromise || Date.now() >= user.tokenExpiresAt) {
    user.tokenExpiresAt = Date.now() + 45000;
    user.tokenPromise = clerk("POST", `/sessions/${user.sessionId}/tokens`, {});
  }
  const { jwt } = await user.tokenPromise;
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${jwt}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // A 204 response intentionally has no JSON body.
  }
  return { status: response.status, json, text };
}

function assertAddress(value) {
  assert.equal(typeof value.id, "number");
  assert.equal(typeof value.label, "string");
  assert.equal(typeof value.shippingAddress, "string");
  assert.equal(typeof value.isDefault, "boolean");
  assert.deepEqual(
    Object.keys(value).sort(),
    ["id", "isDefault", "label", "shippingAddress"].sort(),
  );
}

const users = [];
let failed = false;

try {
  for (const [method, path, body] of [
    ["GET", "/me/addresses"],
    ["POST", "/me/addresses", { label: "Home", shippingAddress: "One Way" }],
    ["PATCH", "/me/addresses/1", { label: "Home" }],
    ["DELETE", "/me/addresses/1"],
  ]) {
    const response = await fetch(`${API}${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    assert.equal(response.status, 401, `${method} ${path} requires auth`);
  }

  const owner = await createUser("owner");
  const other = await createUser("other");
  const profile = await api(owner, "GET", "/me");
  const otherProfile = await api(other, "GET", "/me");
  assert.equal(profile.status, 200);
  assert.equal(otherProfile.status, 200);

  const empty = await api(owner, "GET", "/me/addresses");
  assert.equal(empty.status, 200);
  assert.deepEqual(empty.json, []);

  for (const invalid of [
    {},
    { label: " ", shippingAddress: "Valid" },
    { label: "Valid", shippingAddress: "\n\t" },
    { label: "x".repeat(81), shippingAddress: "Valid" },
    { label: "Valid", shippingAddress: "x".repeat(2001) },
    { label: "Valid", shippingAddress: "Valid", isDefault: "yes" },
  ]) {
    assert.equal((await api(owner, "POST", "/me/addresses", invalid)).status, 400);
  }
  for (const id of ["0", "-1", "abc", "1.5"]) {
    assert.equal(
      (await api(owner, "PATCH", `/me/addresses/${id}`, { label: "Valid" }))
        .status,
      400,
    );
    assert.equal(
      (await api(owner, "DELETE", `/me/addresses/${id}`)).status,
      400,
    );
  }

  const first = await api(owner, "POST", "/me/addresses", {
    label: "  Main office  ",
    shippingAddress: "  10 Example Street\nTest City  ",
    isDefault: false,
  });
  assert.equal(first.status, 201);
  assertAddress(first.json);
  assert.equal(first.json.label, "Main office");
  assert.equal(first.json.shippingAddress, "10 Example Street\nTest City");
  assert.equal(first.json.isDefault, true, "first address must become default");

  const second = await api(owner, "POST", "/me/addresses", {
    label: "Warehouse",
    shippingAddress: "20 Sample Avenue",
  });
  assert.equal(second.status, 201);
  assert.equal(second.json.isDefault, false);

  for (const mutation of [
    ["PATCH", `/me/addresses/${first.json.id}`, { label: "Intrusion" }],
    ["DELETE", `/me/addresses/${first.json.id}`],
  ]) {
    const response = await api(other, ...mutation);
    assert.equal(response.status, 404, "cross-customer mutation is hidden");
  }
  assert.equal(
    (await api(other, "PATCH", `/me/addresses/${first.json.id}`, {
      isDefault: true,
    })).status,
    404,
  );
  assert.deepEqual((await api(other, "GET", "/me/addresses")).json, []);

  const switched = await api(owner, "PATCH", `/me/addresses/${second.json.id}`, {
    label: "  Dispatch warehouse ",
    isDefault: true,
  });
  assert.equal(switched.status, 200);
  assert.equal(switched.json.label, "Dispatch warehouse");
  assert.equal(switched.json.isDefault, true);
  let listed = await api(owner, "GET", "/me/addresses");
  listed.json.forEach(assertAddress);
  assert.equal(listed.json.filter((address) => address.isDefault).length, 1);
  assert.equal(
    listed.json.find((address) => address.id === first.json.id).isDefault,
    false,
  );
  assert.equal((await api(owner, "GET", "/me")).json.defaultShippingAddress,
    "20 Sample Avenue");

  const preserved = await api(owner, "PATCH", "/me", {
    companyName: "Updated Example Company",
    contactName: profile.json.contactName,
  });
  assert.equal(preserved.status, 200);
  assert.equal(preserved.json.defaultShippingAddress, "20 Sample Avenue");
  assert.equal(
    (await api(owner, "GET", "/me/addresses")).json.length,
    2,
    "profile update without address preserves the address book",
  );

  const legacyUpdated = await api(owner, "PATCH", "/me", {
    companyName: "Updated Example Company",
    contactName: profile.json.contactName,
    defaultShippingAddress: "  30 Legacy Road  ",
  });
  assert.equal(legacyUpdated.status, 200);
  assert.equal(legacyUpdated.json.defaultShippingAddress, "30 Legacy Road");
  listed = await api(owner, "GET", "/me/addresses");
  assert.equal(listed.json.length, 2);
  assert.equal(
    listed.json.find((address) => address.isDefault).shippingAddress,
    "30 Legacy Road",
  );

  const cleared = await api(owner, "PATCH", "/me", {
    companyName: "Updated Example Company",
    contactName: profile.json.contactName,
    defaultShippingAddress: null,
  });
  assert.equal(cleared.json.defaultShippingAddress, null);
  listed = await api(owner, "GET", "/me/addresses");
  assert.equal(listed.json.length, 2);
  assert.equal(listed.json.some((address) => address.isDefault), false);

  const restored = await api(owner, "PATCH", `/me/addresses/${first.json.id}`, {
    isDefault: true,
  });
  assert.equal(restored.status, 200);
  assert.equal(restored.json.isDefault, true);

  const concurrent = await Promise.all([
    api(owner, "PATCH", `/me/addresses/${first.json.id}`, { isDefault: true }),
    api(owner, "PATCH", `/me/addresses/${second.json.id}`, { isDefault: true }),
  ]);
  assert.deepEqual(concurrent.map((result) => result.status), [200, 200]);
  listed = await api(owner, "GET", "/me/addresses");
  assert.equal(
    listed.json.filter((address) => address.isDefault).length,
    1,
    "serialized writes and the partial index allow exactly one default",
  );

  const currentDefault = listed.json.find((address) => address.isDefault);
  const oldestRemaining = listed.json.find(
    (address) => address.id !== currentDefault.id,
  );
  const removed = await api(
    owner,
    "DELETE",
    `/me/addresses/${currentDefault.id}`,
  );
  assert.equal(removed.status, 204);
  assert.equal(removed.text, "");
  listed = await api(owner, "GET", "/me/addresses");
  assert.equal(listed.json.length, 1);
  assert.equal(listed.json[0].id, oldestRemaining.id);
  assert.equal(listed.json[0].isDefault, true);
  assert.equal(
    (await api(owner, "GET", "/me")).json.defaultShippingAddress,
    oldestRemaining.shippingAddress,
  );
  assert.equal(
    (await api(owner, "DELETE", `/me/addresses/${currentDefault.id}`)).status,
    404,
  );
  assert.equal(
    (await api(owner, "DELETE", `/me/addresses/${oldestRemaining.id}`)).status,
    204,
  );
  assert.deepEqual((await api(owner, "GET", "/me/addresses")).json, []);
  assert.equal((await api(owner, "GET", "/me")).json.defaultShippingAddress, null);

  const { rows: indexRows } = await pool.query(
    `select indexdef from pg_indexes
     where schemaname = 'public'
       and indexname = 'customer_addresses_one_default_idx'`,
  );
  assert.equal(indexRows.length, 1);
  assert.match(indexRows[0].indexdef, /UNIQUE/);
  assert.match(indexRows[0].indexdef, /is_default/);

  console.log("ALL ADDRESS BOOK TESTS PASSED");
} catch (error) {
  failed = true;
  console.error("ADDRESS BOOK TEST FAILED:", error);
} finally {
  for (const user of users) {
    try {
      await clerk("DELETE", `/users/${user.userId}`);
    } catch (error) {
      failed = true;
      console.error(`cleanup: failed to delete user ${user.userId}:`, error.message);
    }
  }
  if (users.length) {
    try {
      await pool.query(
        "delete from customers where clerk_user_id = any($1::text[])",
        [users.map((user) => user.userId)],
      );
    } catch (error) {
      failed = true;
      console.error("cleanup: failed to delete customer rows:", error.message);
    }
  }
  await pool.end();
  process.exit(failed ? 1 : 0);
}