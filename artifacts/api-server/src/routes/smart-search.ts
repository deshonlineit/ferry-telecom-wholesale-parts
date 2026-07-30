import { Router, type IRouter } from "express";
import { and, asc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import {
  db,
  productsTable,
  categoriesTable,
  brandsTable,
  deviceModelsTable,
} from "@workspace/db";
import { SmartSearchQueryParams, SmartSearchResponse } from "@workspace/api-zod";
import {
  getCustomerWithTier,
  getExplicitTierPrices,
  resolvePrice,
} from "../lib/store";
import { normalize, matchModel, matchCategory } from "../lib/smart-search";
import { requireCustomer } from "../middlewares/requireCustomer";

const router: IRouter = Router();

router.get("/search/smart", requireCustomer, async (req, res): Promise<void> => {
  const parsed = SmartSearchQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const tokens = normalize(parsed.data.q).split(" ").filter(Boolean);
  const matchedTerms: string[] = [];

  const [models, categories, brands, { tier }] = await Promise.all([
    db.select().from(deviceModelsTable),
    db.select().from(categoriesTable),
    db.select().from(brandsTable),
    getCustomerWithTier(req.customer!.id),
  ]);

  const modelMatch = matchModel(tokens, models);
  const categoryMatch = matchCategory(tokens);

  let brandMatch: { id: number; name: string } | null = null;
  for (const token of tokens) {
    const brand = brands.find((b) => b.name.toLowerCase() === token);
    if (brand) {
      brandMatch = brand;
      break;
    }
  }

  const conditions: SQL[] = [];
  if (modelMatch) {
    conditions.push(eq(productsTable.modelId, modelMatch.model.id));
    matchedTerms.push(modelMatch.matchedText);
  }
  const category = categoryMatch
    ? categories.find((c) => c.slug === categoryMatch.slug)
    : null;
  if (category) {
    conditions.push(eq(productsTable.categoryId, category.id));
    matchedTerms.push(categoryMatch!.matchedText);
  }
  if (!modelMatch && brandMatch) {
    conditions.push(eq(productsTable.brandId, brandMatch.id));
    matchedTerms.push(brandMatch.name.toLowerCase());
  }

  // Fall back to plain text search when nothing was interpreted.
  if (conditions.length === 0 && tokens.length > 0) {
    const term = `%${tokens.join("%")}%`;
    const compactTerm = `%${tokens.join("")}%`;
    const fallback = or(
      ilike(productsTable.name, term),
      ilike(productsTable.sku, term),
      sql`regexp_replace(lower(${productsTable.name}), '[^a-z0-9]', '', 'g') like ${compactTerm}`,
      sql`regexp_replace(lower(${productsTable.sku}), '[^a-z0-9]', '', 'g') like ${compactTerm}`,
    );
    if (fallback) conditions.push(fallback);
  }

  const rows = await db
    .select({
      id: productsTable.id,
      sku: productsTable.sku,
      name: productsTable.name,
      categoryId: productsTable.categoryId,
      categoryName: categoriesTable.name,
      brandId: productsTable.brandId,
      brandName: brandsTable.name,
      modelId: productsTable.modelId,
      modelName: deviceModelsTable.name,
      quality: productsTable.quality,
      listPrice: productsTable.listPrice,
      stock: productsTable.stock,
      imageUrl: productsTable.imageUrl,
      description: productsTable.description,
    })
    .from(productsTable)
    .innerJoin(categoriesTable, eq(productsTable.categoryId, categoriesTable.id))
    .innerJoin(brandsTable, eq(productsTable.brandId, brandsTable.id))
    .leftJoin(deviceModelsTable, eq(productsTable.modelId, deviceModelsTable.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(productsTable.name))
    .limit(24);

  const discount = Number(tier.discountPercent);
  const explicit = await getExplicitTierPrices(tier.id, rows.map((r) => r.id));
  const modelBrand = modelMatch
    ? brands.find((b) => b.id === modelMatch.model.brandId)
    : null;

  res.json(
    SmartSearchResponse.parse({
      interpretation: {
        brandId: modelBrand?.id ?? brandMatch?.id ?? null,
        brandName: modelBrand?.name ?? brandMatch?.name ?? null,
        modelId: modelMatch?.model.id ?? null,
        modelName: modelMatch?.model.name ?? null,
        categoryId: category?.id ?? null,
        categoryName: category?.name ?? null,
        matchedTerms,
      },
      products: rows.map((r) => ({
        ...r,
        listPrice: Number(r.listPrice),
        yourPrice: resolvePrice(explicit, r.id, Number(r.listPrice), discount),
      })),
      total: rows.length,
    }),
  );
});

export default router;
