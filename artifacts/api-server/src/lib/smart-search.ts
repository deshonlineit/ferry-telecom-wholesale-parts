// Lightweight natural-language query interpreter for wholesale parts search.
// Matches free-text like "a52 display" or "iphone 13 battery" against known
// brands, device models, and category synonyms.

export const CATEGORY_SYNONYMS: Record<string, string[]> = {
  // slug -> synonyms
  "screens-lcds": [
    "screen",
    "screens",
    "display",
    "displays",
    "lcd",
    "oled",
    "amoled",
    "digitizer",
    "glass front",
    "touchscreen",
  ],
  batteries: ["battery", "batteries", "accu", "akku", "cell"],
  "charging-ports": [
    "charging",
    "charging port",
    "port",
    "ports",
    "dock",
    "usb",
    "usb-c",
    "lightning",
    "connector",
  ],
  cameras: ["camera", "cameras", "lens", "cam"],
  "back-glass-housings": [
    "back",
    "backglass",
    "housing",
    "housings",
    "cover",
    "frame",
    "chassis",
  ],
  "small-parts-flex": [
    "speaker",
    "speakers",
    "earpiece",
    "flex",
    "button",
    "buttons",
    "vibration",
    "taptic",
    "sensor",
    "microphone",
  ],
  "tools-adhesives": [
    "tool",
    "tools",
    "adhesive",
    "glue",
    "tape",
    "toolkit",
    "screwdriver",
    "mat",
    "separator",
  ],
  "tempered-glass-protection": [
    "tempered",
    "tempered glass",
    "protector",
    "protectors",
    "screen protector",
    "privacy filter",
    "protection",
  ],
  "cases-covers": [
    "case",
    "cases",
    "cover",
    "covers",
    "silicone",
    "leather case",
    "book case",
  ],
  "cables-adapters": [
    "cable",
    "cables",
    "adapter",
    "adapters",
    "hub",
    "aux",
    "otg",
  ],
  "chargers-power": [
    "charger",
    "chargers",
    "power adapter",
    "car charger",
    "power bank",
    "powerbank",
    "wireless charger",
  ],
  audio: ["headphones", "earbuds", "headset", "earphones"],
  "apple-watch": ["watch band", "band", "iwatch", "apple watch", "smartwatch"],
  devices: [
    "phone",
    "phones",
    "smartphone",
    "smartphones",
    "tablet",
    "tablets",
    "device",
    "devices",
    "complete device",
  ],
  "photo-video": [
    "tripod",
    "softbox",
    "flash",
    "studio light",
    "camera rig",
    "camera cage",
    "gimbal",
    "smallrig",
    "godox",
  ],
};

export function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Compact form used for model matching: "iPhone 14 Pro" -> "iphone14pro" */
export function compact(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export interface ModelCandidate {
  id: number;
  brandId: number;
  name: string;
}

export interface ModelMatch {
  model: ModelCandidate;
  matchedText: string;
  score: number;
}

/**
 * Find the best model match inside a free-text query.
 * Tries progressively shorter token windows so "galaxy a52 display" matches
 * the model "Galaxy A52" and leaves "display" for category matching.
 */
export function matchModel(
  queryTokens: string[],
  models: ModelCandidate[],
): ModelMatch | null {
  let best: ModelMatch | null = null;

  for (let size = Math.min(4, queryTokens.length); size >= 1; size--) {
    for (let i = 0; i + size <= queryTokens.length; i++) {
      const windowTokens = queryTokens.slice(i, i + size);
      const windowCompact = windowTokens.join("");
      if (windowCompact.length < 2) continue;

      for (const model of models) {
        const modelCompact = compact(model.name);
        let score = 0;
        if (modelCompact === windowCompact) {
          score = 100 + size * 10;
        } else if (
          modelCompact.endsWith(windowCompact) ||
          modelCompact.includes(windowCompact)
        ) {
          // "a52" inside "galaxya52", "13" inside "iphone13" (too weak alone
          // unless it's alphanumeric like a52/s23 or multi-token)
          const isModelish = /^[a-z]+[0-9]+[a-z0-9]*$/.test(windowCompact) ||
            /^[0-9]+[a-z]+$/.test(windowCompact) ||
            size > 1;
          if (isModelish) {
            score = 50 + size * 10 + windowCompact.length;
          }
        }
        if (score > 0 && (!best || score > best.score)) {
          best = { model, matchedText: windowTokens.join(" "), score };
        }
      }
    }
    const found: ModelMatch | null = best;
    if (found && found.score >= 100) break;
  }

  return best;
}

export function matchCategory(
  queryTokens: string[],
): { slug: string; matchedText: string } | null {
  // Try 2-token phrases first ("glass front", "usb c"), then single tokens.
  for (let size = 2; size >= 1; size--) {
    for (let i = 0; i + size <= queryTokens.length; i++) {
      const window = queryTokens.slice(i, i + size).join(" ");
      for (const [slug, synonyms] of Object.entries(CATEGORY_SYNONYMS)) {
        if (synonyms.some((s) => normalize(s) === window)) {
          return { slug, matchedText: window };
        }
      }
    }
  }
  return null;
}
