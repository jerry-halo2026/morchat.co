-- The workbench's queue and anchor reads (docs/engineering/COLLAB-MODEL.md §4/§5,
-- batch B4-2 / B4-3). Three scans that turn a date into an inbox notice, and one
-- read that answers "how big is this ledger row's discussion".
--
-- Three properties every scan below shares, because they are the contract and not
-- a style choice:
--
--   * **One statement per source.** The scan is a bulk INSERT ... SELECT, so a
--     workspace with two hundred overdue follow-ups costs one round trip rather
--     than two hundred. There is no per-row read anywhere in this file.
--   * **Idempotent per day.** The `NOT EXISTS` guard matches on
--     `(subject_type, subject_id, type, 当日)`, read out of `details`, which is the
--     only place the subject lives — `inbox_item` has no subject columns. Running
--     the scan twice in one day inserts nothing the second time; tomorrow it
--     inserts again, because tomorrow the notice is still true and today's was
--     already read.
--   * **No assignee, no notice.** A row nobody was handed is not somebody's
--     reminder; the assignee pair is both the recipient and the reason the notice
--     exists. The pair is also checked against the workspace's members/agents, the
--     same eligibility `CreateInboxItem` enforces for a single insert.
--
-- The recipients may be agents: `inbox_item.recipient_type` accepts
-- `member|agent` and an agent assignee is notified exactly like a person
-- (COLLAB-MODEL §1/§4).

-- name: CreateDueFollowUpInboxItems :execrows
-- creator_activity.next_follow_at has passed. `archived_at IS NULL` keeps a
-- deleted follow-up quiet; `outcome` is deliberately not filtered — a follow-up
-- with a recorded outcome and a passing next date is still a call somebody owes.
INSERT INTO inbox_item (
    id, workspace_id, recipient_type, recipient_id, type, severity,
    title, body, actor_type, details, section
)
SELECT gen_random_uuid(),
       a.workspace_id,
       a.assignee_type,
       a.assignee_id,
       'workbench.followup_due',
       'action_required',
       'Follow-up due',
       'A follow-up scheduled for this creator was due on '
           || to_char(a.next_follow_at, 'YYYY-MM-DD') || '.',
       'system',
       jsonb_build_object(
           'subject_type', 'creator_activity',
           'subject_id', a.id::text,
           'route', '/sales/followups?followup=' || a.id::text
       ),
       'workbench'
FROM creator_activity a
WHERE a.archived_at IS NULL
  AND a.next_follow_at IS NOT NULL
  AND a.next_follow_at <= now()
  AND a.assignee_type IS NOT NULL
  AND a.assignee_id IS NOT NULL
  AND (
      (a.assignee_type = 'member' AND EXISTS (
          SELECT 1 FROM member m
          WHERE m.workspace_id = a.workspace_id AND m.user_id = a.assignee_id
      ))
      OR (a.assignee_type = 'agent' AND EXISTS (
          SELECT 1 FROM agent ag
          WHERE ag.workspace_id = a.workspace_id AND ag.id = a.assignee_id
      ))
  )
  AND NOT EXISTS (
      SELECT 1 FROM inbox_item existing
      WHERE existing.workspace_id = a.workspace_id
        AND existing.type = 'workbench.followup_due'
        AND existing.details->>'subject_type' = 'creator_activity'
        AND existing.details->>'subject_id' = a.id::text
        AND existing.created_at >= date_trunc('day', now())
  );

-- name: CreateExpiringQuoteInboxItems :execrows
-- A quote whose `valid_until` falls inside the next seven days, and which is not
-- already decided. `draft`/`sent` are the two live statuses the quote ledger moves
-- through before a decision; an accepted, rejected or already-expired offer is
-- not a call to make.
INSERT INTO inbox_item (
    id, workspace_id, recipient_type, recipient_id, type, severity,
    title, body, actor_type, details, section
)
SELECT gen_random_uuid(),
       q.workspace_id,
       q.assignee_type,
       q.assignee_id,
       'workbench.quote_expiring',
       'action_required',
       'Quote expiring',
       'This quote is still open and expires on '
           || to_char(q.valid_until, 'YYYY-MM-DD') || '.',
       'system',
       jsonb_build_object(
           'subject_type', 'creator_quote',
           'subject_id', q.id::text,
           'route', '/sales/quotes?quote=' || q.id::text
       ),
       'workbench'
FROM creator_quote q
WHERE q.archived_at IS NULL
  AND q.valid_until IS NOT NULL
  AND q.status IN ('draft', 'sent')
  AND q.valid_until <= (now() + interval '7 days')
  AND q.assignee_type IS NOT NULL
  AND q.assignee_id IS NOT NULL
  AND (
      (q.assignee_type = 'member' AND EXISTS (
          SELECT 1 FROM member m
          WHERE m.workspace_id = q.workspace_id AND m.user_id = q.assignee_id
      ))
      OR (q.assignee_type = 'agent' AND EXISTS (
          SELECT 1 FROM agent ag
          WHERE ag.workspace_id = q.workspace_id AND ag.id = q.assignee_id
      ))
  )
  AND NOT EXISTS (
      SELECT 1 FROM inbox_item existing
      WHERE existing.workspace_id = q.workspace_id
        AND existing.type = 'workbench.quote_expiring'
        AND existing.details->>'subject_type' = 'creator_quote'
        AND existing.details->>'subject_id' = q.id::text
        AND existing.created_at >= date_trunc('day', now())
  );

-- name: CreateOverdueSettlementInboxItems :execrows
-- A collaboration whose `settled_on` day has passed while its stage has not
-- reached `settled` (or been dropped as `cancelled`). The row is the promise to
-- pay; the stage says whether the promise was kept.
INSERT INTO inbox_item (
    id, workspace_id, recipient_type, recipient_id, type, severity,
    title, body, actor_type, details, section
)
SELECT gen_random_uuid(),
       c.workspace_id,
       c.assignee_type,
       c.assignee_id,
       'workbench.settlement_overdue',
       'action_required',
       'Settlement overdue',
       'This collaboration was due to settle on '
           || to_char(c.settled_on, 'YYYY-MM-DD') || ' and is still at '
           || c.stage || '.',
       'system',
       jsonb_build_object(
           'subject_type', 'crm_collab',
           'subject_id', c.id::text,
           'route', '/sales/collabs?collab=' || c.id::text
       ),
       'workbench'
FROM crm_collab c
WHERE c.archived_at IS NULL
  AND c.settled_on IS NOT NULL
  AND c.settled_on < current_date
  AND c.stage NOT IN ('settled', 'cancelled')
  AND c.assignee_type IS NOT NULL
  AND c.assignee_id IS NOT NULL
  AND (
      (c.assignee_type = 'member' AND EXISTS (
          SELECT 1 FROM member m
          WHERE m.workspace_id = c.workspace_id AND m.user_id = c.assignee_id
      ))
      OR (c.assignee_type = 'agent' AND EXISTS (
          SELECT 1 FROM agent ag
          WHERE ag.workspace_id = c.workspace_id AND ag.id = c.assignee_id
      ))
  )
  AND NOT EXISTS (
      SELECT 1 FROM inbox_item existing
      WHERE existing.workspace_id = c.workspace_id
        AND existing.type = 'workbench.settlement_overdue'
        AND existing.details->>'subject_type' = 'crm_collab'
        AND existing.details->>'subject_id' = c.id::text
        AND existing.created_at >= date_trunc('day', now())
  );

-- name: SetCrmCollabIssue :execrows
-- The one column a discussion thread writes back onto its ledger row
-- (COLLAB-MODEL §5). Guarded the same way every workbench write is: the row must
-- still be live, and the pointer may only move from empty to this issue, or be
-- rewritten with the same id (a retried thread open is a no-op, a second issue
-- cannot silently replace the first one's discussion).
UPDATE crm_collab
SET issue_id = sqlc.arg('issue_id')::uuid,
    revision = revision + 1,
    updated_at = now()
WHERE id = sqlc.arg('id')::uuid
  AND workspace_id = sqlc.arg('workspace_id')::uuid
  AND archived_at IS NULL
  AND (issue_id IS NULL OR issue_id = sqlc.arg('issue_id')::uuid);

-- name: ListIssuesByOrigin :many
-- The discussions a page of ledger rows already has, for the ledgers that carry no
-- pointer column (`creator_quote`): the issue is found by the pair it was stamped
-- with, in one statement. A row without a thread simply has no row here.
SELECT *
FROM issue
WHERE workspace_id = sqlc.arg('workspace_id')::uuid
  AND origin_type = sqlc.arg('origin_type')::text
  AND origin_id = ANY(sqlc.arg('origin_ids')::uuid[]);

-- name: ListWorkbenchThreadSummaries :many
-- 讨论 N · 最近一条 for a page of ledger rows in one read. The handler collects the
-- `issue_id`s the rows already hold, so this is one statement per list response,
-- never one per row.
--
-- `type = 'comment'` is the discussion: a status change or a progress update is
-- the issue's own history and would inflate a count the reader takes to mean
-- "people talked here". Deleted comments are out of both the count and the
-- preview for the same reason they are out of the thread.
--
-- There is no `issue.archived_at` in this schema: an issue leaves by being
-- hard-deleted (`DeleteIssue`), and the ledger row's `issue_id` then points
-- nowhere. That absence — the id is still stored, no row comes back — is the
-- "discussion is gone" state the client renders as 已归档; a row that is simply
-- closed answers normally with its `status`.
SELECT i.id AS issue_id,
       i.number,
       i.title,
       i.status,
       count(c.id)::int AS comment_count,
       max(c.created_at)::timestamptz AS last_comment_at,
       COALESCE((
           SELECT left(latest.content, 140)
           FROM comment latest
           WHERE latest.issue_id = i.id
             AND latest.type = 'comment'
             AND latest.deleted_at IS NULL
           ORDER BY latest.created_at DESC, latest.id DESC
           LIMIT 1
       ), '')::text AS last_comment_preview
FROM issue i
LEFT JOIN comment c
       ON c.issue_id = i.id
      AND c.type = 'comment'
      AND c.deleted_at IS NULL
WHERE i.workspace_id = sqlc.arg('workspace_id')::uuid
  AND i.id = ANY(sqlc.arg('issue_ids')::uuid[])
GROUP BY i.id;
