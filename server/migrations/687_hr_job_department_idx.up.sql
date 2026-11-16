-- `department_id` is an aggregate filter, never an access boundary, but the
-- overview strip reads every metric per department, and a requisition is the row
-- the department attribution of a candidate falls back to.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_hr_job_workspace_department
    ON hr_job (workspace_id, department_id);
