-- The missing half of a pick's economics (docs/engineering/WORKBENCH-API.md
-- §11.2).
--
-- A 自有/签约达人 is settled through our own 机构号: the platform pays the
-- agency, and the creator is paid by us out of that commission.
-- `agency_share_rate` is the part of the commission we keep; the creator gets
-- the rest. NULL means "this pick is not an internal split" — an 外部达人, whom
-- the platform settles directly — so NULL is a statement, not missing data, and
-- it is exactly the marker the monthly aggregate reads to compute
-- `agency_share_income`.
--
-- `agency_share_rate` is NOT `commission_rate`, and the two must never be
-- multiplied into one number:
--
--   commission_rate   -- the platform's commission rate: what the shop pays on a
--                        sale, 0–1 of the GMV (710, and the product's default in
--                        709 when the pick leaves it NULL).
--   agency_share_rate -- our cut of that commission, 0–1 of the commission.
--
-- A 20 % commission of which we keep 30 % is 0.2 × 0.3 = 6 % of GMV, applied in
-- that order; folding them into a single rate to "simplify" loses which of the
-- two an operator changed.
--
-- `service_fee_amount` is the other revenue an agency earns and the platform
-- never routes: 招商服务费 / 坑位费 charged for placing an 外部达人. It is money
-- we invoice ourselves, so it lives on the pick (where the placement is) rather
-- than on the settlement statement (712, which is the platform's arithmetic and
-- its net, not ours). NULL means "no fee on this pick" — a different answer from
-- a zero, which would claim we waived one.
--
-- Both columns stay nullable: a pick with no split and no fee is the ordinary
-- 外部达人 case, and NOT NULL DEFAULT 0 would turn "not applicable" into a
-- number the aggregate has to interpret.
--
-- No index: both are read on the pick rows the monthly aggregate already joins
-- by id, never filtered or sorted on.
ALTER TABLE affiliate_pick
    ADD COLUMN agency_share_rate NUMERIC(6,5),
    ADD COLUMN service_fee_amount NUMERIC(14,2);

ALTER TABLE affiliate_pick
    ADD CONSTRAINT affiliate_pick_agency_share_rate_check
    CHECK (agency_share_rate IS NULL OR (agency_share_rate >= 0 AND agency_share_rate <= 1));

ALTER TABLE affiliate_pick
    ADD CONSTRAINT affiliate_pick_service_fee_amount_check
    CHECK (service_fee_amount IS NULL OR service_fee_amount >= 0);
