import { describe, expect, it, vi } from "vitest";
vi.mock("@workspace/db", () => ({
  db: {},
  brandsTable: {},
  categoriesTable: {},
  deviceModelsTable: {},
  productsTable: {},
}));
import {
  CsvImportClassificationError,
  CsvImportStructuralError,
  MAX_CSV_BYTES,
  importProductCsv,
  parseProductCsv,
  type ProductImportRepository,
} from "./productCsvImport";

function repository(overrides?: {
  existingSkus?: string[];
  concurrentSkus?: string[];
}) {
  const inserted: string[] = [];
  const createdBrands: string[] = [];
  let transactions = 0;
  const repo: ProductImportRepository = {
    async loadReferenceData() {
      return {
        brands: [
          { id: 1, name: "Apple" },
          { id: 2, name: "Samsung" },
        ],
        models: [
          { id: 10, brandId: 1, name: "iPhone 15" },
          { id: 20, brandId: 2, name: "Galaxy S24" },
        ],
        categories: [
          { id: 100, slug: "screens-lcds" },
          { id: 101, slug: "batteries" },
        ],
        existingSkus: new Set(overrides?.existingSkus ?? []),
      };
    },
    async transaction(work) {
      transactions += 1;
      return work({
        async getOrCreateBrand(name) {
          if (name.toLowerCase() === "apple") return 1;
          if (name.toLowerCase() === "samsung") return 2;
          createdBrands.push(name);
          return 30;
        },
        async insertProduct(product) {
          inserted.push(product.sku);
          return overrides?.concurrentSkus?.includes(product.sku)
            ? undefined
            : 1000 + inserted.length;
        },
      });
    },
  };
  return { repo, inserted, createdBrands, get transactions() { return transactions; } };
}

describe("parseProductCsv", () => {
  it("rejects an empty file and a header-only file", () => {
    expect(() => parseProductCsv("")).toThrow(CsvImportStructuralError);
    expect(() => parseProductCsv("sku,name,brand,price,stock\n")).toThrow("at least one product");
  });
  it("parses BOM, semicolons, CRLF, quoted newlines and doubled quotes", () => {
    const parsed = parseProductCsv(
      '\uFEFFsku;name;brand;listPrice;stock;description\r\n' +
        'A-1;"Screen ""Plus""";Apple;12.5;4;"first line\r\nsecond line"\r\n',
    );
    expect(parsed.totalRows).toBe(1);
    expect(parsed.products[0]).toMatchObject({
      row: 2,
      sku: "A-1",
      name: 'Screen "Plus"',
      brand: "Apple",
      listPrice: "12.50",
      stock: 4,
      quality: "Standard",
      description: "first line\r\nsecond line",
    });
  });

  it("parses quoted commas and accepts ignored category columns", () => {
    const parsed = parseProductCsv(
      'sku,name,brand,price,stock,category,imageUrl,featured\n' +
        'A-1,"Display, OLED",Apple,99.99,3,wrong,https://cdn.example/a.jpg,true\n',
    );
    expect(parsed.products[0]).toMatchObject({
      name: "Display, OLED",
      imageUrl: "https://cdn.example/a.jpg",
      featured: true,
    });
  });

  it("accepts decimal commas for semicolon CSV and when quoted in comma CSV", () => {
    expect(
      parseProductCsv("sku;name;brand;price;stock\nA;Part;Apple;12,34;1\n").products[0].listPrice,
    ).toBe("12.34");
    expect(
      parseProductCsv('sku,name,brand,price,stock\nA,Part,Apple,"12,34",1\n').products[0].listPrice,
    ).toBe("12.34");
  });

  it.each([
    ["negative price", "sku,name,brand,price,stock\nA,N,B,-1,0\n", "price"],
    ["too many decimal places", "sku;name;brand;price;stock\nA;N;B;1,234;0\n", "price"],
    ["fractional stock", "sku,name,brand,price,stock\nA,N,B,1.00,1.5\n", "stock"],
    ["unsafe URL", "sku,name,brand,price,stock,imageUrl\nA,N,B,1.00,1,javascript:alert(1)\n", "imageUrl"],
    ["blank required value", "sku,name,brand,price,stock\nA,  ,B,1.00,1\n", "name"],
  ])("reports %s as a row validation error", (_label, csv, message) => {
    const parsed = parseProductCsv(csv);
    expect(parsed.products).toHaveLength(0);
    expect(parsed.results[0]).toMatchObject({ row: 2, status: "invalid" });
    expect(parsed.results[0].message).toContain(message);
  });

  it("keeps the first exact-case SKU and reports later CSV duplicates", () => {
    const parsed = parseProductCsv(
      "sku,name,brand,price,stock\nA,One,Apple,1,0\nA,Two,Apple,2,0\na,Three,Apple,3,0\n",
    );
    expect(parsed.products.map((row) => row.sku)).toEqual(["A", "a"]);
    expect(parsed.results).toEqual([
      expect.objectContaining({ row: 3, sku: "A", status: "duplicate" }),
    ]);
  });

  it.each([
    ["missing headers", "sku,name\nA,N\n"],
    ["unsupported headers", "sku,name,brand,price,stock,color\nA,N,B,1,0,red\n"],
    ["both price aliases", "sku,name,brand,price,listPrice,stock\nA,N,B,1,1,0\n"],
    ["malformed quoting", 'sku,name,brand,price,stock\nA,"N,B,1,0\n'],
  ])("rejects structural CSV: %s", (_label, csv) => {
    expect(() => parseProductCsv(csv)).toThrow(CsvImportStructuralError);
  });

  it("enforces byte and row limits before import", () => {
    expect(() => parseProductCsv("x".repeat(MAX_CSV_BYTES + 1))).toThrow(/1 MiB/);
    const rows = Array.from({ length: 1001 }, (_, index) => `S${index},N,B,1,0`).join("\n");
    expect(() => parseProductCsv(`sku,name,brand,price,stock\n${rows}`)).toThrow(/1000 row/);
  });
});

describe("importProductCsv", () => {
  it("classifies valid new rows once and preserves report order", async () => {
    const state = repository({ existingSkus: ["DB-DUP"], concurrentSkus: ["RACE"] });
    const classify = vi.fn(async (items: Array<{ id: number; name: string }>) =>
      new Map(items.map((item) => [item.id, item.name.includes("Battery") ? "batteries" : "screens-lcds"])),
    );
    const csv =
      "sku,name,brand,price,stock,model\n" +
      "OK,OLED Screen,apple,10.00,2,iPhone 15\n" +
      "BADMODEL,Part,Apple,1,0,Unknown\n" +
      "DB-DUP,Existing,Apple,1,0,\n" +
      "OK,Repeated,Apple,1,0,\n" +
      "NEW,Battery Pack,New Brand,2.50,5,\n" +
      "RACE,Screen,Apple,3,1,\n";
    const report = await importProductCsv(csv, classify, state.repo);

    expect(classify).toHaveBeenCalledTimes(1);
    expect(classify.mock.calls[0][0].map((item) => item.id)).toEqual([2, 6, 7]);
    expect(state.inserted).toEqual(["OK", "NEW", "RACE"]);
    expect(state.createdBrands).toEqual(["New Brand"]);
    expect(report).toMatchObject({ totalRows: 6, imported: 2, duplicates: 3, invalid: 1 });
    expect(report.rows.map((row) => [row.row, row.status])).toEqual([
      [2, "imported"],
      [3, "invalid"],
      [4, "duplicate"],
      [5, "duplicate"],
      [6, "imported"],
      [7, "duplicate"],
    ]);
    expect(report.rows[0]).toMatchObject({ category: "screens-lcds", productId: 1001 });
  });

  it("does not start a transaction when classification fails or omits an id", async () => {
    for (const classify of [
      vi.fn(async () => { throw new Error("provider secret detail"); }),
      vi.fn(async () => new Map<number, string>()),
    ]) {
      const state = repository();
      await expect(
        importProductCsv("sku,name,brand,price,stock\nA,Screen,Apple,1,0\n", classify, state.repo),
      ).rejects.toBeInstanceOf(CsvImportClassificationError);
      expect(state.transactions).toBe(0);
      expect(state.inserted).toEqual([]);
    }
  });

  it("does not classify or write when every row is already invalid or duplicate", async () => {
    const state = repository({ existingSkus: ["A"] });
    const classify = vi.fn(async () => new Map<number, string>());
    const report = await importProductCsv(
      "sku,name,brand,price,stock,model\nA,Old,Apple,1,0,\nB,Part,Apple,1,0,Nope\n",
      classify,
      state.repo,
    );
    expect(classify).not.toHaveBeenCalled();
    expect(state.transactions).toBe(0);
    expect(report).toMatchObject({ imported: 0, duplicates: 1, invalid: 1 });
  });
});