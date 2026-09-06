import { parse } from "csv-parse/sync";
import { inArray, sql } from "drizzle-orm";
import {
  db,
  brandsTable,
  categoriesTable,
  deviceModelsTable,
  productsTable,
} from "@workspace/db";

export const MAX_CSV_BYTES = 1024 * 1024;
export const MAX_CSV_ROWS = 1000;

const REQUIRED_HEADERS = ["sku", "name", "brand", "stock"] as const;
const OPTIONAL_HEADERS = new Set([
  "quality",
  "description",
  "imageUrl",
  "featured",
  "model",
  // Category is intentionally ignored: every imported product is classified.
  "category",
  "categoryId",
]);
const MAX_INT = 2_147_483_647;
const DECIMAL = /^(?:0|[1-9]\d*)(?:[.,]\d{1,2})?$/;

export type ProductCsvRowResult = {
  row: number;
  sku: string;
  name: string;
  status: "imported" | "duplicate" | "invalid";
  message: string;
  productId?: number;
  category?: string;
};

export type ProductCsvReport = {
  totalRows: number;
  imported: number;
  duplicates: number;
  invalid: number;
  rows: ProductCsvRowResult[];
};

export type ParsedProduct = {
  row: number;
  sku: string;
  name: string;
  brand: string;
  model: string | null;
  quality: string;
  listPrice: string;
  stock: number;
  featured: boolean;
  imageUrl: string | null;
  description: string | null;
};

export type ImportReferenceData = {
  brands: Array<{ id: number; name: string }>;
  models: Array<{ id: number; brandId: number; name: string }>;
  categories: Array<{ id: number; slug: string }>;
  existingSkus: Set<string>;
};

export type ProductImportTransaction = {
  getOrCreateBrand(name: string): Promise<number>;
  insertProduct(
    product: ParsedProduct & {
      brandId: number;
      modelId: number | null;
      categoryId: number;
    },
  ): Promise<number | undefined>;
};

export type ProductImportRepository = {
  loadReferenceData(skus: string[]): Promise<ImportReferenceData>;
  transaction<T>(work: (tx: ProductImportTransaction) => Promise<T>): Promise<T>;
};

export class CsvImportStructuralError extends Error {}
export class CsvImportClassificationError extends Error {}
export class CsvImportAbortedError extends Error {}

function parseRecords(csv: string): string[][] {
  const errors: string[] = [];
  for (const delimiter of [",", ";"]) {
    try {
      const records = parse(csv, {
        bom: true,
        delimiter,
        skip_empty_lines: true,
        relax_column_count: false,
        max_record_size: MAX_CSV_BYTES,
      }) as string[][];
      if (records.length === 0) {
        throw new CsvImportStructuralError("CSV must contain a header row");
      }
      const headers = records[0].map((header) => header.trim());
      const hasRequired =
        REQUIRED_HEADERS.every((header) => headers.includes(header)) &&
        (headers.includes("price") || headers.includes("listPrice"));
      if (hasRequired) return records;
      errors.push(`delimiter "${delimiter}" did not contain the required headers`);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  throw new CsvImportStructuralError(
    `Invalid CSV or missing required headers: ${errors[0] ?? "unable to parse CSV"}`,
  );
}

function optionalText(value: string | undefined, field: string, max: number): string | null {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return null;
  if (trimmed.includes("\0")) throw new Error(`${field} contains an invalid null character`);
  if (trimmed.length > max) throw new Error(`must be at most ${max} characters`);
  return trimmed;
}

function requiredText(
  value: string | undefined,
  field: string,
  max: number,
): string {
  const trimmed = (value ?? "").trim();
  if (!trimmed) throw new Error(`${field} is required`);
  if (trimmed.includes("\0")) throw new Error(`${field} contains an invalid null character`);
  if (trimmed.length > max) throw new Error(`${field} must be at most ${max} characters`);
  return trimmed;
}

function parseProduct(
  values: string[],
  headers: string[],
  row: number,
): ParsedProduct {
  const record = Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  const sku = requiredText(record.sku, "sku", 200);
  const name = requiredText(record.name, "name", 1000);
  const brand = requiredText(record.brand, "brand", 500);
  const quality = optionalText(record.quality, "quality", 500) ?? "Standard";
  const price = (record.price ?? record.listPrice ?? "").trim();
  const normalizedPrice = price.replace(",", ".");
  if (!DECIMAL.test(price) || Number(normalizedPrice) > 99_999_999.99) {
    throw new Error("price must be a nonnegative decimal up to 99999999.99 with at most 2 decimal places");
  }
  const stockText = (record.stock ?? "").trim();
  if (!/^(?:0|[1-9]\d*)$/.test(stockText)) {
    throw new Error("stock must be an integer from 0 to 2147483647");
  }
  const stock = Number(stockText);
  if (!Number.isSafeInteger(stock) || stock > MAX_INT) {
    throw new Error("stock must be an integer from 0 to 2147483647");
  }
  const featuredText = (record.featured ?? "").trim().toLowerCase();
  if (featuredText && featuredText !== "true" && featuredText !== "false") {
    throw new Error("featured must be true, false, or empty");
  }
  const imageUrl = optionalText(record.imageUrl, "imageUrl", 2048);
  if (imageUrl) {
    let url: URL;
    try {
      url = new URL(imageUrl);
    } catch {
      throw new Error("imageUrl must be a valid http(s) URL");
    }
    if (
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      !url.hostname ||
      url.username ||
      url.password ||
      /[\u0000-\u0020\u007f]/.test(imageUrl)
    ) {
      throw new Error("imageUrl must be a safe http(s) URL without credentials");
    }
  }
  return {
    row,
    sku,
    name,
    brand,
    model: optionalText(record.model, "model", 500),
    quality,
    listPrice: Number(normalizedPrice).toFixed(2),
    stock,
    featured: featuredText === "true",
    imageUrl,
    description: optionalText(record.description, "description", 20_000),
  };
}

export function parseProductCsv(csv: string): {
  totalRows: number;
  products: ParsedProduct[];
  results: ProductCsvRowResult[];
} {
  if (typeof csv !== "string") throw new CsvImportStructuralError("csv must be a string");
  if (Buffer.byteLength(csv, "utf8") > MAX_CSV_BYTES) {
    throw new CsvImportStructuralError("CSV exceeds the 1 MiB UTF-8 limit");
  }
  const records = parseRecords(csv);
  const headers = records[0].map((header) => header.trim());
  if (new Set(headers).size !== headers.length || headers.some((header) => !header)) {
    throw new CsvImportStructuralError("CSV headers must be nonempty and unique");
  }
  const allowed = new Set([...REQUIRED_HEADERS, "price", "listPrice", ...OPTIONAL_HEADERS]);
  const unsupported = headers.filter((header) => !allowed.has(header));
  if (unsupported.length) {
    throw new CsvImportStructuralError(`Unsupported CSV header(s): ${unsupported.join(", ")}`);
  }
  if (headers.includes("price") && headers.includes("listPrice")) {
    throw new CsvImportStructuralError('Use either "price" or "listPrice", not both');
  }
  const rows = records.slice(1);
  if (!rows.length) {
    throw new CsvImportStructuralError("CSV must contain at least one product row");
  }
  if (rows.length > MAX_CSV_ROWS) {
    throw new CsvImportStructuralError(`CSV exceeds the ${MAX_CSV_ROWS} row limit`);
  }

  const products: ParsedProduct[] = [];
  const results: ProductCsvRowResult[] = [];
  const seenSkus = new Set<string>();
  rows.forEach((values, index) => {
    const row = index + 2;
    const rawSku = (values[headers.indexOf("sku")] ?? "").trim();
    const rawName = (values[headers.indexOf("name")] ?? "").trim();
    if (rawSku && seenSkus.has(rawSku)) {
      results.push({
        row,
        sku: rawSku,
        name: rawName,
        status: "duplicate",
        message: `Duplicate SKU "${rawSku}" in CSV; first occurrence kept`,
      });
      return;
    }
    if (rawSku) seenSkus.add(rawSku);
    try {
      products.push(parseProduct(values, headers, row));
    } catch (error) {
      results.push({
        row,
        sku: rawSku,
        name: rawName,
        status: "invalid",
        message: error instanceof Error ? error.message : "Invalid row",
      });
    }
  });
  return { totalRows: rows.length, products, results };
}

export async function importProductCsv(
  csv: string,
  classify: (
    items: Array<{ id: number; name: string }>,
    signal?: AbortSignal,
  ) => Promise<Map<number, string>>,
  repository: ProductImportRepository = postgresProductImportRepository,
  isAborted: () => boolean = () => false,
  signal?: AbortSignal,
): Promise<ProductCsvReport> {
  const parsed = parseProductCsv(csv);
  const references = await repository.loadReferenceData(parsed.products.map((product) => product.sku));
  const brands = new Map(references.brands.map((brand) => [brand.name.toLocaleLowerCase(), brand]));
  const models = new Map(
    references.models.map((model) => [`${model.brandId}\0${model.name.toLocaleLowerCase()}`, model]),
  );
  const accepted: Array<ParsedProduct & { modelId: number | null }> = [];

  for (const product of parsed.products) {
    if (references.existingSkus.has(product.sku)) {
      parsed.results.push({
        row: product.row,
        sku: product.sku,
        name: product.name,
        status: "duplicate",
        message: `SKU "${product.sku}" already exists`,
      });
      continue;
    }
    const brand = brands.get(product.brand.toLocaleLowerCase());
    let modelId: number | null = null;
    if (product.model) {
      if (!brand) {
        parsed.results.push({
          row: product.row,
          sku: product.sku,
          name: product.name,
          status: "invalid",
          message: `Model "${product.model}" cannot be used because brand "${product.brand}" is new`,
        });
        continue;
      }
      const model = models.get(`${brand.id}\0${product.model.toLocaleLowerCase()}`);
      if (!model) {
        parsed.results.push({
          row: product.row,
          sku: product.sku,
          name: product.name,
          status: "invalid",
          message: `Model "${product.model}" does not exist for brand "${brand.name}"`,
        });
        continue;
      }
      modelId = model.id;
    }
    accepted.push({ ...product, modelId });
  }

  let classifications: Map<number, string>;
  try {
    classifications = accepted.length
      ? await classify(
          accepted.map((product) => ({ id: product.row, name: product.name })),
          signal,
        )
      : new Map();
    if (accepted.some((product) => !classifications.has(product.row))) {
      throw new Error("classifier did not return every product");
    }
  } catch (error) {
    if (signal?.aborted || isAborted()) {
      throw new CsvImportAbortedError("Client disconnected before import");
    }
    throw new CsvImportClassificationError(
      `Automatic category classification failed: ${error instanceof Error ? error.message : "unknown error"}`,
    );
  }
  const categories = new Map(references.categories.map((category) => [category.slug, category.id]));
  for (const product of accepted) {
    if (!categories.has(classifications.get(product.row)!)) {
      throw new CsvImportClassificationError("Automatic category classification returned an unavailable category");
    }
  }
  if (isAborted()) throw new CsvImportAbortedError("Client disconnected before import");

  if (accepted.length) await repository.transaction(async (tx) => {
    const brandIds = new Map<string, number>();
    for (const product of accepted) {
      if (isAborted()) throw new CsvImportAbortedError("Client disconnected before import");
      const brandKey = product.brand.toLocaleLowerCase();
      let brandId = brandIds.get(brandKey);
      if (brandId == null) {
        brandId = await tx.getOrCreateBrand(product.brand);
        brandIds.set(brandKey, brandId);
      }
      const category = classifications.get(product.row)!;
      const productId = await tx.insertProduct({
        ...product,
        brandId,
        categoryId: categories.get(category)!,
      });
      parsed.results.push(
        productId == null
          ? {
              row: product.row,
              sku: product.sku,
              name: product.name,
              status: "duplicate",
              message: `SKU "${product.sku}" was inserted concurrently`,
            }
          : {
              row: product.row,
              sku: product.sku,
              name: product.name,
              status: "imported",
              message: "Imported",
              productId,
              category,
            },
      );
    }
  });

  parsed.results.sort((a, b) => a.row - b.row);
  return {
    totalRows: parsed.totalRows,
    imported: parsed.results.filter((row) => row.status === "imported").length,
    duplicates: parsed.results.filter((row) => row.status === "duplicate").length,
    invalid: parsed.results.filter((row) => row.status === "invalid").length,
    rows: parsed.results,
  };
}

export const postgresProductImportRepository: ProductImportRepository = {
  async loadReferenceData(skus) {
    const [brands, models, categories, existing] = await Promise.all([
      db.select({ id: brandsTable.id, name: brandsTable.name }).from(brandsTable),
      db
        .select({ id: deviceModelsTable.id, brandId: deviceModelsTable.brandId, name: deviceModelsTable.name })
        .from(deviceModelsTable),
      db.select({ id: categoriesTable.id, slug: categoriesTable.slug }).from(categoriesTable),
      skus.length
        ? db.select({ sku: productsTable.sku }).from(productsTable).where(inArray(productsTable.sku, skus))
        : Promise.resolve([]),
    ]);
    return { brands, models, categories, existingSkus: new Set(existing.map((row) => row.sku)) };
  },
  async transaction(work) {
    return db.transaction(async (transaction) => {
      // Serialize importer brand creation so case-insensitive lookup/create is stable.
      await transaction.execute(sql`select pg_advisory_xact_lock(7046029254386353131)`);
      return work({
        async getOrCreateBrand(name) {
          const [existing] = await transaction
            .select({ id: brandsTable.id })
            .from(brandsTable)
            .where(sql`lower(${brandsTable.name}) = lower(${name})`);
          if (existing) return existing.id;
          const [created] = await transaction
            .insert(brandsTable)
            .values({ name })
            .onConflictDoNothing({ target: brandsTable.name })
            .returning({ id: brandsTable.id });
          if (created) return created.id;
          const [concurrent] = await transaction
            .select({ id: brandsTable.id })
            .from(brandsTable)
            .where(sql`lower(${brandsTable.name}) = lower(${name})`);
          if (!concurrent) throw new Error(`Unable to create brand "${name}"`);
          return concurrent.id;
        },
        async insertProduct(product) {
          const [created] = await transaction
            .insert(productsTable)
            .values({
              sku: product.sku,
              name: product.name,
              brandId: product.brandId,
              modelId: product.modelId,
              categoryId: product.categoryId,
              quality: product.quality,
              listPrice: product.listPrice,
              stock: product.stock,
              featured: product.featured,
              imageUrl: product.imageUrl,
              description: product.description,
            })
            .onConflictDoNothing({ target: productsTable.sku })
            .returning({ id: productsTable.id });
          return created?.id;
        },
      });
    });
  },
};