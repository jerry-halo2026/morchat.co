-- "Which questions belong to this requisition" (758): the bank is browsed per
-- role while preparing a round, and `job_id` is that filter. General questions
-- (`job_id IS NULL`) sort first in the UI but belong to every requisition, so the
-- column stays a plain one — a partial index on `job_id IS NOT NULL` would hide
-- exactly the rows the picker shows most.
--
-- Its own single-statement file, outside any transaction, per the
-- concurrent-index rule; registered in `concurrentIndexCleanups`.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_hr_question_workspace_job
    ON hr_question (workspace_id, job_id);
