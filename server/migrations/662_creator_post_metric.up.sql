-- Daily snapshot of one post's numbers (docs/engineering/WORKBENCH-API.md §2).
-- Upserted on (post_id, captured_on), so re-importing a CSV rewrites the same
-- day instead of appending duplicates. Money stays NUMERIC(14,2) + currency
-- (no floats, no minor units).
--
-- No `archived_at`: a snapshot is an observation, not a ledger row — deleting a
-- post takes its snapshots with it in application code.
CREATE TABLE creator_post_metric (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    post_id UUID NOT NULL,
    captured_on DATE NOT NULL,
    play BIGINT,
    likes BIGINT,
    comments BIGINT,
    shares BIGINT,
    clicks BIGINT,
    converts BIGINT,
    gmv_amount NUMERIC(14,2),
    currency CHAR(3) NOT NULL DEFAULT 'CNY',
    source TEXT NOT NULL DEFAULT 'manual',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (post_id, captured_on)
);