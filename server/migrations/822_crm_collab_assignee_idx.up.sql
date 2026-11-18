-- "What is assigned to this person or agent" (COLLAB-MODEL §1/§4): the read the
-- workbench queue and the B4-2 due-notification sweep both make.
--
-- Partial on `assignee_id IS NOT NULL`, because the majority of rows stay
-- unassigned and an index that indexed NULLs would be mostly noise.
--
-- Its own single-statement file, outside any transaction, per the concurrent-index
-- rule; registered in `concurrentIndexCleanups` in server/cmd/migrate/main.go
-- (version → index: 822_crm_collab_assignee_idx → idx_crm_collab_workspace_assignee).
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_crm_collab_workspace_assignee
    ON crm_collab (workspace_id, assignee_id)
    WHERE assignee_id IS NOT NULL;
