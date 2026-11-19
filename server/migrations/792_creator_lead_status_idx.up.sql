-- The lead board's second filter: funnel state (LEAD_NEW / LEAD_CONTACTED /
-- LEAD_DEAL / LEAD_REJECT).
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_creator_workspace_lead_status
    ON creator (workspace_id, lead_status);
