-- "What is still being prepared" (759): the workbench lists outlines by their own
-- lifecycle (`draft` / `ready` / `used`), which is independent of the interview's
-- status — an outline can be `ready` for a round whose booking moved, and a `used`
-- one outlives a cancelled interview. Status is an equality filter, so it sits
-- beside the workspace and nothing else.
--
-- Its own single-statement file, outside any transaction, per the
-- concurrent-index rule; registered in `concurrentIndexCleanups`.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_hr_interview_guide_workspace_status
    ON hr_interview_guide (workspace_id, status);
