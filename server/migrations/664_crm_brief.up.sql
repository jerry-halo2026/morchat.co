-- Brief (需求单): what a client asked for (docs/engineering/WORKBENCH-API.md §2).
-- Budget is a range in NUMERIC(14,2) + no currency column (both ends inherit the
-- workspace's working currency, recorded on the collaboration that settles it).
-- `platforms` is TEXT[] because a brief spans several platforms and the list is
-- always read whole.
--
-- No foreign keys, soft delete via `archived_at`.
CREATE TABLE crm_brief (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    client_id UUID NOT NULL,
    title TEXT NOT NULL,
    category TEXT,
    budget_min_amount NUMERIC(14,2),
    budget_max_amount NUMERIC(14,2),
    target_audience TEXT,
    deliverable_type TEXT CHECK (deliverable_type IN ('short_video', 'post', 'live')),
    platforms TEXT[] NOT NULL DEFAULT '{}',
    schedule_from DATE,
    schedule_to DATE,
    kpi_play BIGINT,
    kpi_gmv_amount NUMERIC(14,2),
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'open', 'matching', 'closed')),
    owner_member_id UUID,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    archived_at TIMESTAMPTZ
);