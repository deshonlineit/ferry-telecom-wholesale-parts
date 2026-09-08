SET @payment_state_sql = (
 SELECT IF(COUNT(*) = 0,
  'ALTER TABLE orders ADD COLUMN payment_state VARCHAR(30) NOT NULL DEFAULT ''pending'' AFTER payment_method',
  'SELECT 1')
 FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'payment_state'
);
PREPARE payment_state_stmt FROM @payment_state_sql;
EXECUTE payment_state_stmt;
DEALLOCATE PREPARE payment_state_stmt;

SET @payment_terms_sql = (
 SELECT IF(COUNT(*) = 0,
  'ALTER TABLE orders ADD COLUMN payment_terms_json JSON NULL AFTER payment_state',
  'SELECT 1')
 FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'payment_terms_json'
);
PREPARE payment_terms_stmt FROM @payment_terms_sql;
EXECUTE payment_terms_stmt;
DEALLOCATE PREPARE payment_terms_stmt;

SET @checkout_snapshot_sql = (
 SELECT IF(COUNT(*) = 0,
  'ALTER TABLE orders ADD COLUMN checkout_snapshot JSON NULL AFTER payment_terms_json',
  'SELECT 1')
 FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'checkout_snapshot'
);
PREPARE checkout_snapshot_stmt FROM @checkout_snapshot_sql;
EXECUTE checkout_snapshot_stmt;
DEALLOCATE PREPARE checkout_snapshot_stmt;

SET @latest_payment_event_sql = (
 SELECT IF(COUNT(*) = 0,
  'ALTER TABLE orders ADD COLUMN latest_payment_event_at BIGINT UNSIGNED NOT NULL DEFAULT 0 AFTER payment_state',
  'SELECT 1')
 FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'latest_payment_event_at'
);
PREPARE latest_payment_event_stmt FROM @latest_payment_event_sql;
EXECUTE latest_payment_event_stmt;
DEALLOCATE PREPARE latest_payment_event_stmt;

SET @latest_payment_event_id_sql = (
 SELECT IF(COUNT(*) = 0,
  'ALTER TABLE orders ADD COLUMN latest_payment_event_id VARCHAR(190) NOT NULL DEFAULT '''' AFTER latest_payment_event_at',
  'SELECT 1')
 FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'latest_payment_event_id'
);
PREPARE latest_payment_event_id_stmt FROM @latest_payment_event_id_sql;
EXECUTE latest_payment_event_id_stmt;
DEALLOCATE PREPARE latest_payment_event_id_stmt;

CREATE TABLE IF NOT EXISTS customer_payment_entitlements (
 user_id INT UNSIGNED NOT NULL,payment_method VARCHAR(30) NOT NULL,enabled TINYINT(1) NOT NULL DEFAULT 0,
 granted_by INT UNSIGNED NULL,granted_at DATETIME NULL,revoked_by INT UNSIGNED NULL,revoked_at DATETIME NULL,
 PRIMARY KEY(user_id,payment_method),FOREIGN KEY(user_id) REFERENCES users(id),
 FOREIGN KEY(granted_by) REFERENCES users(id),FOREIGN KEY(revoked_by) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS payment_attempts (
 id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,order_id INT UNSIGNED NOT NULL,payment_method VARCHAR(30) NOT NULL,
 provider_id VARCHAR(190) NULL,provider_event_id VARCHAR(190) NULL,provider_event_created_at BIGINT UNSIGNED NOT NULL DEFAULT 0,
 state VARCHAR(30) NOT NULL,payload JSON NULL,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 UNIQUE(provider_event_id),INDEX(order_id,state),INDEX(provider_id),FOREIGN KEY(order_id) REFERENCES orders(id)
) ENGINE=InnoDB;

SET @provider_event_created_sql = (
 SELECT IF(COUNT(*) = 0,
  'ALTER TABLE payment_attempts ADD COLUMN provider_event_created_at BIGINT UNSIGNED NOT NULL DEFAULT 0 AFTER provider_event_id',
  'SELECT 1')
 FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payment_attempts' AND COLUMN_NAME = 'provider_event_created_at'
);
PREPARE provider_event_created_stmt FROM @provider_event_created_sql;
EXECUTE provider_event_created_stmt;
DEALLOCATE PREPARE provider_event_created_stmt;