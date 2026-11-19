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
-- `?assignee=` (B4-2) narrows the list to the rows one person or agent is
-- working on, which is what the cockpit's 我的 queue reads. The id filter is
-- separate from the type because a bare uuid names a row without saying which
-- identity space it came from (COLLAB-MODEL §1).
--
-- The department predicate (`department_scoped` + `department_id`, WORKBENCH-API
-- §24.4/§24.6) is the read-side half of the visibility switch: with
-- `workbench_visibility=department` a list returns the rows whose *owner* sits in
-- the caller's department. A row with no owner, or an owner with no department,
-- matches neither branch and therefore disappears — this filter never widens into
-- "every department". `department_scoped = false` (the `transparent` default)
-- leaves the query byte-for-byte the workspace-wide read it was.
SELECT *
FROM crm_collab
WHERE crm_collab.workspace_id = sqlc.arg('workspace_id')
  AND crm_collab.archived_at IS NULL
  AND (sqlc.narg('stage')::text IS NULL OR crm_collab.stage = sqlc.narg('stage')::text)
  AND (sqlc.narg('brief_id')::uuid IS NULL OR crm_collab.brief_id = sqlc.narg('brief_id')::uuid)
  AND (sqlc.narg('creator_id')::uuid IS NULL OR crm_collab.creator_id = sqlc.narg('creator_id')::uuid)
  AND (sqlc.narg('assignee_id')::uuid IS NULL OR crm_collab.assignee_id = sqlc.narg('assignee_id')::uuid)
  AND (sqlc.narg('assignee_type')::text IS NULL OR crm_collab.assignee_type = sqlc.narg('assignee_type')::text)
  AND (sqlc.narg('review_state')::text IS NULL OR crm_collab.review_state = sqlc.narg('review_state')::text)
  AND (
    NOT sqlc.arg('department_scoped')::boolean
    OR (
      sqlc.narg('department_id')::uuid IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM member m
        WHERE m.workspace_id = crm_collab.workspace_id
          AND m.user_id = crm_collab.owner_member_id
          AND m.department_id = sqlc.narg('department_id')::uuid
      )
    )
  )
  AND (
    sqlc.narg('cursor_at')::timestamptz IS NULL
    OR (crm_collab.created_at, crm_collab.id)
      < (sqlc.narg('cursor_at')::timestamptz, sqlc.narg('cursor_id')::uuid)
  )
ORDER BY crm_collab.created_at DESC, crm_collab.id DESC
LIMIT sqlc.arg('limit');

-- name: GetCrmCollab :one
SELECT * FROM crm_collab
WHERE id = sqlc.arg('id') AND workspace_id = sqlc.arg('workspace_id') AND archived_at IS NULL;

-- name: CreateCrmCollab :one
-- `publish_url` / `settled_on` (810) are the two fulfilment facts the
-- collaboration row carries: where the work went live, and the day the money was
-- settled (WORKBENCH-API §20.2).
--
-- `assignee_*` (821) is who is doing the work — an agent may hold it, unlike
-- `owner_member_id` (COLLAB-MODEL §1). `revision` starts at 1 from the column
-- default, so a create never names it.
INSERT INTO crm_collab (
    workspace_id, brief_id, creator_id, stage, quote_amount, final_amount, prob,
    creator_fee, sample_cost, platform_fee, currency, settlement_mode, commission_rate,
    sample_required, script_required, scheduled_at, confirmed_at, published_at,
    accepted_at, issue_id, owner_member_id, created_by, publish_url, settled_on,
    assignee_type, assignee_id, review_state
) VALUES (
    sqlc.arg('workspace_id'), sqlc.arg('brief_id'), sqlc.arg('creator_id'), sqlc.arg('stage'),
    sqlc.narg('quote_amount')::numeric, sqlc.narg('final_amount')::numeric,
    sqlc.narg('prob')::numeric, sqlc.narg('creator_fee')::numeric, sqlc.narg('sample_cost')::numeric,
    sqlc.narg('platform_fee')::numeric, sqlc.arg('currency'), sqlc.narg('settlement_mode')::text,
    sqlc.narg('commission_rate')::numeric, sqlc.arg('sample_required'), sqlc.arg('script_required'),
    sqlc.narg('scheduled_at')::timestamptz, sqlc.narg('confirmed_at')::timestamptz,
    sqlc.narg('published_at')::timestamptz, sqlc.narg('accepted_at')::timestamptz,
    sqlc.narg('issue_id')::uuid, sqlc.narg('owner_member_id')::uuid, sqlc.narg('created_by')::uuid,
    sqlc.narg('publish_url')::text, sqlc.narg('settled_on')::date,
    sqlc.narg('assignee_type')::text, sqlc.narg('assignee_id')::uuid,
    sqlc.arg('review_state')::text
)
RETURNING *;

-- name: UpdateCrmCollab :one
-- The stage milestones are inputs, not triggers: the handler decides which
-- timestamp a stage transition fills in, so the SQL stays a plain write.
--
-- Two things every workbench update carries (COLLAB-MODEL §3):
--
--   * `revision = revision + 1`, so a reader can tell the row moved;
--   * an optional `expected_revision` in the WHERE. Absent = no check, which is
--     the old-client behaviour; present and stale = zero rows, and the handler
--     turns that into a 409 `stale_write` with the current row. The check lives
--     in the statement rather than in a read-then-write so two connections
--     racing cannot both see "revision 1" and both win.
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
    assignee_type = sqlc.narg('assignee_type')::text,
    assignee_id = sqlc.narg('assignee_id')::uuid,
    review_state = sqlc.arg('review_state')::text,
    reviewed_by = sqlc.narg('reviewed_by')::uuid,
    reviewed_at = sqlc.narg('reviewed_at')::timestamptz,
    revision = revision + 1,
    updated_at = now()
WHERE id = sqlc.arg('id') AND workspace_id = sqlc.arg('workspace_id') AND archived_at IS NULL
  AND (sqlc.narg('expected_revision')::int IS NULL OR revision = sqlc.narg('expected_revision')::int)
RETURNING *;

-- name: ArchiveCrmCollab :execrows
-- A delete is a write too: the revision moves so an audit trail that reads the
-- row's revision before and after a delete cannot claim nothing happened.
--
-- The optional `expected_revision` gives the delete the same guard a PATCH has
-- (COLLAB-MODEL §3): absent = no check (old clients), present and stale = zero
-- rows, which the handler turns into a 409 `stale_write` with the current row.
-- It has to be part of this statement — a read-then-archive would let two
-- connections that both read revision 4 delete the row twice.
UPDATE crm_collab
SET archived_at = now(), updated_at = now(), revision = revision + 1
WHERE id = sqlc.arg('id') AND workspace_id = sqlc.arg('workspace_id') AND archived_at IS NULL
  AND (sqlc.narg('expected_revision')::int IS NULL OR revision = sqlc.narg('expected_revision')::int);

-- name: ListCrmSettlements :many
-- `crm_settlement` has no `owner_member_id` — its owner is the collaboration's
-- (see `loadCollabForSettlementWrite`). The department predicate therefore goes
-- through `collab_id`: with the visibility switch in `department` mode a settlement
-- is visible only when the collaboration behind it is owned by a member of the
-- caller's department. A settlement whose collaboration has no owner is invisible
-- in that mode, exactly like an ownerless row in the other ledgers, and the
-- `transparent` default (`department_scoped = false`) reads as before.
SELECT *
FROM crm_settlement
WHERE crm_settlement.workspace_id = sqlc.arg('workspace_id')
  AND crm_settlement.archived_at IS NULL
  AND (
    sqlc.narg('collab_id')::uuid IS NULL
    OR crm_settlement.collab_id = sqlc.narg('collab_id')::uuid
  )
  AND (
    sqlc.narg('paid')::boolean IS NULL
    OR (sqlc.narg('paid')::boolean AND crm_settlement.paid_at IS NOT NULL)
    OR (NOT sqlc.narg('paid')::boolean AND crm_settlement.paid_at IS NULL)
  )
  AND (
    sqlc.narg('assignee_id')::uuid IS NULL
    OR crm_settlement.assignee_id = sqlc.narg('assignee_id')::uuid
  )
  AND (
    sqlc.narg('assignee_type')::text IS NULL
    OR crm_settlement.assignee_type = sqlc.narg('assignee_type')::text
  )
  AND (
    sqlc.narg('review_state')::text IS NULL
    OR crm_settlement.review_state = sqlc.narg('review_state')::text
  )
  AND (
    NOT sqlc.arg('department_scoped')::boolean
    OR (
      sqlc.narg('department_id')::uuid IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM crm_collab collab
        JOIN member m
          ON m.workspace_id = collab.workspace_id
         AND m.user_id = collab.owner_member_id
        WHERE collab.id = crm_settlement.collab_id
          AND collab.workspace_id = crm_settlement.workspace_id
          AND m.department_id = sqlc.narg('department_id')::uuid
      )
    )
  )
  AND (
    sqlc.narg('cursor_at')::timestamptz IS NULL
    OR (crm_settlement.created_at, crm_settlement.id)
      < (sqlc.narg('cursor_at')::timestamptz, sqlc.narg('cursor_id')::uuid)
  )
ORDER BY crm_settlement.created_at DESC, crm_settlement.id DESC
LIMIT sqlc.arg('limit');

-- name: GetCrmSettlement :one
SELECT * FROM crm_settlement
WHERE id = sqlc.arg('id') AND workspace_id = sqlc.arg('workspace_id') AND archived_at IS NULL;

-- name: CreateCrmSettlement :one
-- `assignee_*` (821): a settlement's owner is its collaboration's, so a new row
-- may be handed to somebody directly — that is who chases the money.
INSERT INTO crm_settlement (
    workspace_id, collab_id, kind, amount, currency, due_at, paid_at, invoice_no,
    note, created_by, assignee_type, assignee_id, review_state
) VALUES (
    sqlc.arg('workspace_id'), sqlc.arg('collab_id'), sqlc.arg('kind'), sqlc.arg('amount')::numeric,
    sqlc.arg('currency'), sqlc.narg('due_at')::date, sqlc.narg('paid_at')::date,
    sqlc.narg('invoice_no')::text, sqlc.narg('note')::text, sqlc.narg('created_by')::uuid,
    sqlc.narg('assignee_type')::text, sqlc.narg('assignee_id')::uuid,
    sqlc.arg('review_state')::text
)
RETURNING *;

-- name: UpdateCrmSettlement :one
-- Same revision contract as the collaboration (COLLAB-MODEL §3): bump on write,
-- compare only when the caller named the revision it read.
UPDATE crm_settlement
SET collab_id = sqlc.arg('collab_id'),
    kind = sqlc.arg('kind'),
    amount = sqlc.arg('amount')::numeric,
    currency = sqlc.arg('currency'),
    due_at = sqlc.narg('due_at')::date,
    paid_at = sqlc.narg('paid_at')::date,
    invoice_no = sqlc.narg('invoice_no')::text,
    note = sqlc.narg('note')::text,
    assignee_type = sqlc.narg('assignee_type')::text,
    assignee_id = sqlc.narg('assignee_id')::uuid,
    review_state = sqlc.arg('review_state')::text,
    reviewed_by = sqlc.narg('reviewed_by')::uuid,
    reviewed_at = sqlc.narg('reviewed_at')::timestamptz,
    revision = revision + 1,
    updated_at = now()
WHERE id = sqlc.arg('id') AND workspace_id = sqlc.arg('workspace_id') AND archived_at IS NULL
  AND (sqlc.narg('expected_revision')::int IS NULL OR revision = sqlc.narg('expected_revision')::int)
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
SET archived_at = now(), updated_at = now(), revision = revision + 1
WHERE workspace_id = sqlc.arg('workspace_id')::uuid
  AND collab_id = sqlc.arg('collab_id')::uuid
  AND archived_at IS NULL
RETURNING id;
-- name: ArchiveCrmSettlement :execrows
UPDATE crm_settlement
SET archived_at = now(), updated_at = now(), revision = revision + 1
WHERE id = sqlc.arg('id') AND workspace_id = sqlc.arg('workspace_id') AND archived_at IS NULL
  AND (sqlc.narg('expected_revision')::int IS NULL OR revision = sqlc.narg('expected_revision')::int);
