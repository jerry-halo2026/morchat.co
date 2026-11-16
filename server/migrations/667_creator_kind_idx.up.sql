-- The creator list filters by `kind` and orders newest first
-- (docs/engineering/WORKBENCH-API.md §3 `GET /creators?kind=`), so the index
-- carries the sort column too and the list never sorts in memory.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_creator_workspace_kind
    ON creator (workspace_id, kind, created_at DESC);
