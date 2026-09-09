-- Additive lease fields for concurrent, crash-safe workers. Existing 0002
-- tables and rows remain intact.
ALTER TABLE picqer_outbox ADD COLUMN IF NOT EXISTS locked_owner text;
ALTER TABLE picqer_outbox ADD COLUMN IF NOT EXISTS locked_until timestamptz;
CREATE INDEX IF NOT EXISTS picqer_outbox_lease_idx
  ON picqer_outbox(status, next_attempt_at, locked_until);