ALTER TABLE crm_settlement DROP CONSTRAINT IF EXISTS crm_settlement_kind_check;
ALTER TABLE crm_settlement ADD CONSTRAINT crm_settlement_kind_check
    CHECK (kind IN ('prepay', 'final', 'platform_fee', 'tax'));
