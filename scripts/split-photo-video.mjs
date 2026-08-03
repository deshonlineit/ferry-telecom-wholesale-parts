// One-off, deterministic split of photo/video studio gear out of the
// 'accessories' and 'it-multimedia' catch-all buckets into 'photo-video'.
// Re-runnable and auditable: matches by keyword/brand, updates the DB,
// rewrites the reclassify cache so reclassify-products.mjs reruns don't
// revert the move, and appends the moves to reclassify-report.tsv.
// Usage: node scripts/split-photo-video.mjs [--dry-run]
import fs from "node:fs";
import { createRequire } from "node:module";

const requireDb = createRequire(new URL("../lib/db/package.json", import.meta.url).pathname);
const pg = requireDb("pg");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const DRY_RUN = process.argv.includes("--dry-run");

const SLUG = "photo-video";
const NAME = "Photo & Video Gear";
const DESC =
  "Photo/video studio gear: camera rigs, cages, mounts, tripods, flashes, softboxes, studio lighting (SmallRig, Godox, Ulanzi, Puluz)";

// Brands and product types that are unambiguously photo/video studio gear.
const MATCH =
  /smallrig|godox|ulanzi|puluz|tripod|softbox|gimbal|cold shoe|light stand|camera cage|lens filter|monopod|flash trigger|speedlite/i;

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
     WHERE c.slug IN ('accessories', 'it-multimedia', $1)
     ORDER BY p.id`,
    [SLUG],
  );
  const matched = rows.filter((p) => MATCH.test(p.name));
  const moves = matched.filter((p) => p.current !== SLUG);
  console.log(`matched ${matched.length} of ${rows.length}; ${moves.length} need moving`);

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
     WHERE c.slug IN ('accessories','it-multimedia',$1) GROUP BY c.slug ORDER BY n DESC`,
    [SLUG],
  );
  console.table(counts);
  console.log(`done. moved=${moves.length} dryRun=${DRY_RUN}`);
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
