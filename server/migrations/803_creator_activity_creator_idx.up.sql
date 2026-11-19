-- "This creator's follow-ups, newest conversation first" (802). The ledger opens
-- one creator's history and the timeline lists a whole workspace's follow-ups in
-- `happened_at DESC` order (WORKBENCH-API §20.3); both are this prefix plus the
-- sort key, so the third column is part of the index — a table-level sort would
-- put a creator's whole history in front of the LIMIT.
--
-- Its own single-statement file, outside any transaction, per the
-- concurrent-index rule; registered in `concurrentIndexCleanups`.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_creator_activity_workspace_creator
    ON creator_activity (workspace_id, creator_id, happened_at DESC);
