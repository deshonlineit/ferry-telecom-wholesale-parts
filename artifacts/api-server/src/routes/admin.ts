import { Router, type IRouter } from "express";
import { and, asc, desc, eq, ilike, lte, or, sql, type SQL } from "drizzle-orm";
import {
  db,
  productsTable,
  categoriesTable,
  brandsTable,
  deviceModelsTable,
  customersTable,
  priceTiersTable,
  ordersTable,
  orderLinesTable,
} from "@workspace/db";
import {
  AdminListProductsQueryParams,
  AdminListProductsResponse,
  AdminCreateProductBody,
  AdminCreateProductResponse,
  AdminUpdateProductParams,
  AdminUpdateProductBody,
  AdminUpdateProductResponse,
  AdminCreateCategoryBody,
  AdminCreateCategoryResponse,
  AdminUpdateCategoryParams,
  AdminUpdateCategoryBody,
  AdminUpdateCategoryResponse,
  AdminCreateBrandBody,
  AdminCreateBrandResponse,
  AdminCreateModelBody,
  AdminCreateModelResponse,
  AdminListCustomersResponse,
  AdminUpdateCustomerTierParams,
  AdminUpdateCustomerTierBody,
  AdminUpdateCustomerTierResponse,
  AdminListOrdersResponse,
  AdminUpdateOrderStatusParams,
  AdminUpdateOrderStatusBody,
  AdminUpdateOrderStatusResponse,
  AdminImportProductsBody,
  AdminImportProductsResponse,
} from "@workspace/api-zod";
import { requireStaff } from "../middlewares/requireStaff";
import { classifyProductNames, classifyToCategoryId } from "../lib/classifyProduct";
import {
  CsvImportAbortedError,
  CsvImportClassificationError,
  CsvImportStructuralError,
  importProductCsv,
} from "../lib/productCsvImport";

const router: IRouter = Router();

const DEFAULT_LOW_STOCK_THRESHOLD = 5;
const MAX_CONCURRENT_CSV_IMPORTS = 2;
let activeCsvImports = 0;

// Guard the entire namespace, including future admin endpoints.
router.use("/admin", requireStaff);

function adminProductSelect() {
  return db
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
      featured: productsTable.featured,
      imageUrl: productsTable.imageUrl,
      description: productsTable.description,
    })
    .from(productsTable)
    .innerJoin(categoriesTable, eq(productsTable.categoryId, categoriesTable.id))
    .innerJoin(brandsTable, eq(productsTable.brandId, brandsTable.id))
    .leftJoin(deviceModelsTable, eq(productsTable.modelId, deviceModelsTable.id));
}

type AdminProductRow = Awaited<ReturnType<ReturnType<typeof adminProductSelect>["execute"]>>[number];

function productToApi(row: AdminProductRow) {
  return {
    ...row,
    listPrice: Number(row.listPrice),
  };
}

router.get("/admin/products", async (req, res): Promise<void> => {
  const rawLowStockOnly = req.query.lowStockOnly;
  const parsed = AdminListProductsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const q = parsed.data;
  const page = q.page ?? 1;
  const pageSize = q.pageSize ?? 25;

  const conditions: SQL[] = [];
  if (q.search) {
    const term = `%${q.search}%`;
    const cond = or(
      ilike(productsTable.name, term),
      ilike(productsTable.sku, term),
      ilike(brandsTable.name, term),
    );
    if (cond) conditions.push(cond);
  }
  if (q.categoryId != null) conditions.push(eq(productsTable.categoryId, q.categoryId));
  // Note: read the raw query string because zod.coerce.boolean() turns "false" into true.
  const rawFeatured = req.query.featured;
  if (typeof rawFeatured === "string" && rawFeatured.length > 0) {
    conditions.push(eq(productsTable.featured, rawFeatured === "true"));
  }
  if (rawLowStockOnly === "true") {
    conditions.push(lte(productsTable.stock, DEFAULT_LOW_STOCK_THRESHOLD));
  }
  const where = conditions.length ? and(...conditions) : undefined;

  const countQuery = db
    .select({ total: sql<number>`count(*)::int` })
    .from(productsTable)
    .innerJoin(categoriesTable, eq(productsTable.categoryId, categoriesTable.id))
    .innerJoin(brandsTable, eq(productsTable.brandId, brandsTable.id))
    .leftJoin(deviceModelsTable, eq(productsTable.modelId, deviceModelsTable.id));

  const base = adminProductSelect();
  const [rows, [{ total }]] = await Promise.all([
    (where ? base.where(where) : base)
      .orderBy(asc(productsTable.name), asc(productsTable.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    where ? countQuery.where(where) : countQuery,
  ]);

  res.json(
    AdminListProductsResponse.parse({
      items: rows.map(productToApi),
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      lowStockThreshold: DEFAULT_LOW_STOCK_THRESHOLD,
    }),
  );
});

router.post("/admin/products", async (req, res): Promise<void> => {
  const parsed = AdminCreateModelBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const b = body.data;

  const [existing] = await db
    .select({ id: productsTable.id })
    .from(productsTable)
    .where(eq(productsTable.id, id));
  if (existing) {
    res.status(400).json({ error: `SKU "${b.sku}" already exists` });
    return;
  }

  // Category omitted => classify automatically with AI (same taxonomy as
  // scripts/reclassify-products.mjs). Admin can still override via edit.
  let categoryId = b.categoryId;
  if (categoryId == null) {
    try {
      categoryId = await classifyToCategoryId(b.name);
    } catch (err) {
      res.status(502).json({
        error: `Automatic category classification failed: ${err instanceof Error ? err.message : String(err)}. Pick a category manually.`,
      });
      return;
    }
  }

  const [created] = await db
    .insert(deviceModelsTable)
    .values({ brandId: parsed.data.brandId, name: parsed.data.name })
    .returning();

  const [row] = await db
    .select(adminOrderSelect)
    .from(ordersTable)
    .innerJoin(customersTable, eq(ordersTable.customerId, customersTable.id))
    .where(eq(ordersTable.id, params.data.id));
  res.status(201).json(AdminCreateProductResponse.parse(productToApi(row)));
});

router.post("/admin/products/import", async (req, res): Promise<void> => {
  const body = AdminUpdateOrderStatusBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  if (activeCsvImports >= MAX_CONCURRENT_CSV_IMPORTS) {
    res.status(429).json({ error: "Too many product imports are already running" });
    return;
  }
  activeCsvImports += 1;
  let disconnected = false;
  const abortController = new AbortController();
  req.once("aborted", () => {
    disconnected = true;
    abortController.abort();
  });
  res.once("close", () => {
    if (!res.writableEnded) {
      disconnected = true;
      abortController.abort();
    }
  });
  try {
    const report = await importProductCsv(
      body.data.csv,
      classifyProductNames,
      undefined,
      () => disconnected,
      abortController.signal,
    );
    if (!disconnected) res.json(AdminImportProductsResponse.parse(report));
  } catch (error) {
    if (error instanceof CsvImportStructuralError) {
      res.status(400).json({ error: error.message });
      return;
    }
    if (error instanceof CsvImportClassificationError) {
      req.log.error({ err: error }, "CSV product classification failed");
      res.status(502).json({
        error: "Automatic category classification failed. No products were imported.",
      });
      return;
    }
    if (error instanceof CsvImportAbortedError) return;
    req.log.error({ err: error }, "CSV product import failed");
    if (!disconnected) res.status(500).json({ error: "Product import failed. No products were imported." });
  } finally {
    activeCsvImports -= 1;
  }
});

router.patch("/admin/products/:id", async (req, res): Promise<void> => {
  const params = AdminUpdateOrderStatusParams.safeParse(req.params);
  const body = AdminUpdateOrderStatusBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: (params.success ? body : params).error?.message });
    return;
  }
  const b = body.data;
  const id = params.data.id;

  const [existing] = await db
    .select({ id: productsTable.id })
    .from(productsTable)
    .where(eq(productsTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

  if (b.sku !== undefined) {
  const [dup] = await db
    .select({ id: brandsTable.id })
    .from(brandsTable)
    .where(ilike(brandsTable.name, parsed.data.name));
    if (dup && dup.id !== id) {
      res.status(400).json({ error: `SKU "${b.sku}" already exists` });
      return;
    }
  }

  const update: Partial<typeof categoriesTable.$inferInsert> = {};
  if (b.sku !== undefined) update.sku = b.sku;
  if (b.name !== undefined) update.name = b.name;
  if (b.categoryId !== undefined) update.categoryId = b.categoryId;
  if (b.brandId !== undefined) update.brandId = b.brandId;
  if ("modelId" in (req.body as object)) update.modelId = b.modelId ?? null;
  if (b.quality !== undefined) update.quality = b.quality;
  if (b.listPrice !== undefined) update.listPrice = b.listPrice.toFixed(2);
  if (b.stock !== undefined) update.stock = b.stock;
  if (b.featured !== undefined) update.featured = b.featured;
  if ("imageUrl" in (req.body as object)) update.imageUrl = b.imageUrl ?? null;
  if ("description" in (req.body as object)) update.description = b.description ?? null;

  if (Object.keys(update).length > 0) {
    await db.update(productsTable).set(update).where(eq(productsTable.id, id));
  }

  const [row] = await db
    .select(adminOrderSelect)
    .from(ordersTable)
    .innerJoin(customersTable, eq(ordersTable.customerId, customersTable.id))
    .where(eq(ordersTable.id, params.data.id));
  res.json(AdminUpdateProductResponse.parse(productToApi(row)));
});

router.post("/admin/categories", async (req, res): Promise<void> => {
  const parsed = AdminCreateModelBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [dup] = await db
    .select({ id: brandsTable.id })
    .from(brandsTable)
    .where(ilike(brandsTable.name, parsed.data.name));
  if (dup) {
    res.status(400).json({ error: `Brand "${parsed.data.name}" already exists` });
    return;
  }
  const [created] = await db
    .insert(deviceModelsTable)
    .values({ brandId: parsed.data.brandId, name: parsed.data.name })
    .returning();
  res.status(201).json(
    AdminCreateCategoryResponse.parse({ ...created, productCount: 0 }),
  );
});

router.patch("/admin/categories/:id", async (req, res): Promise<void> => {
  const params = AdminUpdateOrderStatusParams.safeParse(req.params);
  const body = AdminUpdateOrderStatusBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: (params.success ? body : params).error?.message });
    return;
  }
  const id = params.data.id;
  const b = body.data;

  const update: Partial<typeof categoriesTable.$inferInsert> = {};
  if (b.name !== undefined) update.name = b.name;
  if (b.slug !== undefined) update.slug = b.slug;
  if ("description" in (req.body as object)) update.description = b.description ?? null;

  const [updated] = await db
    .update(ordersTable)
    .set({ status: body.data.status })
    .where(eq(ordersTable.id, params.data.id))
    .returning({ id: ordersTable.id });
  if (!updated) {
    res.status(404).json({ error: "Category not found" });
    return;
  }

  const [{ productCount }] = await db
    .select({ productCount: sql<number>`count(*)::int` })
    .from(productsTable)
    .where(eq(productsTable.categoryId, id));

  res.json(AdminUpdateCategoryResponse.parse({ ...updated, productCount }));
});

router.post("/admin/brands", async (req, res): Promise<void> => {
  const parsed = AdminCreateModelBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [dup] = await db
    .select({ id: brandsTable.id })
    .from(brandsTable)
    .where(ilike(brandsTable.name, parsed.data.name));
  if (dup) {
    res.status(400).json({ error: `Brand "${parsed.data.name}" already exists` });
    return;
  }
  const [created] = await db
    .insert(deviceModelsTable)
    .values({ brandId: parsed.data.brandId, name: parsed.data.name })
    .returning();
  res.status(201).json(AdminCreateBrandResponse.parse({ ...created, models: [] }));
});

router.post("/admin/models", async (req, res): Promise<void> => {
  const parsed = AdminCreateModelBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [brand] = await db
    .select({ id: brandsTable.id })
    .from(brandsTable)
    .where(eq(brandsTable.id, parsed.data.brandId));
  if (!brand) {
    res.status(400).json({ error: "Brand not found" });
    return;
  }
  const [created] = await db
    .insert(deviceModelsTable)
    .values({ brandId: parsed.data.brandId, name: parsed.data.name })
    .returning();
  res.status(201).json(AdminCreateModelResponse.parse(created));
});

function customerToApi(row: {
  id: number;
  companyName: string;
  contactName: string;
  email: string;
  tierId: number;
  tierName: string;
  annualSpend: string;
}) {
  return { ...row, annualSpend: Number(row.annualSpend) };
}

const customerSelect = {
  id: customersTable.id,
  companyName: customersTable.companyName,
  contactName: customersTable.contactName,
  email: customersTable.email,
  tierId: customersTable.tierId,
  tierName: priceTiersTable.name,
  annualSpend: customersTable.annualSpend,
};

router.get("/admin/customers", async (_req, res): Promise<void> => {
  const rows = await db
    .select(adminOrderSelect)
    .from(ordersTable)
    .innerJoin(customersTable, eq(ordersTable.customerId, customersTable.id))
    .orderBy(desc(ordersTable.createdAt));
  res.json(AdminListOrdersResponse.parse(rows.map(orderToApi)));
});

router.patch("/admin/orders/:id", async (req, res): Promise<void> => {
  const params = AdminUpdateOrderStatusParams.safeParse(req.params);
  const body = AdminUpdateOrderStatusBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: (params.success ? body : params).error?.message });
    return;
  }

  const [tier] = await db
    .select({ id: priceTiersTable.id })
    .from(priceTiersTable)
    .where(eq(priceTiersTable.id, body.data.tierId));
  if (!tier) {
    res.status(400).json({ error: "Price tier not found" });
    return;
  }

  const [updated] = await db
    .update(ordersTable)
    .set({ status: body.data.status })
    .where(eq(ordersTable.id, params.data.id))
    .returning({ id: ordersTable.id });
  if (!updated) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  const [row] = await db
    .select(adminOrderSelect)
    .from(ordersTable)
    .innerJoin(customersTable, eq(ordersTable.customerId, customersTable.id))
    .where(eq(ordersTable.id, params.data.id));
  res.json(AdminUpdateCustomerTierResponse.parse(customerToApi(row)));
});

const adminOrderSelect = {
  id: ordersTable.id,
  orderNumber: ordersTable.orderNumber,
  customerId: ordersTable.customerId,
  companyName: customersTable.companyName,
  status: ordersTable.status,
  total: ordersTable.total,
  createdAt: ordersTable.createdAt,
  itemCount: sql<number>`(select coalesce(sum(${orderLinesTable.quantity}), 0) from ${orderLinesTable} where ${orderLinesTable.orderId} = ${ordersTable.id})::int`,
};

function orderToApi(row: {
  id: number;
  orderNumber: string;
  customerId: number;
  companyName: string;
  status: string;
  total: string;
  createdAt: Date;
  itemCount: number;
}) {
  return {
    ...row,
    total: Number(row.total),
    createdAt: row.createdAt.toISOString(),
  };
}

router.get("/admin/orders", async (_req, res): Promise<void> => {
  const rows = await db
    .select(adminOrderSelect)
    .from(ordersTable)
    .innerJoin(customersTable, eq(ordersTable.customerId, customersTable.id))
    .orderBy(desc(ordersTable.createdAt));
  res.json(AdminListOrdersResponse.parse(rows.map(orderToApi)));
});

router.patch("/admin/orders/:id", async (req, res): Promise<void> => {
  const params = AdminUpdateOrderStatusParams.safeParse(req.params);
  const body = AdminUpdateOrderStatusBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: (params.success ? body : params).error?.message });
    return;
  }

  const [updated] = await db
    .update(ordersTable)
    .set({ status: body.data.status })
    .where(eq(ordersTable.id, params.data.id))
    .returning({ id: ordersTable.id });
  if (!updated) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  const [row] = await db
    .select(adminOrderSelect)
    .from(ordersTable)
    .innerJoin(customersTable, eq(ordersTable.customerId, customersTable.id))
    .where(eq(ordersTable.id, params.data.id));
  res.json(AdminUpdateOrderStatusResponse.parse(orderToApi(row)));
});

export default router;
