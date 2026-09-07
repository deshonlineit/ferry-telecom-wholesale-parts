SET @shipping_method_code_sql = (
 SELECT IF(COUNT(*) = 0,
  'ALTER TABLE orders ADD COLUMN shipping_method_code VARCHAR(40) NULL AFTER address_json',
  'SELECT 1')
 FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'shipping_method_code'
);
PREPARE shipping_method_code_stmt FROM @shipping_method_code_sql;
EXECUTE shipping_method_code_stmt;
DEALLOCATE PREPARE shipping_method_code_stmt;

SET @shipping_method_name_sql = (
 SELECT IF(COUNT(*) = 0,
  'ALTER TABLE orders ADD COLUMN shipping_method_name VARCHAR(100) NULL AFTER shipping_method_code',
  'SELECT 1')
 FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'shipping_method_name'
);
PREPARE shipping_method_name_stmt FROM @shipping_method_name_sql;
EXECUTE shipping_method_name_stmt;
DEALLOCATE PREPARE shipping_method_name_stmt;

SET @shipping_carrier_sql = (
 SELECT IF(COUNT(*) = 0,
  'ALTER TABLE orders ADD COLUMN shipping_carrier VARCHAR(60) NULL AFTER shipping_method_name',
  'SELECT 1')
 FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'shipping_carrier'
);
PREPARE shipping_carrier_stmt FROM @shipping_carrier_sql;
EXECUTE shipping_carrier_stmt;
DEALLOCATE PREPARE shipping_carrier_stmt;