-- Key result (关键结果) — one measurable result under one goal
-- (docs/engineering/WORKBENCH-API.md §13).
--
-- `target` and `current` are real NUMERIC(14,2) columns, not entries in a JSONB
-- object, and the progress of a goal is the sum of its key results. That is the
-- whole reason this table exists: the BOSS prototype carried `goal.krs[]` as a
-- blob, which cannot be summed, sorted by attainment or joined to anything.
--
-- **`current` is written, never computed at read time.** It is updated by the
-- two paths that know a new number: an operator typing the figure in
-- (`PATCH .../key-results/{krId}`), and the application's roll-up of the issues
-- attached to the goal (`issue.goal_id`, 748) writing the aggregate back after a
-- task completes. Reading it directly means last week's report says what it said
-- last week: a report that recomputes on read silently rewrites history every
-- time a task is reopened, so no two exports of the same quarter ever agree and
-- the metric cannot be reconciled with the bonus it was paid on. A read-time
-- aggregate is also unbounded work per page view — the OKR board lists a whole
-- cycle's goals at once.
--
-- That decision is why there is no trigger and no generated column: both would
-- make `current` a function of the current issue table rather than a fact
-- somebody recorded at a point in time.
--
-- `current` may exceed `target` (超额完成 is a normal outcome, and clamping it
-- would hide it); `target` may not be negative (a negative target is a typo, and
-- the handler answers 400). `target` is nullable: a key result whose number is
-- not decided yet still belongs to the goal, and 0 would be a claim it is
-- already missed.
--
-- `unit` is free text (`%`, `万元`, `个`): a units table would be a conversion
-- engine nobody asked for, and the value is displayed next to the number, never
-- arithmetic between rows.
--
-- `position` orders the key results of one goal as the operator arranged them;
-- ties fall back to creation order in the read (`ListGoalKeyResults`), so two
-- rows sharing a position still render deterministically.
--
-- `status` is the judgement (on track / at risk / off track / done), kept
-- separate from the arithmetic: a key result at 80% of target with two days left
-- is `at_risk` even though the number looks fine, and that call is the owner's,
-- not the database's.
--
-- No foreign keys (repository rule): `goal_id` is validated by the handler, and
-- archiving a goal archives its key results in the same request.
CREATE TABLE goal_key_result (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    goal_id UUID NOT NULL,
    title TEXT NOT NULL,
    target NUMERIC(14,2) CHECK (target >= 0),
    current NUMERIC(14,2) NOT NULL DEFAULT 0,
    unit TEXT,
    position INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'on_track'
        CHECK (status IN ('on_track', 'at_risk', 'off_track', 'done')),
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    archived_at TIMESTAMPTZ
);