-- The batch a set of creators came from (WORKBENCH-DATA-CONTRACT §3.4,
-- WORKBENCH-API §20): a keyword search, a comment-section sweep or a hand-made
-- list, with the budget it was run on.
--
-- This is the row that answers "这批达人是从哪儿来的、花了多少钱" — today that
-- knowledge lives in `creator.source_type` / `source_keyword`, which names the
-- search but cannot carry a budget, a window or a name a person will recognise
-- three months later.
--
-- No foreign key, soft delete via `archived_at`. `creator_count` is a cached
-- number (the contract says it may be recomputed), so it is NOT NULL DEFAULT 0:
-- a fresh batch really does have zero creators attached, which is a different
-- statement from "unknown".
--
-- `ended_on` is nullable — the ordinary state of a running batch — and the CHECK
-- only rejects a window that ends before it starts, which is a typo rather than a
-- business state.
CREATE TABLE IF NOT EXISTS creator_campaign (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    name TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'manual' CHECK (kind IN ('search', 'comment', 'manual')),
    budget_amount NUMERIC(14, 2) CHECK (budget_amount IS NULL OR budget_amount >= 0),
    currency CHAR(3) NOT NULL DEFAULT 'CNY',
    started_on DATE,
    ended_on DATE CHECK (ended_on IS NULL OR started_on IS NULL OR ended_on >= started_on),
    source_keyword TEXT,
    creator_count INTEGER NOT NULL DEFAULT 0 CHECK (creator_count >= 0),
    note TEXT,
    owner_member_id UUID,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    archived_at TIMESTAMPTZ
);

COMMENT ON TABLE creator_campaign IS
    'One collection batch / campaign: where these creators came from and what it cost (WORKBENCH-DATA-CONTRACT §3.4). Soft-deleted, no foreign key.';
COMMENT ON COLUMN creator_campaign.kind IS
    'search | comment | manual — how the batch was collected.';
COMMENT ON COLUMN creator_campaign.creator_count IS
    'Cached size of the batch. NOT NULL DEFAULT 0: a new batch has zero creators, which is not the same as "unknown".';
COMMENT ON COLUMN creator_campaign.source_keyword IS
    'The keyword a `search` / `comment` batch was collected with; NULL for a hand-made list.';
COMMENT ON COLUMN creator_campaign.budget_amount IS
    'Budget spent or allocated for the batch, NUMERIC(14,2) in `currency`; NULL when no budget was set.';
