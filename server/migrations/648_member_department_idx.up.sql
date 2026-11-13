-- "Which department is this member in" and the roster of one department.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_member_workspace_department
    ON member (workspace_id, department_id);
