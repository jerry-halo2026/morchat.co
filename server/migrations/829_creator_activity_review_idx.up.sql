-- The review queue's read for follow-ups (WORKBENCH-API §26.2).
--
-- Its own single-statement file, outside any transaction, per the concurrent-index
-- rule; register in `concurrentIndexCleanups` in server/cmd/migrate/main.go
-- (version → index: 829_creator_activity_review_idx → idx_creator_activity_pending_review).
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_creator_activity_pending_review
    ON creator_activity (workspace_id, updated_at DESC)
    WHERE review_state = 'pending';
