import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

let directory;
let policy;
const originalAllowList = process.env.STAFF_USER_IDS;

before(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "staff-policy-"));
  const outfile = path.join(directory, "policy.mjs");
  await build({
    entryPoints: [new URL("../src/middlewares/requireStaff.ts", import.meta.url).pathname],
    outfile,
    bundle: true,
    platform: "node",
    format: "esm",
    plugins: [{
      name: "clerk-policy-stub",
      setup(builder) {
        builder.onResolve({ filter: /^@clerk\/express$/ }, () => ({
          path: "clerk-stub",
          namespace: "staff-test",
        }));
        builder.onLoad({ filter: /.*/, namespace: "staff-test" }, () => ({
          loader: "js",
          contents: `
            export const clerkClient = {
              users: {
                getUser: async (id) => {
                  const state = globalThis.__staffPolicyState;
                  if (state.providerError) throw state.providerError;
                  return { publicMetadata: { role: state.roles[id] } };
                }
              }
            };
            export const getAuth = (req) => ({ userId: req.testUserId ?? null });
          `,
        }));
      },
    }],
  });
  policy = await import(pathToFileURL(outfile).href);
});

after(async () => {
  if (originalAllowList === undefined) delete process.env.STAFF_USER_IDS;
  else process.env.STAFF_USER_IDS = originalAllowList;
  delete globalThis.__staffPolicyState;
  await rm(directory, { recursive: true, force: true });
});

function state(roles = {}, providerError = null) {
  globalThis.__staffPolicyState = { roles, providerError };
  delete process.env.STAFF_USER_IDS;
}

function invoke(userId) {
  const result = { status: null, body: null, next: false, headers: {} };
  const req = { testUserId: userId, log: { error() {} } };
  const res = {
    setHeader(name, value) {
      result.headers[name] = value;
    },
    status(code) {
      result.status = code;
      return this;
    },
    json(body) {
      result.body = body;
      return this;
    },
  };
  return policy.requireStaff(req, res, () => {
    result.next = true;
  }).then(() => result);
}

test("allowlist is exact, trimmed, and bypasses the provider", async () => {
  state({}, new Error("provider must not be called"));
  process.env.STAFF_USER_IDS = " other-user, allowed-user ";
  assert.equal((await invoke("allowed-user")).next, true);
  assert.equal((await invoke("allowed")).status, 403);
});

test("server publicMetadata staff and admin roles are allowed", async () => {
  state({ a: "staff", b: "admin" });
  assert.equal((await invoke("a")).next, true);
  assert.equal((await invoke("b")).next, true);
});

test("missing and untrusted roles are denied", async () => {
  state({ customer: "customer" });
  assert.equal((await invoke("missing")).status, 403);
  assert.equal((await invoke("customer")).status, 403);
});

test("anonymous request is 401 without a provider lookup", async () => {
  state({}, new Error("provider must not be called"));
  const result = await invoke(null);
  assert.equal(result.status, 401);
  assert.deepEqual(result.body, { error: "Unauthorized" });
  assert.equal(result.headers["Cache-Control"], "private, no-store");
});

test("provider failure fails closed", async () => {
  state({}, new Error("temporary provider failure"));
  const result = await invoke("user");
  assert.equal(result.status, 403);
  assert.equal(result.next, false);
  assert.deepEqual(result.body, { error: "Staff access required" });
});