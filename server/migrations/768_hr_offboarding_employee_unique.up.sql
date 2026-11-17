-- One live exit record per employee (767). Two open records for one person would
-- let the roster answer "is this person leaving" twice with two different last
-- days, and the handover would be split across both.
--
-- Partial on purpose: `cancelled` also frees the slot — a exit that was called off
-- and then re-initiated is one person, one open record, and requiring the
-- operator to reuse the cancelled row would mean the old plan's dates and
-- checklist leak into the new one. The handler reads the same predicate
-- (CountHrOffboardingConflicts) so the common case answers 409 with a message
-- instead of a constraint violation.
--
-- Its own single-statement file, outside any transaction, per the
-- concurrent-index rule; registered in `concurrentIndexCleanups`.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_hr_offboarding_workspace_employee_live
    ON hr_offboarding (workspace_id, employee_id)
    WHERE archived_at IS NULL AND status <> 'cancelled';
