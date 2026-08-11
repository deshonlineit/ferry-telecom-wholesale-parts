/**
 * Smartwatch taxonomy test.
 *
 * Verifies the Task-28 decision end to end at the data + search layer:
 *   1. matchCategory routes complete-watch queries ("smartwatch",
 *      "galaxy watch") to `devices`, earbud queries to `audio`, and keeps
 *      repair-part queries ("watch band", "apple watch") on `apple-watch`.
 *   2. The complete Galaxy Watch6 products live in `devices`, and complete
 *      Galaxy Buds remain in `audio`.
 *
 * Requires: DATABASE_URL. Pure unit + DB checks; no API server needed.
 */
import assert from "node:assert/strict";
import pg from "pg";
import { normalize, matchCategory } from "../src/lib/smart-search.ts";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

function cat(q) {
  return matchCategory(normalize(q).split(" ").filter(Boolean))?.slug ?? null;
}

// 1. search-term routing
assert.equal(cat("smartwatch"), "devices", "'smartwatch' should surface complete devices");
assert.equal(cat("samsung smartwatch"), "devices");
assert.equal(cat("galaxy watch"), "devices", "'galaxy watch' should surface complete devices");
assert.equal(cat("earbuds"), "audio", "'earbuds' should stay in audio");
assert.equal(cat("watch band"), "apple-watch", "'watch band' should stay on smartwatch parts");
assert.equal(cat("apple watch"), "apple-watch", "'apple watch' alone stays on parts");
assert.equal(cat("watch battery"), "batteries", "part term wins for part queries");
console.log("search-term routing OK");

// 2. catalog placement
// Complete watches: explicitly labeled "Smartwatch" without any part/accessory keyword
// (mirrors scripts/split-wearables.mjs).
const NOT_DEVICE =
  /case|cover|hoes|screen protector|tempered|glass|lcd|display|battery|accu|flex|housing|back\s?cover|charger|charging|cable|adapter|dock|holder|stand|lens|camera|band|strap|repair|part\b/i;
const { rows: watchRows } = await pool.query(
  `SELECT p.id, p.name, c.slug FROM products p JOIN categories c ON c.id = p.category_id
   WHERE p.name ILIKE '%smartwatch%'`,
);
const watches = watchRows.filter((w) => !NOT_DEVICE.test(w.name));
assert.ok(watches.length >= 4, "expected complete smartwatches in catalog");
for (const w of watches) {
  assert.equal(w.slug, "devices", `product ${w.id} labeled Smartwatch must be in devices`);
}

const { rows: buds } = await pool.query(
  `SELECT p.id, c.slug FROM products p JOIN categories c ON c.id = p.category_id
   WHERE p.name ILIKE 'galaxy buds%'`,
);
assert.ok(buds.length >= 1, "expected Galaxy Buds in catalog");
for (const b of buds) {
  assert.equal(b.slug, "audio", `product ${b.id} (complete earbuds) must stay in audio`);
}

const { rows: devCat } = await pool.query(
  `SELECT name FROM categories WHERE slug = 'devices'`,
);
assert.equal(devCat[0].name, "Phones, Tablets & Watches");

console.log(`catalog placement OK (${watches.length} watches in devices, ${buds.length} buds in audio)`);
await pool.end();
console.log("smartwatch-search test passed");
