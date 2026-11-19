-- OKR goals and the radar signals that feed them (docs/engineering/WORKBENCH-API.md
-- §13): goal_okr / goal_key_result / goal_package / market_signal, plus the
-- pointer `issue.goal_id` that hangs tasks off a goal.
--
-- Same conventions as the other workbench ledgers: workspace-scoped, archived
-- rows hidden, soft delete via `archived_at`, lists bounded by `LIMIT`. No table
-- here pages with a keyset cursor — a cycle holds tens of goals and a radar queue
-- is read a screen at a time — so the lists sort by cycle / grade and then by
-- creation, except the child lists, which sort by the `position` the operator
-- set.
--
-- Three rules live in the SQL rather than the handler, because they must hold
-- even if a second caller appears:
--
--   * the child reads take the parent id *set*, so a goal list embeds its key
--     results and its packages in two queries instead of one per goal;
--   * children are ordered by `position` and then by creation, so two rows that
--     share a position still render deterministically;
--   * a signal converts at most once: `ConvertMarketSignal` refuses a row that is
--     already `converted`, which is what turns a second click into a 409 instead
--     of a second goal.

-- name: ListGoals :many
-- Keyset on `(cycle, created_at, id)`: the cycle is the ranking the screen reads,
-- and creation plus id break ties inside it, so the order is total. The cursor is
-- the previous page's last row id; the handler re-reads its two sort keys.
SELECT *
FROM goal_okr
WHERE workspace_id = sqlc.arg('workspace_id')
  AND archived_at IS NULL
  AND (sqlc.narg('cycle')::text IS NULL OR cycle = sqlc.narg('cycle')::text)
  AND (sqlc.narg('status')::text IS NULL OR status = sqlc.narg('status')::text)
  AND (
    sqlc.narg('cursor_id')::uuid IS NULL
    OR (cycle, created_at, id)
      < (sqlc.narg('cursor_cycle')::text, sqlc.narg('cursor_at')::timestamptz, sqlc.narg('cursor_id')::uuid)
  )
ORDER BY cycle DESC, created_at DESC, id DESC
LIMIT sqlc.arg('limit');

-- name: GetGoal :one
SELECT * FROM goal_okr
WHERE id = sqlc.arg('id') AND workspace_id = sqlc.arg('workspace_id') AND archived_at IS NULL;

-- name: CreateGoal :one
INSERT INTO goal_okr (
    workspace_id, cycle, title, description, owner_member_id, department_id,
    status, due_date, priority, created_by
) VALUES (
    sqlc.arg('workspace_id'), sqlc.arg('cycle'), sqlc.arg('title'),
    sqlc.narg('description')::text, sqlc.arg('owner_member_id'),
    sqlc.narg('department_id')::uuid, sqlc.arg('status'), sqlc.narg('due_date')::date,
    sqlc.arg('priority'), sqlc.narg('created_by')::uuid
)
RETURNING *;

-- name: UpdateGoal :one
-- The handler loads the row, applies the PATCH fields and resends every column,
-- so an omitted field never silently clears the stored value.
UPDATE goal_okr
SET cycle = sqlc.arg('cycle'),
    title = sqlc.arg('title'),
    description = sqlc.narg('description')::text,
    owner_member_id = sqlc.arg('owner_member_id'),
    department_id = sqlc.narg('department_id')::uuid,
    status = sqlc.arg('status'),
    due_date = sqlc.narg('due_date')::date,
    priority = sqlc.arg('priority'),
    updated_at = now()
WHERE id = sqlc.arg('id') AND workspace_id = sqlc.arg('workspace_id') AND archived_at IS NULL
RETURNING *;

-- name: ArchiveGoal :execrows
UPDATE goal_okr
SET archived_at = now(), updated_at = now()
WHERE id = sqlc.arg('id') AND workspace_id = sqlc.arg('workspace_id') AND archived_at IS NULL;

-- name: ListGoalKeyResults :many
-- Every live key result of the given goals, ordered by `position` and then by
-- creation. The caller passes the id set it just listed (or the single goal it
-- is opening), which is why this read has no per-goal variant: one statement
-- serves both the detail screen and the embedded list.
SELECT *
FROM goal_key_result
WHERE workspace_id = sqlc.arg('workspace_id')
  AND archived_at IS NULL
  AND goal_id = ANY(sqlc.arg('goal_ids')::uuid[])
ORDER BY goal_id, position ASC, created_at ASC, id ASC;

-- name: GetGoalKeyResult :one
SELECT * FROM goal_key_result
WHERE id = sqlc.arg('id') AND workspace_id = sqlc.arg('workspace_id') AND archived_at IS NULL;

-- name: CreateGoalKeyResult :one
INSERT INTO goal_key_result (
    workspace_id, goal_id, title, target, current, unit, position, status, created_by
) VALUES (
    sqlc.arg('workspace_id'), sqlc.arg('goal_id'), sqlc.arg('title'),
    sqlc.narg('target')::numeric, sqlc.arg('current'), sqlc.narg('unit')::text,
    sqlc.arg('position'), sqlc.arg('status'), sqlc.narg('created_by')::uuid
)
RETURNING *;

-- name: UpdateGoalKeyResult :one
-- `current` is written here and nowhere else on the read path: the column holds
-- a figure somebody recorded (745), so an aggregate pass calls this statement
-- with the number it computed rather than making every read recompute one.
UPDATE goal_key_result
SET title = sqlc.arg('title'),
    target = sqlc.narg('target')::numeric,
    current = sqlc.arg('current'),
    unit = sqlc.narg('unit')::text,
    position = sqlc.arg('position'),
    status = sqlc.arg('status'),
    updated_at = now()
WHERE id = sqlc.arg('id') AND workspace_id = sqlc.arg('workspace_id') AND archived_at IS NULL
RETURNING *;

-- name: ArchiveGoalKeyResult :execrows
UPDATE goal_key_result
SET archived_at = now(), updated_at = now()
WHERE id = sqlc.arg('id') AND workspace_id = sqlc.arg('workspace_id') AND archived_at IS NULL;

-- name: ArchiveGoalKeyResultsForGoal :exec
-- Archiving a goal archives its key results in the same request: a key result
-- whose goal is gone is not a readable row anywhere, and leaving them live would
-- keep them in the batched child read's `goal_ids` set forever.
UPDATE goal_key_result
SET archived_at = now(), updated_at = now()
WHERE workspace_id = sqlc.arg('workspace_id')
  AND goal_id = sqlc.arg('goal_id')
  AND archived_at IS NULL;

-- name: ListGoalPackages :many
SELECT *
FROM goal_package
WHERE workspace_id = sqlc.arg('workspace_id')
  AND archived_at IS NULL
  AND goal_id = ANY(sqlc.arg('goal_ids')::uuid[])
ORDER BY goal_id, position ASC, created_at ASC, id ASC;

-- name: GetGoalPackage :one
SELECT * FROM goal_package
WHERE id = sqlc.arg('id') AND workspace_id = sqlc.arg('workspace_id') AND archived_at IS NULL;

-- name: CreateGoalPackage :one
INSERT INTO goal_package (
    workspace_id, goal_id, department_id, title, owner_member_id, status, position,
    created_by
) VALUES (
    sqlc.arg('workspace_id'), sqlc.arg('goal_id'), sqlc.arg('department_id'),
    sqlc.arg('title'), sqlc.narg('owner_member_id')::uuid, sqlc.arg('status'),
    sqlc.arg('position'), sqlc.narg('created_by')::uuid
)
RETURNING *;

-- name: UpdateGoalPackage :one
UPDATE goal_package
SET department_id = sqlc.arg('department_id'),
    title = sqlc.arg('title'),
    owner_member_id = sqlc.narg('owner_member_id')::uuid,
    status = sqlc.arg('status'),
    position = sqlc.arg('position'),
    updated_at = now()
WHERE id = sqlc.arg('id') AND workspace_id = sqlc.arg('workspace_id') AND archived_at IS NULL
RETURNING *;

-- name: ArchiveGoalPackage :execrows
UPDATE goal_package
SET archived_at = now(), updated_at = now()
WHERE id = sqlc.arg('id') AND workspace_id = sqlc.arg('workspace_id') AND archived_at IS NULL;

-- name: ArchiveGoalPackagesForGoal :exec
UPDATE goal_package
SET archived_at = now(), updated_at = now()
WHERE workspace_id = sqlc.arg('workspace_id')
  AND goal_id = sqlc.arg('goal_id')
  AND archived_at IS NULL;

-- name: ListGoalIssues :many
-- The tasks under one goal (`issue.goal_id`, 748). A projection, not the whole
-- issue row: the goal screen needs the task's identity and its state, and the
-- issue's own detail endpoint answers everything else. Ordered by the per
-- workspace issue number, which is creation order.
SELECT id, number, title, status, goal_id
FROM issue
WHERE workspace_id = sqlc.arg('workspace_id') AND goal_id = sqlc.arg('goal_id')
ORDER BY number ASC, id ASC;

-- name: GetIssueGoalPointer :one
-- Reads an issue's current goal so the attach path can answer 409 instead of
-- silently moving a task between objectives.
SELECT id, number, title, status, goal_id
FROM issue
WHERE id = sqlc.arg('id') AND workspace_id = sqlc.arg('workspace_id');

-- name: SetIssueGoal :one
-- Attach (`goal_id` = the goal) and detach (NULL) in one statement: the caller
-- passes the value it wants the column to hold, the same shape as
-- SetCreatorMediaIP. No trigger follows this write — the key result aggregate is
-- the application's job (745).
UPDATE issue
SET goal_id = sqlc.narg('goal_id')::uuid,
    updated_at = now()
WHERE id = sqlc.arg('id') AND workspace_id = sqlc.arg('workspace_id')
RETURNING id, number, title, status, goal_id;

-- name: ListMarketSignals :many
-- The radar reads cut first, then score, then age. That order mixes directions
-- (cut rank ascending, score descending with NULLs last), so the keyset predicate
-- is spelled out instead of a row comparison: past the cursor's cut every hotter
-- cut is ahead, and inside one cut a NULL score or a lower score is ahead, with
-- `(created_at, id)` breaking the tie.
SELECT *
FROM market_signal
WHERE workspace_id = sqlc.arg('workspace_id')
  AND archived_at IS NULL
  AND (sqlc.narg('cut')::text IS NULL OR cut = sqlc.narg('cut')::text)
  AND (sqlc.narg('status')::text IS NULL OR status = sqlc.narg('status')::text)
  AND (sqlc.narg('category')::text IS NULL OR category = sqlc.narg('category')::text)
  AND (
    sqlc.narg('cursor_id')::uuid IS NULL
    OR (CASE cut WHEN 'hot' THEN 0 WHEN 'warm' THEN 1 ELSE 2 END) > sqlc.narg('cursor_rank')::int
    OR (
      (CASE cut WHEN 'hot' THEN 0 WHEN 'warm' THEN 1 ELSE 2 END) = sqlc.narg('cursor_rank')::int
      AND (
        (
          sqlc.narg('cursor_score')::numeric IS NOT NULL
          AND (score IS NULL OR score < sqlc.narg('cursor_score')::numeric)
        )
        OR (
          score IS NOT DISTINCT FROM sqlc.narg('cursor_score')::numeric
          AND (created_at, id)
            < (sqlc.narg('cursor_at')::timestamptz, sqlc.narg('cursor_id')::uuid)
        )
      )
    )
  )
ORDER BY
    CASE cut WHEN 'hot' THEN 0 WHEN 'warm' THEN 1 ELSE 2 END,
    score DESC NULLS LAST,
    created_at DESC,
    id DESC
LIMIT sqlc.arg('limit');

-- name: GetMarketSignal :one
SELECT * FROM market_signal
WHERE id = sqlc.arg('id') AND workspace_id = sqlc.arg('workspace_id') AND archived_at IS NULL;

-- name: GetMarketSignalForUpdate :one
-- The convert path's claim. `FOR UPDATE` makes the "has this signal already
-- been converted" check and the write of its `converted_*` pointer one step: a
-- second concurrent convert waits here, then sees `converted` and answers 409
-- instead of creating a second goal. The lock is held for the whole handler
-- transaction (see ConvertMarketSignal in workbench_goal.go).
SELECT * FROM market_signal
WHERE id = sqlc.arg('id') AND workspace_id = sqlc.arg('workspace_id') AND archived_at IS NULL
FOR UPDATE;

-- name: CreateMarketSignal :one
INSERT INTO market_signal (
    workspace_id, title, category, source, url, summary, cut, score, urgency,
    status, note, owner_member_id, created_by
) VALUES (
    sqlc.arg('workspace_id'), sqlc.arg('title'), sqlc.arg('category'),
    sqlc.arg('source'), sqlc.narg('url')::text, sqlc.narg('summary')::text,
    sqlc.arg('cut'), sqlc.narg('score')::numeric, sqlc.arg('urgency'),
    sqlc.arg('status'), sqlc.narg('note')::text, sqlc.narg('owner_member_id')::uuid,
    sqlc.narg('created_by')::uuid
)
RETURNING *;

-- name: UpdateMarketSignal :one
-- `status` is always what the handler decided: it refuses to set `converted`
-- here, because a converted signal must carry the pointer that says into what.
UPDATE market_signal
SET title = sqlc.arg('title'),
    category = sqlc.arg('category'),
    source = sqlc.arg('source'),
    url = sqlc.narg('url')::text,
    summary = sqlc.narg('summary')::text,
    cut = sqlc.arg('cut'),
    score = sqlc.narg('score')::numeric,
    urgency = sqlc.arg('urgency'),
    status = sqlc.arg('status'),
    note = sqlc.narg('note')::text,
    owner_member_id = sqlc.narg('owner_member_id')::uuid,
    updated_at = now()
WHERE id = sqlc.arg('id') AND workspace_id = sqlc.arg('workspace_id') AND archived_at IS NULL
RETURNING *;

-- name: ArchiveMarketSignal :execrows
UPDATE market_signal
SET archived_at = now(), updated_at = now()
WHERE id = sqlc.arg('id') AND workspace_id = sqlc.arg('workspace_id') AND archived_at IS NULL;

-- name: ConvertMarketSignal :one
-- Writes the landing point of one signal and flips it to `converted` in the same
-- statement. Exactly one of the two pointers is set per call — a convert creates
-- a goal *or* an issue — and the other stays NULL.
--
-- `status <> 'converted'` is the idempotency guard: zero rows updated means
-- somebody already converted this signal, and the handler answers 409. It is a
-- backstop behind GetMarketSignalForUpdate, not a replacement for it — the lock is
-- what keeps the loser from having created an unlinked goal before it gets here.
UPDATE market_signal
SET status = 'converted',
    converted_goal_id = sqlc.narg('converted_goal_id')::uuid,
    converted_issue_id = sqlc.narg('converted_issue_id')::uuid,
    updated_at = now()
WHERE id = sqlc.arg('id')
  AND workspace_id = sqlc.arg('workspace_id')
  AND archived_at IS NULL
  AND status <> 'converted'
RETURNING *;
