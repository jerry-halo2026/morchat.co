-- Mirrored 抖音 works for the creator health metrics
-- (docs/engineering/WORKBENCH-DATA-CONTRACT.md §2.1). One row per aweme: the
-- upstream `creator_video` table is the source, and `aweme_id` is the platform's
-- own identity for a work, so it is the key this table mirrors on.
--
-- Two things this table deliberately does NOT do:
--
--   * No play_count. The upstream table has the column, but the contract keeps it
--     out (§2.1) because the numbers behind it come from a different, unreliable
--     scrape; a work without a trustworthy play count must not look like a work
--     with zero plays.
--   * No zero for an unmeasured counter. `digg_count` / `comment_count` /
--     `share_count` are nullable, and NULL means "not collected yet", which is
--     exactly what the metric rules in §2.3 need (no statistics ⇒ NULL metric,
--     not 0 %). 8612 of the 12449 upstream rows sit in that state today.
--
-- `topics` is derived on the way in from `desc_text` (`#话题`), not mirrored: the
-- column exists upstream but the contract asks for a parse, so the value here is
-- reproducible from the description alone.
--
-- `source_system` / `source_id` name the upstream row (analogue of
-- `creator.source_system` / `source_id`), and `archived_at` is the only deletion
-- this table knows: a work that disappears upstream keeps its history here.
CREATE TABLE IF NOT EXISTS creator_video (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    creator_id UUID NOT NULL,
    aweme_id TEXT NOT NULL,
    desc_text TEXT,
    topics TEXT[] NOT NULL DEFAULT '{}',
    create_time TIMESTAMPTZ,
    duration_ms INTEGER,
    digg_count INTEGER,
    comment_count INTEGER,
    share_count INTEGER,
    cover_url TEXT,
    video_url TEXT,
    -- When the three counters were read off the platform. NULL for a work that
    -- was seen but whose statistics were never collected.
    stats_collected_at TIMESTAMPTZ,
    source_system TEXT,
    source_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    archived_at TIMESTAMPTZ
);

COMMENT ON TABLE creator_video IS
    'One row per 抖音 aweme, mirrored from orange creator_video (WORKBENCH-DATA-CONTRACT §2.1). Counters are NULL when the platform statistic was never collected — never 0.';
COMMENT ON COLUMN creator_video.creator_id IS
    'creator.id this work belongs to. No foreign key (repository rule); the sync resolves it from the mirrored sec_uid.';
COMMENT ON COLUMN creator_video.topics IS
    'Topics parsed out of desc_text (#话题), de-duplicated, in first-seen order. Derived, not mirrored.';
COMMENT ON COLUMN creator_video.create_time IS
    'Publish time. NULL on 265 of 12449 upstream rows — a work without a publish time cannot be counted in posts_last_30d.';
COMMENT ON COLUMN creator_video.digg_count IS
    'Likes. NULL = not collected (this is the column the health sample size counts).';
COMMENT ON COLUMN creator_video.source_system IS
    'Mirror source system ("orange"); NULL for a work entered by hand.';
COMMENT ON COLUMN creator_video.source_id IS
    'Row identity inside source_system (orange: aweme_id).';
COMMENT ON COLUMN creator_video.archived_at IS
    'Soft delete. The unique key and the metric reads only see live rows.';
