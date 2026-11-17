-- One live pick per (workspace, product, creator) (710): a creator promoting the
-- same product through two parallel plans is a data entry mistake, not a plan.
-- Partial so an archived pick frees the pair and the creator can be re-added.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_affiliate_pick_workspace_product_creator
    ON affiliate_pick (workspace_id, product_id, creator_id)
    WHERE archived_at IS NULL;
