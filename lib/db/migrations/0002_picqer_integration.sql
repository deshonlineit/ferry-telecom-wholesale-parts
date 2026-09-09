-- Credentials and raw webhook payloads are intentionally not persisted.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking text;
CREATE TABLE IF NOT EXISTS picqer_outbox (
  id bigserial PRIMARY KEY, order_id integer NOT NULL UNIQUE REFERENCES orders(id),
  foreign_reference text NOT NULL UNIQUE, payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending', attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(), last_error text,
  locked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS picqer_outbox_ready_idx ON picqer_outbox(status,next_attempt_at);
CREATE TABLE IF NOT EXISTS picqer_order_mappings (
  order_id integer PRIMARY KEY REFERENCES orders(id), foreign_reference text NOT NULL UNIQUE,
  picqer_order_id bigint UNIQUE, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS picqer_webhook_events (
  id bigserial PRIMARY KEY, event_key char(64) NOT NULL UNIQUE, event_type text NOT NULL,
  outcome text NOT NULL, received_at timestamptz NOT NULL DEFAULT now(), processed_at timestamptz, detail text NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS picqer_product_state (
  product_id integer PRIMARY KEY REFERENCES products(id), productcode text NOT NULL UNIQUE,
  picqer_product_id bigint UNIQUE, last_free_stock integer, last_stock_event_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now()
);