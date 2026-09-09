/**
 * Staff authorization integration regression test.
 *
 * Uses only temporary users in a Clerk development instance and a local API
 * target. All attempted admin mutations are either rejected by the guard or
 * address an id proven not to exist.
 *
 * Requires: CLERK_SECRET_KEY, DATABASE_URL, and the API server behind the
 * local proxy at http://localhost:80/api.
 */
import assert from "node:assert/strict";
import pg from "pg";
import {
  createClerkTestClient,
  createSessionTokenCache,
  createStaffUserFixtures,
} from "./clerk-test-helper.mjs";

const API = process.env.STAFF_AUTH_TEST_API_BASE ?? "http://localhost:80/api";
const SECRET = process.env.CLERK_SECRET_KEY;

if (!SECRET) throw new Error("CLERK_SECRET_KEY is required");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

const apiUrl = new URL(API);
if (
  apiUrl.protocol !== "http:" ||
  !["localhost", "127.0.0.1", "::1"].includes(apiUrl.hostname)
) {
  throw new Error("Staff authorization tests require a local HTTP API target");
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const users = [];
const clerk = createClerkTestClient({ secret: SECRET });
const tokenFor = createSessionTokenCache({ clerk });
const staffFixtures = createStaffUserFixtures({
  clerk,
  pool,
  emailPrefix: "staff-auth",
});
let failed = false;

const deniedRoutes = [
  ["GET", "/admin/products"],
  ["POST", "/admin/products"],
  ["PATCH", "/admin/products/-2147483648"],
  ["POST", "/admin/categories"],
  ["PATCH", "/admin/categories/-2147483648"],
  ["POST", "/admin/brands"],
  ["POST", "/admin/models"],
  ["GET", "/admin/customers"],
  ["PATCH", "/admin/customers/-2147483648"],
  ["GET", "/admin/orders"],
  ["PATCH", "/admin/orders/-2147483648"],
];

const readRoutes = [
  "/admin/products?page=1&pageSize=1",
  "/admin/customers",
  "/admin/orders",
];

async function createTestUser(tag, metadata = {}) {
  const email = `staff-auth-${tag}-${crypto.randomUUID().slice(0, 12)}@example.com`;
  const user = await clerk("POST", "/users", {
    email_address: [email],
    password: `Test-${crypto.randomUUID()}`,
    first_name: "StaffAuth",
    last_name: tag,
    skip_password_checks: true,
    ...metadata,
  });
  const result = { email, userId: user.id, sessionId: null };
  users.push(result);
  const session = await clerk("POST", "/sessions", { user_id: user.id });
  result.sessionId = session.id;
  return result;
}

async function api(user, method, path, body) {
  return request(method, path, body, await tokenFor(user.sessionId));
}

async function request(method, path, body, jwt) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
      "Content-Type": "application/json",
    },
    body: body === undefined || method === "GET" || method === "HEAD"
      ? undefined
      : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // Status is the authorization assertion; bodies need not be JSON.
  }
  return { status: res.status, json };
}

async function assertAccess(user, expected, label) {
  const res = await api(user, "GET", "/me/access");
  assert.equal(res.status, 200, `${label} /me/access should return 200`);
  assert.deepEqual(res.json, { isStaff: expected }, `${label} access mismatch`);
}

try {
  const anonymousAccess = await request("GET", "/me/access");
  assert.equal(anonymousAccess.status, 401, "anonymous /me/access should be 401");

  for (const [method, path] of deniedRoutes) {
    const res = await request(method, path, {});
    assert.equal(res.status, 401, `anonymous ${method} ${path} should be 401`);
  }
  console.log("PASS anonymous callers denied on all 11 admin routes");

  const customer = await createTestUser("customer", {
    unsafe_metadata: { role: "admin" },
  });
  const staff = await staffFixtures.create("staff");
  const admin = await staffFixtures.create("admin", "admin");

  await assertAccess(customer, false, "customer with forged unsafeMetadata");
  for (const [method, path] of deniedRoutes) {
    const res = await api(customer, method, path, {});
    assert.equal(res.status, 403, `customer ${method} ${path} should be 403`);
  }
  console.log("PASS ordinary customer denied on all 11 admin routes");

  // A profile body may contain extra forged fields, but it cannot grant access.
  const profile = await api(customer, "PATCH", "/me", {
    companyName: "Temporary authorization test",
    contactName: "Temporary customer",
    defaultShippingAddress: null,
    role: "admin",
    publicMetadata: { role: "admin" },
    unsafeMetadata: { role: "admin" },
  });
  assert.equal(profile.status, 200, "temporary customer profile update should succeed");
  await assertAccess(customer, false, "customer after forged profile body");
  assert.equal(
    (await api(customer, "GET", "/admin/products")).status,
    403,
    "forged profile fields must not grant admin access",
  );
  console.log("PASS unsafe metadata and profile role forgery ignored");

  for (const [user, label] of [[staff, "staff"], [admin, "admin"]]) {
    await assertAccess(user, true, label);
    for (const path of readRoutes) {
      const res = await api(user, "GET", path);
      assert.equal(res.status, 200, `${label} GET ${path} should be allowed`);
    }
  }
  console.log("PASS real temporary staff and admin users can use read routes");

  const tableMaximums = await pool.query(`
    select greatest(
      coalesce((select max(id) from products), 0),
      coalesce((select max(id) from categories), 0),
      coalesce((select max(id) from brands), 0),
      coalesce((select max(id) from device_models), 0),
      coalesce((select max(id) from customers), 0),
      coalesce((select max(id) from orders), 0)
    )::int as maximum
  `);
  const syntheticId = tableMaximums.rows[0].maximum + 1000000;
  assert.ok(syntheticId < 2147483647, "unable to choose a safe synthetic id");
  const syntheticMutation = await api(
    admin,
    "PATCH",
    `/admin/products/${syntheticId}`,
    { name: "authorization guard synthetic target" },
  );
  assert.equal(
    syntheticMutation.status,
    404,
    "authorized synthetic-only mutation should pass the guard without writing",
  );
  console.log("PASS authorized mutation reaches a proven synthetic-only target");

  // Authorization is looked up on every request; removing the role takes
  // effect without recreating the session or waiting for token expiry.
  await clerk("PATCH", `/users/${staff.userId}/metadata`, { public_metadata: { role: "customer" } });
  await assertAccess(staff, false, "revoked staff");
  assert.equal(
    (await api(staff, "GET", "/admin/products")).status,
    403,
    "revoked staff should be denied on the very next admin request",
  );
  console.log("PASS staff revocation is effective on the next request");

  console.log("\nALL STAFF AUTHORIZATION TESTS PASSED");
} catch (error) {
  failed = true;
  console.error("\nSTAFF AUTHORIZATION TEST FAILED:", error);
} finally {
  const clerkIds = users.map((user) => user.userId);
  if (clerkIds.length) {
    try {
      await pool.query("delete from customers where clerk_user_id = any($1)", [clerkIds]);
    } catch (error) {
      failed = true;
      console.error("cleanup: failed to remove temporary customer rows:", error.message);
    }
  }

  for (const user of users) {
    try {
      await clerk("DELETE", `/users/${user.userId}`);
    } catch (error) {
      failed = true;
      console.error(`cleanup: failed to delete temporary Clerk user ${user.userId}:`, error.message);
    }
  }
  try {
    await staffFixtures.cleanup();
  } catch (error) {
    failed = true;
    console.error("cleanup: failed to remove staff fixtures:", error.message);
  }
  await pool.end();
  process.exit(failed ? 1 : 0);
}