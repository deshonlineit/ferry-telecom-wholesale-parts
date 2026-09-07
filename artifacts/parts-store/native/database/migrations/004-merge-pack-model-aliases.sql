-- Supplier labels such as "(10 Pack)" describe product packaging, not a device.
-- Move compatibility links to the canonical model before removing the alias.
INSERT IGNORE INTO product_models (product_id, model_id)
SELECT pm.product_id, canonical.id
FROM product_models pm
JOIN device_models alias_model ON alias_model.id = pm.model_id
JOIN device_models canonical
  ON canonical.brand_id = alias_model.brand_id
 AND canonical.name = TRIM(REGEXP_REPLACE(alias_model.name, '\\s*\\(\\s*[0-9]+\\s+[Pp]ack\\s*\\)\\s*$', ''))
WHERE alias_model.name REGEXP '\\([0-9]+[[:space:]]+[Pp]ack\\)[[:space:]]*$';

DELETE pm
FROM product_models pm
JOIN device_models alias_model ON alias_model.id = pm.model_id
JOIN device_models canonical
  ON canonical.brand_id = alias_model.brand_id
 AND canonical.name = TRIM(REGEXP_REPLACE(alias_model.name, '\\s*\\(\\s*[0-9]+\\s+[Pp]ack\\s*\\)\\s*$', ''))
WHERE alias_model.name REGEXP '\\([0-9]+[[:space:]]+[Pp]ack\\)[[:space:]]*$';

DELETE alias_model
FROM device_models alias_model
JOIN device_models canonical
  ON canonical.brand_id = alias_model.brand_id
 AND canonical.name = TRIM(REGEXP_REPLACE(alias_model.name, '\\s*\\(\\s*[0-9]+\\s+[Pp]ack\\s*\\)\\s*$', ''))
WHERE alias_model.name REGEXP '\\([0-9]+[[:space:]]+[Pp]ack\\)[[:space:]]*$';