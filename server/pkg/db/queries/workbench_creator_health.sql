-- Creator content health: the two metric tables' reads, the mirror writes the
-- orange video sync needs, and the daily snapshot upsert
-- (docs/engineering/WORKBENCH-DATA-CONTRACT.md §2, docs/engineering/ORANGE-SYNC.md).
--
-- Three groups live in one file because they are one data path: works come in
-- from the upstream mirror (Insert/UpdateMirroredCreatorVideos), a run turns them
-- into one day's numbers (ListCreatorVideosForHealth + UpsertCreatorMetrics), and
-- the workbench reads those numbers back (ListCreatorHealth, GetCreatorMetric*).
--
-- Nothing here is reachable from an HTTP write: the video mirror and the snapshot
-- upsert run as `cmd/orange-sync -videos`. The two read statements are the only
-- ones the API serves.

-- ---- reads ----------------------------------------------------------------

-- name: ListCreatorHealth :many
-- The health board: every live creator in the workspace, each with its latest
-- snapshot, ordered by the requested sort key.
--
-- A creator with no snapshot is NOT filtered out. "This person has no content
-- data yet" is a fact a reader needs to see, and dropping the row would make the
-- board silently shorter than the creator list it summarizes.
--
-- The sort key is one CASE over (creators × latest snapshot) rather than three
-- statements: the ordering spans both tables, so no single index serves any of
-- them anyway, and the board is a few hundred rows per workspace. NULLS LAST is
-- explicit because every sorted metric is nullable — an unsampled creator must
-- sink to the bottom of `sort=engagement`, not float to the top.
--
-- The cursor is (sort_value, fans, creator id) from the previous page's last row;
-- the caller resolves `cursor_id`'s current numbers and passes them back. The
-- tiebreaks matter twice: `fans DESC` is the meaningful second key (among
-- creators with no engagement figure, show the biggest audience first), and the
-- id makes the order total so a page boundary cannot repeat or skip a row.
WITH ranked AS (
    SELECT
        c.id,
        c.display_name,
        c.fans,
        m.captured_on,
        m.posts_last_30d,
        m.videos_with_stats,
        m.engagement_rate,
        m.hit_rate,
        CASE sqlc.arg('sort')::text
            WHEN 'engagement' THEN m.engagement_rate::numeric
            WHEN 'hit' THEN m.hit_rate::numeric
            ELSE c.fans::numeric
        END AS sort_value
    FROM creator c
    LEFT JOIN LATERAL (
        SELECT
            cm.captured_on,
            cm.posts_last_30d,
            cm.videos_with_stats,
            cm.engagement_rate,
            cm.hit_rate
        FROM creator_metric cm
        WHERE cm.workspace_id = c.workspace_id
          AND cm.creator_id = c.id
        ORDER BY cm.captured_on DESC
        LIMIT 1
    ) m ON TRUE
    WHERE c.workspace_id = sqlc.arg('workspace_id')::uuid
      AND c.archived_at IS NULL
)
SELECT
    id,
    display_name,
    fans,
    captured_on,
    posts_last_30d,
    videos_with_stats,
    engagement_rate,
    hit_rate
FROM ranked
WHERE sqlc.narg('cursor_id')::uuid IS NULL
   OR (
        sort_value IS NOT NULL
        AND (
            sort_value < sqlc.narg('cursor_value')::numeric
            OR (
                sort_value = sqlc.narg('cursor_value')::numeric
                AND (
                    fans < sqlc.narg('cursor_fans')::bigint
                    OR (fans = sqlc.narg('cursor_fans')::bigint AND id < sqlc.narg('cursor_id')::uuid)
                )
            )
        )
   )
   OR (
        sort_value IS NULL
        AND sqlc.narg('cursor_value')::numeric IS NULL
        AND (
            fans < sqlc.narg('cursor_fans')::bigint
            OR (fans = sqlc.narg('cursor_fans')::bigint AND id < sqlc.narg('cursor_id')::uuid)
        )
   )
ORDER BY sort_value DESC NULLS LAST, fans DESC, id DESC
LIMIT sqlc.arg('limit')::integer;

-- name: GetCreatorMetricLatest :one
-- The newest snapshot for one creator. `pgx.ErrNoRows` means "never sampled",
-- which the detail endpoint reports as `latest: null`.
SELECT
    id, workspace_id, creator_id, captured_on, video_count, videos_with_stats,
    posts_last_30d, avg_digg, avg_comment, avg_share, engagement_rate, hit_rate,
    sample_note, created_at, updated_at
FROM creator_metric
WHERE workspace_id = sqlc.arg('workspace_id')::uuid
  AND creator_id = sqlc.arg('creator_id')::uuid
ORDER BY captured_on DESC
LIMIT 1;

-- name: ListCreatorMetricRecent :many
-- The trend window: the last `days` calendar days, newest first. 30 days means
-- `days = 29` (today plus the 29 days before it), because the window includes
-- today's snapshot — the one a sync just wrote.
SELECT
    id, workspace_id, creator_id, captured_on, video_count, videos_with_stats,
    posts_last_30d, avg_digg, avg_comment, avg_share, engagement_rate, hit_rate,
    sample_note, created_at, updated_at
FROM creator_metric
WHERE workspace_id = sqlc.arg('workspace_id')::uuid
  AND creator_id = sqlc.arg('creator_id')::uuid
  AND captured_on >= (CURRENT_DATE - sqlc.arg('days')::integer)
ORDER BY captured_on DESC;

-- ---- video mirror writes --------------------------------------------------

-- name: ListVideoMirrorCreators :many
-- The sec_uid → creator.id map the video sync mirrors through.
--
-- Only live mirror rows: a creator archived in this workspace no longer receives
-- new works, and a work that cannot be attributed is skipped rather than guessed
-- at.
SELECT id, source_id
FROM creator
WHERE workspace_id = sqlc.arg('workspace_id')::uuid
  AND source_system = sqlc.arg('source_system')::text
  AND archived_at IS NULL
  AND source_id IS NOT NULL;

-- name: ListCreatorFollowers :many
-- The follower count the engagement rate divides by, for the creators a metric
-- run is about.
--
-- Deliberately not the mirror-only read: the metric job works for any creator
-- this workspace tracks, so a hand-entered creator with works gets the same
-- treatment. `fans` is NOT NULL on `creator` (660), so the only "no follower
-- count" case that reaches the metric is a real 0 — which the contract treats as
-- "cannot divide", the same as unknown.
SELECT id, fans
FROM creator
WHERE workspace_id = sqlc.arg('workspace_id')::uuid
  AND id = ANY(sqlc.arg('creator_ids')::uuid[])
  AND archived_at IS NULL;

-- name: ListMirroredVideoIDs :many
-- aweme_id → local row id for this workspace's live works. One read per run: it
-- is what tells the sync whether a work is new, and it is small enough (12k rows
-- today) to hold in memory for the duration of a batch.
SELECT id, aweme_id
FROM creator_video
WHERE workspace_id = sqlc.arg('workspace_id')::uuid
  AND archived_at IS NULL;

-- name: InsertMirroredCreatorVideos :execrows
-- The create half of the video mirror. Rows travel as one jsonb array per
-- statement, the same shape orange_sync.sql uses for creators.
--
-- ON CONFLICT DO NOTHING is the belt to the caller's braces: the caller decides
-- insert vs update from ListMirroredVideoIDs, and a work that appeared between
-- that read and this write is counted as unchanged instead of failing the batch.
INSERT INTO creator_video (
    workspace_id, creator_id, aweme_id, desc_text, topics, create_time,
    duration_ms, digg_count, comment_count, share_count, cover_url, video_url,
    stats_collected_at, source_system, source_id
)
SELECT
    sqlc.arg('workspace_id')::uuid,
    r.creator_id,
    r.aweme_id,
    r.desc_text,
    COALESCE(r.topics, '{}'::text[]),
    r.create_time,
    r.duration_ms,
    r.digg_count,
    r.comment_count,
    r.share_count,
    r.cover_url,
    r.video_url,
    r.stats_collected_at,
    sqlc.arg('source_system')::text,
    r.source_id
FROM jsonb_to_recordset(sqlc.arg('rows')::jsonb) AS r(
    creator_id UUID,
    aweme_id TEXT,
    desc_text TEXT,
    topics TEXT[],
    create_time TIMESTAMPTZ,
    duration_ms INTEGER,
    digg_count INTEGER,
    comment_count INTEGER,
    share_count INTEGER,
    cover_url TEXT,
    video_url TEXT,
    stats_collected_at TIMESTAMPTZ,
    source_id TEXT
)
ON CONFLICT DO NOTHING;

-- name: UpdateMirroredCreatorVideos :execrows
-- The update half. The WHERE clause is the idempotence contract: a work whose
-- mirrored columns already match is not rewritten and not counted, so a second
-- run of the same page reports Updated = 0 and does not bump updated_at on 12k
-- rows.
--
-- Statistics are the point of the mirror, so a counter that is NULL upstream
-- overwrites a previously collected number rather than keeping it: the upstream
-- row is the current truth, and "the platform stopped reporting this" is
-- information the metrics must see.
UPDATE creator_video AS v
SET creator_id = r.creator_id,
    desc_text = r.desc_text,
    topics = COALESCE(r.topics, '{}'::text[]),
    create_time = r.create_time,
    duration_ms = r.duration_ms,
    digg_count = r.digg_count,
    comment_count = r.comment_count,
    share_count = r.share_count,
    cover_url = r.cover_url,
    video_url = r.video_url,
    stats_collected_at = r.stats_collected_at,
    updated_at = now()
FROM jsonb_to_recordset(sqlc.arg('rows')::jsonb) AS r(
    id UUID,
    creator_id UUID,
    desc_text TEXT,
    topics TEXT[],
    create_time TIMESTAMPTZ,
    duration_ms INTEGER,
    digg_count INTEGER,
    comment_count INTEGER,
    share_count INTEGER,
    cover_url TEXT,
    video_url TEXT,
    stats_collected_at TIMESTAMPTZ
)
WHERE v.id = r.id
  AND v.workspace_id = sqlc.arg('workspace_id')::uuid
  AND (
    v.creator_id IS DISTINCT FROM r.creator_id
    OR v.desc_text IS DISTINCT FROM r.desc_text
    OR v.topics IS DISTINCT FROM COALESCE(r.topics, '{}'::text[])
    OR v.create_time IS DISTINCT FROM r.create_time
    OR v.duration_ms IS DISTINCT FROM r.duration_ms
    OR v.digg_count IS DISTINCT FROM r.digg_count
    OR v.comment_count IS DISTINCT FROM r.comment_count
    OR v.share_count IS DISTINCT FROM r.share_count
    OR v.cover_url IS DISTINCT FROM r.cover_url
    OR v.video_url IS DISTINCT FROM r.video_url
    OR v.stats_collected_at IS DISTINCT FROM r.stats_collected_at
  );

-- ---- daily snapshot -------------------------------------------------------

-- name: ListCreatorVideosForHealth :many
-- Every live work of the given creators, for ComputeHealth. The metrics need all
-- of a creator's works (the median is over the whole set), not just the ones a
-- run touched.
SELECT creator_id, aweme_id, create_time, digg_count, comment_count, share_count
FROM creator_video
WHERE workspace_id = sqlc.arg('workspace_id')::uuid
  AND creator_id = ANY(sqlc.arg('creator_ids')::uuid[])
  AND archived_at IS NULL;

-- name: UpsertCreatorMetrics :execrows
-- One day's snapshot per creator, as one batch.
--
-- The DO UPDATE carries a WHERE: a re-run on the same day with the same inputs
-- changes nothing and reports 0, so `computed` means "rows this run actually
-- changed" rather than "rows it touched". The NULL metrics travel as JSON null
-- and land as SQL NULL — that is the whole point of the contract's "unknown is
-- not 0".
INSERT INTO creator_metric (
    workspace_id, creator_id, captured_on, video_count, videos_with_stats,
    posts_last_30d, avg_digg, avg_comment, avg_share, engagement_rate, hit_rate,
    sample_note
)
SELECT
    sqlc.arg('workspace_id')::uuid,
    r.creator_id,
    sqlc.arg('captured_on')::date,
    r.video_count,
    r.videos_with_stats,
    r.posts_last_30d,
    r.avg_digg,
    r.avg_comment,
    r.avg_share,
    r.engagement_rate,
    r.hit_rate,
    r.sample_note
FROM jsonb_to_recordset(sqlc.arg('rows')::jsonb) AS r(
    creator_id UUID,
    video_count INTEGER,
    videos_with_stats INTEGER,
    posts_last_30d INTEGER,
    avg_digg NUMERIC(14, 2),
    avg_comment NUMERIC(14, 2),
    avg_share NUMERIC(14, 2),
    engagement_rate NUMERIC(10, 5),
    hit_rate NUMERIC(6, 5),
    sample_note TEXT
)
ON CONFLICT (workspace_id, creator_id, captured_on) DO UPDATE
SET video_count = excluded.video_count,
    videos_with_stats = excluded.videos_with_stats,
    posts_last_30d = excluded.posts_last_30d,
    avg_digg = excluded.avg_digg,
    avg_comment = excluded.avg_comment,
    avg_share = excluded.avg_share,
    engagement_rate = excluded.engagement_rate,
    hit_rate = excluded.hit_rate,
    sample_note = excluded.sample_note,
    updated_at = now()
WHERE creator_metric.video_count IS DISTINCT FROM excluded.video_count
   OR creator_metric.videos_with_stats IS DISTINCT FROM excluded.videos_with_stats
   OR creator_metric.posts_last_30d IS DISTINCT FROM excluded.posts_last_30d
   OR creator_metric.avg_digg IS DISTINCT FROM excluded.avg_digg
   OR creator_metric.avg_comment IS DISTINCT FROM excluded.avg_comment
   OR creator_metric.avg_share IS DISTINCT FROM excluded.avg_share
   OR creator_metric.engagement_rate IS DISTINCT FROM excluded.engagement_rate
   OR creator_metric.hit_rate IS DISTINCT FROM excluded.hit_rate
   OR creator_metric.sample_note IS DISTINCT FROM excluded.sample_note;
