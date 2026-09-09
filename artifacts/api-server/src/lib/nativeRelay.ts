import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

export function nativeRelayEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV === "production" && env.LIVE_INTEGRATIONS === "1"
    && env.PICQER_RELAY_ENABLED === "1" && Boolean(env.PICQER_RELAY_SECRET);
}

function signatureValid(raw: Buffer, timestamp: string, eventId: string, supplied: string | undefined, secret: string): boolean {
  if (!/^\d{10,13}$/.test(timestamp) || !eventId || !supplied || !secret) return false;
  const seconds = Number(timestamp.length === 13 ? timestamp.slice(0, -3) : timestamp);
  if (!Number.isFinite(seconds) || Math.abs(Date.now() / 1000 - seconds) > 300) return false;
  const expected = nativeRelaySignature(timestamp, eventId, raw, secret);
  return /^[a-f0-9]{64}$/i.test(supplied) && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(supplied.toLowerCase()));
}

export function nativeRelaySignature(timestamp: string, eventId: string, raw: Buffer, secret: string): string {
  return crypto.createHmac("sha256", secret).update(`v1.${timestamp}.${eventId}.`).update(raw).digest("hex");
}

export function stockEventIsNewer(current: Date | null, incoming: Date): boolean {
  return !Number.isNaN(incoming.valueOf()) && (current === null || incoming.valueOf() > current.valueOf());
}

export function nativeSellableStock(remoteFreeStock: number, unacknowledgedReservations: number): number {
  if (!Number.isInteger(remoteFreeStock) || remoteFreeStock < 0
    || !Number.isInteger(unacknowledgedReservations) || unacknowledgedReservations < 0) throw new Error("Invalid stock inputs");
  return Math.max(0, remoteFreeStock - unacknowledgedReservations);
}

export function reservationRemainsLocal(mappingExists: boolean, reservationAcknowledged: boolean): boolean {
  return !mappingExists || !reservationAcknowledged;
}

export type FulfilmentVersion = { version: number; reservationAcknowledged: boolean };
export function applyFulfilmentVersion(current: FulfilmentVersion | null, incoming: FulfilmentVersion): FulfilmentVersion {
  if (current && incoming.version <= current.version) return current;
  return incoming;
}

function relayAuth(raw: Buffer, timestamp: string, eventId: string, supplied: string | undefined): void {
  if (!nativeRelayEnabled()) throw Object.assign(new Error("Native relay is disabled"), { status: 503 });
  if (!signatureValid(raw, timestamp, eventId, supplied, process.env.PICQER_RELAY_SECRET ?? "")) throw Object.assign(new Error("Relay authentication failed"), { status: 403 });
  if (!/^[A-Za-z0-9._:-]{1,190}$/.test(eventId)) throw Object.assign(new Error("Invalid event id"), { status: 422 });
}

export async function authorizeNativeSignedRead(method: string, path: string, timestamp: string, eventId: string, supplied: string | undefined): Promise<boolean> {
  if (!nativeRelayEnabled()) throw Object.assign(new Error("Native relay is disabled"), { status: 503 });
  if (!signatureValid(Buffer.from(`${method} ${path}`, "utf8"), timestamp, eventId, supplied, process.env.PICQER_RELAY_SECRET ?? "")) {
    throw Object.assign(new Error("Relay authentication failed"), { status: 403 });
  }
  const result = await db.execute(sql`INSERT INTO native_relay_events(event_id,content_hash)
    VALUES(${eventId},${crypto.createHash("sha256").update(`${method} ${path}`).digest("hex")})
    ON CONFLICT(event_id) DO NOTHING RETURNING event_id`);
  return result.rows.length > 0;
}

function fail(message: string): never { throw new Error(message); }
function nonEmpty(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "" || value.length > 500) fail(`Invalid ${field}`);
  return value;
}
function validSnapshot(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("Invalid snapshot");
  const s = value as Record<string, unknown>;
  const id = nonEmpty(s.native_order_id, "native order id");
  if (s.schema_version !== 1) fail("Unsupported snapshot version");
  nonEmpty(s.order_number, "order number");
  const createdAt = nonEmpty(s.order_created_at, "order creation time");
  if (Number.isNaN(Date.parse(createdAt))) fail("Invalid order creation time");
  const currency = nonEmpty(s.currency, "currency");
  if (!/^[A-Z]{3}$/.test(currency)) fail("Invalid currency");
  if (!Number.isSafeInteger(s.total_cents) || Number(s.total_cents) < 0
    || (s.shipping_cents !== undefined && (!Number.isSafeInteger(s.shipping_cents) || Number(s.shipping_cents) < 0))
    || (s.tax_cents !== undefined && (!Number.isSafeInteger(s.tax_cents) || Number(s.tax_cents) < 0))) fail("Invalid total");
  const customer = s.customer;
  const address = s.address;
  if (!customer || typeof customer !== "object" || !address || typeof address !== "object") fail("Invalid customer/address");
  if (!Array.isArray(s.items) || s.items.length < 1 || s.items.length > 500) fail("Invalid items");
  for (const item of s.items) {
    if (!item || typeof item !== "object") fail("Invalid item");
    const row = item as Record<string, unknown>;
    if (typeof row.sku !== "string" || !/^[A-Za-z0-9._-]{1,100}$/.test(row.sku)
      || !Number.isSafeInteger(row.quantity) || Number(row.quantity) < 1 || Number(row.quantity) > 100000
      || !Number.isSafeInteger(row.unit_price_cents) || Number(row.unit_price_cents) < 0
      || !Number.isSafeInteger(row.total_cents) || Number(row.total_cents) !== Number(row.quantity) * Number(row.unit_price_cents)) fail("Invalid item");
  }
  const skus = s.items.map((item) => (item as Record<string, unknown>).sku as string);
  if (new Set(skus).size !== skus.length) fail("Duplicate SKU");
  const itemTotal = s.items.reduce((sum, item) => sum + Number((item as Record<string, unknown>).total_cents), 0);
  const expectedTotal = itemTotal + Number(s.shipping_cents ?? 0) + Number(s.tax_cents ?? 0);
  if (expectedTotal !== Number(s.total_cents)
    || (s.subtotal_cents !== undefined && Number(s.subtotal_cents) !== itemTotal)) fail("Totals do not reconcile");
  return { ...s, native_order_id: id };
}

export async function acceptNativeRelay(raw: Buffer, timestamp: string, eventId: string, supplied: string | undefined): Promise<"accepted" | "duplicate"> {
  relayAuth(raw, timestamp, eventId, supplied);
  let snapshot: Record<string, unknown>;
  try { snapshot = validSnapshot(JSON.parse(raw.toString("utf8"))); } catch (error) {
    throw Object.assign(new Error(error instanceof Error ? error.message : "Invalid snapshot"), { status: 422 });
  }
  const hash = crypto.createHash("sha256").update(raw).digest("hex");
  const orderId = snapshot.native_order_id as string;
  const orderCreatedAt = new Date(snapshot.order_created_at as string);
  return db.transaction(async (tx) => {
    const existing = await tx.execute(sql`SELECT native_order_id,content_hash FROM native_order_snapshots
      WHERE native_order_id=${orderId} OR event_id=${eventId} FOR UPDATE`);
    if (existing.rows.length) {
      const prior = existing.rows[0] as Record<string, unknown>;
      if (prior.content_hash !== hash || prior.native_order_id !== orderId
        || existing.rows.length !== 1) throw Object.assign(new Error("Immutable relay conflict"), { status: 409 });
      return "duplicate";
    }
    await tx.execute(sql`INSERT INTO native_relay_events(event_id,content_hash) VALUES(${eventId},${hash})`);
    await tx.execute(sql`INSERT INTO native_order_snapshots(native_order_id,event_id,content_hash,order_created_at,snapshot)
      VALUES(${orderId},${eventId},${hash},${orderCreatedAt},${JSON.stringify(snapshot)}::jsonb)`);
    await tx.execute(sql`INSERT INTO native_picqer_outbox(native_order_id,event_id,content_hash,order_created_at,snapshot)
      VALUES(${orderId},${eventId},${hash},${orderCreatedAt},${JSON.stringify(snapshot)}::jsonb)`);
    return "accepted";
  });
}

export async function acceptNativeCatalogRelay(raw: Buffer, timestamp: string, eventId: string, supplied: string | undefined): Promise<void> {
  relayAuth(raw, timestamp, eventId, supplied);
  let data: unknown;
  try { data = JSON.parse(raw.toString("utf8")); } catch { throw Object.assign(new Error("Invalid catalog JSON"), { status: 422 }); }
  if (!data || typeof data !== "object" || !Array.isArray((data as Record<string, unknown>).products)) throw Object.assign(new Error("Invalid catalog manifest"), { status: 422 });
  const products = (data as { products: unknown[] }).products;
  const manifest = data as Record<string, unknown>;
  if (!Number.isSafeInteger(manifest.manifest_version) || manifest.complete !== true) throw Object.assign(new Error("Complete manifest version is required"), { status: 422 });
  if (products.length > 10000) throw Object.assign(new Error("Catalog manifest is too large"), { status: 422 });
  const seen = new Set<string>();
  const seenIds = new Set<string>();
  const rows: Array<{ id: string; sku: string; active: boolean }> = [];
  for (const rawProduct of products) {
    if (!rawProduct || typeof rawProduct !== "object") throw Object.assign(new Error("Invalid catalog product"), { status: 422 });
    const product = rawProduct as Record<string, unknown>;
    if (typeof product.native_product_id !== "string" || typeof product.sku !== "string" || !product.sku.trim()
      || typeof product.active !== "boolean") throw Object.assign(new Error("Invalid catalog product"), { status: 422 });
    if (seenIds.has(product.native_product_id)) throw Object.assign(new Error("Duplicate native product id"), { status: 409 });
    seenIds.add(product.native_product_id);
    if (product.active && seen.has(product.sku)) throw Object.assign(new Error("Duplicate active SKU"), { status: 409 });
    if (product.active) seen.add(product.sku);
    rows.push({ id: product.native_product_id, sku: product.sku, active: product.active });
  }
  const hash = crypto.createHash("sha256").update(raw).digest("hex");
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(7142202404)`);
    const eventPrior = await tx.execute(sql`SELECT content_hash FROM native_relay_events WHERE event_id=${eventId} FOR UPDATE`);
    if (eventPrior.rows.length) {
      if ((eventPrior.rows[0] as Record<string, unknown>).content_hash !== hash) throw Object.assign(new Error("Relay event conflict"), { status: 409 });
      return;
    }
    await tx.execute(sql`INSERT INTO native_relay_events(event_id,content_hash) VALUES(${eventId},${hash})`);
    const prior = await tx.execute(sql`SELECT content_hash FROM native_catalog_manifests WHERE manifest_version=${Number(manifest.manifest_version)} FOR UPDATE`);
    if (prior.rows.length) {
      if ((prior.rows[0] as Record<string, unknown>).content_hash !== hash) throw Object.assign(new Error("Catalog manifest conflict"), { status: 409 });
      return;
    }
    const latest = await tx.execute(sql`SELECT manifest_version FROM native_catalog_manifests ORDER BY manifest_version DESC LIMIT 1`);
    if (latest.rows[0] && Number((latest.rows[0] as Record<string, unknown>).manifest_version) >= Number(manifest.manifest_version)) {
      throw Object.assign(new Error("Catalog manifest version is stale"), { status: 409 });
    }
    await tx.execute(sql`INSERT INTO native_catalog_manifests(manifest_version,content_hash) VALUES(${Number(manifest.manifest_version)},${hash})`);
    const ids = rows.map((row) => row.id);
    if (ids.length) {
      await tx.execute(sql`DELETE FROM native_stock_state WHERE native_product_id IN
        (SELECT native_product_id FROM native_catalog_skus WHERE active=true AND native_product_id NOT IN (${sql.join(ids.map((id) => sql`${id}`), sql`,`)}) )`);
      await tx.execute(sql`UPDATE native_catalog_skus SET active=false,picqer_product_id=NULL,updated_at=now()
        WHERE active=true AND native_product_id NOT IN (${sql.join(ids.map((id) => sql`${id}`), sql`,`)})`);
    } else {
      await tx.execute(sql`DELETE FROM native_stock_state`);
      await tx.execute(sql`UPDATE native_catalog_skus SET active=false,picqer_product_id=NULL,updated_at=now() WHERE active=true`);
    }
    for (const row of rows) {
      await tx.execute(sql`DELETE FROM native_stock_state s USING native_catalog_skus c
        WHERE c.native_product_id=${row.id} AND (c.sku<>${row.sku} OR ${!row.active}) AND s.native_product_id=c.native_product_id`);
      await tx.execute(sql`INSERT INTO native_catalog_skus(native_product_id,sku,active,content_hash,updated_at)
        VALUES(${row.id},${row.sku},${row.active},${hash},now())
        ON CONFLICT(native_product_id) DO UPDATE SET sku=EXCLUDED.sku,active=EXCLUDED.active,content_hash=EXCLUDED.content_hash,
          picqer_product_id=CASE WHEN EXCLUDED.active AND native_catalog_skus.sku=EXCLUDED.sku THEN native_catalog_skus.picqer_product_id ELSE NULL END,updated_at=now()`);
    }
  });
}