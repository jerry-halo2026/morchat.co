-- The department splits of one goal (746, §13), read the same way as its key
-- results: by goal, in `position` order, batched for the goal list.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_goal_package_workspace_goal
    ON goal_package (workspace_id, goal_id, position)
    WHERE archived_at IS NULL;