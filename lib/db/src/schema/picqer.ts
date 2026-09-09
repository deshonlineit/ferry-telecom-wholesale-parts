import { bigint, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { ordersTable } from "./orders";
import { productsTable } from "./catalog";

export const picqerOutboxTable = pgTable("picqer_outbox", {
  id: bigint("id", { mode: "number" }).primaryKey(), orderId: integer("order_id").notNull().references(() => ordersTable.id),
  foreignReference: text("foreign_reference").notNull(), payload: jsonb("payload").notNull(), status: text("status").notNull(),
  attempts: integer("attempts").notNull(), nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull(),
  lastError: text("last_error"), lockedAt: timestamp("locked_at", { withTimezone: true }),
}, (t) => [uniqueIndex("picqer_outbox_order_unique").on(t.orderId), uniqueIndex("picqer_outbox_reference_unique").on(t.foreignReference)]);

export const picqerOrderMappingsTable = pgTable("picqer_order_mappings", {
  orderId: integer("order_id").primaryKey().references(() => ordersTable.id), foreignReference: text("foreign_reference").notNull(),
  picqerOrderId: bigint("picqer_order_id", { mode: "number" }),
});

export const picqerWebhookEventsTable = pgTable("picqer_webhook_events", {
  id: bigint("id", { mode: "number" }).primaryKey(), eventKey: text("event_key").notNull(), eventType: text("event_type").notNull(),
  outcome: text("outcome").notNull(), receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true }), detail: text("detail").notNull(),
});

export const picqerProductStateTable = pgTable("picqer_product_state", {
  productId: integer("product_id").primaryKey().references(() => productsTable.id), productcode: text("productcode").notNull(),
  picqerProductId: bigint("picqer_product_id", { mode: "number" }), lastFreeStock: integer("last_free_stock"),
  lastStockEventAt: timestamp("last_stock_event_at", { withTimezone: true }),
});