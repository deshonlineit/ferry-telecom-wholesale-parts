// AI product classification into the clean part-type taxonomy.
// Shares taxonomy + prompt with scripts/reclassify-products.mjs — keep them in sync.
import { eq } from "drizzle-orm";
import { db, categoriesTable } from "@workspace/db";

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

/**
 * Classify a product name into a taxonomy slug via the OpenAI integration.
 * Throws on configuration/API failure — callers must surface an explicit error.
 */
export async function classifyProductName(name: string): Promise<string> {
  const baseUrl = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  if (!baseUrl || !apiKey) {
    throw new Error("AI integration env vars missing (AI_INTEGRATIONS_OPENAI_*)");
  }

  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: "gpt-5.6-luna",
          max_completion_tokens: 512,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: SYSTEM },
            { role: "user", content: `1\t${name}` },
          ],
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const data = (await res.json()) as { choices: Array<{ message: { content: string } }> };
      const parsed = JSON.parse(data.choices[0].message.content) as {
        items?: Array<{ id: number | string; cat: string }>;
      };
      const cat = parsed.items?.[0]?.cat;
      if (cat && VALID.has(cat)) return cat;
      throw new Error(`classifier returned invalid category: ${JSON.stringify(cat)}`);
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
  throw new Error(`Product classification failed: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`);
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
