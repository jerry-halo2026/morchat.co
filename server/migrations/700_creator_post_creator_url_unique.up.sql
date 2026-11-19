-- One live post per (creator, url). Partial so an archived post does not block
-- re-importing the same URL, which is how a re-scrape lands.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_creator_post_creator_url
    ON creator_post (creator_id, url)
    WHERE archived_at IS NULL;
