-- CRM ledger (docs/engineering/WORKBENCH-API.md §3): clients, briefs,
-- collaborations and settlements. Same conventions as workbench_creator.sql —
-- workspace-scoped, archived rows hidden, keyset paging on the list's sort key.
--
-- A collaboration carries the two soft pointers this schema allows: `issue_id`
-- (the tracker side) and `owner_member_id` (the member whose department the
-- aggregates attribute the row to). Money columns stay NUMERIC(14,2).

-- name: ListCrmClients :many
SELECT *
FROM crm_client
WHERE workspace_id = sqlc.arg('workspace_id')
  AND archived_at IS NULL
  AND (
    sqlc.narg('query')::text IS NULL
    OR name ILIKE '%' || sqlc.narg('query')::text || '%'
    OR brand ILIKE '%' || sqlc.narg('query')::text || '%'
  )
  AND (
    sqlc.narg('cursor_at')::timestamptz IS NULL
    OR (created_at, id) < (sqlc.narg('cursor_at')::timestamptz, sqlc.narg('cursor_id')::uuid)
  )
ORDER BY created_at DESC, id DESC
LIMIT sqlc.arg('limit');

-- name: GetCrmClient :one
SELECT * FROM crm_client
WHERE id = sqlc.arg('id') AND workspace_id = sqlc.arg('workspace_id') AND archived_at IS NULL;

-- name: CreateCrmClient :one
INSERT INTO crm_client (
    workspace_id, name, brand, industry, contact_name, contact_channel,
    contract_entity, payment_terms, credit_note, owner_member_id, created_by
) VALUES (
    sqlc.arg('workspace_id'), sqlc.arg('name'), sqlc.narg('brand')::text,
    sqlc.narg('industry')::text, sqlc.narg('contact_name')::text,
    sqlc.narg('contact_channel')::text, sqlc.narg('contract_entity')::text,
    sqlc.narg('payment_terms')::text, sqlc.narg('credit_note')::text,
    sqlc.narg('owner_member_id')::uuid, sqlc.narg('created_by')::uuid
)
RETURNING *;

-- name: UpdateCrmClient :one
UPDATE crm_client
SET name = sqlc.arg('name'),
    brand = sqlc.narg('brand')::text,
    industry = sqlc.narg('industry')::text,
    contact_name = sqlc.narg('contact_name')::text,
    contact_channel = sqlc.narg('contact_channel')::text,
    contract_entity = sqlc.narg('contract_entity')::text,
    payment_terms = sqlc.narg('payment_terms')::text,
    credit_note = sqlc.narg('credit_note')::text,
    owner_member_id = sqlc.narg('owner_member_id')::uuid,
    updated_at = now()
WHERE id = sqlc.arg('id') AND workspace_id = sqlc.arg('workspace_id') AND archived_at IS NULL
RETURNING *;

-- name: ArchiveCrmClient :execrows
UPDATE crm_client
SET archived_at = now(), updated_at = now()
WHERE id = sqlc.arg('id') AND workspace_id = sqlc.arg('workspace_id') AND archived_at IS NULL;

-- name: ListCrmBriefs :many
SELECT *
FROM crm_brief
WHERE workspace_id = sqlc.arg('workspace_id')
  AND archived_at IS NULL
  AND (sqlc.narg('status')::text IS NULL OR status = sqlc.narg('status')::text)
  AND (sqlc.narg('client_id')::uuid IS NULL OR client_id = sqlc.narg('client_id')::uuid)
  AND (
    sqlc.narg('cursor_at')::timestamptz IS NULL
    OR (created_at, id) < (sqlc.narg('cursor_at')::timestamptz, sqlc.narg('cursor_id')::uuid)
  )
ORDER BY created_at DESC, id DESC
LIMIT sqlc.arg('limit');

-- name: GetCrmBrief :one
SELECT * FROM crm_brief
WHERE id = sqlc.arg('id') AND workspace_id = sqlc.arg('workspace_id') AND archived_at IS NULL;

-- name: CreateCrmBrief :one
INSERT INTO crm_brief (
    workspace_id, client_id, title, category, budget_min_amount, budget_max_amount,
    target_audience, deliverable_type, platforms, schedule_from, schedule_to, kpi_play,
    kpi_gmv_amount, status, owner_member_id, created_by
) VALUES (
    sqlc.arg('workspace_id'), sqlc.arg('client_id'), sqlc.arg('title'),
    sqlc.narg('category')::text, sqlc.narg('budget_min_amount')::numeric,
    sqlc.narg('budget_max_amount')::numeric, sqlc.narg('target_audience')::text,
    sqlc.narg('deliverable_type')::text, sqlc.arg('platforms')::text[],
    sqlc.narg('schedule_from')::date, sqlc.narg('schedule_to')::date,
    sqlc.narg('kpi_play')::bigint, sqlc.narg('kpi_gmv_amount')::numeric,
    sqlc.arg('status'), sqlc.narg('owner_member_id')::uuid, sqlc.narg('created_by')::uuid
)
RETURNING *;

-- name: UpdateCrmBrief :one
UPDATE crm_brief
SET client_id = sqlc.arg('client_id'),
    title = sqlc.arg('title'),
    category = sqlc.narg('category')::text,
    budget_min_amount = sqlc.narg('budget_min_amount')::numeric,
    budget_max_amount = sqlc.narg('budget_max_amount')::numeric,
    target_audience = sqlc.narg('target_audience')::text,
    deliverable_type = sqlc.narg('deliverable_type')::text,
    platforms = sqlc.arg('platforms')::text[],
    schedule_from = sqlc.narg('schedule_from')::date,
    schedule_to = sqlc.narg('schedule_to')::date,
    kpi_play = sqlc.narg('kpi_play')::bigint,
    kpi_gmv_amount = sqlc.narg('kpi_gmv_amount')::numeric,
    status = sqlc.arg('status'),
    owner_member_id = sqlc.narg('owner_member_id')::uuid,
    updated_at = now()
WHERE id = sqlc.arg('id') AND workspace_id = sqlc.arg('workspace_id') AND archived_at IS NULL
RETURNING *;

-- name: ArchiveCrmBrief :execrows
UPDATE crm_brief
SET archived_at = now(), updated_at = now()
WHERE id = sqlc.arg('id') AND workspace_id = sqlc.arg('workspace_id') AND archived_at IS NULL;

-- name: ListCrmCollabs :many
SELECT *
FROM crm_collab
WHERE workspace_id = sqlc.arg('workspace_id')
  AND archived_at IS NULL
  AND (sqlc.narg('stage')::text IS NULL OR stage = sqlc.narg('stage')::text)
  AND (sqlc.narg('brief_id')::uuid IS NULL OR brief_id = sqlc.narg('brief_id')::uuid)
  AND (sqlc.narg('creator_id')::uuid IS NULL OR creator_id = sqlc.narg('creator_id')::uuid)
  AND (
    sqlc.narg('cursor_at')::timestamptz IS NULL
    OR (created_at, id) < (sqlc.narg('cursor_at')::timestamptz, sqlc.narg('cursor_id')::uuid)
  )
ORDER BY created_at DESC, id DESC
LIMIT sqlc.arg('limit');

-- name: GetCrmCollab :one
SELECT * FROM crm_collab
WHERE id = sqlc.arg('id') AND workspace_id = sqlc.arg('workspace_id') AND archived_at IS NULL;

-- name: CreateCrmCollab :one
-- `publish_url` / `settled_on` (810) are the two fulfilment facts the
-- collaboration row carries: where the work went live, and the day the money was
-- settled (WORKBENCH-API §20.2).
INSERT INTO crm_collab (
    workspace_id, brief_id, creator_id, stage, quote_amount, final_amount, prob,
    creator_fee, sample_cost, platform_fee, currency, settlement_mode, commission_rate,
    sample_required, script_required, scheduled_at, confirmed_at, published_at,
    accepted_at, issue_id, owner_member_id, created_by, publish_url, settled_on
) VALUES (
    sqlc.arg('workspace_id'), sqlc.arg('brief_id'), sqlc.arg('creator_id'), sqlc.arg('stage'),
    sqlc.narg('quote_amount')::numeric, sqlc.narg('final_amount')::numeric,
    sqlc.narg('prob')::numeric, sqlc.narg('creator_fee')::numeric, sqlc.narg('sample_cost')::numeric,
    sqlc.narg('platform_fee')::numeric, sqlc.arg('currency'), sqlc.narg('settlement_mode')::text,
    sqlc.narg('commission_rate')::numeric, sqlc.arg('sample_required'), sqlc.arg('script_required'),
    sqlc.narg('scheduled_at')::timestamptz, sqlc.narg('confirmed_at')::timestamptz,
    sqlc.narg('published_at')::timestamptz, sqlc.narg('accepted_at')::timestamptz,
    sqlc.narg('issue_id')::uuid, sqlc.narg('owner_member_id')::uuid, sqlc.narg('created_by')::uuid,
    sqlc.narg('publish_url')::text, sqlc.narg('settled_on')::date
)
RETURNING *;

-- name: UpdateCrmCollab :one
-- The stage milestones are inputs, not triggers: the handler decides which
-- timestamp a stage transition fills in, so the SQL stays a plain write.
UPDATE crm_collab
SET brief_id = sqlc.arg('brief_id'),
    creator_id = sqlc.arg('creator_id'),
    stage = sqlc.arg('stage'),
    quote_amount = sqlc.narg('quote_amount')::numeric,
    final_amount = sqlc.narg('final_amount')::numeric,
    prob = sqlc.narg('prob')::numeric,
    creator_fee = sqlc.narg('creator_fee')::numeric,
    sample_cost = sqlc.narg('sample_cost')::numeric,
    platform_fee = sqlc.narg('platform_fee')::numeric,
    currency = sqlc.arg('currency'),
    settlement_mode = sqlc.narg('settlement_mode')::text,
    commission_rate = sqlc.narg('commission_rate')::numeric,
    sample_required = sqlc.arg('sample_required'),
    script_required = sqlc.arg('script_required'),
    scheduled_at = sqlc.narg('scheduled_at')::timestamptz,
    confirmed_at = sqlc.narg('confirmed_at')::timestamptz,
    published_at = sqlc.narg('published_at')::timestamptz,
    accepted_at = sqlc.narg('accepted_at')::timestamptz,
    issue_id = sqlc.narg('issue_id')::uuid,
    owner_member_id = sqlc.narg('owner_member_id')::uuid,
    publish_url = sqlc.narg('publish_url')::text,
    settled_on = sqlc.narg('settled_on')::date,
    updated_at = now()
WHERE id = sqlc.arg('id') AND workspace_id = sqlc.arg('workspace_id') AND archived_at IS NULL
RETURNING *;

-- name: ArchiveCrmCollab :execrows
UPDATE crm_collab
SET archived_at = now(), updated_at = now()
WHERE id = sqlc.arg('id') AND workspace_id = sqlc.arg('workspace_id') AND archived_at IS NULL;

-- name: ListCrmSettlements :many
SELECT *
FROM crm_settlement
WHERE workspace_id = sqlc.arg('workspace_id')
  AND archived_at IS NULL
  AND (sqlc.narg('collab_id')::uuid IS NULL OR collab_id = sqlc.narg('collab_id')::uuid)
  AND (
    sqlc.narg('paid')::boolean IS NULL
    OR (sqlc.narg('paid')::boolean AND paid_at IS NOT NULL)
    OR (NOT sqlc.narg('paid')::boolean AND paid_at IS NULL)
  )
  AND (
    sqlc.narg('cursor_at')::timestamptz IS NULL
    OR (created_at, id) < (sqlc.narg('cursor_at')::timestamptz, sqlc.narg('cursor_id')::uuid)
  )
ORDER BY created_at DESC, id DESC
LIMIT sqlc.arg('limit');

-- name: GetCrmSettlement :one
SELECT * FROM crm_settlement
WHERE id = sqlc.arg('id') AND workspace_id = sqlc.arg('workspace_id') AND archived_at IS NULL;

-- name: CreateCrmSettlement :one
INSERT INTO crm_settlement (
    workspace_id, collab_id, kind, amount, currency, due_at, paid_at, invoice_no,
    note, created_by
) VALUES (
    sqlc.arg('workspace_id'), sqlc.arg('collab_id'), sqlc.arg('kind'), sqlc.arg('amount')::numeric,
    sqlc.arg('currency'), sqlc.narg('due_at')::date, sqlc.narg('paid_at')::date,
    sqlc.narg('invoice_no')::text, sqlc.narg('note')::text, sqlc.narg('created_by')::uuid
)
RETURNING *;

-- name: UpdateCrmSettlement :one
UPDATE crm_settlement
SET collab_id = sqlc.arg('collab_id'),
    kind = sqlc.arg('kind'),
    amount = sqlc.arg('amount')::numeric,
    currency = sqlc.arg('currency'),
    due_at = sqlc.narg('due_at')::date,
    paid_at = sqlc.narg('paid_at')::date,
    invoice_no = sqlc.narg('invoice_no')::text,
    note = sqlc.narg('note')::text,
    updated_at = now()
WHERE id = sqlc.arg('id') AND workspace_id = sqlc.arg('workspace_id') AND archived_at IS NULL
RETURNING *;

-- name: ArchiveCrmSettlementsByCollab :many
-- Deleting a collaboration archives the settlements that name it in the same
-- transaction (WORKBENCH-API §20.1, §20.3). Without this a withdrawn collaboration
-- left its settlement rows live: they kept counting toward orders.paid_amount
-- and the receivable list while their collaboration had vanished, and the delete
-- endpoint was unusable because a single click would have manufactured orphans.
--
-- Paid rows are included on purpose: paid_at records that money moved once, and
-- archiving the row does not un-pay it — it removes the row from the ledgers the
-- way every other workbench delete does (§20.2). The statement returns the ids so
-- the handler can publish one crm_settlement:changed per archived row; a client
-- that only treated it as a collab edit would keep the vanished settlements in its
-- list cache.
UPDATE crm_settlement
SET archived_at = now(), updated_at = now()
WHERE workspace_id = sqlc.arg('workspace_id')::uuid
  AND collab_id = sqlc.arg('collab_id')::uuid
  AND archived_at IS NULL
RETURNING id;
-- name: ArchiveCrmSettlement :execrows
UPDATE crm_settlement
SET archived_at = now(), updated_at = now()
WHERE id = sqlc.arg('id') AND workspace_id = sqlc.arg('workspace_id') AND archived_at IS NULL;
