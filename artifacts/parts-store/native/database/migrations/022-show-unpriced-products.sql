UPDATE products
SET publication_status = 'visible'
WHERE active = 1
  AND publication_status = 'draft'
  AND sku <> ''
  AND name <> ''
  AND category_id IS NOT NULL
  AND brand_id IS NOT NULL;