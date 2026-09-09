-- Immutable native order snapshots/outbox. No shared API foreign keys.
CREATE TABLE IF NOT EXISTS native_picqer_order_snapshots (
  native_order_id VARCHAR(80) PRIMARY KEY, event_id VARCHAR(190) NOT NULL UNIQUE,
  content_hash CHAR(64) NOT NULL, order_created_at TIMESTAMP NOT NULL, snapshot_json JSON NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS native_picqer_outbox (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, native_order_id VARCHAR(80) NOT NULL,
  event_id VARCHAR(190) NOT NULL UNIQUE, content_hash CHAR(64) NOT NULL,
  order_created_at TIMESTAMP NOT NULL, snapshot_json JSON NOT NULL, status VARCHAR(20) NOT NULL DEFAULT 'pending',
  attempts INT UNSIGNED NOT NULL DEFAULT 0, next_attempt_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  locked_owner VARCHAR(64) NULL, locked_until TIMESTAMP NULL, last_error VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY native_relay_order_hash (native_order_id, content_hash),
  KEY native_relay_ready (status, next_attempt_at, locked_until)
);
CREATE TABLE IF NOT EXISTS native_catalog_skus (
  native_product_id VARCHAR(80) PRIMARY KEY, sku VARCHAR(100) NOT NULL,
  active TINYINT(1) NOT NULL, picqer_product_id BIGINT NULL, content_hash CHAR(64) NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS native_stock_state (
  sku VARCHAR(100) PRIMARY KEY, native_product_id VARCHAR(80) NOT NULL,
  free_stock INT NOT NULL, version BIGINT NOT NULL, content_hash CHAR(64) NOT NULL,
  source_event_at TIMESTAMP NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS native_picqer_order_mappings (
  native_order_id VARCHAR(80) PRIMARY KEY, picqer_order_id BIGINT UNSIGNED NOT NULL UNIQUE,
  foreign_reference VARCHAR(190) NOT NULL UNIQUE, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS native_fulfilment_state (
  native_order_id VARCHAR(80) PRIMARY KEY, picqer_order_id BIGINT UNSIGNED NOT NULL UNIQUE,
  tracking VARCHAR(190) NOT NULL DEFAULT '', status VARCHAR(30) NOT NULL DEFAULT 'processing',
  version BIGINT UNSIGNED NOT NULL DEFAULT 1,
  reservation_acknowledged TINYINT(1) NOT NULL DEFAULT 0,
  processed_at TIMESTAMP NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Converge databases that received an earlier staging draft.
SET @s=(SELECT IF(COUNT(*)=0,'ALTER TABLE native_picqer_outbox ADD COLUMN created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP',
  'SELECT 1') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='native_picqer_outbox' AND COLUMN_NAME='created_at');
PREPARE q FROM @s; EXECUTE q; DEALLOCATE PREPARE q;
SET @s=(SELECT IF(COUNT(*)=0,'ALTER TABLE native_picqer_order_snapshots ADD COLUMN created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP',
  'SELECT 1') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='native_picqer_order_snapshots' AND COLUMN_NAME='created_at');
PREPARE q FROM @s; EXECUTE q; DEALLOCATE PREPARE q;
SET @s=(SELECT IF(COUNT(*)=0,'ALTER TABLE native_picqer_outbox ADD COLUMN locked_owner VARCHAR(64) NULL',
  'SELECT 1') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='native_picqer_outbox' AND COLUMN_NAME='locked_owner');
PREPARE q FROM @s; EXECUTE q; DEALLOCATE PREPARE q;
SET @s=(SELECT IF(COUNT(*)=0,'ALTER TABLE native_picqer_outbox ADD COLUMN locked_until TIMESTAMP NULL',
  'SELECT 1') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='native_picqer_outbox' AND COLUMN_NAME='locked_until');
PREPARE q FROM @s; EXECUTE q; DEALLOCATE PREPARE q;
SET @s=(SELECT IF(COUNT(*)=0,'ALTER TABLE native_picqer_outbox ADD COLUMN order_created_at TIMESTAMP NULL',
  'SELECT 1') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='native_picqer_outbox' AND COLUMN_NAME='order_created_at');
PREPARE q FROM @s; EXECUTE q; DEALLOCATE PREPARE q;
SET @s=(SELECT IF(COUNT(*)=0,'ALTER TABLE native_picqer_order_snapshots ADD COLUMN order_created_at TIMESTAMP NULL',
  'SELECT 1') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='native_picqer_order_snapshots' AND COLUMN_NAME='order_created_at');
PREPARE q FROM @s; EXECUTE q; DEALLOCATE PREPARE q;
SET @s=(SELECT IF(COUNT(*)=0,'ALTER TABLE native_stock_state ADD COLUMN source_event_at TIMESTAMP NULL',
  'SELECT 1') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='native_stock_state' AND COLUMN_NAME='source_event_at');
PREPARE q FROM @s; EXECUTE q; DEALLOCATE PREPARE q;
SET @s=(SELECT IF(COUNT(*)=0,'ALTER TABLE native_fulfilment_state ADD COLUMN version BIGINT UNSIGNED NOT NULL DEFAULT 1',
  'SELECT 1') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='native_fulfilment_state' AND COLUMN_NAME='version');
PREPARE q FROM @s; EXECUTE q; DEALLOCATE PREPARE q;
SET @s=(SELECT IF(COUNT(*)=0,'ALTER TABLE native_fulfilment_state ADD COLUMN reservation_acknowledged TINYINT(1) NOT NULL DEFAULT 0',
  'SELECT 1') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='native_fulfilment_state' AND COLUMN_NAME='reservation_acknowledged');
PREPARE q FROM @s; EXECUTE q; DEALLOCATE PREPARE q;
SET @s=(SELECT IF(COUNT(*)=0,'ALTER TABLE native_fulfilment_state ADD COLUMN processed_at TIMESTAMP NULL',
  'SELECT 1') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='native_fulfilment_state' AND COLUMN_NAME='processed_at');
PREPARE q FROM @s; EXECUTE q; DEALLOCATE PREPARE q;
UPDATE native_picqer_outbox SET order_created_at=created_at WHERE order_created_at IS NULL;
UPDATE native_picqer_order_snapshots SET order_created_at=created_at WHERE order_created_at IS NULL;
ALTER TABLE native_picqer_outbox MODIFY order_created_at TIMESTAMP NOT NULL;
ALTER TABLE native_picqer_order_snapshots MODIFY order_created_at TIMESTAMP NOT NULL;
SET @s=(SELECT IF(COUNT(*)=0,'ALTER TABLE native_picqer_outbox ADD INDEX native_relay_ready(status,next_attempt_at,locked_until)',
  'SELECT 1') FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='native_picqer_outbox' AND INDEX_NAME='native_relay_ready');
PREPARE q FROM @s; EXECUTE q; DEALLOCATE PREPARE q;