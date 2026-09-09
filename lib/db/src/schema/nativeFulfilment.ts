import { bigint, boolean, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
export const nativePicqerOrderMappingsTable = pgTable("native_picqer_order_mappings", {
  nativeOrderId: text("native_order_id").primaryKey(), picqerOrderId: bigint("picqer_order_id", { mode: "number" }).notNull(),
  foreignReference: text("foreign_reference").notNull(), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("native_mapping_picqer_unique").on(t.picqerOrderId), uniqueIndex("native_mapping_reference_unique").on(t.foreignReference)]);
export const nativeFulfilmentStateTable = pgTable("native_fulfilment_state", {
  nativeOrderId: text("native_order_id").primaryKey(), picqerOrderId: bigint("picqer_order_id", { mode: "number" }).notNull(),
  tracking: text("tracking").notNull().default(""), status: text("status").notNull().default("processing"),
  version: bigint("version", { mode: "number" }).notNull().default(1),
  reservationAcknowledged: boolean("reservation_acknowledged").notNull().default(false),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("native_fulfilment_picqer_unique").on(t.picqerOrderId)]);