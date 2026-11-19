-- Which pick (promotion plan) a tracked post belongs to (713). A pick's content
-- list reads by this key.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_creator_post_workspace_pick
    ON creator_post (workspace_id, pick_id);
