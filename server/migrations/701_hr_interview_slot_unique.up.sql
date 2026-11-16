-- Interviewer x slot exclusivity, partial so an archived interview frees the
-- slot. Cancelled-but-live rows keep their slot on purpose: un-cancelling is a
-- supported edit, and the handler's 409 check is the authority for that case.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_hr_interview_interviewer_slot
    ON hr_interview (workspace_id, interviewer_member_id, scheduled_at)
    WHERE archived_at IS NULL;
