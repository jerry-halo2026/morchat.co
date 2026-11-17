-- Affiliate pick (选品): one creator's promotion relationship with one product
-- (docs/engineering/WORKBENCH-API.md §11). This row is the 推广计划 the platform
-- attributes orders to — the bridge between a product and a creator, and the
-- parent every daily fact hangs off.
--
-- `commission_rate` is the pick's own rate: a 定向计划 can pay a given creator
-- more (or less) than the product's default. NULL means "the product's default
-- applies", which is a different statement from "an agreed zero" — the product
-- rate lives in `affiliate_product.commission_rate` and is never copied here.
--
-- `bound_at` is when the creator added the product to their plan. It is a
-- timestamp, not a date, because binding is an event; the monthly 选品数 counts
-- rows whose binding fell inside the month.
--
-- No foreign keys; soft delete via `archived_at`. Uniqueness of
-- (workspace_id, product_id, creator_id) among live rows is migration 717, also
-- partial so an archived pick can be re-created.
CREATE TABLE affiliate_pick (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    product_id UUID NOT NULL,
    creator_id UUID NOT NULL,
    commission_rate NUMERIC(6,5) CHECK (
        commission_rate IS NULL OR (commission_rate >= 0 AND commission_rate <= 1)
    ),
    bound_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'ended')),
    note TEXT,
    owner_member_id UUID,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    archived_at TIMESTAMPTZ
);
