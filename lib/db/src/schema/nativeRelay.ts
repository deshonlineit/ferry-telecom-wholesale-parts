import { bigint, bigserial, boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const nativeOrderSnapshotsTable = pgTable("native_order_snapshots", {
  nativeOrderId: text("native_order_id").primaryKey(), eventId: text("event_id").notNull(),
  contentHash: text("content_hash").notNull(), orderCreatedAt: timestamp("order_created_at", { withTimezone: true }).notNull(),
  snapshot: jsonb("snapshot").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("native_order_snapshots_event_unique").on(t.eventId)]);

export const nativePicqerOutboxTable = pgTable("native_picqer_outbox", {
  id: bigserial("id", { mode: "number" }).primaryKey(), nativeOrderId: text("native_order_id").notNull(),
  eventId: text("event_id").notNull(), contentHash: text("content_hash").notNull(),
  orderCreatedAt: timestamp("order_created_at", { withTimezone: true }).notNull(),
  snapshot: jsonb("snapshot").notNull(), status: text("status").notNull().default("pending"),
  attempts: bigint("attempts", { mode: "number" }).notNull().default(0), nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
  lockedOwner: text("locked_owner"), lockedUntil: timestamp("locked_until", { withTimezone: true }),
  lastError: text("last_error"), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("native_outbox_event_unique").on(t.eventId),
  uniqueIndex("native_picqer_outbox_order_hash").on(t.nativeOrderId, t.contentHash),
  index("native_picqer_outbox_ready").on(t.status, t.nextAttemptAt, t.lockedUntil),
]);

export const nativeCatalogSkusTable = pgTable("native_catalog_skus", {
  nativeProductId: text("native_product_id").primaryKey(), sku: text("sku").notNull(),
  active: boolean("active").notNull(), picqerProductId: bigint("picqer_product_id", { mode: "number" }),
  contentHash: text("content_hash").notNull(), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const nativeStockStateTable = pgTable("native_stock_state", {
  sku: text("sku").primaryKey(), nativeProductId: text("native_product_id").notNull(),
  freeStock: integer("free_stock").notNull(), version: bigint("version", { mode: "number" }).notNull(),
  contentHash: text("content_hash").notNull(), sourceEventAt: timestamp("source_event_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export const nativeRelayEventsTable = pgTable("native_relay_events", {
  eventId: text("event_id").primaryKey(), contentHash: text("content_hash").notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
});
export const nativeCatalogManifestsTable = pgTable("native_catalog_manifests", {
  manifestVersion: bigint("manifest_version", { mode: "number" }).primaryKey(),
  contentHash: text("content_hash").notNull(), receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("native_catalog_manifest_hash_unique").on(t.contentHash)]);