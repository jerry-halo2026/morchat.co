-- 热点雷达 (hotspot radar): what the platform's own trending lists were showing,
-- captured on a given day (docs/engineering/WORKBENCH-API.md §21).
--
-- This is the table §12.7 listed as known debt under "`hot_id` 是裸指针": a
-- `media_topic` could already carry a `hot_id`, but there was no table for it to
-- point at, so the pointer was neither validated nor read. A hotspot row is the
-- *source* fact — a rank, a heat figure, a category on one platform for one day —
-- and adopting it produces a topic (`media_topic.hot_id`).
--
-- No foreign key, soft delete via `archived_at`, workspace-scoped like every other
-- workbench ledger. `heat_value` and `rank` are nullable because a radar sweep can
-- capture a title without a position or a figure: NULL there means "not
-- published/served", which is not 0 (contract §0 rule 2) — "rank 0" and "no rank"
-- answer different questions.
--
-- `captured_on` is a DATE, not a timestamp: the radar reads "what was hot on the
-- 18th", and a hotspot has no meaningful hour across platforms.
--
-- `source` records how the row got here (hand-entered, a crawl, an upstream API).
-- It is the row's provenance, not a `media_topic` source: `media_topic.source`
-- says which *pipeline* produced a topic.
CREATE TABLE IF NOT EXISTS media_hot (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    title TEXT NOT NULL,
    platform TEXT NOT NULL,
    url TEXT,
    rank INTEGER CHECK (rank IS NULL OR rank >= 0),
    heat_value BIGINT CHECK (heat_value IS NULL OR heat_value >= 0),
    category TEXT,
    captured_on DATE NOT NULL,
    source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'crawl', 'api')),
    note TEXT,
    owner_member_id UUID,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    archived_at TIMESTAMPTZ
);

COMMENT ON TABLE media_hot IS
    'One hotspot captured from a platform radar list on one day (WORKBENCH-API §21). Soft-deleted, no foreign key.';
COMMENT ON COLUMN media_hot.rank IS
    'Position on the platform list that day; NULL when the sweep captured no position. Not 0 — 0 is not a rank.';
COMMENT ON COLUMN media_hot.heat_value IS
    'Platform heat figure as served (播放/热度/指数), BIGINT. NULL means the platform published none, which is not 0.';
COMMENT ON COLUMN media_hot.captured_on IS
    'The day this list was read. DATE: a hotspot has no cross-platform hour.';
COMMENT ON COLUMN media_hot.source IS
    'How the row was captured: manual | crawl | api.';
