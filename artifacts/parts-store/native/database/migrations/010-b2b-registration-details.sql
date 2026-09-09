SET @registration_columns_missing = (
    SELECT COUNT(*) = 0
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'phone'
);
SET @registration_migration = IF(
    @registration_columns_missing,
    'ALTER TABLE users ADD COLUMN phone VARCHAR(40) NOT NULL DEFAULT '''' AFTER company, ADD COLUMN website VARCHAR(255) NOT NULL DEFAULT '''' AFTER phone, ADD COLUMN business_activity VARCHAR(80) NOT NULL DEFAULT '''' AFTER website, ADD COLUMN tax_registration_type VARCHAR(40) NOT NULL DEFAULT '''' AFTER business_activity, ADD COLUMN tax_registration_number VARCHAR(80) NOT NULL DEFAULT '''' AFTER tax_registration_type, ADD COLUMN newsletter_opt_in TINYINT NOT NULL DEFAULT 0 AFTER tax_registration_number, ADD COLUMN terms_accepted_at DATETIME NULL AFTER newsletter_opt_in',
    'SELECT 1'
);
PREPARE registration_statement FROM @registration_migration;
EXECUTE registration_statement;
DEALLOCATE PREPARE registration_statement;