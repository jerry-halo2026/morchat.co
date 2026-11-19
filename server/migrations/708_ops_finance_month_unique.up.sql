-- One live entry per workspace and month (707). Partial, so archiving a month
-- frees its key: the upsert in `UpsertOpsFinanceMonth` infers this index with the
-- same predicate, and a re-entry updates the row instead of adding a second one.
-- Its own migration file, outside any transaction, per the concurrent-index rule.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_ops_finance_month_workspace_month
    ON ops_finance_month (workspace_id, month)
    WHERE archived_at IS NULL;
