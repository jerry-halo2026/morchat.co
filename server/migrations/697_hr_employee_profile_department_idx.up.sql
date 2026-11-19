-- Headcount per department is the profile list's filter (`?department_id=`) and
-- the department slice of the overview.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_hr_employee_profile_workspace_department
    ON hr_employee_profile (workspace_id, department_id);
