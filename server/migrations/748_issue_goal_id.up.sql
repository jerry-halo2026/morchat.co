-- The task side of a goal (docs/engineering/WORKBENCH-API.md §13).
--
-- The BOSS prototype's `task.goal` was a string typed onto the task card, which
-- is why "which work is moving this objective" could only be answered by reading
-- every card. Here it is a pointer: `GET /api/workbench/goals/{id}` lists the
-- issues under a goal with one index scan (`idx_issue_workspace_goal`, 757).
--
-- Nullable, and no default: every issue that predates this column, and every
-- issue that is not part of an OKR, has no goal. An issue belongs to at most one
-- goal — the same shape as `project_id` — because a task serving two objectives
-- cannot say which one its completion advanced.
--
-- **No trigger, no generated column.** Task progress is rolled up into
-- `goal_key_result.current` (745) by the application, the only place that knows
-- when the aggregate should move and writes it as a recorded fact rather than a
-- read-time computation. A trigger here would update a number nobody asked to
-- change at a moment nobody can name, and reopening one task would silently
-- rewrite a closed quarter.
--
-- No foreign key (repository rule): the handler validates that the goal exists
-- in the same workspace before writing, and archiving a goal does not cascade
-- into the issues that were attached to it.
ALTER TABLE issue
    ADD COLUMN IF NOT EXISTS goal_id UUID;

COMMENT ON COLUMN issue.goal_id IS
    'OKR goal this issue advances (goal_okr, migration 744). NULL for work outside any objective. The aggregate is written back to goal_key_result.current by the application, never by a trigger.';