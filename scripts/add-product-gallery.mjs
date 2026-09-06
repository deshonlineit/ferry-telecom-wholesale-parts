import { createRequire } from "node:module";

const requireDb = createRequire(new URL("../lib/db/package.json", import.meta.url).pathname);
const pg = requireDb("pg");

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  await pool.query(
    "ALTER TABLE products ADD COLUMN IF NOT EXISTS images jsonb NOT NULL DEFAULT '[]'::jsonb",
  );
} finally {
  await pool.end();
}