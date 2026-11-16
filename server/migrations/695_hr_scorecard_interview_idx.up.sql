-- Scorecards are read per interview (returned with the interview, per contract),
-- and the backlog metric asks "does this interview have one".
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_hr_scorecard_workspace_interview
    ON hr_scorecard (workspace_id, interview_id);
