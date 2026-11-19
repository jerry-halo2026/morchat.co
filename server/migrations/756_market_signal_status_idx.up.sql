-- "What is still unprocessed" — the default radar view, and the count the tab
-- badge reads (`status=new`, `status=reviewing`) (747, §13).
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_market_signal_workspace_status
    ON market_signal (workspace_id, status)
    WHERE archived_at IS NULL;