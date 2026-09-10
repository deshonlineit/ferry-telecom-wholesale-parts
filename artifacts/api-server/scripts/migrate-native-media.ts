/**
 * Development-only migration of DB-referenced native filesystem media.
 *
 * This intentionally uses the existing image IDs as part of the destination
 * key. It can therefore be stopped and safely resumed without creating a
 * second set of objects.
 */
import fs from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import { ObjectStorageService } from "../src/lib/objectStorage";

type ImageRow = {
  id: number;
  product_id: number;
  url: string;
  variants: Record<string, unknown>;
  original_path: string;
  original_object: string | null;
  media_storage: string;
  mime_type: string | null;
  byte_size: number | null;
};

const nativeRoot = path.resolve(import.meta.dirname, "../../parts-store/native");
const privateRoot = path.resolve(nativeRoot, "storage/private/images");
const publicRoot = path.resolve(nativeRoot, "public/media/products");
const concurrency = readPositiveArg("--concurrency", 4);
const limit = readPositiveArg("--limit", Infinity);
const dryRun = process.argv.includes("--dry-run");

if (process.env.NODE_ENV === "production" || process.env.REPLIT_DEPLOYMENT === "1") {
  throw new Error("Refusing to run native media migration in production.");
}

function readPositiveArg(name: string, fallback: number): number {
  const index = process.argv.indexOf(name);
    const inline = process.argv.find((arg) => arg.startsWith(`${name}=`));
    if (index < 0 && !inline) return fallback;
    const value = Number(inline ? inline.slice(name.length + 1) : process.argv[index + 1]);
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${name} must be a positive integer`);
  return value;
}

function contained(root: string, candidate: string): string {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(candidate);
  if (resolved !== resolvedRoot && !resolved.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error(`Referenced media path escapes native storage: ${candidate}`);
  }
  return resolved;
}

function nativePath(raw: string, root: string): string {
  // Database paths are filesystem-relative, but tolerate a leading slash.
  const value = raw.replace(/^\/+/, "");
  return contained(root, path.resolve(nativeRoot, value));
}

function variantPath(raw: string): string {
  let value = raw;
  try {
    const parsed = new URL(raw, "http://native.invalid");
    value = parsed.pathname;
  } catch {
    // handled by containment check below
  }
  const marker = "/media/products/";
  const index = value.indexOf(marker);
  if (index < 0) throw new Error(`Variant URL is not a native product media URL: ${raw}`);
  return contained(publicRoot, path.resolve(publicRoot, value.slice(index + marker.length)));
}

function originalKey(row: ImageRow, file: string): string {
  const ext = path.extname(file).toLowerCase() || ".bin";
  return `${row.product_id}/image-${row.id}/original${ext}`;
}

function contentType(file: string, fallback?: string | null): string {
  if (fallback) return fallback;
  const ext = path.extname(file).toLowerCase();
  return ext === ".jpg" || ext === ".jpeg" ? "image/jpeg"
    : ext === ".png" ? "image/png"
    : ext === ".webp" ? "image/webp"
    : "application/octet-stream";
}

async function migrateRow(storage: ObjectStorageService, row: ImageRow, pool: pg.Pool): Promise<"skipped" | "migrated"> {
  if (row.media_storage === "object_storage" && row.original_object) return "skipped";
  const originalFile = nativePath(row.original_path, privateRoot);
  const entries = Object.entries(row.variants ?? {});
  const variants: Record<string, string> = {};
  const files: Array<{ file: string }> = [];
  for (const [width, raw] of entries) {
    if (typeof raw !== "string" || raw.length === 0) throw new Error(`Image ${row.id} has an invalid ${width} variant`);
    const file = variantPath(raw);
    files.push({ file });
    variants[width] = `/api/storage/public-objects/native-media/${row.product_id}/image-${row.id}/${path.basename(file)}`;
  }
  if (files.length === 0) throw new Error(`Image ${row.id} has no variants`);
  const originalObject = originalKey(row, originalFile);

  if (dryRun) {
    await fs.access(originalFile);
    for (const item of files) await fs.access(item.file);
    console.log(`[dry-run] image ${row.id}: ${originalFile} + ${files.length} variants`);
    return "migrated";
  }

  const written: Array<{ key: string; visibility: "private" | "public" }> = [];
  try {
    const original = await fs.readFile(originalFile);
    await storage.saveNativeMedia(originalObject, original, contentType(originalFile, row.mime_type), "private");
    written.push({ key: originalObject, visibility: "private" });
    for (const item of files) {
      const bytes = await fs.readFile(item.file);
      const destination = `${row.product_id}/image-${row.id}/${path.basename(item.file)}`;
      await storage.saveNativeMedia(destination, bytes, "image/webp", "public");
      written.push({ key: destination, visibility: "public" });
    }
    const mainUrl = variants["1280"] ?? variants[Object.keys(variants).sort().at(-1)!];
    const client = await pool.connect();
    await client.query("BEGIN");
    try {
      await client.query(
        `UPDATE parts_store.images
         SET media_storage='object_storage', original_object=$1, url=$2, variants=$3::jsonb
         WHERE id=$4 AND media_storage <> 'object_storage'`,
        [originalObject, mainUrl, JSON.stringify(variants), row.id],
      );
      await client.query(
        `UPDATE parts_store.products SET image_url=$1
         WHERE id=$2 AND (image_url='' OR image_url=$3)`,
        [mainUrl, row.product_id, row.url],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    return "migrated";
  } catch (error) {
    await Promise.allSettled(written.map((item) => storage.deleteNativeMedia(item.key, item.visibility)));
    throw error;
  }
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const result = await pool.query<ImageRow>(
      `SELECT id, product_id, url, variants, original_path, original_object,
              media_storage, mime_type, byte_size
         FROM parts_store.images
        WHERE media_storage <> 'object_storage' OR original_object IS NULL
        ORDER BY id
        LIMIT $1`,
      [Number.isFinite(limit) ? limit : 2147483647],
    );
    const storage = new ObjectStorageService();
    let next = 0;
    let completed = 0;
    let migrated = 0;
    let skipped = 0;
    const worker = async (): Promise<void> => {
      while (true) {
            const row = result.rows[next++];
        if (!row) return;
        try {
          const status = await migrateRow(storage, row, pool);
          status === "skipped" ? skipped++ : migrated++;
                completed++;
                console.log(`progress ${completed}/${result.rows.length}: image ${row.id} ${status}`);
        } catch (error) {
          console.error(`image ${row.id} failed:`, error);
          throw error;
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, result.rows.length) }, worker));
    console.log(`Done: ${migrated} migrated, ${skipped} already migrated.`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});