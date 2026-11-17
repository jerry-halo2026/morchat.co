-- Pick list by state: `GET /api/workbench/affiliate/picks?status=`.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_affiliate_pick_workspace_status
    ON affiliate_pick (workspace_id, status);
