-- Collaborations of one brief (`GET /crm/collabs?brief_id=`), which is how the
-- brief detail panel matches creators against the request.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_crm_collab_workspace_brief
    ON crm_collab (workspace_id, brief_id);
