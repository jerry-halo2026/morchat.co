-- `hr.scorecard.backlog` (`scheduled_at < now()`) and
-- `hr.interview.on_time_rate` (this calendar month) both range over the slot, so
-- the slot is indexed on its own.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_hr_interview_workspace_scheduled
    ON hr_interview (workspace_id, scheduled_at);
