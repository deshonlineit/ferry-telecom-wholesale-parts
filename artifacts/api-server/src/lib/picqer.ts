import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { picqerEnabled } from "./picqerGate";
import { picqerExactReferenceCandidate, picqerFreeStock, picqerOrderId, picqerOrderPayload } from "./picqerPayload";
import crypto from "node:crypto";
export { picqerEnabled } from "./picqerGate";

/** Explicit opt-in. Tests and non-production runs cannot initiate a request. */
function config(): { baseUrl: string; apiKey: string } {
  if (!picqerEnabled()) throw new Error("Picqer integration is disabled");
  const apiKey = process.env.PICQER_API_KEY ?? "";
  const baseUrl = process.env.PICQER_BASE_URL
    ?? (process.env.PICQER_ACCOUNT ? `https://${process.env.PICQER_ACCOUNT}.picqer.com/api/v1` : "");
  const parsed = new URL(baseUrl);
  if (!apiKey || parsed.protocol !== "https:") throw new Error("Invalid Picqer configuration");
  return { baseUrl: parsed.toString().replace(/\/$/, ""), apiKey };
}

export class PicqerError extends Error {
  constructor(readonly retryable: boolean, message: string) { super(message); }
}

async function request(method: string, path: string, body?: unknown): Promise<unknown> {
  const { baseUrl, apiKey } = config(); // gate before fetch: this is the test network boundary
  // Keep this check immediately adjacent to fetch: no future caller may accidentally
  // move configuration validation away from the production network boundary.
  if (!picqerEnabled()) throw new Error("Picqer integration is disabled");
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/${path.replace(/^\//, "")}`, {
      method, signal: AbortSignal.timeout(15_000),
      headers: { accept: "application/json", "content-type": "application/json",
        "user-agent": "Ferry Telecom Fulfilment/1.0 (+https://ferrytelecom.com)",
        authorization: `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}` },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch { throw new PicqerError(true, "Picqer transport failure"); }
  if (!response.ok) throw new PicqerError(response.status === 408 || response.status === 429 || response.status >= 500,
    `Picqer HTTP ${response.status}`);
  try { return await response.json(); } catch { throw new PicqerError(true, "Picqer returned invalid JSON"); }
}

export async function reconcilePicqerProducts(readOnlyFlag: boolean): Promise<{ matched: number; active: number }> {
  if (!readOnlyFlag || process.env.NODE_ENV !== "production" || process.env.LIVE_INTEGRATIONS !== "1"
    || process.env.PICQER_READONLY_RECONCILE !== "1") throw new Error("Read-only reconciliation is disabled");
  const apiKey = process.env.PICQER_API_KEY ?? "";
  const baseUrl = process.env.PICQER_BASE_URL ?? (process.env.PICQER_ACCOUNT ? `https://${process.env.PICQER_ACCOUNT}.picqer.com/api/v1` : "");
  const parsed = new URL(baseUrl);
  if (!apiKey || parsed.protocol !== "https:") throw new Error("Invalid read-only Picqer configuration");
  const activeRows = await db.execute(sql`SELECT native_product_id,sku FROM native_catalog_skus WHERE active=true ORDER BY sku`);
  const active = new Map((activeRows.rows as Record<string, unknown>[]).map((row) => [String(row.sku), String(row.native_product_id)]));
  const matched = new Map<string, { id: number; freeStock: number }>();
  for (let page = 1; ; page++) {
    const response = await fetch(`${parsed.toString().replace(/\/$/, "")}/products?page=${page}&per_page=100`, {
      method: "GET", signal: AbortSignal.timeout(15_000),
      headers: { accept: "application/json", "user-agent": "Ferry Telecom Fulfilment/1.0 (+https://ferrytelecom.com)", authorization: `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}` },
    });
    if (!response.ok) throw new Error(`Picqer read-only HTTP ${response.status}`);
    const payload = await response.json() as unknown;
    const products: unknown[] = Array.isArray(payload) ? payload : payload && typeof payload === "object" && Array.isArray((payload as Record<string, unknown>).data) ? (payload as Record<string, unknown>).data as unknown[] : [];
    if (!products.length) break;
    for (const item of products) {
      const row = item as Record<string, unknown>;
      const sku = typeof row.productcode === "string" ? row.productcode : "";
      const id = typeof row.idproduct === "number" && Number.isInteger(row.idproduct) ? row.idproduct : null;
      if (sku && id && active.has(sku)) {
        const freeStock = picqerFreeStock(row);
        if (freeStock === null) throw new Error(`Invalid free stock for active SKU ${sku}`);
        if (matched.has(sku)) throw new Error(`Ambiguous active SKU ${sku}`);
        matched.set(sku, { id, freeStock });
      }
    }
    if (products.length < 100) break;
  }
  if (matched.size !== active.size) throw new Error(`Active SKU reconciliation incomplete: ${matched.size}/${active.size}`);
  await db.transaction(async (tx) => {
    for (const [sku, product] of matched) {
      const native = active.get(sku)!;
      await tx.execute(sql`UPDATE native_catalog_skus SET picqer_product_id=${product.id},updated_at=now() WHERE sku=${sku} AND active=true`);
      const hash = crypto.createHash("sha256").update(`${sku}:${product.freeStock}`).digest("hex");
      await tx.execute(sql`INSERT INTO native_stock_state(sku,native_product_id,free_stock,version,content_hash)
        VALUES(${sku},${native},${product.freeStock},1,${hash})
        ON CONFLICT(sku) DO UPDATE SET native_product_id=EXCLUDED.native_product_id,free_stock=EXCLUDED.free_stock,
          version=native_stock_state.version+1,content_hash=EXCLUDED.content_hash,updated_at=now()`);
    }
  });
  return { matched: matched.size, active: active.size };
}

/** Call only from a verified payment/manual-fulfillment transition. */
export async function queuePicqerFulfillmentReadyOrder(orderId: number): Promise<boolean> {
  const rows = await db.execute(sql`
    SELECT o.id,o.order_number,o.status,o.shipping_address,o.notes,
      c.contact_name,c.company_name,c.email,
      jsonb_agg(jsonb_build_object('sku',l.sku,'name',l.name,'quantity',l.quantity,'unit_price',l.unit_price) ORDER BY l.id) AS products
    FROM orders o JOIN customers c ON c.id=o.customer_id JOIN order_lines l ON l.order_id=o.id
    WHERE o.id=${orderId} AND o.status='fulfillment_ready'
    GROUP BY o.id,c.contact_name,c.company_name,c.email`);
  const row = rows.rows[0] as Record<string, unknown> | undefined;
  if (!row) return false; // Order creation/processing is not a payment confirmation.
  const safe = (value: unknown): string => typeof value === "string" ? value : "";
  const reference = `FERRY-${safe(row.order_number)}`;
  const payload = picqerOrderPayload({ orderNumber: safe(row.order_number), shippingAddress: safe(row.shipping_address),
    notes: typeof row.notes === "string" ? row.notes : null, contactName: safe(row.contact_name), companyName: safe(row.company_name),
    email: safe(row.email), products: row.products });
  if (!payload) return false;
  await db.execute(sql`
    INSERT INTO picqer_order_mappings(order_id,foreign_reference) VALUES(${orderId},${reference})
    ON CONFLICT(order_id) DO NOTHING`);
  await db.execute(sql`
    INSERT INTO picqer_outbox(order_id,foreign_reference,payload,status,next_attempt_at)
    VALUES(${orderId},${reference},${JSON.stringify(payload)}::jsonb,'pending',now())
    ON CONFLICT(order_id) DO NOTHING`);
  return true;
}

const redacted = (error: unknown) => String(error instanceof Error ? error.message : "Picqer failure")
  .replace(/(basic|bearer)\s+\S+/gi, "$1 [redacted]").slice(0, 1000);

async function renewLegacyLease(id: number, owner: string): Promise<boolean> {
  const renewed = await db.execute(sql`UPDATE picqer_outbox SET locked_until=now()+interval '1 minute',updated_at=now()
    WHERE id=${id} AND status='processing' AND locked_owner=${owner} AND locked_until>now() RETURNING id`);
  return Boolean(renewed.rows[0]);
}
async function renewNativeLease(id: number, owner: string): Promise<boolean> {
  const renewed = await db.execute(sql`UPDATE native_picqer_outbox SET locked_until=now()+interval '1 minute',updated_at=now()
    WHERE id=${id} AND status='processing' AND locked_owner=${owner} AND locked_until>now() RETURNING id`);
  return Boolean(renewed.rows[0]);
}

export async function processConceptIfNeeded(remoteId: number, status: string, renew: () => Promise<boolean>,
  post: (path: string) => Promise<unknown>): Promise<void> {
  if (["processing", "processed", "completed"].includes(status)) return;
  if (!await renew()) throw new PicqerError(true, "Outbox lease ownership lost");
  await post(`orders/${remoteId}/process`);
}

export async function processPicqerOutbox(limit = 20, dryRun = false): Promise<{ processed: number; succeeded: number; failed: number }> {
  const owner = crypto.randomUUID();
  const jobs = await db.transaction(async (tx) => tx.execute(sql`
    WITH recovered AS (
      UPDATE picqer_outbox SET status='failed', locked_owner=NULL, locked_until=NULL,
        locked_at=NULL, updated_at=now()
      WHERE status='processing' AND (
        (locked_until IS NOT NULL AND locked_until < now())
        OR (locked_until IS NULL AND locked_at IS NOT NULL AND locked_at < now()-interval '15 minutes')
      )
    ), candidates AS (
      SELECT id FROM picqer_outbox
      WHERE status IN ('pending','failed') AND next_attempt_at<=now()
      ORDER BY id LIMIT ${Math.max(1, Math.min(100, limit))}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE picqer_outbox o SET status='processing', attempts=o.attempts+1,
      locked_at=now(), locked_owner=${owner}, locked_until=now()+interval '15 minutes',
      updated_at=now()
    FROM candidates c WHERE o.id=c.id
    RETURNING o.*
  `));
  let succeeded = 0, failed = 0;
  for (const job of jobs.rows as Record<string, unknown>[]) {
    if (dryRun) {
      await db.execute(sql`UPDATE picqer_outbox SET status='pending',locked_owner=NULL,locked_until=NULL,locked_at=NULL,updated_at=now()
        WHERE id=${Number(job.id)} AND locked_owner=${owner}`);
      continue;
    }
    try {
      const found = await request("GET", `orders?search=${encodeURIComponent(String(job.foreign_reference))}`);
      const candidate = picqerExactReferenceCandidate(found, String(job.foreign_reference));
      let created = candidate;
      if (!created) {
        if (!await renewLegacyLease(Number(job.id), owner)) throw new PicqerError(true, "Picqer outbox lease ownership lost");
        created = await request("POST", "orders", job.payload) as Record<string, unknown>;
      }
      const remoteId = picqerOrderId(created);
      if (!remoteId) throw new PicqerError(true, "Picqer response omitted idorder");
      const mappingResult = await db.execute(sql`WITH lease AS (
        SELECT id FROM picqer_outbox WHERE id=${Number(job.id)} AND locked_owner=${owner} AND locked_until>now()
      ) UPDATE picqer_order_mappings SET picqer_order_id=${remoteId},updated_at=now()
        WHERE order_id=${Number(job.order_id)} AND EXISTS(SELECT 1 FROM lease) RETURNING order_id`);
      if (!mappingResult.rows[0]) throw new PicqerError(true, "Picqer outbox lease ownership lost");
      const status = String((created as Record<string, unknown>).status ?? "");
      await processConceptIfNeeded(remoteId, status, () => renewLegacyLease(Number(job.id), owner),
        (path) => request("POST", path));
       const finalized = await db.execute(sql`UPDATE picqer_outbox SET status='succeeded',last_error=NULL,locked_owner=NULL,locked_until=NULL,locked_at=NULL,updated_at=now()
         WHERE id=${Number(job.id)} AND locked_owner=${owner} AND locked_until>now() RETURNING id`);
       if (!finalized.rows[0]) throw new PicqerError(true, "Picqer outbox lease ownership lost before finalization");
      succeeded++;
    } catch (error) {
      const retryable = !(error instanceof PicqerError) || error.retryable;
       const attempts = Number(job.attempts);
      const seconds = retryable ? Math.min(3600, 30 * 2 ** Math.min(6, attempts)) : 86400;
      await db.execute(sql`UPDATE picqer_outbox SET status='failed',last_error=${redacted(error)},
        next_attempt_at=now()+(${seconds} * interval '1 second'),locked_owner=NULL,locked_until=NULL,locked_at=NULL,updated_at=now()
        WHERE id=${Number(job.id)} AND locked_owner=${owner}`);
      failed++;
    }
  }
  return { processed: jobs.rows.length, succeeded, failed };
}

/** Dedicated native path. It never reads shared orders/products and is a
 * one-shot worker; deployment must schedule this externally (no in-process
 * autoscale timer). */
export async function processNativePicqerOutbox(limit = 20, dryRun = false): Promise<{ processed: number; succeeded: number; failed: number }> {
  const cutoffValue = process.env.PICQER_CUTOVER_AT ?? "";
  if (!picqerEnabled() || !cutoffValue) throw new Error("Native Picqer worker is disabled or cutover is missing");
  const cutoff = new Date(cutoffValue);
  if (Number.isNaN(cutoff.valueOf())) throw new Error("Invalid PICQER_CUTOVER_AT");
  const owner = crypto.randomUUID();
  const jobs = await db.transaction(async (tx) => tx.execute(sql`
    WITH recovered AS (
      UPDATE native_picqer_outbox SET status='failed',locked_owner=NULL,locked_until=NULL,updated_at=now()
      WHERE status='processing' AND locked_until IS NOT NULL AND locked_until<now()
    ), blocked AS (
      UPDATE native_picqer_outbox SET status='blocked',last_error='order predates cutover',updated_at=now()
      WHERE status IN ('pending','failed') AND (order_created_at IS NULL OR order_created_at < ${cutoff})
    ), candidates AS (
      SELECT id FROM native_picqer_outbox
      WHERE status IN ('pending','failed') AND next_attempt_at<=now()
        AND order_created_at>=${cutoff}
      ORDER BY id LIMIT ${Math.max(1, Math.min(100, limit))} FOR UPDATE SKIP LOCKED
    )
    UPDATE native_picqer_outbox o SET status='processing',attempts=o.attempts+1,
      locked_owner=${owner},locked_until=now()+interval '15 minutes',updated_at=now()
    FROM candidates c WHERE o.id=c.id RETURNING o.*`));
  let succeeded = 0, failed = 0;
  for (const job of jobs.rows as Record<string, unknown>[]) {
    if (dryRun) {
      await db.execute(sql`UPDATE native_picqer_outbox SET status='pending',locked_owner=NULL,locked_until=NULL WHERE id=${Number(job.id)} AND locked_owner=${owner}`);
      continue;
    }
    try {
      const body = job.snapshot as Record<string, unknown>;
      const reference = `FERRY-${String(body.order_number ?? body.native_order_id)}`;
      const address = body.address;
      const customer = body.customer as Record<string, unknown>;
      if (!address || typeof address !== "object" || !customer || typeof customer !== "object") throw new PicqerError(false, "Native snapshot omitted fulfilment address");
      const products = Array.isArray(body.items) ? body.items.map((item) => {
        const row = item as Record<string, unknown>;
        return { sku: row.sku, name: row.name, quantity: row.quantity,
          unit_price: Number(row.unit_price_cents) / 100 };
      }) : [];
      const payload = picqerOrderPayload({
        orderNumber: String(body.order_number ?? body.native_order_id),
        shippingAddress: JSON.stringify(address),
        notes: typeof body.remarks === "string" ? body.remarks : null,
        contactName: String(customer.name ?? ""), companyName: String(customer.company ?? ""),
        email: String(customer.email ?? ""), products,
      });
      if (!payload) throw new PicqerError(false, "Native snapshot failed Picqer payload validation");
      const items = body.items as Record<string, unknown>[];
      const skus = items.map((item) => String(item.sku));
      const mapped = await db.execute(sql`SELECT sku FROM native_catalog_skus
        WHERE active=true AND picqer_product_id IS NOT NULL AND sku IN (${sql.join(skus.map((sku) => sql`${sku}`), sql`,`)})`);
      if (new Set(mapped.rows.map((row) => String((row as Record<string, unknown>).sku))).size !== new Set(skus).size) {
        throw new PicqerError(false, "Native order contains an unreconciled active SKU");
      }
      const found = await request("GET", `orders?search=${encodeURIComponent(reference)}`);
      const candidate = picqerExactReferenceCandidate(found, reference);
      let created = candidate;
      if (!created) {
        if (!await renewNativeLease(Number(job.id), owner)) throw new PicqerError(true, "Native outbox lease ownership lost");
        created = await request("POST", "orders", payload) as Record<string, unknown>;
      }
      const remoteId = picqerOrderId(created);
      if (!remoteId) throw new PicqerError(true, "Picqer response omitted idorder");
      const mappingResult = await db.execute(sql`WITH lease AS (
        SELECT id FROM native_picqer_outbox WHERE id=${Number(job.id)} AND locked_owner=${owner} AND locked_until>now()
      ), mapping AS (
        INSERT INTO native_picqer_order_mappings(native_order_id,picqer_order_id,foreign_reference)
        SELECT ${String(body.native_order_id)},${remoteId},${reference} FROM lease
        ON CONFLICT(native_order_id) DO UPDATE SET picqer_order_id=EXCLUDED.picqer_order_id,foreign_reference=EXCLUDED.foreign_reference,updated_at=now()
        RETURNING native_order_id
      ) INSERT INTO native_fulfilment_state(native_order_id,picqer_order_id,tracking,status,version)
        SELECT native_order_id,${remoteId},'','processing',1 FROM mapping
        ON CONFLICT(native_order_id) DO NOTHING RETURNING native_order_id`);
      if (!mappingResult.rows[0]) {
        const existing = await db.execute(sql`SELECT native_order_id FROM native_picqer_order_mappings
          WHERE native_order_id=${String(body.native_order_id)} AND picqer_order_id=${remoteId}
          AND EXISTS(SELECT 1 FROM native_picqer_outbox WHERE id=${Number(job.id)} AND locked_owner=${owner} AND locked_until>now())`);
        if (!existing.rows[0]) throw new PicqerError(true, "Native outbox lease ownership lost");
      }
      const remoteStatus = String((created as Record<string, unknown>).status ?? "");
      await processConceptIfNeeded(remoteId, remoteStatus, () => renewNativeLease(Number(job.id), owner),
        (path) => request("POST", path));
      const acknowledged = await db.execute(sql`UPDATE native_fulfilment_state SET
        reservation_acknowledged=true,processed_at=COALESCE(processed_at,now()),
        version=CASE WHEN reservation_acknowledged THEN version ELSE version+1 END,updated_at=now()
        WHERE native_order_id=${String(body.native_order_id)} AND picqer_order_id=${remoteId}
          AND EXISTS(SELECT 1 FROM native_picqer_outbox WHERE id=${Number(job.id)}
            AND locked_owner=${owner} AND locked_until>now())
        RETURNING native_order_id`);
      if (!acknowledged.rows[0]) throw new PicqerError(true, "Native outbox lease ownership lost before acknowledgement");
      const finalized = await db.execute(sql`UPDATE native_picqer_outbox SET status='succeeded',locked_owner=NULL,locked_until=NULL,last_error=NULL,updated_at=now()
        WHERE id=${Number(job.id)} AND locked_owner=${owner} AND locked_until>now() RETURNING id`);
      if (!finalized.rows[0]) throw new PicqerError(true, "Native outbox lease ownership lost before finalization");
      succeeded++;
    } catch (error) {
      await db.execute(sql`UPDATE native_picqer_outbox SET status='failed',locked_owner=NULL,locked_until=NULL,last_error=${redacted(error)},next_attempt_at=now()+interval '5 minutes',updated_at=now()
        WHERE id=${Number(job.id)} AND locked_owner=${owner}`);
      failed++;
    }
  }
  return { processed: jobs.rows.length, succeeded, failed };
}