-- "This person's rewards and disciplines" (775): the 奖惩 tab opens one
-- employee's rows, newest decision first (`?employee_id=` plus the sort key,
-- `decided_on DESC`). The third key column is part of the index because the read
-- is always ordered — a table-level sort would put the person's whole history in
-- front of the LIMIT. `created_at` breaks ties in the query, not here: it only
-- decides the order of rows sharing a `decided_on` the index already narrowed to.
--
-- Its own single-statement file, outside any transaction, per the
-- concurrent-index rule; registered in `concurrentIndexCleanups`.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_hr_employee_reward_workspace_employee
    ON hr_employee_reward (workspace_id, employee_id, decided_on DESC);
