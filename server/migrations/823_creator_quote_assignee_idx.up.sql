-- The quote half of the assignee queue (COLLAB-MODEL §1/§4); see 822 for why it
-- is partial and why it is its own single-statement file.
--
-- Version → index: 823_creator_quote_assignee_idx → idx_creator_quote_workspace_assignee.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_creator_quote_workspace_assignee
    ON creator_quote (workspace_id, assignee_id)
    WHERE assignee_id IS NOT NULL;
