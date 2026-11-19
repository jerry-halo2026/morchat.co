-- Resolving a mirror row by its upstream identity (the sync's per-run read, and
-- the join a future content mirror will need): (workspace, sec_uid) is what a
-- caller holds after reading orange.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_creator_workspace_sec_uid
    ON creator (workspace_id, sec_uid);
