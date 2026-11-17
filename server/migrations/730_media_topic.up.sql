-- Topic pool (选题池) — one candidate topic an IP could turn into a script (§12).
--
-- A row starts in `pool` from three different doors, which is what `source`
-- records: a 热点雷达 hit (`hot`, with `hot_id` pointing back at the trend it
-- came from), an operator typing one (`manual`), the benchmark sheet (`bench`),
-- or a generated suggestion (`ai`). The source is never rewritten when the topic
-- moves on: it says where the idea came from, not who owns it now.
--
-- `scores` is the five-dimension decision card — pain / save / debate / susp /
-- fit, each 0–100 — stored as a JSON object rather than five columns:
--
--   * the weights are editorial and will be re-cut; a JSONB object absorbs that
--     without a migration, and the client schema fills missing dimensions with 0;
--   * a score is read as a whole (the radar chart), never filtered on per
--     dimension, so no index wants a column per axis.
--
-- The handler normalises the object on write: the five keys are always present,
-- unknown keys are rejected, values are integers 0–100. The CHECK below is only
-- the cheap invariant PostgreSQL can hold without duplicating that rule (the
-- column must stay an object, never an array or a scalar).
--
-- `status` is the pipeline position and walks pool → scripting → shooting →
-- publishing → done, with `dropped` as the only exit. It is not derived from the
-- child rows: a topic can sit in `scripting` with no script yet (that is the
-- queue), and a dropped topic keeps whatever scripts it accumulated.
--
-- `hot_id` is a pointer with no foreign key: the trend table may prune a hot spot
-- that aged out while the topic it inspired is still being shot. Reads tolerate a
-- dangling id; `GET /topics` never joins it.
CREATE TABLE media_topic (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    ip_id UUID NOT NULL,
    title TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('hot', 'manual', 'bench', 'ai')),
    scores JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(scores) = 'object'),
    status TEXT NOT NULL DEFAULT 'pool'
        CHECK (status IN ('pool', 'scripting', 'shooting', 'publishing', 'done', 'dropped')),
    hot_id UUID,
    note TEXT,
    owner_member_id UUID,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    archived_at TIMESTAMPTZ
);
