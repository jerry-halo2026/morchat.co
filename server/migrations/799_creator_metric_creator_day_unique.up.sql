-- One snapshot per creator per day: the key the health job upserts on, so a
-- second run on the same day corrects that day instead of adding a row.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_creator_metric_workspace_creator_day
    ON creator_metric (workspace_id, creator_id, captured_on);
