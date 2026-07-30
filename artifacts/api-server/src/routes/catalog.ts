import { Router, type IRouter } from "express";
import { asc, count, eq, gt, sql } from "drizzle-orm";
import {
  db,
  categoriesTable,
  brandsTable,
  deviceModelsTable,
  productsTable,
} from "@workspace/db";
import {
  ListCategoriesResponse,
  ListBrandsResponse,
  GetCatalogSummaryResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/catalog/categories", async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      id: categoriesTable.id,
      name: categoriesTable.name,
      slug: categoriesTable.slug,
      description: categoriesTable.description,
      productCount: count(productsTable.id),
    })
    .from(categoriesTable)
    .leftJoin(productsTable, eq(productsTable.categoryId, categoriesTable.id))
    .groupBy(categoriesTable.id)
    .orderBy(asc(categoriesTable.name));

  res.json(ListCategoriesResponse.parse(rows));
});

router.get("/catalog/brands", async (_req, res): Promise<void> => {
  const brands = await db
    .select()
    .from(brandsTable)
    .orderBy(asc(brandsTable.name));
  const models = await db
    .select()
    .from(deviceModelsTable)
    .orderBy(asc(deviceModelsTable.name));

  const result = brands.map((b) => ({
    id: b.id,
    name: b.name,
    models: models.filter((m) => m.brandId === b.id),
  }));

  res.json(ListBrandsResponse.parse(result));
});

router.get("/catalog/summary", async (_req, res): Promise<void> => {
  const [summary] = await db
    .select({
      productCount: sql<number>`count(*)::int`,
      inStockCount: sql<number>`count(*) filter (where ${gt(productsTable.stock, 0)})::int`,
    })
    .from(productsTable);
  const [{ brandCount }] = await db
    .select({ brandCount: sql<number>`count(*)::int` })
    .from(brandsTable);
  const [{ categoryCount }] = await db
    .select({ categoryCount: sql<number>`count(*)::int` })
    .from(categoriesTable);

  res.json(
    GetCatalogSummaryResponse.parse({
      productCount: summary?.productCount ?? 0,
      inStockCount: summary?.inStockCount ?? 0,
      brandCount,
      categoryCount,
    }),
  );
});

export default router;
