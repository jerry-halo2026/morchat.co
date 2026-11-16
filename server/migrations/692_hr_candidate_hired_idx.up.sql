-- `hr.time_to_hire.median` scans the candidates hired inside a rolling 90-day
-- window and compares `hired_at` with `created_at`; without this index that scan
-- walks the whole funnel to find a handful of rows.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_hr_candidate_workspace_hired
    ON hr_candidate (workspace_id, hired_at);
