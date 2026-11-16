-- The requisition list filters by `status` and orders newest first
-- (docs/engineering/WORKBENCH-API.md §10.3 `GET /jobs?status=`), so the index
-- carries the sort column and the list never sorts in memory.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_hr_job_workspace_status
    ON hr_job (workspace_id, status, created_at DESC);
