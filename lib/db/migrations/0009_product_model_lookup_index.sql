CREATE INDEX IF NOT EXISTS product_models_model_product_idx
ON parts_store.product_models(model_id,product_id);