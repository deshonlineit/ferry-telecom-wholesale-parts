import { pgSchema, serial, bigserial, integer, bigint, boolean, text, varchar, char, jsonb, timestamp, date, index, uniqueIndex } from "drizzle-orm/pg-core";

export const partsStore = pgSchema("parts_store");

export const partsStorecustomerGroupsTable = partsStore.table("customer_groups", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
});

export const partsStoreusersTable = partsStore.table("users", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 140 }).notNull(),
  email: varchar("email", { length: 190 }).notNull(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  company: varchar("company", { length: 190 }).notNull().default(''),
  role: text("role").notNull().default('customer'),
  groupId: integer("group_id").notNull().default(1),
  status: text("status").notNull().default('pending'),
  phone: varchar("phone", { length: 40 }).notNull().default(''),
  website: varchar("website", { length: 255 }).notNull().default(''),
  businessActivity: varchar("business_activity", { length: 80 }).notNull().default(''),
  taxRegistrationType: varchar("tax_registration_type", { length: 40 }).notNull().default(''),
  taxRegistrationNumber: varchar("tax_registration_number", { length: 80 }).notNull().default(''),
  newsletterOptIn: boolean("newsletter_opt_in").notNull().default(false),
  termsAcceptedAt: timestamp("terms_accepted_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const partsStoreresetTokensTable = partsStore.table("reset_tokens", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  userId: integer("user_id").notNull(),
  tokenHash: char("token_hash", { length: 64 }).notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
});

export const partsStoreloginAttemptsTable = partsStore.table("login_attempts", {
  fingerprint: char("fingerprint", { length: 64 }).primaryKey(),
  attempts: integer("attempts").notNull().default(0),
  lastAttempt: timestamp("last_attempt").notNull(),
});

export const partsStoresessionsTable = partsStore.table("sessions", {
  id: varchar("id", { length: 128 }).primaryKey(),
  data: text("data").notNull(),
  lastAccessedAt: timestamp("last_accessed_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const partsStorecategoriesTable = partsStore.table("categories", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 140 }).notNull(),
  slug: varchar("slug", { length: 190 }).notNull(),
});

export const partsStorebrandsTable = partsStore.table("brands", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 140 }).notNull(),
});

export const partsStoredeviceModelsTable = partsStore.table("device_models", {
  id: serial("id").primaryKey(),
  brandId: integer("brand_id").notNull(),
  name: varchar("name", { length: 190 }).notNull(),
});

export const partsStoreproductsTable = partsStore.table("products", {
  id: serial("id").primaryKey(),
  sku: varchar("sku", { length: 190 }).notNull(),
  name: varchar("name", { length: 500 }).notNull(),
  description: text("description").notNull(),
  categoryId: integer("category_id"),
  brandId: integer("brand_id"),
  quality: varchar("quality", { length: 100 }).notNull().default(''),
  stock: integer("stock").notNull().default(0),
  listPriceCents: integer("list_price_cents").notNull().default(0),
  purchasePriceEurCents: integer("purchase_price_eur_cents"),
  listPriceEurCents: integer("list_price_eur_cents"),
  pricingVersion: integer("pricing_version").notNull().default(0),
  minimumQuantity: integer("minimum_quantity").notNull().default(1),
  imageUrl: varchar("image_url", { length: 500 }).notNull().default(''),
  featured: boolean("featured").notNull().default(false),
  publicationStatus: text("publication_status").notNull().default('draft'),
  active: boolean("active").notNull().default(true),
  expectedRestockDate: date("expected_restock_date"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const partsStoreproductModelsTable = partsStore.table("product_models", {
  productId: integer("product_id").notNull(),
  modelId: integer("model_id").notNull(),
});

export const partsStoreproductModelSourcesTable = partsStore.table("product_model_sources", {
  productId: integer("product_id").notNull(),
  modelId: integer("model_id").notNull(),
  source: text("source").notNull(),
  evidence: varchar("evidence", { length: 500 }).notNull().default(''),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const partsStoregroupPricesTable = partsStore.table("group_prices", {
  productId: integer("product_id").notNull(),
  groupId: integer("group_id").notNull(),
  priceCents: integer("price_cents").notNull(),
  priceEurCents: integer("price_eur_cents"),
});

export const partsStoreimagesTable = partsStore.table("images", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull(),
  url: varchar("url", { length: 500 }).notNull(),
  variants: jsonb("variants").notNull(),
  originalPath: varchar("original_path", { length: 500 }).notNull(),
  originalObject: varchar("original_object"),
  mediaStorage: varchar("media_storage").notNull().default('filesystem'),
  width: integer("width"),
  height: integer("height"),
  mimeType: varchar("mime_type"),
  byteSize: integer("byte_size"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const partsStoreaddressesTable = partsStore.table("addresses", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  label: varchar("label", { length: 100 }).notNull(),
  name: varchar("name", { length: 140 }).notNull(),
  company: varchar("company", { length: 190 }).notNull().default(''),
  line1: varchar("line1", { length: 190 }).notNull(),
  line2: varchar("line2", { length: 190 }).notNull().default(''),
  postalCode: varchar("postal_code", { length: 30 }).notNull(),
  city: varchar("city", { length: 100 }).notNull(),
  country: char("country", { length: 2 }).notNull().default('CH'),
  isDefault: boolean("is_default").notNull().default(false),
});

export const partsStorebillingAddressesTable = partsStore.table("billing_addresses", {
  userId: integer("user_id").primaryKey(),
  label: varchar("label", { length: 100 }).notNull(),
  name: varchar("name", { length: 140 }).notNull(),
  company: varchar("company", { length: 190 }).notNull().default(''),
  line1: varchar("line1", { length: 190 }).notNull(),
  line2: varchar("line2", { length: 190 }).notNull().default(''),
  postalCode: varchar("postal_code", { length: 30 }).notNull(),
  city: varchar("city", { length: 100 }).notNull(),
  country: char("country", { length: 2 }).notNull().default('CH'),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const partsStorecartItemsTable = partsStore.table("cart_items", {
  userId: integer("user_id").notNull(),
  productId: integer("product_id").notNull(),
  quantity: integer("quantity").notNull(),
});

export const partsStoreordersTable = partsStore.table("orders", {
  id: serial("id").primaryKey(),
  number: varchar("number", { length: 40 }).notNull(),
  userId: integer("user_id").notNull(),
  status: varchar("status", { length: 30 }).notNull().default('on_hold'),
  subtotalCents: integer("subtotal_cents").notNull(),
  taxCents: integer("tax_cents").notNull(),
  shippingCents: integer("shipping_cents").notNull(),
  totalCents: integer("total_cents").notNull(),
  taxBps: integer("tax_bps").notNull(),
  currency: char("currency", { length: 3 }).notNull().default('CHF'),
  exchangeRatePpm: bigint("exchange_rate_ppm", { mode: "number" }),
  exchangeRateDate: date("exchange_rate_date"),
  baseCurrency: char("base_currency", { length: 3 }),
  addressJson: jsonb("address_json").notNull(),
  shippingMethodCode: varchar("shipping_method_code", { length: 40 }),
  shippingMethodName: varchar("shipping_method_name", { length: 100 }),
  shippingCarrier: varchar("shipping_carrier", { length: 60 }),
  paymentMethod: varchar("payment_method", { length: 30 }).notNull(),
  paymentState: varchar("payment_state", { length: 30 }).notNull().default('pending'),
  paymentReferenceType: varchar("payment_reference_type", { length: 4 }),
  paymentReference: varchar("payment_reference", { length: 27 }),
  latestPaymentEventAt: bigint("latest_payment_event_at", { mode: "number" }).notNull().default(0),
  latestPaymentEventId: varchar("latest_payment_event_id", { length: 190 }).notNull().default(''),
  paymentTermsJson: jsonb("payment_terms_json"),
  checkoutSnapshot: jsonb("checkout_snapshot"),
  notes: text("notes").notNull(),
  tracking: varchar("tracking", { length: 190 }).notNull().default(''),
  idempotencyKey: varchar("idempotency_key", { length: 100 }).notNull(),
  customerReference: varchar("customer_reference").notNull().default(''),
  stockRestored: boolean("stock_restored").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const partsStorecustomerPaymentEntitlementsTable = partsStore.table("customer_payment_entitlements", {
  userId: integer("user_id").notNull(),
  paymentMethod: varchar("payment_method", { length: 30 }).notNull(),
  enabled: boolean("enabled").notNull().default(false),
  grantedBy: integer("granted_by"),
  grantedAt: timestamp("granted_at"),
  revokedBy: integer("revoked_by"),
  revokedAt: timestamp("revoked_at"),
});

export const partsStorepaymentAttemptsTable = partsStore.table("payment_attempts", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  orderId: integer("order_id").notNull(),
  paymentMethod: varchar("payment_method", { length: 30 }).notNull(),
  providerId: varchar("provider_id", { length: 190 }),
  providerEventId: varchar("provider_event_id", { length: 190 }),
  providerEventCreatedAt: bigint("provider_event_created_at", { mode: "number" }).notNull().default(0),
  state: varchar("state", { length: 30 }).notNull(),
  payload: jsonb("payload"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const partsStoreorderItemsTable = partsStore.table("order_items", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull(),
  productId: integer("product_id").notNull(),
  name: varchar("name", { length: 500 }).notNull(),
  sku: varchar("sku", { length: 190 }).notNull(),
  quantity: integer("quantity").notNull(),
  priceCents: integer("price_cents").notNull(),
  totalCents: integer("total_cents").notNull(),
  priceEurCents: integer("price_eur_cents"),
});

export const partsStoreorderEventsTable = partsStore.table("order_events", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull(),
  status: varchar("status", { length: 30 }).notNull(),
  note: text("note").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const partsStoreinvoiceAccountingTable = partsStore.table("invoice_accounting", {
  orderId: integer("order_id").primaryKey(),
  verified: boolean("verified").notNull().default(false),
  dueDate: date("due_date"),
  paidCents: bigint("paid_cents", { mode: "number" }).notNull().default(0),
  note: text("note").notNull(),
  version: integer("version").notNull().default(0),
  updatedBy: integer("updated_by").notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const partsStoreimportedPaymentsTable = partsStore.table("imported_payments", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  externalId: varchar("external_id", { length: 190 }).notNull(),
  reference: varchar("reference", { length: 27 }).notNull(),
  amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
  currency: char("currency", { length: 3 }).notNull(),
  bookedAt: date("booked_at").notNull(),
  orderId: integer("order_id"),
  status: varchar("status", { length: 30 }).notNull(),
  importedBy: integer("imported_by").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const partsStorereturnsTable = partsStore.table("returns", {
  id: serial("id").primaryKey(),
  number: varchar("number", { length: 40 }).notNull(),
  userId: integer("user_id").notNull(),
  orderId: integer("order_id").notNull(),
  status: varchar("status", { length: 30 }).notNull().default('submitted'),
  reason: text("reason").notNull(),
  creditCents: integer("credit_cents").notNull().default(0),
  note: text("note").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const partsStorereturnItemsTable = partsStore.table("return_items", {
  id: serial("id").primaryKey(),
  returnId: integer("return_id").notNull(),
  orderItemId: integer("order_item_id").notNull(),
  quantity: integer("quantity").notNull(),
});

export const partsStorereturnCreationKeysTable = partsStore.table("return_creation_keys", {
  idempotencyKey: varchar("idempotency_key", { length: 100 }).primaryKey(),
  returnId: integer("return_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const partsStorereturnEventsTable = partsStore.table("return_events", {
  id: serial("id").primaryKey(),
  returnId: integer("return_id").notNull(),
  status: varchar("status", { length: 30 }).notNull(),
  note: text("note").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const partsStorereturnSettlementsTable = partsStore.table("return_settlements", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  returnId: integer("return_id").notNull(),
  idempotencyKey: varchar("idempotency_key", { length: 100 }).notNull(),
  kind: text("kind").notNull(),
  status: text("status").notNull(),
  amountCents: integer("amount_cents").notNull(),
  currency: char("currency", { length: 3 }).notNull(),
  providerReference: varchar("provider_reference", { length: 190 }),
  errorMessage: varchar("error_message", { length: 1000 }),
  snapshot: jsonb("snapshot").notNull(),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
  settledAt: timestamp("settled_at"),
});

export const partsStorecustomerCreditNotesTable = partsStore.table("customer_credit_notes", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  number: varchar("number", { length: 60 }).notNull(),
  userId: integer("user_id").notNull(),
  orderId: integer("order_id").notNull(),
  returnId: integer("return_id").notNull(),
  settlementId: bigint("settlement_id", { mode: "number" }).notNull(),
  issuedCents: integer("issued_cents").notNull(),
  remainingCents: integer("remaining_cents").notNull(),
  currency: char("currency", { length: 3 }).notNull(),
  status: text("status").notNull().default('issued'),
  snapshot: jsonb("snapshot").notNull(),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const partsStorecreditApplicationsTable = partsStore.table("credit_applications", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  creditNoteId: bigint("credit_note_id", { mode: "number" }).notNull(),
  targetOrderId: integer("target_order_id").notNull(),
  amountCents: integer("amount_cents").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const partsStorereturnItemDispositionsTable = partsStore.table("return_item_dispositions", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  returnItemId: integer("return_item_id").notNull(),
  receivedQuantity: integer("received_quantity").notNull(),
  restockQuantity: integer("restock_quantity").notNull().default(0),
  disposition: text("disposition").notNull(),
  recordedBy: integer("recorded_by"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const partsStorereturnStockMovementsTable = partsStore.table("return_stock_movements", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  returnItemId: integer("return_item_id").notNull(),
  productId: integer("product_id").notNull(),
  quantity: integer("quantity").notNull(),
  kind: text("kind").notNull(),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const partsStoremessagesTable = partsStore.table("messages", {
  id: serial("id").primaryKey(),
  kind: varchar("kind", { length: 100 }).notNull(),
  payload: jsonb("payload").notNull(),
  status: varchar("status", { length: 30 }).notNull().default('captured'),
  createdAt: timestamp("created_at").defaultNow(),
});

export const partsStorediagnosticsTable = partsStore.table("diagnostics", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  reference: varchar("reference", { length: 32 }).notNull(),
  severity: varchar("severity", { length: 20 }).notNull(),
  category: varchar("category", { length: 100 }).notNull(),
  summary: varchar("summary", { length: 1000 }).notNull(),
  contextJson: jsonb("context_json").notNull(),
  requestMethod: varchar("request_method", { length: 12 }),
  requestPath: varchar("request_path", { length: 500 }),
  occurredAt: timestamp("occurred_at").notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at"),
  resolvedBy: integer("resolved_by"),
});

export const partsStoreauditEventsTable = partsStore.table("audit_events", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  userId: integer("user_id"),
  action: varchar("action", { length: 100 }).notNull(),
  entity: varchar("entity", { length: 100 }).notNull(),
  entityId: integer("entity_id").notNull(),
  details: jsonb("details").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const partsStoresettingsTable = partsStore.table("settings", {
  name: varchar("name", { length: 100 }).primaryKey(),
  value: varchar("value", { length: 500 }).notNull(),
});

export const partsStoreexchangeRatesTable = partsStore.table("exchange_rates", {
  baseCurrency: char("base_currency", { length: 3 }).notNull(),
  quoteCurrency: char("quote_currency", { length: 3 }).notNull(),
  ratePpm: bigint("rate_ppm", { mode: "number" }).notNull(),
  rateDate: date("rate_date").notNull(),
  fetchedAt: timestamp("fetched_at").notNull(),
  sourceUrl: varchar("source_url", { length: 500 }).notNull(),
});

export const partsStoreorderListsTable = partsStore.table("order_lists", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const partsStoreorderListItemsTable = partsStore.table("order_list_items", {
  listId: integer("list_id").notNull(),
  productId: integer("product_id").notNull(),
  quantity: integer("quantity").notNull().default(1),
  addedAt: timestamp("added_at").notNull().defaultNow(),
});

export const partsStorestockAlertsTable = partsStore.table("stock_alerts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  productId: integer("product_id").notNull(),
  status: varchar("status", { length: 20 }).notNull().default('waiting'),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  notifiedAt: timestamp("notified_at"),
});

export const partsStorebillingPreferencesTable = partsStore.table("billing_preferences", {
  userId: integer("user_id").primaryKey(),
  invoiceEmail: varchar("invoice_email", { length: 190 }).notNull().default(''),
  copyEmail: varchar("copy_email", { length: 190 }).notNull().default(''),
  autoSend: boolean("auto_send").notNull().default(true),
  referenceLabel: varchar("reference_label", { length: 80 }).notNull().default(''),
  referenceRequired: boolean("reference_required").notNull().default(false),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const partsStoreinvoiceDeliveriesTable = partsStore.table("invoice_deliveries", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  userId: integer("user_id").notNull(),
  orderId: integer("order_id").notNull(),
  documentKind: varchar("document_kind", { length: 30 }).notNull().default('invoice'),
  recipient: varchar("recipient", { length: 190 }).notNull(),
  copyRecipient: varchar("copy_recipient", { length: 190 }).notNull().default(''),
  status: varchar("status", { length: 20 }).notNull().default('captured'),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const partsStorenativePicqerOrderSnapshotsTable = partsStore.table(
  "native_picqer_order_snapshots",
  {
    nativeOrderId: varchar("native_order_id", { length: 80 }).primaryKey(),
    eventId: varchar("event_id", { length: 190 }).notNull(),
    contentHash: char("content_hash", { length: 64 }).notNull(),
    orderCreatedAt: timestamp("order_created_at", { withTimezone: true }).notNull(),
    snapshotJson: jsonb("snapshot_json").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("native_picqer_order_snapshots_event_unique").on(t.eventId)],
);

export const partsStorenativePicqerOutboxTable = partsStore.table(
  "native_picqer_outbox",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    nativeOrderId: varchar("native_order_id", { length: 80 }).notNull(),
    eventId: varchar("event_id", { length: 190 }).notNull(),
    contentHash: char("content_hash", { length: 64 }).notNull(),
    orderCreatedAt: timestamp("order_created_at", { withTimezone: true }).notNull(),
    snapshotJson: jsonb("snapshot_json").notNull(),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
    lockedOwner: varchar("locked_owner", { length: 64 }),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    lastError: varchar("last_error", { length: 500 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("native_picqer_outbox_event_unique").on(t.eventId),
    uniqueIndex("native_relay_order_hash").on(t.nativeOrderId, t.contentHash),
    index("native_relay_ready").on(t.status, t.nextAttemptAt, t.lockedUntil),
  ],
);
