// Deterministic move of COMPLETE smartwatches (whole wearable devices, e.g.
// "Samsung Galaxy Watch6 - LTE/4G variant - Smartwatch - 44mm") out of
// 'accessories' into 'devices' (Phones, Tablets & Watches).
// Decision: complete smartwatches are devices; smartwatch REPAIR parts stay in
// 'apple-watch' (Smartwatch Parts); complete earbuds stay in 'audio'.
// Re-runnable and auditable: updates the DB, rewrites the reclassify cache so
// reclassify-products.mjs reruns don't revert the move, appends to the report.
// Usage: node scripts/split-wearables.mjs [--dry-run]
import fs from "node:fs";
import { createRequire } from "node:module";

const requireDb = createRequire(new URL("../lib/db/package.json", import.meta.url).pathname);
const pg = requireDb("pg");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const DRY_RUN = process.argv.includes("--dry-run");

const SLUG = "devices";

// A complete smartwatch: explicitly labeled "Smartwatch" or a whole Galaxy
// Watch / Apple Watch model line, WITHOUT any part/accessory keyword.
const WATCH = /\bsmartwatch\b|galaxy\s+watch\s*\d|apple\s+watch\s+(series|se|ultra)/i;
const NOT_DEVICE =
  /case|cover|hoes|screen protector|tempered|glass|lcd|display|battery|accu|flex|housing|back\s?cover|charger|charging|cable|adapter|dock|holder|stand|lens|camera|band|strap|repair|part\b/i;

async function main() {
  const { rows: catRows } = await pool.query(`SELECT id FROM categories WHERE slug = $1`, [SLUG]);
  const catId = catRows[0]?.id;
  if (!catId) throw new Error(`category '${SLUG}' missing — run split-devices.mjs first`);

  const { rows } = await pool.query(
    `SELECT p.id, p.name, c.slug AS current
     FROM products p JOIN categories c ON c.id = p.category_id
     WHERE c.slug IN ('accessories', $1)
     ORDER BY p.id`,
    [SLUG],
  );
  const matched = rows.filter((p) => WATCH.test(p.name) && !NOT_DEVICE.test(p.name));
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

    // Keep the resumable cache consistent so reclassify reruns don't revert.
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

    if (moves.length) {
      fs.appendFileSync(
        "scripts/reclassify-report.tsv",
        "\n" + moves.map((p) => `${p.id}\t${p.current} -> ${SLUG}\t${p.name}`).join("\n") + "\n",
      );
    }
  }

  console.log(`done. moved=${moves.length} dryRun=${DRY_RUN}`);
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
