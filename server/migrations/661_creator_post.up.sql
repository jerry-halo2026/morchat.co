-- Publishing ledger: one row per post this workspace is tracking for a creator
-- (docs/engineering/WORKBENCH-API.md §2). `collab_id` attributes the post to a
-- collaboration and `content_issue_id` to the issue that produced it — the
-- bridge direction is fixed (post -> collab / post -> issue); an issue never
-- stores commerce fields.
--
-- No foreign keys: a removed collab or issue leaves the post with a dangling id
-- that application code resolves leniently, matching the repository rule.
CREATE TABLE creator_post (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    creator_id UUID NOT NULL,
    collab_id UUID,
    content_issue_id UUID,
    platform TEXT NOT NULL,
    title TEXT,
    url TEXT NOT NULL,
    published_at TIMESTAMPTZ NOT NULL,
    source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'csv', 'api')),
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    archived_at TIMESTAMPTZ,
    UNIQUE (creator_id, url)
);