-- The履约看板 groups by `stage` (`GET /crm/collabs?stage=`) and the pipeline KPI
-- excludes the settled/cancelled stages; both read this index.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_crm_collab_workspace_stage
    ON crm_collab (workspace_id, stage, created_at DESC);
