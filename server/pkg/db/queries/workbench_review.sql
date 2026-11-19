-- 复核闸门 reads and the three verifiability metrics
-- (WORKBENCH-API §26.1–§26.4, COLLAB-MODEL §7.2).
--
-- Two families:
--
--   * the queue — pending rows per ledger, newest first, each flattened to the
--     projection a reviewer needs (which ledger, what it is about, the money when
--     the ledger has any, the version counter). The four queries share one column
--     list so the handler can merge them into a single ordered page.
--   * the three `(agent_id, domain)` slices. They are aggregates over
--     `activity_log`, not over the ledgers, because that is where "a human changed
--     what an agent wrote" is recorded — including the `overwrite_reason` that
--     makes the ratio mean something (§26.3). Every one of them returns the
--     numerator and the denominator separately: the server computes the ratio, but
--     the sample count has to reach the client so a 1-of-2 cell is not read as a
--     verdict.

-- name: ListPendingCrmCollabs :many
SELECT cc.id,
       cc.workspace_id,
       cc.review_state,
       cc.created_at,
       cc.updated_at,
       cc.revision,
       cc.assignee_type,
       cc.assignee_id,
       c.display_name AS label,
       cc.stage AS detail,
       coalesce(cc.final_amount, cc.quote_amount)::numeric AS amount,
       cc.currency
FROM crm_collab cc
JOIN creator c ON c.id = cc.creator_id
WHERE cc.workspace_id = sqlc.arg('workspace_id')::uuid
  AND cc.review_state = 'pending'
  AND cc.archived_at IS NULL
ORDER BY cc.updated_at DESC, cc.id DESC
LIMIT sqlc.arg('limit')::integer;

-- name: ListPendingCreatorQuotes :many
SELECT q.id,
       q.workspace_id,
       q.review_state,
       q.created_at,
       q.updated_at,
       q.revision,
       q.assignee_type,
       q.assignee_id,
       c.display_name AS label,
       q.status AS detail,
       q.fee_amount::numeric AS amount,
       q.currency
FROM creator_quote q
JOIN creator c ON c.id = q.creator_id
WHERE q.workspace_id = sqlc.arg('workspace_id')::uuid
  AND q.review_state = 'pending'
  AND q.archived_at IS NULL
ORDER BY q.updated_at DESC, q.id DESC
LIMIT sqlc.arg('limit')::integer;

-- name: ListPendingCreatorActivities :many
-- A follow-up carries no money, so `amount` is NULL and `currency` empty rather
-- than 0: "this ledger has no amount" is not "the amount is zero" (§26.4's
-- three-state rule applied to a column).
SELECT a.id,
       a.workspace_id,
       a.review_state,
       a.created_at,
       a.updated_at,
       a.revision,
       a.assignee_type,
       a.assignee_id,
       c.display_name AS label,
       a.kind AS detail,
       NULL::numeric AS amount,
       ''::text AS currency
FROM creator_activity a
JOIN creator c ON c.id = a.creator_id
WHERE a.workspace_id = sqlc.arg('workspace_id')::uuid
  AND a.review_state = 'pending'
  AND a.archived_at IS NULL
ORDER BY a.updated_at DESC, a.id DESC
LIMIT sqlc.arg('limit')::integer;

-- name: ListPendingCrmSettlements :many
SELECT s.id,
       s.workspace_id,
       s.review_state,
       s.created_at,
       s.updated_at,
       s.revision,
       s.assignee_type,
       s.assignee_id,
       c.display_name AS label,
       s.kind AS detail,
       s.amount::numeric AS amount,
       s.currency
FROM crm_settlement s
JOIN crm_collab cc ON cc.id = s.collab_id
JOIN creator c ON c.id = cc.creator_id
WHERE s.workspace_id = sqlc.arg('workspace_id')::uuid
  AND s.review_state = 'pending'
  AND s.archived_at IS NULL
ORDER BY s.updated_at DESC, s.id DESC
LIMIT sqlc.arg('limit')::integer;

-- name: SetCrmCollabReview :one
UPDATE crm_collab
SET review_state = sqlc.arg('review_state')::text,
    reviewed_by = sqlc.narg('reviewed_by')::uuid,
    reviewed_at = now(),
    revision = revision + 1,
    updated_at = now()
WHERE id = sqlc.arg('id') AND workspace_id = sqlc.arg('workspace_id')::uuid
  AND review_state = 'pending'
RETURNING *;

-- name: SetCreatorQuoteReview :one
UPDATE creator_quote
SET review_state = sqlc.arg('review_state')::text,
    reviewed_by = sqlc.narg('reviewed_by')::uuid,
    reviewed_at = now(),
    revision = revision + 1,
    updated_at = now()
WHERE id = sqlc.arg('id') AND workspace_id = sqlc.arg('workspace_id')::uuid
  AND review_state = 'pending'
RETURNING *;

-- name: SetCreatorActivityReview :one
UPDATE creator_activity
SET review_state = sqlc.arg('review_state')::text,
    reviewed_by = sqlc.narg('reviewed_by')::uuid,
    reviewed_at = now(),
    revision = revision + 1,
    updated_at = now()
WHERE id = sqlc.arg('id') AND workspace_id = sqlc.arg('workspace_id')::uuid
  AND review_state = 'pending'
RETURNING *;

-- name: SetCrmSettlementReview :one
UPDATE crm_settlement
SET review_state = sqlc.arg('review_state')::text,
    reviewed_by = sqlc.narg('reviewed_by')::uuid,
    reviewed_at = now(),
    revision = revision + 1,
    updated_at = now()
WHERE id = sqlc.arg('id') AND workspace_id = sqlc.arg('workspace_id')::uuid
  AND review_state = 'pending'
RETURNING *;

-- name: OverviewAgentOverwriteRate :many
-- `agent.write.overwrite_rate` (§26.4): of the rows an agent wrote in the window,
-- the share a human changed within 7 days *and labelled why*. The
-- `overwrite_reason` half is what separates "the agent was wrong" from "the person
-- prefers it the other way" (§26.3) — a change without a reason is not counted here.
WITH agent_writes AS (
    SELECT DISTINCT
           a.subject_type AS domain,
           a.subject_id,
           a.actor_id AS agent_id,
           a.created_at,
           a.details
    FROM activity_log a
    WHERE a.workspace_id = sqlc.arg('workspace_id')::uuid
      AND a.actor_type = 'agent'
      AND a.subject_type IN ('crm_collab', 'creator_quote', 'creator_activity', 'crm_settlement')
      AND a.created_at >= now() - interval '30 days'
      AND a.action NOT LIKE '%.review_%'
      AND a.action NOT LIKE '%.deleted'
)
SELECT w.domain,
       w.agent_id,
       count(*)::bigint AS samples,
       count(*) FILTER (
           WHERE EXISTS (
               SELECT 1
               FROM activity_log h
               WHERE h.workspace_id = sqlc.arg('workspace_id')::uuid
                 AND h.subject_type = w.domain
                 AND h.subject_id = w.subject_id
                 AND h.actor_type = 'member'
                 AND h.created_at > w.created_at
                 AND h.created_at <= w.created_at + interval '7 days'
                 AND h.details->>'overwrite_reason' IS NOT NULL
           )
       )::bigint AS hits
FROM agent_writes w
GROUP BY w.domain, w.agent_id
ORDER BY w.domain, w.agent_id;

-- name: OverviewAgentRejectRate :many
-- `agent.review.reject_rate` (§26.4): rejected / decided, per (agent, domain).
--
-- The slice's agent is `details.subject_agent_id` — the author of the row that was
-- reviewed, written into the decision event itself. Grouping by the reviewer would
-- answer "who is strict", which is not the question.
SELECT a.subject_type AS domain,
       (a.details->>'subject_agent_id')::text AS agent_id,
       count(*) FILTER (WHERE a.action LIKE '%.review_rejected')::bigint AS rejected,
       count(*)::bigint AS decided
FROM activity_log a
WHERE a.workspace_id = sqlc.arg('workspace_id')::uuid
  AND (a.action LIKE '%.review_accepted' OR a.action LIKE '%.review_rejected')
  AND a.details->>'subject_agent_id' IS NOT NULL
  AND a.created_at >= now() - interval '30 days'
GROUP BY a.subject_type, (a.details->>'subject_agent_id')::text
ORDER BY a.subject_type, 2;

-- name: OverviewAgentRollbackRate :many
-- `agent.action.rollback_rate` (§26.4): of the rows an agent wrote in the window,
-- the share a human later put *back* — every field that human wrote carries the
-- value the agent had replaced. A partial edit is an overwrite, not a rollback;
-- that is why the two rates are different numbers.
WITH agent_writes AS (
    SELECT DISTINCT
           a.subject_type AS domain,
           a.subject_id,
           a.actor_id AS agent_id,
           a.created_at,
           a.details
    FROM activity_log a
    WHERE a.workspace_id = sqlc.arg('workspace_id')::uuid
      AND a.actor_type = 'agent'
      AND a.subject_type IN ('crm_collab', 'creator_quote', 'creator_activity', 'crm_settlement')
      AND a.created_at >= now() - interval '30 days'
      AND a.action NOT LIKE '%.review_%'
      AND a.action NOT LIKE '%.deleted'
)
SELECT w.domain,
       w.agent_id,
       count(*)::bigint AS samples,
       count(*) FILTER (
           WHERE EXISTS (
               SELECT 1
               FROM activity_log h
               WHERE h.workspace_id = sqlc.arg('workspace_id')::uuid
                 AND h.subject_type = w.domain
                 AND h.subject_id = w.subject_id
                 AND h.actor_type = 'member'
                 AND h.created_at > w.created_at
                 AND h.created_at <= w.created_at + interval '7 days'
                 AND h.details->'after' IS NOT NULL
                 AND h.details->'after' <> '{}'::jsonb
                 AND NOT EXISTS (
                     SELECT 1
                     FROM jsonb_object_keys(h.details->'after') AS key(name)
                     WHERE (h.details->'after'->key.name) IS DISTINCT FROM (w.details->'before'->key.name)
                 )
           )
       )::bigint AS hits
FROM agent_writes w
GROUP BY w.domain, w.agent_id
ORDER BY w.domain, w.agent_id;
