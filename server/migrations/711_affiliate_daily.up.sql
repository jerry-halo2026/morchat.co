-- Affiliate daily fact: one pick's numbers on one day, exactly as the platform
-- report gives them (docs/engineering/WORKBENCH-API.md §11).
--
-- This is a snapshot of 平台报表, not a number we compute. Every measure is
-- copied as reported; the server never derives one column from another. In
-- particular `refund_amount` is its own column and is NOT netted out of
-- `gmv_amount`: the platform reports gross 成交 and 退款 side by side, and a
-- refund can land on a day other than the sale's. Netting at write time would
-- make the two facts unrecoverable and would move a past day's number when a
-- later refund arrives.
--
-- `settled_commission` is the part of `est_commission` that has actually cleared
-- (确认收货 and past the settlement cycle). Both are stored because the gap
-- between them is the business's whole cash lag; neither can be derived from the
-- other without re-reading the platform.
--
-- `(workspace_id, pick_id, stat_date)` is UNIQUE so the write path is an
-- idempotent upsert: re-importing a report for a day it already has replaces
-- that day instead of double-counting it. The constraint is inline because the
-- table is new and the key is unconditional — there is no soft delete here, so
-- no partial index is needed.
CREATE TABLE affiliate_daily (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    pick_id UUID NOT NULL,
    stat_date DATE NOT NULL,
    gmv_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    order_count INTEGER NOT NULL DEFAULT 0,
    refund_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    est_commission NUMERIC(14,2) NOT NULL DEFAULT 0,
    settled_commission NUMERIC(14,2) NOT NULL DEFAULT 0,
    currency CHAR(3) NOT NULL DEFAULT 'CNY',
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, pick_id, stat_date)
);
