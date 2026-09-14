UPDATE products
SET category_id = (SELECT id FROM categories WHERE slug = 'housing' LIMIT 1)
WHERE sku IN ('SAS25FE010', 'SAS25FE011', 'SAS25FE012', 'SAS25FE013')
  AND category_id = (SELECT id FROM categories WHERE slug = 'cameras' LIMIT 1);

UPDATE products
SET category_id = (SELECT id FROM categories WHERE slug = 'adhesive' LIMIT 1)
WHERE sku = 'SAS25FE014'
  AND category_id = (SELECT id FROM categories WHERE slug = 'housing' LIMIT 1);