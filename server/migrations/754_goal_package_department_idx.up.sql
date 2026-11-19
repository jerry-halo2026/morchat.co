-- "What did department X take on this cycle" (746, §13). A filter, not an access
-- boundary: department stays attribution only (docs/engineering/ORG-MODEL.md).
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_goal_package_workspace_department
    ON goal_package (workspace_id, department_id)
    WHERE archived_at IS NULL;