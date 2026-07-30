import {
  pgTable,
  text,
  serial,
  integer,
  numeric,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";

export const categoriesTable = pgTable("categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
});

export const brandsTable = pgTable("brands", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
});

export const deviceModelsTable = pgTable("device_models", {
  id: serial("id").primaryKey(),
  brandId: integer("brand_id")
    .notNull()
    .references(() => brandsTable.id),
  name: text("name").notNull(),
});

export const productsTable = pgTable("products", {
  id: serial("id").primaryKey(),
  sku: text("sku").notNull().unique(),
  name: text("name").notNull(),
  categoryId: integer("category_id")
    .notNull()
    .references(() => categoriesTable.id),
  brandId: integer("brand_id")
    .notNull()
    .references(() => brandsTable.id),
  modelId: integer("model_id").references(() => deviceModelsTable.id),
  quality: text("quality").notNull(),
  listPrice: numeric("list_price", { precision: 10, scale: 2 }).notNull(),
  stock: integer("stock").notNull().default(0),
  imageUrl: text("image_url"),
  description: text("description"),
  featured: boolean("featured").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Category = typeof categoriesTable.$inferSelect;
export type Brand = typeof brandsTable.$inferSelect;
export type DeviceModel = typeof deviceModelsTable.$inferSelect;
export type Product = typeof productsTable.$inferSelect;
