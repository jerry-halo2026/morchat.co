-- Goal list by status: `GET /api/workbench/goals?status=active`, the default
-- view of the OKR board (744, §13). `cycle` follows `status` in the key so the
-- cycle filter in the same query stays an index range rather than a filter on
-- the whole workspace's live goals.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_goal_okr_workspace_status
    ON goal_okr (workspace_id, status, cycle)
    WHERE archived_at IS NULL;