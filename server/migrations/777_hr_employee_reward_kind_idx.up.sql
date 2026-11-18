-- "Rewards vs disciplines" (775): `?kind=` is the tab's segment filter. Equality
-- on one column beside the workspace, so nothing else belongs in the index.
--
-- Its own single-statement file, outside any transaction, per the
-- concurrent-index rule; registered in `concurrentIndexCleanups`.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_hr_employee_reward_workspace_kind
    ON hr_employee_reward (workspace_id, kind);
