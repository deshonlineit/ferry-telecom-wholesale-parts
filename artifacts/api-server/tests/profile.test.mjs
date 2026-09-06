/**
 * Profile persistence regression tests against the running development API.
 * Run: pnpm --filter @workspace/api-server run test:profile
 *
 * Requires DATABASE_URL, CLERK_SECRET_KEY (test instance), seeded price tiers,
 * and the API behind the local proxy. PROFILE_TEST_API_BASE can override the
 * local API URL. Uses one temporary customer; never touches orders or stock.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";
import {
  createClerkTestClient,
  createSessionTokenCache,
} from "./clerk-test-helper.mjs";

const API = (process.env.PROFILE_TEST_API_BASE ?? "http://localhost:80/api")
  .replace(/\/$/, "");
const CLERK_API = "https://api.clerk.com/v1";
const baseline = {
  companyName: "Profile Test Repairs",
  contactName: "Test Contact",
  defaultShippingAddress: "Teststraat 10\n1000 AA Teststad\nNederland",
};
const update = {
  companyName: "Updated Test Repairs",
  contactName: "Updated Contact",
  defaultShippingAddress: "Testlaan 25\n2000 BB Teststad\nNederland",
};

test("customer profile API persistence", { timeout: 180_000 }, async (t) => {
  assert.notEqual(process.env.NODE_ENV, "production", "development only");
  assert.ok(
    ["localhost", "127.0.0.1", "[::1]"].includes(new URL(API).hostname),
    "profile tests must target a local API, never a published store",
  );
  assert.ok(
    process.env.CLERK_SECRET_KEY?.startsWith("sk_test_"),
    "CLERK_SECRET_KEY must belong to a test instance",
  );
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required");

  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 10_000,
    statement_timeout: 10_000,
  });
  const email = `profile-test-${randomUUID()}@example.com`;
  let userId;
  let sessionId;
  let initial;

  const clerk = createClerkTestClient({
    secret: process.env.CLERK_SECRET_KEY,
    apiBase: CLERK_API,
  });
  const tokenFor = createSessionTokenCache({ clerk });

  async function api(method, body, authenticated = true) {
    const headers = { "Content-Type": "application/json" };
    if (authenticated) {
      const jwt = await tokenFor(sessionId);
      headers.Authorization = `Bearer ${jwt}`;
    }
    const res = await fetch(`${API}/me`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    assert.match(
      res.headers.get("content-type") ?? "",
      /application\/json/,
      `${method} /me must return JSON (${res.status})`,
    );
    return { status: res.status, body: await res.json() };
  }

  async function storedProfile() {
    const { rows } = await pool.query(
      `SELECT company_name AS "companyName", contact_name AS "contactName",
              default_shipping_address AS "defaultShippingAddress"
       FROM customers WHERE clerk_user_id = $1 AND email = $2`,
      [userId, email],
    );
    assert.equal(rows.length, 1, "exactly one test-owned customer must exist");
    return rows[0];
  }

  async function assertSaved(expected) {
    assert.deepEqual(await storedProfile(), expected, "database stores the profile");
    const result = await api("GET");
    assert.equal(result.status, 200);
    assert.deepEqual(
      result.body,
      { ...initial, ...expected },
      "GET /me returns saved fields for checkout and preserves identity/pricing",
    );
  }

  // Register cleanup before any remote fixture creation. Attempt both removals
  // even when setup or assertions fail, and fail the run if cleanup fails.
  t.after(async () => {
    const errors = [];
    if (userId) {
      try {
        await pool.query(
          "DELETE FROM customers WHERE clerk_user_id = $1 AND email = $2",
          [userId, email],
        );
        const { rows } = await pool.query(
          "SELECT count(*)::int AS count FROM customers WHERE clerk_user_id = $1",
          [userId],
        );
        assert.equal(rows[0].count, 0);
      } catch {
        errors.push(new Error("temporary customer cleanup failed"));
      }
      try {
        await clerk("DELETE", `/users/${userId}`);
      } catch {
        errors.push(new Error("temporary test identity cleanup failed"));
      }
    }
    await pool.end();
    if (errors.length) throw new AggregateError(errors, "profile test cleanup failed");
    t.diagnostic("Temporary customer and test identity removed; no stock or orders changed.");
  });

  const user = await clerk("POST", "/users", {
    email_address: [email],
    password: `Test-${randomUUID()}`,
    first_name: "Profile",
    last_name: "Test",
    skip_password_checks: true,
  });
  userId = user.id;
  assert.ok(userId, "test identity must be created");
  const session = await clerk("POST", "/sessions", { user_id: userId });
  sessionId = session.id;
  assert.ok(sessionId, "test session must be created");
  const me = await api("GET");
  assert.equal(me.status, 200, "GET /me provisions the temporary customer");
  assert.equal(me.body.email, email, "fixture resolves to its own identity");
  initial = me.body;

  // Each case starts with a saved address, so clears and rejected writes cannot
  // pass merely because the field was already null. No case depends on another.
  t.beforeEach(async () => {
    const result = await pool.query(
      `UPDATE customers
       SET company_name = $1, contact_name = $2, default_shipping_address = $3
       WHERE clerk_user_id = $4 AND email = $5`,
      [baseline.companyName, baseline.contactName,
        baseline.defaultShippingAddress, userId, email],
    );
    assert.equal(result.rowCount, 1);
  });

  await t.test("GET /me exposes the persisted default address used by checkout", async () => {
    await assertSaved(baseline);
  });

  await t.test("PATCH /me saves and trims a valid profile; GET reads it back", async () => {
    const result = await api("PATCH", {
      companyName: `  ${update.companyName}  `,
      contactName: `\t${update.contactName}  `,
      defaultShippingAddress: `\n ${update.defaultShippingAddress} \n`,
    });
    assert.equal(result.status, 200);
    assert.deepEqual(result.body, { ...initial, ...update });
    await assertSaved(update);
  });

  for (const method of ["GET", "PATCH"]) {
    await t.test(`${method} /me rejects unsigned requests without changing the profile`, async () => {
      const result = await api(method, method === "PATCH" ? update : undefined, false);
      assert.equal(result.status, 401);
      await assertSaved(baseline);
    });
  }

  for (const field of ["companyName", "contactName"]) {
    for (const [label, value] of [
      ["empty", ""],
      ["whitespace-only", " \t\n "],
      ["missing", undefined],
      ["null", null],
    ]) {
      await t.test(`PATCH /me rejects ${label} ${field} without partial writes`, async () => {
        const result = await api("PATCH", { ...update, [field]: value });
        assert.equal(result.status, 400);
        assert.deepEqual(result.body, { error: "Invalid input" });
        await assertSaved(baseline);
      });
    }
  }

  for (const [label, value] of [
    ["null", null],
    ["empty string", ""],
    ["whitespace", " \t\n "],
  ]) {
    await t.test(`PATCH /me clears a saved default address with ${label}`, async () => {
      const expected = { ...baseline, defaultShippingAddress: null };
      const result = await api("PATCH", { ...baseline, defaultShippingAddress: value });
      assert.equal(result.status, 200);
      assert.deepEqual(result.body, { ...initial, ...expected });
      await assertSaved(expected);
    });
  }
});