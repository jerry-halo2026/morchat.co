package handler

import (
	"context"
	"sort"
	"testing"
)

type workspaceDeleteAction string

const (
	workspaceDelete       workspaceDeleteAction = "delete"
	workspaceDeleteDetach workspaceDeleteAction = "detach"
	workspaceDeleteKeep   workspaceDeleteAction = "keep"
	workspaceDeleteSettle workspaceDeleteAction = "settle"
)

// workspaceDeletionManifest is the schema coverage contract for workspace
// teardown. Adding a table requires an explicit ownership decision here; the
// handler deletion graph must then implement that decision before CI passes.
var workspaceDeletionManifest = map[string]workspaceDeleteAction{
	"cloud_agent_connection":             workspaceDelete,
	"activity_log":                       workspaceDelete,
	"agent":                              workspaceDelete,
	"agent_builder_draft":                workspaceDelete,
	"agent_invocation_target":            workspaceDelete,
	"agent_runtime":                      workspaceDelete,
	"agent_skill":                        workspaceDelete,
	"agent_task_queue":                   workspaceDelete,
	"agent_to_label":                     workspaceDelete,
	"attachment":                         workspaceDelete,
	"autopilot":                          workspaceDelete,
	"autopilot_collaborator":             workspaceDelete,
	"autopilot_quota_period":             workspaceDelete,
	"autopilot_quota_reservation":        workspaceDelete,
	"autopilot_rule_version":             workspaceDelete,
	"autopilot_run":                      workspaceDelete,
	"autopilot_subscriber":               workspaceDelete,
	"autopilot_trigger":                  workspaceDelete,
	"channel_binding_token":              workspaceDelete,
	"channel_chat_context_generation":    workspaceDelete,
	"channel_chat_session_binding":       workspaceDelete,
	"channel_inbound_audit":              workspaceDelete,
	"channel_inbound_message_dedup":      workspaceDelete,
	"channel_installation":               workspaceDelete,
	"channel_media_pending_object":       workspaceDeleteSettle,
	"channel_outbound_card_message":      workspaceDelete,
	"channel_outbound_message":           workspaceDelete,
	"channel_reply_delivery":             workspaceDelete,
	"channel_task_delivery":              workspaceDelete,
	"channel_typing_reaction":            workspaceDeleteSettle, // Source deletion makes retained anchors eligible for the cleanup worker.
	"channel_user_binding":               workspaceDelete,
	"chat_draft_restore":                 workspaceDelete,
	"chat_message":                       workspaceDelete,
	"chat_pinned_agent":                  workspaceDelete,
	"chat_session":                       workspaceDelete,
	"client_usage_daily":                 workspaceDeleteDetach,
	"comment":                            workspaceDelete,
	"comment_reaction":                   workspaceDelete,
	"contact_sales_inquiry":              workspaceDeleteKeep,
	"daemon_connection":                  workspaceDelete,
	"daemon_token":                       workspaceDelete,
	"department":                         workspaceDelete,
	"dingtalk_group_presence":            workspaceDelete,
	"dingtalk_bot_identity":              workspaceDelete,
	"dingtalk_group_route":               workspaceDelete,
	"feedback":                           workspaceDeleteDetach,
	"github_installation":                workspaceDelete,
	"github_pending_check_suite":         workspaceDelete,
	"github_pending_installation":        workspaceDeleteKeep,
	"github_pull_request":                workspaceDelete,
	"github_pull_request_check_run":      workspaceDelete,
	"github_pull_request_check_suite":    workspaceDelete,
	"inbox_item":                         workspaceDelete,
	"instance_telemetry_state":           workspaceDeleteKeep,
	"issue":                              workspaceDelete,
	"issue_wakeup":                       workspaceDelete,
	"issue_wakeup_receipt":               workspaceDelete,
	"issue_child_event":                  workspaceDelete,
	"issue_view":                         workspaceDelete,
	"issue_view_preference":              workspaceDelete,
	"issue_dependency":                   workspaceDelete,
	"issue_label":                        workspaceDelete,
	"issue_property":                     workspaceDelete,
	"issue_pr_automation":                workspaceDelete,
	"issue_pull_request":                 workspaceDelete,
	"issue_pull_request_exclusion":       workspaceDelete,
	"issue_reaction":                     workspaceDelete,
	"issue_source_context":               workspaceDelete,
	"issue_source_context_object_intent": workspaceDeleteSettle,
	"issue_status":                       workspaceDelete,
	"issue_workflow":                     workspaceDelete,
	"issue_subscriber":                   workspaceDelete,
	"issue_to_label":                     workspaceDelete,
	"issue_unread":                       workspaceDelete,
	"issue_vcs_pull_request":             workspaceDelete,
	"lark_binding_token":                 workspaceDelete,
	"lark_chat_session_binding":          workspaceDelete,
	"lark_inbound_audit":                 workspaceDelete,
	"lark_inbound_message_dedup":         workspaceDelete,
	"lark_installation":                  workspaceDelete,
	"lark_outbound_card_message":         workspaceDelete,
	"lark_user_binding":                  workspaceDelete,
	"maintenance_job":                    workspaceDeleteKeep, // Global maintenance audit history, not workspace-owned.
	"member":                             workspaceDelete,
	"member_delegation_day":              workspaceDeleteKeep, // user-scoped telemetry ledger, no workspace_id
	"agent_mcp_server":                   workspaceDelete,
	"workspace_mcp_server":               workspaceDelete,
	"notification_preference":            workspaceDelete,
	"personal_access_token":              workspaceDeleteKeep,
	"pinned_item":                        workspaceDelete,
	"plugin_installation":                workspaceDelete,
	"plugin_hook_schedule":               workspaceDelete,
	"plugin_invocation":                  workspaceDelete,
	"plugin_storage":                     workspaceDelete,
	"plugin_secret":                      workspaceDelete,
	"plugin_package":                     workspaceDelete,
	"plugin_package_version":             workspaceDelete,
	"plugin_package_file":                workspaceDelete,
	"project":                            workspaceDelete,
	"project_member":                     workspaceDelete,
	"project_resource":                   workspaceDelete,
	"quick_action":                       workspaceDelete,
	"runtime_profile":                    workspaceDelete,
	"schema_migrations":                  workspaceDeleteKeep,
	"search_index_change":                workspaceDelete,
	"search_index_prune_mark":            workspaceDeleteKeep,
	"seat_capacity_outbox":               workspaceDeleteSettle,
	"site_counter":                       workspaceDeleteKeep,
	"skill":                              workspaceDelete,
	"skill_file":                         workspaceDelete,
	"skill_to_label":                     workspaceDelete,
	"skill_version":                      workspaceDelete,
	"squad":                              workspaceDelete,
	"squad_member":                       workspaceDelete,
	"sys_cron_executions":                workspaceDeleteKeep,
	"task_message":                       workspaceDelete,
	"task_supplement":                    workspaceDelete,
	"task_supplement_capability":         workspaceDelete,
	"task_token":                         workspaceDelete,
	"task_usage":                         workspaceDelete,
	"task_usage_hourly":                  workspaceDelete,
	"task_usage_hourly_dirty":            workspaceDelete,
	"task_usage_hourly_rollup_state":     workspaceDeleteKeep,
	"user":                               workspaceDeleteKeep,
	"user_composio_connection":           workspaceDeleteKeep,
	"vcs_commit_status":                  workspaceDelete,
	"vcs_connection":                     workspaceDelete,
	"vcs_pull_request":                   workspaceDelete,
	"verification_code":                  workspaceDeleteKeep,
	"webhook_delivery":                   workspaceDelete,
	"wecom_install_session":              workspaceDelete,
	"workspace_composio_connection":      workspaceDelete,
	"agent_app":                          workspaceDelete,
	"app_action_rule":                    workspaceDelete,
	"app_action_request":                 workspaceDelete,
	"app_tool_call":                      workspaceDelete,
	"issue_environment":                  workspaceDelete,
	"workspace_app_setting":              workspaceDelete,
	"app_tool_class_override":            workspaceDelete,
	"workspace":                          workspaceDelete,
	// Workbench ledgers (docs/engineering/WORKBENCH-API.md): workspace-owned
	// business rows with no foreign key behind them, so teardown deletes them
	// explicitly in DeleteWorkspaceWorkbenchLedger.
	"creator":             workspaceDelete,
	"creator_post":        workspaceDelete,
	"creator_post_metric": workspaceDelete,
	// Content health (WORKBENCH-API 搂19, 794鈥?00): a work names a creator and a
	// daily snapshot names a creator, with no foreign key behind either, so
	// DeleteWorkspaceWorkbenchLedger clears both before the creators.
	"creator_video":       workspaceDelete,
	"creator_metric":      workspaceDelete,
	"crm_client":          workspaceDelete,
	"crm_brief":           workspaceDelete,
	"crm_collab":          workspaceDelete,
	"crm_settlement":      workspaceDelete,
	"hr_job":              workspaceDelete,
	"hr_candidate":        workspaceDelete,
	"hr_interview":        workspaceDelete,
	"hr_scorecard":        workspaceDelete,
	"hr_employee_profile": workspaceDelete,
	// Interview questions and guides (WORKBENCH-API 搂14): no foreign key either 鈥?
	// a guide's items are snapshots, and both tables are workspace-owned business
	// rows 鈥?so DeleteWorkspaceWorkbenchLedger removes each explicitly.
	"hr_question":        workspaceDelete,
	"hr_interview_guide": workspaceDelete,
	// Offboarding (WORKBENCH-API 搂15): no foreign key behind it, so
	// DeleteWorkspaceWorkbenchLedger removes the records explicitly. The
	// `leave_date` those records wrote sits on `hr_employee_profile`, which the
	// same teardown already deletes.
	"hr_offboarding": workspaceDelete,
	// Employee file change stream (WORKBENCH-API 搂16): append-only rows naming an
	// employee profile, no foreign key, so DeleteWorkspaceWorkbenchLedger clears
	// them explicitly before the profiles they describe.
	"hr_employee_change": workspaceDelete,
	// Rewards and disciplines (WORKBENCH-API 搂17): a row names an employee profile,
	// no foreign key behind it, so DeleteWorkspaceWorkbenchLedger clears it
	// explicitly before the profiles it describes.
	"hr_employee_reward": workspaceDelete,
	// HR documents (WORKBENCH-API 搂18): a generation row names an employee profile
	// and a template, a template is a workspace-owned body, and neither table has a
	// foreign key behind it. The generated files themselves are ordinary
	// attachments, which the same teardown already deletes.
	"hr_doc_generation": workspaceDelete,
	"hr_doc_template":   workspaceDelete,
	// Affiliate distribution (WORKBENCH-API 搂11): the same treatment 鈥?no foreign
	// key, so DeleteWorkspaceWorkbenchLedger removes them explicitly.
	"affiliate_product":    workspaceDelete,
	"affiliate_pick":       workspaceDelete,
	"affiliate_daily":      workspaceDelete,
	"affiliate_settlement": workspaceDelete,
	// Finance month entry (707): no foreign key either, so the same teardown has
	// to name it or a deleted workspace leaves its cost rows behind.
	"ops_finance_month": workspaceDelete,
	// Content workbench (WORKBENCH-API 搂12): IP 鈫?topic 鈫?script 鈫?shoot, the same
	// treatment 鈥?no foreign key sits behind any of them, so
	// DeleteWorkspaceWorkbenchLedger removes each explicitly. The two link columns
	// (`creator.media_ip_id`, `creator_post.media_script_id`) sit on tables teardown
	// already deletes, so they need no entry of their own.
	"media_ip":     workspaceDelete,
	"media_topic":  workspaceDelete,
	"media_script": workspaceDelete,
	"media_shoot":  workspaceDelete,
	// Hotspot radar and benchmark teardown (WORKBENCH-API 搂21, 812鈥?15): the two
	// source ledgers a topic is adopted from. No foreign key behind either, so
	// DeleteWorkspaceWorkbenchLedger removes them explicitly alongside the topics
	// whose bare `hot_id` may point at them.
	"media_hot":   workspaceDelete,
	// Product-layer capability templates (WORKBENCH-API §24): granting rights is
	// workspace state, so a deleted workspace must not leave a template behind.
	"workbench_role_template": workspaceDelete,
	"media_bench": workspaceDelete,
	// General manager workbench (WORKBENCH-API 搂13): OKR goals, their key results
	// and department packages, and the radar signals. No foreign key sits behind
	// any of them, so DeleteWorkspaceWorkbenchLedger removes each explicitly.
	// `issue.goal_id` (748) needs no entry: it is a column on `issue`, which
	// teardown already deletes.
	"goal_okr":             workspaceDelete,
	"goal_key_result":      workspaceDelete,
	"goal_package":         workspaceDelete,
	"market_signal":        workspaceDelete,
	"workspace_invitation": workspaceDelete,
	"workspace_share_link": workspaceDelete,
	// orange 杈句汉 mirror (785鈥?93, docs/engineering/ORANGE-SYNC.md): the
	// workspace-owned claim on an upstream orange account, deleted by
	// DeleteWorkspaceWorkbenchLedger. The mirrored `creator` rows it points at
	// are ordinary workspace rows and are classified above.
	"orange_account": workspaceDelete,
	// BD pipeline (WORKBENCH-API 搂20, 802鈥?09): a follow-up and a quote name a
	// creator (a quote may also name a brief) with no foreign key behind either,
	// and a campaign names nothing. DeleteWorkspaceWorkbenchLedger removes all
	// three before the creators and briefs they describe.
	"creator_activity": workspaceDelete,
	"creator_quote":    workspaceDelete,
	"creator_campaign": workspaceDelete,
	// knowledge family: migrations 637-651 predate the no-FK rule and still
	// reference workspace/issue/project, so the domain is swept in
	// `deleteWorkspaceKnowledge` (children → parents, before issues/projects).
	"knowledge_chunks":                      workspaceDelete,
	"knowledge_distillation_cursors":        workspaceDelete,
	"knowledge_distillation_runs":           workspaceDelete,
	"knowledge_distillation_work_items":     workspaceDelete,
	"knowledge_documents":                   workspaceDelete,
	"knowledge_import_tasks":                workspaceDelete,
	"knowledge_instances":                   workspaceDelete,
	"knowledge_items":                       workspaceDelete,
	"knowledge_page_backlinks":              workspaceDelete,
	"knowledge_page_revisions":              workspaceDelete,
	"knowledge_pages":                       workspaceDelete,
	"knowledge_sources":                     workspaceDelete,
	"knowledge_spaces":                      workspaceDelete,
	// Workspace-owned secrets; the row also carries user_id but belongs to the workspace.
	"gateway_credentials":                   workspaceDelete,
	// Identity link between a local user and an external IdP: user-scoped, no workspace_id.
	"external_auth_identity":                workspaceDeleteKeep,
	// Qianchuan ads ledgers (WORKBENCH-API §25, migrations 840–852): twelve
	// workspace-owned snapshot tables written by cmd/qianchuan-sync. No foreign
	// key sits behind any of them, so DeleteWorkspaceQianchuanLedger removes each
	// explicitly; nothing else in the schema would ever clear them.
	"qianchuan_account":         workspaceDelete,
	"qianchuan_anchor":          workspaceDelete,
	"qianchuan_balance":         workspaceDelete,
	"qianchuan_daily_overall":   workspaceDelete,
	"qianchuan_daily_uni_live":  workspaceDelete,
	"qianchuan_daily_uni_video": workspaceDelete,
	"qianchuan_material":        workspaceDelete,
	"qianchuan_oplog":           workspaceDelete,
	"qianchuan_plan":            workspaceDelete,
	"qianchuan_product":         workspaceDelete,
	"qianchuan_recon":           workspaceDelete,
	"qianchuan_violation":       workspaceDelete,
}

func TestWorkspaceDeletionManifestCoversPublicSchema(t *testing.T) {
	if testPool == nil {
		t.Skip("database not available")
	}

	rows, err := testPool.Query(context.Background(), `
SELECT tablename
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename
`)
	if err != nil {
		t.Fatalf("list public tables: %v", err)
	}
	defer rows.Close()

	actual := make(map[string]struct{}, len(workspaceDeletionManifest))
	for rows.Next() {
		var table string
		if err := rows.Scan(&table); err != nil {
			t.Fatalf("scan public table: %v", err)
		}
		actual[table] = struct{}{}
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("iterate public tables: %v", err)
	}

	var unclassified, missing []string
	for table := range actual {
		if _, ok := workspaceDeletionManifest[table]; !ok {
			unclassified = append(unclassified, table)
		}
	}
	for table := range workspaceDeletionManifest {
		if _, ok := actual[table]; !ok {
			missing = append(missing, table)
		}
	}
	sort.Strings(unclassified)
	sort.Strings(missing)
	if len(unclassified) > 0 || len(missing) > 0 {
		t.Fatalf("workspace deletion manifest drift: unclassified=%v missing=%v", unclassified, missing)
	}

	workspaceColumns, err := testPool.Query(context.Background(), `
SELECT table_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND column_name = 'workspace_id'
`)
	if err != nil {
		t.Fatalf("list workspace_id columns: %v", err)
	}
	defer workspaceColumns.Close()

	withWorkspaceID := make(map[string]struct{})
	for workspaceColumns.Next() {
		var table string
		if err := workspaceColumns.Scan(&table); err != nil {
			t.Fatalf("scan workspace_id table: %v", err)
		}
		withWorkspaceID[table] = struct{}{}
	}
	if err := workspaceColumns.Err(); err != nil {
		t.Fatalf("iterate workspace_id tables: %v", err)
	}

	for table, action := range workspaceDeletionManifest {
		_, hasWorkspaceID := withWorkspaceID[table]
		switch action {
		case workspaceDeleteKeep:
			if hasWorkspaceID {
				t.Errorf("KEEP table %s gained workspace_id; classify its teardown behavior", table)
			}
		case workspaceDeleteDetach, workspaceDeleteSettle:
			if !hasWorkspaceID {
				t.Errorf("%s table %s lost workspace_id; update its teardown selector", action, table)
			}
		}
	}
}
