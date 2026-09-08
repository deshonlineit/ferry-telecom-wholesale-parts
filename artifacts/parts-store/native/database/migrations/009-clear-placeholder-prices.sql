-- WooCommerce uses 0.01 as a placeholder when no commercial price is known.
-- A missing price must stay distinct from stock availability and from a real
-- customer-group price.
UPDATE products
SET list_price_eur_cents=NULL, pricing_version=pricing_version+1
WHERE list_price_eur_cents IS NOT NULL AND list_price_eur_cents<=1;