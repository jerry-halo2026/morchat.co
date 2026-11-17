-- "This person's exit history" (767): the employee file opens every record for
-- one employee, including the cancelled and archived ones — the roster answers
-- "did this person ever start an exit" with the whole list, not just the live row
-- the partial unique index (768) covers. `?employee_id=` is that read.
--
-- Its own single-statement file, outside any transaction, per the
-- concurrent-index rule; registered in `concurrentIndexCleanups`.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_hr_offboarding_workspace_employee
    ON hr_offboarding (workspace_id, employee_id);
