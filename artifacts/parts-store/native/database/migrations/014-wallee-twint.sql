ALTER TABLE return_settlements
    MODIFY kind ENUM('stripe_refund','twint_refund','invoice_credit') NOT NULL;

INSERT INTO customer_payment_entitlements
    (user_id,payment_method,enabled,granted_by,granted_at,revoked_by,revoked_at)
SELECT user_id,'twint',enabled,granted_by,granted_at,revoked_by,revoked_at
FROM customer_payment_entitlements
WHERE payment_method='stripe'
ON DUPLICATE KEY UPDATE payment_method=VALUES(payment_method);

INSERT INTO customer_payment_entitlements
    (user_id,payment_method,enabled,granted_by,granted_at,revoked_by,revoked_at)
SELECT id,'twint',1,NULL,UTC_TIMESTAMP(),NULL,NULL
FROM users
WHERE role='customer' AND status='active'
ON DUPLICATE KEY UPDATE enabled=1,revoked_by=NULL,revoked_at=NULL;