import assert from "node:assert/strict";
import pg from "pg";

const CLERK_API = "https://api.clerk.com/v1";
const API = process.env.ISOLATION_TEST_API_BASE ?? "http://localhost:80/api";
const SECRET = process.env.CLERK_SECRET_KEY;
if (!SECRET) throw new Error("CLERK_SECRET_KEY is required");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function clerk(method, path, body) {
  const response = await fetch(`${CLERK_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${SECRET}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    throw new Error(`Clerk ${method} ${path} -> ${response.status}: ${await response.text()}`);
  }
  return response.status === 204 ? null : response.json();
}

async function call(sessionId, method, path, body) {
  const { jwt } = await clerk("POST", `/sessions/${sessionId}/tokens`, {});
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${jwt}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await response.json();
  return { status: response.status, json };
}

const createdUsers = [];
let productId;
let uploadedObjectPath;

async function deleteUploadedObject(objectPath) {
  if (!objectPath || !process.env.PRIVATE_OBJECT_DIR) return;
  const fullPath = `${process.env.PRIVATE_OBJECT_DIR.replace(/\/$/, "")}/${objectPath.replace(/^\/objects\//, "")}`;
  const [, bucketName, ...objectNameParts] = fullPath.split("/");
  const signed = await fetch("http://127.0.0.1:1106/object-storage/signed-object-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      bucket_name: bucketName,
      object_name: objectNameParts.join("/"),
      method: "DELETE",
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    }),
  });
  if (!signed.ok) return;
  const { signed_url: signedUrl } = await signed.json();
  await fetch(signedUrl, { method: "DELETE" });
}

try {
  const legacy = "https://images.example.com/legacy.jpg";
  const { rows: [product] } = await pool.query(
    `INSERT INTO products
       (sku, name, category_id, brand_id, model_id, quality, list_price, stock,
        image_url, images, description, featured)
     SELECT $1, 'Gallery integration fixture', category_id, brand_id, model_id,
            quality, list_price, 1, $2, '[]'::jsonb, 'Gallery integration fixture', false
       FROM products
      ORDER BY id
      LIMIT 1
     RETURNING id`,
    [`GALLERY-TEST-${Date.now()}`, legacy],
  );
  assert.ok(product, "at least one product is required");
  productId = product.id;

  const buyer = await clerk("POST", "/users", {
    email_address: [`gallery-buyer-${Date.now()}@example.com`],
    password: `Test-${crypto.randomUUID()}`,
    skip_password_checks: true,
  });
  createdUsers.push(buyer.id);
  const buyerSession = await clerk("POST", "/sessions", { user_id: buyer.id });

  const staff = await clerk("POST", "/users", {
    email_address: [`gallery-staff-${Date.now()}@example.com`],
    password: `Test-${crypto.randomUUID()}`,
    skip_password_checks: true,
    public_metadata: { role: "staff" },
  });
  createdUsers.push(staff.id);
  const staffSession = await clerk("POST", "/sessions", { user_id: staff.id });

  const fallback = await call(buyerSession.id, "GET", `/products/${productId}`);
  assert.equal(fallback.status, 200);
  assert.deepEqual(fallback.json.images, [legacy]);

  const denied = await call(buyerSession.id, "PUT", `/products/${productId}/image`, {
    imageUrls: [],
  });
  assert.equal(denied.status, 403);

  const badUrl = await call(staffSession.id, "PUT", `/products/${productId}/image`, {
    imageUrl: "not-a-url",
  });
  assert.equal(badUrl.status, 400);

  const missingUpload = await call(staffSession.id, "PUT", `/products/${productId}/image`, {
    imageUrl: "/objects/uploads/does-not-exist",
  });
  assert.equal(missingUpload.status, 400);

  const badUploadType = await call(staffSession.id, "POST", "/storage/uploads/request-url", {
    name: "not-image.txt",
    size: 4,
    contentType: "text/plain",
  });
  assert.equal(badUploadType.status, 400);

  const upload = await call(staffSession.id, "POST", "/storage/uploads/request-url", {
    name: "gallery.png",
    size: 68,
    contentType: "image/png",
  });
  assert.equal(upload.status, 200);
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  );
  const put = await fetch(upload.json.uploadURL, {
    method: "PUT",
    headers: { "Content-Type": "image/png" },
    body: png,
  });
  assert.ok(put.ok, `object upload failed with ${put.status}`);
  uploadedObjectPath = upload.json.objectPath;

  const renderableObjectPath = `/api/storage${upload.json.objectPath}`;
  const deduplicated = await call(staffSession.id, "PUT", `/products/${productId}/image`, {
    imageUrls: [upload.json.objectPath, renderableObjectPath],
  });
  assert.equal(deduplicated.status, 200);
  assert.equal(deduplicated.json.imageUrl, renderableObjectPath);
  assert.deepEqual(deduplicated.json.images, [renderableObjectPath]);

  const returnedObject = await fetch(`${new URL(API).origin}${deduplicated.json.imageUrl}`);
  assert.equal(returnedObject.status, 200, "the exact returned image URL must be renderable");
  const { rows: [stored] } = await pool.query(
    "SELECT image_url, images FROM products WHERE id = $1",
    [productId],
  );
  assert.equal(stored.image_url, renderableObjectPath);
  assert.deepEqual(stored.images, [upload.json.objectPath]);

  const covered = await call(staffSession.id, "PUT", `/products/${productId}/image`, {
    imageUrl: renderableObjectPath,
  });
  assert.equal(covered.status, 200);
  assert.deepEqual(covered.json.images, [renderableObjectPath]);

  const replaced = await call(staffSession.id, "PUT", `/products/${productId}/image`, {
    imageUrls: [legacy, upload.json.objectPath],
  });
  assert.equal(replaced.status, 200);
  assert.equal(replaced.json.imageUrl, legacy);
  assert.deepEqual(replaced.json.images, [legacy, renderableObjectPath]);

  const fullGallery = Array.from({ length: 12 }, (_, index) => `https://images.example.com/photo-${index}.jpg`);
  const full = await call(staffSession.id, "PUT", `/products/${productId}/image`, { imageUrls: fullGallery });
  assert.equal(full.status, 200);
  const overflow = await call(staffSession.id, "PUT", `/products/${productId}/image`, {
    imageUrl: "https://images.example.com/extra-cover.jpg",
  });
  assert.equal(overflow.status, 400);
  const preserved = await call(buyerSession.id, "GET", `/products/${productId}`);
  assert.deepEqual(preserved.json.images, fullGallery, "a full gallery must never silently discard a photo");

  const cleared = await call(staffSession.id, "PUT", `/products/${productId}/image`, {
    imageUrls: [],
  });
  assert.equal(cleared.status, 200);
  assert.equal(cleared.json.imageUrl, null);
  assert.deepEqual(cleared.json.images, []);

  const detail = await call(buyerSession.id, "GET", `/products/${productId}`);
  assert.equal(detail.status, 200);
  assert.deepEqual(detail.json.images, []);
} finally {
  if (productId) await pool.query("DELETE FROM products WHERE id = $1", [productId]);
  await deleteUploadedObject(uploadedObjectPath);
  if (createdUsers.length > 0) {
    await pool.query("DELETE FROM customers WHERE clerk_user_id = ANY($1::text[])", [createdUsers]);
  }
  for (const userId of createdUsers) {
    await clerk("DELETE", `/users/${userId}`);
  }
  await pool.end();
}