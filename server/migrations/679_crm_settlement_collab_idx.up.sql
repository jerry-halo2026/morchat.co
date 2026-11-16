-- Settlements are read per collaboration, ordered by what is due, and the
-- `paid` filter (`?paid=`) narrows that same slice; `due_at` rides along so the
-- pending list needs no sort. The workspace-wide "how much is unpaid" count is a
-- partial-scan candidate if it ever becomes hot.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_crm_settlement_workspace_collab
    ON crm_settlement (workspace_id, collab_id, paid_at, due_at);
