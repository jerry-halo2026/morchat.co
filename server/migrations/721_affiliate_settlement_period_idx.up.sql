-- Settlement list newest-period-first, and the summary's overlap predicate
-- (`period_start < month_end AND period_end >= month_start`): both are served by
-- this index's leading range on `period_start`.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_affiliate_settlement_workspace_period
    ON affiliate_settlement (workspace_id, period_start);
