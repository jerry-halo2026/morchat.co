-- Briefs of one client: the brief list's other filter and the client detail
-- panel (`GET /crm/briefs?client_id=`).
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_crm_brief_workspace_client
    ON crm_brief (workspace_id, client_id);
