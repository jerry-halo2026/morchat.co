-- The workbench audit trail (docs/engineering/COLLAB-MODEL.md §2).
--
-- `activity_log` already carries every issue timeline event; these three
-- statements are the ledger-row half of the same table. A workbench write records
-- `subject_type` + `subject_id` (migration 819) instead of `issue_id`, which stays
-- NULL for these rows — an audit event is about a ledger row, not about a
-- discussion, and the two must not be readable as each other.

-- name: CreateWorkbenchActivity :one
-- One event. `details` arrives as a JSON **string** and is cast in SQL, because
-- under simple_protocol (the only mode a transaction-pooling proxy survives) a
-- []byte parameter is sent as bytea hex and jsonb rejects it (docs/engineering/DB.md).
INSERT INTO activity_log (
    workspace_id, subject_type, subject_id, actor_type, actor_id, action, details
) VALUES (
    sqlc.arg('workspace_id')::uuid, sqlc.arg('subject_type')::text,
    sqlc.arg('subject_id')::uuid, sqlc.arg('actor_type')::text,
    sqlc.narg('actor_id')::uuid, sqlc.arg('action')::text,
    sqlc.arg('details')::text::jsonb
)
RETURNING *;

-- name: GetLastWorkbenchActivity :one
-- The newest event for one ledger row: what a GET echoes as `last_actor`, and
-- what a 409 hands back so the reader can see who moved the row under them.
SELECT * FROM activity_log
WHERE workspace_id = sqlc.arg('workspace_id')::uuid
  AND subject_type = sqlc.arg('subject_type')::text
  AND subject_id = sqlc.arg('subject_id')::uuid
ORDER BY created_at DESC, id DESC
LIMIT 1;

-- name: ListLastWorkbenchActivities :many
-- The same answer for a whole list in one round trip: DISTINCT ON keeps the
-- newest row per subject, so a 200-row page costs one query instead of 200.
-- Callers pass the ids they are about to render; an empty array is a valid input
-- and answers nothing.
--
-- `details` rides along for the review queue (§26.2), which shows which business
-- fields the write touched and whether the change carries an `overwrite_reason`.
-- The trail readers that only need the actor ignore it; selecting it here is one
-- column cheaper than a second per-subject query.
SELECT DISTINCT ON (subject_id)
    subject_id, actor_type, actor_id, action, details, created_at
FROM activity_log
WHERE workspace_id = sqlc.arg('workspace_id')::uuid
  AND subject_type = sqlc.arg('subject_type')::text
  AND subject_id = ANY(sqlc.arg('subject_ids')::uuid[])
ORDER BY subject_id, created_at DESC, id DESC;
