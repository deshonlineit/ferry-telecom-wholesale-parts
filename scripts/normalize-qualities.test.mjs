import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { normalizeQualities } from "./normalize-qualities.mjs";

const requireDb = createRequire(new URL("../lib/db/package.json", import.meta.url));
const pg = requireDb("pg");

test("quality cleanup preserves names, grade distinctions and unrelated data; reruns are no-ops", async () => {
  assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required");
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    // Only the temporary fixture table is touched, never the actual catalog.
    await client.query(`CREATE TEMP TABLE products (
      id integer PRIMARY KEY, name text NOT NULL, quality text NOT NULL,
      stock integer NOT NULL DEFAULT 7, price numeric NOT NULL DEFAULT 12.50
    ) ON COMMIT DROP`);

    const fixtures = [
      ["Soft Case iPhone", "Soft Case", "Soft Case iPhone", "Standard"],
      ["hard case iPhone", "Hard Case", "hard case iPhone", "Standard"],
      ["Like PaperFeel iPad", "Like PaperFeel", "Like PaperFeel iPad", "Standard"],
      ["iPhone cover", " soft case ", "iPhone cover - Soft Case", "Standard"],
      ["iPhone cover", "HARD CASE", "iPhone cover - Hard Case", "Standard"],
      ["iPad protector", "like paperfeel", "iPad protector - Like PaperFeel", "Standard"],
      ["KD display", "incell KD", "KD display", "Incell KD"],
      ["GX display", "Hard Oled GX", "GX display", "Hard OLED GX"],
      ["JK display", "Soft Oled JK", "JK display", "Soft OLED JK"],
      ["Display with flex", "Oled with Flex", "Display with flex", "OLED with Flex"],
      ["JK Detect display", "JK Soft Oled Detect", "JK Detect display", "JK Soft OLED Detect"],
      ["RJ Detect display", "RJ Soft Oled Detect", "RJ Detect display", "RJ Soft OLED Detect"],
      ["GX soft display", "Soft Oled GX", "GX soft display", "Soft OLED GX"],
      ["Battery", "Quall Cell", "Quall Cell Battery", "Aftermarket"],
      ["Quall Cell battery", "Quall Cell", "Quall Cell battery", "Aftermarket"],
      ["Duracell battery", "Duracell", "Duracell battery", "Original"],
      ["PanzerGlass protector", "PanzerGlass", "PanzerGlass protector", "Original"],
      ...["Incell JK", "Incell PK", "Incell RJ", "JK Incell Detect",
        "KD Incell Detect", "RJ Incell Detect", "Soft OLED"].map((grade) =>
        ["Display", ` ${grade.toUpperCase()} `, "Display", grade]),
      ...["Standard", "Original", "Aftermarket", "Soft OLED JK", "Incell KD",
        "KD Incell Detect", "Hard OLED GS", "Original IC", "Custom grade"].map((grade) =>
        ["Unchanged product", grade, "Unchanged product", grade]),
    ];
    for (const [i, [name, quality]] of fixtures.entries()) {
      await client.query("INSERT INTO products (id, name, quality) VALUES ($1, $2, $3)", [i, name, quality]);
    }

    assert.deepEqual(await normalizeQualities(client), {
      original: 2, quallCell: 2, productTypes: 6, displayGrades: 14,
    });
    const readProducts = async () => (await client.query("SELECT * FROM products ORDER BY id")).rows;
    const expected = fixtures.map(([, , name, quality], id) => ({
      id, name, quality, stock: 7, price: "12.50",
    }));
    assert.deepEqual(await readProducts(), expected);
    assert.deepEqual(await normalizeQualities(client), {
      original: 0, quallCell: 0, productTypes: 0, displayGrades: 0,
    });
    assert.deepEqual(await readProducts(), expected);
  } finally {
    if (client) {
      await client.query("ROLLBACK");
      client.release();
    }
    await pool.end();
  }
});