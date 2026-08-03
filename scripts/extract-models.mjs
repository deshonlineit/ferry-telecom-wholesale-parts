// AI-powered extraction of device brand + model from product names.
// Rebuilds brands/device_models cleanly and links every product to its primary model.
// Resumable via scripts/extract-models-cache.tsv. Usage: node scripts/extract-models.mjs [--dry-run]
import fs from "node:fs";
import { createRequire } from "node:module";

const requireDb = createRequire(new URL("../lib/db/package.json", import.meta.url).pathname);
const pg = requireDb("pg");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const BASE_URL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
const API_KEY = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
if (!BASE_URL || !API_KEY) throw new Error("AI integration env vars missing");
const DRY_RUN = process.argv.includes("--dry-run");

const BRANDS = ["Apple", "Samsung", "Google", "Huawei", "Xiaomi", "Oppo", "OnePlus", "Motorola", "Sony", "Nokia", "Honor", "Garmin", "Universal"];

const SYSTEM = `You extract the device brand and model a product is FOR, from wholesale mobile-repair product names.

Rules:
- brand must be one of: ${BRANDS.join(", ")}. The device brand the part FITS, not the manufacturer of the accessory (a Baseus charger for any phone => Universal; a PanzerGlass protector for iPhone 15 => Apple).
- model: canonical device model name, normalized:
  - "iPhone 14 Pro Max", "iPhone SE (2022)", "iPad Pro 12.9 (2017)", "iPad Air 4", "iPad Mini 6", "Apple Watch Series 9 45mm" -> "Apple Watch Series 9", "MacBook Pro 15", "AirPods Pro 2"
  - "Galaxy S23 Ultra", "Galaxy A54", "Galaxy Z Flip 5", "Galaxy Tab S9", "Galaxy Watch 6", "Galaxy Note 20"
  - "Pixel 8 Pro", "Redmi Note 12", "P30 Pro", etc.
- If the product fits MULTIPLE models, use the FIRST/most prominent one.
- If not model-specific (generic cable, tool, marker, universal charger): brand "Universal", model null.
- Do not include colors, capacities, model codes (SM-..., A2338) or quality grades in the model.
Answer with JSON only: {"items":[{"id":<product id>,"brand":"<brand>","model":"<model or null>"}]}`;

async function classifyBatch(items, attempt = 0) {
  const user = items.map((p) => `${p.id}\t${p.name}`).join("\n");
  try {
    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        model: "gpt-5.6-luna",
        max_completion_tokens: 8192,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: user },
        ],
      }),
    });
    if (res.status === 429) {
      const retryAfter = Number(res.headers.get("retry-after")) || 15;
      await res.text();
      await new Promise((r) => setTimeout(r, (retryAfter + 1) * 1000));
      throw new Error("rate limited");
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    const parsed = JSON.parse(data.choices[0].message.content);
    const out = new Map();
    for (const it of parsed.items ?? []) {
      if (!BRANDS.includes(it.brand)) continue;
      const model = typeof it.model === "string" && it.model.trim() ? it.model.trim() : null;
      out.set(Number(it.id), { brand: it.brand, model });
    }
    return out;
  } catch (err) {
    if (attempt >= 8) throw err;
    const wait = Math.min(2000 * 2 ** attempt, 30000);
    console.error(`batch failed (${err.message}), retry in ${wait}ms`);
    await new Promise((r) => setTimeout(r, wait));
    return classifyBatch(items, attempt + 1);
  }
}

const CACHE = "scripts/extract-models-cache.tsv";

async function main() {
  const { rows: products } = await pool.query(`SELECT id, name FROM products ORDER BY id`);

  const results = new Map();
  if (fs.existsSync(CACHE)) {
    for (const line of fs.readFileSync(CACHE, "utf8").split("\n")) {
      const [id, brand, model] = line.split("\t");
      if (id && BRANDS.includes(brand)) results.set(Number(id), { brand, model: model || null });
    }
  }
  const todo = products.filter((p) => !results.has(p.id));
  console.log(`extracting models for ${todo.length} of ${products.length} products (${results.size} cached)…`);

  const BATCH = 40;
  const batches = [];
  for (let i = 0; i < todo.length; i += BATCH) batches.push(todo.slice(i, i + BATCH));

  const cacheStream = fs.createWriteStream(CACHE, { flags: "a" });
  let done = 0;
  async function worker() {
    while (batches.length) {
      const batch = batches.shift();
      const res = await classifyBatch(batch);
      for (const [id, v] of res) {
        results.set(id, v);
        cacheStream.write(`${id}\t${v.brand}\t${v.model ?? ""}\n`);
      }
      done += batch.length;
      if (done % 400 < BATCH) console.log(`…${done}/${todo.length}`);
    }
  }
  await Promise.all(Array.from({ length: 3 }, worker));
  cacheStream.end();

  if (DRY_RUN) {
    // report model histogram
    const hist = new Map();
    for (const v of results.values()) {
      const key = `${v.brand} / ${v.model ?? "(none)"}`;
      hist.set(key, (hist.get(key) ?? 0) + 1);
    }
    const sorted = [...hist.entries()].sort((a, b) => b[1] - a[1]);
    fs.writeFileSync("scripts/extract-models-hist.tsv", sorted.map(([k, n]) => `${n}\t${k}`).join("\n"));
    console.log(`dry run: ${results.size} classified, ${hist.size} distinct brand/model pairs (hist in scripts/extract-models-hist.tsv)`);
    console.log(sorted.slice(0, 25).map(([k, n]) => `${n}\t${k}`).join("\n"));
    await pool.end();
    return;
  }

  // ---------- apply ----------
  // brands
  const brandIds = new Map();
  for (const b of BRANDS) {
    const { rows } = await pool.query(
      `INSERT INTO brands (name) VALUES ($1)
       ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
      [b],
    );
    brandIds.set(b, rows[0].id);
  }

  // models: only keep models with >= 3 products to avoid one-off noise
  const modelCounts = new Map();
  for (const v of results.values()) {
    if (!v.model) continue;
    const key = `${v.brand}\u0000${v.model}`;
    modelCounts.set(key, (modelCounts.get(key) ?? 0) + 1);
  }
  const modelIds = new Map();
  for (const [key, n] of modelCounts) {
    if (n < 3) continue;
    const [brand, model] = key.split("\u0000");
    const { rows } = await pool.query(
      `INSERT INTO device_models (brand_id, name)
       VALUES ($1, $2)
       ON CONFLICT (brand_id, name) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
      [brandIds.get(brand), model],
    );
    modelIds.set(key, rows[0].id);
  }
  console.log(`kept ${modelIds.size} models (>=3 products)`);

  // products
  let updated = 0;
  for (const p of products) {
    const v = results.get(p.id);
    if (!v) continue;
    const mid = v.model ? (modelIds.get(`${v.brand}\u0000${v.model}`) ?? null) : null;
    await pool.query(`UPDATE products SET brand_id = $1, model_id = $2 WHERE id = $3`, [brandIds.get(v.brand), mid, p.id]);
    updated++;
  }
  console.log(`updated ${updated} products`);

  // delete now-unreferenced junk models and empty brands
  const del = await pool.query(
    `DELETE FROM device_models m WHERE NOT EXISTS (SELECT 1 FROM products p WHERE p.model_id = m.id)`,
  );
  console.log(`deleted ${del.rowCount} unused models`);
  const delB = await pool.query(
    `DELETE FROM brands b WHERE NOT EXISTS (SELECT 1 FROM products p WHERE p.brand_id = b.id)
       AND NOT EXISTS (SELECT 1 FROM device_models m WHERE m.brand_id = b.id)`,
  );
  console.log(`deleted ${delB.rowCount} empty brands`);

  const { rows: counts } = await pool.query(
    `SELECT b.name, count(DISTINCT m.id) models, count(p.id) products
     FROM brands b LEFT JOIN device_models m ON m.brand_id=b.id LEFT JOIN products p ON p.brand_id=b.id
     GROUP BY b.name ORDER BY products DESC`,
  );
  console.table(counts);
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
