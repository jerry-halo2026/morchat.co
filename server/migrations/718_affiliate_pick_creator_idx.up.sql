-- Pick list by creator: `GET /api/workbench/affiliate/picks?creator_id=`, and the
-- "which products does this creator promote" read on the creator ledger.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_affiliate_pick_workspace_creator
    ON affiliate_pick (workspace_id, creator_id);
