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
-- (contract §3.1). `?assignee=` (B4-2) is the cockpit's 我的 queue: the rows one
-- person or agent is following up, which is a narrower question than "mine to
-- write" — the assignee is resolved by the handler, never by the client.
-- Ordering is `happened_at DESC` — what happened most recently, not what was
-- typed most recently — with the id as the total tiebreak.
SELECT *
FROM creator_activity
WHERE workspace_id = sqlc.arg('workspace_id')::uuid
  AND archived_at IS NULL
  AND (sqlc.narg('creator_id')::uuid IS NULL OR creator_id = sqlc.narg('creator_id')::uuid)
  AND (sqlc.narg('kind')::text IS NULL OR kind = sqlc.narg('kind')::text)
  AND (sqlc.narg('from_at')::timestamptz IS NULL OR happened_at >= sqlc.narg('from_at')::timestamptz)
  AND (sqlc.narg('to_at')::timestamptz IS NULL OR happened_at <= sqlc.narg('to_at')::timestamptz)
  AND (sqlc.narg('assignee_id')::uuid IS NULL OR assignee_id = sqlc.narg('assignee_id')::uuid)
  AND (sqlc.narg('assignee_type')::text IS NULL OR assignee_type = sqlc.narg('assignee_type')::text)
  AND (sqlc.narg('review_state')::text IS NULL OR review_state = sqlc.narg('review_state')::text)
ORDER BY happened_at DESC, id DESC
LIMIT sqlc.arg('limit')::integer;

-- name: GetCreatorActivity :one
SELECT * FROM creator_activity
WHERE id = sqlc.arg('id') AND workspace_id = sqlc.arg('workspace_id')::uuid
  AND archived_at IS NULL;

-- name: CreateCreatorActivity :one
-- `assignee_*` (821): who follows this conversation up. An agent may hold it;
-- `owner_member_id` stays a human seat (COLLAB-MODEL §1).
INSERT INTO creator_activity (
    workspace_id, creator_id, kind, happened_at, summary, outcome, next_follow_at,
    owner_member_id, created_by, assignee_type, assignee_id, review_state
) VALUES (
    sqlc.arg('workspace_id')::uuid, sqlc.arg('creator_id')::uuid, sqlc.arg('kind')::text,
    sqlc.arg('happened_at')::timestamptz, sqlc.arg('summary')::text,
    sqlc.narg('outcome')::text, sqlc.narg('next_follow_at')::timestamptz,
    sqlc.narg('owner_member_id')::uuid, sqlc.narg('created_by')::uuid,
    sqlc.narg('assignee_type')::text, sqlc.narg('assignee_id')::uuid,
    sqlc.arg('review_state')::text
)
RETURNING *;

-- name: UpdateCreatorActivity :one
-- `creator_id` is not in the SET: a follow-up that stops being about the same
-- person is a different record, and the handler answers 400 for that field.
--
-- The revision contract (COLLAB-MODEL §3): bump on every write, compare only
-- when the caller sent the revision it read.
UPDATE creator_activity
SET kind = sqlc.arg('kind')::text,
    happened_at = sqlc.arg('happened_at')::timestamptz,
    summary = sqlc.arg('summary')::text,
    outcome = sqlc.narg('outcome')::text,
    next_follow_at = sqlc.narg('next_follow_at')::timestamptz,
    owner_member_id = sqlc.narg('owner_member_id')::uuid,
    assignee_type = sqlc.narg('assignee_type')::text,
    assignee_id = sqlc.narg('assignee_id')::uuid,
    review_state = sqlc.arg('review_state')::text,
    reviewed_by = sqlc.narg('reviewed_by')::uuid,
    reviewed_at = sqlc.narg('reviewed_at')::timestamptz,
    revision = revision + 1,
    updated_at = now()
WHERE id = sqlc.arg('id') AND workspace_id = sqlc.arg('workspace_id')::uuid
  AND archived_at IS NULL
  AND (sqlc.narg('expected_revision')::int IS NULL OR revision = sqlc.narg('expected_revision')::int)
RETURNING *;

-- name: ArchiveCreatorActivity :execrows
UPDATE creator_activity
SET archived_at = now(), updated_at = now(), revision = revision + 1
WHERE id = sqlc.arg('id') AND workspace_id = sqlc.arg('workspace_id')::uuid
  AND archived_at IS NULL;

-- ---- quotes (creator_quote) ------------------------------------------------

-- name: ListCreatorQuotes :many
-- `?creator_id=` opens one creator's offers, `?status=` one segment of the quote
-- ledger, and `?assignee=` (B4-2) the ones a person or agent is working on. The
-- read order is the offer's own date, falling back to when the row was typed so a
-- draft (no `quoted_at` yet) does not sort below an older sent quote.
SELECT *
FROM creator_quote
WHERE workspace_id = sqlc.arg('workspace_id')::uuid
  AND archived_at IS NULL
  AND (sqlc.narg('creator_id')::uuid IS NULL OR creator_id = sqlc.narg('creator_id')::uuid)
  AND (sqlc.narg('status')::text IS NULL OR status = sqlc.narg('status')::text)
  AND (sqlc.narg('assignee_id')::uuid IS NULL OR assignee_id = sqlc.narg('assignee_id')::uuid)
  AND (sqlc.narg('assignee_type')::text IS NULL OR assignee_type = sqlc.narg('assignee_type')::text)
  AND (sqlc.narg('review_state')::text IS NULL OR review_state = sqlc.narg('review_state')::text)
ORDER BY coalesce(quoted_at, created_at) DESC, id DESC
LIMIT sqlc.arg('limit')::integer;

-- name: GetCreatorQuote :one
SELECT * FROM creator_quote
WHERE id = sqlc.arg('id') AND workspace_id = sqlc.arg('workspace_id')::uuid
  AND archived_at IS NULL;

-- name: CreateCreatorQuote :one
INSERT INTO creator_quote (
    workspace_id, creator_id, brief_id, status, quoted_at, valid_until, fee_amount,
    commission_rate, currency, items, note, owner_member_id, created_by,
    assignee_type, assignee_id, review_state
) VALUES (
    sqlc.arg('workspace_id')::uuid, sqlc.arg('creator_id')::uuid,
    sqlc.narg('brief_id')::uuid, sqlc.arg('status')::text,
    sqlc.narg('quoted_at')::timestamptz, sqlc.narg('valid_until')::date,
    sqlc.narg('fee_amount')::numeric, sqlc.narg('commission_rate')::numeric,
    sqlc.arg('currency')::text, sqlc.arg('items')::text::jsonb, sqlc.narg('note')::text,
    sqlc.narg('owner_member_id')::uuid, sqlc.narg('created_by')::uuid,
    sqlc.narg('assignee_type')::text, sqlc.narg('assignee_id')::uuid,
    sqlc.arg('review_state')::text
)
RETURNING *;

-- name: UpdateCreatorQuote :one
-- `creator_id` stays out of the SET for the same reason as the follow-up log: an
-- offer to a different creator is a different offer.
--
-- The revision contract (COLLAB-MODEL §3) is the same as every other ledger:
-- bump on write, compare only against a revision the caller named.
UPDATE creator_quote
SET brief_id = sqlc.narg('brief_id')::uuid,
    status = sqlc.arg('status')::text,
    quoted_at = sqlc.narg('quoted_at')::timestamptz,
    valid_until = sqlc.narg('valid_until')::date,
    fee_amount = sqlc.narg('fee_amount')::numeric,
    commission_rate = sqlc.narg('commission_rate')::numeric,
    currency = sqlc.arg('currency')::text,
    items = sqlc.arg('items')::text::jsonb,
    note = sqlc.narg('note')::text,
    owner_member_id = sqlc.narg('owner_member_id')::uuid,
    assignee_type = sqlc.narg('assignee_type')::text,
    assignee_id = sqlc.narg('assignee_id')::uuid,
    review_state = sqlc.arg('review_state')::text,
    reviewed_by = sqlc.narg('reviewed_by')::uuid,
    reviewed_at = sqlc.narg('reviewed_at')::timestamptz,
    revision = revision + 1,
    updated_at = now()
WHERE id = sqlc.arg('id') AND workspace_id = sqlc.arg('workspace_id')::uuid
  AND archived_at IS NULL
  AND (sqlc.narg('expected_revision')::int IS NULL OR revision = sqlc.narg('expected_revision')::int)
RETURNING *;

-- name: ArchiveCreatorQuote :execrows
UPDATE creator_quote
SET archived_at = now(), updated_at = now(), revision = revision + 1
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

-- ---- performance over a date range (WORKBENCH-API §22) ---------------------
--
-- `GET /api/workbench/bd/performance` answers one question the cockpit cannot:
-- "between these two days, what did the team actually produce?" The cockpit
-- (§20.3) is a snapshot of the ledger as it stands today; this is a window.
--
-- Three rules run through every statement below, and each one is a decision:
--
--   * **One currency per window.** `BdPerformanceCurrency` picks the currency the
--     window's rows are mostly in, and every sum filters on it. Adding CNY to USD
--     produces a number in neither, so rows in the other currency are excluded —
--     from the counts too, not just the amounts, because a count and the money
--     beside it have to describe the same rows (§20.6 does the same per block).
--
--   * **Every fact buckets by its own date.** A collaboration is *signed* on
--     `confirmed_at`, *delivered* on `published_at`; a settlement is *collected* on
--     `paid_at`; a quote is *sent* on `coalesce(quoted_at, created_at)`; a
--     follow-up happened on `happened_at`. The same collaboration may therefore
--     appear in two blocks of one report with two amounts — that is the point of
--     the report, not double counting: each block answers a different question.
--
--   * **Money with no rows is NULL, never 0.** The handler turns an empty sum into
--     `amount: null, empty: "insufficient_data"`; a count with no rows is a real 0.

-- name: BdPerformanceCurrency :one
-- The window's dominant currency, counted over the rows the report can sum:
-- collaborations touched by the window (signed or delivered), quotes that were
-- actually sent, and settlements whose period overlaps it. Falls back to 'CNY'
-- when the window has no money at all, so the client always has a label.
WITH bounds AS (
    SELECT sqlc.arg('from_day')::date AS from_day, sqlc.arg('to_day')::date AS to_day
),
money_rows AS (
    SELECT c.currency::text AS currency
    FROM crm_collab c
    CROSS JOIN bounds b
    WHERE c.workspace_id = sqlc.arg('workspace_id')::uuid
      AND c.archived_at IS NULL
      AND c.stage <> 'cancelled'
      AND (
        (c.confirmed_at >= b.from_day::timestamptz
            AND c.confirmed_at < (b.to_day + 1)::timestamptz)
        OR (c.published_at >= b.from_day::timestamptz
            AND c.published_at < (b.to_day + 1)::timestamptz)
      )
    UNION ALL
    SELECT q.currency::text
    FROM creator_quote q
    CROSS JOIN bounds b
    WHERE q.workspace_id = sqlc.arg('workspace_id')::uuid
      AND q.archived_at IS NULL
      AND q.status <> 'draft'
      AND coalesce(q.quoted_at, q.created_at) >= b.from_day::timestamptz
      AND coalesce(q.quoted_at, q.created_at) < (b.to_day + 1)::timestamptz
    UNION ALL
    SELECT s.currency::text
    FROM affiliate_settlement s
    CROSS JOIN bounds b
    WHERE s.workspace_id = sqlc.arg('workspace_id')::uuid
      AND s.period_start <= b.to_day
      AND s.period_end >= b.from_day
)
SELECT coalesce(
    (SELECT currency FROM money_rows GROUP BY currency ORDER BY count(*) DESC, currency LIMIT 1),
    'CNY'
)::text AS currency;

-- name: BdPerformanceBuckets :many
-- Every fact the report shows, in one statement, already grouped by (month,
-- member). The handler pivots these rows into the blocks, `by_member` and
-- `by_month`: a pivot in Go keeps one definition of each bucket instead of three
-- near-identical queries, and the row count is bounded by members × months.
--
--   signed          crm_collab confirmed in the window (stage <> cancelled) — the
--                   money is `final_amount`, what we committed to pay, and a row
--                   confirmed without an amount still counts.
--   delivered       crm_collab published in the window: the work went live.
--   collected       crm_settlement with `paid_at` in the window — money that
--                   actually moved, read off the settlement, attributed to the
--                   collaboration's owner. The collaboration itself may be archived
--                   by now; a payment does not un-happen.
--   quote_sent      creator_quote with status <> 'draft': a draft was never an
--                   offer. Money is the 坑位费 quoted.
--   quote_accepted  the same rows, status = 'accepted'. `win_rate` is
--                   accepted / sent, computed in the handler (0–1 scale).
--   followup        creator_activity in the window: 条数.
--   followup_replied / followup_meeting   the two outcomes worth counting
--                   separately: a conversation that moved, and a meeting held.
WITH bounds AS (
    SELECT sqlc.arg('from_day')::date AS from_day, sqlc.arg('to_day')::date AS to_day
)
SELECT
    'signed'::text AS metric,
    to_char(date_trunc('month', c.confirmed_at), 'YYYY-MM')::text AS month,
    c.owner_member_id AS member_id,
    count(*)::bigint AS row_count,
    coalesce(sum(c.final_amount), 0)::float8 AS amount,
    (count(c.final_amount))::bigint AS amount_samples
FROM crm_collab c
CROSS JOIN bounds b
WHERE c.workspace_id = sqlc.arg('workspace_id')::uuid
  AND c.archived_at IS NULL
  AND c.stage <> 'cancelled'
  AND c.currency = sqlc.arg('currency')::text
  AND c.confirmed_at >= b.from_day::timestamptz
  AND c.confirmed_at < (b.to_day + 1)::timestamptz
GROUP BY 2, 3

UNION ALL

SELECT
    'delivered'::text,
    to_char(date_trunc('month', c.published_at), 'YYYY-MM')::text,
    c.owner_member_id,
    count(*)::bigint,
    coalesce(sum(c.final_amount), 0)::float8,
    (count(c.final_amount))::bigint
FROM crm_collab c
CROSS JOIN bounds b
WHERE c.workspace_id = sqlc.arg('workspace_id')::uuid
  AND c.archived_at IS NULL
  AND c.stage <> 'cancelled'
  AND c.currency = sqlc.arg('currency')::text
  AND c.published_at >= b.from_day::timestamptz
  AND c.published_at < (b.to_day + 1)::timestamptz
GROUP BY 2, 3

UNION ALL

SELECT
    'collected'::text,
    to_char(date_trunc('month', s.paid_at), 'YYYY-MM')::text,
    c.owner_member_id,
    count(*)::bigint,
    coalesce(sum(s.amount), 0)::float8,
    (count(s.amount))::bigint
FROM crm_settlement s
JOIN crm_collab c ON c.id = s.collab_id AND c.workspace_id = s.workspace_id
CROSS JOIN bounds b
WHERE s.workspace_id = sqlc.arg('workspace_id')::uuid
  AND s.archived_at IS NULL
  AND s.paid_at IS NOT NULL
  AND s.currency = sqlc.arg('currency')::text
  AND s.paid_at >= b.from_day
  AND s.paid_at <= b.to_day
GROUP BY 2, 3

UNION ALL

SELECT
    'quote_sent'::text,
    to_char(date_trunc('month', coalesce(q.quoted_at, q.created_at)), 'YYYY-MM')::text,
    q.owner_member_id,
    count(*)::bigint,
    coalesce(sum(q.fee_amount), 0)::float8,
    (count(q.fee_amount))::bigint
FROM creator_quote q
CROSS JOIN bounds b
WHERE q.workspace_id = sqlc.arg('workspace_id')::uuid
  AND q.archived_at IS NULL
  AND q.status <> 'draft'
  AND q.currency = sqlc.arg('currency')::text
  AND coalesce(q.quoted_at, q.created_at) >= b.from_day::timestamptz
  AND coalesce(q.quoted_at, q.created_at) < (b.to_day + 1)::timestamptz
GROUP BY 2, 3

UNION ALL

SELECT
    'quote_accepted'::text,
    to_char(date_trunc('month', coalesce(q.quoted_at, q.created_at)), 'YYYY-MM')::text,
    q.owner_member_id,
    count(*)::bigint,
    coalesce(sum(q.fee_amount), 0)::float8,
    (count(q.fee_amount))::bigint
FROM creator_quote q
CROSS JOIN bounds b
WHERE q.workspace_id = sqlc.arg('workspace_id')::uuid
  AND q.archived_at IS NULL
  AND q.status = 'accepted'
  AND q.currency = sqlc.arg('currency')::text
  AND coalesce(q.quoted_at, q.created_at) >= b.from_day::timestamptz
  AND coalesce(q.quoted_at, q.created_at) < (b.to_day + 1)::timestamptz
GROUP BY 2, 3

UNION ALL

SELECT
    'followup'::text,
    to_char(date_trunc('month', a.happened_at), 'YYYY-MM')::text,
    a.owner_member_id,
    count(*)::bigint,
    0::float8,
    0::bigint
FROM creator_activity a
CROSS JOIN bounds b
WHERE a.workspace_id = sqlc.arg('workspace_id')::uuid
  AND a.archived_at IS NULL
  AND a.happened_at >= b.from_day::timestamptz
  AND a.happened_at < (b.to_day + 1)::timestamptz
GROUP BY 2, 3

UNION ALL

SELECT
    'followup_replied'::text,
    to_char(date_trunc('month', a.happened_at), 'YYYY-MM')::text,
    a.owner_member_id,
    count(*)::bigint,
    0::float8,
    0::bigint
FROM creator_activity a
CROSS JOIN bounds b
WHERE a.workspace_id = sqlc.arg('workspace_id')::uuid
  AND a.archived_at IS NULL
  AND a.outcome IN ('replied', 'advanced')
  AND a.happened_at >= b.from_day::timestamptz
  AND a.happened_at < (b.to_day + 1)::timestamptz
GROUP BY 2, 3

UNION ALL

SELECT
    'followup_meeting'::text,
    to_char(date_trunc('month', a.happened_at), 'YYYY-MM')::text,
    a.owner_member_id,
    count(*)::bigint,
    0::float8,
    0::bigint
FROM creator_activity a
CROSS JOIN bounds b
WHERE a.workspace_id = sqlc.arg('workspace_id')::uuid
  AND a.archived_at IS NULL
  AND a.kind = 'meeting'
  AND a.happened_at >= b.from_day::timestamptz
  AND a.happened_at < (b.to_day + 1)::timestamptz
GROUP BY 2, 3;

-- name: BdPerformanceAffiliate :one
-- The affiliate commission the window is responsible for, split by who received it
-- (727, same reading as §11's summary):
--
--   agency   statements `settled_to = 'agency'` — the money landed in our 机构号.
--   creator  statements `settled_to = 'creator'` — the platform paid the 达人直接.
--            Adding the two would count the business twice, which is why they stay
--            apart instead of collapsing into one "commission".
--   settled  statements whose `paid_at` falls inside the window: 已结算 means the
--            money arrived on that day. The agency/creator halves window on the
--            statement's *period* (it is a report about a span), while this one
--            windows on the pay date — two different facts, both asked for.
WITH bounds AS (
    SELECT sqlc.arg('from_day')::date AS from_day, sqlc.arg('to_day')::date AS to_day
),
overlapping AS (
    SELECT s.net_amount, s.settled_to
    FROM affiliate_settlement s
    CROSS JOIN bounds b
    WHERE s.workspace_id = sqlc.arg('workspace_id')::uuid
      AND s.currency = sqlc.arg('currency')::text
      AND s.period_start <= b.to_day
      AND s.period_end >= b.from_day
),
paid AS (
    SELECT s.net_amount
    FROM affiliate_settlement s
    CROSS JOIN bounds b
    WHERE s.workspace_id = sqlc.arg('workspace_id')::uuid
      AND s.currency = sqlc.arg('currency')::text
      AND s.paid_at IS NOT NULL
      AND s.paid_at >= b.from_day
      AND s.paid_at <= b.to_day
)
SELECT
    coalesce(sum(overlapping.net_amount) FILTER (WHERE overlapping.settled_to = 'agency'), 0)::float8
        AS agency_amount,
    (count(*) FILTER (WHERE overlapping.settled_to = 'agency'))::bigint AS agency_samples,
    coalesce(sum(overlapping.net_amount) FILTER (WHERE overlapping.settled_to = 'creator'), 0)::float8
        AS creator_amount,
    (count(*) FILTER (WHERE overlapping.settled_to = 'creator'))::bigint AS creator_samples,
    coalesce((SELECT sum(net_amount) FROM paid), 0)::float8 AS settled_amount,
    (SELECT count(*) FROM paid)::bigint AS settled_samples
FROM overlapping;
