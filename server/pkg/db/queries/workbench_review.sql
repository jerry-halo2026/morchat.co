-- 复核闸门 reads and the three verifiability metrics
-- (WORKBENCH-API §26.1–§26.4, COLLAB-MODEL §7.2).
--
-- Two families:
--
--   * the queue — pending rows across the four ledgers, newest first, each
--     flattened to the projection a reviewer needs (which ledger, what it is
--     about, who wrote it, which business fields the write touched, the money
--     when the ledger has any, the version counter). One statement, not four:
--     the reviewer's screen is one page, and four reads that are then merged in
--     Go are four round trips for one answer.
--   * the three `(agent_id, domain)` slices. They are aggregates over
--     `activity_log`, not over the ledgers, because that is where "a human changed
--     what an agent wrote" is recorded — including the `overwrite_reason` that
--     makes the ratio mean something (§26.3). Every one of them returns the
--     numerator and the denominator separately: the server computes the ratio, but
--     the sample count has to reach the client so a 1-of-2 cell is not read as a
--     verdict.

-- name: ListPendingReviewRows :many
-- The queue's projection: the pending rows of all four ledgers in one read
-- (§26.1). `domain` is the wire name, `subject_type` the trail's name for the
-- same ledger, so the caller never has to translate one into the other.
--
-- The last part of the statement is the part that makes the queue readable:
-- "who wrote this, and what did they touch" is answered by the newest business
-- `activity_log` event about the row, read with a LATERAL join. LATERAL and not a
-- Go-side lookup: a fifty-row page would otherwise cost fifty round trips for an
-- annotation that the index `idx_activity_log_subject`
-- (workspace_id, subject_type, subject_id, created_at DESC) answers in one.
-- Review decisions are excluded — `%.review_%` is a verdict on a write, not a
-- write, and a row can be written again after one.
--
-- The actor resolves through the two tables a writer can live in: an agent's own
-- name (`agent.name`; `agent_runtime` is the machine it runs on, not its name) or
-- a member's user name — a member actor id is a `user` id (see `workbenchActor`),
-- not a `member` row id.
--
-- `changed_fields` is the key set of `details.after` in the ledger's own
-- vocabulary. `{}` means the server cannot say what moved (an event with no
-- `after`, a row written before the trail existed), which the client renders as
-- "not recorded" — a different statement from "nothing moved".
--
-- A follow-up carries no money: `amount` NULL and the default currency, because
-- "this ledger has no amount" is not "the amount is zero" (§26.4's three-state
-- rule applied to a column).
WITH pending AS (
    SELECT 'collabs'::text AS domain,
           'crm_collab'::text AS subject_type,
           cc.workspace_id,
           cc.id,
           cc.review_state,
           cc.created_at,
           cc.updated_at,
           cc.revision,
           cc.assignee_type,
           cc.assignee_id,
           c.display_name::text AS label,
           cc.stage::text AS detail,
           coalesce(cc.final_amount, cc.quote_amount)::numeric AS amount,
           cc.currency::text AS currency
    FROM crm_collab cc
    JOIN creator c ON c.id = cc.creator_id
    WHERE cc.workspace_id = sqlc.arg('workspace_id')::uuid
      AND cc.review_state = 'pending'
      AND cc.archived_at IS NULL
    UNION ALL
    SELECT 'quotes'::text,
           'creator_quote'::text,
           q.workspace_id,
           q.id,
           q.review_state,
           q.created_at,
           q.updated_at,
           q.revision,
           q.assignee_type,
           q.assignee_id,
           c.display_name::text,
           q.status::text,
           q.fee_amount::numeric,
           q.currency::text
    FROM creator_quote q
    JOIN creator c ON c.id = q.creator_id
    WHERE q.workspace_id = sqlc.arg('workspace_id')::uuid
      AND q.review_state = 'pending'
      AND q.archived_at IS NULL
    UNION ALL
    SELECT 'activities'::text,
           'creator_activity'::text,
           a.workspace_id,
           a.id,
           a.review_state,
           a.created_at,
           a.updated_at,
           a.revision,
           a.assignee_type,
           a.assignee_id,
           c.display_name::text,
           a.kind::text,
           NULL::numeric,
           'CNY'::text
    FROM creator_activity a
    JOIN creator c ON c.id = a.creator_id
    WHERE a.workspace_id = sqlc.arg('workspace_id')::uuid
      AND a.review_state = 'pending'
      AND a.archived_at IS NULL
    UNION ALL
    SELECT 'settlements'::text,
           'crm_settlement'::text,
           s.workspace_id,
           s.id,
           s.review_state,
           s.created_at,
           s.updated_at,
           s.revision,
           s.assignee_type,
           s.assignee_id,
           c.display_name::text,
           s.kind::text,
           s.amount::numeric,
           s.currency::text
    FROM crm_settlement s
    JOIN crm_collab cc ON cc.id = s.collab_id
    JOIN creator c ON c.id = cc.creator_id
    WHERE s.workspace_id = sqlc.arg('workspace_id')::uuid
      AND s.review_state = 'pending'
      AND s.archived_at IS NULL
)
SELECT p.domain,
       p.id,
       p.review_state,
       p.created_at,
       p.updated_at,
       p.revision,
       p.assignee_type,
       p.assignee_id,
       p.label,
       p.detail,
       p.amount,
       p.currency,
       coalesce(last_activity.actor_type, '')::text AS actor_type,
       last_activity.actor_id,
       writer_agent.name AS agent_name,
       writer_member.name AS actor_name,
       coalesce(
           (SELECT array_agg(changed.field ORDER BY changed.field)
            FROM jsonb_object_keys(last_activity.details -> 'after') AS changed(field)),
           '{}'::text[]
       )::text[] AS changed_fields
FROM pending p
LEFT JOIN LATERAL (
    SELECT al.actor_type, al.actor_id, al.details
    FROM activity_log al
    WHERE al.workspace_id = p.workspace_id
      AND al.subject_type = p.subject_type
      AND al.subject_id = p.id
      AND al.action NOT LIKE '%.review_%'
    ORDER BY al.created_at DESC, al.id DESC
    LIMIT 1
) last_activity ON TRUE
LEFT JOIN agent writer_agent
       ON last_activity.actor_type = 'agent'
      AND writer_agent.id = last_activity.actor_id
LEFT JOIN "user" writer_member
       ON last_activity.actor_type = 'member'
      AND writer_member.id = last_activity.actor_id
WHERE (sqlc.narg('domain')::text IS NULL OR p.domain = sqlc.narg('domain')::text)
ORDER BY p.updated_at DESC, p.id DESC
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
