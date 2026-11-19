-- Offboarding records (docs/engineering/WORKBENCH-API.md §15). Same conventions as
-- workbench_hr.sql — workspace-scoped, archived rows hidden, keyset paging on the
-- list's sort key, DELETE is a soft delete — plus the two rules this table adds:
--
-- **The state machine is one guarded statement.** `TransitionHrOffboarding` moves
-- a row only when it is still in the status the handler read, so two operators
-- (or one double-clicked button) cannot walk `apply → handover → done` twice: the
-- second write finds `status <> from_status` and touches no row, which the handler
-- answers as 409. Nothing here reads a row and writes it back unguarded.
--
-- **`leave_date` is written from `last_day`, never by hand.** When a record reaches
-- `done` the handler runs `SetHrEmployeeLeaveDate` in the same transaction
-- (docs/engineering/WORKBENCH-API.md §15.4), so the roster's "still here?" column
-- and the exit record cannot disagree. `last_day` stays the single source: fixing
-- a wrong date is an edit of the offboarding, and the profile follows.
--
-- Exclusivity lives in the schema — "one live record per employee" is
-- idx_hr_offboarding_workspace_employee_live (768). CountHrOffboardingConflicts
-- reads the same predicate so the handler can answer 409 with a message instead of
-- a bare constraint violation.

-- name: ListHrOffboardings :many
SELECT *
FROM hr_offboarding
WHERE workspace_id = sqlc.arg('workspace_id')
  AND archived_at IS NULL
  AND (sqlc.narg('status')::text IS NULL OR status = sqlc.narg('status')::text)
  AND (sqlc.narg('employee_id')::uuid IS NULL OR employee_id = sqlc.narg('employee_id')::uuid)
  AND (
    sqlc.narg('cursor_at')::timestamptz IS NULL
    OR (created_at, id) < (sqlc.narg('cursor_at')::timestamptz, sqlc.narg('cursor_id')::uuid)
  )
ORDER BY created_at DESC, id DESC
LIMIT sqlc.arg('limit');

-- name: GetHrOffboarding :one
SELECT * FROM hr_offboarding
WHERE id = sqlc.arg('id') AND workspace_id = sqlc.arg('workspace_id') AND archived_at IS NULL;

-- name: CreateHrOffboarding :one
-- Always created in `apply`: the state machine has exactly two entrances
-- (this insert and `cancel`), so a client cannot skip the handover step by
-- posting `status: "done"` — the handler rejects that with 400.
INSERT INTO hr_offboarding (
    workspace_id, employee_id, status, last_day, reason, kind, handover,
    cert_done, note, owner_member_id, created_by
) VALUES (
    sqlc.arg('workspace_id'), sqlc.arg('employee_id'), sqlc.arg('status'),
    sqlc.arg('last_day')::date, sqlc.narg('reason')::text, sqlc.arg('kind'),
    sqlc.arg('handover')::text::jsonb, sqlc.arg('cert_done'), sqlc.narg('note')::text,
    sqlc.narg('owner_member_id')::uuid, sqlc.narg('created_by')::uuid
)
RETURNING *;

-- name: UpdateHrOffboarding :one
-- The handler loads the row, applies the PATCH fields and resends every editable
-- column, so an omitted field never silently clears the stored value. `status` and
-- `employee_id` are not editable here: the first moves through
-- TransitionHrOffboarding, the second would silently re-point whose exit this is.
UPDATE hr_offboarding
SET last_day = sqlc.arg('last_day')::date,
    reason = sqlc.narg('reason')::text,
    kind = sqlc.arg('kind'),
    handover = sqlc.arg('handover')::text::jsonb,
    cert_done = sqlc.arg('cert_done'),
    note = sqlc.narg('note')::text,
    owner_member_id = sqlc.narg('owner_member_id')::uuid,
    updated_at = now()
WHERE id = sqlc.arg('id') AND workspace_id = sqlc.arg('workspace_id') AND archived_at IS NULL
RETURNING *;

-- name: TransitionHrOffboarding :one
-- The one statement that moves the state machine. `from_status` makes the write
-- conditional on what the handler read, so a stale client (or a second operator)
-- gets zero rows instead of an illegal transition — the handler turns that into
-- 409. Used by both `advance` and `cancel`; which pair of statuses is legal is
-- decided by the handler's transition table, not by this SQL.
UPDATE hr_offboarding
SET status = sqlc.arg('status'),
    updated_at = now()
WHERE id = sqlc.arg('id')
  AND workspace_id = sqlc.arg('workspace_id')
  AND archived_at IS NULL
  AND status = sqlc.arg('from_status')
RETURNING *;

-- name: ArchiveHrOffboarding :execrows
UPDATE hr_offboarding
SET archived_at = now(), updated_at = now()
WHERE id = sqlc.arg('id') AND workspace_id = sqlc.arg('workspace_id') AND archived_at IS NULL;

-- name: CountHrOffboardingConflicts :one
-- The "one live record per employee" key (768), read as a count so the handler
-- answers 409 before the insert instead of interpreting a constraint violation.
-- The predicate matches the index exactly — archived and `cancelled` rows do not
-- count — so re-initiating an exit that was called off is possible without
-- touching the record of the attempt that was cancelled.
SELECT (count(*))::bigint AS conflicts
FROM hr_offboarding
WHERE workspace_id = sqlc.arg('workspace_id')
  AND employee_id = sqlc.arg('employee_id')
  AND archived_at IS NULL
  AND status <> 'cancelled'
  AND id <> sqlc.arg('exclude_id');

-- name: SetHrEmployeeLeaveDate :one
-- The write-back the `done` transition owns (766): `hr_employee_profile.leave_date`
-- is the day the person actually left, and it is copied from the offboarding's
-- `last_day` in the same transaction that marks the record `done`. It lives here
-- rather than in workbench_hr.sql because this table is what decides the value —
-- the employee PATCH never writes it in this batch.
UPDATE hr_employee_profile
SET leave_date = sqlc.arg('leave_date')::date,
    updated_at = now()
WHERE id = sqlc.arg('id') AND workspace_id = sqlc.arg('workspace_id') AND archived_at IS NULL
RETURNING *;
