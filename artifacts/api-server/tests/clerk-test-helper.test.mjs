import assert from "node:assert/strict";
import test from "node:test";
import {
  createClerkTestClient,
  createSessionTokenCache,
  createStaffUserFixtures,
  retryAfterMs,
} from "./clerk-test-helper.mjs";

function response(status, body = null, headers = {}) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: new Headers(headers),
    json: async () => body,
  };
}

function jwt(exp) {
  const payload = Buffer.from(JSON.stringify({ exp })).toString("base64url");
  return `header.${payload}.signature`;
}

test("Retry-After parsing supports seconds, dates, and a safe default", () => {
  const now = Date.parse("2025-01-01T00:00:00Z");
  assert.equal(retryAfterMs("2", now), 2_000);
  assert.equal(retryAfterMs("Wed, 01 Jan 2025 00:00:03 GMT", now), 3_000);
  assert.equal(retryAfterMs("invalid", now), 1_000);
});

test("Clerk test client bounds 429 retries and honors capped Retry-After", async () => {
  const responses = [
    response(429, null, { "retry-after": "20" }),
    response(429),
    response(200, { id: "fixture" }),
  ];
  const delays = [];
  const clerk = createClerkTestClient({
    secret: "test-secret",
    fetchImpl: async () => responses.shift(),
    sleep: async (ms) => delays.push(ms),
    maxRetryAfterMs: 2_000,
  });
  assert.deepEqual(await clerk("POST", "/users", {}), { id: "fixture" });
  assert.deepEqual(delays, [2_000, 1_000]);
});

test("session tokens are reused per session and refreshed before expiry", async () => {
  let now = 1_000_000;
  let calls = 0;
  const tokenFor = createSessionTokenCache({
    now: () => now,
    expirySkewMs: 10_000,
    maxCacheMs: 45_000,
    clerk: async () => ({ jwt: jwt(1_100 + calls++ * 100) }),
  });
  const first = await tokenFor("session-a");
  assert.equal(await tokenFor("session-a"), first);
  assert.equal(calls, 1);
  await tokenFor("session-b");
  assert.equal(calls, 2);
  now += 45_001;
  assert.notEqual(await tokenFor("session-a"), first);
  assert.equal(calls, 3);
});

test("staff fixtures set server-trusted metadata and own cleanup", async () => {
  const calls = [];
  const queries = [];
  const clerk = async (method, path, body) => {
    calls.push({ method, path, body });
    if (method === "POST" && path === "/users") return { id: "user-1" };
    if (method === "POST" && path === "/sessions") return { id: "session-1" };
    return null;
  };
  const fixtures = createStaffUserFixtures({
    clerk,
    pool: { query: async (...args) => queries.push(args) },
    emailPrefix: "fixture",
  });

  assert.deepEqual(await fixtures.create("reader"), {
    email: calls[0].body.email_address[0],
    userId: "user-1",
    sessionId: "session-1",
  });
  assert.deepEqual(calls[0].body.public_metadata, { role: "staff" });
  assert.equal("unsafe_metadata" in calls[0].body, false);

  await fixtures.cleanup();
  assert.deepEqual(queries, [
    ["delete from customers where clerk_user_id = any($1)", [["user-1"]]],
  ]);
  assert.deepEqual(calls.at(-1), {
    method: "DELETE",
    path: "/users/user-1",
    body: undefined,
  });
});

test("staff fixtures reject ordinary customer roles", async () => {
  const fixtures = createStaffUserFixtures({
    clerk: async () => assert.fail("Clerk should not be called"),
    pool: { query: async () => {} },
  });
  await assert.rejects(() => fixtures.create("customer", "customer"));
});