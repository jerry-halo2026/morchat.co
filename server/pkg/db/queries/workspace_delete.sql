-- Workspace deletion is application-owned. These statements form a fixed,
-- bottom-up deletion plan; the legacy foreign keys remain only as a
-- compatibility safety net during the expand phase.

-- name: SetWorkspaceTeardownMode :exec
-- The setting is transaction-local. Migration 242 makes only the three DELETE
-- dirty triggers skip their per-row work while this flag is on.
SELECT set_config('multica.workspace_teardown', 'on', true);

-- name: LockTaskUsageRollupForWorkspaceDelete :exec
-- Advisory lock 4246 is the hourly rollup family's key: the rollup function
-- takes it per transaction (migration 272) and the backfill commands take it
-- per session. An in-flight rollup finishes first, then no new rollup can
-- write the workspace's aggregates until this delete commits. The caller
-- bounds this wait with SET LOCAL lock_timeout — batch jobs hold 4246 for
-- minutes, and an unbounded wait here hangs the delete request (MUL-5983).
SELECT pg_advisory_xact_lock(4246);

-- name: LockWorkspaceTaskOwnerAgents :exec
-- The three LockWorkspaceTaskOwner* statements are a write fence, not a lookup —
-- they deliberately return nothing, so a workspace with a huge owner set costs
-- the API process no memory at all.
--
-- agent_task_queue has no workspace_id, so a task becomes this workspace's
-- problem through agent_id, issue_id or runtime_id — and inserting such a task
-- requires FOR KEY SHARE on the referenced owner row, which conflicts with
-- FOR UPDATE. Holding these locks for the rest of the teardown transaction
-- therefore blocks any enqueue (or reassignment) that would add a task to this
-- workspace after we have swept it, which row locks on the tasks alone cannot
-- do. Same technique the handler already uses on the workspace row to keep
-- CreateChatSession out of the delete window.
--
-- This fence is defence in depth, not the only guarantee: deleteWorkspaceTasks
-- re-verifies every owner after sweeping it and fails closed if tasks keep
-- appearing, so teardown does not silently leak rows even if the fence is ever
-- weakened (for example by removing the legacy FKs this one leans on).
SELECT 1 FROM agent WHERE agent.workspace_id = $1 FOR UPDATE;

-- name: LockWorkspaceTaskOwnerIssues :exec
SELECT 1 FROM issue WHERE issue.workspace_id = $1 FOR UPDATE;

-- name: LockWorkspaceTaskOwnerRuntimes :exec
SELECT 1 FROM agent_runtime WHERE agent_runtime.workspace_id = $1 FOR UPDATE;

-- name: ListWorkspaceAgentIDFirstPage :many
-- First page of the same walk. Split from the keyset query rather than seeded
-- with the all-zero uuid, because that value is itself a valid uuid: a row whose
-- id happened to be all zeros would be skipped forever by `id > $2`.
SELECT id FROM agent
WHERE agent.workspace_id = $1
ORDER BY id
LIMIT $2;

-- name: ListWorkspaceAgentIDPage :many
-- Owner enumeration in bounded, keyset-paged chunks. The rows are already locked
-- by LockWorkspaceTaskOwnerAgents above; this only walks them.
--
-- Keyset on id, not on a natural key: the cursor column must be immutable, and
-- renaming an agent mid-teardown would otherwise let it sort behind the cursor
-- and escape the sweep. Uses idx_agent_workspace_id_keyset (migration 281), which
-- exists so this page does not sort the whole owner set.
SELECT id FROM agent
WHERE agent.workspace_id = $1 AND id > $2
ORDER BY id
LIMIT $3;

-- name: ListWorkspaceIssueIDFirstPage :many
-- First page of the same walk. Split from the keyset query rather than seeded
-- with the all-zero uuid, because that value is itself a valid uuid: a row whose
-- id happened to be all zeros would be skipped forever by `id > $2`.
SELECT id FROM issue
WHERE issue.workspace_id = $1
ORDER BY id
LIMIT $2;

-- name: ListWorkspaceIssueIDPage :many
-- Uses idx_issue_workspace_id_keyset (migration 282).
SELECT id FROM issue
WHERE issue.workspace_id = $1 AND id > $2
ORDER BY id
LIMIT $3;

-- name: ListWorkspaceRuntimeIDFirstPage :many
-- First page of the same walk. Split from the keyset query rather than seeded
-- with the all-zero uuid, because that value is itself a valid uuid: a row whose
-- id happened to be all zeros would be skipped forever by `id > $2`.
SELECT id FROM agent_runtime
WHERE agent_runtime.workspace_id = $1
ORDER BY id
LIMIT $2;

-- name: ListWorkspaceRuntimeIDPage :many
-- Uses idx_agent_runtime_workspace_id_keyset (migration 283).
SELECT id FROM agent_runtime
WHERE agent_runtime.workspace_id = $1 AND id > $2
ORDER BY id
LIMIT $3;

-- name: ListTaskIDsByAgentFirstPage :many
-- First page of the same walk; see ListWorkspaceAgentIDFirstPage for why this is
-- a separate query rather than a zero-uuid cursor, and ListTaskIDsByAgentPage for
-- the single-key / keyset / FOR UPDATE rationale.
SELECT id FROM agent_task_queue
WHERE agent_id = $1
ORDER BY id
LIMIT $2
FOR UPDATE;

-- name: ListTaskIDsByAgentPage :many
-- One owner key per call, one keyset-paged chunk per call.
--
-- Single-key equality is deliberate. All three ownership paths must stay (nothing
-- enforces that a task's agent/runtime/issue share a workspace), but expressing
-- them as `OR agent_id IN (subquery) OR …` — or as a UNION of joins, or as
-- `= ANY($1::uuid[])` over a whole workspace's agents — makes the planner
-- estimate a proportional share of the global table and fall back to a Seq Scan
-- on agent_task_queue. A single-key equality is the only form whose row estimate
-- stays small enough to be index-driven regardless of how the workspace's tasks
-- are distributed (MUL-5999).
--
-- `id > $2 ORDER BY id LIMIT $3` against idx_agent_task_queue_agent_id_keyset
-- (migration 278) bounds the SCAN, not just the result: each page is an index
-- range scan that starts where the previous one stopped. Bounding only the result
-- — `ORDER BY id LIMIT n` against the (agent_id, status) index — puts a Sort over
-- the agent's entire task set in front of every page, so a busy agent costs
-- roughly O(N² / page) for the sweep.
--
-- FOR UPDATE is load-bearing for correctness, not throughput. It locks the rows
-- this page is about to delete, and under READ COMMITTED PostgreSQL re-checks the
-- WHERE clause after acquiring each lock: a task a concurrent committed UPDATE
-- has already moved to another owner no longer matches and is skipped, and one we
-- did lock cannot be moved away before we delete it.
SELECT id FROM agent_task_queue
WHERE agent_id = $1 AND id > $2
ORDER BY id
LIMIT $3
FOR UPDATE;

-- name: ListTaskIDsByIssueFirstPage :many
-- First page of the same walk; see ListWorkspaceAgentIDFirstPage for why this is
-- a separate query rather than a zero-uuid cursor, and ListTaskIDsByAgentPage for
-- the single-key / keyset / FOR UPDATE rationale.
SELECT id FROM agent_task_queue
WHERE issue_id = $1
ORDER BY id
LIMIT $2
FOR UPDATE;

-- name: ListTaskIDsByIssuePage :many
-- Uses idx_agent_task_queue_issue_id_keyset (migration 279). See
-- ListTaskIDsByAgentPage for the single-key / keyset / FOR UPDATE rationale.
SELECT id FROM agent_task_queue
WHERE issue_id = $1 AND id > $2
ORDER BY id
LIMIT $3
FOR UPDATE;

-- name: ListTaskIDsByRuntimeFirstPage :many
-- First page of the same walk; see ListWorkspaceAgentIDFirstPage for why this is
-- a separate query rather than a zero-uuid cursor, and ListTaskIDsByAgentPage for
-- the single-key / keyset / FOR UPDATE rationale.
SELECT id FROM agent_task_queue
WHERE runtime_id = $1
ORDER BY id
LIMIT $2
FOR UPDATE;

-- name: ListTaskIDsByRuntimePage :many
-- Uses idx_agent_task_queue_runtime_id (migration 273, (runtime_id, id)); before
-- it every runtime_id index was partial, so this path had none at all. See
-- ListTaskIDsByAgentPage for the single-key / keyset / FOR UPDATE rationale.
SELECT id FROM agent_task_queue
WHERE runtime_id = $1 AND id > $2
ORDER BY id
LIMIT $3
FOR UPDATE;

-- name: DetachTaskBatchReferences :exec
-- Break inbound references to a task batch before deleting it, in the
-- application layer rather than through the FKs' ON DELETE SET NULL. Both
-- referencing columns are indexed (idx_agent_task_queue_parent from migration
-- 055, idx_autopilot_run_task_id from migration 277) so this stays a per-batch
-- index scan instead of the per-row full scan the FK action would do.
--
-- Kept separate from DeleteTaskBatch: a task can be both a member of the batch
-- and the parent of another member, and updating plus deleting the same row
-- inside one statement is not well defined.
WITH detached_runs AS (
    UPDATE autopilot_run
    SET task_id = NULL
    WHERE task_id = ANY(@task_ids::uuid[])
)
UPDATE agent_task_queue
SET parent_task_id = NULL
WHERE parent_task_id = ANY(@task_ids::uuid[]);

-- name: DeleteTaskBatch :exec
-- Deletes one bounded batch of tasks together with everything that hangs off
-- them, every arm keyed by task_id against an existing index, then the task rows
-- by primary key. The legacy FK cascades stay a safety net only: this statement
-- is what actually removes the rows, so teardown keeps working when they go.
WITH
batch AS MATERIALIZED (
    SELECT id FROM unnest(@task_ids::uuid[]) AS t(id)
),
deleted_task_usage AS (
    DELETE FROM task_usage WHERE task_id IN (SELECT id FROM batch)
),
deleted_task_messages AS (
    DELETE FROM task_message WHERE task_id IN (SELECT id FROM batch)
),
deleted_task_tokens AS (
    DELETE FROM task_token WHERE task_id IN (SELECT id FROM batch)
),
deleted_task_supplements AS (
    DELETE FROM task_supplement WHERE task_id IN (SELECT id FROM batch)
),
deleted_task_supplement_capabilities AS (
    DELETE FROM task_supplement_capability WHERE task_id IN (SELECT id FROM batch)
),
deleted_channel_outbound_cards AS (
    DELETE FROM channel_outbound_card_message WHERE task_id IN (SELECT id FROM batch)
),
deleted_lark_outbound_cards AS (
    DELETE FROM lark_outbound_card_message WHERE task_id IN (SELECT id FROM batch)
),
deleted_channel_task_deliveries AS (
    DELETE FROM channel_task_delivery WHERE task_id IN (SELECT id FROM batch)
),
deleted_draft_restores AS (
    DELETE FROM chat_draft_restore WHERE task_id IN (SELECT id FROM batch)
)
DELETE FROM agent_task_queue WHERE id IN (SELECT id FROM batch);

-- name: DeleteTaskTokensByAgent :exec
-- The third explicit task_token path. workspace_id (in DeleteWorkspaceLeafData)
-- and task_id (in DeleteTaskBatch) do not cover a token whose own workspace_id
-- points at a neighbour while its agent lives here, and teardown must not fall
-- back on the agent_id cascade for it. Uses idx_task_token_agent_id
-- (migration 275); one agent key per call for the same planner reason as
-- ListTaskIDsByAgentBatch.
DELETE FROM task_token WHERE agent_id = $1;

-- name: PrepareWorkspaceDeletionLinks :exec
-- Break self-references and the task/run cycle explicitly before deleting
-- either side. This keeps their ordering in the application-owned graph
-- instead of relying on ON DELETE SET NULL actions.
--
-- The task half of this step now lives in DetachTaskBatchReferences, which runs
-- once per bounded batch instead of once for a whole workspace's task set.
WITH
detached_comments AS (
    UPDATE comment
    SET parent_id = NULL
    WHERE comment.workspace_id = $1
      AND parent_id IS NOT NULL
),
detached_issues AS (
    UPDATE issue
    SET parent_issue_id = NULL
    WHERE issue.workspace_id = $1
      AND parent_issue_id IS NOT NULL
)
UPDATE webhook_delivery
SET replayed_from_delivery_id = NULL
WHERE webhook_delivery.workspace_id = $1
  AND replayed_from_delivery_id IS NOT NULL;

-- name: DeleteWorkspaceLeafData :exec
-- Everything task-keyed moved to DeleteTaskBatch, which runs in bounded batches
-- before this step; what is left is keyed by the workspace or by one of the
-- workspace-scoped id sets below.
WITH
ws_agents AS MATERIALIZED (
    SELECT id FROM agent WHERE workspace_id = $1
),
ws_issues AS MATERIALIZED (
    SELECT id FROM issue WHERE workspace_id = $1
),
ws_labels AS MATERIALIZED (
    SELECT id FROM issue_label WHERE workspace_id = $1
),
ws_skills AS MATERIALIZED (
    SELECT id FROM skill WHERE workspace_id = $1
),
ws_squads AS MATERIALIZED (
    SELECT id FROM squad WHERE workspace_id = $1
),
ws_sessions AS MATERIALIZED (
    SELECT id FROM chat_session WHERE workspace_id = $1
),
ws_autopilots AS MATERIALIZED (
    SELECT id FROM autopilot WHERE workspace_id = $1
),
ws_github_prs AS MATERIALIZED (
    SELECT id FROM github_pull_request WHERE workspace_id = $1
),
ws_vcs_prs AS MATERIALIZED (
    SELECT id FROM vcs_pull_request WHERE workspace_id = $1
),
ws_vcs_connections AS MATERIALIZED (
    SELECT id FROM vcs_connection WHERE workspace_id = $1
),
ws_channel_installations AS MATERIALIZED (
    SELECT id FROM channel_installation WHERE workspace_id = $1
),
ws_lark_installations AS MATERIALIZED (
    SELECT id FROM lark_installation WHERE workspace_id = $1
),
-- One of three explicit task_token paths. This is the workspace-keyed one;
-- DeleteTaskBatch covers task_id and DeleteTaskTokensByAgent covers agent_id, so
-- a token whose workspace_id points at a neighbour while its task or agent lives
-- here is still removed by this teardown rather than by the FK cascade. The
-- former single statement combined all three with OR, which cost a full scan of
-- task_token (MUL-5999); split, each path is an index scan.
deleted_task_tokens AS (
    DELETE FROM task_token
    WHERE workspace_id = $1
),
deleted_orphan_task_supplements AS (
    DELETE FROM task_supplement WHERE workspace_id = $1
),
deleted_orphan_task_supplement_capabilities AS (
    DELETE FROM task_supplement_capability WHERE workspace_id = $1
),
deleted_hourly_dirty AS (
    DELETE FROM task_usage_hourly_dirty WHERE workspace_id = $1
),
deleted_hourly AS (
    DELETE FROM task_usage_hourly WHERE workspace_id = $1
),
deleted_attachments AS (
    DELETE FROM attachment WHERE workspace_id = $1
),
deleted_channel_outbound_cards AS (
    DELETE FROM channel_outbound_card_message
    WHERE chat_session_id IN (SELECT id FROM ws_sessions)
),
deleted_lark_outbound_cards AS (
    DELETE FROM lark_outbound_card_message
    WHERE chat_session_id IN (SELECT id FROM ws_sessions)
),
deleted_draft_restores AS (
    DELETE FROM chat_draft_restore
    WHERE chat_session_id IN (SELECT id FROM ws_sessions)
),
-- Same no-FK chore as chat_draft_restore above. Matched on workspace_id rather
-- than the session set because that column exists precisely so this statement
-- does not have to join through chat_session, which it deletes in this same CTE.
deleted_agent_builder_drafts AS (
    DELETE FROM agent_builder_draft WHERE workspace_id = $1
),
deleted_comment_reactions AS (
    DELETE FROM comment_reaction WHERE workspace_id = $1
),
deleted_issue_reactions AS (
    DELETE FROM issue_reaction WHERE workspace_id = $1
),
deleted_activity AS (
    DELETE FROM activity_log WHERE workspace_id = $1
),
deleted_inbox AS (
    DELETE FROM inbox_item WHERE workspace_id = $1
),
deleted_issue_dependencies AS (
    DELETE FROM issue_dependency
    WHERE issue_id IN (SELECT id FROM ws_issues)
       OR depends_on_issue_id IN (SELECT id FROM ws_issues)
),
deleted_issue_subscribers AS (
    DELETE FROM issue_subscriber
    WHERE issue_id IN (SELECT id FROM ws_issues)
),
deleted_issue_labels AS (
    DELETE FROM issue_to_label
    WHERE issue_id IN (SELECT id FROM ws_issues)
       OR label_id IN (SELECT id FROM ws_labels)
),
deleted_agent_labels AS (
    DELETE FROM agent_to_label
    WHERE agent_id IN (SELECT id FROM ws_agents)
       OR label_id IN (SELECT id FROM ws_labels)
),
deleted_skill_labels AS (
    DELETE FROM skill_to_label
    WHERE skill_id IN (SELECT id FROM ws_skills)
       OR label_id IN (SELECT id FROM ws_labels)
),
deleted_issue_github_links AS (
    DELETE FROM issue_pull_request
    WHERE issue_id IN (SELECT id FROM ws_issues)
       OR pull_request_id IN (SELECT id FROM ws_github_prs)
),
deleted_issue_vcs_links AS (
    DELETE FROM issue_vcs_pull_request
    WHERE issue_id IN (SELECT id FROM ws_issues)
       OR pull_request_id IN (SELECT id FROM ws_vcs_prs)
),
deleted_issue_pr_automation AS (
    DELETE FROM issue_pr_automation WHERE workspace_id = $1
),
deleted_issue_pr_exclusions AS (
    DELETE FROM issue_pull_request_exclusion WHERE workspace_id = $1
),
deleted_agent_invocation_targets AS (
    DELETE FROM agent_invocation_target
    WHERE agent_id IN (SELECT id FROM ws_agents)
),
deleted_agent_skills AS (
    DELETE FROM agent_skill
    WHERE agent_id IN (SELECT id FROM ws_agents)
       OR skill_id IN (SELECT id FROM ws_skills)
),
deleted_skill_files AS (
    DELETE FROM skill_file
    WHERE skill_id IN (SELECT id FROM ws_skills)
),
deleted_daemon_connections AS (
    DELETE FROM daemon_connection
    WHERE agent_id IN (SELECT id FROM ws_agents)
),
deleted_squad_members AS (
    DELETE FROM squad_member
    WHERE squad_id IN (SELECT id FROM ws_squads)
),
deleted_project_resources AS (
    DELETE FROM project_resource WHERE workspace_id = $1
),
deleted_autopilot_collaborators AS (
    DELETE FROM autopilot_collaborator
    WHERE autopilot_id IN (SELECT id FROM ws_autopilots)
),
deleted_autopilot_subscribers AS (
    DELETE FROM autopilot_subscriber
    WHERE autopilot_id IN (SELECT id FROM ws_autopilots)
),
deleted_webhook_deliveries AS (
    DELETE FROM webhook_delivery WHERE workspace_id = $1
),
deleted_github_check_runs AS (
    DELETE FROM github_pull_request_check_run
    WHERE pr_id IN (SELECT id FROM ws_github_prs)
),
deleted_github_check_suites AS (
    DELETE FROM github_pull_request_check_suite
    WHERE pr_id IN (SELECT id FROM ws_github_prs)
),
deleted_pending_github_suites AS (
    DELETE FROM github_pending_check_suite WHERE workspace_id = $1
),
deleted_channel_task_deliveries AS (
    DELETE FROM channel_task_delivery
    WHERE installation_id IN (SELECT id FROM ws_channel_installations)
),
deleted_channel_outbound_messages AS (
    DELETE FROM channel_outbound_message
    WHERE installation_id IN (SELECT id FROM ws_channel_installations)
),
deleted_channel_reply_deliveries AS (
    DELETE FROM channel_reply_delivery
    WHERE installation_id IN (SELECT id FROM ws_channel_installations)
),
deleted_channel_chat_contexts AS (
    DELETE FROM channel_chat_context_generation
    WHERE chat_session_id IN (SELECT id FROM ws_sessions)
),
deleted_vcs_commit_statuses AS (
    DELETE FROM vcs_commit_status
    WHERE connection_id IN (SELECT id FROM ws_vcs_connections)
),
deleted_channel_chat_bindings AS (
    DELETE FROM channel_chat_session_binding
    WHERE installation_id IN (SELECT id FROM ws_channel_installations)
       OR chat_session_id IN (SELECT id FROM ws_sessions)
),
deleted_dingtalk_group_routes AS (
    DELETE FROM dingtalk_group_route WHERE workspace_id = $1
),
deleted_channel_inbound_dedup AS (
    DELETE FROM channel_inbound_message_dedup
    WHERE installation_id IN (SELECT id FROM ws_channel_installations)
),
deleted_channel_inbound_audit AS (
    DELETE FROM channel_inbound_audit
    WHERE installation_id IN (SELECT id FROM ws_channel_installations)
),
deleted_channel_user_bindings AS (
    DELETE FROM channel_user_binding WHERE workspace_id = $1
),
deleted_channel_binding_tokens AS (
    DELETE FROM channel_binding_token WHERE workspace_id = $1
),
deleted_wecom_install_sessions AS (
    DELETE FROM wecom_install_session WHERE workspace_id = $1
),
deleted_workspace_composio_connections AS (
    DELETE FROM workspace_composio_connection WHERE workspace_id = $1
),
deleted_agent_apps AS (
    DELETE FROM agent_app WHERE workspace_id = $1
),
deleted_app_action_rules AS (
    DELETE FROM app_action_rule WHERE workspace_id = $1
),
deleted_app_action_requests AS (
    DELETE FROM app_action_request WHERE workspace_id = $1
),
deleted_app_tool_calls AS (
    DELETE FROM app_tool_call WHERE workspace_id = $1
),
deleted_issue_environments AS (
    DELETE FROM issue_environment WHERE workspace_id = $1
),
deleted_workspace_app_settings AS (
    DELETE FROM workspace_app_setting WHERE workspace_id = $1
),
deleted_app_tool_class_overrides AS (
    DELETE FROM app_tool_class_override WHERE workspace_id = $1
),
deleted_lark_chat_bindings AS (
    DELETE FROM lark_chat_session_binding
    WHERE installation_id IN (SELECT id FROM ws_lark_installations)
       OR chat_session_id IN (SELECT id FROM ws_sessions)
),
deleted_lark_inbound_dedup AS (
    DELETE FROM lark_inbound_message_dedup
    WHERE installation_id IN (SELECT id FROM ws_lark_installations)
),
deleted_lark_inbound_audit AS (
    DELETE FROM lark_inbound_audit
    WHERE installation_id IN (SELECT id FROM ws_lark_installations)
),
deleted_lark_user_bindings AS (
    DELETE FROM lark_user_binding WHERE workspace_id = $1
),
deleted_lark_binding_tokens AS (
    DELETE FROM lark_binding_token WHERE workspace_id = $1
)
-- Keep the two-system cleanup ledger until object storage has been settled.
-- Moving every row out of pending also prevents a concurrent media bind from
-- attaching an object after the workspace teardown commits. The reconciler
-- performs the idempotent object delete and clears the row afterwards.
UPDATE channel_media_pending_object
SET state = CASE
        WHEN state = 'tombstoned' THEN 'tombstoned'
        ELSE 'deleting'
    END,
    lease_token = NULL,
    lease_expires_at = NULL,
    next_attempt_at = now(),
    last_error = NULL
WHERE channel_media_pending_object.workspace_id = $1;

-- name: DeleteWorkspaceChatMessages :exec
DELETE FROM chat_message
WHERE chat_session_id IN (
    SELECT id FROM chat_session WHERE chat_session.workspace_id = $1
);

-- name: DeleteWorkspaceCommunicationRoots :exec
WITH
deleted_sessions AS (
    DELETE FROM chat_session WHERE chat_session.workspace_id = $1
),
deleted_dingtalk_group_presence AS (
    DELETE FROM dingtalk_group_presence WHERE workspace_id = $1
),
deleted_dingtalk_bot_identity AS (
    DELETE FROM dingtalk_bot_identity WHERE workspace_id = $1
),
deleted_channel_installations AS (
    DELETE FROM channel_installation
    WHERE channel_installation.workspace_id = $1
)
DELETE FROM lark_installation WHERE lark_installation.workspace_id = $1;

-- name: DeleteWorkspaceComments :exec
DELETE FROM comment WHERE comment.workspace_id = $1;

-- name: DeleteWorkspaceIssueRoots :exec
WITH deleted_wakeup_receipts AS (
 DELETE FROM issue_wakeup_receipt WHERE wakeup_id IN (SELECT id FROM issue_wakeup WHERE workspace_id=$1)
), deleted_wakeups AS (
 DELETE FROM issue_wakeup WHERE workspace_id=$1
),
deleted_child_events AS (
 DELETE FROM issue_child_event WHERE workspace_id=$1
),
deleted_unread AS (
 DELETE FROM issue_unread WHERE workspace_id=$1
),
deleted_issues AS (
    DELETE FROM issue WHERE issue.workspace_id = $1
),
deleted_labels AS (
    DELETE FROM issue_label WHERE issue_label.workspace_id = $1
),
deleted_properties AS (
    DELETE FROM issue_property WHERE issue_property.workspace_id = $1
),
deleted_issue_views AS (
    DELETE FROM issue_view WHERE issue_view.workspace_id = $1
),
deleted_issue_view_preferences AS (
    DELETE FROM issue_view_preference
    WHERE issue_view_preference.workspace_id = $1
)
DELETE FROM quick_action WHERE quick_action.workspace_id = $1;

-- name: DeleteWorkspaceAutopilotRuns :exec
DELETE FROM autopilot_run
WHERE autopilot_id IN (
    SELECT id FROM autopilot WHERE autopilot.workspace_id = $1
);

-- name: DeleteWorkspaceAutopilotQuotaReservations :exec
DELETE FROM autopilot_quota_reservation
WHERE autopilot_quota_reservation.workspace_id = $1;

-- name: DeleteWorkspaceAutopilotQuotaPeriods :exec
DELETE FROM autopilot_quota_period
WHERE autopilot_quota_period.workspace_id = $1;

-- name: DeleteWorkspaceAutopilotChildren :exec
WITH
deleted_triggers AS (
    DELETE FROM autopilot_trigger
    WHERE autopilot_id IN (
        SELECT id FROM autopilot WHERE autopilot.workspace_id = $1
    )
)
DELETE FROM autopilot_rule_version
WHERE autopilot_rule_version.workspace_id = $1;

-- name: DeleteWorkspaceAutopilots :exec
DELETE FROM autopilot WHERE autopilot.workspace_id = $1;

-- name: DeleteWorkspacePullRequests :exec
WITH deleted_github_prs AS (
    DELETE FROM github_pull_request
    WHERE github_pull_request.workspace_id = $1
)
DELETE FROM vcs_pull_request WHERE vcs_pull_request.workspace_id = $1;

-- name: DeleteWorkspaceConnections :exec
WITH deleted_github_installations AS (
    DELETE FROM github_installation
    WHERE github_installation.workspace_id = $1
)
DELETE FROM vcs_connection WHERE vcs_connection.workspace_id = $1;

-- name: DeleteWorkspaceSquadsAndSkills :exec
WITH deleted_squads AS (
    DELETE FROM squad WHERE squad.workspace_id = $1
),
deleted_skill_versions AS (
    -- Keyed by skill_id so the delete uses idx_skill_version_skill_version.
    DELETE FROM skill_version
    WHERE skill_version.skill_id IN (SELECT skill.id FROM skill WHERE skill.workspace_id = $1)
)
DELETE FROM skill WHERE skill.workspace_id = $1;

-- name: DeleteWorkspacePluginData :exec
-- Plugin relationships have no foreign keys or cascades. Storage and secrets
-- hang off the installation, so both leaf tables are cleared through the
-- workspace's installation ids before the installations themselves.
WITH installations AS MATERIALIZED (
    SELECT plugin_installation.id
    FROM plugin_installation
    WHERE plugin_installation.workspace_id = $1
),
deleted_storage AS (
    DELETE FROM plugin_storage
    WHERE installation_id IN (SELECT id FROM installations)
),
deleted_secrets AS (
    DELETE FROM plugin_secret
    WHERE installation_id IN (SELECT id FROM installations)
),
deleted_hook_schedules AS (
    DELETE FROM plugin_hook_schedule
    WHERE installation_id IN (SELECT id FROM installations)
),
-- Hook call records are workspace-scoped in their own right, so this deletes by
-- workspace rather than through the installation ids: a row whose installation
-- was already uninstalled would otherwise survive the workspace it described.
deleted_invocations AS (
    DELETE FROM plugin_invocation
    WHERE workspace_id = $1
),
-- Published artifacts are workspace-scoped too, and independent of whether
-- anything installed them. Deleting the workspace without these would leave the
-- stored bundles as the largest orphan the plugin surface can produce.
versions AS MATERIALIZED (
    SELECT plugin_package_version.id
    FROM plugin_package_version
    WHERE plugin_package_version.workspace_id = $1
),
deleted_package_files AS (
    DELETE FROM plugin_package_file
    WHERE version_id IN (SELECT id FROM versions)
),
deleted_package_versions AS (
    DELETE FROM plugin_package_version
    WHERE workspace_id = $1
),
deleted_packages AS (
    DELETE FROM plugin_package
    WHERE workspace_id = $1
)
DELETE FROM plugin_installation WHERE id IN (SELECT id FROM installations);

-- name: DeleteWorkspaceAgents :exec
DELETE FROM agent WHERE agent.workspace_id = $1;

-- name: DeleteWorkspaceRuntimesAndProjects :exec
WITH
deleted_runtimes AS (
    DELETE FROM agent_runtime WHERE agent_runtime.workspace_id = $1
),
deleted_profiles AS (
    DELETE FROM runtime_profile WHERE runtime_profile.workspace_id = $1
),
deleted_project_members AS (
    DELETE FROM project_member WHERE project_member.workspace_id = $1
)
DELETE FROM project WHERE project.workspace_id = $1;

-- name: DeleteWorkspaceAdministration :exec
WITH
deleted_members AS (
    DELETE FROM member WHERE member.workspace_id = $1
),
deleted_notification_preferences AS (
    DELETE FROM notification_preference
    WHERE notification_preference.workspace_id = $1
),
deleted_pins AS (
    DELETE FROM pinned_item WHERE pinned_item.workspace_id = $1
),
deleted_daemon_tokens AS (
    DELETE FROM daemon_token WHERE daemon_token.workspace_id = $1
),
detached_feedback AS (
    UPDATE feedback
    SET workspace_id = NULL
    WHERE feedback.workspace_id = $1
),
detached_client_usage AS (
    UPDATE client_usage_daily
    SET workspace_id = NULL
    WHERE client_usage_daily.workspace_id = $1
),
deleted_share_links AS (
    DELETE FROM workspace_share_link
    WHERE workspace_share_link.workspace_id = $1
),
-- Departments are workspace-owned and carry no foreign key (repository rule),
-- so teardown removes them here rather than relying on a cascade.
deleted_departments AS (
    DELETE FROM department
    WHERE department.workspace_id = $1
)
DELETE FROM workspace_invitation
WHERE workspace_invitation.workspace_id = $1;

-- name: DeleteWorkspaceWorkbenchLedger :exec
-- Creator commerce, CRM, HR, affiliate and content ledgers
-- (docs/engineering/WORKBENCH-API.md). No foreign key sits behind them
-- (repository rule), so teardown removes every row explicitly, in dependency
-- order: a settlement names a collaboration, a post belongs to a creator, a
-- scorecard names an interview, an interview names a candidate, a candidate names
-- a job, a daily fact and a pick name a product, and a pick names a creator.
WITH
-- orange account mapping (787): a workspace that mirrored an upstream 达人
-- account must not leave the claim behind. Deleting it frees the upstream
-- account for another workspace, which is what "this workspace is gone" means
-- for a mirror that is not the source of truth.
deleted_orange_accounts AS (
    DELETE FROM orange_account WHERE orange_account.workspace_id = $1
),
deleted_settlements AS (
    DELETE FROM crm_settlement WHERE crm_settlement.workspace_id = $1
),
deleted_collabs AS (
    DELETE FROM crm_collab WHERE crm_collab.workspace_id = $1
),
deleted_briefs AS (
    DELETE FROM crm_brief WHERE crm_brief.workspace_id = $1
),
deleted_clients AS (
    DELETE FROM crm_client WHERE crm_client.workspace_id = $1
),
deleted_metrics AS (
    DELETE FROM creator_post_metric WHERE creator_post_metric.workspace_id = $1
),
deleted_posts AS (
    DELETE FROM creator_post WHERE creator_post.workspace_id = $1
),
-- Content health (WORKBENCH-API §19): a work names a creator and a snapshot names
-- a creator, with no foreign key behind either, so both are cleared here — before
-- the creators they describe.
deleted_creator_videos AS (
    DELETE FROM creator_video WHERE creator_video.workspace_id = $1
),
deleted_creator_metrics AS (
    DELETE FROM creator_metric WHERE creator_metric.workspace_id = $1
),
-- BD pipeline (WORKBENCH-API §20): follow-ups, quotes and collection campaigns
-- name a creator (and a quote a brief) with no foreign key behind either, so
-- teardown clears them explicitly before the creators and briefs they describe.
deleted_creator_activities AS (
    DELETE FROM creator_activity WHERE creator_activity.workspace_id = $1
),
deleted_creator_quotes AS (
    DELETE FROM creator_quote WHERE creator_quote.workspace_id = $1
),
deleted_creator_campaigns AS (
    DELETE FROM creator_campaign WHERE creator_campaign.workspace_id = $1
),
deleted_creators AS (
    DELETE FROM creator WHERE creator.workspace_id = $1
),
-- Affiliate distribution (WORKBENCH-API §11): a day fact names a pick, a pick
-- names a product and a creator, a settlement statement stands alone.
deleted_affiliate_daily AS (
    DELETE FROM affiliate_daily WHERE affiliate_daily.workspace_id = $1
),
deleted_affiliate_settlements AS (
    DELETE FROM affiliate_settlement WHERE affiliate_settlement.workspace_id = $1
),
deleted_affiliate_picks AS (
    DELETE FROM affiliate_pick WHERE affiliate_pick.workspace_id = $1
),
deleted_affiliate_products AS (
    DELETE FROM affiliate_product WHERE affiliate_product.workspace_id = $1
),
deleted_hr_scorecards AS (
    DELETE FROM hr_scorecard WHERE hr_scorecard.workspace_id = $1
),
deleted_hr_interviews AS (
    DELETE FROM hr_interview WHERE hr_interview.workspace_id = $1
),
deleted_hr_candidates AS (
    DELETE FROM hr_candidate WHERE hr_candidate.workspace_id = $1
),
deleted_hr_jobs AS (
    DELETE FROM hr_job WHERE hr_job.workspace_id = $1
),
-- Interview questions and guides (WORKBENCH-API §14): a guide names a candidate
-- and, once booked, an interview; a question may name a requisition. Neither holds
-- the other alive — a guide carries snapshots (759), not references — so clearing
-- them needs no reset of any column on another table.
deleted_hr_guides AS (
    DELETE FROM hr_interview_guide WHERE hr_interview_guide.workspace_id = $1
),
deleted_hr_questions AS (
    DELETE FROM hr_question WHERE hr_question.workspace_id = $1
),
deleted_finance_month AS (
    DELETE FROM ops_finance_month WHERE ops_finance_month.workspace_id = $1
),
-- Content workbench (WORKBENCH-API §12): a shoot names a script, a script names a
-- topic, a topic names an IP, and an IP is the root of the content chain. The two
-- link columns — `creator.media_ip_id` (729) and `creator_post.media_script_id`
-- (733) — need no reset of their own: both `creator` and `creator_post` are
-- deleted in this same statement, so no cross-workspace pointer survives it.
deleted_media_shoots AS (
    DELETE FROM media_shoot WHERE media_shoot.workspace_id = $1
),
deleted_media_scripts AS (
    DELETE FROM media_script WHERE media_script.workspace_id = $1
),
deleted_media_topics AS (
    DELETE FROM media_topic WHERE media_topic.workspace_id = $1
),
deleted_media_ips AS (
    DELETE FROM media_ip WHERE media_ip.workspace_id = $1
),
-- Hotspot radar and benchmark teardown (WORKBENCH-API §21, 812–815). They are the
-- raw material a topic is adopted from, so they go in the same statement as the
-- topics: `media_topic.hot_id` is a bare pointer with no foreign key behind it, and
-- nothing else in this graph holds either table alive.
-- Product-layer capability templates (WORKBENCH-API §24). A template grants rights,
-- so a deleted workspace must not leave one behind for a re-created workspace id to
-- inherit: nothing else holds this table alive (no foreign key).
deleted_workbench_role_templates AS (
    DELETE FROM workbench_role_template WHERE workbench_role_template.workspace_id = $1
),
deleted_media_hot AS (
    DELETE FROM media_hot WHERE media_hot.workspace_id = $1
),
deleted_media_bench AS (
    DELETE FROM media_bench WHERE media_bench.workspace_id = $1
),
-- General manager workbench (WORKBENCH-API §13): a key result and a package name
-- a goal, and a signal names the goal or the issue it was converted into. No
-- foreign key sits behind any of them, so each table is cleared explicitly.
-- The converted pointers need no reset of their own: both the goal and the issue
-- they can point at are rows of this workspace, deleted by this teardown.
deleted_goal_key_results AS (
    DELETE FROM goal_key_result WHERE goal_key_result.workspace_id = $1
),
deleted_goal_packages AS (
    DELETE FROM goal_package WHERE goal_package.workspace_id = $1
),
deleted_market_signals AS (
    DELETE FROM market_signal WHERE market_signal.workspace_id = $1
),
deleted_goals AS (
    DELETE FROM goal_okr WHERE goal_okr.workspace_id = $1
),
-- Offboarding (WORKBENCH-API §15): a record names an employee profile, and the
-- profile names a member. Clearing the exits before the profiles keeps the
-- dependency order readable; neither holds the other alive (no foreign key), and
-- the `leave_date` a finished record wrote lives on the profile row this same
-- statement deletes.
deleted_hr_offboardings AS (
    DELETE FROM hr_offboarding WHERE hr_offboarding.workspace_id = $1
),
-- Employee file change stream (WORKBENCH-API §16): append-only rows that name an
-- employee profile. No foreign key, so teardown clears them explicitly, before
-- the profiles they describe.
deleted_hr_employee_changes AS (
    DELETE FROM hr_employee_change WHERE hr_employee_change.workspace_id = $1
),
-- Rewards and disciplines (WORKBENCH-API §17): rows that name an employee profile,
-- with no foreign key behind them, so teardown clears them explicitly before the
-- profiles they describe.
deleted_hr_employee_rewards AS (
    DELETE FROM hr_employee_reward WHERE hr_employee_reward.workspace_id = $1
),
-- HR documents (WORKBENCH-API §18): a generation row names an employee profile and
-- a template; a template is a workspace-owned body. No foreign key behind either, so
-- teardown clears both explicitly -- the generations first (they point at the
-- templates), then the templates, before the profiles the generations describe. The
-- produced files are ordinary attachments, already cleared by this same statement.
deleted_hr_doc_generations AS (
    DELETE FROM hr_doc_generation WHERE hr_doc_generation.workspace_id = $1
),
deleted_hr_doc_templates AS (
    DELETE FROM hr_doc_template WHERE hr_doc_template.workspace_id = $1
)
DELETE FROM hr_employee_profile WHERE hr_employee_profile.workspace_id = $1;
-- ---- knowledge (migrations 637-651) ----------------------------------------
-- These are the only workspace tables in the schema that still carry real
-- foreign keys (repository rule: new tables do not add them), so teardown has
-- to walk them children -> parents. They also reference `issue` and `project`,
-- which is why the whole family is swept *before* issues and projects: a
-- knowledge row that outlives its issue turns the later delete into an FK
-- violation, i.e. the workspace could not be deleted at all.
--
-- They were missing from this plan until 2026-11 (the manifest test caught the
-- classification gap; the FK reality is why the order below matters).

-- name: DeleteKnowledgeDistillationRunsForWorkspace :exec
DELETE FROM knowledge_distillation_runs WHERE workspace_id = $1;

-- name: DeleteKnowledgeDistillationWorkItemsForWorkspace :exec
DELETE FROM knowledge_distillation_work_items WHERE workspace_id = $1;

-- name: DeleteKnowledgeDistillationCursorsForWorkspace :exec
DELETE FROM knowledge_distillation_cursors WHERE workspace_id = $1;

-- name: DeleteKnowledgeChunksForWorkspace :exec
DELETE FROM knowledge_chunks WHERE workspace_id = $1;

-- name: DeleteKnowledgeDocumentsForWorkspace :exec
DELETE FROM knowledge_documents WHERE workspace_id = $1;

-- name: DeleteKnowledgePageBacklinksForWorkspace :exec
DELETE FROM knowledge_page_backlinks WHERE workspace_id = $1;

-- name: DeleteKnowledgePageRevisionsForWorkspace :exec
DELETE FROM knowledge_page_revisions WHERE workspace_id = $1;

-- name: DeleteKnowledgeItemsForWorkspace :exec
DELETE FROM knowledge_items WHERE workspace_id = $1;

-- name: DeleteKnowledgePagesForWorkspace :exec
DELETE FROM knowledge_pages WHERE workspace_id = $1;

-- name: DeleteKnowledgeImportTasksForWorkspace :exec
DELETE FROM knowledge_import_tasks WHERE workspace_id = $1;

-- name: DeleteKnowledgeSourcesForWorkspace :exec
DELETE FROM knowledge_sources WHERE workspace_id = $1;

-- name: DeleteKnowledgeSpacesForWorkspace :exec
DELETE FROM knowledge_spaces WHERE workspace_id = $1;

-- name: DeleteKnowledgeInstancesForWorkspace :exec
DELETE FROM knowledge_instances WHERE workspace_id = $1;

-- name: DeleteGatewayCredentialsForWorkspace :exec
DELETE FROM gateway_credentials WHERE workspace_id = $1;
-- ---- qianchuan ads ledgers (migrations 840-852) ----------------------------
-- Twelve workspace-owned snapshot tables written by cmd/qianchuan-sync and read
-- by the ads endpoints (WORKBENCH-API §25). None of them carries a foreign key
-- (repository rule), so nothing else would ever clean a deleted workspace's
-- rows: they are removed here, one statement per table, detail -> summary ->
-- master data, before `workspace` goes.
--
-- One statement per table rather than a single multi-CTE query, for the reason
-- deleteWorkspaceKnowledge documents: data-modifying CTEs share one snapshot
-- with no defined order, and a reader of this plan should not have to reason
-- about that. The order below is documentation, not a dependency: with no
-- foreign key between them, every table is independent.

-- name: DeleteQianchuanDailyUniLiveForWorkspace :exec
DELETE FROM qianchuan_daily_uni_live WHERE workspace_id = $1;

-- name: DeleteQianchuanDailyUniVideoForWorkspace :exec
DELETE FROM qianchuan_daily_uni_video WHERE workspace_id = $1;

-- name: DeleteQianchuanDailyOverallForWorkspace :exec
DELETE FROM qianchuan_daily_overall WHERE workspace_id = $1;

-- name: DeleteQianchuanBalancesForWorkspace :exec
DELETE FROM qianchuan_balance WHERE workspace_id = $1;

-- name: DeleteQianchuanProductsForWorkspace :exec
DELETE FROM qianchuan_product WHERE workspace_id = $1;

-- name: DeleteQianchuanMaterialsForWorkspace :exec
-- `media_script_id` is a bare pointer into the content workbench (§25.3); no
-- reset is needed because the row that holds it is deleted here, and
-- `media_script` is swept by DeleteWorkspaceWorkbenchLedger.
DELETE FROM qianchuan_material WHERE workspace_id = $1;

-- name: DeleteQianchuanViolationsForWorkspace :exec
DELETE FROM qianchuan_violation WHERE workspace_id = $1;

-- name: DeleteQianchuanPlansForWorkspace :exec
DELETE FROM qianchuan_plan WHERE workspace_id = $1;

-- name: DeleteQianchuanAnchorsForWorkspace :exec
DELETE FROM qianchuan_anchor WHERE workspace_id = $1;

-- name: DeleteQianchuanAccountsForWorkspace :exec
DELETE FROM qianchuan_account WHERE workspace_id = $1;

-- name: DeleteQianchuanOplogsForWorkspace :exec
DELETE FROM qianchuan_oplog WHERE workspace_id = $1;

-- name: DeleteQianchuanReconsForWorkspace :exec
DELETE FROM qianchuan_recon WHERE workspace_id = $1;
