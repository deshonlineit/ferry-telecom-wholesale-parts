import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
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
import { ObjectNotFoundError } from "../lib/objectStorage";
import type { ObjectAclPolicy } from "../lib/objectAcl";
import {
  normalizeStoredImageUrl,
  toRenderableImageUrl,
  toRenderableImageUrls,
} from "../lib/productImages";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

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
  images: productsTable.images,
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
    imageUrl: toRenderableImageUrl(row.imageUrl),
    listPrice,
    yourPrice: resolvePrice(explicit, row.id, listPrice, discountPercent),
  };
}

function galleryWithLegacyFallback(images: string[], imageUrl: string | null): string[] {
  return images.length > 0
    ? images.map(normalizeStoredImageUrl)
    : imageUrl
      ? [normalizeStoredImageUrl(imageUrl)]
      : [];
}

async function readObjectHeader(
  objectFile: Awaited<ReturnType<ObjectStorageService["getObjectEntityFile"]>>,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    objectFile
      .createReadStream({ start: 0, end: 11 })
      .on("data", (chunk: Buffer) => chunks.push(chunk))
      .on("error", reject)
      .on("end", () => resolve(Buffer.concat(chunks)));
  });
}

function hasValidImageSignature(contentType: string, header: Buffer): boolean {
  if (contentType === "image/jpeg") {
    return header.length >= 3 && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
  }
  if (contentType === "image/png") {
    return header.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  if (contentType === "image/webp") {
    return header.subarray(0, 4).toString("ascii") === "RIFF"
      && header.subarray(8, 12).toString("ascii") === "WEBP";
  }
  return false;
}

async function validateAndPublishImage(rawUrl: string, owner: string): Promise<string> {
  let normalized = rawUrl.trim();
  normalized = normalizeStoredImageUrl(normalized);
  if (!normalized.startsWith("/objects/")) {
    normalized = objectStorageService.normalizeObjectEntityPath(normalized);
  }

  if (normalized.startsWith("/objects/")) {
    if (!normalized.startsWith("/objects/uploads/")) {
      throw new Error("Only product-upload objects may be used as product images");
    }
    const objectFile = await objectStorageService.getObjectEntityFile(normalized);
    const [metadata] = await objectFile.getMetadata();
    const contentType = metadata.contentType;
    const size = Number(metadata.size);
    if (
      typeof contentType !== "string"
      || !["image/jpeg", "image/png", "image/webp"].includes(contentType)
      || !Number.isFinite(size)
      || size < 1
      || size > 8 * 1024 * 1024
      || !hasValidImageSignature(contentType, await readObjectHeader(objectFile))
    ) {
      throw new Error("Upload must be a valid JPEG, PNG, or WebP image up to 8 MB");
    }
    const policy: ObjectAclPolicy = { owner, visibility: "public" };
    return objectStorageService.trySetObjectEntityAclPolicy(normalized, policy);
  }

  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    throw new Error("Image URL must be an uploaded object path or an absolute HTTP URL");
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new Error("Image URL must be an uploaded object path or an absolute HTTP URL");
  }
  return url.toString();
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

  const primaryOrder =
    q.sort === "priceAsc"
      ? asc(productsTable.listPrice)
      : q.sort === "priceDesc"
        ? desc(productsTable.listPrice)
        : q.sort === "stockAsc"
          ? asc(productsTable.stock)
          : q.sort === "stockDesc"
            ? desc(productsTable.stock)
            : q.sort === "newest"
              ? desc(productsTable.createdAt)
              : asc(productsTable.name);
  // Stable tiebreaker so pagination never repeats/skips rows on equal values.
  const orderBy = [primaryOrder, asc(productsTable.id)];

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
      .orderBy(...orderBy)
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
      images: toRenderableImageUrls(galleryWithLegacyFallback(row.images, row.imageUrl)),
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

router.put("/products/:id/image", requireStaff, async (req, res): Promise<void> => {
  const params = GetProductParams.safeParse(req.params);
  const body = SetProductImageBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: (params.success ? body : params).error?.message });
    return;
  }

  const [existing] = await db
    .select({
      id: productsTable.id,
      imageUrl: productsTable.imageUrl,
      images: productsTable.images,
    })
    .from(productsTable)
    .where(eq(productsTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

  const owner = getAuth(req).userId;
  if (!owner) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    let images: string[];
    if ("imageUrls" in body.data) {
      const uniqueUrls = [...new Set(body.data.imageUrls.map((imageUrl) =>
        normalizeStoredImageUrl(objectStorageService.normalizeObjectEntityPath(imageUrl.trim())),
      ))];
      const validated = await Promise.all(
        uniqueUrls.map((imageUrl) => validateAndPublishImage(imageUrl, owner)),
      );
      images = [...new Set(validated.map(normalizeStoredImageUrl))];
    } else {
      const cover = await validateAndPublishImage(body.data.imageUrl, owner);
      const current = galleryWithLegacyFallback(existing.images, existing.imageUrl);
      images = [...new Set([cover, ...current])];
      if (images.length > 12) {
        throw new Error("A product can have up to 12 photos. Remove a photo before adding a new cover.");
      }
    }
    const imageUrl = toRenderableImageUrl(images[0] ?? null);

    await db
      .update(productsTable)
      .set({ imageUrl, images })
      .where(eq(productsTable.id, existing.id));

    res.json(SetProductImageResponse.parse({
      id: existing.id,
      imageUrl,
      images: toRenderableImageUrls(images),
    }));
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      res.status(400).json({ error: "Uploaded image was not found" });
      return;
    }
    req.log.warn({ err: error }, "Product image rejected");
    res.status(400).json({
      error: error instanceof Error ? error.message : "Invalid product image",
    });
  }
});

export default router;
