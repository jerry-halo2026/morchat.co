-- Attribution for `crm.collab.roi` walks posts by collaboration. Partial:
-- organic posts have no collab and never match, so they stay out of the index.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_creator_post_workspace_collab
    ON creator_post (workspace_id, collab_id) WHERE collab_id IS NOT NULL;
