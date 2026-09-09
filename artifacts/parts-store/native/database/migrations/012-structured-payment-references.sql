SET @reference_type_sql = (
 SELECT IF(COUNT(*)=0,
  'ALTER TABLE orders ADD COLUMN payment_reference_type VARCHAR(4) NULL AFTER payment_state',
  'SELECT 1')
 FROM INFORMATION_SCHEMA.COLUMNS
 WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='orders' AND COLUMN_NAME='payment_reference_type'
);
PREPARE reference_type_stmt FROM @reference_type_sql;
EXECUTE reference_type_stmt;
DEALLOCATE PREPARE reference_type_stmt;

SET @reference_sql = (
 SELECT IF(COUNT(*)=0,
  'ALTER TABLE orders ADD COLUMN payment_reference VARCHAR(27) NULL AFTER payment_reference_type',
  'SELECT 1')
 FROM INFORMATION_SCHEMA.COLUMNS
 WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='orders' AND COLUMN_NAME='payment_reference'
);
PREPARE reference_stmt FROM @reference_sql;
EXECUTE reference_stmt;
DEALLOCATE PREPARE reference_stmt;

SET @reference_index_sql = (
 SELECT IF(COUNT(*)=0,
  'ALTER TABLE orders ADD UNIQUE INDEX orders_payment_reference_unique (payment_reference)',
  'SELECT 1')
 FROM INFORMATION_SCHEMA.STATISTICS
 WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='orders' AND INDEX_NAME='orders_payment_reference_unique'
);
PREPARE reference_index_stmt FROM @reference_index_sql;
EXECUTE reference_index_stmt;
DEALLOCATE PREPARE reference_index_stmt;

CREATE TABLE IF NOT EXISTS imported_payments (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,external_id VARCHAR(190) NOT NULL UNIQUE,
  reference VARCHAR(27) NOT NULL,amount_cents BIGINT UNSIGNED NOT NULL,currency CHAR(3) NOT NULL,
  booked_at DATE NOT NULL,order_id INT UNSIGNED NULL,status VARCHAR(30) NOT NULL,
  imported_by INT UNSIGNED NOT NULL,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(order_id) REFERENCES orders(id),FOREIGN KEY(imported_by) REFERENCES users(id),
  INDEX(reference),INDEX(order_id)
) ENGINE=InnoDB;