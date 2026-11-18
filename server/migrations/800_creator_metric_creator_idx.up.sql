-- "This creator's latest snapshot" and the 30-day trend window: both read the
-- newest days first for one creator, which is exactly this prefix.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_creator_metric_workspace_creator
    ON creator_metric (workspace_id, creator_id, captured_on DESC);
