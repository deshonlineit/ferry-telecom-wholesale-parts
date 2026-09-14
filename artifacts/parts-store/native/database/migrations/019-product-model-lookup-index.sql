SET @s=(SELECT IF(COUNT(*)=0,
  'ALTER TABLE product_models ADD INDEX product_models_model_product_idx(model_id,product_id)',
  'SELECT 1'
) FROM information_schema.statistics
  WHERE table_schema=DATABASE()
    AND table_name='product_models'
    AND index_name='product_models_model_product_idx');
PREPARE stmt FROM @s;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;