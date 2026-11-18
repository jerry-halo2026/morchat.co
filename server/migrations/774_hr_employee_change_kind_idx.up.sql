-- "What kinds of change happened here" (772): `?kind=` is the scope filter on
-- the employee file's 异动 tab (probation, renewal, transfers, salary). Equality
-- on one column beside the workspace, so nothing else belongs in the index.
--
-- Its own single-statement file, outside any transaction, per the
-- concurrent-index rule; registered in `concurrentIndexCleanups`.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_hr_employee_change_workspace_kind
    ON hr_employee_change (workspace_id, kind);
