-- "This creator's collaborations" — the creator detail panel, the repeat-rate
-- KPI and the ROI cost side (`GET /crm/collabs?creator_id=`).
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_crm_collab_workspace_creator
    ON crm_collab (workspace_id, creator_id);
