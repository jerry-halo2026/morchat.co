ALTER TABLE affiliate_pick DROP CONSTRAINT IF EXISTS affiliate_pick_service_fee_amount_check;
ALTER TABLE affiliate_pick DROP CONSTRAINT IF EXISTS affiliate_pick_agency_share_rate_check;
ALTER TABLE affiliate_pick DROP COLUMN IF EXISTS service_fee_amount;
ALTER TABLE affiliate_pick DROP COLUMN IF EXISTS agency_share_rate;
