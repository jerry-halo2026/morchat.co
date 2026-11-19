-- Which product a tracked post promoted (713). The attribution read is
-- "all content for this product, then its daily facts", so the product must lead
-- the predicate.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_creator_post_workspace_product
    ON creator_post (workspace_id, product_id);
