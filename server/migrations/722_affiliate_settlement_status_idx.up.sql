-- Settlement list by payment state: `GET /api/workbench/affiliate/settlements?status=pending`
-- is the "what the platform still owes" read.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_affiliate_settlement_workspace_status
    ON affiliate_settlement (workspace_id, status);
