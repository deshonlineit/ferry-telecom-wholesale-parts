import { Router, type IRouter } from "express";
import { and, asc, desc, eq, gt, ilike, inArray, notInArray, or, sql, type SQL } from "drizzle-orm";
import {
  db,
  productsTable,
  categoriesTable,
  brandsTable,
  deviceModelsTable,
  orderLinesTable,
} from "@workspace/db";
import {
  ListProductsQueryParams,
  ListProductsResponse,
  ListFeaturedProductsResponse,
  GetProductParams,
  GetProductResponse,
  SetProductImageBody,
  SetProductImageResponse,
} from "@workspace/api-zod";
import {
  getCustomerWithTier,
  tierPrice,
  getExplicitTierPrices,
  resolvePrice,
} from "../lib/store";
import { requireCustomer } from "../middlewares/requireCustomer";
import { requireStaff } from "../middlewares/requireStaff";
import { ObjectStorageService } from "../lib/objectStorage";

const router: IRouter = Router();

router.use("/products", requireCustomer);

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
  explicit: Map<number, number> = new Map(),
) {
  const listPrice = Number(row.listPrice);
  return {
    ...row,
    listPrice,
    yourPrice: resolvePrice(explicit, row.id, listPrice, discountPercent),
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

  const { tier } = await getCustomerWithTier(req.customer!.id);
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

  const explicit = await getExplicitTierPrices(tier.id, rows.map((r) => r.id));

  res.json(
    ListProductsResponse.parse({
      items: rows.map((r) => toApiProduct(r, discount, explicit)),
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    }),
  );
});

const FEATURED_LIMIT = 8;

router.get("/products/featured", async (req, res): Promise<void> => {
  const { tier } = await getCustomerWithTier(req.customer!.id);

  // 1. Curated: products explicitly flagged as featured by staff
  const rows = await baseQuery()
    .where(eq(productsTable.featured, true))
    .orderBy(asc(productsTable.name))
    .limit(FEATURED_LIMIT);

  // 2. Auto-fill with best sellers (by units sold) if there aren't enough curated picks
  if (rows.length < FEATURED_LIMIT) {
    const excluded = new Set(rows.map((r) => r.id));
    const bestSellerConditions: SQL[] = [gt(productsTable.stock, 0)];
    if (excluded.size > 0) {
      bestSellerConditions.push(
        notInArray(orderLinesTable.productId, Array.from(excluded)),
      );
    }
    const bestSellers = await db
      .select({
        productId: orderLinesTable.productId,
        unitsSold: sql<number>`sum(${orderLinesTable.quantity})::int`,
      })
      .from(orderLinesTable)
      .innerJoin(productsTable, eq(orderLinesTable.productId, productsTable.id))
      .where(and(...bestSellerConditions))
      .groupBy(orderLinesTable.productId)
      .orderBy(desc(sql`sum(${orderLinesTable.quantity})`))
      .limit(FEATURED_LIMIT - rows.length);

    const fillIds = bestSellers.map((b) => b.productId);

    if (fillIds.length > 0) {
      const fillRows = await baseQuery().where(inArray(productsTable.id, fillIds));
      // keep best-seller order
      const byId = new Map(fillRows.map((r) => [r.id, r]));
      for (const id of fillIds) {
        const r = byId.get(id);
        if (r) {
          rows.push(r);
          excluded.add(id);
        }
      }
    }

    // 3. Still short? Fill with in-stock highlights (newest products with images first)
    if (rows.length < FEATURED_LIMIT) {
      const highlightConditions: SQL[] = [gt(productsTable.stock, 0)];
      if (excluded.size > 0) {
        highlightConditions.push(notInArray(productsTable.id, Array.from(excluded)));
      }
      const highlights = await baseQuery()
        .where(and(...highlightConditions))
        .orderBy(
          sql`(${productsTable.imageUrl} is not null) desc`,
          desc(productsTable.createdAt),
          asc(productsTable.name),
        )
        .limit(FEATURED_LIMIT - rows.length);
      rows.push(...highlights);
    }
  }

  const explicit = await getExplicitTierPrices(tier.id, rows.map((r) => r.id));
  res.json(
    ListFeaturedProductsResponse.parse(
      rows.map((r) => toApiProduct(r, Number(tier.discountPercent), explicit)),
    ),
  );
});

router.get("/products/:id", async (req, res): Promise<void> => {
  const params = GetProductParams.safeParse(req.params);

  const body = SetProductImageBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [row] = await baseQuery().where(eq(productsTable.id, params.data.id));
  if (!row) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

  const { tier } = await getCustomerWithTier(req.customer!.id);
  const listPrice = Number(row.listPrice);

  const specs: { label: string; value: string }[] = [
    { label: "SKU", value: row.sku },
    { label: "Brand", value: row.brandName },
    ...(row.modelName ? [{ label: "Device model", value: row.modelName }] : []),
    { label: "Category", value: row.categoryName },
    { label: "Quality grade", value: row.quality },
    { label: "Availability", value: row.stock > 0 ? `${row.stock} in stock` : "Out of stock" },
  ];

  const explicitPrices = await getExplicitTierPrices(tier.id, [row.id]);

  // Only expose the logged-in customer's own price — never other groups' pricing.
  res.json(
    GetProductResponse.parse({
      ...toApiProduct(row, Number(tier.discountPercent), explicitPrices),
      tierPrices: [
        {
          tierId: tier.id,
          tierName: tier.name,
          price: resolvePrice(explicitPrices, row.id, listPrice, Number(tier.discountPercent)),
          isCurrent: true,
        },
      ],
      specs,
    }),
  );
});

export default router;
