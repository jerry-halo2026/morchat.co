-- "One person, one job" (docs/engineering/WORKBENCH-API.md §10.2). The identity
-- is the person, not the row id: the same name with no phone recorded is the same
-- applicant. `lower(name)` folds the spelling and `coalesce(phone, '')` folds a
-- missing phone, because NULL values are distinct in a UNIQUE index and would
-- otherwise make every duplicate without a phone a legal second row. This is the
-- one hr index that is UNIQUE; it lives in its own CONCURRENTLY file like every
-- other migration-created index (AGENTS.md).
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_hr_candidate_workspace_job_identity
    ON hr_candidate (workspace_id, job_id, lower(name), coalesce(phone, ''))
    WHERE archived_at IS NULL;
