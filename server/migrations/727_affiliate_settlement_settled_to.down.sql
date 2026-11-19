ALTER TABLE affiliate_settlement DROP CONSTRAINT IF EXISTS affiliate_settlement_settled_to_check;
ALTER TABLE affiliate_settlement DROP COLUMN IF EXISTS settled_to;
