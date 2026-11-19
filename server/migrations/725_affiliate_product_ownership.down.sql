-- Reversing 725 removes the 自营 rows: without `ownership` there is no way to
-- state a product with no seller, and the restored `client_id NOT NULL` cannot
-- hold one. Deleting them is the only direction that leaves a table which is
-- true — a placeholder client would invent a seller that does not exist.
ALTER TABLE affiliate_product DROP CONSTRAINT IF EXISTS affiliate_product_ownership_client_check;
ALTER TABLE affiliate_product DROP CONSTRAINT IF EXISTS affiliate_product_ownership_check;
ALTER TABLE affiliate_product DROP COLUMN IF EXISTS ownership;

DELETE FROM affiliate_product WHERE client_id IS NULL;

ALTER TABLE affiliate_product ALTER COLUMN client_id SET NOT NULL;
