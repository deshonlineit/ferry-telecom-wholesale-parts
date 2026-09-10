import crypto from "node:crypto";
import { Router, type Request, type Response } from "express";
import express from "express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { ObjectStorageService } from "../lib/objectStorage";
import { authorizeNativeMediaRequest } from "../lib/nativeRelay";

const router = Router();
const storage = new ObjectStorageService();
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_PIXELS = 20_000_000;

function failure(error: unknown, res: Response): void {
  const status = Number((error as { status?: number }).status);
  res.status(status >= 400 && status < 600 ? status : 422).json({ error: error instanceof Error ? error.message : "Media request rejected" });
}

router.post("/native/media/products/:productId/images", expressRaw(), async (req: Request, res: Response) => {
  const raw = req.body as Buffer;
  try {
    const productId = Number(req.params.productId);
    if (!Number.isSafeInteger(productId) || productId < 1 || !Buffer.isBuffer(raw) || raw.length < 1 || raw.length > MAX_BYTES) {
      throw Object.assign(new Error("Image exceeds the 8 MB limit or is malformed"), { status: 422 });
    }
    const eventId = String(req.header("x-ferry-media-event-id") ?? "");
    await authorizeNativeMediaRequest(raw, String(req.header("x-ferry-media-timestamp") ?? ""), eventId, req.header("x-ferry-media-signature") ?? undefined);
    const product = await db.execute(sql`SELECT id FROM parts_store.products WHERE id=${productId} AND active=true`);
    if (!product.rows.length) throw Object.assign(new Error("Product not found"), { status: 404 });
    const { default: sharp } = await import("sharp");
    const image = sharp(raw, { failOn: "error", limitInputPixels: MAX_PIXELS });
    const metadata = await image.metadata();
    if (!metadata.width || !metadata.height || metadata.width * metadata.height > MAX_PIXELS) throw new Error("The image exceeds the 20 million pixel limit");
    if (!["jpeg", "png", "webp"].includes(metadata.format ?? "")) throw Object.assign(new Error("Only actual JPEG, PNG and WebP images are accepted"), { status: 415 });
    const token = crypto.randomBytes(16).toString("hex");
    const originalExt = metadata.format === "jpeg" ? "jpg" : metadata.format;
    const originalObject = `${productId}/${token}/original.${originalExt}`;
    await storage.saveNativeMedia(originalObject, raw, metadata.format === "jpeg" ? "image/jpeg" : `image/${metadata.format}`, "private");
    const variants: Record<string, string> = {};
    const written: string[] = [];
    try {
      for (const width of [320, 640, 1280]) {
        const variant = `${productId}/${token}/${width}w.webp`;
        const bytes = await sharp(raw, { limitInputPixels: MAX_PIXELS }).rotate().resize({ width, withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
        await storage.saveNativeMedia(variant, bytes, "image/webp", "public");
        written.push(variant);
        variants[String(width)] = `/api/storage/public-objects/native-media/${variant}`;
      }
      const result = await db.transaction(async (tx) => {
        const inserted = await tx.execute(sql`INSERT INTO parts_store.images(product_id,url,variants,original_path,original_object,media_storage,width,height,mime_type,byte_size)
          VALUES(${productId},${variants["1280"]},${JSON.stringify(variants)}::jsonb,${originalObject},${originalObject},'object_storage',${metadata.width},${metadata.height},${metadata.format === "jpeg" ? "image/jpeg" : `image/${metadata.format}`},${raw.length}) RETURNING id`);
        await tx.execute(sql`UPDATE parts_store.products SET image_url=CASE WHEN image_url='' THEN ${variants["1280"]} ELSE image_url END WHERE id=${productId}`);
        await tx.execute(sql`UPDATE parts_store.native_media_events SET completed_at=now() WHERE event_id=${eventId} AND completed_at IS NULL`);
        return Number((inserted.rows[0] as { id: number }).id);
      });
      res.status(201).json({ images: [{ id: result, url: variants["1280"], variants }] });
    } catch (error) {
      await Promise.allSettled([storage.deleteNativeMedia(originalObject, "private"), ...written.map((path) => storage.deleteNativeMedia(path, "public"))]);
      throw error;
    }
  } catch (error) { failure(error, res); }
});

router.delete("/native/media/images/:imageId", expressRaw(), async (req: Request, res: Response) => {
  try {
    const raw = req.body as Buffer;
    const eventId = String(req.header("x-ferry-media-event-id") ?? "");
    await authorizeNativeMediaRequest(raw, String(req.header("x-ferry-media-timestamp") ?? ""), eventId, req.header("x-ferry-media-signature") ?? undefined);
    const imageId = Number(req.params.imageId);
    const row = await db.execute(sql`SELECT id,product_id,url,original_object,variants FROM parts_store.images WHERE id=${imageId}`);
    if (!row.rows.length) {
      await db.execute(sql`UPDATE parts_store.native_media_events SET completed_at=now() WHERE event_id=${eventId} AND completed_at IS NULL`);
      res.json({ deleted: true, product_id: 0 });
      return;
    }
    const image = row.rows[0] as Record<string, unknown>;
    const variants = image.variants && typeof image.variants === "object" ? Object.values(image.variants as Record<string, string>) : [];
    await storage.deleteNativeMedia(String(image.original_object ?? ""), "private");
    for (const url of variants) {
      const match = String(url).match(/\/native-media\/(.+)$/);
      if (match) await storage.deleteNativeMedia(match[1], "public");
    }
    await db.transaction(async (tx) => {
      await tx.execute(sql`DELETE FROM parts_store.images WHERE id=${imageId}`);
      await tx.execute(sql`UPDATE parts_store.products SET image_url=COALESCE((SELECT url FROM parts_store.images WHERE product_id=${Number(image.product_id)} ORDER BY id LIMIT 1),'') WHERE id=${Number(image.product_id)} AND image_url=${String(image.url)}`);
      await tx.execute(sql`UPDATE parts_store.native_media_events SET completed_at=now() WHERE event_id=${eventId} AND completed_at IS NULL`);
    });
    res.json({ deleted: true, product_id: Number(image.product_id) });
  } catch (error) { failure(error, res); }
});

function expressRaw() {
  return express.raw({ type: ["image/jpeg", "image/png", "image/webp", "application/octet-stream"], limit: "8mb" });
}
export default router;