SET @column_exists = (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'products'
      AND COLUMN_NAME = 'publication_status'
);
SET @sql = IF(
    @column_exists = 0,
    "ALTER TABLE products ADD COLUMN publication_status ENUM('draft','visible') NOT NULL DEFAULT 'draft' AFTER featured",
    'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Preserve only products that already satisfy the explicit group-price rule.
-- Everything incomplete remains available to staff as a draft.
UPDATE products p
SET p.publication_status = CASE
    WHEN p.active = 1
     AND p.sku <> ''
     AND p.name <> ''
     AND p.category_id IS NOT NULL
     AND p.brand_id IS NOT NULL
     AND NOT EXISTS (
         SELECT 1
         FROM customer_groups cg
         LEFT JOIN group_prices gp
           ON gp.group_id = cg.id
          AND gp.product_id = p.id
          AND gp.price_eur_cents IS NOT NULL
         WHERE gp.product_id IS NULL
     )
    THEN 'visible'
    ELSE 'draft'
END;