import {
  boolean,
  index,
  pgTable,
  text,
  serial,
  integer,
  numeric,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const priceTiersTable = pgTable("price_tiers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  discountPercent: numeric("discount_percent", {
    precision: 5,
    scale: 2,
  }).notNull(),
  minAnnualSpend: numeric("min_annual_spend", {
    precision: 12,
    scale: 2,
  }).notNull(),
  description: text("description").notNull(),
  rank: integer("rank").notNull(),
});

export const customersTable = pgTable("customers", {
  id: serial("id").primaryKey(),
  clerkUserId: text("clerk_user_id").unique(),
  companyName: text("company_name").notNull(),
  contactName: text("contact_name").notNull(),
  email: text("email").notNull().unique(),
  defaultShippingAddress: text("default_shipping_address"),
  tierId: integer("tier_id")
    .notNull()
    .references(() => priceTiersTable.id),
  annualSpend: numeric("annual_spend", { precision: 12, scale: 2 })
    .notNull()
    .default("0"),
});

export const customerAddressesTable = pgTable(
  "customer_addresses",
  {
    id: serial("id").primaryKey(),
    customerId: integer("customer_id")
      .notNull()
      .references(() => customersTable.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    shippingAddress: text("shipping_address").notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("customer_addresses_customer_id_idx").on(table.customerId),
    uniqueIndex("customer_addresses_one_default_idx")
      .on(table.customerId)
      .where(sql`${table.isDefault} = true`),
  ],
);

// Explicit per-product price for a tier (imported from the real price list).
// When a row exists it takes precedence over listPrice * (1 - discount%).
export const productTierPricesTable = pgTable("product_tier_prices", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull(),
  tierId: integer("tier_id")
    .notNull()
    .references(() => priceTiersTable.id),
  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
});

export type ProductTierPrice = typeof productTierPricesTable.$inferSelect;
export type PriceTier = typeof priceTiersTable.$inferSelect;
export type Customer = typeof customersTable.$inferSelect;
export type CustomerAddress = typeof customerAddressesTable.$inferSelect;
