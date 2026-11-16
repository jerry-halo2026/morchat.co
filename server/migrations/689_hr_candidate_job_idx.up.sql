-- The funnel is always read per requisition (`GET /candidates?job_id=`), newest
-- first, so the index covers the filter and the sort together.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_hr_candidate_workspace_job
    ON hr_candidate (workspace_id, job_id, created_at DESC);
