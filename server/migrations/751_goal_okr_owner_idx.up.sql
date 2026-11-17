-- "What am I accountable for this cycle" — the personal tab of the OKR board
-- (744, §13). Also what a member-scoped list would filter on; the write gate
-- itself is `workbenchCanWrite` in the handler, which reads the row it already
-- loaded.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_goal_okr_workspace_owner
    ON goal_okr (workspace_id, owner_member_id)
    WHERE archived_at IS NULL;