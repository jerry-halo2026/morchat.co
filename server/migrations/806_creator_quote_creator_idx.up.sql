-- "What did we offer this creator, newest offer first" (805). The creator's quote
-- panel and the cockpit's per-creator lookup both read one creator's offers in
-- `coalesce(quoted_at, created_at) DESC` order, so the sort key belongs in the
-- index beside the two keys that identify the set.
--
-- Its own single-statement file, outside any transaction, per the
-- concurrent-index rule; registered in `concurrentIndexCleanups`.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_creator_quote_workspace_creator
    ON creator_quote (workspace_id, creator_id, quoted_at DESC);
