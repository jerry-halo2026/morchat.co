-- Staleness sweep of one workspace's knowledge items: the audit command and any
-- future "what needs re-review" view read `stale_after` for a single workspace.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_knowledge_items_workspace_stale
    ON knowledge_items (workspace_id, stale_after);
