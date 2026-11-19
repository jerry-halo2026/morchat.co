-- Qianchuan (千川) read side — WORKBENCH-API §25.3.
--
-- Six read-only projections: the window totals behind `GET /ads/summary`, the
-- account + balance list, the plan and material archives, the violations, and the
-- recon snapshot. `cmd/qianchuan-sync` is the only writer of the twelve
-- `qianchuan_*` tables (§25.5); nothing in this file inserts, updates or deletes,
-- and nothing here can be turned into a write path.
--
-- # Settlement windows are never added up
--
-- `settle_1h | settle_7d | settle_14d | settle_30d | settle_90d` are five
-- different settlement windows, not five precisions of one figure. The platform
-- keeps rewriting already-settled figures after T+1, so 1h + 7d is neither of
-- them — it is a number with no business meaning.
--
-- `AdsWindowTotals` therefore reads **exactly one** window per call: the `CASE`
-- below picks a branch and every branch names a single column, so a cross-window
-- SUM cannot be written here at all. `settle_1h` / `settle_7d` are structured
-- columns (sync lifts them out of the CSV); 14d / 30d / 90d stay in `metrics`
-- under their official column names (§25.1). The handler rejects any other basis
-- with a 400 before this query runs, so an unknown basis never becomes a silent
-- SUM over NULLs. The Go side of the same five-way mapping is
-- `adsSettleExpression` in `internal/handler/workbench_ads.go`; the tests read
-- both and fail if they stop agreeing.
--
-- # Money stays NUMERIC, amounts stay three-state
--
-- Every money column and aggregate leaves as `numeric` (`pgtype.Numeric` in Go)
-- and the handler renders it through `numericToFloatPtr`. Nothing is cast to
-- `float8` here on purpose: sqlc treats a `::float8` cast as NOT NULL, which would
-- turn "no row contributed a sample" into a scan error instead of a NULL amount.
-- A NULL sum stays NULL — it is not a zero. That is why every amount has its own
-- `count(col)` beside it: `sum` and `count` together are what separate "this window
-- has no spend" from "this window has no rows".

-- name: AdsWindowTotals :one
-- One window, one basis. `settle_amount` is projected once in the CTE so the SUM
-- and the sample COUNT read the same column expression.
WITH window_rows AS (
    SELECT spend,
           gmv,
           refund_amount,
           order_count,
           CASE sqlc.arg('basis')::text
               WHEN 'settle_1h'  THEN settle_amount_1h
               WHEN 'settle_7d'  THEN settle_amount_7d
               WHEN 'settle_14d' THEN (metrics ->> 'total_order_settle_amount_for_roi2_14d')::numeric
               WHEN 'settle_30d' THEN (metrics ->> 'total_order_settle_amount_for_roi2_30d')::numeric
               WHEN 'settle_90d' THEN (metrics ->> 'total_order_settle_amount_for_roi2_90d')::numeric
           END AS settle_amount
    FROM qianchuan_daily_overall
    WHERE workspace_id = sqlc.arg('workspace_id')::uuid
      AND dim_kind = 'overall'
      AND stat_date BETWEEN sqlc.arg('from_date')::date AND sqlc.arg('to_date')::date
)
SELECT sum(spend)::numeric           AS spend_sum,
       count(spend)::bigint AS spend_samples,
       sum(gmv)::numeric             AS gmv_sum,
       count(gmv)::bigint   AS gmv_samples,
       sum(refund_amount)::numeric   AS refund_sum,
       count(refund_amount)::bigint AS refund_samples,
       sum(settle_amount)::numeric   AS settle_sum,
       count(settle_amount)::bigint AS settle_samples,
       coalesce(sum(order_count), 0)::bigint AS order_count,
       count(*)::bigint     AS row_count
FROM window_rows;

-- name: AdsAccounts :many
-- Every account with its newest balance snapshot and its spend to date. A balance
-- is a snapshot, not a ledger, so the newest row is the answer and `captured_at`
-- says how old it is. `nullif` keeps an empty name in the snapshot from masking the
-- account's own name.
WITH latest AS (
    SELECT DISTINCT ON (account_id)
           account_id, account_name, balance, cash, valid_grant, captured_at
    FROM qianchuan_balance
    WHERE workspace_id = sqlc.arg('workspace_id')::uuid
    ORDER BY account_id, captured_at DESC
), spend AS (
    SELECT account_id, sum(spend)::numeric AS total
    FROM qianchuan_daily_overall
    WHERE workspace_id = sqlc.arg('workspace_id')::uuid AND dim_kind = 'overall'
    GROUP BY account_id
)
SELECT a.account_id,
       coalesce(nullif(l.account_name, ''), a.account_name) AS account_name,
       l.balance      AS balance,
       l.cash         AS cash,
       l.valid_grant  AS valid_grant,
       l.captured_at,
       s.total        AS spend_to_date
FROM qianchuan_account a
LEFT JOIN latest l ON l.account_id = a.account_id
LEFT JOIN spend  s ON s.account_id = a.account_id
WHERE a.workspace_id = sqlc.arg('workspace_id')::uuid
ORDER BY a.account_id;

-- name: AdsPlans :many
-- Archive only; a plan's performance lives in the daily slice, not here (§25.1).
-- An empty filter string means "no filter", never "match the empty string".
SELECT plan_id,
       account_id,
       account_name,
       name,
       marketing_goal,
       status,
       opt_status,
       budget            AS budget,
       budget_mode,
       roi2_goal         AS roi2_goal,
       smart_bid_type,
       updated_at
FROM qianchuan_plan
WHERE workspace_id = sqlc.arg('workspace_id')::uuid
  AND (sqlc.arg('account_id')::text = '' OR account_id = sqlc.arg('account_id')::text)
  AND (sqlc.arg('status')::text = '' OR status = sqlc.arg('status')::text)
ORDER BY create_time DESC NULLS LAST, plan_id
LIMIT sqlc.arg('limit')::integer;

-- name: AdsMaterials :many
-- Video / image / carousel share one table (`kind` says which). `media_script_id`
-- is the content-side bridge and stays NULL until a script is attached.
SELECT kind,
       material_id,
       account_id,
       account_name,
       filename,
       video_id,
       image_id,
       duration,
       size_bytes,
       is_ai_create,
       is_inefficient,
       is_original,
       media_script_id,
       captured_at
FROM qianchuan_material
WHERE workspace_id = sqlc.arg('workspace_id')::uuid
  AND (sqlc.arg('account_id')::text = '' OR account_id = sqlc.arg('account_id')::text)
  AND (sqlc.arg('kind')::text = '' OR kind = sqlc.arg('kind')::text)
ORDER BY create_time DESC NULLS LAST, material_id
LIMIT sqlc.arg('limit')::integer;

-- name: AdsViolations :many
-- Read-only: this batch does not appeal and does not change platform state. The
-- `TIMEOUT` style status values are the platform's own enum, passed through.
SELECT event_id,
       account_id,
       account_name,
       ad_id,
       create_time,
       illegal_type,
       score,
       status,
       reject_reason
FROM qianchuan_violation
WHERE workspace_id = sqlc.arg('workspace_id')::uuid
  AND (sqlc.arg('status')::text = '' OR status = sqlc.arg('status')::text)
ORDER BY create_time DESC NULLS LAST, event_id
LIMIT sqlc.arg('limit')::integer;

-- name: AdsRecon :many
-- Book vs platform: the platform side is the newest recon snapshot, the ledger side
-- is the daily totals **of the snapshot's own day**. The two sides are deliberately
-- not converted to one basis — `acct_*` is a payment caliber and the daily settle
-- is a settlement caliber, so subtracting them would only produce a third window.
-- The newest snapshot per (account, goal) wins; a snapshot with no daily row that
-- day keeps NULL on the ledger side, which is "no ledger figure", not zero.
WITH snap AS (
    SELECT DISTINCT ON (account_id, goal)
           account_id, account_name, goal, acct_cost, acct_gmv, acct_orders, captured_at
    FROM qianchuan_recon
    WHERE workspace_id = sqlc.arg('workspace_id')::uuid
      AND (sqlc.arg('account_id')::text = '' OR account_id = sqlc.arg('account_id')::text)
    ORDER BY account_id, goal, captured_at DESC
), ledger AS (
    SELECT d.account_id,
           s.goal,
           sum(d.spend)::numeric AS cost,
           sum(d.gmv)::numeric   AS gmv,
           coalesce(sum(d.order_count), 0)::bigint AS orders
    FROM qianchuan_daily_overall d
    JOIN snap s ON s.account_id = d.account_id AND d.stat_date = s.captured_at::date
    WHERE d.workspace_id = sqlc.arg('workspace_id')::uuid AND d.dim_kind = 'overall'
    GROUP BY d.account_id, s.goal
)
SELECT s.account_id,
       s.goal,
       s.account_name,
       s.acct_cost AS acct_cost,
       s.acct_gmv  AS acct_gmv,
       coalesce(s.acct_orders, 0)::bigint AS acct_orders,
       s.captured_at,
       l.cost            AS ledger_cost,
       l.gmv             AS ledger_gmv,
       coalesce(l.orders, 0)::bigint AS ledger_orders
FROM snap s
LEFT JOIN ledger l ON l.account_id = s.account_id AND l.goal = s.goal
ORDER BY s.account_id, s.goal;
