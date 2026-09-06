import assert from "node:assert/strict";

const DEFAULT_RETRY_MS = 1_000;

export function retryAfterMs(value, now = Date.now()) {
  if (value == null) return DEFAULT_RETRY_MS;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000;
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - now) : DEFAULT_RETRY_MS;
}

export function createClerkTestClient({
  secret,
  apiBase = "https://api.clerk.com/v1",
  fetchImpl = fetch,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now = Date.now,
  max429Retries = 4,
  maxRetryAfterMs = 10_000,
}) {
  assert.ok(secret, "test identity API secret is required");

  return async function clerk(method, path, body) {
    for (let attempt = 0; ; attempt += 1) {
      const res = await fetchImpl(`${apiBase}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${secret}`,
          "Content-Type": "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      });
      if (res.status === 429 && attempt < max429Retries) {
        const delay = Math.min(
          retryAfterMs(res.headers.get("retry-after"), now()),
          maxRetryAfterMs,
        );
        await sleep(delay);
        continue;
      }
      assert.ok(res.ok, `test identity API ${method} ${path} failed (${res.status})`);
      return res.status === 204 ? null : res.json();
    }
  };
}

function jwtExpiryMs(jwt) {
  try {
    const payload = JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString());
    return Number.isFinite(payload.exp) ? payload.exp * 1_000 : 0;
  } catch {
    return 0;
  }
}

export function createSessionTokenCache({
  clerk,
  now = Date.now,
  expirySkewMs = 10_000,
  maxCacheMs = 45_000,
}) {
  const cache = new Map();

  return async function tokenFor(sessionId) {
    const cached = cache.get(sessionId);
    if (cached && cached.expiresAt > now()) return cached.jwt;

    const result = await clerk("POST", `/sessions/${sessionId}/tokens`, {});
    assert.ok(result?.jwt, "test session must return an access token");
    const expiresAt = Math.min(
      jwtExpiryMs(result.jwt) - expirySkewMs,
      now() + maxCacheMs,
    );
    if (expiresAt > now()) cache.set(sessionId, { jwt: result.jwt, expiresAt });
    else cache.delete(sessionId);
    return result.jwt;
  };
}