-- "My candidates" and the write gate: a member only touches the candidates whose
-- `owner_member_id` is its own user id.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_hr_candidate_workspace_owner
    ON hr_candidate (workspace_id, owner_member_id);
