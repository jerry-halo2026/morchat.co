-- OKR goal (目标) — one objective for one cycle
-- (docs/engineering/WORKBENCH-API.md §13).
--
-- The BOSS workbench's 目标拆解 page needs one row per objective rather than a
-- JSONB blob on a project. The reason is aggregation: a goal is split into
-- department packages (746), each of those hangs tasks on it through
-- `issue.goal_id` (748), and "how far along is this objective" is a SUM over
-- columns. A SUM over JSONB is a scan with a cast per row and no index; a SUM
-- over NUMERIC columns is the number the database is built to produce.
--
-- `cycle` is text on purpose (`2026Q4`, `2026-11`, `2026H2`): the companies this
-- serves number their planning periods differently, the list read filters on
-- equality rather than a range, and `2026Q4 > 2026Q3` already sorts correctly as
-- a string. A date column would force every caller to agree on a quarter length.
--
-- `owner_member_id` is NOT NULL and is the write gate (`workbenchCanWrite`): an
-- objective nobody is accountable for is not an objective. `department_id` stays
-- nullable — a company-level objective belongs to no single department, and
-- docs/engineering/ORG-MODEL.md keeps department an attribution, never an ACL.
--
-- Live uniqueness of (workspace, cycle, lower(title)) is migration 749, as a
-- partial index: an archived goal must free its title, because re-creating an
-- objective that was deleted by mistake is the normal repair.
--
-- `status` is the goal's lifecycle, not the archive flag: `done` is a cycle that
-- closed successfully and whose numbers stay readable, while `archived_at` is
-- "this row was created by mistake".
--
-- `priority` defaults to `P2` rather than NULL: a goal that was not triaged is
-- the lowest priority, and every goal therefore renders the same way.
--
-- No foreign keys (repository rule). Reads filter by `workspace_id`, and
-- deleting a goal is a soft delete — its packages and key results keep pointing
-- at it, and they are archived with it by the handler.
CREATE TABLE goal_okr (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    cycle TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    owner_member_id UUID NOT NULL,
    department_id UUID,
    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'active', 'paused', 'done', 'cancelled')),
    due_date DATE,
    priority TEXT NOT NULL DEFAULT 'P2' CHECK (priority IN ('P0', 'P1', 'P2')),
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    archived_at TIMESTAMPTZ
);