-- Projects of one department, and the reference check a department delete runs
-- before clearing project.department_id.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_project_workspace_department
    ON project (workspace_id, department_id);
