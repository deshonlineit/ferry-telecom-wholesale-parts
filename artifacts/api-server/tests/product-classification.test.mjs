import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { build } from "esbuild";

// Bundle with an inert database and test-only transport configuration.
const dir = await mkdtemp(join(tmpdir(), "product-classification-"));
const output = join(dir, "classifier.mjs");
const waits = [];
globalThis.__classificationTestWait = (delay) => { waits.push(delay); return Promise.resolve(); };
await build({
  entryPoints: [fileURLToPath(new URL("../src/lib/classifyProduct.ts", import.meta.url))],
  outfile: output, bundle: true, platform: "node", format: "esm", logLevel: "silent",
  define: {
    "process.env.AI_INTEGRATIONS_OPENAI_BASE_URL": JSON.stringify("https://classification.example.test"),
    "process.env.AI_INTEGRATIONS_OPENAI_API_KEY": JSON.stringify("test-only"),
  },
  plugins: [{
    name: "isolated-classification",
    setup(build) {
      build.onResolve({ filter: /^@workspace\/db$/ }, () => ({ path: "db", namespace: "test" }));
      build.onResolve({ filter: /^node:timers\/promises$/ }, () => ({ path: "timers", namespace: "test" }));
      build.onLoad({ filter: /.*/, namespace: "test" }, ({ path }) => ({
        contents: path === "db"
          ? 'export const db = {}; export const categoriesTable = {};'
          : 'export const setTimeout = (delay) => globalThis.__classificationTestWait(delay);',
      }));
    },
  }],
});
const { classifyProductNames, classifyProductName, parseClassification, classificationRetryDelay } = await import(pathToFileURL(output).href);
const originalFetch = globalThis.fetch;
after(async () => { globalThis.fetch = originalFetch; delete globalThis.__classificationTestWait; await rm(dir, { recursive: true, force: true }); });
beforeEach(() => { waits.length = 0; globalThis.fetch = async () => { throw new Error("Unexpected network request"); }; });
const items = [{ id: 2, name: "Replacement OLED" }, { id: 5, name: "Screen protector" }];
const jsonResponse = (items) => Response.json({ choices: [{ message: { content: JSON.stringify({ items }) } }] });

test("classification validates a complete out-of-order response with numeric string ids", () => {
  const result = parseClassification(JSON.stringify({ items: [{ id: "5", cat: "tempered-glass-protection" }, { id: 2, cat: "screens-lcds" }] }), items);
  assert.equal(result.get(2), "screens-lcds");
  assert.equal(result.get(5), "tempered-glass-protection");
});

test("classification rejects missing, duplicate, invented, malformed ids and unknown categories", () => {
  for (const response of [
    {}, { items: [] }, { items: [{ id: 2, cat: "screens-lcds" }] },
    { items: [{ id: 2, cat: "screens-lcds" }, { id: 2, cat: "batteries" }] },
    { items: [{ id: 2, cat: "screens-lcds" }, { id: 3, cat: "batteries" }] },
    { items: [{ id: 2, cat: "screens-lcds" }, { id: 5, cat: "made-up" }] },
    { items: [{ id: null, cat: "screens-lcds" }, { id: 5, cat: "batteries" }] },
    { items: [null] }, { items: [{ id: "5.0", cat: "batteries" }] },
  ]) assert.throws(() => parseClassification(JSON.stringify(response), items));
  assert.throws(() => parseClassification("not JSON", items));
});

test("81 products use batches 40/40/1 with at most three concurrent requests", async () => {
  let active = 0, peak = 0;
  const sizes = [];
  globalThis.fetch = async (_url, init) => {
    active++; peak = Math.max(peak, active);
    const request = JSON.parse(init.body);
    const input = request.messages[1].content.split("\n");
    sizes.push(input.length);
    assert.ok(init.signal instanceof AbortSignal);
    await new Promise((resolve) => setImmediate(resolve));
    active--;
    return jsonResponse(input.map((line) => ({ id: Number(line.split("\t")[0]), cat: "batteries" })));
  };
  const result = await classifyProductNames(Array.from({ length: 81 }, (_, index) => ({ id: index + 1, name: "Replacement battery" })));
  assert.deepEqual(sizes, [40, 40, 1]);
  assert.equal(peak, 3);
  assert.equal(result.size, 81);
});

test("empty input makes no request and invalid input is rejected before network", async () => {
  assert.equal((await classifyProductNames([])).size, 0);
  for (const list of [[{ id: 0, name: "X" }], [{ id: 1, name: " " }], [{ id: 1, name: "X" }, { id: 1, name: "Y" }]]) {
    await assert.rejects(() => classifyProductNames(list), /unique positive ids/);
  }
});

test("single-product classification reuses the prompt and sanitizes record separators", async () => {
  globalThis.fetch = async (_url, init) => {
    const request = JSON.parse(init.body);
    assert.match(request.messages[0].content, /Complete phones\/tablets\/smartwatches/);
    assert.equal(request.messages[1].content, "1\tOLED replacement screen");
    return jsonResponse([{ id: 1, cat: "screens-lcds" }]);
  };
  assert.equal(await classifyProductName("OLED\nreplacement\tscreen"), "screens-lcds");
});

test("429 retry honors Retry-After before success", async () => {
  let calls = 0;
  globalThis.fetch = async () => ++calls === 1
    ? new Response("", { status: 429, headers: { "retry-after": "3" } })
    : jsonResponse([{ id: 1, cat: "batteries" }]);
  assert.equal(await classifyProductName("Battery"), "batteries");
  assert.equal(calls, 2);
  assert.deepEqual(waits, [4000]);
});

test("invalid classification retries are bounded and never silently fill missing rows", async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; return jsonResponse([]); };
  await assert.rejects(() => classifyProductName("Battery"), /failed after retries/);
  assert.equal(calls, 4);
  assert.deepEqual(waits, [2000, 4000, 8000]);
});

test("non-transient API errors fail immediately without returning provider body", async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; return new Response("private provider diagnostics", { status: 401 }); };
  await assert.rejects(() => classifyProductName("Battery"), (error) => error.message === "Classification service returned HTTP 401");
  assert.equal(calls, 1);
  assert.deepEqual(waits, []);
});

test("Retry-After supports dates and declines overly long cooldowns instead of hammering the service", () => {
  const now = Date.parse("2026-09-06T12:00:00Z");
  assert.equal(classificationRetryDelay("Sun, 06 Sep 2026 12:00:10 GMT", 0, now), 11000);
  assert.equal(classificationRetryDelay("invalid", 2, now), 8000);
  assert.throws(() => classificationRetryDelay("120", 0, now), /retry later/);
});

test("caller cancellation prevents requests", async () => {
  const controller = new AbortController();
  controller.abort(new Error("Cancelled"));
  await assert.rejects(() => classifyProductNames(items, controller.signal), /Cancelled/);
});