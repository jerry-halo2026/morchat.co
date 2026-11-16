-- Settlement (结算流水): money due or paid against one collaboration
-- (docs/engineering/WORKBENCH-API.md §2). Several rows per collab — prepay,
-- final, platform_fee, tax — because they are paid at different times and the
-- "本月回款" KPI sums what actually cleared.
--
-- `amount` is NOT NULL: a settlement row exists to name an amount. No foreign
-- keys, soft delete via `archived_at`.
CREATE TABLE crm_settlement (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    collab_id UUID NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('prepay', 'final', 'platform_fee', 'tax')),
    amount NUMERIC(14,2) NOT NULL,
    currency CHAR(3) NOT NULL DEFAULT 'CNY',
    due_at DATE,
    paid_at DATE,
    invoice_no TEXT,
    note TEXT,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    archived_at TIMESTAMPTZ
);