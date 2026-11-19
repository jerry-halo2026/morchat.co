-- Content workbench read/write paths (docs/engineering/WORKBENCH-API.md §12):
-- media_ip / media_topic / media_script / media_shoot, plus the account list that
-- hangs off `creator.media_ip_id`.
--
-- Same conventions as the B0 ledgers: workspace-scoped, archived rows hidden,
-- soft delete via `archived_at`, lists bounded by `LIMIT`. None of the four
-- tables pages with a keyset cursor — a content board is read a screen at a time
-- and the IP / topic / script lists are small by nature (an IP has tens of
-- scripts, not thousands) — so the lists sort by `created_at DESC, id DESC`
-- except the shoot calendar, which sorts by the date it filters on.
--
-- Two rules live in the SQL rather than the handler, because they must hold even
-- if a second caller appears:
--
--   * a new script version's number is `MAX(version) + 1` computed inside the
--     INSERT, over every row of the topic (archived included) so a number is
--     never reused. Two concurrent rewrites then collide on 739's unique index
--     and the loser sees 409 instead of a duplicate v2;
--   * an account attaches to an IP only through `SetCreatorMediaIP`, which is
--     also the detach (a NULL `media_ip_id`) — there is no second write path that
--     could leave `creator` and the IP disagreeing.

-- name: ListMediaIPs :many
SELECT *
FROM media_ip
WHERE workspace_id = sqlc.arg('workspace_id')
  AND archived_at IS NULL
  AND (sqlc.narg('status')::text IS NULL OR status = sqlc.narg('status')::text)
ORDER BY created_at DESC, id DESC
LIMIT sqlc.arg('limit');

-- name: GetMediaIP :one
SELECT * FROM media_ip
WHERE id = sqlc.arg('id') AND workspace_id = sqlc.arg('workspace_id') AND archived_at IS NULL;

-- name: CreateMediaIP :one
INSERT INTO media_ip (
    workspace_id, name, persona, track, audience, color, week_goal, status,
    owner_member_id, created_by
) VALUES (
    sqlc.arg('workspace_id'), sqlc.arg('name'), sqlc.narg('persona')::text,
    sqlc.narg('track')::text, sqlc.narg('audience')::text, sqlc.narg('color')::text,
    sqlc.arg('week_goal'), sqlc.arg('status'), sqlc.narg('owner_member_id')::uuid,
    sqlc.narg('created_by')::uuid
)
RETURNING *;

-- name: UpdateMediaIP :one
-- The handler loads the row, applies the PATCH fields and resends every column,
-- so an omitted field never silently clears the stored value.
UPDATE media_ip
SET name = sqlc.arg('name'),
    persona = sqlc.narg('persona')::text,
    track = sqlc.narg('track')::text,
    audience = sqlc.narg('audience')::text,
    color = sqlc.narg('color')::text,
    week_goal = sqlc.arg('week_goal'),
    status = sqlc.arg('status'),
    owner_member_id = sqlc.narg('owner_member_id')::uuid,
    updated_at = now()
WHERE id = sqlc.arg('id') AND workspace_id = sqlc.arg('workspace_id') AND archived_at IS NULL
RETURNING *;

-- name: ArchiveMediaIP :execrows
-- The accounts under it keep their `media_ip_id`: archiving an IP says "this
-- persona was created by mistake", not "detach every account". A dangling
-- pointer is tolerated on read (`ListMediaIPAccounts` is the only consumer and it
-- reads through the IP), and re-creating the IP does not adopt them back.
UPDATE media_ip
SET archived_at = now(), updated_at = now()
WHERE id = sqlc.arg('id') AND workspace_id = sqlc.arg('workspace_id') AND archived_at IS NULL;

-- name: ListMediaIPAccounts :many
-- The platform accounts attached to one IP: `creator` rows whose `media_ip_id`
-- points here (729). Ordered like the creator ledger so the two screens agree.
SELECT * FROM creator
WHERE workspace_id = sqlc.arg('workspace_id')
  AND media_ip_id = sqlc.arg('media_ip_id')
  AND archived_at IS NULL
ORDER BY created_at DESC, id DESC;

-- name: SetCreatorMediaIP :one
-- Attach (`media_ip_id` = the IP) and detach (NULL) in one statement: the caller
-- passes the value it wants the column to hold. The archived predicate keeps a
-- deleted account from being re-attached by a stale screen.
UPDATE creator
SET media_ip_id = sqlc.narg('media_ip_id')::uuid,
    updated_at = now()
WHERE id = sqlc.arg('id') AND workspace_id = sqlc.arg('workspace_id') AND archived_at IS NULL
RETURNING *;

-- name: ListMediaTopics :many
SELECT *
FROM media_topic
WHERE workspace_id = sqlc.arg('workspace_id')
  AND archived_at IS NULL
  AND (sqlc.narg('ip_id')::uuid IS NULL OR ip_id = sqlc.narg('ip_id')::uuid)
  AND (sqlc.narg('status')::text IS NULL OR status = sqlc.narg('status')::text)
ORDER BY created_at DESC, id DESC
LIMIT sqlc.arg('limit');

-- name: GetMediaTopic :one
SELECT * FROM media_topic
WHERE id = sqlc.arg('id') AND workspace_id = sqlc.arg('workspace_id') AND archived_at IS NULL;

-- name: CreateMediaTopic :one
INSERT INTO media_topic (
    workspace_id, ip_id, title, source, scores, status, hot_id, note,
    owner_member_id, created_by
) VALUES (
    sqlc.arg('workspace_id'), sqlc.arg('ip_id'), sqlc.arg('title'), sqlc.arg('source'),
    sqlc.arg('scores')::jsonb, sqlc.arg('status'), sqlc.narg('hot_id')::uuid,
    sqlc.narg('note')::text, sqlc.narg('owner_member_id')::uuid, sqlc.narg('created_by')::uuid
)
RETURNING *;

-- name: UpdateMediaTopic :one
UPDATE media_topic
SET ip_id = sqlc.arg('ip_id'),
    title = sqlc.arg('title'),
    source = sqlc.arg('source'),
    scores = sqlc.arg('scores')::jsonb,
    status = sqlc.arg('status'),
    hot_id = sqlc.narg('hot_id')::uuid,
    note = sqlc.narg('note')::text,
    owner_member_id = sqlc.narg('owner_member_id')::uuid,
    updated_at = now()
WHERE id = sqlc.arg('id') AND workspace_id = sqlc.arg('workspace_id') AND archived_at IS NULL
RETURNING *;

-- name: ArchiveMediaTopic :execrows
UPDATE media_topic
SET archived_at = now(), updated_at = now()
WHERE id = sqlc.arg('id') AND workspace_id = sqlc.arg('workspace_id') AND archived_at IS NULL;

-- name: ListMediaScripts :many
SELECT *
FROM media_script
WHERE workspace_id = sqlc.arg('workspace_id')
  AND archived_at IS NULL
  AND (sqlc.narg('topic_id')::uuid IS NULL OR topic_id = sqlc.narg('topic_id')::uuid)
  AND (sqlc.narg('status')::text IS NULL OR status = sqlc.narg('status')::text)
ORDER BY created_at DESC, id DESC
LIMIT sqlc.arg('limit');

-- name: GetMediaScript :one
SELECT * FROM media_script
WHERE id = sqlc.arg('id') AND workspace_id = sqlc.arg('workspace_id') AND archived_at IS NULL;

-- name: CreateMediaScript :one
-- Inserts the next version of a topic's script. `version` is not a parameter: it
-- is computed here, so callers cannot skip a number or reuse one. The subquery
-- deliberately does not filter `archived_at` — a version number stays spent after
-- its row is soft deleted.
INSERT INTO media_script (
    workspace_id, topic_id, ip_id, version, hook, body, cta, cover_note, tags,
    status, publish_at, owner_member_id, created_by
) VALUES (
    sqlc.arg('workspace_id'), sqlc.arg('topic_id'), sqlc.narg('ip_id')::uuid,
    (
        SELECT COALESCE(MAX(version), 0) + 1
        FROM media_script
        WHERE workspace_id = sqlc.arg('workspace_id') AND topic_id = sqlc.arg('topic_id')
    ),
    sqlc.narg('hook')::text, sqlc.narg('body')::text, sqlc.narg('cta')::text,
    sqlc.narg('cover_note')::text, sqlc.arg('tags')::text[], sqlc.arg('status'),
    sqlc.narg('publish_at')::timestamptz, sqlc.narg('owner_member_id')::uuid,
    sqlc.narg('created_by')::uuid
)
RETURNING *;

-- name: UpdateMediaScript :one
-- The in-place write (`?inPlace=1`), and the path a PATCH that only moves
-- `status` or `publish_at` takes: a version number belongs to a *text*, so a
-- review decision must not mint one.
UPDATE media_script
SET ip_id = sqlc.narg('ip_id')::uuid,
    hook = sqlc.narg('hook')::text,
    body = sqlc.narg('body')::text,
    cta = sqlc.narg('cta')::text,
    cover_note = sqlc.narg('cover_note')::text,
    tags = sqlc.arg('tags')::text[],
    status = sqlc.arg('status'),
    publish_at = sqlc.narg('publish_at')::timestamptz,
    owner_member_id = sqlc.narg('owner_member_id')::uuid,
    updated_at = now()
WHERE id = sqlc.arg('id') AND workspace_id = sqlc.arg('workspace_id') AND archived_at IS NULL
RETURNING *;

-- name: ArchiveMediaScript :execrows
UPDATE media_script
SET archived_at = now(), updated_at = now()
WHERE id = sqlc.arg('id') AND workspace_id = sqlc.arg('workspace_id') AND archived_at IS NULL;

-- name: ListMediaShoots :many
-- The shoot calendar, filtered on the date it sorts by. `from`/`to` are inclusive
-- calendar days.
SELECT *
FROM media_shoot
WHERE workspace_id = sqlc.arg('workspace_id')
  AND archived_at IS NULL
  AND (sqlc.narg('script_id')::uuid IS NULL OR script_id = sqlc.narg('script_id')::uuid)
  AND (sqlc.narg('from_date')::date IS NULL OR shoot_date >= sqlc.narg('from_date')::date)
  AND (sqlc.narg('to_date')::date IS NULL OR shoot_date <= sqlc.narg('to_date')::date)
ORDER BY shoot_date ASC, id ASC
LIMIT sqlc.arg('limit');

-- name: GetMediaShoot :one
SELECT * FROM media_shoot
WHERE id = sqlc.arg('id') AND workspace_id = sqlc.arg('workspace_id') AND archived_at IS NULL;

-- name: CreateMediaShoot :one
INSERT INTO media_shoot (
    workspace_id, script_id, shoot_date, location, shots, checklist, status,
    owner_member_id, created_by
) VALUES (
    sqlc.arg('workspace_id'), sqlc.arg('script_id'), sqlc.arg('shoot_date')::date,
    sqlc.narg('location')::text, sqlc.arg('shots')::jsonb, sqlc.arg('checklist')::jsonb,
    sqlc.arg('status'), sqlc.narg('owner_member_id')::uuid, sqlc.narg('created_by')::uuid
)
RETURNING *;

-- name: UpdateMediaShoot :one
-- `shots` and `checklist` are written whole here: the handler merges a partial
-- checklist over the stored object before calling, so the "tick one box" case
-- stays a read-modify-write in one place (Go) instead of a jsonb || in SQL that
-- two callers could implement differently.
UPDATE media_shoot
SET script_id = sqlc.arg('script_id'),
    shoot_date = sqlc.arg('shoot_date')::date,
    location = sqlc.narg('location')::text,
    shots = sqlc.arg('shots')::jsonb,
    checklist = sqlc.arg('checklist')::jsonb,
    status = sqlc.arg('status'),
    owner_member_id = sqlc.narg('owner_member_id')::uuid,
    updated_at = now()
WHERE id = sqlc.arg('id') AND workspace_id = sqlc.arg('workspace_id') AND archived_at IS NULL
RETURNING *;

-- name: ArchiveMediaShoot :execrows
UPDATE media_shoot
SET archived_at = now(), updated_at = now()
WHERE id = sqlc.arg('id') AND workspace_id = sqlc.arg('workspace_id') AND archived_at IS NULL;
