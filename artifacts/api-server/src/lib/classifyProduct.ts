// AI product classification into the clean part-type taxonomy.
// Shares taxonomy + prompt with scripts/reclassify-products.mjs — keep them in sync.
import { eq } from "drizzle-orm";
import { db, categoriesTable } from "@workspace/db";
import { setTimeout as sleep } from "node:timers/promises";

export const TAXONOMY: Array<[slug: string, name: string, description: string]> = [
  ["screens-lcds", "Screens & LCDs", "Replacement display assemblies: LCD, OLED, touchscreens, digitizers for phones and tablets"],
  ["batteries", "Batteries", "Replacement batteries for phones, tablets and wearables"],
  ["back-glass-housings", "Back Glass & Housings", "Back covers, back glass, frames, housings"],
  ["charging-ports", "Charging Ports", "Charging port flex cables, dock connectors, charging boards"],
  ["cameras", "Cameras & Lenses", "Replacement camera modules and camera lens glass"],
  ["small-parts-flex", "Small Parts & Flex", "Internal repair parts: flex cables, buttons, speakers, earpieces, microphones, sensors, SIM trays, vibration motors, antennas, wifi flex, adhesive tape for parts"],
  ["tempered-glass-protection", "Screen Protectors", "Tempered glass and film screen protectors (PanzerGlass etc.)"],
  ["cases-covers", "Cases & Covers", "Phone and tablet cases, covers, sleeves"],
  ["cables-adapters", "Cables & Adapters", "USB/Lightning/HDMI/AUX cables, OTG and audio adapters, hubs"],
  ["chargers-power", "Chargers & Power", "Wall chargers, car chargers, wireless chargers, power banks"],
  ["audio", "Headphones & Audio", "Headphones, earbuds, external speakers"],
  ["tools-adhesives", "Tools & Adhesives", "Repair tools, machines, glue, general adhesives, cleaning supplies"],
  ["apple-watch", "Smartwatch Parts", "Repair parts specifically for smartwatches (Apple Watch, Galaxy Watch)"],
  ["photo-video", "Photo & Video Gear", "Photo/video studio gear: camera rigs, cages, mounts, tripods, flashes, softboxes, studio lighting (SmallRig, Godox, Ulanzi, Puluz)"],
  ["it-multimedia", "IT & Multimedia", "Computer gear: card readers, network, storage, keyboards, peripherals, smart home"],
  ["devices", "Phones, Tablets & Watches", "Complete devices: whole smartphones, tablets and smartwatches (e.g. Galaxy Tab S9 256GB, Galaxy Z Fold5, Galaxy Watch6 44mm) — not parts or accessories"],
  ["accessories", "Accessories", "Everything else: styluses, markers, mounts, misc accessories"],
];

const VALID = new Set(TAXONOMY.map((t) => t[0]));

const SYSTEM = `You classify products of a wholesale mobile-repair parts store into exactly one category.
Categories (use the slug):
${TAXONOMY.map(([slug, name, d]) => `- ${slug}: ${name} — ${d}`).join("\n")}

Rules:
- "Screen protector", PanzerGlass, tempered glass => tempered-glass-protection (NOT screens-lcds).
- Only real replacement display assemblies (LCD/OLED/touchscreen/digitizer) => screens-lcds.
- Repair flex cables, buttons, internal speakers/earpieces => small-parts-flex (NOT cables-adapters).
- Consumer cables/adapters/hubs => cables-adapters; chargers & power banks => chargers-power.
- Smartwatch REPAIR parts => apple-watch; smartwatch screen protectors => tempered-glass-protection; smartwatch straps/cases => cases-covers.
- Complete phones/tablets/smartwatches (a whole device, e.g. "Galaxy Tab S9 256GB", "Galaxy Watch6 44mm Smartwatch") => devices (NOT accessories, NOT apple-watch).
- Complete earbuds/headphones (e.g. "Galaxy Buds 3 Pro") => audio.
Answer with JSON only: {"items":[{"id":<product id>,"cat":"<slug>"}]} — one entry per product, same ids.`;

export type ClassificationItem = { id: number; name: string };

/** Reject incomplete, duplicated or invented ids rather than guessing categories. */
export function parseClassification(content: string, items: ClassificationItem[]): Map<number, string> {
  const parsed: unknown = JSON.parse(content);
  if (!parsed || typeof parsed !== "object" || !("items" in parsed) || !Array.isArray(parsed.items)) {
    throw new Error("Classification response has no items");
  }
  const expected = new Set(items.map((item) => item.id));
  const result = new Map<number, string>();
  for (const item of parsed.items) {
    if (!item || typeof item !== "object") throw new Error("Invalid classification item");
    const id = typeof item.id === "string" && /^\d+$/.test(item.id) ? Number(item.id) : item.id;
    if (!Number.isSafeInteger(id) || !expected.has(id) || result.has(id) || !VALID.has(item.cat)) {
      throw new Error("Invalid or duplicate classification id/category");
    }
    result.set(id, item.cat);
  }
  if (result.size !== expected.size) throw new Error("Classification response is incomplete");
  return result;
}

export function classificationRetryDelay(retryAfter: string | null, attempt: number, now = Date.now()): number {
  const backoff = Math.min(2000 * 2 ** attempt, 30000);
  if (!retryAfter) return backoff;
  const seconds = Number(retryAfter);
  const requested = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(retryAfter) - now;
  // A very long provider cooldown fails explicitly instead of retrying too early.
  if (requested > 60000) throw new Error("Classification service is busy; retry later");
  return Number.isFinite(requested) ? Math.max(backoff, requested + 1000) : backoff;
}

async function classifyBatch(items: ClassificationItem[], signal: AbortSignal): Promise<Map<number, string>> {
  const baseUrl = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  if (!baseUrl || !apiKey) {
    throw new Error("Automatic classification is not configured");
  }

  let lastErr: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    signal.throwIfAborted();
    let delay = Math.min(2000 * 2 ** attempt, 30000);
    try {
      const res = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        signal: AbortSignal.any([signal, AbortSignal.timeout(60000)]),
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: "gpt-5.6-luna",
          max_completion_tokens: items.length === 1 ? 512 : 8192,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: SYSTEM },
            { role: "user", content: items.map(({ id, name }) => `${id}\t${name.replace(/[\r\n\t]+/g, " ")}`).join("\n") },
          ],
        }),
      });
      if (!res.ok) {
        await res.body?.cancel();
        if (res.status === 429 || res.status === 503) {
          delay = classificationRetryDelay(res.headers.get("retry-after"), attempt);
        } else if (res.status < 500) {
          // Do not expose provider response bodies, which can contain configuration.
          throw new NonRetryableClassificationError(`Classification service returned HTTP ${res.status}`);
        }
        throw new Error(`Classification service returned HTTP ${res.status}`);
      }
      const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const content = data.choices?.[0]?.message?.content;
      if (!content) throw new Error("Classification service returned an empty response");
      return parseClassification(content, items);
    } catch (err) {
      if (signal.aborted || err instanceof NonRetryableClassificationError) throw err;
      if (err instanceof Error && err.message === "Classification service is busy; retry later") throw err;
      lastErr = err;
    }
    if (attempt < 3) await sleep(delay, undefined, { signal });
  }
  throw new Error("Automatic classification failed after retries", { cause: lastErr });
}

class NonRetryableClassificationError extends Error {}

/** Shared single/bulk classifier: batches of 40, at most three requests in flight. */
export async function classifyProductNames(items: ClassificationItem[], signal?: AbortSignal): Promise<Map<number, string>> {
  if (!items.length) return new Map();
  const ids = new Set(items.map((item) => item.id));
  if (ids.size !== items.length || items.some((item) => !Number.isSafeInteger(item.id) || item.id < 1 || !item.name.trim())) {
    throw new Error("Classification requires unique positive ids and product names");
  }
  const controller = new AbortController();
  const activeSignal = signal ? AbortSignal.any([controller.signal, signal]) : controller.signal;
  const result = new Map<number, string>();
  let offset = 0;
  async function worker() {
    try {
      while (offset < items.length) {
        activeSignal.throwIfAborted();
        const batch = items.slice(offset, offset + 40);
        offset += 40;
        const classified = await classifyBatch(batch, activeSignal);
        for (const [id, slug] of classified) result.set(id, slug);
      }
    } catch (err) {
      controller.abort(err);
      throw err;
    }
  }
  // Wait for cancellation of sibling requests too, so a failed import frees capacity.
  const outcomes = await Promise.allSettled(Array.from({ length: Math.min(3, Math.ceil(items.length / 40)) }, worker));
  const failed = outcomes.find((outcome) => outcome.status === "rejected");
  if (failed?.status === "rejected") throw failed.reason;
  return result;
}

export async function classifyProductName(name: string): Promise<string> {
  const result = await classifyProductNames([{ id: 1, name }]);
  return result.get(1)!;
}

/** Classify a product name and resolve the matching category id from the DB. */
export async function classifyToCategoryId(name: string): Promise<number> {
  const slug = await classifyProductName(name);
  const [row] = await db
    .select({ id: categoriesTable.id })
    .from(categoriesTable)
    .where(eq(categoriesTable.slug, slug));
  if (!row) throw new Error(`Category "${slug}" not found in database`);
  return row.id;
}
