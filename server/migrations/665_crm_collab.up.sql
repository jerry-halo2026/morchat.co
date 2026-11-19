-- Collaboration (合作单): one creator working one brief
-- (docs/engineering/WORKBENCH-API.md §2). This is the row the履约看板 groups by
-- `stage`, and the row the pipeline/signed/margin/ROI/repeat KPIs read.
--
-- `prob` is 0-1 (docs/METRICS.md §3 C3), nullable: NULL means "use the stage
-- default". `confirmed_at` / `published_at` / `accepted_at` are milestones the
-- PATCH handler fills in when the stage moves past them, so the month KPIs can
-- read a timestamp instead of guessing from history.
--
-- `issue_id` is the one bridge to the issue tracker; an issue never stores
-- commerce fields. No foreign keys, soft delete via `archived_at`.
CREATE TABLE crm_collab (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    brief_id UUID NOT NULL,
    creator_id UUID NOT NULL,
    stage TEXT NOT NULL DEFAULT 'inquiry' CHECK (stage IN (
        'inquiry', 'quoted', 'negotiating', 'confirmed', 'sampling',
        'script_review', 'scheduled', 'published', 'accepted', 'settled', 'cancelled'
    )),
    quote_amount NUMERIC(14,2),
    final_amount NUMERIC(14,2),
    prob NUMERIC(5,4) CHECK (prob BETWEEN 0 AND 1),
    creator_fee NUMERIC(14,2),
    sample_cost NUMERIC(14,2),
    platform_fee NUMERIC(14,2),
    currency CHAR(3) NOT NULL DEFAULT 'CNY',
    settlement_mode TEXT CHECK (settlement_mode IN ('flat', 'cps', 'cpa', 'barter')),
    commission_rate NUMERIC(6,5),
    sample_required BOOLEAN NOT NULL DEFAULT false,
    script_required BOOLEAN NOT NULL DEFAULT false,
    scheduled_at TIMESTAMPTZ,
    confirmed_at TIMESTAMPTZ,
    published_at TIMESTAMPTZ,
    accepted_at TIMESTAMPTZ,
    issue_id UUID,
    owner_member_id UUID,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    archived_at TIMESTAMPTZ
);