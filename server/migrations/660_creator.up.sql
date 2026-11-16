-- Creator ledger (docs/engineering/WORKBENCH-API.md §2). One row per creator a
-- workspace works with: `owned` (signed, 自营) or `external`. No foreign keys and
-- no cascades (repository rule) — a member or project that goes away leaves the
-- row intact and application code detaches the reference.
--
-- Deletion is soft (`archived_at`): creator_post and crm_collab still point at
-- the row, and the history is the product. `owner_member_id` holds the owning
-- member's *user* id, which is what the write gate compares against the caller.
-- Department is never stored here; department aggregation reaches it through
-- `media_ip_project_id` (docs/METRICS.md §1 rule 4).
CREATE TABLE creator (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('owned', 'external')),
    display_name TEXT NOT NULL,
    platform TEXT NOT NULL,
    handle TEXT NOT NULL,
    url TEXT,
    fans BIGINT NOT NULL DEFAULT 0,
    fans_d7 BIGINT NOT NULL DEFAULT 0,
    avg_play BIGINT NOT NULL DEFAULT 0,
    engagement_rate NUMERIC(6,5),
    category TEXT,
    audience_note TEXT,
    region TEXT,
    price_note TEXT,
    score SMALLINT CHECK (score BETWEEN 1 AND 5),
    risk_flag BOOLEAN NOT NULL DEFAULT false,
    blacklist_reason TEXT,
    owner_member_id UUID,
    media_ip_project_id UUID,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    archived_at TIMESTAMPTZ
);
-- One creator per (workspace, platform, handle) while the row is live. The
-- uniqueness lives in 699 as a partial index, not as an inline constraint: a
-- soft-deleted creator must not keep its handle reserved forever.