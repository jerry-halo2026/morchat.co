-- "Which tasks are moving this goal" (748, §13): `GET
-- /api/workbench/goals/{id}` walks `issue.goal_id`. Partial because an issue
-- outside any objective is not part of any goal's list — and that is the
-- overwhelming majority of every workspace's issues, so the index stays small.
--
-- `number` is in the key: the list renders in creation order and the issue
-- number is per workspace, so this answers it without a sort.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_issue_workspace_goal
    ON issue (workspace_id, goal_id, number)
    WHERE goal_id IS NOT NULL;