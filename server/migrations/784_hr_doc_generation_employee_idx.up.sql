-- "This person's generated documents" (783): the employee page opens one
-- employee's documents, newest first. The third key column is the read order
-- itself, so the LIMIT does not put the person's whole history behind a sort.
--
-- Its own single-statement file, outside any transaction, per the
-- concurrent-index rule; registered in `concurrentIndexCleanups`.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_hr_doc_generation_workspace_employee
    ON hr_doc_generation (workspace_id, employee_id, created_at DESC);
