-- The profile list and the write gate resolve rows by `owner_member_id`; the
-- UNIQUE constraint leads with `member_id`, so it cannot serve this one.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_hr_employee_profile_workspace_owner
    ON hr_employee_profile (workspace_id, owner_member_id);
