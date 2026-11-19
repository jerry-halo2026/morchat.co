-- An interview round is read per candidate (the candidate detail page and the
-- scorecard list), most recent slot first.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_hr_interview_workspace_candidate
    ON hr_interview (workspace_id, candidate_id, scheduled_at DESC);
