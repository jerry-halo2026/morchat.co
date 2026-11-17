-- METRICS C10 says 续费 is its own `kind`, but 666 only allowed
-- prepay/final/platform_fee/tax — so a renewal had to be recorded as a plain
-- settlement and could not be told apart from a new deal. Widen the check
-- rather than rename rows: existing rows keep their kind.
ALTER TABLE crm_settlement DROP CONSTRAINT IF EXISTS crm_settlement_kind_check;
ALTER TABLE crm_settlement ADD CONSTRAINT crm_settlement_kind_check
    CHECK (kind IN ('prepay', 'final', 'platform_fee', 'tax', 'renewal'));
