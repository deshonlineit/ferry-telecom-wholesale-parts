/**
 * One-off: uploads generated product photos from
 * attached_assets/generated_images/products/<SKU>.jpg to the public object
 * storage path and sets products.image_url accordingly.
 *
 * Run: pnpm --filter @workspace/api-server exec tsx ../../scripts/upload-product-images.ts
 */
import { readdirSync } from "node:fs";
import path from "node:path";
import { Storage } from "@google-cloud/storage";
import { db, productsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

const storage = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
    type: "external_account",
    credential_source: {
      url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
      format: { type: "json", subject_token_field_name: "access_token" },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

async function main() {
  const publicPaths = (process.env.PUBLIC_OBJECT_SEARCH_PATHS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (publicPaths.length === 0) throw new Error("PUBLIC_OBJECT_SEARCH_PATHS not set");
  const publicPath = publicPaths[0]; // e.g. /bucket-id/public
  const [, bucketName, ...rest] = publicPath.split("/");
  const prefix = rest.join("/");

  const dir = path.resolve(import.meta.dirname, "../../../attached_assets/generated_images/products");
  const files = readdirSync(dir).filter((f) => f.endsWith(".jpg"));
  console.log(`Uploading ${files.length} images to gs://${bucketName}/${prefix}/products/`);

  for (const file of files) {
    const sku = path.basename(file, ".jpg");
    const dest = `${prefix}/products/${file}`;
    await storage.bucket(bucketName).upload(path.join(dir, file), {
      destination: dest,
      metadata: { contentType: "image/jpeg", cacheControl: "public, max-age=86400" },
    });
    const imageUrl = `/api/storage/public-objects/products/${file}`;
    const result = await db
      .update(productsTable)
      .set({ imageUrl })
      .where(eq(productsTable.sku, sku))
      .returning({ id: productsTable.id });
    console.log(`${sku}: uploaded, updated ${result.length} row(s)`);
  }
  console.log("Done");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
