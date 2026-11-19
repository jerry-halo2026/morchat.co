-- The ROI window reads every snapshot captured in the last 30 days across the
-- workspace. The UNIQUE (post_id, captured_on) constraint already answers
-- "this post's snapshots in order"; this one answers the date-first question.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_creator_post_metric_workspace_captured
    ON creator_post_metric (workspace_id, captured_on DESC);
