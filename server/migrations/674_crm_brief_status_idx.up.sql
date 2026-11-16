-- Brief list filters by `status` and reads newest first
-- (`GET /crm/briefs?status=`).
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_crm_brief_workspace_status
    ON crm_brief (workspace_id, status, created_at DESC);
