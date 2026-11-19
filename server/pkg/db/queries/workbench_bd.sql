-- BD pipeline: the three ledgers the 商务驾驶舱 reads (follow-ups, quotes,
-- campaigns) and the four aggregates behind `GET /api/workbench/bd/pipeline`
-- (docs/engineering/WORKBENCH-API.md §20,
-- docs/engineering/WORKBENCH-DATA-CONTRACT.md §3).
--
-- Same conventions as workbench_crm.sql — workspace-scoped, archived rows hidden,
-- money as NUMERIC(14,2), ratios at the 0–1 storage scale. There is **no
-- creator_order table here on purpose**: a collaboration is `crm_collab`, which
-- already carries stage / amounts / commission / issue_id, and a second
-- "cooperation credential" table would be a second source of truth for the same
-- fact (contract §3.3).
--
-- The lists are `limit`-only rather than keyset-paged: their sort keys are not a
-- single monotonic timestamp (`quoted_at` is nullable, a campaign sorts by start
-- day), and the same choice already exists for the HR change stream. Both ledgers
-- are hundreds of rows per workspace, so the LIMIT is the whole conversation.

-- ---- follow-up log (creator_activity) --------------------------------------

-- name: ListCreatorActivities :many
-- The BD timeline. `?creator_id=` opens one creator's history, `?kind=` narrows
-- to one channel, and `?from=` / `?to=` are an inclusive `happened_at` window
-- (contract §3.1). Ordering is `happened_at DESC` — what happened most recently,
-- not what was typed most recently — with the id as the total tiebreak.
SELECT *
FROM creator_activity
WHERE workspace_id = sqlc.arg('workspace_id')::uuid
  AND archived_at IS NULL
  AND (sqlc.narg('creator_id')::uuid IS NULL OR creator_id = sqlc.narg('creator_id')::uuid)
  AND (sqlc.narg('kind')::text IS NULL OR kind = sqlc.narg('kind')::text)
  AND (sqlc.narg('from_at')::timestamptz IS NULL OR happened_at >= sqlc.narg('from_at')::timestamptz)
  AND (sqlc.narg('to_at')::timestamptz IS NULL OR happened_at <= sqlc.narg('to_at')::timestamptz)
ORDER BY happened_at DESC, id DESC
LIMIT sqlc.arg('limit')::integer;

-- name: GetCreatorActivity :one
SELECT * FROM creator_activity
WHERE id = sqlc.arg('id') AND workspace_id = sqlc.arg('workspace_id')::uuid
  AND archived_at IS NULL;

-- name: CreateCreatorActivity :one
INSERT INTO creator_activity (
    workspace_id, creator_id, kind, happened_at, summary, outcome, next_follow_at,
    owner_member_id, created_by
) VALUES (
    sqlc.arg('workspace_id')::uuid, sqlc.arg('creator_id')::uuid, sqlc.arg('kind')::text,
    sqlc.arg('happened_at')::timestamptz, sqlc.arg('summary')::text,
    sqlc.narg('outcome')::text, sqlc.narg('next_follow_at')::timestamptz,
    sqlc.narg('owner_member_id')::uuid, sqlc.narg('created_by')::uuid
)
RETURNING *;

-- name: UpdateCreatorActivity :one
-- `creator_id` is not in the SET: a follow-up that stops being about the same
-- person is a different record, and the handler answers 400 for that field.
UPDATE creator_activity
SET kind = sqlc.arg('kind')::text,
    happened_at = sqlc.arg('happened_at')::timestamptz,
    summary = sqlc.arg('summary')::text,
    outcome = sqlc.narg('outcome')::text,
    next_follow_at = sqlc.narg('next_follow_at')::timestamptz,
    owner_member_id = sqlc.narg('owner_member_id')::uuid,
    updated_at = now()
WHERE id = sqlc.arg('id') AND workspace_id = sqlc.arg('workspace_id')::uuid
  AND archived_at IS NULL
RETURNING *;

-- name: ArchiveCreatorActivity :execrows
UPDATE creator_activity
SET archived_at = now(), updated_at = now()
WHERE id = sqlc.arg('id') AND workspace_id = sqlc.arg('workspace_id')::uuid
  AND archived_at IS NULL;

-- ---- quotes (creator_quote) ------------------------------------------------

-- name: ListCreatorQuotes :many
-- `?creator_id=` opens one creator's offers, `?status=` one segment of the quote
-- ledger. The read order is the offer's own date, falling back to when the row
-- was typed so a draft (no `quoted_at` yet) does not sort below an older sent
-- quote.
SELECT *
FROM creator_quote
WHERE workspace_id = sqlc.arg('workspace_id')::uuid
  AND archived_at IS NULL
  AND (sqlc.narg('creator_id')::uuid IS NULL OR creator_id = sqlc.narg('creator_id')::uuid)
  AND (sqlc.narg('status')::text IS NULL OR status = sqlc.narg('status')::text)
ORDER BY coalesce(quoted_at, created_at) DESC, id DESC
LIMIT sqlc.arg('limit')::integer;

-- name: GetCreatorQuote :one
SELECT * FROM creator_quote
WHERE id = sqlc.arg('id') AND workspace_id = sqlc.arg('workspace_id')::uuid
  AND archived_at IS NULL;

-- name: CreateCreatorQuote :one
INSERT INTO creator_quote (
    workspace_id, creator_id, brief_id, status, quoted_at, valid_until, fee_amount,
    commission_rate, currency, items, note, owner_member_id, created_by
) VALUES (
    sqlc.arg('workspace_id')::uuid, sqlc.arg('creator_id')::uuid,
    sqlc.narg('brief_id')::uuid, sqlc.arg('status')::text,
    sqlc.narg('quoted_at')::timestamptz, sqlc.narg('valid_until')::date,
    sqlc.narg('fee_amount')::numeric, sqlc.narg('commission_rate')::numeric,
    sqlc.arg('currency')::text, sqlc.arg('items')::jsonb, sqlc.narg('note')::text,
    sqlc.narg('owner_member_id')::uuid, sqlc.narg('created_by')::uuid
)
RETURNING *;

-- name: UpdateCreatorQuote :one
-- `creator_id` stays out of the SET for the same reason as the follow-up log: an
-- offer to a different creator is a different offer.
UPDATE creator_quote
SET brief_id = sqlc.narg('brief_id')::uuid,
    status = sqlc.arg('status')::text,
    quoted_at = sqlc.narg('quoted_at')::timestamptz,
    valid_until = sqlc.narg('valid_until')::date,
    fee_amount = sqlc.narg('fee_amount')::numeric,
    commission_rate = sqlc.narg('commission_rate')::numeric,
    currency = sqlc.arg('currency')::text,
    items = sqlc.arg('items')::jsonb,
    note = sqlc.narg('note')::text,
    owner_member_id = sqlc.narg('owner_member_id')::uuid,
    updated_at = now()
WHERE id = sqlc.arg('id') AND workspace_id = sqlc.arg('workspace_id')::uuid
  AND archived_at IS NULL
RETURNING *;

-- name: ArchiveCreatorQuote :execrows
UPDATE creator_quote
SET archived_at = now(), updated_at = now()
WHERE id = sqlc.arg('id') AND workspace_id = sqlc.arg('workspace_id')::uuid
  AND archived_at IS NULL;

-- ---- campaigns (creator_campaign) ------------------------------------------

-- name: ListCreatorCampaigns :many
-- `?kind=` narrows to one collection method. Newest batch first: the start day
-- when it was recorded, otherwise when the row was typed.
SELECT *
FROM creator_campaign
WHERE workspace_id = sqlc.arg('workspace_id')::uuid
  AND archived_at IS NULL
  AND (sqlc.narg('kind')::text IS NULL OR kind = sqlc.narg('kind')::text)
ORDER BY coalesce(started_on, created_at::date) DESC, created_at DESC, id DESC
LIMIT sqlc.arg('limit')::integer;

-- name: GetCreatorCampaign :one
SELECT * FROM creator_campaign
WHERE id = sqlc.arg('id') AND workspace_id = sqlc.arg('workspace_id')::uuid
  AND archived_at IS NULL;

-- name: CreateCreatorCampaign :one
INSERT INTO creator_campaign (
    workspace_id, name, kind, budget_amount, currency, started_on, ended_on,
    source_keyword, creator_count, note, owner_member_id, created_by
) VALUES (
    sqlc.arg('workspace_id')::uuid, sqlc.arg('name')::text, sqlc.arg('kind')::text,
    sqlc.narg('budget_amount')::numeric, sqlc.arg('currency')::text,
    sqlc.narg('started_on')::date, sqlc.narg('ended_on')::date,
    sqlc.narg('source_keyword')::text, sqlc.arg('creator_count')::integer,
    sqlc.narg('note')::text, sqlc.narg('owner_member_id')::uuid,
    sqlc.narg('created_by')::uuid
)
RETURNING *;

-- name: UpdateCreatorCampaign :one
UPDATE creator_campaign
SET name = sqlc.arg('name')::text,
    kind = sqlc.arg('kind')::text,
    budget_amount = sqlc.narg('budget_amount')::numeric,
    currency = sqlc.arg('currency')::text,
    started_on = sqlc.narg('started_on')::date,
    ended_on = sqlc.narg('ended_on')::date,
    source_keyword = sqlc.narg('source_keyword')::text,
    creator_count = sqlc.arg('creator_count')::integer,
    note = sqlc.narg('note')::text,
    owner_member_id = sqlc.narg('owner_member_id')::uuid,
    updated_at = now()
WHERE id = sqlc.arg('id') AND workspace_id = sqlc.arg('workspace_id')::uuid
  AND archived_at IS NULL
RETURNING *;

-- name: ArchiveCreatorCampaign :execrows
UPDATE creator_campaign
SET archived_at = now(), updated_at = now()
WHERE id = sqlc.arg('id') AND workspace_id = sqlc.arg('workspace_id')::uuid
  AND archived_at IS NULL;

-- name: CountCreatorCampaignNameConflicts :one
-- The 409 read on POST / PATCH. Compares the way the unique index (809) does —
-- `lower(name)`, live rows only — so the answer and the constraint cannot
-- disagree. `exclude_id` lets a rename keep its own name.
SELECT count(*)::bigint AS conflicts
FROM creator_campaign
WHERE workspace_id = sqlc.arg('workspace_id')::uuid
  AND archived_at IS NULL
  AND lower(name) = lower(sqlc.arg('name')::text)
  AND (sqlc.narg('exclude_id')::uuid IS NULL OR id <> sqlc.narg('exclude_id')::uuid);

-- ---- cockpit aggregates ----------------------------------------------------
--
-- Every counter here answers "0" from an empty ledger, because a counter of rows
-- that do not exist really is zero. The money totals do not: with nothing
-- summed there is no amount, and the handler reports that as
-- `{value: null, empty: "insufficient_data"}` rather than a confident 0
-- (WORKBENCH-API §20.3, same three states as /overview).

-- name: BdPipelineCreators :one
-- The funnel's creator counts. Every sub-counter is a subset of `total` (it joins
-- the live `creator` row), so nobody can be "contacted" without being in the
-- workspace's creator ledger — a row left behind by an archived creator would
-- otherwise make the funnel add up to more than its own first number.
--
--   total     live creators in the workspace
--   contacted has a follow-up row with a non-NULL outcome (a note is not contact)
--   replied   any follow-up outcome went forward (`replied` / `advanced`) — the
--             conversation moved at least once, which is what "she answered" means
--             for a funnel; it is not "the newest row says replied"
--   quoted    has a quote that was actually sent (`status <> 'draft'`)
--   signed    `creator.cooperation_intent = 'signed'`
--   deal      `creator.cooperation_intent = 'deal'`
WITH live_creators AS (
    SELECT id, cooperation_intent
    FROM creator
    WHERE workspace_id = sqlc.arg('workspace_id')::uuid
      AND archived_at IS NULL
),
contacted AS (
    SELECT a.creator_id,
           bool_or(a.outcome IN ('replied', 'advanced')) AS replied
    FROM creator_activity a
    JOIN live_creators c ON c.id = a.creator_id
    WHERE a.workspace_id = sqlc.arg('workspace_id')::uuid
      AND a.archived_at IS NULL
      AND a.outcome IS NOT NULL
    GROUP BY a.creator_id
),
quoted AS (
    SELECT DISTINCT q.creator_id
    FROM creator_quote q
    JOIN live_creators c ON c.id = q.creator_id
    WHERE q.workspace_id = sqlc.arg('workspace_id')::uuid
      AND q.archived_at IS NULL
      AND q.status <> 'draft'
)
SELECT
    (SELECT count(*) FROM live_creators)::bigint AS total,
    (SELECT count(*) FROM contacted)::bigint AS contacted,
    (SELECT count(*) FROM contacted WHERE replied)::bigint AS replied,
    (SELECT count(*) FROM quoted)::bigint AS quoted,
    (SELECT count(*) FROM live_creators WHERE cooperation_intent = 'signed')::bigint
        AS signed_count,
    (SELECT count(*) FROM live_creators WHERE cooperation_intent = 'deal')::bigint
        AS deal_count;

-- name: BdPipelineQuotes :one
-- The offer side. `open` is `sent` (an answer is outstanding); a draft was never
-- an offer and an expired one is no longer open, so neither counts.
--
-- `total_fee` is the sum of the 坑位费 of the workspace's **dominant currency**
-- (`currency` of the most rows), and `currency` names which one it summed: adding
-- CNY to USD would produce a number in neither. A workspace that genuinely quotes
-- in two currencies reads only its dominant one here — a per-currency breakdown is
-- known debt (WORKBENCH-API §20.6).
WITH live AS (
    SELECT q.status, q.fee_amount, q.currency
    FROM creator_quote q
    JOIN creator c ON c.id = q.creator_id AND c.workspace_id = q.workspace_id
                   AND c.archived_at IS NULL
    WHERE q.workspace_id = sqlc.arg('workspace_id')::uuid
      AND q.archived_at IS NULL
),
dominant AS (
    SELECT currency FROM live GROUP BY currency ORDER BY count(*) DESC, currency LIMIT 1
)
SELECT
    (count(*) FILTER (WHERE status = 'sent'))::bigint AS open_count,
    (count(*) FILTER (WHERE status = 'accepted'))::bigint AS accepted_count,
    (count(*) FILTER (WHERE status = 'rejected'))::bigint AS rejected_count,
    coalesce(sum(fee_amount) FILTER (WHERE currency = (SELECT currency FROM dominant)), 0)::float8
        AS total_fee,
    (count(fee_amount) FILTER (WHERE currency = (SELECT currency FROM dominant)))::bigint
        AS fee_sample_count,
    coalesce((SELECT currency FROM dominant), 'CNY')::text AS currency
FROM live;

-- name: BdPipelineOrders :one
-- The fulfilment side, read off `crm_collab` (there is no `creator_order`, §3.3)
-- plus the settlement ledger.
--
--   open       work has started and is not settled: every stage except
--              inquiry / quoted / negotiating (still selling) and settled /
--              cancelled (finished). `published` and `accepted` are inside it —
--              the money has not cleared yet.
--   delivered  the work went live (`published`) or we accepted it (`accepted`).
--              Overlaps `open` on purpose: a delivered-but-unpaid card is both.
--   settled    stage `settled` (the row is finished and paid).
--   total_amount  Σ final_amount over non-cancelled collaborations.
--   paid_amount   Σ crm_settlement.amount over settlements that cleared
--                 (`paid_at` is set). This is what money actually moved, which is
--                 not the same as "the collaborations we marked settled".
WITH live AS (
    SELECT c.stage, c.final_amount, c.currency
    FROM crm_collab c
    WHERE c.workspace_id = sqlc.arg('workspace_id')::uuid
      AND c.archived_at IS NULL
),
dominant AS (
    SELECT currency FROM live GROUP BY currency ORDER BY count(*) DESC, currency LIMIT 1
),
paid AS (
    SELECT s.amount, s.currency
    FROM crm_settlement s
    WHERE s.workspace_id = sqlc.arg('workspace_id')::uuid
      AND s.archived_at IS NULL
      AND s.paid_at IS NOT NULL
),
paid_dominant AS (
    SELECT currency FROM paid GROUP BY currency ORDER BY count(*) DESC, currency LIMIT 1
)
SELECT
    (count(*) FILTER (WHERE stage IN (
        'confirmed', 'sampling', 'script_review', 'scheduled', 'published', 'accepted'
    )))::bigint AS open_count,
    (count(*) FILTER (WHERE stage IN ('published', 'accepted')))::bigint AS delivered_count,
    (count(*) FILTER (WHERE stage = 'settled'))::bigint AS settled_count,
    coalesce(sum(final_amount) FILTER (
        WHERE stage <> 'cancelled' AND currency = (SELECT currency FROM dominant)
    ), 0)::float8 AS total_amount,
    (count(final_amount) FILTER (
        WHERE stage <> 'cancelled' AND currency = (SELECT currency FROM dominant)
    ))::bigint AS total_sample_count,
    coalesce((SELECT currency FROM dominant), 'CNY')::text AS currency,
    coalesce((SELECT sum(amount) FROM paid
              WHERE currency = (SELECT currency FROM paid_dominant)), 0)::float8 AS paid_amount,
    (SELECT count(*) FROM paid WHERE currency = (SELECT currency FROM paid_dominant))::bigint
        AS paid_sample_count
FROM live;

-- name: BdPipelineFollowups :one
-- Who to chase. A creator's follow-up obligation is the `next_follow_at` of their
-- **newest** follow-up row: an older row that still says "今天再问一次" is answered by
-- the newer one that already happened, which is exactly the contract's "且该达人无
-- 更新的跟进记录".
--
-- `due_today` is the calendar day in the session's time zone (UTC in production),
-- so it includes rows already past their hour — those also count as `overdue`. The
-- two numbers overlap on purpose: one says "chase today", the other "you are late".
WITH newest AS (
    SELECT DISTINCT ON (a.creator_id)
        a.creator_id, a.next_follow_at
    FROM creator_activity a
    JOIN creator c ON c.id = a.creator_id AND c.workspace_id = a.workspace_id
                   AND c.archived_at IS NULL
    WHERE a.workspace_id = sqlc.arg('workspace_id')::uuid
      AND a.archived_at IS NULL
    ORDER BY a.creator_id, a.happened_at DESC, a.created_at DESC, a.id DESC
)
SELECT
    (count(*) FILTER (
        WHERE next_follow_at >= date_trunc('day', now())
          AND next_follow_at < date_trunc('day', now()) + interval '1 day'
    ))::bigint AS due_today,
    (count(*) FILTER (WHERE next_follow_at < now()))::bigint AS overdue
FROM newest;
