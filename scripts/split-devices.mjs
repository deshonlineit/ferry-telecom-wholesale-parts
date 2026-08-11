// One-off, deterministic split of complete devices (whole phones/tablets)
// out of the 'accessories' catch-all bucket into 'devices'.
// Re-runnable and auditable: matches by name pattern, updates the DB,
// rewrites the reclassify cache so reclassify-products.mjs reruns don't
// revert the move, and appends the moves to reclassify-report.tsv.
// Usage: node scripts/split-devices.mjs [--dry-run]
import fs from "node:fs";
import { createRequire } from "node:module";

const requireDb = createRequire(new URL("../lib/db/package.json", import.meta.url).pathname);
const pg = requireDb("pg");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const DRY_RUN = process.argv.includes("--dry-run");

const SLUG = "devices";
const NAME = "Phones, Tablets & Watches";
const DESC =
  "Complete devices: whole smartphones, tablets and smartwatches (e.g. Galaxy Tab S9 256GB, Galaxy Z Fold5, Galaxy Watch6 44mm) — not parts or accessories";

// A complete device: a phone/tablet model name together with a storage size,
// without any part/accessory keyword. Two guards keep this conservative:
// 1. must look like a device line (Galaxy Tab / Z Fold / Z Flip / A-, S-series, iPhone, iPad)
// 2. must mention a storage capacity (e.g. "128GB", "256 GB")
const DEVICE = /(galaxy\s+(tab|z\s*fold|z\s*flip|[as]\d{2})|iphone\s*\d{1,2}|ipad)/i;
const STORAGE = /\b\d{2,4}\s?gb\b/i;
// Anything with a part/accessory keyword is NOT a complete device.
const NOT_DEVICE =
  /case|cover|hoes|screen protector|tempered|glass|lcd|display|battery|accu|flex|housing|back\s?cover|charger|cable|adapter|dock|lens|camera module|band|strap|refurbish/i;

async function main() {
  let catId = null;
  if (DRY_RUN) {
    const { rows } = await pool.query(`SELECT id FROM categories WHERE slug = $1`, [SLUG]);
    catId = rows[0]?.id ?? null;
  } else {
    const { rows } = await pool.query(
      `INSERT INTO categories (name, slug, description) VALUES ($1, $2, $3)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description
       RETURNING id`,
      [NAME, SLUG, DESC],
    );
    catId = rows[0].id;
  }

  const { rows } = await pool.query(
    `SELECT p.id, p.name, c.slug AS current
     FROM products p JOIN categories c ON c.id = p.category_id
     WHERE c.slug IN ('accessories', $1)
     ORDER BY p.id`,
    [SLUG],
  );
  const matched = rows.filter(
    (p) => DEVICE.test(p.name) && STORAGE.test(p.name) && !NOT_DEVICE.test(p.name),
  );
  const moves = matched.filter((p) => p.current !== SLUG);
  console.log(`matched ${matched.length} of ${rows.length}; ${moves.length} need moving`);
  for (const p of moves) console.log(`  ${p.id}\t${p.current} -> ${SLUG}\t${p.name}`);

  if (!DRY_RUN) {
    if (moves.length) {
      await pool.query(`UPDATE products SET category_id = $1 WHERE id = ANY($2::int[])`, [
        catId,
        moves.map((p) => p.id),
      ]);
    }

    // Keep the resumable cache consistent so reclassify-products.mjs reruns
    // don't revert these products to their old bucket.
    const CACHE = "scripts/reclassify-cache.tsv";
    if (fs.existsSync(CACHE)) {
      const moved = new Set(matched.map((p) => p.id));
      const lines = fs
        .readFileSync(CACHE, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          const id = Number(line.split("\t")[0]);
          return moved.has(id) ? `${id}\t${SLUG}` : line;
        });
      for (const p of matched) if (!lines.some((l) => Number(l.split("\t")[0]) === p.id)) lines.push(`${p.id}\t${SLUG}`);
      fs.writeFileSync(CACHE, lines.join("\n") + "\n");
    }

    // Append to the audit report.
    if (moves.length) {
      fs.appendFileSync(
        "scripts/reclassify-report.tsv",
        "\n" + moves.map((p) => `${p.id}\t${p.current} -> ${SLUG}\t${p.name}`).join("\n") + "\n",
      );
    }
  }

  const { rows: counts } = await pool.query(
    `SELECT c.slug, count(p.id) n FROM categories c LEFT JOIN products p ON p.category_id = c.id
     WHERE c.slug IN ('accessories', $1) GROUP BY c.slug ORDER BY n DESC`,
    [SLUG],
  );
  console.table(counts);
  console.log(`done. moved=${moves.length} dryRun=${DRY_RUN}`);
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
