INSERT IGNORE INTO device_models(brand_id,name)
SELECT id,'iPhone 16e' FROM brands WHERE name='Apple';

INSERT IGNORE INTO device_models(brand_id,name)
SELECT id,'Pixel 9a' FROM brands WHERE name='Google';