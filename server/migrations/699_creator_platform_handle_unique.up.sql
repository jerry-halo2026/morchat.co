-- One live creator per (workspace, platform, handle). Partial on purpose: a
-- soft-deleted creator must free its handle, because deleting one by mistake is
-- exactly the case where the same person gets re-imported. The inline UNIQUE in
-- 660 could not express that.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_creator_workspace_platform_handle
    ON creator (workspace_id, platform, handle)
    WHERE archived_at IS NULL;
