-- "What is still in flight" (767): the 离职管理 page lists records by their own
-- segment (`apply` / `handover` / `done` / `cancelled`), and `?status=` is that
-- filter. Status is an equality filter, so it sits beside the workspace and
-- nothing else.
--
-- Its own single-statement file, outside any transaction, per the
-- concurrent-index rule; registered in `concurrentIndexCleanups`.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_hr_offboarding_workspace_status
    ON hr_offboarding (workspace_id, status);
