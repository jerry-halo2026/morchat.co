-- The key result list of one goal (745, §13), and the batched read that embeds
-- key results in a goal list (`goal_id = ANY(...)`). `position` is in the key
-- because that is the order the board renders — the query filters by goal and
-- sorts by position, so the index answers it without a sort.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_goal_key_result_workspace_goal
    ON goal_key_result (workspace_id, goal_id, position)
    WHERE archived_at IS NULL;