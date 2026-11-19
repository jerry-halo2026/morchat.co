-- The same window without a creator filter: "what published this week" across
-- the workspace.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_creator_post_workspace_published
    ON creator_post (workspace_id, published_at DESC);
