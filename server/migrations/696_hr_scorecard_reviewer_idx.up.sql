-- "Scorecards I still owe" is a reviewer-scoped read; the unique constraint
-- leads with the interview, so it cannot serve this direction.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_hr_scorecard_workspace_reviewer
    ON hr_scorecard (workspace_id, reviewer_member_id);
