-- B2B ordering workspace: saved order lists, back-in-stock alerts,
-- billing delivery preferences and the customer document archive.
-- Every statement is idempotent; start.sh replays this file on every boot.

CREATE TABLE IF NOT EXISTS order_lists (
  id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id INT UNSIGNED NOT NULL,
  name VARCHAR(120) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY order_lists_user_name (user_id, name),
  KEY order_lists_user_updated (user_id, updated_at),
  FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS order_list_items (
  list_id INT UNSIGNED NOT NULL,
  product_id INT UNSIGNED NOT NULL,
  quantity INT UNSIGNED NOT NULL DEFAULT 1,
  added_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (list_id, product_id),
  KEY order_list_items_product (product_id),
  FOREIGN KEY (list_id) REFERENCES order_lists(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS stock_alerts (
  id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id INT UNSIGNED NOT NULL,
  product_id INT UNSIGNED NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'waiting',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  notified_at DATETIME NULL,
  UNIQUE KEY stock_alerts_user_product (user_id, product_id),
  KEY stock_alerts_status (status, product_id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (product_id) REFERENCES products(id)
) ENGINE=InnoDB;

-- One billing delivery profile per customer account.  invoice_email is the
-- address the customer wants documents delivered to; it is independent from
-- the sign-in address so administration can be routed to a bookkeeper.
CREATE TABLE IF NOT EXISTS billing_preferences (
  user_id INT UNSIGNED PRIMARY KEY,
  invoice_email VARCHAR(190) NOT NULL DEFAULT '',
  copy_email VARCHAR(190) NOT NULL DEFAULT '',
  auto_send TINYINT(1) NOT NULL DEFAULT 1,
  reference_label VARCHAR(80) NOT NULL DEFAULT '',
  reference_required TINYINT(1) NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB;

-- Record of every document the shop scheduled for a customer's billing
-- address.  The isolated test shop never sends mail, so rows stay 'captured'
-- exactly like the existing password-reset outbox.
CREATE TABLE IF NOT EXISTS invoice_deliveries (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id INT UNSIGNED NOT NULL,
  order_id INT UNSIGNED NOT NULL,
  document_kind VARCHAR(30) NOT NULL DEFAULT 'invoice',
  recipient VARCHAR(190) NOT NULL,
  copy_recipient VARCHAR(190) NOT NULL DEFAULT '',
  status VARCHAR(20) NOT NULL DEFAULT 'captured',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY invoice_deliveries_order_kind (order_id, document_kind),
  KEY invoice_deliveries_user_created (user_id, created_at),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (order_id) REFERENCES orders(id)
) ENGINE=InnoDB;

-- Purchase reference the buyer supplied at checkout, printed on their
-- documents.  Added conditionally so replays never fail.
SET @column_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'customer_reference'
);
SET @statement := IF(
  @column_exists = 0,
  'ALTER TABLE orders ADD COLUMN customer_reference VARCHAR(80) NOT NULL DEFAULT ''''',
  'DO 0'
);
PREPARE alter_orders FROM @statement;
EXECUTE alter_orders;
DEALLOCATE PREPARE alter_orders;

-- Expected restock date so buyers can plan around an out-of-stock part.
SET @column_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'expected_restock_date'
);
SET @statement := IF(
  @column_exists = 0,
  'ALTER TABLE products ADD COLUMN expected_restock_date DATE NULL',
  'DO 0'
);
PREPARE alter_products FROM @statement;
EXECUTE alter_products;
DEALLOCATE PREPARE alter_products;

INSERT IGNORE INTO settings (name, value) VALUES ('order_cutoff_time', '17:00');
INSERT IGNORE INTO settings (name, value) VALUES ('order_cutoff_timezone', 'Europe/Zurich');
