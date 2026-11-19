-- The follow-up half of the assignee queue (COLLAB-MODEL §1/§4): "which
-- conversations am I responsible for". See 822 for the partial predicate and the
-- single-statement rule.
--
-- Version → index: 824_creator_activity_assignee_idx → idx_creator_activity_workspace_assignee.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_creator_activity_workspace_assignee
    ON creator_activity (workspace_id, assignee_id)
    WHERE assignee_id IS NOT NULL;
