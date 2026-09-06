ALTER TABLE "products"
  ADD COLUMN IF NOT EXISTS "images" jsonb NOT NULL DEFAULT '[]'::jsonb;