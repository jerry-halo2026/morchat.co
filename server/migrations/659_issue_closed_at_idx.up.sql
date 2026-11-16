-- Throughput and cycle-time windows read closed issues by workspace and finish
-- time. Partial on purpose: open issues never match a finished-at range and they
-- are the bulk of the table, so they stay out of the index entirely.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_issue_closed_at ON issue (workspace_id, closed_at) WHERE closed_at IS NOT NULL;
