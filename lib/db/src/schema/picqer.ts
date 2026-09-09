import { bigint, bigserial, char, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { ordersTable } from "./orders";
import { productsTable } from "./catalog";

export const picqerOutboxTable = pgTable("picqer_outbox", {
  id: bigserial("id", { mode: "number" }).primaryKey(), orderId: integer("order_id").notNull().references(() => ordersTable.id),
  foreignReference: text("foreign_reference").notNull(), payload: jsonb("payload").notNull(), status: text("status").notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0), nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
  lastError: text("last_error"), lockedAt: timestamp("locked_at", { withTimezone: true }),
  lockedOwner: text("locked_owner"), lockedUntil: timestamp("locked_until", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("picqer_outbox_order_unique").on(t.orderId), uniqueIndex("picqer_outbox_reference_unique").on(t.foreignReference),
  index("picqer_outbox_ready_idx").on(t.status, t.nextAttemptAt), index("picqer_outbox_lease_idx").on(t.status, t.nextAttemptAt, t.lockedUntil)]);

export const picqerOrderMappingsTable = pgTable("picqer_order_mappings", {
  orderId: integer("order_id").primaryKey().references(() => ordersTable.id), foreignReference: text("foreign_reference").notNull(),
  picqerOrderId: bigint("picqer_order_id", { mode: "number" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("picqer_order_mappings_reference_unique").on(t.foreignReference),
  uniqueIndex("picqer_order_mappings_picqer_id_unique").on(t.picqerOrderId)]);

export const picqerWebhookEventsTable = pgTable("picqer_webhook_events", {
  id: bigserial("id", { mode: "number" }).primaryKey(), eventKey: char("event_key", { length: 64 }).notNull(), eventType: text("event_type").notNull(),
  outcome: text("outcome").notNull(), receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp("processed_at", { withTimezone: true }), detail: text("detail").notNull().default(""),
}, (t) => [uniqueIndex("picqer_webhook_events_event_key_unique").on(t.eventKey)]);

export const picqerProductStateTable = pgTable("picqer_product_state", {
  productId: integer("product_id").primaryKey().references(() => productsTable.id), productcode: text("productcode").notNull(),
  picqerProductId: bigint("picqer_product_id", { mode: "number" }), lastFreeStock: integer("last_free_stock"),
  lastStockEventAt: timestamp("last_stock_event_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("picqer_product_state_productcode_unique").on(t.productcode),
  uniqueIndex("picqer_product_state_picqer_id_unique").on(t.picqerProductId)]);