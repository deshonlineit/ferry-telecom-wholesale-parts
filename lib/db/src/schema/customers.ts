import {
  pgTable,
  text,
  serial,
  integer,
  numeric,
} from "drizzle-orm/pg-core";

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
  companyName: text("company_name").notNull(),
  contactName: text("contact_name").notNull(),
  email: text("email").notNull().unique(),
  tierId: integer("tier_id")
    .notNull()
    .references(() => priceTiersTable.id),
  annualSpend: numeric("annual_spend", { precision: 12, scale: 2 })
    .notNull()
    .default("0"),
});

export type PriceTier = typeof priceTiersTable.$inferSelect;
export type Customer = typeof customersTable.$inferSelect;
