SET @registration_profile_missing = (
    SELECT COUNT(*) = 0 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'first_name'
);
SET @registration_profile_migration = IF(
    @registration_profile_missing,
    'ALTER TABLE users ADD COLUMN first_name VARCHAR(70) NOT NULL DEFAULT '''' AFTER name, ADD COLUMN last_name VARCHAR(70) NOT NULL DEFAULT '''' AFTER first_name, ADD COLUMN username VARCHAR(80) NULL AFTER last_name, ADD UNIQUE KEY users_username_unique (username), ADD COLUMN business_type VARCHAR(80) NOT NULL DEFAULT '''' AFTER business_activity, ADD COLUMN eori_number VARCHAR(40) NOT NULL DEFAULT '''' AFTER business_type, ADD COLUMN billing_state VARCHAR(100) NOT NULL DEFAULT '''' AFTER eori_number',
    'SELECT 1'
);
PREPARE registration_profile_statement FROM @registration_profile_migration;
EXECUTE registration_profile_statement;
DEALLOCATE PREPARE registration_profile_statement;