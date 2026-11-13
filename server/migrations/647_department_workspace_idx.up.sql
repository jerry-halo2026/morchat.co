-- Department list for one workspace, newest last.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_department_workspace
    ON department (workspace_id, created_at);
