-- Native webshop relay staging is deliberately independent of shared orders,
-- customers, and products. Payloads are immutable snapshots, not credentials.
CREATE TABLE IF NOT EXISTS native_order_snapshots (
  native_order_id text PRIMARY KEY,
  event_id text NOT NULL UNIQUE,
  content_hash text NOT NULL,
  order_created_at timestamptz NOT NULL,
  snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS native_picqer_outbox (
  id bigserial PRIMARY KEY, native_order_id text NOT NULL,
  event_id text NOT NULL UNIQUE, content_hash text NOT NULL,
  order_created_at timestamptz NOT NULL,
  snapshot jsonb NOT NULL, status text NOT NULL DEFAULT 'pending',
  attempts bigint NOT NULL DEFAULT 0, next_attempt_at timestamptz NOT NULL DEFAULT now(),
  locked_owner text, locked_until timestamptz, last_error text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS native_catalog_skus (
  native_product_id text PRIMARY KEY, sku text NOT NULL UNIQUE,
  active boolean NOT NULL, picqer_product_id bigint, content_hash text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS native_stock_state (
  sku text PRIMARY KEY, native_product_id text NOT NULL, free_stock integer NOT NULL,
  version bigint NOT NULL, content_hash text NOT NULL, source_event_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS native_relay_events (
  event_id text PRIMARY KEY, content_hash text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS native_catalog_manifests (
  manifest_version bigint PRIMARY KEY, content_hash text NOT NULL UNIQUE,
  received_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS native_picqer_order_mappings (
  native_order_id text PRIMARY KEY, picqer_order_id bigint NOT NULL UNIQUE,
  foreign_reference text NOT NULL UNIQUE, created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS native_fulfilment_state (
  native_order_id text PRIMARY KEY, picqer_order_id bigint NOT NULL UNIQUE,
  tracking text NOT NULL DEFAULT '', status text NOT NULL DEFAULT 'processing',
  version bigint NOT NULL DEFAULT 1,
  reservation_acknowledged boolean NOT NULL DEFAULT false,
  processed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Upgrade safety for databases that received an earlier staging draft.
ALTER TABLE native_picqer_outbox ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE native_order_snapshots ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE native_picqer_outbox ADD COLUMN IF NOT EXISTS order_created_at timestamptz;
ALTER TABLE native_picqer_outbox ADD COLUMN IF NOT EXISTS locked_owner text;
ALTER TABLE native_picqer_outbox ADD COLUMN IF NOT EXISTS locked_until timestamptz;
ALTER TABLE native_order_snapshots ADD COLUMN IF NOT EXISTS order_created_at timestamptz;
ALTER TABLE native_stock_state ADD COLUMN IF NOT EXISTS source_event_at timestamptz;
ALTER TABLE native_fulfilment_state ADD COLUMN IF NOT EXISTS version bigint NOT NULL DEFAULT 1;
ALTER TABLE native_fulfilment_state ADD COLUMN IF NOT EXISTS reservation_acknowledged boolean NOT NULL DEFAULT false;
ALTER TABLE native_fulfilment_state ADD COLUMN IF NOT EXISTS processed_at timestamptz;
UPDATE native_picqer_outbox SET order_created_at=created_at WHERE order_created_at IS NULL;
UPDATE native_order_snapshots SET order_created_at=created_at WHERE order_created_at IS NULL;
ALTER TABLE native_picqer_outbox ALTER COLUMN order_created_at SET NOT NULL;
ALTER TABLE native_order_snapshots ALTER COLUMN order_created_at SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS native_picqer_outbox_order_hash
  ON native_picqer_outbox(native_order_id,content_hash);
CREATE INDEX IF NOT EXISTS native_picqer_outbox_ready
  ON native_picqer_outbox(status,next_attempt_at,locked_until);