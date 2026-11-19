-- Employee rewards and disciplines (docs/engineering/WORKBENCH-API.md §17). Same
-- conventions as workbench_hr.sql — workspace-scoped, archived rows hidden,
-- DELETE is a soft delete — plus the one rule this domain adds:
--
-- **`amount` is stored positive and `kind` carries the direction.** A fine is a
-- `discipline` row with `amount = 500`, never `-500`: the handler rejects a
-- negative amount, because a sign convention that only the readers remember is a
-- bug waiting to be summed the wrong way.
--
-- `currency` is NOT NULL DEFAULT 'CNY': every row has a unit even when `amount`
-- is NULL, so nothing has to guess a default at read time.

-- name: ListHrEmployeeRewards :many
-- The 奖惩 tab: one employee's rows, or the workspace's when `employee_id` is
-- absent, filtered by kind and by an inclusive `decided_on` window. Ordering is
-- the contract's read order and matches
-- idx_hr_employee_reward_workspace_employee (776) and its kind companion (777);
-- `created_at`/`id` break ties between rows entered in one batch, which is also
-- the keyset the cursor pages on: the cursor is the previous page's last row id
-- and the handler re-reads its two sort keys.
SELECT *
FROM hr_employee_reward
WHERE workspace_id = sqlc.arg('workspace_id')
  AND archived_at IS NULL
  AND (sqlc.narg('employee_id')::uuid IS NULL OR employee_id = sqlc.narg('employee_id')::uuid)
  AND (sqlc.narg('kind')::text IS NULL OR kind = sqlc.narg('kind')::text)
  AND (sqlc.narg('from_on')::date IS NULL OR decided_on >= sqlc.narg('from_on')::date)
  AND (sqlc.narg('to_on')::date IS NULL OR decided_on <= sqlc.narg('to_on')::date)
  AND (
    sqlc.narg('cursor_id')::uuid IS NULL
    OR (decided_on, created_at, id)
      < (sqlc.narg('cursor_on')::date, sqlc.narg('cursor_at')::timestamptz, sqlc.narg('cursor_id')::uuid)
  )
ORDER BY decided_on DESC, created_at DESC, id DESC
LIMIT sqlc.arg('limit');

-- name: GetHrEmployeeReward :one
SELECT * FROM hr_employee_reward
WHERE id = sqlc.arg('id') AND workspace_id = sqlc.arg('workspace_id') AND archived_at IS NULL;

-- name: CreateHrEmployeeReward :one
-- Every column is sent, `NULL` included: an omitted `category` / `amount` /
-- `note` means "this row has none", not "keep the previous value".
INSERT INTO hr_employee_reward (
    workspace_id, employee_id, kind, category, reason, amount, currency,
    decided_on, note, owner_member_id, created_by
) VALUES (
    sqlc.arg('workspace_id'), sqlc.arg('employee_id'), sqlc.arg('kind'),
    sqlc.narg('category')::text, sqlc.arg('reason'), sqlc.narg('amount')::numeric,
    sqlc.arg('currency')::char(3), sqlc.arg('decided_on')::date,
    sqlc.narg('note')::text, sqlc.narg('owner_member_id')::uuid,
    sqlc.narg('created_by')::uuid
)
RETURNING *;

-- name: UpdateHrEmployeeReward :one
-- The six editable columns. `employee_id` and `kind` are absent on purpose: a row
-- that stops describing the same person, or turns a fine into a bonus, is a
-- different record — the handler answers 400 and the client deletes and re-adds.
UPDATE hr_employee_reward
SET category = sqlc.narg('category')::text,
    reason = sqlc.arg('reason'),
    amount = sqlc.narg('amount')::numeric,
    currency = sqlc.arg('currency')::char(3),
    decided_on = sqlc.arg('decided_on')::date,
    note = sqlc.narg('note')::text,
    updated_at = now()
WHERE id = sqlc.arg('id') AND workspace_id = sqlc.arg('workspace_id') AND archived_at IS NULL
RETURNING *;

-- name: ArchiveHrEmployeeReward :execrows
UPDATE hr_employee_reward
SET archived_at = now(), updated_at = now()
WHERE id = sqlc.arg('id') AND workspace_id = sqlc.arg('workspace_id') AND archived_at IS NULL;
