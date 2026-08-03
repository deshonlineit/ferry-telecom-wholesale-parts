// Idempotent data migration: normalize brand-name "quality" values to real quality grades.
// Brand-name qualities (e.g. Duracell, PanzerGlass, Ugreen) become "Original" —
// the product name already carries the brand. Quall Cell replacement batteries
// become "Aftermarket" with the brand preserved in the product name.
// Safe to run multiple times.
import { createRequire } from "node:module";
const requireDb = createRequire(new URL("../lib/db/package.json", import.meta.url).pathname);
const pg = requireDb("pg");

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const BRAND_QUALITIES = [
  "Duracell", "Baseus", "Spigen", "Sony", "PanzerGlass", "Ugreen", "Goobay",
  "SmallRig", "Dux Ducis", "Godox", "Joyroom", "Energizer", "Varta",
  "Panasonic", "Posca", "Tamiya", "Hama", "Ulanzi", "Orobo", "Vention",
  "Puluz", "Renata", "Maxell", "Camelion", "Bebird", "Torras", "Qianli",
  "Usams", "Nitecore", "Epson", "UAG", "OtterBox", "Carlinkit", "Osram",
  "Luci", "Procell", "Philips", "Xiaomi", "Murata", "Duzzona", "Rayovac",
  "Arenti", "Vava", "Kodak", "Shiseido", "Laneige", "JC",
];

try {
  const original = await pool.query(
    `UPDATE products SET quality = 'Original' WHERE quality = ANY($1)`,
    [BRAND_QUALITIES],
  );
  const quallCell = await pool.query(
    `UPDATE products
       SET name = CASE WHEN name ILIKE '%Quall Cell%' THEN name ELSE 'Quall Cell ' || name END,
           quality = 'Aftermarket'
     WHERE quality = 'Quall Cell'`,
  );
  console.log(
    `normalize-qualities: ${original.rowCount} brand-name qualities -> Original, ` +
      `${quallCell.rowCount} Quall Cell -> Aftermarket`,
  );
} finally {
  await pool.end();
}
