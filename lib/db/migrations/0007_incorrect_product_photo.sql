ALTER TABLE parts_store.products
  ADD COLUMN IF NOT EXISTS image_review_required boolean NOT NULL DEFAULT false;