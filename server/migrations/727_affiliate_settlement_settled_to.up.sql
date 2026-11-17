-- Who the platform paid for a statement (docs/engineering/WORKBENCH-API.md
-- §11.2).
--
-- The same settlement cycle can end in two different pockets, and until now the
-- ledger could not tell them apart:
--
--   agency  -- the commission lands in our 机构号. That money is our revenue,
--               and a 自有达人's split (726) is paid out of it.
--   creator -- the platform settles the creator directly (外部达人 / 自主结算).
--               The GMV happened and the order was real, but the commission
--               never reaches us: our income on that period is the 招商服务费, if
--               any.
--
-- This column is the only thing that separates the two, and the separation is
-- what prevents counting the business twice: summing every statement's
-- `net_amount` as income reports money that was already the creator's. The same
-- creator can be paid directly in one period and through the agency in another,
-- so the split cannot be derived from the pick and has to be recorded per
-- statement.
--
-- Default `agency`: every statement 709–724 could describe was the agency case
-- (nothing else existed to record), so existing rows read exactly as before.
--
-- No index: the monthly aggregate reads every statement overlapping the month,
-- and one workspace has tens of them, not thousands.
ALTER TABLE affiliate_settlement
    ADD COLUMN settled_to TEXT NOT NULL DEFAULT 'agency';

ALTER TABLE affiliate_settlement
    ADD CONSTRAINT affiliate_settlement_settled_to_check
    CHECK (settled_to IN ('agency', 'creator'));
