-- "This creator's works, newest first": what a creator detail screen and the
-- health recompute both read. `create_time DESC` puts the newest first, and
-- `posts_last_30d` walks the same prefix.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_creator_video_workspace_creator
    ON creator_video (workspace_id, creator_id, create_time DESC);
