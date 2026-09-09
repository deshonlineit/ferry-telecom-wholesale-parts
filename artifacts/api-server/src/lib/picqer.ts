import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { picqerEnabled } from "./picqerGate";
import { picqerExactReferenceCandidate, picqerOrderId, picqerOrderPayload } from "./picqerPayload";
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
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/${path.replace(/^\//, "")}`, {
      method, signal: AbortSignal.timeout(15_000),
      headers: { accept: "application/json", "content-type": "application/json",
        authorization: `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}` },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch { throw new PicqerError(true, "Picqer transport failure"); }
  if (!response.ok) throw new PicqerError(response.status === 408 || response.status === 429 || response.status >= 500,
    `Picqer HTTP ${response.status}`);
  try { return await response.json(); } catch { throw new PicqerError(true, "Picqer returned invalid JSON"); }
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

export async function processPicqerOutbox(limit = 20, dryRun = false): Promise<{ processed: number; succeeded: number; failed: number }> {
  const jobs = await db.execute(sql`SELECT * FROM picqer_outbox WHERE status IN ('pending','failed')
    AND next_attempt_at<=now() ORDER BY id LIMIT ${Math.max(1, Math.min(100, limit))}`);
  let succeeded = 0, failed = 0;
  for (const job of jobs.rows as Record<string, unknown>[]) {
    if (dryRun) continue;
    const claimed = await db.execute(sql`UPDATE picqer_outbox SET status='processing',attempts=attempts+1,locked_at=now(),updated_at=now()
      WHERE id=${Number(job.id)} AND status IN ('pending','failed') RETURNING attempts`);
    if (!claimed.rows[0]) continue;
    try {
      const found = await request("GET", `orders?search=${encodeURIComponent(String(job.foreign_reference))}`);
      const candidate = picqerExactReferenceCandidate(found, String(job.foreign_reference));
      const created = candidate ?? await request("POST", "orders", job.payload);
      const remoteId = picqerOrderId(created);
      if (!remoteId) throw new PicqerError(true, "Picqer response omitted idorder");
      await db.execute(sql`UPDATE picqer_order_mappings SET picqer_order_id=${remoteId},updated_at=now() WHERE order_id=${Number(job.order_id)}`);
      const status = String((created as Record<string, unknown>).status ?? "");
      if (!["processing", "processed", "completed"].includes(status)) await request("POST", `orders/${remoteId}/process`);
      await db.execute(sql`UPDATE picqer_outbox SET status='succeeded',last_error=NULL,updated_at=now() WHERE id=${Number(job.id)}`);
      succeeded++;
    } catch (error) {
      const retryable = !(error instanceof PicqerError) || error.retryable;
      const attempts = Number((claimed.rows[0] as { attempts: number }).attempts);
      const seconds = retryable ? Math.min(3600, 30 * 2 ** Math.min(6, attempts)) : 86400;
      await db.execute(sql`UPDATE picqer_outbox SET status='failed',last_error=${redacted(error)},
        next_attempt_at=now()+(${seconds} * interval '1 second'),updated_at=now() WHERE id=${Number(job.id)}`);
      failed++;
    }
  }
  return { processed: jobs.rows.length, succeeded, failed };
}