// AI-powered reclassification of the whole catalog into a clean part-type taxonomy.
// Reads every product name, asks the LLM what it actually is, and moves it to the
// right category. Re-runnable; only updates rows whose category actually changes.
// Usage: node scripts/reclassify-products.mjs [--dry-run]
import fs from "node:fs";
import { createRequire } from "node:module";

const requireDb = createRequire(new URL("../lib/db/package.json", import.meta.url).pathname);
const pg = requireDb("pg");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const BASE_URL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
const API_KEY = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
if (!BASE_URL || !API_KEY) throw new Error("AI integration env vars missing");
const DRY_RUN = process.argv.includes("--dry-run");

// ---------- clean taxonomy ----------
const TAXONOMY = [
  ["screens-lcds", "Screens & LCDs", "Replacement display assemblies: LCD, OLED, touchscreens, digitizers for phones and tablets"],
  ["batteries", "Batteries", "Replacement batteries for phones, tablets and wearables"],
  ["back-glass-housings", "Back Glass & Housings", "Back covers, back glass, frames, housings"],
  ["charging-ports", "Charging Ports", "Charging port flex cables, dock connectors, charging boards"],
  ["cameras", "Cameras & Lenses", "Replacement camera modules and camera lens glass"],
  ["small-parts-flex", "Small Parts & Flex", "Internal repair parts: flex cables, buttons, speakers, earpieces, microphones, sensors, SIM trays, vibration motors, antennas, wifi flex, adhesive tape for parts"],
  ["tempered-glass-protection", "Screen Protectors", "Tempered glass and film screen protectors (PanzerGlass etc.)"],
  ["cases-covers", "Cases & Covers", "Phone and tablet cases, covers, sleeves"],
  ["cables-adapters", "Cables & Adapters", "USB/Lightning/HDMI/AUX cables, OTG and audio adapters, hubs"],
  ["chargers-power", "Chargers & Power", "Wall chargers, car chargers, wireless chargers, power banks"],
  ["audio", "Headphones & Audio", "Headphones, earbuds, external speakers"],
  ["tools-adhesives", "Tools & Adhesives", "Repair tools, machines, glue, general adhesives, cleaning supplies"],
  ["apple-watch", "Smartwatch Parts", "Repair parts specifically for smartwatches (Apple Watch, Galaxy Watch)"],
  ["it-multimedia", "IT & Multimedia", "Computer/photo/video gear: card readers, mounts, network, storage, peripherals"],
  ["accessories", "Accessories", "Everything else: styluses, markers, mounts, misc accessories"],
];
const VALID = new Set(TAXONOMY.map((t) => t[0]));

async function ensureCategories() {
  const map = new Map(); // slug -> id
  for (const [slug, name, description] of TAXONOMY) {
    const { rows } = await pool.query(
      `INSERT INTO categories (name, slug, description)
       VALUES ($1, $2, $3)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description
       RETURNING id`,
      [name, slug, description],
    );
    map.set(slug, rows[0].id);
  }
  return map;
}

// ---------- LLM classification ----------
const SYSTEM = `You classify products of a wholesale mobile-repair parts store into exactly one category.
Categories (use the slug):
${TAXONOMY.map(([slug, name, d]) => `- ${slug}: ${name} — ${d}`).join("\n")}

Rules:
- "Screen protector", PanzerGlass, tempered glass => tempered-glass-protection (NOT screens-lcds).
- Only real replacement display assemblies (LCD/OLED/touchscreen/digitizer) => screens-lcds.
- Repair flex cables, buttons, internal speakers/earpieces => small-parts-flex (NOT cables-adapters).
- Consumer cables/adapters/hubs => cables-adapters; chargers & power banks => chargers-power.
- Smartwatch REPAIR parts => apple-watch; smartwatch screen protectors => tempered-glass-protection; smartwatch straps/cases => cases-covers.
Answer with JSON only: {"items":[{"id":<product id>,"cat":"<slug>"}]} — one entry per product, same ids.`;

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
      if (VALID.has(it.cat)) out.set(Number(it.id), it.cat);
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

const CACHE = "scripts/reclassify-cache.tsv";

async function main() {
  const catIds = await ensureCategories();
  const { rows: products } = await pool.query(
    `SELECT p.id, p.name, c.slug AS current FROM products p JOIN categories c ON c.id = p.category_id ORDER BY p.id`,
  );

  // resumable: previously classified ids are cached on disk
  const results = new Map();
  if (fs.existsSync(CACHE)) {
    for (const line of fs.readFileSync(CACHE, "utf8").split("\n")) {
      const [id, cat] = line.split("\t");
      if (id && VALID.has(cat)) results.set(Number(id), cat);
    }
  }
  const todo = products.filter((p) => !results.has(p.id));
  console.log(`classifying ${todo.length} of ${products.length} products (${results.size} cached)…`);

  const BATCH = 40;
  const batches = [];
  for (let i = 0; i < todo.length; i += BATCH) batches.push(todo.slice(i, i + BATCH));

  const cacheStream = fs.createWriteStream(CACHE, { flags: "a" });
  const CONCURRENCY = 3;
  let done = 0;
  async function worker() {
    while (batches.length) {
      const batch = batches.shift();
      const res = await classifyBatch(batch);
      for (const [id, cat] of res) {
        results.set(id, cat);
        cacheStream.write(`${id}\t${cat}\n`);
      }
      done += batch.length;
      if (done % 400 < BATCH) console.log(`…${done}/${todo.length}`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  cacheStream.end();

  // apply
  let changed = 0, missing = 0;
  const report = [];
  for (const p of products) {
    const cat = results.get(p.id);
    if (!cat) { missing++; continue; }
    if (cat !== p.current) {
      changed++;
      report.push(`${p.id}\t${p.current} -> ${cat}\t${p.name}`);
      if (!DRY_RUN) {
        await pool.query(`UPDATE products SET category_id = $1 WHERE id = $2`, [catIds.get(cat), p.id]);
      }
    }
  }
  fs.writeFileSync("scripts/reclassify-report.tsv", report.join("\n"));
  console.log(`done. classified=${results.size} changed=${changed} unclassified=${missing} dryRun=${DRY_RUN}`);

  const { rows: counts } = await pool.query(
    `SELECT c.slug, count(p.id) n FROM categories c LEFT JOIN products p ON p.category_id=c.id GROUP BY c.slug ORDER BY n DESC`,
  );
  console.table(counts);
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
