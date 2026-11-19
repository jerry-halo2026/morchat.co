-- Affiliate distribution (精选联盟 分销) read/write paths
-- (docs/engineering/WORKBENCH-API.md §11).
--
-- Same conventions as the B0 ledgers: workspace-scoped, archived rows hidden,
-- keyset paging on the list's sort key where a list can grow, money as
-- NUMERIC(14,2).
--
-- Four leads, one rule each:
--
--   * `affiliate_product` — the SKU and the commission it pays. Soft deleted, so
--     every read filters `archived_at IS NULL`.
--   * `affiliate_pick` — product × creator, the promotion relationship the
--     platform attributes orders to. Also soft deleted.
--   * `affiliate_daily` — the platform report's day snapshot for one pick. No
--     archive and no delete: the upsert is the only write, and it replaces the
--     day rather than adding a second observation of it.
--   * `affiliate_settlement` — the platform's periodic statement. No delete
--     either; a wrong statement is corrected by update.
--
-- Nothing here derives one money column from another. `net_amount` is what the
-- platform said, `gmv_amount` and `refund_amount` are reported side by side, and
-- the only division in this domain (refund rate) happens in the handler through
-- `ratioValue` so the 0–1 scale is applied in exactly one place.
--
-- Two labels decide what the money *means*, and both are written by the caller
-- rather than inferred:
--
--   * `affiliate_product.ownership` (725) — `own_brand` (our own SKU, the
--     commission is our revenue) or `client_brand` (a client's SKU, the
--     commission is their cost). The database enforces the pair with
--     `client_id`: a client-brand product has a seller, an own-brand one does
--     not.
--   * `affiliate_settlement.settled_to` (727) — `agency` (the commission landed
--     in our 机构号, so it is revenue) or `creator` (the platform paid the
--     creator directly, so it is GMV without income). Summing both would count
--     the business twice.
--
-- `affiliate_pick` carries the internal split (`agency_share_rate`, our cut of a
-- 自有达人's commission) and `service_fee_amount` (招商服务费 we invoice), which
-- are the two numbers the summary's income blocks are built from.

-- name: ListAffiliateProducts :many
SELECT *
FROM affiliate_product
WHERE workspace_id = sqlc.arg('workspace_id')
  AND archived_at IS NULL
  AND (sqlc.narg('client_id')::uuid IS NULL OR client_id = sqlc.narg('client_id')::uuid)
  AND (sqlc.narg('status')::text IS NULL OR status = sqlc.narg('status')::text)
  AND (sqlc.narg('platform')::text IS NULL OR platform = sqlc.narg('platform')::text)
  AND (
    sqlc.narg('cursor_at')::timestamptz IS NULL
    OR (created_at, id) < (sqlc.narg('cursor_at')::timestamptz, sqlc.narg('cursor_id')::uuid)
  )
ORDER BY created_at DESC, id DESC
LIMIT sqlc.arg('limit');

-- name: GetAffiliateProduct :one
SELECT * FROM affiliate_product
WHERE id = sqlc.arg('id') AND workspace_id = sqlc.arg('workspace_id') AND archived_at IS NULL;

-- name: CreateAffiliateProduct :one
-- `client_id` is written as sent: NULL for an own-brand SKU, a client for a
-- client-brand one. The pair constraint (725) is the authority on which is
-- legal; the handler only turns it into an error a caller can act on.
INSERT INTO affiliate_product (
    workspace_id, client_id, ownership, platform, platform_product_id, title, category,
    price, currency, commission_rate, activity, status, owner_member_id, created_by
) VALUES (
    sqlc.arg('workspace_id'), sqlc.arg('client_id'), sqlc.arg('ownership'),
    sqlc.arg('platform'), sqlc.arg('platform_product_id'), sqlc.arg('title'),
    sqlc.narg('category')::text, sqlc.narg('price')::numeric, sqlc.arg('currency'),
    sqlc.narg('commission_rate')::numeric, sqlc.narg('activity')::text, sqlc.arg('status'),
    sqlc.narg('owner_member_id')::uuid, sqlc.narg('created_by')::uuid
)
RETURNING *;

-- name: UpdateAffiliateProduct :one
UPDATE affiliate_product
SET client_id = sqlc.arg('client_id'),
    ownership = sqlc.arg('ownership'),
    platform = sqlc.arg('platform'),
    platform_product_id = sqlc.arg('platform_product_id'),
    title = sqlc.arg('title'),
    category = sqlc.narg('category')::text,
    price = sqlc.narg('price')::numeric,
    currency = sqlc.arg('currency'),
    commission_rate = sqlc.narg('commission_rate')::numeric,
    activity = sqlc.narg('activity')::text,
    status = sqlc.arg('status'),
    owner_member_id = sqlc.narg('owner_member_id')::uuid,
    updated_at = now()
WHERE id = sqlc.arg('id') AND workspace_id = sqlc.arg('workspace_id') AND archived_at IS NULL
RETURNING *;

-- name: ArchiveAffiliateProduct :execrows
UPDATE affiliate_product
SET archived_at = now(), updated_at = now()
WHERE id = sqlc.arg('id') AND workspace_id = sqlc.arg('workspace_id') AND archived_at IS NULL;

-- name: ListAffiliatePicks :many
SELECT *
FROM affiliate_pick
WHERE workspace_id = sqlc.arg('workspace_id')
  AND archived_at IS NULL
  AND (sqlc.narg('product_id')::uuid IS NULL OR product_id = sqlc.narg('product_id')::uuid)
  AND (sqlc.narg('creator_id')::uuid IS NULL OR creator_id = sqlc.narg('creator_id')::uuid)
  AND (sqlc.narg('status')::text IS NULL OR status = sqlc.narg('status')::text)
  AND (
    sqlc.narg('cursor_at')::timestamptz IS NULL
    OR (created_at, id) < (sqlc.narg('cursor_at')::timestamptz, sqlc.narg('cursor_id')::uuid)
  )
ORDER BY created_at DESC, id DESC
LIMIT sqlc.arg('limit');

-- name: GetAffiliatePick :one
SELECT * FROM affiliate_pick
WHERE id = sqlc.arg('id') AND workspace_id = sqlc.arg('workspace_id') AND archived_at IS NULL;

-- name: CreateAffiliatePick :one
INSERT INTO affiliate_pick (
    workspace_id, product_id, creator_id, commission_rate, agency_share_rate,
    service_fee_amount, bound_at, status, note, owner_member_id, created_by
) VALUES (
    sqlc.arg('workspace_id'), sqlc.arg('product_id'), sqlc.arg('creator_id'),
    sqlc.narg('commission_rate')::numeric, sqlc.narg('agency_share_rate')::numeric,
    sqlc.narg('service_fee_amount')::numeric, sqlc.arg('bound_at'), sqlc.arg('status'),
    sqlc.narg('note')::text, sqlc.narg('owner_member_id')::uuid, sqlc.narg('created_by')::uuid
)
RETURNING *;

-- name: UpdateAffiliatePick :one
UPDATE affiliate_pick
SET product_id = sqlc.arg('product_id'),
    creator_id = sqlc.arg('creator_id'),
    commission_rate = sqlc.narg('commission_rate')::numeric,
    agency_share_rate = sqlc.narg('agency_share_rate')::numeric,
    service_fee_amount = sqlc.narg('service_fee_amount')::numeric,
    bound_at = sqlc.arg('bound_at'),
    status = sqlc.arg('status'),
    note = sqlc.narg('note')::text,
    owner_member_id = sqlc.narg('owner_member_id')::uuid,
    updated_at = now()
WHERE id = sqlc.arg('id') AND workspace_id = sqlc.arg('workspace_id') AND archived_at IS NULL
RETURNING *;

-- name: ArchiveAffiliatePick :execrows
UPDATE affiliate_pick
SET archived_at = now(), updated_at = now()
WHERE id = sqlc.arg('id') AND workspace_id = sqlc.arg('workspace_id') AND archived_at IS NULL;

-- name: ListAffiliateDaily :many
-- Newest day first. A day identifies itself through its pick, so the tiebreak is
-- the pick id and the ordering is stable across re-reads.
SELECT *
FROM affiliate_daily
WHERE workspace_id = sqlc.arg('workspace_id')
  AND (sqlc.narg('pick_id')::uuid IS NULL OR pick_id = sqlc.narg('pick_id')::uuid)
  AND (sqlc.narg('stat_from')::date IS NULL OR stat_date >= sqlc.narg('stat_from')::date)
  AND (sqlc.narg('stat_to')::date IS NULL OR stat_date <= sqlc.narg('stat_to')::date)
ORDER BY stat_date DESC, pick_id
LIMIT sqlc.arg('limit');

-- name: UpsertAffiliateDaily :one
-- `PUT /api/workbench/affiliate/daily` — one row per (pick, day). The body
-- replaces the day: every measure is `excluded`, so a corrected report overwrites
-- the previous value instead of merging two halves of the same day. `created_by`
-- and `created_at` stay with the first write; `updated_at` moves.
INSERT INTO affiliate_daily (
    workspace_id, pick_id, stat_date, gmv_amount, order_count, refund_amount,
    est_commission, settled_commission, currency, created_by
) VALUES (
    sqlc.arg('workspace_id'), sqlc.arg('pick_id'), sqlc.arg('stat_date'),
    sqlc.arg('gmv_amount')::numeric, sqlc.arg('order_count'), sqlc.arg('refund_amount')::numeric,
    sqlc.arg('est_commission')::numeric, sqlc.arg('settled_commission')::numeric,
    sqlc.arg('currency'), sqlc.narg('created_by')::uuid
)
ON CONFLICT (workspace_id, pick_id, stat_date)
DO UPDATE SET
    gmv_amount = excluded.gmv_amount,
    order_count = excluded.order_count,
    refund_amount = excluded.refund_amount,
    est_commission = excluded.est_commission,
    settled_commission = excluded.settled_commission,
    currency = excluded.currency,
    updated_at = now()
RETURNING *;

-- name: ListAffiliateSettlements :many
-- Newest period first. `period_from` / `period_to` are an overlap window, not a
-- containment one: a statement that straddles the boundary of what the reader
-- asked for is still a statement about it.
--
-- No keyset cursor: a settlement statement is issued once per settlement cycle,
-- so one workspace has tens of them, not tens of thousands, and the sort key is
-- the period rather than the row's own insertion time.
SELECT *
FROM affiliate_settlement
WHERE workspace_id = sqlc.arg('workspace_id')
  AND (sqlc.narg('status')::text IS NULL OR status = sqlc.narg('status')::text)
  AND (sqlc.narg('period_from')::date IS NULL OR period_end >= sqlc.narg('period_from')::date)
  AND (sqlc.narg('period_to')::date IS NULL OR period_start <= sqlc.narg('period_to')::date)
ORDER BY period_start DESC, id DESC
LIMIT sqlc.arg('limit');

-- name: GetAffiliateSettlement :one
SELECT * FROM affiliate_settlement
WHERE id = sqlc.arg('id') AND workspace_id = sqlc.arg('workspace_id');

-- name: CreateAffiliateSettlement :one
INSERT INTO affiliate_settlement (
    workspace_id, period_start, period_end, gross_commission, tech_service_fee,
    refund_deduction, net_amount, currency, status, settled_to, paid_at, external_no,
    note, created_by
) VALUES (
    sqlc.arg('workspace_id'), sqlc.arg('period_start'), sqlc.arg('period_end'),
    sqlc.arg('gross_commission')::numeric, sqlc.arg('tech_service_fee')::numeric,
    sqlc.arg('refund_deduction')::numeric, sqlc.arg('net_amount')::numeric,
    sqlc.arg('currency'), sqlc.arg('status'), sqlc.arg('settled_to'), sqlc.narg('paid_at')::date,
    sqlc.narg('external_no')::text, sqlc.narg('note')::text, sqlc.narg('created_by')::uuid
)
RETURNING *;

-- name: UpdateAffiliateSettlement :one
-- `net_amount` is written as sent, never recomputed from the three components: a
-- statement that disagrees with its own components is the platform's answer, and
-- overwriting it would hide exactly the discrepancy an operator needs to see.
UPDATE affiliate_settlement
SET period_start = sqlc.arg('period_start'),
    period_end = sqlc.arg('period_end'),
    gross_commission = sqlc.arg('gross_commission')::numeric,
    tech_service_fee = sqlc.arg('tech_service_fee')::numeric,
    refund_deduction = sqlc.arg('refund_deduction')::numeric,
    net_amount = sqlc.arg('net_amount')::numeric,
    currency = sqlc.arg('currency'),
    status = sqlc.arg('status'),
    settled_to = sqlc.arg('settled_to'),
    paid_at = sqlc.narg('paid_at')::date,
    external_no = sqlc.narg('external_no')::text,
    note = sqlc.narg('note')::text,
    updated_at = now()
WHERE id = sqlc.arg('id') AND workspace_id = sqlc.arg('workspace_id')
RETURNING *;

-- name: AffiliateSummary :one
-- One calendar month of the affiliate ledger
-- (`GET /api/workbench/affiliate/summary`).
--
-- Caliber, block by block:
--
--   * gmv / commission_est — sums over `affiliate_daily` rows whose `stat_date`
--     falls in the month. Samples are the number of days summed, which is what
--     tells "0 GMV" (a real zero) from "no report" (a gap). Archived picks keep
--     their daily rows in these sums: a plan that ended does not un-earn what it
--     already sold, and dropping it would rewrite a past month.
--
--   * commission_settled — the cleared part of the same rows. Its samples count
--     only days with a non-zero settled figure, so a month whose statements have
--     not been paid yet reports a gap rather than 0.
--
--   * commission_agency / commission_creator — the settled money split by who
--     received it (727). `agency` statements pay into our 机构号, so their
--     `net_amount` is income we receive; `creator` statements are paid by the
--     platform straight to the creator, so they are GMV without income. Adding
--     the two would count the business twice — that is why this pair exists
--     instead of a single settled total.
--
--     `commission_agency` also carries the `service_fee_amount` of picks bound in
--     the month (726): the 招商服务费 we invoice ourselves, which the platform
--     never routes and no statement therefore mentions. The two halves share a
--     block because an operator reads them as "what this month earned us", so
--     the block's samples count both kinds of contributing row.
--
--     `status` does not filter either half: like `commission_settled`, "settled"
--     means cleared into a statement cycle, not "the money has landed" — the
--     arrival day is `paid_at` and is a separate fact.
--
--   * agency_share_income — the 自有达人 split: `settled_commission` ×
--     `agency_share_rate`, summed over the month's daily rows of picks that have
--     a rate. A pick with a NULL rate is an 外部达人 and contributes nothing by
--     definition — the commission was never ours to split — so the samples count
--     only rows that both have a rate and carry a settled figure.
--
--   * refund_amount — kept separate from gmv (see 711); the handler divides it by
--     gmv to get the 0–1 refund rate (docs/METRICS.md §3 C3).
--
--   * pick_count / active_creator_count — the *live* plan set bound this month:
--     rows of `affiliate_pick` that are not archived and whose `bound_at` fell
--     inside it. These are counts, so the empty answer is a true zero.
--
--   * tech_fee — the platform's 技术服务费 over statements that overlap the month.
--     A settlement is issued for the whole workspace, not for a person, so it has
--     no owner whose department could stand in for it: with `department_id` given
--     the block answers "not attributable" (no rows) instead of a total that
--     silently ignores the filter. `commission_agency` / `commission_creator`
--     read the same statements and follow the same rule, which is why the service
--     fees that ride along with `commission_agency` are guarded too: a
--     department-filtered agency figure would be half a total.
--
-- Department attribution follows the B0 fallback chain (docs/METRICS.md §4): the
-- pick's owner member department. It is an aggregate filter and never an access
-- boundary.
WITH bounds AS (
    SELECT coalesce(sqlc.narg('month_start')::date, date_trunc('month', now())::date) AS month_start
),
period AS (
    SELECT month_start, (month_start + interval '1 month')::date AS month_end
    FROM bounds
),
daily AS (
    SELECT d.gmv_amount, d.refund_amount, d.est_commission, d.settled_commission,
           p.agency_share_rate
    FROM affiliate_daily d
    JOIN affiliate_pick p ON p.id = d.pick_id AND p.workspace_id = d.workspace_id
    LEFT JOIN member m ON m.workspace_id = p.workspace_id AND m.user_id = p.owner_member_id
    CROSS JOIN period
    WHERE d.workspace_id = sqlc.arg('workspace_id')
      AND d.stat_date >= period.month_start
      AND d.stat_date < period.month_end
      AND (
        sqlc.narg('department_id')::uuid IS NULL
        OR m.department_id = sqlc.narg('department_id')::uuid
      )
),
totals AS (
    SELECT
        coalesce(sum(daily.gmv_amount), 0)::float8 AS gmv_amount,
        (count(*))::bigint AS daily_samples,
        coalesce(sum(daily.refund_amount), 0)::float8 AS refund_amount,
        (count(*) FILTER (WHERE daily.gmv_amount > 0))::bigint AS gmv_samples,
        coalesce(sum(daily.est_commission), 0)::float8 AS est_commission,
        coalesce(sum(daily.settled_commission), 0)::float8 AS settled_commission,
        (count(*) FILTER (WHERE daily.settled_commission <> 0))::bigint AS settled_samples,
        -- Our cut of the internal creators' cleared commission. Rounded to the
        -- fen because the product of a rate and an amount lands on more decimals
        -- than money has; the rate itself stays at the 0–1 scale it was stored in.
        round(
            coalesce(
                sum(daily.settled_commission * daily.agency_share_rate)
                    FILTER (WHERE daily.agency_share_rate IS NOT NULL),
                0
            ),
            2
        )::float8 AS agency_share_income,
        (count(*) FILTER (
            WHERE daily.agency_share_rate IS NOT NULL AND daily.settled_commission <> 0
        ))::bigint AS agency_share_samples
    FROM daily
),
picks AS (
    SELECT
        (count(*))::bigint AS pick_count,
        (count(DISTINCT p.creator_id))::bigint AS active_creator_count
    FROM affiliate_pick p
    LEFT JOIN member m ON m.workspace_id = p.workspace_id AND m.user_id = p.owner_member_id
    CROSS JOIN period
    WHERE p.workspace_id = sqlc.arg('workspace_id')
      AND p.archived_at IS NULL
      AND p.bound_at >= period.month_start::timestamptz
      AND p.bound_at < period.month_end::timestamptz
      AND (
        sqlc.narg('department_id')::uuid IS NULL
        OR m.department_id = sqlc.narg('department_id')::uuid
      )
),
settlements AS (
    SELECT coalesce(sum(s.tech_service_fee), 0)::float8 AS tech_service_fee,
           (count(*))::bigint AS settlement_samples,
           coalesce(sum(s.net_amount) FILTER (WHERE s.settled_to = 'agency'), 0)::float8 AS agency_settled_commission,
           (count(*) FILTER (WHERE s.settled_to = 'agency'))::bigint AS agency_settlement_samples,
           coalesce(sum(s.net_amount) FILTER (WHERE s.settled_to = 'creator'), 0)::float8 AS creator_settled_commission,
           (count(*) FILTER (WHERE s.settled_to = 'creator'))::bigint AS creator_settlement_samples
    FROM affiliate_settlement s
    CROSS JOIN period
    WHERE s.workspace_id = sqlc.arg('workspace_id')
      AND s.period_start < period.month_end
      AND s.period_end >= period.month_start
      AND sqlc.narg('department_id')::uuid IS NULL
),
-- The other half of `commission_agency`: the 招商服务费 invoiced for the picks
-- bound this month. Guarded by the department filter for the same reason the
-- statements above are — the block they add up into cannot answer a
-- department-scoped question, so it reports a gap instead of a partial total.
agency_fees AS (
    SELECT coalesce(sum(p.service_fee_amount), 0)::float8 AS service_fee_amount,
           (count(*) FILTER (
               WHERE p.service_fee_amount IS NOT NULL AND p.service_fee_amount <> 0
           ))::bigint AS service_fee_samples
    FROM affiliate_pick p
    CROSS JOIN period
    WHERE p.workspace_id = sqlc.arg('workspace_id')
      AND p.archived_at IS NULL
      AND p.bound_at >= period.month_start::timestamptz
      AND p.bound_at < period.month_end::timestamptz
      AND sqlc.narg('department_id')::uuid IS NULL
)
SELECT
    period.month_start::date AS month_start,
    to_char(period.month_start, 'YYYY-MM') AS month_label,
    totals.gmv_amount,
    totals.daily_samples,
    totals.refund_amount,
    totals.gmv_samples,
    totals.est_commission,
    totals.settled_commission,
    totals.settled_samples,
    (settlements.agency_settled_commission + agency_fees.service_fee_amount)::float8 AS commission_agency,
    (settlements.agency_settlement_samples + agency_fees.service_fee_samples)::bigint AS commission_agency_samples,
    settlements.creator_settled_commission AS commission_creator,
    settlements.creator_settlement_samples AS commission_creator_samples,
    totals.agency_share_income,
    totals.agency_share_samples,
    picks.pick_count,
    picks.active_creator_count,
    settlements.tech_service_fee,
    settlements.settlement_samples
FROM period, totals, picks, settlements, agency_fees;
