// One-off import of the WooCommerce product export into the parts-store catalog.
// Usage: node scripts/import-products.mjs <csv-path>
import fs from "node:fs";
import { createRequire } from "node:module";
import { parse } from "csv-parse/sync";
// pg lives in lib/db's dependency tree
const requireDb = createRequire(new URL("../lib/db/package.json", import.meta.url).pathname);
const pg = requireDb("pg");

const csvPath = process.argv[2];
if (!csvPath) throw new Error("usage: node scripts/import-products.mjs <csv>");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const rows = parse(fs.readFileSync(csvPath), {
  columns: true,
  relax_quotes: true,
  relax_column_count: true,
});

const price = (v) => {
  const n = parseFloat(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
};

const products = rows.filter(
  (r) => r.post_status === "publish" && r.sku &&
    price(r["meta:BigRepairShopCustomerAccount_wholesale_price"]) !== null,
);
console.log("importable products:", products.length);

// ---------- brand ----------
function brandOf(r) {
  const cat = (r["tax:product_cat"] || "").toUpperCase();
  const title = (r.post_title || "").toLowerCase();
  if (cat.includes("APPLE PARTS") || cat.includes("APPLE WATCH") || /iphone|ipad|apple|imac|macbook|airpod|iwatch/.test(title)) return "Apple";
  if (cat.includes("SAMSUNG") || /samsung|galaxy/.test(title)) return "Samsung";
  if (cat.includes("GOOGLE PIXEL") || /pixel/.test(title)) return "Google";
  if (/huawei/.test(title)) return "Huawei";
  if (/xiaomi|redmi|poco/.test(title)) return "Xiaomi";
  if (/oppo/.test(title)) return "Oppo";
  if (/oneplus/.test(title)) return "OnePlus";
  return "Universal";
}

// ---------- category ----------
const CATS = [
  ["Screens & LCDs", /lcd|display|screen|oled|digitizer/i],
  ["Batteries", /batter/i],
  ["Charging Ports", /charging port|dock|charging flex/i],
  ["Cameras", /camera/i],
  ["Back Glass & Housings", /backcover|housing|back glass|frame|chassis|back cover/i],
  ["Tempered Glass & Protection", /tempered|protector|protection|privacy filter|screenprotector/i],
  ["Cases & Covers", /case|cover|book|silicone|leather/i],
  ["Cables & Chargers", /cable|charger|adapter|power|dock station|car charge/i],
  ["Apple Watch", /watch band|band for|iwatch/i],
  ["Small Parts & Flex", /flex|speaker|earpiece|button|sim tray|vibra|taptic|sensor|microphone|antenna|lens|buzzer|home button/i],
  ["Tools & Adhesives", /tool|adhesive|glue|tape|opening|screwdriver|tweezer|separator|machine/i],
];
function categoryOf(r) {
  const basis = `${r["attribute:pa_part-category"] || ""} ${r["attribute:pa_master-filter"] || ""} ${r.post_title || ""}`;
  for (const [name, re] of CATS) if (re.test(basis)) return name;
  const root = (r["tax:product_cat"] || "").split(">")[0].trim();
  if (/accesoires|accessor/i.test(root)) return "Accessories";
  if (/it \+ multimedia|cool gadgets|lamps|toner/i.test(root)) return "IT & Multimedia";
  return "Other Parts";
}

// ---------- model ----------
function modelOf(r) {
  const tag = (r["tax:product_tag"] || "").split("|")[0].trim();
  return tag || null;
}

function imageOf(r) {
  const img = (r.images || "").split("!")[0].trim();
  return img.startsWith("http") ? img : null;
}

function qualityOf(r) {
  const q = (r["attribute:pa_quality"] || "").replace(/&amp;/g, "&").trim();
  return q || "Standard";
}

const clean = (s) => (s || "").replace(/&amp;/g, "&").replace(/<[^>]*>/g, "").trim();

const client = await pool.connect();
try {
  await client.query("BEGIN");

  // upsert reference data
  const catNames = [...new Set(products.map(categoryOf))];
  const catIds = {};
  for (const name of catNames) {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const res = await client.query(
      "INSERT INTO categories (name, slug, description) VALUES ($1,$2,$3) RETURNING id",
      [name, slug, name],
    );
    catIds[name] = res.rows[0].id;
  }

  const brandNames = [...new Set(products.map(brandOf))];
  const brandIds = {};
  for (const name of brandNames) {
    const res = await client.query("INSERT INTO brands (name) VALUES ($1) RETURNING id", [name]);
    brandIds[name] = res.rows[0].id;
  }

  const modelIds = {}; // key: brand|model
  for (const r of products) {
    const m = modelOf(r);
    if (!m) continue;
    const b = brandOf(r);
    const key = `${b}|${m}`;
    if (!modelIds[key]) {
      const res = await client.query(
        "INSERT INTO device_models (brand_id, name) VALUES ($1,$2) RETURNING id",
        [brandIds[b], m],
      );
      modelIds[key] = res.rows[0].id;
    }
  }

  const tiers = (await client.query("SELECT id, name FROM price_tiers")).rows;
  const tierId = (n) => tiers.find((t) => t.name === n).id;
  const TIER_COLS = [
    [tierId("Big Repairshop"), "meta:BigRepairShopCustomerAccount_wholesale_price"],
    [tierId("Wholesale"), "meta:wholesale_customer_wholesale_price"],
    [tierId("Partner"), "meta:partner_customerpp_wholesale_price"],
  ];

  let inserted = 0, priceRows = 0;
  const seen = new Set();
  for (const r of products) {
    if (seen.has(r.sku)) continue;
    seen.add(r.sku);
    const bigPrice = price(r["meta:BigRepairShopCustomerAccount_wholesale_price"]);
    const stock = r.stock_status === "instock" ? Math.max(parseInt(r.stock) || 0, 1) : 0;
    const m = modelOf(r);
    const b = brandOf(r);
    const res = await client.query(
      `INSERT INTO products (sku, name, category_id, brand_id, model_id, quality, list_price, stock, description, featured, image_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
      [
        r.sku.trim(),
        clean(r.post_title),
        catIds[categoryOf(r)],
        brandIds[b],
        m ? modelIds[`${b}|${m}`] : null,
        qualityOf(r),
        bigPrice,
        stock,
        clean(r.post_excerpt || r.post_content) || clean(r.post_title),
        r.featured === "yes",
        imageOf(r),
      ],
    );
    const pid = res.rows[0].id;
    for (const [tid, col] of TIER_COLS) {
      const p = price(r[col]);
      if (p !== null) {
        await client.query(
          "INSERT INTO product_tier_prices (product_id, tier_id, price) VALUES ($1,$2,$3)",
          [pid, tid, p],
        );
        priceRows++;
      }
    }
    inserted++;
    if (inserted % 1000 === 0) console.log("inserted", inserted);
  }

  await client.query("COMMIT");
  console.log("DONE products:", inserted, "tier prices:", priceRows);
} catch (e) {
  await client.query("ROLLBACK");
  throw e;
} finally {
  client.release();
  await pool.end();
}
