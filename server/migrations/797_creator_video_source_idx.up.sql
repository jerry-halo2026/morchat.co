-- Mirror identity lookup, mirroring 786's key for `creator`: resolving a work by
-- its upstream identity, and the "which local row backs this upstream row" read
-- the sync does per run.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_creator_video_workspace_source
    ON creator_video (workspace_id, source_system, source_id);
