-- The review queue's read (WORKBENCH-API §26.2): pending rows, newest first.
--
-- Partial on `review_state = 'pending'`, because the accepted rows — almost all of
-- them — are never read through this path, and `updated_at DESC` is in the index
-- because the queue is ordered by "what moved last".
--
-- Its own single-statement file, outside any transaction, per the concurrent-index
-- rule; register in `concurrentIndexCleanups` in server/cmd/migrate/main.go
-- (version → index: 827_crm_collab_review_idx → idx_crm_collab_pending_review).
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_crm_collab_pending_review
    ON crm_collab (workspace_id, updated_at DESC)
    WHERE review_state = 'pending';
