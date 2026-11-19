-- Radar signal (雷达信号) — one external or internal observation worth acting on
-- (docs/engineering/WORKBENCH-API.md §13).
--
-- The 市场雷达 page collects what the market did: a competitor's price cut, a
-- channel rule change, a policy draft, a product gap a customer complained
-- about. `issue_wakeup` is not that: a wakeup is a *subscription* over facts that
-- already exist in this database (an issue, a PR, a task), and it stores no
-- observation of its own. A signal is the observation, captured before anything
-- in the workspace exists to subscribe to.
--
-- The two `converted_*` columns are where a signal lands once somebody acts:
--
--   - `converted_goal_id` — the signal became an objective (`POST
--     .../signals/{id}/convert` with `target: "goal"`), the 目标拆解 entry point;
--   - `converted_issue_id` — the signal became a task, the 任务派发 entry point.
--
-- Both may be NULL at once: an unprocessed signal is the normal state, and the
-- radar's whole job is to show the ones still unprocessed. Neither carries a
-- foreign key (repository rule): the target may be archived later, and a
-- converted signal keeping a dangling id is a historical fact, not a broken row.
--
-- `cut` is the grading (`hot|warm|cold`), `urgency` is the deadline pressure
-- (`high|medium|low`) and `score` is 0-100 relevance. Three columns rather than
-- one: an operator ranks the queue by `cut` first, sorts the hot ones by score,
-- and the urgency decides who gets woken up — collapsing them would lose the
-- distinction between "important" and "due now".
--
-- `source` records the door the signal came in through (`manual|ai|import`) and
-- is never rewritten when it is converted: it says where the observation came
-- from, not who owns it now. There is no crawler in this batch — `ai` and
-- `import` exist for the importers and are written by hand today.
--
-- `status` walks new -> reviewing -> converted, with `dismissed` as the only
-- other exit; `converted` is written by the convert endpoint and cannot be set
-- by a PATCH (the handler rejects it, because a status saying "converted" with
-- no `converted_*` pointer would be a lie the list cannot explain).
--
-- No foreign keys (repository rule).
CREATE TABLE market_signal (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    title TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'other'
        CHECK (category IN ('market', 'competitor', 'channel', 'product', 'policy', 'other')),
    source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'ai', 'import')),
    url TEXT,
    summary TEXT,
    cut TEXT NOT NULL DEFAULT 'warm' CHECK (cut IN ('hot', 'warm', 'cold')),
    score NUMERIC(6,2) CHECK (score IS NULL OR (score >= 0 AND score <= 100)),
    urgency TEXT NOT NULL DEFAULT 'medium' CHECK (urgency IN ('high', 'medium', 'low')),
    status TEXT NOT NULL DEFAULT 'new'
        CHECK (status IN ('new', 'reviewing', 'converted', 'dismissed')),
    converted_goal_id UUID,
    converted_issue_id UUID,
    note TEXT,
    owner_member_id UUID,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    archived_at TIMESTAMPTZ
);