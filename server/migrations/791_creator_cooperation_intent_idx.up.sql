-- The 建联 funnel is filtered by outreach stage ("who is still 未接触"), so the
-- stage column gets its own workspace-prefixed index.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_creator_workspace_cooperation_intent
    ON creator (workspace_id, cooperation_intent);
