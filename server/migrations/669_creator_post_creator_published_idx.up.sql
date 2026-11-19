-- The post list is read per creator over a `from`/`to` window on `published_at`
-- (`GET /creator-posts?creator_id=&from=&to=`), newest first.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_creator_post_workspace_creator_published
    ON creator_post (workspace_id, creator_id, published_at DESC);
