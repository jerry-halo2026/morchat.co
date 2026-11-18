-- "This person's file changed" (772): the employee file's 异动 tab opens one
-- employee's stream, newest first — `?employee_id=` plus the sort key
-- (`effective_on DESC`). The third key column is part of the index because the
-- read is always ordered, and a table-level sort would put every row of the
-- person's history behind the LIMIT.
--
-- Its own single-statement file, outside any transaction, per the
-- concurrent-index rule; registered in `concurrentIndexCleanups`.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_hr_employee_change_workspace_employee
    ON hr_employee_change (workspace_id, employee_id, effective_on DESC);
