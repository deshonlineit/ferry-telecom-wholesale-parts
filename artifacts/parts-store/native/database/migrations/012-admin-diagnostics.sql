-- Redacted operational diagnostics; intentionally not the messages/outbox table.
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