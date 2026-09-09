CREATE TABLE IF NOT EXISTS customer_groups (
 id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT, name VARCHAR(100) NOT NULL
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS users (
 id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT, name VARCHAR(140) NOT NULL,
 email VARCHAR(190) NOT NULL UNIQUE, password_hash VARCHAR(255) NOT NULL,
 company VARCHAR(190) NOT NULL DEFAULT '', role ENUM('customer','staff') NOT NULL DEFAULT 'customer',
 group_id INT UNSIGNED NOT NULL DEFAULT 1, status ENUM('active','pending','blocked') NOT NULL DEFAULT 'pending',
 phone VARCHAR(40) NOT NULL DEFAULT '', website VARCHAR(255) NOT NULL DEFAULT '',
 business_activity VARCHAR(80) NOT NULL DEFAULT '',
 tax_registration_type VARCHAR(40) NOT NULL DEFAULT '',
 tax_registration_number VARCHAR(80) NOT NULL DEFAULT '',
 newsletter_opt_in TINYINT NOT NULL DEFAULT 0, terms_accepted_at DATETIME NULL,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(group_id) REFERENCES customer_groups(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS reset_tokens (
 id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT, user_id INT UNSIGNED NOT NULL,
 token_hash CHAR(64) NOT NULL UNIQUE, expires_at DATETIME NOT NULL, used_at DATETIME NULL,
 FOREIGN KEY(user_id) REFERENCES users(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS login_attempts (
 fingerprint CHAR(64) PRIMARY KEY, attempts INT NOT NULL DEFAULT 0, last_attempt DATETIME NOT NULL
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS categories (
 id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT, name VARCHAR(140) NOT NULL, slug VARCHAR(190) NOT NULL UNIQUE
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS brands (
 id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT, name VARCHAR(140) NOT NULL UNIQUE
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS device_models (
 id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT, brand_id INT UNSIGNED NOT NULL, name VARCHAR(190) NOT NULL,
 UNIQUE(brand_id,name), FOREIGN KEY(brand_id) REFERENCES brands(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS products (
 id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT, sku VARCHAR(190) NOT NULL UNIQUE, name VARCHAR(500) NOT NULL,
 description TEXT NOT NULL, category_id INT UNSIGNED NULL, brand_id INT UNSIGNED NULL,
 quality VARCHAR(100) NOT NULL DEFAULT '', stock INT UNSIGNED NOT NULL DEFAULT 0,
 list_price_cents INT UNSIGNED NOT NULL DEFAULT 0,
 purchase_price_eur_cents INT UNSIGNED NULL,list_price_eur_cents INT UNSIGNED NULL,pricing_version INT UNSIGNED NOT NULL DEFAULT 0,
 minimum_quantity INT UNSIGNED NOT NULL DEFAULT 1,
 image_url VARCHAR(500) NOT NULL DEFAULT '', featured TINYINT NOT NULL DEFAULT 0, active TINYINT NOT NULL DEFAULT 1,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 INDEX(category_id),INDEX(brand_id),INDEX(active,featured),INDEX(name(100)),
 FOREIGN KEY(category_id) REFERENCES categories(id), FOREIGN KEY(brand_id) REFERENCES brands(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS product_models (
 product_id INT UNSIGNED NOT NULL, model_id INT UNSIGNED NOT NULL, PRIMARY KEY(product_id,model_id),
 FOREIGN KEY(product_id) REFERENCES products(id), FOREIGN KEY(model_id) REFERENCES device_models(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS product_model_sources (
 product_id INT UNSIGNED NOT NULL,model_id INT UNSIGNED NOT NULL,
 source ENUM('source_taxonomy','product_title') NOT NULL,evidence VARCHAR(500) NOT NULL DEFAULT '',
 updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 PRIMARY KEY(product_id,model_id,source),
 FOREIGN KEY(product_id,model_id) REFERENCES product_models(product_id,model_id) ON DELETE CASCADE
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS group_prices (
 product_id INT UNSIGNED NOT NULL, group_id INT UNSIGNED NOT NULL, price_cents INT UNSIGNED NOT NULL,
 price_eur_cents INT UNSIGNED NULL,
 PRIMARY KEY(product_id,group_id), FOREIGN KEY(product_id) REFERENCES products(id), FOREIGN KEY(group_id) REFERENCES customer_groups(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS images (
 id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT, product_id INT UNSIGNED NOT NULL,
 url VARCHAR(500) NOT NULL, variants JSON NOT NULL, original_path VARCHAR(500) NOT NULL,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(product_id) REFERENCES products(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS addresses (
 id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT, user_id INT UNSIGNED NOT NULL,
 label VARCHAR(100) NOT NULL, name VARCHAR(140) NOT NULL, company VARCHAR(190) NOT NULL DEFAULT '',
 line1 VARCHAR(190) NOT NULL,line2 VARCHAR(190) NOT NULL DEFAULT '', postal_code VARCHAR(30) NOT NULL,
 city VARCHAR(100) NOT NULL,country CHAR(2) NOT NULL DEFAULT 'CH', is_default TINYINT NOT NULL DEFAULT 0,
 FOREIGN KEY(user_id) REFERENCES users(id),INDEX(user_id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS billing_addresses (
 user_id INT UNSIGNED PRIMARY KEY,
 label VARCHAR(100) NOT NULL, name VARCHAR(140) NOT NULL, company VARCHAR(190) NOT NULL DEFAULT '',
 line1 VARCHAR(190) NOT NULL,line2 VARCHAR(190) NOT NULL DEFAULT '',postal_code VARCHAR(30) NOT NULL,
 city VARCHAR(100) NOT NULL,country CHAR(2) NOT NULL DEFAULT 'CH',
 updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 FOREIGN KEY(user_id) REFERENCES users(id)
) ENGINE=InnoDB;
INSERT IGNORE INTO billing_addresses(user_id,label,name,company,line1,line2,postal_code,city,country)
SELECT a.user_id,'Billing address',a.name,a.company,a.line1,a.line2,a.postal_code,a.city,a.country
FROM addresses a
WHERE a.id=(SELECT a2.id FROM addresses a2 WHERE a2.user_id=a.user_id ORDER BY a2.is_default DESC,a2.id ASC LIMIT 1);
CREATE TABLE IF NOT EXISTS cart_items (
 user_id INT UNSIGNED NOT NULL,product_id INT UNSIGNED NOT NULL,quantity INT UNSIGNED NOT NULL,
 PRIMARY KEY(user_id,product_id), FOREIGN KEY(user_id) REFERENCES users(id),FOREIGN KEY(product_id) REFERENCES products(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS orders (
 id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT, number VARCHAR(40) NOT NULL UNIQUE,
 user_id INT UNSIGNED NOT NULL, status VARCHAR(30) NOT NULL DEFAULT 'on_hold',
 subtotal_cents INT UNSIGNED NOT NULL,tax_cents INT UNSIGNED NOT NULL,shipping_cents INT UNSIGNED NOT NULL,total_cents INT UNSIGNED NOT NULL,
 tax_bps INT UNSIGNED NOT NULL, currency CHAR(3) NOT NULL DEFAULT 'CHF',
 exchange_rate_ppm BIGINT UNSIGNED NULL,exchange_rate_date DATE NULL,base_currency CHAR(3) NULL,
 address_json JSON NOT NULL,shipping_method_code VARCHAR(40) NULL,
 shipping_method_name VARCHAR(100) NULL,shipping_carrier VARCHAR(60) NULL,
   payment_method VARCHAR(30) NOT NULL,payment_state VARCHAR(30) NOT NULL DEFAULT 'pending',
   payment_reference_type VARCHAR(4) NULL,payment_reference VARCHAR(27) NULL,
  latest_payment_event_at BIGINT UNSIGNED NOT NULL DEFAULT 0,
  latest_payment_event_id VARCHAR(190) NOT NULL DEFAULT '',
  payment_terms_json JSON NULL,checkout_snapshot JSON NULL,notes TEXT NOT NULL,tracking VARCHAR(190) NOT NULL DEFAULT '',
 idempotency_key VARCHAR(100) NOT NULL,stock_restored TINYINT NOT NULL DEFAULT 0,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, UNIQUE(user_id,idempotency_key),
  FOREIGN KEY(user_id) REFERENCES users(id),INDEX(status),
  UNIQUE INDEX orders_payment_reference_unique (payment_reference)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS customer_payment_entitlements (
  user_id INT UNSIGNED NOT NULL,payment_method VARCHAR(30) NOT NULL,enabled TINYINT(1) NOT NULL DEFAULT 0,
  granted_by INT UNSIGNED NULL,granted_at DATETIME NULL,revoked_by INT UNSIGNED NULL,revoked_at DATETIME NULL,
  PRIMARY KEY(user_id,payment_method),FOREIGN KEY(user_id) REFERENCES users(id),
  FOREIGN KEY(granted_by) REFERENCES users(id),FOREIGN KEY(revoked_by) REFERENCES users(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS payment_attempts (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,order_id INT UNSIGNED NOT NULL,payment_method VARCHAR(30) NOT NULL,
  provider_id VARCHAR(190) NULL,provider_event_id VARCHAR(190) NULL,provider_event_created_at BIGINT UNSIGNED NOT NULL DEFAULT 0,
  state VARCHAR(30) NOT NULL,payload JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE(provider_event_id),INDEX(order_id,state),INDEX(provider_id),FOREIGN KEY(order_id) REFERENCES orders(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS order_items (
 id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,order_id INT UNSIGNED NOT NULL,product_id INT UNSIGNED NOT NULL,
 name VARCHAR(500) NOT NULL,sku VARCHAR(190) NOT NULL,quantity INT UNSIGNED NOT NULL,
 price_cents INT UNSIGNED NOT NULL,total_cents INT UNSIGNED NOT NULL,price_eur_cents INT UNSIGNED NULL,
 FOREIGN KEY(order_id) REFERENCES orders(id),FOREIGN KEY(product_id) REFERENCES products(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS order_events (
 id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,order_id INT UNSIGNED NOT NULL,status VARCHAR(30) NOT NULL,note TEXT NOT NULL,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(order_id) REFERENCES orders(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS invoice_accounting (
 order_id INT UNSIGNED PRIMARY KEY,verified TINYINT(1) NOT NULL DEFAULT 0,due_date DATE NULL,
 paid_cents BIGINT UNSIGNED NOT NULL DEFAULT 0,note TEXT NOT NULL,version INT UNSIGNED NOT NULL DEFAULT 0,
 updated_by INT UNSIGNED NOT NULL,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 FOREIGN KEY(order_id) REFERENCES orders(id),FOREIGN KEY(updated_by) REFERENCES users(id),
 INDEX(due_date),INDEX(verified)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS imported_payments (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,external_id VARCHAR(190) NOT NULL UNIQUE,
  reference VARCHAR(27) NOT NULL,amount_cents BIGINT UNSIGNED NOT NULL,currency CHAR(3) NOT NULL,
  booked_at DATE NOT NULL,order_id INT UNSIGNED NULL,status VARCHAR(30) NOT NULL,
  imported_by INT UNSIGNED NOT NULL,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(order_id) REFERENCES orders(id),FOREIGN KEY(imported_by) REFERENCES users(id),
  INDEX(reference),INDEX(order_id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS returns (
 id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,number VARCHAR(40) NOT NULL UNIQUE,
 user_id INT UNSIGNED NOT NULL,order_id INT UNSIGNED NOT NULL,status VARCHAR(30) NOT NULL DEFAULT 'submitted',
 reason TEXT NOT NULL,credit_cents INT UNSIGNED NOT NULL DEFAULT 0,note TEXT NOT NULL,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(user_id) REFERENCES users(id),FOREIGN KEY(order_id) REFERENCES orders(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS return_items (
 id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,return_id INT UNSIGNED NOT NULL,order_item_id INT UNSIGNED NOT NULL,
 quantity INT UNSIGNED NOT NULL,UNIQUE(return_id,order_item_id),
 FOREIGN KEY(return_id) REFERENCES returns(id),FOREIGN KEY(order_item_id) REFERENCES order_items(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS return_creation_keys (
 idempotency_key VARCHAR(100) PRIMARY KEY,return_id INT UNSIGNED NOT NULL,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(return_id) REFERENCES returns(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS return_events (
 id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,return_id INT UNSIGNED NOT NULL,status VARCHAR(30) NOT NULL,note TEXT NOT NULL,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(return_id) REFERENCES returns(id)
) ENGINE=InnoDB;
/* Append-only RMA financial and inventory evidence.  These tables deliberately
   do not retrofit mutable order rows: order_items and orders are the price,
   tax and address snapshots used by the settlement code. */
CREATE TABLE IF NOT EXISTS return_settlements (
 id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,return_id INT UNSIGNED NOT NULL,
 idempotency_key VARCHAR(100) NOT NULL,kind ENUM('stripe_refund','invoice_credit') NOT NULL,
 status ENUM('pending','succeeded','failed') NOT NULL,amount_cents INT UNSIGNED NOT NULL,
 currency CHAR(3) NOT NULL,provider_reference VARCHAR(190) NULL,error_message VARCHAR(1000) NULL,
 snapshot JSON NOT NULL,created_by INT UNSIGNED NULL,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 settled_at DATETIME NULL,UNIQUE(return_id),UNIQUE(idempotency_key),INDEX(status,created_at),
 FOREIGN KEY(return_id) REFERENCES returns(id),FOREIGN KEY(created_by) REFERENCES users(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS customer_credit_notes (
 id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,number VARCHAR(60) NOT NULL UNIQUE,
 user_id INT UNSIGNED NOT NULL,order_id INT UNSIGNED NOT NULL,return_id INT UNSIGNED NOT NULL,
 settlement_id BIGINT UNSIGNED NOT NULL,issued_cents INT UNSIGNED NOT NULL,
 remaining_cents INT UNSIGNED NOT NULL,currency CHAR(3) NOT NULL,status ENUM('issued','void') NOT NULL DEFAULT 'issued',
 snapshot JSON NOT NULL,created_by INT UNSIGNED NULL,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(return_id),UNIQUE(settlement_id),INDEX(user_id,status),INDEX(order_id),
 FOREIGN KEY(user_id) REFERENCES users(id),FOREIGN KEY(order_id) REFERENCES orders(id),
 FOREIGN KEY(return_id) REFERENCES returns(id),FOREIGN KEY(settlement_id) REFERENCES return_settlements(id),
 FOREIGN KEY(created_by) REFERENCES users(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS credit_applications (
 id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,credit_note_id BIGINT UNSIGNED NOT NULL,
 target_order_id INT UNSIGNED NOT NULL,amount_cents INT UNSIGNED NOT NULL,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(credit_note_id,target_order_id),INDEX(target_order_id),
 FOREIGN KEY(credit_note_id) REFERENCES customer_credit_notes(id),FOREIGN KEY(target_order_id) REFERENCES orders(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS return_item_dispositions (
 id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,return_item_id INT UNSIGNED NOT NULL,
 received_quantity INT UNSIGNED NOT NULL,restock_quantity INT UNSIGNED NOT NULL DEFAULT 0,
 disposition ENUM('restock','quarantine','writeoff') NOT NULL,recorded_by INT UNSIGNED NULL,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,UNIQUE(return_item_id),
 FOREIGN KEY(return_item_id) REFERENCES return_items(id),FOREIGN KEY(recorded_by) REFERENCES users(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS return_stock_movements (
 id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,return_item_id INT UNSIGNED NOT NULL,
 product_id INT UNSIGNED NOT NULL,quantity INT UNSIGNED NOT NULL,kind ENUM('restock') NOT NULL,
 created_by INT UNSIGNED NULL,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(return_item_id,kind),INDEX(product_id,created_at),
 FOREIGN KEY(return_item_id) REFERENCES return_items(id),FOREIGN KEY(product_id) REFERENCES products(id),
 FOREIGN KEY(created_by) REFERENCES users(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS messages (
 id INT UNSIGNED PRIMARY KEY AUTO_INCREMENT,kind VARCHAR(100) NOT NULL,payload JSON NOT NULL,
 status VARCHAR(30) NOT NULL DEFAULT 'captured',created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;
-- Diagnostics are deliberately separate from the captured account/business
-- message queue.  Their context is redacted before it reaches this table.
CREATE TABLE IF NOT EXISTS diagnostics (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  reference VARCHAR(32) NOT NULL UNIQUE,
  severity VARCHAR(20) NOT NULL,
  category VARCHAR(100) NOT NULL,
  summary VARCHAR(1000) NOT NULL,
  context_json JSON NOT NULL,
  request_method VARCHAR(12) NULL,
  request_path VARCHAR(500) NULL,
  occurred_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at DATETIME NULL,
  resolved_by INT UNSIGNED NULL,
  INDEX diagnostics_occurred_at (occurred_at),
  INDEX diagnostics_severity_occurred (severity,occurred_at),
  INDEX diagnostics_category_occurred (category,occurred_at),
  INDEX diagnostics_reference (reference),
  INDEX diagnostics_resolution_occurred (resolved_at,occurred_at),
  FOREIGN KEY(resolved_by) REFERENCES users(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS audit_events (
 id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,user_id INT UNSIGNED NULL,action VARCHAR(100) NOT NULL,
 entity VARCHAR(100) NOT NULL,entity_id INT UNSIGNED NOT NULL,details JSON NOT NULL,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS settings (
 name VARCHAR(100) PRIMARY KEY,value VARCHAR(500) NOT NULL
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS exchange_rates (
 base_currency CHAR(3) NOT NULL,quote_currency CHAR(3) NOT NULL,rate_ppm BIGINT UNSIGNED NOT NULL,
 rate_date DATE NOT NULL,fetched_at DATETIME NOT NULL,source_url VARCHAR(500) NOT NULL,
 PRIMARY KEY(base_currency,quote_currency),INDEX(rate_date)
) ENGINE=InnoDB;