-- Monthly finance entry (707 `ops_finance_month`): the two inputs the money
-- block cannot derive from the CRM ledgers — cash at the start of the month and
-- the month's own cost bill.
--
-- Caliber, query by query:
--
--   * ListOpsFinanceMonths — the whole history of the workspace, newest month
--     first. `month` is an optional lookup: the dialog that pre-fills this month's
--     entry reads exactly one row with it, and an omitted one lists everything.
--     Archived rows are hidden (708: the unique key is partial on
--     `archived_at IS NULL`).
--
--   * GetOpsFinanceMonth — the one row `GET /api/workbench/finance` folds into
--     the margin and cash-floor figures. No row is the honest answer "this month
--     was never entered" (pgx.ErrNoRows), not a row of zeros: 0 is a measurement.
--
--   * UpsertOpsFinanceMonth — `PUT /api/workbench/finance/months`. One row per
--     (workspace_id, month) among live rows, inferred from the partial unique
--     index 708, so a second PUT replaces the amounts instead of adding a row.
--     `created_by` stays whoever first wrote the month; `updated_at` moves.
--
-- Amounts are CNY yuan, NUMERIC(14,2). A NULL amount means "not recorded" and is
-- what keeps the money block on the gap card (docs/METRICS.md §1 rule 3).

-- name: ListOpsFinanceMonths :many
SELECT *
FROM ops_finance_month
WHERE workspace_id = sqlc.arg('workspace_id')
  AND archived_at IS NULL
  AND (sqlc.narg('month')::date IS NULL OR month = sqlc.narg('month')::date)
ORDER BY month DESC;

-- name: GetOpsFinanceMonth :one
SELECT *
FROM ops_finance_month
WHERE workspace_id = sqlc.arg('workspace_id')
  AND month = sqlc.arg('month')
  AND archived_at IS NULL;

-- name: UpsertOpsFinanceMonth :one
INSERT INTO ops_finance_month (
    workspace_id,
    month,
    cash_open,
    fixed_cost,
    variable_cost,
    note,
    created_by
) VALUES (
    sqlc.arg('workspace_id'),
    sqlc.arg('month'),
    sqlc.narg('cash_open'),
    sqlc.narg('fixed_cost'),
    sqlc.narg('variable_cost'),
    sqlc.narg('note'),
    sqlc.narg('created_by')
)
ON CONFLICT (workspace_id, month) WHERE archived_at IS NULL
DO UPDATE SET
    cash_open = excluded.cash_open,
    fixed_cost = excluded.fixed_cost,
    variable_cost = excluded.variable_cost,
    note = excluded.note,
    updated_at = now()
RETURNING *;
