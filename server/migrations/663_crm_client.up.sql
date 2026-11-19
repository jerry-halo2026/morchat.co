-- CRM client (docs/engineering/WORKBENCH-API.md §2). `crm_client` stores the
-- buying side only — creators live in `creator` (docs/METRICS.md §3 C6: the
-- word "client" means opposite things in the source products, so the two
-- subject types never share a table).
--
-- No foreign keys; soft delete via `archived_at`; `owner_member_id` is the
-- owning member's user id and drives both the member write scope and the
-- department aggregation.
CREATE TABLE crm_client (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    name TEXT NOT NULL,
    brand TEXT,
    industry TEXT,
    contact_name TEXT,
    contact_channel TEXT,
    contract_entity TEXT,
    payment_terms TEXT,
    credit_note TEXT,
    owner_member_id UUID,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    archived_at TIMESTAMPTZ
);