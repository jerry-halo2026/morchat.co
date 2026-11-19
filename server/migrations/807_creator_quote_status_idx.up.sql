-- "Which offers are waiting for an answer" (805): `?status=` is the quote ledger's
-- segment filter and the cockpit's `quotes.open` / `accepted` / `rejected` reads.
-- Equality on one column beside the workspace, so nothing else belongs in it.
--
-- Its own single-statement file, outside any transaction, per the
-- concurrent-index rule; registered in `concurrentIndexCleanups`.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_creator_quote_workspace_status
    ON creator_quote (workspace_id, status);
