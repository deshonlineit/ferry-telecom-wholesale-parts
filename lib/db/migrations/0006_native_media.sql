ALTER TABLE parts_store.images ADD COLUMN IF NOT EXISTS original_object text;
ALTER TABLE parts_store.images ADD COLUMN IF NOT EXISTS media_storage text NOT NULL DEFAULT 'filesystem';
ALTER TABLE parts_store.images ADD COLUMN IF NOT EXISTS width integer;
ALTER TABLE parts_store.images ADD COLUMN IF NOT EXISTS height integer;
ALTER TABLE parts_store.images ADD COLUMN IF NOT EXISTS mime_type text;
ALTER TABLE parts_store.images ADD COLUMN IF NOT EXISTS byte_size integer;
CREATE TABLE IF NOT EXISTS parts_store.native_media_events (
  event_id text PRIMARY KEY,
  content_hash text NOT NULL,
  completed_at timestamptz
);