// Idempotent data migration: normalize non-quality labels and grade casing.
// Brand-name qualities (e.g. Duracell, PanzerGlass, Ugreen) become "Original" —
// the product name already carries the brand. Quall Cell replacement batteries
// become "Aftermarket" with the brand preserved in the product name.
// Safe to run multiple times.
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
const requireDb = createRequire(new URL("../lib/db/package.json", import.meta.url).pathname);
const pg = requireDb("pg");

const BRAND_QUALITIES = [
  "Duracell", "Baseus", "Spigen", "Sony", "PanzerGlass", "Ugreen", "Goobay",
  "SmallRig", "Dux Ducis", "Godox", "Joyroom", "Energizer", "Varta",
  "Panasonic", "Posca", "Tamiya", "Hama", "Ulanzi", "Orobo", "Vention",
  "Puluz", "Renata", "Maxell", "Camelion", "Bebird", "Torras", "Qianli",
  "Usams", "Nitecore", "Epson", "UAG", "OtterBox", "Carlinkit", "Osram",
  "Luci", "Procell", "Philips", "Xiaomi", "Murata", "Duzzona", "Rayovac",
  "Arenti", "Vava", "Kodak", "Shiseido", "Laneige", "JC",
];

const PRODUCT_TYPES = ["Soft Case", "Hard Case", "Like PaperFeel"];
// Keep distinct suppliers and Detect variants separate; only normalize spelling.
const DISPLAY_GRADES = [
  "Incell JK", "Incell KD", "Incell PK", "Incell RJ",
  "JK Incell Detect", "KD Incell Detect", "RJ Incell Detect",
  "Hard OLED GX", "Soft OLED", "Soft OLED JK", "OLED with Flex",
  "JK Soft OLED Detect", "RJ Soft OLED Detect", "Soft OLED GX",
];

// The caller supplies a single transactional connection, also used by the tests.
export async function normalizeQualities(client) {
  const original = await client.query(
    `UPDATE products SET quality = 'Original' WHERE quality = ANY($1)`,
    [BRAND_QUALITIES],
  );
  const quallCell = await client.query(
    `UPDATE products
       SET name = CASE WHEN name ILIKE '%Quall Cell%' THEN name ELSE 'Quall Cell ' || name END,
           quality = 'Aftermarket'
     WHERE quality = 'Quall Cell'`,
  );

  const productTypes = await client.query(
    `UPDATE products AS p
        SET quality = 'Standard',
            name = CASE
              WHEN strpos(lower(p.name), lower(labels.product_type)) > 0 THEN p.name
              ELSE p.name || ' - ' || labels.product_type
            END
       FROM unnest($1::text[]) AS labels(product_type)
      WHERE lower(btrim(p.quality)) = lower(labels.product_type)`,
    [PRODUCT_TYPES],
  );
  const displayGrades = await client.query(
    `UPDATE products AS p
        SET quality = labels.grade
       FROM unnest($1::text[]) AS labels(grade)
      WHERE lower(btrim(p.quality)) = lower(labels.grade)
        AND p.quality <> labels.grade`,
    [DISPLAY_GRADES],
  );

  return {
    original: original.rowCount,
    quallCell: quallCell.rowCount,
    productTypes: productTypes.rowCount,
    displayGrades: displayGrades.rowCount,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    const counts = await normalizeQualities(client);
    await client.query("COMMIT");
    console.log(
      `normalize-qualities: ${counts.original} brand-name qualities -> Original, ` +
      `${counts.quallCell} Quall Cell -> Aftermarket, ` +
      `${counts.productTypes} product types -> Standard, ` +
      `${counts.displayGrades} display grades standardized`,
    );
  } catch (error) {
    if (client) await client.query("ROLLBACK");
    throw error;
  } finally {
    client?.release();
    await pool.end();
  }
}
