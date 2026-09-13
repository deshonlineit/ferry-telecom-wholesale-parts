SET @image_review_required_exists = (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'products'
    AND column_name = 'image_review_required'
);
SET @image_review_required_sql = IF(
  @image_review_required_exists = 0,
  'ALTER TABLE products ADD COLUMN image_review_required TINYINT NOT NULL DEFAULT 0 AFTER image_url',
  'SELECT 1'
);
PREPARE image_review_required_statement FROM @image_review_required_sql;
EXECUTE image_review_required_statement;
DEALLOCATE PREPARE image_review_required_statement;