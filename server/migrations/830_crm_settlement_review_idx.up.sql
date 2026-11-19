-- The review queue's read for settlements (WORKBENCH-API §26.2).
--
-- Its own single-statement file, outside any transaction, per the concurrent-index
-- rule; register in `concurrentIndexCleanups` in server/cmd/migrate/main.go
-- (version → index: 830_crm_settlement_review_idx → idx_crm_settlement_pending_review).
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_crm_settlement_pending_review
    ON crm_settlement (workspace_id, updated_at DESC)
    WHERE review_state = 'pending';
