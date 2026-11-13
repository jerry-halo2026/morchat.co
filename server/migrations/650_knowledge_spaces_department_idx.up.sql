-- Knowledge spaces of one department. knowledge_spaces already has an instance
-- index; this one is keyed by the department so the scope filter does not scan
-- every space in the workspace.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_knowledge_spaces_workspace_department
    ON knowledge_spaces (workspace_id, department_id);
