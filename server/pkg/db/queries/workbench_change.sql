-- Employee file change stream (docs/engineering/WORKBENCH-API.md §16). Same
-- conventions as workbench_hr.sql — workspace-scoped, archived rows hidden,
-- DELETE is a soft delete — plus the one rule this table adds:
--
-- **The stream is append-only.** There is no UPDATE of a fact: `Create` inserts,
-- `UpdateHrEmployeeChangeNote` touches `note` and nothing else (the handler
-- rejects any other field with 400), and `Archive` sets `archived_at`. A wrong
-- fact is corrected by recording another row, which is why the note-only
-- statement exists instead of a general update.
--
-- The hook that makes the stream fill itself lives in the handler, not here:
-- `UpdateHrEmployee` compares the profile before and after and calls
-- `CreateHrEmployeeChange` in the same transaction as the profile write, so a
-- file cannot change without the row that says it changed.

-- name: ListHrEmployeeChanges :many
-- The 异动 tab: one employee's stream, or the workspace's when `employee_id` is
-- absent, filtered by kind and by an inclusive `effective_on` window. Ordering is
-- the contract's read order and matches idx_hr_employee_change_workspace_employee
-- (773) and its kind companion (774); `created_at`/`id` break ties between rows
-- recorded in one batch (a PATCH that moves two fields, or a backfilled import),
-- which is also the keyset the cursor pages on: the cursor is the previous page's
-- last row id and the handler re-reads its two sort keys.
SELECT *
FROM hr_employee_change
WHERE workspace_id = sqlc.arg('workspace_id')
  AND archived_at IS NULL
  AND (sqlc.narg('employee_id')::uuid IS NULL OR employee_id = sqlc.narg('employee_id')::uuid)
  AND (sqlc.narg('kind')::text IS NULL OR kind = sqlc.narg('kind')::text)
  AND (sqlc.narg('from_on')::date IS NULL OR effective_on >= sqlc.narg('from_on')::date)
  AND (sqlc.narg('to_on')::date IS NULL OR effective_on <= sqlc.narg('to_on')::date)
  AND (
    sqlc.narg('cursor_id')::uuid IS NULL
    OR (effective_on, created_at, id)
      < (sqlc.narg('cursor_on')::date, sqlc.narg('cursor_at')::timestamptz, sqlc.narg('cursor_id')::uuid)
  )
ORDER BY effective_on DESC, created_at DESC, id DESC
LIMIT sqlc.arg('limit');

-- name: GetHrEmployeeChange :one
SELECT * FROM hr_employee_change
WHERE id = sqlc.arg('id') AND workspace_id = sqlc.arg('workspace_id') AND archived_at IS NULL;

-- name: CreateHrEmployeeChange :one
-- Every column is sent, `NULL` included: the two write paths (the profile PATCH
-- hook and a manual entry) fill the pair their `kind` is about and leave the rest
-- NULL, so an omitted pair means "this change was not about that field" rather
-- than "keep the old value".
INSERT INTO hr_employee_change (
    workspace_id, employee_id, kind, effective_on,
    from_department_id, to_department_id,
    from_job_title, to_job_title,
    from_grade, to_grade,
    from_contract_end, to_contract_end,
    from_amount, to_amount, currency,
    note, owner_member_id, created_by
) VALUES (
    sqlc.arg('workspace_id'), sqlc.arg('employee_id'), sqlc.arg('kind'),
    sqlc.arg('effective_on')::date,
    sqlc.narg('from_department_id')::uuid, sqlc.narg('to_department_id')::uuid,
    sqlc.narg('from_job_title')::text, sqlc.narg('to_job_title')::text,
    sqlc.narg('from_grade')::text, sqlc.narg('to_grade')::text,
    sqlc.narg('from_contract_end')::date, sqlc.narg('to_contract_end')::date,
    sqlc.narg('from_amount')::numeric, sqlc.narg('to_amount')::numeric,
    sqlc.narg('currency')::char(3),
    sqlc.narg('note')::text, sqlc.narg('owner_member_id')::uuid,
    sqlc.narg('created_by')::uuid
)
RETURNING *;

-- name: UpdateHrEmployeeChangeNote :one
-- The only editable column. `kind`, `effective_on` and the from/to pairs are the
-- record of what happened; rewriting one would turn the stream into a second
-- copy of the profile it describes.
UPDATE hr_employee_change
SET note = sqlc.narg('note')::text
WHERE id = sqlc.arg('id') AND workspace_id = sqlc.arg('workspace_id') AND archived_at IS NULL
RETURNING *;

-- name: ArchiveHrEmployeeChange :execrows
UPDATE hr_employee_change
SET archived_at = now()
WHERE id = sqlc.arg('id') AND workspace_id = sqlc.arg('workspace_id') AND archived_at IS NULL;
