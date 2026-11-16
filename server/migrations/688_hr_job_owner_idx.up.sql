-- "My requisitions" and the write gate both resolve a row by
-- `owner_member_id`, which is the member's user id.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_hr_job_workspace_owner
    ON hr_job (workspace_id, owner_member_id);
