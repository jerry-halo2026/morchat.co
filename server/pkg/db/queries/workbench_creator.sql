-- Creator commerce ledger (docs/engineering/WORKBENCH-API.md §3). Every read is
-- workspace-scoped and hides archived rows; DELETE is a soft delete.
--
-- Paging is keyset on (created_at, id): `cursor` names the last row of the
-- previous page and the tuple comparison keeps a page stable while rows are
-- inserted above it. A cursor that does not resolve in this workspace yields an
-- empty page rather than silently restarting from the top, so a stale page
-- number cannot be mistaken for "fresh data".

-- name: ListCreators :many
-- The creator ledger, each row carrying its latest content-health snapshot
-- (docs/engineering/WORKBENCH-DATA-CONTRACT.md §2.3).
--
-- The snapshot is a LEFT JOIN LATERAL and not an inner join: a creator with no
-- `creator_metric` row is still a creator someone has to see — "nobody has
-- sampled this person yet" is information — so every joined column is nullable
-- on the wire and a row cannot be filtered out by having no snapshot.
--
-- `sort` names the ordering the screen asked for: `fans` (the default, and the
-- only ranking that means anything before any work has been sampled),
-- `engagement`, `hit` and `recent` (works posted in the last 30 days). Every one
-- of them keeps `fans DESC` as its second key and the id as its third, so the
-- order is total and a cursor page can neither repeat nor skip a row; a NULL
-- sort value sorts below every value, which is what "never sampled" means.
--
-- The sort key is projected by its own lateral (`sv`) rather than repeated three
-- times: WHERE and ORDER BY both need it, and an output alias is not visible to
-- WHERE.
--
-- The cursor is a resolved (sort value, fans, id) triple, not an id the SQL
-- looks up: the handler reads the cursor creator's current numbers first, so a
-- cursor from another workspace (or a deleted one) is rejected there instead of
-- silently returning an empty page here.
SELECT sqlc.embed(c),
    h.engagement_rate,
    h.hit_rate,
    h.posts_last_30d,
    h.videos_with_stats,
    h.captured_on AS metric_captured_on
FROM creator c
LEFT JOIN LATERAL (
    SELECT
        cm.captured_on,
        cm.posts_last_30d,
        cm.videos_with_stats,
        cm.engagement_rate,
        cm.hit_rate
    FROM creator_metric cm
    WHERE cm.creator_id = c.id
      AND cm.workspace_id = c.workspace_id
    ORDER BY cm.captured_on DESC
    LIMIT 1
) h ON TRUE
CROSS JOIN LATERAL (
    SELECT CASE sqlc.arg('sort')::text
        WHEN 'engagement' THEN h.engagement_rate::numeric
        WHEN 'hit' THEN h.hit_rate::numeric
        WHEN 'recent' THEN h.posts_last_30d::numeric
        ELSE c.fans::numeric
    END AS sort_value
) sv
WHERE c.workspace_id = sqlc.arg('workspace_id')
  AND c.archived_at IS NULL
  AND (sqlc.narg('kind')::text IS NULL OR c.kind = sqlc.narg('kind')::text)
  AND (
    sqlc.narg('query')::text IS NULL
    OR c.display_name ILIKE '%' || sqlc.narg('query')::text || '%'
    OR c.handle ILIKE '%' || sqlc.narg('query')::text || '%'
  )
  AND (
    sqlc.narg('cursor_id')::uuid IS NULL
    OR (
        sv.sort_value IS NOT DISTINCT FROM sqlc.narg('cursor_value')::numeric
        AND (c.fans, c.id) < (sqlc.narg('cursor_fans')::bigint, sqlc.narg('cursor_id')::uuid)
    )
    OR sv.sort_value < sqlc.narg('cursor_value')::numeric
  )
ORDER BY sv.sort_value DESC NULLS LAST, c.fans DESC NULLS LAST, c.id DESC
LIMIT sqlc.arg('limit');

-- name: GetCreator :one
SELECT * FROM creator
WHERE id = sqlc.arg('id') AND workspace_id = sqlc.arg('workspace_id') AND archived_at IS NULL;

-- name: CreateCreator :one
INSERT INTO creator (
    workspace_id, kind, display_name, platform, handle, url, fans, fans_d7, avg_play,
    engagement_rate, category, audience_note, region, price_note, score, risk_flag,
    blacklist_reason, owner_member_id, media_ip_project_id, created_by
) VALUES (
    sqlc.arg('workspace_id'), sqlc.arg('kind'), sqlc.arg('display_name'), sqlc.arg('platform'),
    sqlc.arg('handle'), sqlc.narg('url')::text, sqlc.arg('fans'), sqlc.arg('fans_d7'),
    sqlc.arg('avg_play'), sqlc.narg('engagement_rate')::numeric, sqlc.narg('category')::text,
    sqlc.narg('audience_note')::text, sqlc.narg('region')::text, sqlc.narg('price_note')::text,
    sqlc.narg('score')::int, sqlc.arg('risk_flag'), sqlc.narg('blacklist_reason')::text,
    sqlc.narg('owner_member_id')::uuid, sqlc.narg('media_ip_project_id')::uuid,
    sqlc.narg('created_by')::uuid
)
RETURNING *;

-- name: UpdateCreator :one
-- The handler loads the row, applies the PATCH fields and resends every column,
-- so an omitted field never silently clears the stored value.
UPDATE creator
SET kind = sqlc.arg('kind'),
    display_name = sqlc.arg('display_name'),
    platform = sqlc.arg('platform'),
    handle = sqlc.arg('handle'),
    url = sqlc.narg('url')::text,
    fans = sqlc.arg('fans'),
    fans_d7 = sqlc.arg('fans_d7'),
    avg_play = sqlc.arg('avg_play'),
    engagement_rate = sqlc.narg('engagement_rate')::numeric,
    category = sqlc.narg('category')::text,
    audience_note = sqlc.narg('audience_note')::text,
    region = sqlc.narg('region')::text,
    price_note = sqlc.narg('price_note')::text,
    score = sqlc.narg('score')::int,
    risk_flag = sqlc.arg('risk_flag'),
    blacklist_reason = sqlc.narg('blacklist_reason')::text,
    owner_member_id = sqlc.narg('owner_member_id')::uuid,
    media_ip_project_id = sqlc.narg('media_ip_project_id')::uuid,
    updated_at = now()
WHERE id = sqlc.arg('id') AND workspace_id = sqlc.arg('workspace_id') AND archived_at IS NULL
RETURNING *;

-- name: ArchiveCreator :execrows
UPDATE creator
SET archived_at = now(), updated_at = now()
WHERE id = sqlc.arg('id') AND workspace_id = sqlc.arg('workspace_id') AND archived_at IS NULL;

-- name: ListCreatorVideosRecent :many
-- The newest mirrored works of one creator, for the health section of the
-- creator drawer (WORKBENCH-DATA-CONTRACT §2.1). `create_time` is nullable
-- (a work whose publish date was never captured), so the ordering sinks those
-- rows rather than hiding them, and the id keeps it total.
SELECT * FROM creator_video
WHERE workspace_id = sqlc.arg('workspace_id')::uuid
  AND creator_id = sqlc.arg('creator_id')::uuid
  AND archived_at IS NULL
ORDER BY create_time DESC NULLS LAST, id DESC
LIMIT sqlc.arg('limit')::integer;

-- name: ListCreatorPosts :many
SELECT *
FROM creator_post
WHERE workspace_id = sqlc.arg('workspace_id')
  AND archived_at IS NULL
  AND (sqlc.narg('creator_id')::uuid IS NULL OR creator_id = sqlc.narg('creator_id')::uuid)
  AND (sqlc.narg('published_from')::timestamptz IS NULL OR published_at >= sqlc.narg('published_from')::timestamptz)
  AND (sqlc.narg('published_to')::timestamptz IS NULL OR published_at <= sqlc.narg('published_to')::timestamptz)
  AND (
    sqlc.narg('cursor_at')::timestamptz IS NULL
    OR (published_at, id) < (sqlc.narg('cursor_at')::timestamptz, sqlc.narg('cursor_id')::uuid)
  )
ORDER BY published_at DESC, id DESC
LIMIT sqlc.arg('limit');

-- name: GetCreatorPost :one
SELECT * FROM creator_post
WHERE id = sqlc.arg('id') AND workspace_id = sqlc.arg('workspace_id') AND archived_at IS NULL;

-- name: CreateCreatorPost :one
-- `media_script_id` (733) is the publish → plan link the content workbench writes:
-- an operator publishing a scripted post names the version it came from. NULL is
-- the ordinary value for an unscripted post (external 达人, history), so the column
-- stays optional and the handler validates the pointer before it gets here.
INSERT INTO creator_post (
    workspace_id, creator_id, collab_id, content_issue_id, product_id, pick_id,
    media_script_id, platform, title, url, published_at, source, created_by
) VALUES (
    sqlc.arg('workspace_id'), sqlc.arg('creator_id'), sqlc.narg('collab_id')::uuid,
    sqlc.narg('content_issue_id')::uuid, sqlc.narg('product_id')::uuid, sqlc.narg('pick_id')::uuid,
    sqlc.narg('media_script_id')::uuid, sqlc.arg('platform'), sqlc.narg('title')::text,
    sqlc.arg('url'), sqlc.arg('published_at'), sqlc.arg('source'), sqlc.narg('created_by')::uuid
)
RETURNING *;

-- name: UpdateCreatorPost :one
UPDATE creator_post
SET creator_id = sqlc.arg('creator_id'),
    collab_id = sqlc.narg('collab_id')::uuid,
    content_issue_id = sqlc.narg('content_issue_id')::uuid,
    product_id = sqlc.narg('product_id')::uuid,
    pick_id = sqlc.narg('pick_id')::uuid,
    media_script_id = sqlc.narg('media_script_id')::uuid,
    platform = sqlc.arg('platform'),
    title = sqlc.narg('title')::text,
    url = sqlc.arg('url'),
    published_at = sqlc.arg('published_at'),
    source = sqlc.arg('source'),
    updated_at = now()
WHERE id = sqlc.arg('id') AND workspace_id = sqlc.arg('workspace_id') AND archived_at IS NULL
RETURNING *;

-- name: ArchiveCreatorPost :execrows
UPDATE creator_post
SET archived_at = now(), updated_at = now()
WHERE id = sqlc.arg('id') AND workspace_id = sqlc.arg('workspace_id') AND archived_at IS NULL;

-- name: ListCreatorPostMetrics :many
SELECT * FROM creator_post_metric
WHERE workspace_id = sqlc.arg('workspace_id')
  AND post_id = sqlc.arg('post_id')
  AND (sqlc.narg('captured_from')::date IS NULL OR captured_on >= sqlc.narg('captured_from')::date)
  AND (sqlc.narg('captured_to')::date IS NULL OR captured_on <= sqlc.narg('captured_to')::date)
ORDER BY captured_on DESC, id DESC
LIMIT sqlc.arg('limit');

-- name: UpsertCreatorPostMetric :one
-- One snapshot per (post, day): re-importing a CSV rewrites that day instead of
-- appending a duplicate observation.
INSERT INTO creator_post_metric (
    workspace_id, post_id, captured_on, play, likes, comments, shares, clicks,
    converts, gmv_amount, currency, source
) VALUES (
    sqlc.arg('workspace_id'), sqlc.arg('post_id'), sqlc.arg('captured_on'),
    sqlc.narg('play')::bigint, sqlc.narg('likes')::bigint, sqlc.narg('comments')::bigint,
    sqlc.narg('shares')::bigint, sqlc.narg('clicks')::bigint, sqlc.narg('converts')::bigint,
    sqlc.narg('gmv_amount')::numeric, sqlc.arg('currency'), sqlc.arg('source')
)
ON CONFLICT (post_id, captured_on) DO UPDATE
SET play = EXCLUDED.play,
    likes = EXCLUDED.likes,
    comments = EXCLUDED.comments,
    shares = EXCLUDED.shares,
    clicks = EXCLUDED.clicks,
    converts = EXCLUDED.converts,
    gmv_amount = EXCLUDED.gmv_amount,
    currency = EXCLUDED.currency,
    source = EXCLUDED.source,
    updated_at = now()
RETURNING *;
