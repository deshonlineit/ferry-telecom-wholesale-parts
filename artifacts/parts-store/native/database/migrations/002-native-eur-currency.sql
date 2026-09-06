SET @schema_name = DATABASE();

SET @ddl = IF(
 (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@schema_name AND TABLE_NAME='products' AND COLUMN_NAME='purchase_price_eur_cents')=0,
 'ALTER TABLE products ADD COLUMN purchase_price_eur_cents INT UNSIGNED NULL AFTER list_price_cents',
 'SELECT 1'
);
PREPARE migration_statement FROM @ddl; EXECUTE migration_statement; DEALLOCATE PREPARE migration_statement;
SET @ddl = IF(
 (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@schema_name AND TABLE_NAME='products' AND COLUMN_NAME='list_price_eur_cents')=0,
 'ALTER TABLE products ADD COLUMN list_price_eur_cents INT UNSIGNED NULL AFTER purchase_price_eur_cents',
 'SELECT 1'
);
PREPARE migration_statement FROM @ddl; EXECUTE migration_statement; DEALLOCATE PREPARE migration_statement;
SET @ddl = IF(
 (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@schema_name AND TABLE_NAME='products' AND COLUMN_NAME='pricing_version')=0,
 'ALTER TABLE products ADD COLUMN pricing_version INT UNSIGNED NOT NULL DEFAULT 0 AFTER list_price_eur_cents',
 'SELECT 1'
);
PREPARE migration_statement FROM @ddl; EXECUTE migration_statement; DEALLOCATE PREPARE migration_statement;
SET @ddl = IF(
 (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@schema_name AND TABLE_NAME='group_prices' AND COLUMN_NAME='price_eur_cents')=0,
 'ALTER TABLE group_prices ADD COLUMN price_eur_cents INT UNSIGNED NULL AFTER price_cents',
 'SELECT 1'
);
PREPARE migration_statement FROM @ddl; EXECUTE migration_statement; DEALLOCATE PREPARE migration_statement;

CREATE TABLE IF NOT EXISTS exchange_rates (
 base_currency CHAR(3) NOT NULL,quote_currency CHAR(3) NOT NULL,rate_ppm BIGINT UNSIGNED NOT NULL,
 rate_date DATE NOT NULL,fetched_at DATETIME NOT NULL,source_url VARCHAR(500) NOT NULL,
 PRIMARY KEY(base_currency,quote_currency),INDEX(rate_date)
) ENGINE=InnoDB;

SET @ddl = IF(
 (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@schema_name AND TABLE_NAME='orders' AND COLUMN_NAME='exchange_rate_ppm')=0,
 'ALTER TABLE orders ADD COLUMN exchange_rate_ppm BIGINT UNSIGNED NULL AFTER currency',
 'SELECT 1'
);
PREPARE migration_statement FROM @ddl; EXECUTE migration_statement; DEALLOCATE PREPARE migration_statement;
SET @ddl = IF(
 (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@schema_name AND TABLE_NAME='orders' AND COLUMN_NAME='exchange_rate_date')=0,
 'ALTER TABLE orders ADD COLUMN exchange_rate_date DATE NULL AFTER exchange_rate_ppm',
 'SELECT 1'
);
PREPARE migration_statement FROM @ddl; EXECUTE migration_statement; DEALLOCATE PREPARE migration_statement;
SET @ddl = IF(
 (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@schema_name AND TABLE_NAME='orders' AND COLUMN_NAME='base_currency')=0,
 'ALTER TABLE orders ADD COLUMN base_currency CHAR(3) NULL AFTER exchange_rate_date',
 'SELECT 1'
);
PREPARE migration_statement FROM @ddl; EXECUTE migration_statement; DEALLOCATE PREPARE migration_statement;
SET @ddl = IF(
 (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@schema_name AND TABLE_NAME='order_items' AND COLUMN_NAME='price_eur_cents')=0,
 'ALTER TABLE order_items ADD COLUMN price_eur_cents INT UNSIGNED NULL AFTER total_cents',
 'SELECT 1'
);
PREPARE migration_statement FROM @ddl; EXECUTE migration_statement; DEALLOCATE PREPARE migration_statement;