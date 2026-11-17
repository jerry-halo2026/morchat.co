-- One live goal per (workspace, cycle, title, ignoring case) (744). Partial on
-- purpose: archiving a goal must free its title, because re-creating an
-- objective that was deleted by mistake is the normal repair. `lower(title)`
-- because "提升内容产能" and "提升内容产能 " are the same objective to the
-- operator, and two goals with one title would split the cycle's numbers in two.
--
-- Scoped to the cycle, not the workspace alone: "拿下 100 个新客户" is a fine
-- objective in both 2026Q3 and 2026Q4, and carrying last quarter's goal forward
-- under the same title is the normal way a cycle is planned.
--
-- Its own single-statement file, outside any transaction, per the
-- concurrent-index rule; registered in `concurrentIndexCleanups`.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_goal_okr_workspace_cycle_title_lower
    ON goal_okr (workspace_id, cycle, lower(title))
    WHERE archived_at IS NULL;