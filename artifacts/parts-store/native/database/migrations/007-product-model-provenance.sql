CREATE TABLE IF NOT EXISTS product_model_sources (
 product_id INT UNSIGNED NOT NULL,
 model_id INT UNSIGNED NOT NULL,
 source ENUM('source_taxonomy','product_title') NOT NULL,
 evidence VARCHAR(500) NOT NULL DEFAULT '',
 updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 PRIMARY KEY(product_id,model_id,source),
 FOREIGN KEY(product_id,model_id) REFERENCES product_models(product_id,model_id) ON DELETE CASCADE
) ENGINE=InnoDB;

INSERT IGNORE INTO product_model_sources(product_id,model_id,source,evidence)
SELECT product_id,model_id,'source_taxonomy','Pre-existing compatibility link'
FROM product_models
WHERE NOT EXISTS (
 SELECT 1 FROM settings WHERE name='product_model_provenance_initialized'
);

INSERT INTO settings(name,value)
VALUES('product_model_provenance_initialized','true')
ON DUPLICATE KEY UPDATE value=value;