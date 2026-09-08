ALTER TABLE users
    ADD COLUMN phone VARCHAR(40) NOT NULL DEFAULT '' AFTER company,
    ADD COLUMN website VARCHAR(255) NOT NULL DEFAULT '' AFTER phone,
    ADD COLUMN business_activity VARCHAR(80) NOT NULL DEFAULT '' AFTER website,
    ADD COLUMN tax_registration_type VARCHAR(40) NOT NULL DEFAULT '' AFTER business_activity,
    ADD COLUMN tax_registration_number VARCHAR(80) NOT NULL DEFAULT '' AFTER tax_registration_type,
    ADD COLUMN newsletter_opt_in TINYINT NOT NULL DEFAULT 0 AFTER tax_registration_number,
    ADD COLUMN terms_accepted_at DATETIME NULL AFTER newsletter_opt_in;