-- The settlement half of the assignee queue (COLLAB-MODEL §1/§4): "which
-- payments am I chasing". 821 left every existing settlement unassigned, so this
-- index starts empty and fills as settlements are taken on.
--
-- Version → index: 825_crm_settlement_assignee_idx → idx_crm_settlement_workspace_assignee.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_crm_settlement_workspace_assignee
    ON crm_settlement (workspace_id, assignee_id)
    WHERE assignee_id IS NOT NULL;
