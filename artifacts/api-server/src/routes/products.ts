import { Router, type IRouter } from "express";
import { and, asc, desc, eq, gt, ilike, or, sql, type SQL } from "drizzle-orm";
import {
  db,
  productsTable,
  categoriesTable,
  brandsTable,
  deviceModelsTable,
} from "@workspace/db";
import {
  ListProductsQueryParams,
  ListProductsResponse,
  ListFeaturedProductsResponse,
  GetProductParams,
  GetProductResponse,
} from "@workspace/api-zod";
import {
  getCurrentCustomerWithTier,
  getAllTiers,
  tierPrice,
} from "../lib/store";

const router: IRouter = Router();

const productSelect = {
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
};

function baseQuery() {
  return db
    .select(productSelect)
    .from(productsTable)
    .innerJoin(categoriesTable, eq(productsTable.categoryId, categoriesTable.id))
    .innerJoin(brandsTable, eq(productsTable.brandId, brandsTable.id))
    .leftJoin(deviceModelsTable, eq(productsTable.modelId, deviceModelsTable.id));
}

function toApiProduct(
  row: Awaited<ReturnType<ReturnType<typeof baseQuery>["execute"]>>[number],
  discountPercent: number,
) {
  const listPrice = Number(row.listPrice);
  return {
    ...row,
    listPrice,
    yourPrice: tierPrice(listPrice, discountPercent),
  };
}

router.get("/products", async (req, res): Promise<void> => {
  const parsed = ListProductsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const q = parsed.data;
  const page = q.page ?? 1;
  const pageSize = q.pageSize ?? 24;

  const conditions: SQL[] = [];
  if (q.search) {
    const term = `%${q.search}%`;
    const searchCond = or(
      ilike(productsTable.name, term),
      ilike(productsTable.sku, term),
      ilike(brandsTable.name, term),
      ilike(deviceModelsTable.name, term),
    );
    if (searchCond) conditions.push(searchCond);
  }
  if (q.categoryId != null) conditions.push(eq(productsTable.categoryId, q.categoryId));
  if (q.brandId != null) conditions.push(eq(productsTable.brandId, q.brandId));
  if (q.modelId != null) conditions.push(eq(productsTable.modelId, q.modelId));
  if (q.quality) conditions.push(eq(productsTable.quality, q.quality));
  if (q.inStockOnly) conditions.push(gt(productsTable.stock, 0));

  const where = conditions.length ? and(...conditions) : undefined;

  const orderBy =
    q.sort === "priceAsc"
      ? asc(productsTable.listPrice)
      : q.sort === "priceDesc"
        ? desc(productsTable.listPrice)
        : q.sort === "newest"
          ? desc(productsTable.createdAt)
          : asc(productsTable.name);

  const { tier } = await getCurrentCustomerWithTier();
  const discount = Number(tier.discountPercent);

  const countQuery = db
    .select({ total: sql<number>`count(*)::int` })
    .from(productsTable)
    .innerJoin(categoriesTable, eq(productsTable.categoryId, categoriesTable.id))
    .innerJoin(brandsTable, eq(productsTable.brandId, brandsTable.id))
    .leftJoin(deviceModelsTable, eq(productsTable.modelId, deviceModelsTable.id));

  const [rows, [{ total }]] = await Promise.all([
    (where ? baseQuery().where(where) : baseQuery())
      .orderBy(orderBy)
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    where ? countQuery.where(where) : countQuery,
  ]);

  res.json(
    ListProductsResponse.parse({
      items: rows.map((r) => toApiProduct(r, discount)),
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    }),
  );
});

router.get("/products/featured", async (_req, res): Promise<void> => {
  const { tier } = await getCurrentCustomerWithTier();
  const rows = await baseQuery()
    .where(eq(productsTable.featured, true))
    .orderBy(asc(productsTable.name))
    .limit(8);
  res.json(
    ListFeaturedProductsResponse.parse(
      rows.map((r) => toApiProduct(r, Number(tier.discountPercent))),
    ),
  );
});

router.get("/products/:id", async (req, res): Promise<void> => {
  const params = GetProductParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [row] = await baseQuery().where(eq(productsTable.id, params.data.id));
  if (!row) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

  const [{ tier }, tiers] = await Promise.all([
    getCurrentCustomerWithTier(),
    getAllTiers(),
  ]);
  const listPrice = Number(row.listPrice);

  const specs: { label: string; value: string }[] = [
    { label: "SKU", value: row.sku },
    { label: "Brand", value: row.brandName },
    ...(row.modelName ? [{ label: "Device model", value: row.modelName }] : []),
    { label: "Category", value: row.categoryName },
    { label: "Quality grade", value: row.quality },
    { label: "Availability", value: row.stock > 0 ? `${row.stock} in stock` : "Out of stock" },
  ];

  res.json(
    GetProductResponse.parse({
      ...toApiProduct(row, Number(tier.discountPercent)),
      tierPrices: tiers.map((t) => ({
        tierId: t.id,
        tierName: t.name,
        price: tierPrice(listPrice, Number(t.discountPercent)),
        isCurrent: t.id === tier.id,
      })),
      specs,
    }),
  );
});

export default router;
