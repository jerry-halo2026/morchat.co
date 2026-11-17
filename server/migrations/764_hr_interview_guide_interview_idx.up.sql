-- "Which outline belongs to this round" (759): the interview detail page and the
-- scorecard form both open the guide through `interview_id`, and the interview
-- side is the read that has to be fast — a reviewer reaches the outline from the
-- booking, not from a candidate's file.
--
-- `candidate_id` follows the interview in the key so the same lookup can narrow to
-- one person without a second index: a guide's `interview_id` already implies the
-- candidate, but the column being present costs nothing and answers the composite
-- equality the loader issues.
--
-- Its own single-statement file, outside any transaction, per the
-- concurrent-index rule; registered in `concurrentIndexCleanups`.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_hr_interview_guide_workspace_interview
    ON hr_interview_guide (workspace_id, interview_id, candidate_id);
