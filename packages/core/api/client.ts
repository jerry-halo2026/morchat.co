import { signInWithSupabasePassword, type SupabasePasswordConfig } from "./supabase-password";
import type { ZodType } from "zod";
import { AgentRuntimeSchema, EMPTY_RUNTIME } from "../runtimes/schema";
import {
  EMPTY_WORKBENCH_OVERVIEW,
  WorkbenchOverviewResponseSchema,
  type WorkbenchOverviewResponse,
} from "../metrics/response";
import type { IssueWakeup, IssueWakeupInput, IssueWakeupSummaryRow, PausedWakeup, SystemWakeup, WakeupRun, WorkspaceSystemWakeup } from "../types/issue-wakeup";
import type { WorkspaceWakeupPage, WorkspaceWakeupFilters } from "../types/issue-wakeup";
import { WorkspaceWakeupPageSchema, IssueWakeupSchema, IssueWakeupSummaryRowSchema, PausedWakeupSchema, SystemWakeupSchema, WakeupRunSchema, WorkspaceSystemWakeupSchema } from "./schemas";
import { archivedInboxQuery, type ArchivedInboxFilters } from "../inbox/filters";
import type { ArchivedInboxPage, ArchivedInboxFacets } from "../types/inbox";
import { parseQoderConnection, parseQoderCatalog, type QoderInput } from "../runtimes/qoder-schema";
import { configStore } from "../config";
import type {
  Issue,
  IssuePriority,
  CreateIssueRequest,
  MoveIssueRequest,
  UpdateIssueRequest,
  IssueDuplicates,
  GroupedIssuesResponse,
  ListIssuesResponse,
  SearchIssuesResponse,
  SearchProjectsResponse,
  SearchIndexManifest,
  SearchIndexSnapshotPage,
  SearchIndexChanges,
  UpdateMeRequest,
  CreateMemberRequest,
  UpdateMemberRequest,
  ListIssuesParams,
  ListGroupedIssuesParams,
  IssueTableFacetsRequest,
  IssueTableFacetsResponse,
  IssueTableGroupsRequest,
  IssueTableGroupsResponse,
  IssueTableRowsRequest,
  IssueTableRowsResponse,
  Agent,
  MikaBootstrapResponse,
  CreateAgentRequest,
  AgentBuilderRuntimeSwitch,
  AgentBuilderSession,
  AgentBuilderSessionSummary,
  StoredAgentDraft,
  UpdateAgentRequest,
  AgentEnvResponse,
  UpdateAgentEnvRequest,
  AgentTask,
  AgentActivityBucket,
  AgentRunCount,
  WorkspaceWorkingAgent,
  WorkspaceWorkingAgentMineRelation,
  WorkspaceWorkingAgentType,
  AgentRuntime,
  RuntimeProfile,
  CreateRuntimeProfileRequest,
  UpdateRuntimeProfileRequest,
  InboxItem,
  InboxWorkspaceUnread,
  IssueSubscriber,
  IssueUnread,
  Comment,
  CommentTriggerPreview,
  IssueTriggerPreview,
  IssueTriggerPreviewParams,
  Reaction,
  IssueReaction,
  Workspace,
  WorkspaceRepo,
  WorkspaceMcpServer,
  MemberWithUser,
  User,
  Skill,
  SkillSummary,
  SkillVersion,
  SkillVersionSummary,
  CreateSkillRequest,
  UpdateSkillRequest,
  SetAgentSkillsRequest,
  SetAgentRuntimeSkillEnabledRequest,
  PersonalAccessToken,
  CreatePersonalAccessTokenRequest,
  CreatePersonalAccessTokenResponse,
  RuntimeUsage,
  IssueUsageSummary,
  RuntimeHourlyActivity,
  RuntimeUsageByAgent,
  RuntimeUsageByHour,
  DashboardUsageDaily,
  DashboardUsageByAgent,
  DashboardAgentRunTime,
  DashboardRunTimeDaily,
  DashboardFailureDaily,
  DashboardFailureByAgent,
  RuntimeUpdate,
  RuntimeModelListRequest,
  RuntimeLocalSkillListRequest,
  CreateRuntimeLocalSkillImportRequest,
  RuntimeLocalSkillImportRequest,
  TimelineEntry,
  AssigneeFrequencyEntry,
  TaskMessagePayload,
  Attachment,
  ChatSession,
  ChatPinnedAgent,
  ChatMessage,
  ChatMessagesPage,
  ChatDraftRestoresResponse,
  ChatPendingTask,
  PrioritizeQueuedChatTaskResponse,
  PendingChatTasksResponse,
  HasPendingChatTasksResponse,
  SendChatMessageResponse,
  StartMikaOnboardingResponse,
  CancelTaskResponse,
  Project,
  CreateProjectRequest,
  UpdateProjectRequest,
  ListProjectsResponse,
  ListProjectMembersResponse,
  ProjectResource,
  CreateProjectResourceRequest,
  UpdateProjectResourceRequest,
  ListProjectResourcesResponse,
  Label,
  IssueProperty,
  IssuePropertyValue,
  CreatePropertyRequest,
  QuickAction,
  CreateQuickActionRequest,
  UpdateQuickActionRequest,
  ListQuickActionsResponse,
  UpdatePropertyRequest,
  ListPropertiesResponse,
  IssuePropertiesResponse,
  CreateLabelRequest,
  UpdateLabelRequest,
  ListLabelsResponse,
  ListIssueStatusesResponse,
  IssueStatusCategory,
  IssueStatusEntry,
  CreateIssueStatusRequest,
  UpdateIssueStatusRequest,
  IssueWorkflow,
  IssueWorkflowWriteRequest,
  IssueWorkflowDryRunResponse,
  ListIssueWorkflowsResponse,
  SetProjectWorkflowRequest,
  SetWorkflowHandoffRequest,
  WorkflowHandoffPreview,
  IssueLabelsResponse,
  LabelResourceType,
  ResourceLabelsResponse,
  PinnedItem,
  CreatePinRequest,
  PinnedItemType,
  ReorderPinsRequest,
  Invitation,
  Department,
  ListDepartmentsResponse,
  CreateDepartmentRequest,
  UpdateDepartmentRequest,
  DeleteDepartmentResponse,
  UpdateMemberDepartmentRequest,
  UpdateMemberDepartmentResponse,
  Creator,
  CreatorListFilters,
  CreatorListResponse,
  CreatorPost,
  CreatorPostListFilters,
  CreatorPostListResponse,
  CreatorPostMetric,
  CreatorPostMetricListResponse,
  CreatorHealthDetailResponse,
  CreatorHealthListFilters,
  CreatorHealthListResponse,
  CreatorVideoListResponse,
  CreateCreatorRequest,
  UpdateCreatorRequest,
  CreateCreatorPostRequest,
  UpdateCreatorPostRequest,
  UpsertCreatorPostMetricRequest,
  CrmClient,
  CrmClientListFilters,
  CrmClientListResponse,
  CreateCrmClientRequest,
  UpdateCrmClientRequest,
  CrmBrief,
  CrmBriefListFilters,
  CrmBriefListResponse,
  CreateCrmBriefRequest,
  UpdateCrmBriefRequest,
  CrmCollab,
  CrmCollabListFilters,
  CrmCollabListResponse,
  CreateCrmCollabRequest,
  UpdateCrmCollabRequest,
  CrmSettlement,
  CrmSettlementListFilters,
  CrmSettlementListResponse,
  CreateCrmSettlementRequest,
  UpdateCrmSettlementRequest,
  // BD pipeline (docs/engineering/WORKBENCH-API.md §20).
  BdActivity,
  BdActivityListFilters,
  BdActivityListResponse,
  BdCampaign,
  BdCampaignListFilters,
  BdCampaignListResponse,
  BdPerformance,
  BdPerformanceFilters,
  // 千川投放 (§25) — reads only; `cmd/qianchuan-sync` is the writer.
  AdsAccountListResponse,
  AdsMaterialListResponse,
  AdsPlanListResponse,
  AdsReconListResponse,
  AdsSummary,
  AdsSummaryFilters,
  AdsViolationListResponse,
  BdPipeline,
  BdQuote,
  BdQuoteListFilters,
  BdQuoteListResponse,
  CreateBdActivityRequest,
  CreateBdCampaignRequest,
  CreateBdQuoteRequest,
  UpdateBdActivityRequest,
  UpdateBdCampaignRequest,
  UpdateBdQuoteRequest,
  WorkbenchCountsResponse,
  WorkbenchFinanceResponse,
  // Batch CSV import (WORKBENCH-API §23).
  ImportKind,
  WorkbenchCapabilitiesResponse,
  WorkbenchRoleTemplate,
  WorkbenchRoleTemplateListResponse,
  ImportPreviewResponse,
  WorkbenchFinanceMonth,
  WorkbenchFinanceMonthListResponse,
  UpsertWorkbenchFinanceMonthRequest,
  AffiliateDaily,
  AffiliateDailyListFilters,
  AffiliateDailyListResponse,
  AffiliatePick,
  AffiliatePickListFilters,
  AffiliatePickListResponse,
  AffiliateProduct,
  AffiliateProductListFilters,
  AffiliateProductListResponse,
  AffiliateSettlement,
  AffiliateSettlementListFilters,
  AffiliateSettlementListResponse,
  AffiliateSummaryFilters,
  AffiliateSummaryResponse,
  CreateAffiliatePickRequest,
  CreateAffiliateProductRequest,
  CreateAffiliateSettlementRequest,
  UpdateAffiliatePickRequest,
  UpdateAffiliateProductRequest,
  UpdateAffiliateSettlementRequest,
  UpsertAffiliateDailyRequest,
  // Content workbench (docs/engineering/WORKBENCH-API.md §12).
  AttachMediaIPAccountRequest,
  CreateMediaIPRequest,
  CreateMediaScriptRequest,
  CreateMediaShootRequest,
  CreateMediaTopicRequest,
  MediaIP,
  MediaIPAccount,
  MediaIPDetail,
  MediaIPListFilters,
  MediaIPListResponse,
  MediaScript,
  MediaScriptListFilters,
  MediaScriptListResponse,
  MediaShoot,
  MediaShootListFilters,
  MediaShootListResponse,
  MediaTopic,
  MediaTopicListFilters,
  MediaTopicListResponse,
  UpdateMediaIPRequest,
  UpdateMediaScriptRequest,
  UpdateMediaShootRequest,
  UpdateMediaTopicRequest,
  // Hotspot radar / benchmark teardown (docs/engineering/WORKBENCH-API.md §21).
  AdoptMediaRequest,
  CreateMediaBenchRequest,
  CreateMediaHotRequest,
  MediaBench,
  MediaBenchListFilters,
  MediaBenchListResponse,
  MediaHot,
  MediaHotListFilters,
  MediaHotListResponse,
  UpdateMediaBenchRequest,
  UpdateMediaHotRequest,
  // General manager workbench (docs/engineering/WORKBENCH-API.md §13).
  AttachGoalIssueRequest,
  ConvertMarketSignalRequest,
  CreateGoalKeyResultRequest,
  CreateGoalPackageRequest,
  CreateGoalRequest,
  CreateMarketSignalRequest,
  Goal,
  GoalDetail,
  GoalIssue,
  GoalKeyResult,
  GoalListFilters,
  GoalListResponse,
  GoalPackage,
  MarketSignal,
  MarketSignalConvertResponse,
  MarketSignalListFilters,
  MarketSignalListResponse,
  UpdateGoalKeyResultRequest,
  UpdateGoalPackageRequest,
  UpdateGoalRequest,
  UpdateMarketSignalRequest,
  // Interview questions and per-round guides (docs/engineering/WORKBENCH-API.md §14).
  CreateHrInterviewGuideRequest,
  CreateHrQuestionRequest,
  HrGuideGenerateRequest,
  HrGuideGenerateResponse,
  HrGuideItem,
  HrGuideListFilters,
  HrGuideListResponse,
  HrInterviewGuide,
  HrQuestion,
  HrQuestionListFilters,
  HrQuestionListResponse,
  UpdateHrGuideItemRequest,
  UpdateHrInterviewGuideRequest,
  UpdateHrQuestionRequest,
  // Offboarding management (docs/engineering/WORKBENCH-API.md §15).
  CreateHrOffboardingRequest,
  HrHandoverItem,
  HrOffboarding,
  HrOffboardingAdvanceResponse,
  HrOffboardingListFilters,
  HrOffboardingListResponse,
  UpdateHrHandoverItemRequest,
  UpdateHrOffboardingRequest,
  // Employee file change stream (docs/engineering/WORKBENCH-API.md §16).
  CreateHrEmployeeChangeRequest,
  HrEmployeeChange,
  HrEmployeeChangeListFilters,
  HrEmployeeChangeListResponse,
  UpdateHrEmployeeChangeRequest,
  // Employee rewards and disciplines (docs/engineering/WORKBENCH-API.md §17).
  CreateHrEmployeeRewardRequest,
  HrEmployeeReward,
  HrEmployeeRewardListFilters,
  HrEmployeeRewardListResponse,
  UpdateHrEmployeeRewardRequest,
  // HR documents (docs/engineering/WORKBENCH-API.md §18).
  CreateHrDocGenerationRequest,
  CreateHrDocGenerationResponse,
  CreateHrDocTemplateRequest,
  HrDocGenerationListResponse,
  HrDocTemplate,
  HrDocTemplateListFilters,
  HrDocTemplateListResponse,
  UpdateHrDocTemplateRequest,
  ShareLink,
  ShareLinkInfo,
  Autopilot,
  AutopilotTrigger,
  AutopilotRun,
  AutopilotQuotaUsage,
  CreateAutopilotRequest,
  UpdateAutopilotRequest,
  CreateAutopilotTriggerRequest,
  UpdateAutopilotTriggerRequest,
  ListAutopilotsResponse,
  CronPreviewResponse,
  GetAutopilotResponse,
  AutopilotCollaboratorsResponse,
  ListAutopilotRunsResponse,
  ListWebhookDeliveriesResponse,
  WebhookDelivery,
  NotificationPreferenceResponse,
  NotificationPreferences,
  PluginHookResult,
  PluginInstallation,
  PluginInstallationListResponse,
  PluginPackage,
  PluginPackageListResponse,
  PluginSurfaceLaunch,
  PluginInvocation,
  PluginMCPTool,
  PluginPreview,
  PluginTokenIssue,
  PluginPreviewRequest,
  PluginInstallRequest,
  PluginConfigRequest,
  IssuePullRequestsResponse,
  IssueEnvironmentsResponse,
  ListGitHubInstallationsResponse,
  ListGitHubRepositoriesResponse,
  GitHubConnectResponse,
  ListVCSConnectionsResponse,
  ConnectVCSRequest,
  ConnectVCSResponse,
  ListLarkInstallationsResponse,
  BeginLarkInstallResponse,
  LarkInstallStatusResponse,
  RedeemLarkBindingTokenResponse,
  ComposioToolkit,
  ComposioConnection,
  ComposioConnectInitResponse,
  AppsOverview,
  AppCatalogResponse,
  AppRule,
  AppTool,
  AppToolCall,
  IssueAppCall,
  AppRequestList,
  TeamAppImpact,
  AppRequest,
  AgentApp,
  AppAccountScope,
  AppActionClass,
  AppActionPolicy,
  AppCatalogMode,
  UpdateAgentAppsRequest,
  SlackInstallation,
  ListSlackInstallationsResponse,
  RegisterSlackBYORequest,
  RedeemSlackBindingTokenResponse,
  DingTalkInstallation,
  ListDingTalkInstallationsResponse,
  ListDingTalkGroupsResponse,
  ListDingTalkGroupsParams,
  RegisterDingTalkBYORequest,
  RedeemDingTalkBindingTokenResponse,
  WecomInstallation,
  ListWecomInstallationsResponse,
  RegisterWecomBYORequest,
  BeginWecomInstallResponse,
  WecomInstallStatusResponse,
  RedeemWecomBindingTokenResponse,
  TelegramInstallation,
  ListTelegramInstallationsResponse,
  RegisterTelegramRequest,
  RedeemTelegramBindingTokenResponse,
  Squad,
  SquadMember,
  SquadMemberStatusListResponse,
  BillingBalance,
  BillingTransactionsPage,
  BillingBatchesPage,
  BillingTopupsPage,
  BillingPriceTier,
  CreateBillingCheckoutSessionRequest,
  CreateBillingCheckoutSessionResponse,
  BillingCheckoutSessionStatus,
  CreateBillingPortalSessionResponse,
  WorkspaceSubscriptionSummary,
  IssueLimitUsage,
  WorkspaceSubscriptionPrices,
  CreateWorkspaceSubscriptionCheckoutRequest,
  CreateWorkspaceSubscriptionCheckoutResponse,
  WorkspaceSubscriptionSeatReconcileResult,
  PreviewWorkspaceSeatPurchaseRequest,
  WorkspaceSeatPurchasePreview,
  PurchaseWorkspaceSeatsRequest,
  PurchaseWorkspaceSeatsResponse,
  CreateWorkspaceSubscriptionPortalResponse,
  SourceContextPreview,
  CreateCommentSubIssueManualRequest,
  CreateCommentSubIssueAgentRequest,
  CreateCommentSubIssueRequest,
} from "../types";
// HR wire types come from their own module: the `../types` barrel does not
// re-export the B1 block, and this file must not depend on that changing.
import type {
  CreateHrCandidateRequest,
  CreateHrEmployeeProfileRequest,
  CreateHrInterviewRequest,
  CreateHrJobRequest,
  CreateHrScorecardRequest,
  HireHrCandidateRequest,
  HireHrCandidateResponse,
  HrCandidate,
  HrCandidateListFilters,
  HrCandidateListResponse,
  HrEmployeeProfile,
  HrEmployeeProfileListFilters,
  HrEmployeeProfileListResponse,
  HrInterview,
  HrInterviewListFilters,
  HrInterviewListResponse,
  HrJob,
  HrJobListFilters,
  HrJobListResponse,
  HrScorecard,
  HrScorecardListFilters,
  HrScorecardListResponse,
  UpdateHrCandidateRequest,
  UpdateHrEmployeeProfileRequest,
  UpdateHrInterviewRequest,
  UpdateHrJobRequest,
  UpdateHrScorecardRequest,
} from "../types/workbench";
import type { OnboardingCompletionPath } from "../onboarding/types";
import type {
  CreateFeedbackResponse,
  FeedbackContext,
  FeedbackKind,
} from "../feedback/types";
import type {
  CloudRuntimeNode,
  CreateCloudRuntimeNodeRequest,
  ListCloudRuntimeNodesParams,
} from "../runtimes/cloud-runtime";
import { type Logger, noopLogger } from "../logger";
import { createRequestId, createSafeId } from "../utils";
import { getCurrentSlug } from "../platform/workspace-storage";
import { parseWithFallback } from "./schema";
import {
  RuntimeProfileSchema,
  RuntimeProfileListSchema,
  AgentTaskListSchema,
  AgentTaskPageSchema,
  AgentActivityBucketListSchema,
  AttachmentResponseSchema,
  CancelTaskResponseSchema,
  ChatDraftRestoresResponseSchema,
  ChatMessageListSchema,
  ChatMessagesPageSchema,
  ChatPendingTaskSchema,
  ChatSessionListSchema,
  ChatSessionSchema,
  PrioritizeQueuedChatTaskResponseSchema,
  SendChatMessageResponseSchema,
  StartMikaOnboardingResponseSchema,
  ChildIssuesResponseSchema,
  IssueDuplicatesResponseSchema,
  ChildIssueProgressResponseSchema,
  CommentsListSchema,
  CommentTriggerPreviewSchema,
  IssueTriggerPreviewSchema,
  CloudRuntimeNodeListSchema,
  CloudRuntimeNodeSchema,
  AgentBuilderRuntimeSwitchSchema,
  AgentBuilderSessionSchema,
  AgentBuilderSessionListSchema,
  EMPTY_AGENT_BUILDER_SESSION_LIST,
  agentBuilderRuntimeSwitchFallback,
  DashboardAgentRunTimeListSchema,
  DashboardRunTimeDailyListSchema,
  DashboardFailureDailyListSchema,
  DashboardFailureByAgentListSchema,
  DashboardUsageByAgentListSchema,
  DashboardUsageDailyListSchema,
  EMPTY_APP_CONFIG,
  EMPTY_ATTACHMENT,
  EMPTY_CHAT_MESSAGE_LIST,
  EMPTY_CHAT_PENDING_TASK,
  EMPTY_CHAT_SESSION,
  EMPTY_CHAT_SESSION_LIST,
  EMPTY_PRIORITIZE_QUEUED_CHAT_TASK_RESPONSE,
  EMPTY_CLOUD_RUNTIME_NODE,
  EMPTY_CLOUD_RUNTIME_NODE_LIST,
  EMPTY_AGENT_BUILDER_SESSION,
  EMPTY_GROUPED_ISSUES_RESPONSE,
  EMPTY_ISSUE_TABLE_FACETS_RESPONSE,
  EMPTY_ISSUE_TABLE_GROUPS_RESPONSE,
  EMPTY_ISSUE_TABLE_ROWS_RESPONSE,
  EMPTY_LIST_ISSUES_RESPONSE,
  EMPTY_SEARCH_ISSUES_RESPONSE,
  EMPTY_SEARCH_PROJECTS_RESPONSE,
  EMPTY_SQUAD,
  EMPTY_SQUAD_LIST,
  EMPTY_SQUAD_MEMBER_STATUS_LIST,
  EMPTY_TIMELINE_ENTRIES,
  EMPTY_USER,
  EMPTY_LIST_WEBHOOK_DELIVERIES_RESPONSE,
  EMPTY_WEBHOOK_DELIVERY,
  AppConfigSchema,
  type AppConfigResponse,
  type RefreshSessionResponse,
  RefreshSessionResponseSchema,
  EMPTY_REFRESH_SESSION_RESPONSE,
  GroupedIssuesResponseSchema,
  IssueTableFacetsResponseSchema,
  IssueTableGroupsResponseSchema,
  IssueTableRowsResponseSchema,
  ListAutopilotsResponseSchema,
  EMPTY_LIST_AUTOPILOTS_RESPONSE,
  AutopilotRunSchema,
  AutopilotQuotaUsageSchema,
  FALLBACK_AUTOPILOT_RUN,
  CronPreviewResponseSchema,
  UNREADABLE_CRON_PREVIEW_RESPONSE,
  ListIssuesResponseSchema,
  CreateIssueResponseSchema,
  IssueSchema,
  AgentTaskSchema,
  SourceContextPreviewSchema,
  CommentSubIssueTaskResponseSchema,
  ListWebhookDeliveriesResponseSchema,
  RuntimeHourlyActivityListSchema,
  RuntimeUsageByAgentListSchema,
  RuntimeUsageByHourListSchema,
  RuntimeUsageListSchema,
  SearchIssuesResponseSchema,
  ProjectSchema,
  ListProjectMembersResponseSchema,
  ListProjectsResponseSchema,
  EMPTY_PROJECT,
  EMPTY_LIST_PROJECTS_RESPONSE,
  DepartmentSchema,
  EMPTY_DEPARTMENT,
  ListDepartmentsResponseSchema,
  EMPTY_LIST_DEPARTMENTS_RESPONSE,
  DeleteDepartmentResponseSchema,
  EMPTY_DELETE_DEPARTMENT_RESPONSE,
  SearchProjectsResponseSchema,
  SearchIndexManifestSchema,
  SearchIndexSnapshotPageSchema,
  SearchIndexChangesSchema,
  SquadSchema,
  SquadListSchema,
  SquadMemberStatusListResponseSchema,
  SubscribersListSchema,
  TaskMessageListSchema,
  TimelineEntriesSchema,
  UserSchema,
  WebhookDeliveryResponseSchema,
  BillingBalanceSchema,
  BillingTransactionsPageSchema,
  BillingBatchesPageSchema,
  BillingTopupsPageSchema,
  BillingPriceTierListSchema,
  CreateBillingCheckoutSessionResponseSchema,
  BillingCheckoutSessionStatusSchema,
  CreateBillingPortalSessionResponseSchema,
  WorkspaceSubscriptionSummarySchema,
  IssueLimitUsageSchema,
  WorkspaceSubscriptionPricesSchema,
  CreateWorkspaceSubscriptionCheckoutResponseSchema,
  WorkspaceSubscriptionSeatReconcileResultSchema,
  WorkspaceSeatPurchasePreviewSchema,
  PurchaseWorkspaceSeatsResponseSchema,
  CreateWorkspaceSubscriptionPortalResponseSchema,
  DingTalkInstallationSchema,
  ListDingTalkInstallationsResponseSchema,
  ListDingTalkGroupsResponseSchema,
  RedeemDingTalkBindingTokenResponseSchema,
  EMPTY_DINGTALK_INSTALLATION,
  EMPTY_LIST_DINGTALK_INSTALLATIONS_RESPONSE,
  EMPTY_LIST_DINGTALK_GROUPS_RESPONSE,
  EMPTY_REDEEM_DINGTALK_BINDING_TOKEN_RESPONSE,
  WecomInstallationSchema,
  ListWecomInstallationsResponseSchema,
  RedeemWecomBindingTokenResponseSchema,
  BeginWecomInstallResponseSchema,
  MALFORMED_BEGIN_WECOM_INSTALL_RESPONSE,
  WecomInstallStatusResponseSchema,
  MALFORMED_WECOM_INSTALL_STATUS_RESPONSE,
  EMPTY_WECOM_INSTALLATION,
  EMPTY_LIST_WECOM_INSTALLATIONS_RESPONSE,
  ListLarkInstallationsResponseSchema,
  EMPTY_LIST_LARK_INSTALLATIONS_RESPONSE,
  EMPTY_REDEEM_WECOM_BINDING_TOKEN_RESPONSE,
  TelegramInstallationSchema,
  ListTelegramInstallationsResponseSchema,
  RedeemTelegramBindingTokenResponseSchema,
  EMPTY_TELEGRAM_INSTALLATION,
  EMPTY_LIST_TELEGRAM_INSTALLATIONS_RESPONSE,
  EMPTY_REDEEM_TELEGRAM_BINDING_TOKEN_RESPONSE,
  EMPTY_BILLING_BALANCE,
  EMPTY_BILLING_TRANSACTIONS_PAGE,
  EMPTY_BILLING_BATCHES_PAGE,
  EMPTY_BILLING_TOPUPS_PAGE,
  EMPTY_BILLING_PRICE_TIER_LIST,
  EMPTY_CREATE_BILLING_CHECKOUT_SESSION_RESPONSE,
  EMPTY_BILLING_CHECKOUT_SESSION_STATUS,
  EMPTY_CREATE_BILLING_PORTAL_SESSION_RESPONSE,
  EMPTY_CANCEL_TASK_RESPONSE,
  EMPTY_CHAT_DRAFT_RESTORES,
  CreateFeedbackResponseSchema,
  EMPTY_CREATE_FEEDBACK_RESPONSE,
  InboxUnreadSummarySchema,
  EMPTY_INBOX_UNREAD_SUMMARY,
  IssueUnreadPageSchema,
  AgentAppsResponseSchema,
  AppActivityResponseSchema,
  AppCatalogResponseSchema,
  AppConnectInitSchema,
  AppRequestListSchema,
  AppRequestSchema,
  AppRulesResponseSchema,
  AppSettingsResponseSchema,
  AppToolsResponseSchema,
  AppsOverviewSchema,
  EMPTY_APP_CATALOG,
  EMPTY_APPS_OVERVIEW,
  EMPTY_TEAM_APP_IMPACT,
  IssueAppCallsResponseSchema,
  TeamAppImpactSchema,
  EMPTY_ISSUE_UNREAD_PAGE,
  SubscribedIssueIdsSchema,
  IssueInboxReadSchema,
  InboxDeleteSchema,
  InboxItemListSchema,
  ArchivedInboxPageSchema,
  ArchivedInboxFacetsSchema,
  EMPTY_INBOX_ITEMS,
  NotificationPreferenceResponseSchema,
  EMPTY_NOTIFICATION_PREFERENCE_RESPONSE,
  LabelSchema,
  ListLabelsResponseSchema,
  ListIssueStatusesResponseSchema,
  IssueStatusEntrySchema,
  ListIssueWorkflowsResponseSchema,
  IssueWorkflowSchema,
  IssueWorkflowDryRunResponseSchema,
  EMPTY_LIST_ISSUE_WORKFLOWS_RESPONSE,
  EMPTY_ISSUE_WORKFLOW,
  EMPTY_ISSUE_WORKFLOW_DRY_RUN,
  WorkflowHandoffPreviewSchema,
  EMPTY_WORKFLOW_HANDOFF_PREVIEW,
  IssueWorkflowBriefPreviewSchema,
  IssuePropertySchema,
  ListPropertiesResponseSchema,
  IssuePropertiesResponseSchema,
  QuickActionSchema,
  ListQuickActionsResponseSchema,
  QuickActionRenderSchema,
  EMPTY_QUICK_ACTION,
  EMPTY_LIST_QUICK_ACTIONS_RESPONSE,
  CommentSchema,
  EMPTY_COMMENT,
  EMPTY_ISSUE_PROPERTY,
  EMPTY_LIST_PROPERTIES_RESPONSE,
  EMPTY_ISSUE_PROPERTIES_RESPONSE,
  EMPTY_ISSUE_PULL_REQUESTS_RESPONSE,
  IssuePullRequestsResponseSchema,
  EMPTY_ISSUE_ENVIRONMENTS_RESPONSE,
  IssueEnvironmentsResponseSchema,
  ResourceLabelsResponseSchema,
  EMPTY_LABEL,
  EMPTY_LIST_LABELS_RESPONSE,
  EMPTY_LIST_ISSUE_STATUSES_RESPONSE,
  EMPTY_ISSUE_STATUS_ENTRY,
  EMPTY_RESOURCE_LABELS_RESPONSE,
  GitHubConnectResponseSchema,
  ListGitHubInstallationsResponseSchema,
  ListGitHubRepositoriesResponseSchema,
  EMPTY_GITHUB_CONNECT_RESPONSE,
  EMPTY_LIST_GITHUB_INSTALLATIONS_RESPONSE,
  EMPTY_LIST_GITHUB_REPOSITORIES_RESPONSE,
  RuntimeModelListRequestSchema,
  MALFORMED_RUNTIME_MODEL_LIST_REQUEST,
  SkillSchema,
  EMPTY_SKILL,
  SkillSummaryListSchema,
  EMPTY_SKILL_SUMMARY_LIST,
  SkillVersionSchema,
  EMPTY_SKILL_VERSION,
  SkillVersionSummaryListSchema,
  EMPTY_SKILL_VERSION_SUMMARY_LIST,
  SkillImportResultSchema,
  EMPTY_SKILL_IMPORT_RESULT,
  IssueViewSchema,
  IssueViewListSchema,
  IssueViewPreferenceSchema,
  EMPTY_ISSUE_VIEW_PREFERENCE,
  EMPTY_PLUGIN_INSTALLATION,
  EMPTY_WORKSPACE_MCP_SERVER,
  EMPTY_PLUGIN_INSTALLATION_LIST,
  EMPTY_PLUGIN_PREVIEW,
  EMPTY_PLUGIN_PACKAGE,
  EMPTY_PLUGIN_PACKAGE_LIST,
  EMPTY_PLUGIN_SURFACE_LAUNCH,
  PluginHookResultSchema,
  PluginInstallationListResponseSchema,
  PluginPackageListResponseSchema,
  PluginPackageSchema,
  PluginSurfaceLaunchSchema,
  PluginInvocationListSchema,
  PluginMCPToolListSchema,
  PluginTokenIssueSchema,
  PluginInstallationSchema,
  PluginPreviewSchema,
  WorkspaceMcpServerListSchema,
  WorkspaceMcpServerSchema,
  ShareLinkSchema,
  ShareLinkListResponseSchema,
  ShareLinkInfoSchema,
  JoinShareLinkResponseSchema,
  EMPTY_SHARE_LINK,
  EMPTY_SHARE_LINK_INFO,
  EMPTY_JOIN_SHARE_LINK_RESPONSE,
  WorkspaceListItemSchema,
  WorkspacePinnedSchema,
  CreatorSchema,
  CreatorListResponseSchema,
  EMPTY_CREATOR,
  EMPTY_CREATOR_LIST_RESPONSE,
  CreatorPostSchema,
  CreatorPostListResponseSchema,
  EMPTY_CREATOR_POST,
  EMPTY_CREATOR_POST_LIST_RESPONSE,
  CreatorPostMetricSchema,
  CreatorPostMetricListResponseSchema,
  EMPTY_CREATOR_POST_METRIC,
  EMPTY_CREATOR_POST_METRIC_LIST_RESPONSE,
  CreatorHealthListResponseSchema,
  EMPTY_CREATOR_HEALTH_LIST_RESPONSE,
  CreatorHealthDetailResponseSchema,
  EMPTY_CREATOR_HEALTH_DETAIL_RESPONSE,
  CreatorVideoListResponseSchema,
  EMPTY_CREATOR_VIDEO_LIST_RESPONSE,
  CrmClientSchema,
  CrmClientListResponseSchema,
  EMPTY_CRM_CLIENT,
  EMPTY_CRM_CLIENT_LIST_RESPONSE,
  CrmBriefSchema,
  CrmBriefListResponseSchema,
  EMPTY_CRM_BRIEF,
  EMPTY_CRM_BRIEF_LIST_RESPONSE,
  CrmCollabSchema,
  CrmCollabListResponseSchema,
  EMPTY_CRM_COLLAB,
  EMPTY_CRM_COLLAB_LIST_RESPONSE,
  CrmSettlementSchema,
  CrmSettlementListResponseSchema,
  EMPTY_CRM_SETTLEMENT,
  EMPTY_CRM_SETTLEMENT_LIST_RESPONSE,
  // BD pipeline (WORKBENCH-API §20).
  BdActivitySchema,
  BdActivityListResponseSchema,
  EMPTY_BD_ACTIVITY,
  EMPTY_BD_ACTIVITY_LIST_RESPONSE,
  BdQuoteSchema,
  BdQuoteListResponseSchema,
  EMPTY_BD_QUOTE,
  EMPTY_BD_QUOTE_LIST_RESPONSE,
  BdCampaignSchema,
  BdCampaignListResponseSchema,
  EMPTY_BD_CAMPAIGN,
  EMPTY_BD_CAMPAIGN_LIST_RESPONSE,
  BdPipelineSchema,
  EMPTY_BD_PIPELINE,
  ImportPreviewResponseSchema,
  EMPTY_IMPORT_PREVIEW_RESPONSE,
  WorkbenchCapabilitiesResponseSchema,
  EMPTY_WORKBENCH_CAPABILITIES_RESPONSE,
  WorkbenchRoleTemplateSchema,
  EMPTY_WORKBENCH_ROLE_TEMPLATE,
  WorkbenchRoleTemplateListResponseSchema,
  EMPTY_WORKBENCH_ROLE_TEMPLATE_LIST_RESPONSE,
  BdPerformanceSchema,
  EMPTY_BD_PERFORMANCE,
  WorkbenchCountsResponseSchema,
  EMPTY_WORKBENCH_COUNTS_RESPONSE,
  WorkbenchFinanceResponseSchema,
  EMPTY_WORKBENCH_FINANCE_RESPONSE,
  WorkbenchFinanceMonthSchema,
  EMPTY_WORKBENCH_FINANCE_MONTH,
  WorkbenchFinanceMonthListResponseSchema,
  EMPTY_WORKBENCH_FINANCE_MONTH_LIST,
  AffiliateProductSchema,
  AffiliateProductListResponseSchema,
  EMPTY_AFFILIATE_PRODUCT,
  EMPTY_AFFILIATE_PRODUCT_LIST_RESPONSE,
  AffiliatePickSchema,
  AffiliatePickListResponseSchema,
  EMPTY_AFFILIATE_PICK,
  EMPTY_AFFILIATE_PICK_LIST_RESPONSE,
  AffiliateDailySchema,
  AffiliateDailyListResponseSchema,
  EMPTY_AFFILIATE_DAILY,
  EMPTY_AFFILIATE_DAILY_LIST_RESPONSE,
  AffiliateSettlementSchema,
  AffiliateSettlementListResponseSchema,
  EMPTY_AFFILIATE_SETTLEMENT,
  EMPTY_AFFILIATE_SETTLEMENT_LIST_RESPONSE,
  AffiliateSummaryResponseSchema,
  EMPTY_AFFILIATE_SUMMARY_RESPONSE,
  // Content workbench (§12).
  MediaIPSchema,
  MediaIPListResponseSchema,
  EMPTY_MEDIA_IP,
  EMPTY_MEDIA_IP_LIST_RESPONSE,
  MediaIPDetailSchema,
  EMPTY_MEDIA_IP_DETAIL,
  MediaIPAccountSchema,
  EMPTY_MEDIA_IP_ACCOUNT,
  MediaTopicSchema,
  MediaTopicListResponseSchema,
  EMPTY_MEDIA_TOPIC,
  EMPTY_MEDIA_TOPIC_LIST_RESPONSE,
  MediaScriptSchema,
  MediaScriptListResponseSchema,
  EMPTY_MEDIA_SCRIPT,
  EMPTY_MEDIA_SCRIPT_LIST_RESPONSE,
  MediaShootSchema,
  MediaShootListResponseSchema,
  EMPTY_MEDIA_SHOOT,
  EMPTY_MEDIA_SHOOT_LIST_RESPONSE,
  // Hotspot radar / benchmark teardown (§21).
  MediaHotSchema,
  MediaHotListResponseSchema,
  EMPTY_MEDIA_HOT,
  EMPTY_MEDIA_HOT_LIST_RESPONSE,
  MediaBenchSchema,
  MediaBenchListResponseSchema,
  EMPTY_MEDIA_BENCH,
  EMPTY_MEDIA_BENCH_LIST_RESPONSE,
  // General manager workbench (§13).
  GoalSchema,
  GoalDetailSchema,
  GoalListResponseSchema,
  GoalKeyResultSchema,
  GoalPackageSchema,
  GoalIssueSchema,
  EMPTY_GOAL,
  EMPTY_GOAL_DETAIL,
  EMPTY_GOAL_LIST_RESPONSE,
  EMPTY_GOAL_KEY_RESULT,
  EMPTY_GOAL_PACKAGE,
  EMPTY_GOAL_ISSUE,
  MarketSignalSchema,
  MarketSignalListResponseSchema,
  MarketSignalConvertResponseSchema,
  EMPTY_MARKET_SIGNAL,
  EMPTY_MARKET_SIGNAL_LIST_RESPONSE,
  EMPTY_MARKET_SIGNAL_CONVERT_RESPONSE,
  HrJobSchema,
  HrJobListResponseSchema,
  EMPTY_HR_JOB,
  EMPTY_HR_JOB_LIST_RESPONSE,
  HrCandidateSchema,
  HrCandidateListResponseSchema,
  EMPTY_HR_CANDIDATE,
  EMPTY_HR_CANDIDATE_LIST_RESPONSE,
  HrInterviewSchema,
  HrInterviewListResponseSchema,
  EMPTY_HR_INTERVIEW,
  EMPTY_HR_INTERVIEW_LIST_RESPONSE,
  HrScorecardSchema,
  HrScorecardListResponseSchema,
  EMPTY_HR_SCORECARD,
  EMPTY_HR_SCORECARD_LIST_RESPONSE,
  HrEmployeeProfileSchema,
  HrEmployeeProfileListResponseSchema,
  HireHrCandidateResponseSchema,
  EMPTY_HR_EMPLOYEE_PROFILE,
  EMPTY_HR_EMPLOYEE_PROFILE_LIST_RESPONSE,
  EMPTY_HIRE_HR_CANDIDATE_RESPONSE,
  // Interview questions and per-round guides (§14).
  HrQuestionSchema,
  HrQuestionListResponseSchema,
  EMPTY_HR_QUESTION,
  EMPTY_HR_QUESTION_LIST_RESPONSE,
  HrInterviewGuideSchema,
  HrGuideListResponseSchema,
  HrGuideGenerateResponseSchema,
  EMPTY_HR_INTERVIEW_GUIDE,
  EMPTY_HR_GUIDE_LIST_RESPONSE,
  EMPTY_HR_GUIDE_GENERATE_RESPONSE,
  HrOffboardingSchema,
  HrOffboardingListResponseSchema,
  HrOffboardingAdvanceResponseSchema,
  EMPTY_HR_OFFBOARDING,
  EMPTY_HR_OFFBOARDING_LIST_RESPONSE,
  EMPTY_HR_OFFBOARDING_ADVANCE_RESPONSE,
  HrEmployeeChangeSchema,
  HrEmployeeChangeListResponseSchema,
  EMPTY_HR_EMPLOYEE_CHANGE,
  EMPTY_HR_EMPLOYEE_CHANGE_LIST_RESPONSE,
  HrEmployeeRewardSchema,
  HrEmployeeRewardListResponseSchema,
  EMPTY_HR_EMPLOYEE_REWARD,
  EMPTY_HR_EMPLOYEE_REWARD_LIST_RESPONSE,
  // HR documents (docs/engineering/WORKBENCH-API.md §18).
  HrDocTemplateSchema,
  HrDocTemplateListResponseSchema,
  EMPTY_HR_DOC_TEMPLATE,
  EMPTY_HR_DOC_TEMPLATE_LIST_RESPONSE,
  HrDocGenerationListResponseSchema,
  HrDocGenerationEnvelopeSchema,
  EMPTY_HR_DOC_GENERATION_LIST_RESPONSE,
  EMPTY_HR_DOC_GENERATION_ENVELOPE,
  type IssueView,
  type IssueViewPreference,
  type CreateIssueViewRequest,
} from "./schemas";

// 千川投放的响应解析器（WORKBENCH-API §25）。单独一个模块，因为它只有读：
// 写入口是 `cmd/qianchuan-sync`，这里没有对应的 mutation 要一起放。
import {
  AdsSummarySchema,
  EMPTY_ADS_SUMMARY,
  AdsAccountListSchema,
  EMPTY_ADS_ACCOUNTS,
  AdsPlanListSchema,
  EMPTY_ADS_PLANS,
  AdsMaterialListSchema,
  EMPTY_ADS_MATERIALS,
  AdsViolationListSchema,
  EMPTY_ADS_VIOLATIONS,
  AdsReconListSchema,
  EMPTY_ADS_RECON,
} from "./qianchuan";

/** Identifies the calling client to the server.
 *  Sent on every HTTP request as X-Client-Platform / X-Client-Version /
 *  X-Client-OS so the backend can log, gate, or split metrics by client.
 *  See server/internal/middleware/client.go for the receiving end. */
export interface ApiClientIdentity {
  /** Logical client kind. Server expects: "web" | "desktop" | "cli" | "daemon". */
  platform?: string;
  /** Client/app version string (e.g. "0.1.0", git tag, commit). */
  version?: string;
  /** Coarse operating-system bucket (for example "macos", "windows", or "linux"). */
  os?: string;
}

export interface ApiClientOptions {
  logger?: Logger;
  onUnauthorized?: () => void;
  /** Identifies the client to the server. Sent as X-Client-* headers. */
  identity?: ApiClientIdentity;
  /**
   * Reads the bearer token from shared storage at request time (token mode
   * only; omit in cookie mode).
   *
   * Without it the token is per-instance, and Desktop runs one ApiClient per
   * window over one shared localStorage: a session renewed in window A would
   * leave every other window still sending the token it happened to be
   * holding, until that one expired and took the whole session down with it
   * (MUL-7436). Reading through means there is one current credential, not one
   * per window.
   */
  getToken?: () => string | null;
}

export interface ClientRuntimeSnapshot {
  probe_result: "success" | "error";
  runtime_count?: number;
  provider_summary?: Record<string, number>;
  online_count?: number;
  offline_count?: number;
}

export interface ClientUsageRequest {
  install_id: string;
  runtime?: ClientRuntimeSnapshot;
}

export interface LoginResponse {
  token: string;
  user: User;
  /**
   * The account signed in with a password that must be replaced before the
   * session may be used (CONTRACTS.md 登录契约). Absent means "no change
   * needed"; older servers never send it.
   */
  must_change_password?: boolean;
}

/** Which sign-in methods `GET /api/config` advertises under `auth`. */
export interface AuthConfig {
  password_enabled: boolean;
  code_login_enabled: boolean;
}

/**
 * The pre-contract shape: a server without the `auth` block has no password
 * sign-in and keeps email codes, which is exactly how every client behaved
 * before the endpoints existed.
 */
export const DEFAULT_AUTH_CONFIG: AuthConfig = {
  password_enabled: false,
  code_login_enabled: true,
};

function authFlag(source: Record<string, unknown>, key: string, fallback: boolean): boolean {
  const value = source[key];
  return typeof value === "boolean" ? value : fallback;
}

/**
 * Reads the `auth` block out of an already-fetched `/api/config` payload.
 * Unknown shapes fall back to {@link DEFAULT_AUTH_CONFIG} instead of throwing:
 * a login screen that cannot learn its options must still render the flow
 * that works everywhere.
 */
export function parseAuthConfig(raw: unknown): AuthConfig {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_AUTH_CONFIG };
  const auth = (raw as { auth?: unknown }).auth;
  if (!auth || typeof auth !== "object") return { ...DEFAULT_AUTH_CONFIG };
  const source = auth as Record<string, unknown>;
  return {
    password_enabled: authFlag(source, "password_enabled", DEFAULT_AUTH_CONFIG.password_enabled),
    code_login_enabled: authFlag(source, "code_login_enabled", DEFAULT_AUTH_CONFIG.code_login_enabled),
  };
}

function parseSearchIndexResponse<T>(raw: unknown, schema: ZodType, endpoint: string): T {
  const parsed = parseWithFallback<T | null>(raw, schema, null, { endpoint });
  if (parsed === null) throw new Error(`Malformed response from ${endpoint}`);
  return parsed;
}

export class ApiError extends Error {
  readonly status: number;
  readonly statusText: string;
  // Raw decoded JSON body (when the server returned one). Carries structured
  // error fields like `code` so callers can branch on machine-readable
  // identifiers instead of pattern-matching the human-readable message.
  readonly body?: unknown;

  constructor(message: string, status: number, statusText: string, body?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.statusText = statusText;
    this.body = body;
  }
}

/**
 * The `409 stale_write` a guarded workbench PATCH answers
 * (docs/engineering/COLLAB-MODEL.md §3).
 *
 * `current` is the row the server holds, already parsed: the caller's job is to
 * *show* it — "somebody changed this, here is what it says now" — not to replay
 * its own body over the other writer's edit. Carrying the row on the error is
 * what makes that possible without a second request.
 *
 * It extends `ApiError`, so code that only branches on `status` (a toast, a
 * generic retry) keeps working.
 */
export class StaleWriteError<T> extends ApiError {
  readonly current: T;

  constructor(message: string, current: T, body?: unknown) {
    super(message, 409, "Conflict", body);
    this.name = "StaleWriteError";
    this.current = current;
  }
}

/** Whether a mutation error is the optimistic-concurrency refusal (§3). */
export function isStaleWrite<T>(error: unknown): error is StaleWriteError<T> {
  return error instanceof StaleWriteError;
}

/**
 * Re-throws a 409 `stale_write` as a `StaleWriteError` carrying the parsed
 * current row, and any other error unchanged.
 *
 * The four guarded ledgers route their PATCH through this, so a page's mutation
 * error tells it "refresh" rather than "save failed", without every call site
 * re-parsing the 409 body.
 */
function rethrowStaleWrite<T>(
  error: unknown,
  schema: ZodType,
  fallback: T,
  endpoint: string,
): never {
  if (error instanceof ApiError && error.status === 409 && isStaleWriteBody(error.body)) {
    throw new StaleWriteError(
      error.message,
      parseWithFallback(error.body.current, schema, fallback, { endpoint }),
      error.body,
    );
  }
  throw error;
}

/** The 409 body the server writes: `{ error: "stale_write", current: {...} }`. */
function isStaleWriteBody(
  body: unknown,
): body is { error: "stale_write"; current: unknown } {
  return (
    typeof body === "object" &&
    body !== null &&
    (body as { error?: unknown }).error === "stale_write"
  );
}

function assertAgentConversationStartersWriteSupported(data: {
  conversation_starters?: unknown;
}): void {
  if (
    Object.prototype.hasOwnProperty.call(data, "conversation_starters") &&
    !configStore.getState().agentConversationStartersSupported
  ) {
    throw new Error(
      "This server version does not support agent conversation starters. Update the server before saving them.",
    );
  }
}

function requestedIssueCreateProperties(
  data: CreateIssueRequest,
): NonNullable<CreateIssueRequest["properties"]> | undefined {
  const properties = data.properties;
  return properties && Object.keys(properties).length > 0 ? properties : undefined;
}

function assertIssueCreatePropertiesSnapshot(
  requested: NonNullable<CreateIssueRequest["properties"]> | undefined,
  issue: Issue,
): void {
  if (!requested) return;
  for (const propertyId of Object.keys(requested)) {
    // The server may canonicalize a valid request (trim a URL, order and
    // de-duplicate a multi-select, normalize an actor UUID). Presence is the
    // integrity signal here; IssueSchema has already validated the value type.
    if (!Object.prototype.hasOwnProperty.call(issue.properties, propertyId)) {
      throw new Error(
        `Issue ${issue.identifier || issue.id} was created, but the server did not confirm its custom properties. Review the issue before retrying.`,
      );
    }
  }
}

// errorCode extracts the stable `code` a handler attaches to a failure
// (writeErrorCode), so a caller can render its own localized sentence instead
// of toasting the server's English one. Returns undefined for a non-ApiError,
// or a server that did not send one — the caller then falls back to
// err.message, which is what every endpoint that has not adopted this yet
// produces.
export function errorCode(err: unknown): string | undefined {
  if (err instanceof ApiError && err.body && typeof err.body === "object") {
    const code = (err.body as { code?: unknown }).code;
    if (typeof code === "string" && code.length > 0) return code;
  }
  return undefined;
}

// dispatchReasonCode extracts the stable, machine-readable admission reason
// (MUL-4525) from a blocked-trigger error's structured body, when present. UI
// callers localize a blocked/partial trigger from this code instead of pattern
// matching the human-readable message. Returns undefined for non-ApiErrors or
// bodies without a reason_code (older servers), so callers fall back to their
// generic failure toast.
export function dispatchReasonCode(err: unknown): string | undefined {
  if (err instanceof ApiError && err.body && typeof err.body === "object") {
    const code = (err.body as { reason_code?: unknown }).reason_code;
    if (typeof code === "string" && code.length > 0) return code;
  }
  return undefined;
}

// clientErrorMessage returns the server's message only when it is a CLIENT
// error (4xx). Handlers write those for the user — "autopilot is not active",
// "Idempotency-Key is too long" — so they are worth rendering. A 5xx message is
// internal detail (Go error chains, pgx table/constraint names, internal ids)
// that must never reach a toast (MUL-6472), and a non-ApiError is a transport
// failure whose message ("Failed to fetch") says nothing a user can act on.
// Both return undefined so the caller falls back to its own localized sentence.
export function clientErrorMessage(err: unknown): string | undefined {
  if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
    return err.message || undefined;
  }
  return undefined;
}

// Thrown by getAttachmentTextContent when the server refuses to inline a
// file because it exceeds the server-configured preview limit. UI maps to a "too large, please
// download" affordance with the Download CTA still available.
export class PreviewTooLargeError extends Error {
  constructor() {
    super("attachment too large for inline preview");
    this.name = "PreviewTooLargeError";
  }
}

// Thrown by getAttachmentTextContent when the server's text whitelist
// rejects the content type. Normally the client's isPreviewable() guard
// catches this earlier, but the two whitelists can drift — surfacing the
// 415 as a typed error makes the drift visible.
export class PreviewUnsupportedError extends Error {
  constructor() {
    super("attachment type not supported for inline preview");
    this.name = "PreviewUnsupportedError";
  }
}

function remapSkillImportError(err: unknown): unknown {
  if (!(err instanceof ApiError) || !err.body || typeof err.body !== "object") {
    return err;
  }
  const body = err.body as { reason?: unknown; error?: unknown };
  const reason = typeof body.reason === "string" && body.reason ? body.reason : "";
  const error = typeof body.error === "string" && body.error ? body.error : "";
  const message = reason || error;
  if (!message || message === err.message) return err;
  return new ApiError(message, err.status, err.statusText, err.body);
}

function skillFromImportResult(raw: unknown, endpoint: string): Skill {
  const result = parseWithFallback(
    raw,
    SkillImportResultSchema,
    EMPTY_SKILL_IMPORT_RESULT,
    { endpoint },
  );
  if (
    (result.status === "created" || result.status === "updated") &&
    result.skill
  ) {
    const skill = parseWithFallback(result.skill, SkillSchema, EMPTY_SKILL, {
      endpoint,
    });
    if (skill.id) return skill;
  }
  throw new Error(result.reason || "Import failed");
}

/**
 * Advertised in X-Client-Capabilities so the server knows this client can
 * recover a cancelled prompt from the durable draft-restore row (#5219).
 * Must stay in sync with protocol.AppCapabilityChatDraftRestoreV1.
 */
export const CHAT_DRAFT_RESTORE_CAPABILITY = "chat-draft-restore-v1";

/**
 * Body shared by both unsubscribe endpoints: an omitted target means "the
 * caller", which the server resolves from the request actor.
 */
function subscriberTarget(
  userId?: string,
  userType?: string,
): Record<string, string> {
  const body: Record<string, string> = {};
  if (userId) body.user_id = userId;
  if (userType) body.user_type = userType;
  return body;
}

/**
 * Per-call override for the workspace a request targets.
 *
 * `authHeaders()` normally stamps `X-Workspace-Slug` from the global
 * current-workspace singleton, and the server resolves the workspace from that
 * header BEFORE any `workspace_id` query param. Anything that acts on a
 * workspace the user is not currently "in" — notably the create-workspace flow,
 * which provisions a workspace it has not navigated to yet — must say so
 * explicitly, or a concurrent writer of that singleton silently redirects the
 * write to the wrong workspace.
 */
type WorkspaceScope = string | { workspaceId: string };

function workspaceHeader(
  scope?: WorkspaceScope,
): Record<string, string> | undefined {
  if (typeof scope === "object") {
    // The server resolves slugs first, so suppress the ambient route slug.
    return { "X-Workspace-Slug": "", "X-Workspace-ID": scope.workspaceId };
  }
  return scope ? { "X-Workspace-Slug": scope } : undefined;
}

/**
 * Builds a workbench list query string.
 *
 * `null`, `undefined` and `""` are omitted — a filter key present but empty would
 * otherwise narrow the result to nothing. Booleans and numbers are sent as-is:
 * `paid=false` is a real filter ("still owed"), not an absent one.
 */
function workbenchSearch(
  params: Record<string, string | number | boolean | null | undefined>,
): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const encoded = search.toString();
  return encoded ? `?${encoded}` : "";
}

function dingTalkGroupSearch(params: ListDingTalkGroupsParams): string {
  const search = new URLSearchParams();
  if (params.activity) search.set("activity", params.activity);
  if (params.installationId) search.set("installation_id", params.installationId);
  if (params.offset !== undefined) search.set("offset", String(params.offset));
  if (params.limit !== undefined) search.set("limit", String(params.limit));
  const encoded = search.toString();
  return encoded ? `?${encoded}` : "";
}

// The server's exact wording for a rejected CSRF token
// (server/internal/middleware/auth.go). Matched rather than inferred from the
// status, because 403 also covers real authorization failures that must not
// be retried.
const CSRF_REJECTED_ERROR = "CSRF validation failed";

// One header, two possible values — see ApiClient.readCsrfValue.
const CSRF_HEADER = "X-CSRF-Token";
const CSRF_COOKIE = "multica_csrf";
const SESSION_CSRF_COOKIE = "multica_csrf_session";

/**
 * Whether a request body can be sent a second time. Strings and multipart
 * forms can; a stream cannot, and silently replaying a half-consumed one
 * would send a truncated request.
 */
function isReplayableBody(body: BodyInit | null | undefined): boolean {
  if (body === undefined || body === null) return true;
  if (typeof body === "string") return true;
  if (typeof FormData !== "undefined" && body instanceof FormData) return true;
  if (typeof URLSearchParams !== "undefined" && body instanceof URLSearchParams)
    return true;
  return false;
}

export class ApiClient {
  private baseUrl: string;
  private token: string | null = null;
  private logger: Logger;
  // Set by loginWithPassword, read once through consumeMustChangePassword.
  private mustChangePassword = false;
  private options: ApiClientOptions;

  constructor(baseUrl: string, options?: ApiClientOptions) {
    this.baseUrl = baseUrl;
    this.options = options ?? {};
    this.logger = options?.logger ?? noopLogger;
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  setToken(token: string | null) {
    this.token = token;
  }

  /**
   * The bearer token this client is currently using, or null in cookie mode.
   *
   * Prefers the shared-storage reader when one is configured, so every window
   * agrees on the current credential rather than each trusting its own copy.
   */
  getToken(): string | null {
    const shared = this.options.getToken?.();
    if (shared !== undefined) return shared;
    return this.token;
  }

  /**
   * Which of the two CSRF cookies to echo (MUL-7436).
   *
   * The session-bound value is preferred: it survives a sliding renewal, so a
   * request another tab built before a renewal still validates after it. The
   * token-bound value is the fallback, and it is what a server running the
   * PREVIOUS release can verify — after a rollback the session-bound value is
   * meaningless to it.
   *
   * Both travel in the same header. A second header name would have to be in
   * that server's CORS allowlist, and a rolled-back server allowlists only the
   * names it shipped with: the preflight would fail and no retry could help.
   *
   * `csrfSessionValueRejected` records the exact session-bound value a server
   * refused, so the fallback is used for as long as that value is current and
   * no longer — a renewal or a new login replaces the cookie and the preferred
   * binding is tried again. Keying on the value rather than a boolean is what
   * stops this from oscillating once per renewal against a current server.
   */
  private csrfSessionValueRejected: string | null = null;

  private readCsrfValue(): string | null {
    const sessionBound = this.readCookie(SESSION_CSRF_COOKIE);
    if (sessionBound && sessionBound !== this.csrfSessionValueRejected) {
      return sessionBound;
    }
    return this.readCookie(CSRF_COOKIE) ?? sessionBound;
  }

  private readCookie(name: string): string | null {
    if (typeof document === "undefined") return null;
    const prefix = `${name}=`;
    const match = document.cookie.split("; ").find((c) => c.startsWith(prefix));
    return match ? match.slice(prefix.length) || null : null;
  }

  private authHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};
    const token = this.getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const slug = getCurrentSlug();
    if (slug) headers["X-Workspace-Slug"] = slug;
    const csrf = this.readCsrfValue();
    if (csrf) headers[CSRF_HEADER] = csrf;
    const id = this.options.identity;
    if (id?.platform) headers["X-Client-Platform"] = id.platform;
    if (id?.version) headers["X-Client-Version"] = id.version;
    if (id?.os) headers["X-Client-OS"] = id.os;
    return headers;
  }

  /**
   * A 401 ends the session — unless the credential it answered has already
   * been replaced.
   *
   * A request that went out just before a renewal (or from another window
   * still finishing one) carries the previous token, and its 401 arrives
   * AFTER the new one is in storage. Treating that as expiry would tear down
   * a session that is demonstrably alive, clearing drafts and tabs with it
   * (MUL-7028). Comparing against the credential in use now is what tells the
   * two apart: a genuinely expired session still has the same token stored,
   * so the real case is unaffected.
   *
   * "Replaced" includes going from no credential to one. A flow that was
   * already running at logout can still send a bearer-less request, and its
   * 401 may land after the user has signed in again (#10190). Cookie mode is
   * null on both sides, so its expiries still end the session.
   */
  private handleUnauthorized(credentialUsed: string | null) {
    if (this.getToken() !== credentialUsed) {
      this.logger.info("ignoring 401 for a credential that has since been replaced");
      return;
    }
    this.token = null;
    // Workspace id is owned by the URL-driven workspace-storage singleton
    // (set by [workspaceSlug]/layout.tsx). On 401, the auth flow navigates
    // to /login which leaves the workspace route, and the next workspace
    // entry will overwrite the id. No clear needed here.
    this.options.onUnauthorized?.();
  }

  private async parseErrorMessage(res: Response, fallback: string): Promise<string> {
    try {
      const data = await res.json() as { error?: string };
      if (typeof data.error === "string" && data.error) return data.error;
    } catch {
      // Ignore non-JSON error bodies.
    }
    return fallback;
  }

  // Reads the response body once for both human-readable error message and
  // structured fields. The Response stream can only be consumed once, so
  // both pieces have to come from a single read.
  private async parseErrorBody(res: Response, fallback: string): Promise<{ message: string; body: unknown }> {
    try {
      const data = await res.json() as { error?: string };
      const message = typeof data.error === "string" && data.error ? data.error : fallback;
      return { message, body: data };
    } catch {
      return { message: fallback, body: undefined };
    }
  }

  // Sends the request with the standard headers (auth, CSRF, request id,
  // client identity) and runs the shared error path (401 → handleUnauthorized,
  // structured ApiError, status-aware log level). Returns the raw Response so
  // callers can decide how to decode the body — JSON for the typed `fetch<T>`
  // path, plain text for the attachment-preview proxy, etc.
  private async fetchRaw(
    path: string,
    init?: RequestInit & { extraHeaders?: Record<string, string> },
  ): Promise<Response> {
    const rid = createRequestId();
    const start = Date.now();
    const method = init?.method ?? "GET";

    // Rebuilt per attempt rather than captured once: authHeaders() reads the
    // CSRF cookie at call time, and the retry below exists precisely because
    // that cookie may have just been replaced.
    const buildHeaders = (): Record<string, string> => ({
      "X-Request-ID": rid,
      ...this.authHeaders(),
      ...(init?.extraHeaders ?? {}),
      ...((init?.headers as Record<string, string>) ?? {}),
    });

    // Captured before the request so a late 401 can be matched against the
    // credential it actually used, not whatever is current when it lands.
    const credentialUsed = this.getToken();

    this.logger.info(`→ ${method} ${path}`, { rid });

    const send = () =>
      fetch(`${this.baseUrl}${path}`, {
        ...init,
        headers: buildHeaders(),
        credentials: "include",
      });

    let res = await send();

    // Two things can make a CSRF value the server refuses, and one retry
    // covers both (MUL-7436):
    //
    //   - It went stale. The first renewal of a session that predates the
    //     session-bound binding rotates the cookie the old value was keyed to,
    //     and a request another tab had already built carries the previous
    //     one. Rebuilding the headers re-reads the cookie.
    //   - The server does not understand it. After a rollback, the previous
    //     release can only verify the token-bound binding. Recording the
    //     rejected value switches this client to that binding until the cookie
    //     changes again.
    //
    // Neither is an attack, and neither should surface as a failed write.
    if (res.status === 403 && isReplayableBody(init?.body)) {
      const { message } = await this.parseErrorBody(res.clone(), "");
      if (message === CSRF_REJECTED_ERROR) {
        this.csrfSessionValueRejected = this.readCookie(SESSION_CSRF_COOKIE);
        this.logger.info(`↻ ${method} ${path} (CSRF token rejected, retrying once)`, { rid });
        res = await send();
      }
    }

    if (!res.ok) {
      if (res.status === 401) this.handleUnauthorized(credentialUsed);
      const { message, body } = await this.parseErrorBody(res, `API error: ${res.status} ${res.statusText}`);
      const logLevel = res.status === 404 ? "warn" : "error";
      this.logger[logLevel](`← ${res.status} ${path}`, { rid, duration: `${Date.now() - start}ms`, error: message });
      throw new ApiError(message, res.status, res.statusText, body);
    }

    this.logger.info(`← ${res.status} ${path}`, { rid, duration: `${Date.now() - start}ms` });
    return res;
  }

  private async fetch<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await this.fetchRaw(path, {
      ...init,
      extraHeaders: { "Content-Type": "application/json" },
    });
    // Handle 204 No Content
    if (res.status === 204) {
      return undefined as T;
    }
    return res.json() as Promise<T>;
  }

  // Auth

  /**
   * Sign-in capabilities from `GET /api/config`. One request, no caching: the
   * login screen is the only caller and it mounts at most once per session.
   * Throws when the endpoint is missing or unreachable so the caller can tell
   * "this server has no password login" apart from "password login is off".
   */
  async getAuthConfig(): Promise<AuthConfig> {
    return parseAuthConfig(await this.fetch<unknown>("/api/config"));
  }

  /**
   * Email + password sign-in. The credentials go straight to our server, which
   * verifies the Argon2id hash and issues its own session. No provider SDK and
   * no third-party access token is involved.
   */
  async loginWithPassword(email: string, password: string): Promise<LoginResponse> {
    const response = await this.fetch<LoginResponse>("/auth/password/login", {
      method: "POST",
      body: JSON.stringify({ email: email.trim(), password }),
    });
    this.mustChangePassword = response.must_change_password === true;
    return response;
  }

  /**
   * True when the most recent password login said the account has to choose a
   * new password before anything else. One-shot: the flag is cleared on read so
   * a reload does not reopen the form for an account that already changed it.
   */
  consumeMustChangePassword(): boolean {
    const required = this.mustChangePassword;
    this.mustChangePassword = false;
    return required;
  }

  /** Sets the signed-in account's own password (`POST /api/me/password`). */
  async changePassword(newPassword: string, currentPassword?: string): Promise<void> {
    await this.fetch("/api/me/password", {
      method: "POST",
      body: JSON.stringify({
        new_password: newPassword,
        ...(currentPassword ? { current_password: currentPassword } : {}),
      }),
    });
  }
  async getSupabaseConfig(): Promise<SupabasePasswordConfig> {
    return this.fetch("/auth/supabase/config");
  }

  async loginWithSupabasePassword(email: string, password: string): Promise<LoginResponse> {
    const config = await this.getSupabaseConfig();
    const access_token = await signInWithSupabasePassword(config, email, password);
    // Never forward password, client user ID/email, refresh tokens or metadata.
    return this.fetch("/auth/supabase", {
      method: "POST",
      body: JSON.stringify({ access_token }),
    });
  }

  async sendCode(email: string): Promise<void> {
    await this.fetch("/auth/send-code", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
  }

  async verifyCode(email: string, code: string): Promise<LoginResponse> {
    return this.fetch("/auth/verify-code", {
      method: "POST",
      body: JSON.stringify({ email, code }),
    });
  }

  async googleLogin(code: string, redirectUri: string): Promise<LoginResponse> {
    return this.fetch("/auth/google", {
      method: "POST",
      body: JSON.stringify({ code, redirect_uri: redirectUri }),
    });
  }

  async logout(): Promise<void> {
    await this.fetch("/auth/logout", { method: "POST" });
  }

  async issueCliToken(): Promise<{ token: string }> {
    return this.fetch("/api/cli-token", { method: "POST" });
  }

  /**
   * Ask the server to extend this session if it has entered its renewal
   * window. The server owns that decision — no client reads `exp` or
   * compares it against a local clock, which is what keeps clock skew out of
   * the picture entirely.
   *
   * Cookie-mode callers never need this: middleware.Auth re-issues their
   * cookie inline on any authenticated safe request.
   */
  async refreshSession(): Promise<RefreshSessionResponse> {
    const raw = await this.fetch<unknown>("/api/auth/refresh", {
      method: "POST",
    });
    return parseWithFallback<RefreshSessionResponse>(
      raw,
      RefreshSessionResponseSchema,
      EMPTY_REFRESH_SESSION_RESPONSE,
      { endpoint: "POST /api/auth/refresh" },
    );
  }

  async getMe(): Promise<User> {
    const raw = await this.fetch<unknown>("/api/me");
    return parseWithFallback(raw, UserSchema, EMPTY_USER, {
      endpoint: "GET /api/me",
    });
  }

  async markOnboardingComplete(payload?: {
    completion_path?: OnboardingCompletionPath;
    workspace_id?: string;
  }): Promise<User> {
    const raw = await this.fetch<unknown>("/api/me/onboarding/complete", {
      method: "POST",
      body: payload ? JSON.stringify(payload) : undefined,
    });
    return parseWithFallback(raw, UserSchema, EMPTY_USER, {
      endpoint: "POST /api/me/onboarding/complete",
    });
  }

  async joinCloudWaitlist(payload: {
    email: string;
    reason?: string;
  }): Promise<User> {
    const raw = await this.fetch<unknown>("/api/me/onboarding/cloud-waitlist", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return parseWithFallback(raw, UserSchema, EMPTY_USER, {
      endpoint: "POST /api/me/onboarding/cloud-waitlist",
    });
  }

  async patchOnboarding(payload: {
    questionnaire?: Record<string, unknown>;
  }): Promise<User> {
    const raw = await this.fetch<unknown>("/api/me/onboarding", {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    return parseWithFallback(raw, UserSchema, EMPTY_USER, {
      endpoint: "PATCH /api/me/onboarding",
    });
  }

  async markWhatsNewSeen(version: string): Promise<User> {
    const raw = await this.fetch<unknown>("/api/me/whats-new/seen", {
      method: "POST",
      body: JSON.stringify({ version }),
    });
    return parseWithFallback(raw, UserSchema, EMPTY_USER, {
      endpoint: "POST /api/me/whats-new/seen",
    });
  }

  /** Rejects with 409 when the server decides the prompt is not due. */
  async claimStarPromptShowing(): Promise<User> {
    const raw = await this.fetch<unknown>("/api/me/star-prompt/claim", { method: "POST" });
    return parseWithFallback(raw, UserSchema, EMPTY_USER, {
      endpoint: "POST /api/me/star-prompt/claim",
    });
  }

  async markStarPromptStarred(): Promise<User> {
    const raw = await this.fetch<unknown>("/api/me/star-prompt/starred", { method: "POST" });
    return parseWithFallback(raw, UserSchema, EMPTY_USER, {
      endpoint: "POST /api/me/star-prompt/starred",
    });
  }

  async updateMe(data: UpdateMeRequest): Promise<User> {
    const raw = await this.fetch<unknown>("/api/me", {
      method: "PATCH",
      body: JSON.stringify(data),
    });
    return parseWithFallback(raw, UserSchema, EMPTY_USER, {
      endpoint: "PATCH /api/me",
    });
  }

  // Issues
  async listIssues(params?: ListIssuesParams): Promise<ListIssuesResponse> {
    const search = new URLSearchParams();
    if (params?.limit) search.set("limit", String(params.limit));
    if (params?.offset) search.set("offset", String(params.offset));
    if (params?.workspace_id) search.set("workspace_id", params.workspace_id);
    if (params?.q?.trim()) search.set("q", params.q.trim());
    if (params?.status) search.set("status", params.status);
    if (params?.statuses?.length) search.set("statuses", params.statuses.join(","));
    if (params?.status_category) search.set("status_category", params.status_category);
    if (params?.status_categories?.length) search.set("status_categories", params.status_categories.join(","));
    if (params?.priority) search.set("priority", params.priority);
    if (params?.priorities?.length) search.set("priorities", params.priorities.join(","));
    if (params?.assignee_id) search.set("assignee_id", params.assignee_id);
    if (params?.assignee_ids?.length) search.set("assignee_ids", params.assignee_ids.join(","));
    if (params?.assignee_types?.length) search.set("assignee_types", params.assignee_types.join(","));
    if (params?.creator_id) search.set("creator_id", params.creator_id);
    if (params?.created_by_user_id) search.set("created_by_user_id", params.created_by_user_id);
    if (params?.project_id) search.set("project_id", params.project_id);
    if (params?.assignee_filters?.length) {
      search.set("assignee_filters", params.assignee_filters.map((f) => `${f.type}:${f.id}`).join(","));
    }
    if (params?.include_no_assignee) search.set("include_no_assignee", "true");
    if (params?.creator_filters?.length) {
      search.set("creator_filters", params.creator_filters.map((f) => `${f.type}:${f.id}`).join(","));
    }
    if (params?.project_ids?.length) search.set("project_ids", params.project_ids.join(","));
    if (params?.include_no_project) search.set("include_no_project", "true");
    if (params?.label_ids?.length) search.set("label_ids", params.label_ids.join(","));
    if (params?.top_level_only) search.set("top_level_only", "true");
    // No `.length` guard on purpose: an empty ids array must still send
    // `ids=` — the server treats a PRESENT-but-empty list as an empty window
    // (nothing running), while an absent param means no restriction.
    if (params?.ids) search.set("ids", params.ids.join(","));
    if (params?.involves_user_id) search.set("involves_user_id", params.involves_user_id);
    if (params?.metadata && Object.keys(params.metadata).length > 0) {
      search.set("metadata", JSON.stringify(params.metadata));
    }
    if (params?.properties && Object.keys(params.properties).length > 0) {
      search.set("properties", JSON.stringify(params.properties));
    }
    if (params?.open_only) search.set("open_only", "true");
    if (params?.scheduled) search.set("scheduled", "true");
    if (params?.date_field) search.set("date_field", params.date_field);
    if (params?.date_start) search.set("date_start", params.date_start);
    if (params?.date_end) search.set("date_end", params.date_end);
    if (params?.sort_by) search.set("sort", params.sort_by);
    if (params?.sort_direction) search.set("direction", params.sort_direction);
    // An ids facet can carry hundreds of UUIDs (agents-working filter) —
    // enough to blow the ~8 KB request-line cap of common reverse proxies.
    // Route those windows through the POST twin, which takes the SAME
    // key/value pairs as a JSON body.
    if (params?.ids) {
      const raw = await this.fetch<unknown>("/api/issues/query", {
        method: "POST",
        body: JSON.stringify(Object.fromEntries(search)),
      });
      if (params?.created_by_user_id && (
        !raw || typeof raw !== "object" || !("created_by_user_id" in raw) ||
        raw.created_by_user_id !== params.created_by_user_id
      )) {
        return this.listIssues({ ...params, created_by_user_id: undefined, creator_id: params.creator_id ?? params.created_by_user_id });
      }
      return parseWithFallback(raw, ListIssuesResponseSchema, EMPTY_LIST_ISSUES_RESPONSE, {
        endpoint: "POST /api/issues/query",
      });
    }
    const path = `/api/issues?${search}`;
    const raw = await this.fetch<unknown>(path);
    // Older servers silently ignore unknown query parameters. Never expose
    // their unfiltered response as a Created list.
    if (params?.created_by_user_id && (!raw || typeof raw !== "object" || !("created_by_user_id" in raw) || raw.created_by_user_id !== params.created_by_user_id)) {
      return this.listIssues({ ...params, created_by_user_id: undefined, creator_id: params.creator_id ?? params.created_by_user_id });
    }
    return parseWithFallback(raw, ListIssuesResponseSchema, EMPTY_LIST_ISSUES_RESPONSE, {
      endpoint: "GET /api/issues",
    });
  }

  async listGroupedIssues(params: ListGroupedIssuesParams): Promise<GroupedIssuesResponse> {
    const search = new URLSearchParams({ group_by: params.group_by });
    if (params.limit) search.set("limit", String(params.limit));
    if (params.offset) search.set("offset", String(params.offset));
    if (params.workspace_id) search.set("workspace_id", params.workspace_id);
    if (params.statuses?.length) search.set("statuses", params.statuses.join(","));
    if (params.priorities?.length) search.set("priorities", params.priorities.join(","));
    if (params.assignee_types?.length) search.set("assignee_types", params.assignee_types.join(","));
    if (params.assignee_id) search.set("assignee_id", params.assignee_id);
    if (params.assignee_ids?.length) search.set("assignee_ids", params.assignee_ids.join(","));
    if (params.creator_id) search.set("creator_id", params.creator_id);
    if (params.created_by_user_id) search.set("created_by_user_id", params.created_by_user_id);
    if (params.project_id) search.set("project_id", params.project_id);
    if (params.involves_user_id) search.set("involves_user_id", params.involves_user_id);
    if (params.metadata && Object.keys(params.metadata).length > 0) {
      search.set("metadata", JSON.stringify(params.metadata));
    }
    if (params.properties && Object.keys(params.properties).length > 0) {
      search.set("properties", JSON.stringify(params.properties));
    }
    if (params.assignee_filters?.length) {
      search.set("assignee_filters", params.assignee_filters.map((f) => `${f.type}:${f.id}`).join(","));
    }
    if (params.include_no_assignee) search.set("include_no_assignee", "true");
    if (params.creator_filters?.length) {
      search.set("creator_filters", params.creator_filters.map((f) => `${f.type}:${f.id}`).join(","));
    }
    if (params.project_ids?.length) search.set("project_ids", params.project_ids.join(","));
    if (params.include_no_project) search.set("include_no_project", "true");
    if (params.label_ids?.length) search.set("label_ids", params.label_ids.join(","));
    if (params.group_assignee_type) search.set("group_assignee_type", params.group_assignee_type);
    if (params.group_assignee_id) search.set("group_assignee_id", params.group_assignee_id);
    if (params.date_field) search.set("date_field", params.date_field);
    if (params.date_start) search.set("date_start", params.date_start);
    if (params.date_end) search.set("date_end", params.date_end);
    if (params.sort_by) search.set("sort", params.sort_by);
    if (params.sort_direction) search.set("direction", params.sort_direction);
    const raw = await this.fetch<unknown>(`/api/issues/grouped?${search}`);
    if (params.created_by_user_id && (!raw || typeof raw !== "object" || !("created_by_user_id" in raw) || raw.created_by_user_id !== params.created_by_user_id)) {
      return this.listGroupedIssues({ ...params, created_by_user_id: undefined, creator_id: params.creator_id ?? params.created_by_user_id });
    }
    return parseWithFallback(raw, GroupedIssuesResponseSchema, EMPTY_GROUPED_ISSUES_RESPONSE, {
      endpoint: "GET /api/issues/grouped",
    });
  }

  async listIssueTableGroups(params: IssueTableGroupsRequest): Promise<IssueTableGroupsResponse> {
    const raw = await this.fetch<unknown>("/api/issues/table/groups", {
      method: "POST",
      body: JSON.stringify(params),
    });
    return parseWithFallback(
      raw,
      IssueTableGroupsResponseSchema,
      EMPTY_ISSUE_TABLE_GROUPS_RESPONSE,
      { endpoint: "POST /api/issues/table/groups" },
    );
  }

  async listIssueTableRows(params: IssueTableRowsRequest): Promise<IssueTableRowsResponse> {
    const raw = await this.fetch<unknown>("/api/issues/table/rows", {
      method: "POST",
      body: JSON.stringify(params),
    });
    return parseWithFallback(
      raw,
      IssueTableRowsResponseSchema,
      EMPTY_ISSUE_TABLE_ROWS_RESPONSE,
      { endpoint: "POST /api/issues/table/rows" },
    );
  }

  async listIssueTableFacets(params: IssueTableFacetsRequest): Promise<IssueTableFacetsResponse> {
    const raw = await this.fetch<unknown>("/api/issues/table/facets", {
      method: "POST",
      body: JSON.stringify(params),
    });
    return parseWithFallback(
      raw,
      IssueTableFacetsResponseSchema,
      EMPTY_ISSUE_TABLE_FACETS_RESPONSE,
      { endpoint: "POST /api/issues/table/facets" },
    );
  }

  async searchIssues(params: { q: string; limit?: number; offset?: number; include_closed?: boolean; signal?: AbortSignal }): Promise<SearchIssuesResponse> {
    const search = new URLSearchParams({ q: params.q });
    if (params.limit !== undefined) search.set("limit", String(params.limit));
    if (params.offset !== undefined) search.set("offset", String(params.offset));
    if (params.include_closed) search.set("include_closed", "true");
    const raw = await this.fetch<unknown>(
      `/api/issues/search?${search}`,
      params.signal ? { signal: params.signal } : undefined,
    );
    return parseWithFallback(raw, SearchIssuesResponseSchema, EMPTY_SEARCH_ISSUES_RESPONSE, {
      endpoint: "GET /api/issues/search",
    });
  }

  async searchProjects(params: { q: string; limit?: number; offset?: number; include_closed?: boolean; signal?: AbortSignal }): Promise<SearchProjectsResponse> {
    const search = new URLSearchParams({ q: params.q });
    if (params.limit !== undefined) search.set("limit", String(params.limit));
    if (params.offset !== undefined) search.set("offset", String(params.offset));
    if (params.include_closed) search.set("include_closed", "true");
    const raw = await this.fetch<unknown>(
      `/api/projects/search?${search}`,
      params.signal ? { signal: params.signal } : undefined,
    );
    return parseWithFallback(raw, SearchProjectsResponseSchema, EMPTY_SEARCH_PROJECTS_RESPONSE, {
      endpoint: "GET /api/projects/search",
    });
  }

  // Local search index sync (MUL-7754). Each call names its workspace so a
  // request issued for one workspace cannot be answered for whichever one the
  // tab has switched to since. A body that fails its schema rejects rather
  // than degrading: an empty page would be applied to the local copy as truth.
  async getSearchIndexManifest(params: { workspaceSlug: string; signal?: AbortSignal }): Promise<SearchIndexManifest> {
    const raw = await this.fetch<unknown>("/api/search-index/manifest", {
      headers: { "X-Workspace-Slug": params.workspaceSlug },
      signal: params.signal,
    });
    return parseSearchIndexResponse<SearchIndexManifest>(raw, SearchIndexManifestSchema, "GET /api/search-index/manifest");
  }

  async getSearchIndexSnapshot(params: {
    workspaceSlug: string;
    afterNumber: number;
    limit?: number;
    signal?: AbortSignal;
  }): Promise<SearchIndexSnapshotPage> {
    const search = new URLSearchParams({ after_number: String(params.afterNumber) });
    if (params.limit !== undefined) search.set("limit", String(params.limit));
    const raw = await this.fetch<unknown>(`/api/search-index/snapshot?${search}`, {
      headers: { "X-Workspace-Slug": params.workspaceSlug },
      signal: params.signal,
    });
    return parseSearchIndexResponse<SearchIndexSnapshotPage>(raw, SearchIndexSnapshotPageSchema, "GET /api/search-index/snapshot");
  }

  async getSearchIndexChanges(params: {
    workspaceSlug: string;
    cursor: string;
    limit?: number;
    signal?: AbortSignal;
  }): Promise<SearchIndexChanges> {
    const raw = await this.fetch<unknown>("/api/search-index/changes", {
      method: "POST",
      headers: { "X-Workspace-Slug": params.workspaceSlug },
      body: JSON.stringify({ cursor: params.cursor, limit: params.limit }),
      signal: params.signal,
    });
    return parseSearchIndexResponse<SearchIndexChanges>(raw, SearchIndexChangesSchema, "POST /api/search-index/changes");
  }

  /**
   * Fetch one issue by UUID **or** by bare identifier ("MUL-123"): the server
   * resolves `PREFIX-NUMBER` against the workspace's own prefix through the
   * unique `(workspace_id, number)` index, and 404s on a wrong prefix or a
   * missing number.
   *
   * `signal` remains optional for callers that need to abort an in-flight
   * lookup; identifier autolink resolution intentionally lets it complete.
   *
   * The 2xx body is validated, not cast. A single issue is not a list: there
   * is no safe-empty shape to degrade to, and the identifier-autolink caller
   * caches this result for 5 minutes, so a field-missing or type-drifted 200
   * must not become a truthy issue with an `undefined` id. Like createIssue,
   * an unusable body fails the call — and it fails with a plain Error, never
   * an ApiError 404, so `issueIdentifierOptions` propagates it instead of
   * caching it as "no such issue".
   */
  async listWorkspaceWakeups(filters: WorkspaceWakeupFilters): Promise<WorkspaceWakeupPage> {
    const params = new URLSearchParams(Object.entries(filters).map(([key, value]) => [key, String(value)]));
    const raw = await this.fetch<unknown>(`/api/issue-wakeups?${params}`);
    const parsed = parseWithFallback<WorkspaceWakeupPage | null>(raw, WorkspaceWakeupPageSchema, null, { endpoint: "GET /api/issue-wakeups" });
    if (!parsed) throw new Error("Could not load workspace wakeups");
    return parsed;
  }

  async listIssueWakeups(issueId: string): Promise<IssueWakeup[]> {
    const raw = await this.fetch<unknown>(`/api/issues/${encodeURIComponent(issueId)}/wakeups`);
    const parsed = parseWithFallback<IssueWakeup[] | null>(raw, IssueWakeupSchema.array(), null, { endpoint: "GET /api/issues/:id/wakeups" });
    if (!parsed) throw new Error("Could not load wakeups");
    return parsed;
  }

  async listIssueWakeupSummaries(): Promise<IssueWakeupSummaryRow[]> {
    const raw = await this.fetch<unknown>("/api/issue-wakeup-summaries");
    const parsed = parseWithFallback<IssueWakeupSummaryRow[] | null>(raw, IssueWakeupSummaryRowSchema.array(), null, { endpoint: "GET /api/issue-wakeup-summaries" });
    if (!parsed) throw new Error("Could not load wakeup summaries");
    return parsed;
  }

  async enableIssueWakeup(issueId: string, wakeupId: string, input: { revision: number; at?: string; rearm?: boolean }): Promise<void> {
    await this.fetch(`/api/issues/${encodeURIComponent(issueId)}/wakeups/${encodeURIComponent(wakeupId)}/enable`, { method: "POST", body: JSON.stringify(input) });
  }

  async editIssueWakeupInstruction(issueId: string, wakeupId: string, input: { instruction: string; expected_instruction: string; revision: number }): Promise<void> {
    await this.fetch(`/api/issues/${encodeURIComponent(issueId)}/wakeups/${encodeURIComponent(wakeupId)}/instruction`, { method: "PATCH", body: JSON.stringify(input) });
  }

  async createIssueWakeup(issueId: string, input: IssueWakeupInput): Promise<void> {
    await this.fetch(`/api/issues/${encodeURIComponent(issueId)}/wakeups`, { method: "POST", body: JSON.stringify(input) });
  }

  async listIssueSystemWakeups(issueId: string): Promise<SystemWakeup[]> {
    const raw = await this.fetch<unknown>(`/api/issues/${encodeURIComponent(issueId)}/system-wakeups`);
    const parsed = parseWithFallback<SystemWakeup[] | null>(raw, SystemWakeupSchema.array(), null, { endpoint: "GET /api/issues/:id/system-wakeups" });
    if (!parsed) throw new Error("Could not load system wakeups");
    return parsed;
  }

  async listIssueWakeupRuns(issueId: string, wakeupId: string): Promise<WakeupRun[]> {
    const raw = await this.fetch<unknown>(`/api/issues/${encodeURIComponent(issueId)}/wakeups/${encodeURIComponent(wakeupId)}/runs`);
    const parsed = parseWithFallback<WakeupRun[] | null>(raw, WakeupRunSchema.array(), null, { endpoint: "GET /api/issues/:id/wakeups/:wakeupId/runs" });
    if (!parsed) throw new Error("Could not load wakeup runs");
    return parsed;
  }

  async listPausedWakeups(): Promise<PausedWakeup[]> {
    const raw = await this.fetch<unknown>("/api/issue-wakeup-paused");
    return parseWithFallback<PausedWakeup[]>(raw, PausedWakeupSchema.array(), [], { endpoint: "GET /api/issue-wakeup-paused" });
  }

  async triggerIssueWakeup(issueId: string, wakeupId: string): Promise<void> {
    await this.fetch(`/api/issues/${encodeURIComponent(issueId)}/wakeups/${encodeURIComponent(wakeupId)}/trigger`, { method: "POST" });
  }

  async deleteIssueWakeup(issueId: string, wakeupId: string): Promise<void> {
    await this.fetch(`/api/issues/${encodeURIComponent(issueId)}/wakeups/${encodeURIComponent(wakeupId)}`, { method: "DELETE" });
  }

  async updateIssueSystemWakeup(issueId: string, rule: SystemWakeup["rule"], input: { enabled?: boolean; instruction?: string }): Promise<void> {
    await this.fetch(`/api/issues/${encodeURIComponent(issueId)}/system-wakeups/${encodeURIComponent(rule)}`, { method: "PUT", body: JSON.stringify(input) });
  }

  async listWorkspaceSystemWakeups(): Promise<WorkspaceSystemWakeup[]> {
    const raw = await this.fetch<unknown>("/api/system-wakeups");
    const parsed = parseWithFallback<WorkspaceSystemWakeup[] | null>(raw, WorkspaceSystemWakeupSchema.array(), null, { endpoint: "GET /api/system-wakeups" });
    if (!parsed) throw new Error("Could not load system wakeups");
    return parsed;
  }

  async updateWorkspaceSystemWakeup(rule: WorkspaceSystemWakeup["rule"], input: { enabled?: boolean; instruction?: string }): Promise<void> {
    await this.fetch(`/api/system-wakeups/${encodeURIComponent(rule)}`, { method: "PUT", body: JSON.stringify(input) });
  }

  async disableIssueWakeup(issueId: string, wakeupId: string): Promise<void> {
    await this.fetch(`/api/issues/${encodeURIComponent(issueId)}/wakeups/${encodeURIComponent(wakeupId)}/disable`, { method: "POST" });
  }

  async getIssue(id: string, options?: { signal?: AbortSignal }): Promise<Issue> {
    const raw = await this.fetch<unknown>(
      `/api/issues/${encodeURIComponent(id)}`,
      options?.signal ? { signal: options.signal } : undefined,
    );
    const issue = parseWithFallback<Issue | null>(raw, IssueSchema, null, {
      endpoint: "GET /api/issues/:id",
    });
    if (!issue) {
      // parseWithFallback already logged the zod issues + raw payload.
      throw new Error("GET /api/issues/:id returned a malformed issue");
    }
    return issue;
  }

  async createIssue(
    data: CreateIssueRequest,
    workspaceSlug?: string,
  ): Promise<Issue> {
    const requestedProperties = requestedIssueCreateProperties(data);
    if (requestedProperties) {
      const config = await this.getConfig();
      if (config.issue_create_properties_supported !== true) {
        throw new Error(
          "This server version does not support atomic custom properties on issue creation. Update the server before creating this issue.",
        );
      }
    }
    // Parse through a schema (not a raw cast): the create modal keys its
    // label-attach compatibility fallback off `labels` being absent vs a
    // validated Label[], so an unvalidated wrong shape must not slip through.
    // Unlike list endpoints, a create that returns an unusable body is a
    // FAILED mutation, not a safe-empty read: fall back to null and reject so
    // the modal keeps the draft and shows a failure toast instead of a blank
    // "created" card pointing at an empty issue id. parseWithFallback already
    // logged the schema issues + raw payload; the empty message lets the modal
    // render its localized "failed to create" toast.
    const raw = await this.fetch<unknown>("/api/issues", {
      method: "POST",
      headers: workspaceHeader(workspaceSlug),
      body: JSON.stringify(data),
    });
    const issue = parseWithFallback<Issue | null>(raw, CreateIssueResponseSchema, null, {
      endpoint: "POST /api/issues",
    });
    if (!issue) {
      throw new Error();
    }
    assertIssueCreatePropertiesSnapshot(requestedProperties, issue);
    return issue;
  }

  async quickCreateIssue(data: {
    agent_id?: string;
    squad_id?: string;
    prompt: string;
    priority?: IssuePriority;
    due_date?: string;
    project_id?: string | null;
    parent_issue_id?: string | null;
    attachment_ids?: string[];
  }): Promise<{ task_id: string }> {
    return this.fetch("/api/issues/quick-create", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async getCommentSubIssuePreview(anchorCommentId: string): Promise<SourceContextPreview> {
    const raw = await this.fetch<unknown>(`/api/comments/${anchorCommentId}/sub-issue-preview`);
    const preview = parseWithFallback<SourceContextPreview | null>(
      raw,
      SourceContextPreviewSchema,
      null,
      { endpoint: "GET /api/comments/:id/sub-issue-preview" },
    );
    if (!preview) throw new Error("Invalid source context preview response");
    return preview;
  }

  async createCommentSubIssue(
    anchorCommentId: string,
    data: CreateCommentSubIssueManualRequest,
  ): Promise<Issue>;
  async createCommentSubIssue(
    anchorCommentId: string,
    data: CreateCommentSubIssueAgentRequest,
  ): Promise<{ task_id: string }>;
  async createCommentSubIssue(
    anchorCommentId: string,
    data: CreateCommentSubIssueRequest,
  ): Promise<Issue | { task_id: string }> {
    try {
      const requestedProperties =
        data.mode === "manual" ? requestedIssueCreateProperties(data.issue) : undefined;
      if (requestedProperties) {
        const config = await this.getConfig();
        if (config.issue_create_properties_supported !== true) {
          throw new Error(
            "This server version does not support atomic custom properties on issue creation. Update the server before creating this issue.",
          );
        }
      }
      const raw = await this.fetch<unknown>(`/api/comments/${anchorCommentId}/sub-issues`, {
        method: "POST",
        body: JSON.stringify(data),
      });
      if (data.mode === "manual") {
        const issue = parseWithFallback<Issue | null>(raw, CreateIssueResponseSchema, null, {
          endpoint: "POST /api/comments/:id/sub-issues (manual)",
        });
        if (!issue) throw new Error("Invalid sub-issue response");
        assertIssueCreatePropertiesSnapshot(requestedProperties, issue);
        return issue;
      }
      const task = parseWithFallback<{ task_id: string } | null>(
        raw,
        CommentSubIssueTaskResponseSchema,
        null,
        { endpoint: "POST /api/comments/:id/sub-issues (agent)" },
      );
      if (!task) throw new Error("Invalid quick-create response");
      return task;
    } catch (error) {
      if (error instanceof ApiError && (error.status === 404 || error.status === 405)) {
        throw new ApiError(
          "Source-context sub-issues require a newer server",
          error.status,
          error.statusText,
          { code: "source_context_server_unsupported" },
        );
      }
      throw error;
    }
  }

  async createFeedback(data: {
    message: string;
    url?: string;
    workspace_id?: string;
    kind?: FeedbackKind;
    context?: FeedbackContext;
  }): Promise<CreateFeedbackResponse> {
    const raw = await this.fetch<unknown>("/api/feedback", {
      method: "POST",
      body: JSON.stringify(data),
    });
    return parseWithFallback(raw, CreateFeedbackResponseSchema, EMPTY_CREATE_FEEDBACK_RESPONSE, {
      endpoint: "POST /api/feedback",
    });
  }

  async upsertClientUsage(data: ClientUsageRequest): Promise<void> {
    await this.fetch("/api/client-usage", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateIssue(id: string, data: UpdateIssueRequest): Promise<Issue> {
    return this.fetch(`/api/issues/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async moveIssue(id: string, data: MoveIssueRequest): Promise<Issue> {
    return this.fetch(`/api/issues/${id}/move`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async listIssueDuplicates(id: string): Promise<IssueDuplicates> {
    const raw = await this.fetch<unknown>(`/api/issues/${id}/duplicates`);
    return parseWithFallback(
      raw,
      IssueDuplicatesResponseSchema,
      { duplicate_of: null, duplicates: [] },
      { endpoint: "GET /api/issues/:id/duplicates" },
    );
  }

  async listChildIssues(id: string): Promise<{ issues: Issue[] }> {
    const raw = await this.fetch<unknown>(`/api/issues/${id}/children`);
    return parseWithFallback(raw, ChildIssuesResponseSchema, { issues: [] }, {
      endpoint: "GET /api/issues/:id/children",
    });
  }

  /** Batched variant — returns children for multiple parents in one request.
   *  Avoids an N-request fan-out in Swimlane (one per visible parent lane).
   *  parentIds must be non-empty; pass a sorted, deduplicated list so the
   *  React Query cache key is stable across renders. */
  async listChildrenByParents(parentIds: string[]): Promise<{ issues: Issue[] }> {
    const raw = await this.fetch<unknown>(
      `/api/issues/children?parent_ids=${parentIds.join(",")}`,
    );
    return parseWithFallback(raw, ChildIssuesResponseSchema, { issues: [] }, {
      endpoint: "GET /api/issues/children",
    });
  }

  async getChildIssueProgress(): Promise<{
    progress: { parent_issue_id: string; total: number; done: number }[];
  }> {
    const raw = await this.fetch<unknown>("/api/issues/child-progress");
    return parseWithFallback(
      raw,
      ChildIssueProgressResponseSchema,
      { progress: [] },
      { endpoint: "GET /api/issues/child-progress" },
    );
  }

  async getIssueLimitUsage(): Promise<IssueLimitUsage | null> {
    const raw = await this.fetch<unknown>("/api/issues/limit-usage");
    if (raw == null) return null;
    return parseWithFallback<IssueLimitUsage | null>(
      raw,
      IssueLimitUsageSchema,
      null,
      { endpoint: "GET /api/issues/limit-usage" },
    );
  }

  async deleteIssue(id: string): Promise<void> {
    await this.fetch(`/api/issues/${id}`, { method: "DELETE" });
  }

  async batchUpdateIssues(issueIds: string[], updates: UpdateIssueRequest): Promise<{ updated: number }> {
    return this.fetch("/api/issues/batch-update", {
      method: "POST",
      body: JSON.stringify({ issue_ids: issueIds, updates }),
    });
  }

  async batchDeleteIssues(issueIds: string[]): Promise<{ deleted: number }> {
    return this.fetch("/api/issues/batch-delete", {
      method: "POST",
      body: JSON.stringify({ issue_ids: issueIds }),
    });
  }

  // Comments
  async listComments(issueId: string): Promise<Comment[]> {
    const raw = await this.fetch<unknown>(`/api/issues/${issueId}/comments`);
    return parseWithFallback(raw, CommentsListSchema, [], {
      endpoint: "GET /api/issues/:id/comments",
    });
  }

  async createComment(
    issueId: string,
    content: string,
    type?: string,
    parentId?: string,
    attachmentIds?: string[],
    suppressAgentIds?: string[],
    steerTaskIds?: string[],
  ): Promise<Comment> {
    return this.fetch(`/api/issues/${issueId}/comments`, {
      method: "POST",
      body: JSON.stringify({
        content,
        type: type ?? "comment",
        ...(parentId ? { parent_id: parentId } : {}),
        ...(attachmentIds?.length ? { attachment_ids: attachmentIds } : {}),
        ...(suppressAgentIds?.length ? { suppress_agent_ids: suppressAgentIds } : {}),
        ...(steerTaskIds?.length ? { steer_task_ids: steerTaskIds } : {}),
      }),
    });
  }

  async previewCommentTriggers(issueId: string, content: string, parentId?: string, editingCommentId?: string): Promise<CommentTriggerPreview> {
    const raw = await this.fetch<unknown>(`/api/issues/${issueId}/comments/trigger-preview`, {
      method: "POST",
      body: JSON.stringify({
        content,
        ...(parentId ? { parent_id: parentId } : {}),
        ...(editingCommentId ? { editing_comment_id: editingCommentId } : {}),
      }),
    });
    return parseWithFallback(raw, CommentTriggerPreviewSchema, { agents: [] }, {
      endpoint: "POST /api/issues/:id/comments/trigger-preview",
    });
  }

  /** Dry-run the unified run-enqueue predicate for a prospective issue write
   *  (create / single assign / single status / batch). Returns the runs that
   *  would start; no side effect. The four entry points consult this instead
   *  of re-implementing the rule (MUL-3375). */
  async previewIssueTrigger(params: IssueTriggerPreviewParams): Promise<IssueTriggerPreview> {
    const raw = await this.fetch<unknown>("/api/issues/preview-trigger", {
      method: "POST",
      body: JSON.stringify({
        ...(params.issueIds?.length ? { issue_ids: params.issueIds } : {}),
        ...(params.isCreate ? { is_create: true } : {}),
        ...(params.assigneeType ? { assignee_type: params.assigneeType } : {}),
        ...(params.assigneeId ? { assignee_id: params.assigneeId } : {}),
        ...(params.status ? { status: params.status } : {}),
      }),
    });
    return parseWithFallback(raw, IssueTriggerPreviewSchema, { triggers: [], total_count: 0 }, {
      endpoint: "POST /api/issues/preview-trigger",
    });
  }

  async listTimeline(issueId: string): Promise<TimelineEntry[]> {
    const raw = await this.fetch<unknown>(
      `/api/issues/${issueId}/timeline`,
    );
    return parseWithFallback(raw, TimelineEntriesSchema, EMPTY_TIMELINE_ENTRIES, {
      endpoint: "GET /api/issues/:id/timeline",
    });
  }

  async getAssigneeFrequency(): Promise<AssigneeFrequencyEntry[]> {
    return this.fetch("/api/assignee-frequency");
  }

  async updateComment(commentId: string, content: string, attachmentIds?: string[], suppressAgentIds?: string[], contentBase?: string, expectedRevision?: number): Promise<Comment> {
    return this.fetch(`/api/comments/${commentId}`, {
      method: "PUT",
      body: JSON.stringify({
        content,
        attachment_ids: attachmentIds,
        ...(suppressAgentIds?.length ? { suppress_agent_ids: suppressAgentIds } : {}),
        ...(contentBase !== undefined ? { content_base: contentBase } : {}),
        ...(expectedRevision !== undefined ? { expected_revision: expectedRevision } : {}),
      }),
    });
  }

  /**
   * `keepReplies` calls the route only servers that keep a deleted comment's
   * replies expose (#8296): if the request reaches an older server it fails
   * instead of deleting the replies too. Pass it only when the server declared
   * `comment_delete_keep_replies_supported`.
   */
  async deleteComment(commentId: string, opts: { keepReplies?: boolean } = {}): Promise<void> {
    const path = opts.keepReplies === true
      ? `/api/comments/${commentId}/keep-replies`
      : `/api/comments/${commentId}`;
    await this.fetch(path, { method: "DELETE" });
  }

  async resolveComment(commentId: string): Promise<Comment> {
    return this.fetch(`/api/comments/${commentId}/resolve`, { method: "POST" });
  }

  async unresolveComment(commentId: string): Promise<Comment> {
    return this.fetch(`/api/comments/${commentId}/resolve`, { method: "DELETE" });
  }

  async addReaction(commentId: string, emoji: string): Promise<Reaction> {
    return this.fetch(`/api/comments/${commentId}/reactions`, {
      method: "POST",
      body: JSON.stringify({ emoji }),
    });
  }

  async removeReaction(commentId: string, emoji: string): Promise<void> {
    await this.fetch(`/api/comments/${commentId}/reactions`, {
      method: "DELETE",
      body: JSON.stringify({ emoji }),
    });
  }

  async addIssueReaction(issueId: string, emoji: string): Promise<IssueReaction> {
    return this.fetch(`/api/issues/${issueId}/reactions`, {
      method: "POST",
      body: JSON.stringify({ emoji }),
    });
  }

  async removeIssueReaction(issueId: string, emoji: string): Promise<void> {
    await this.fetch(`/api/issues/${issueId}/reactions`, {
      method: "DELETE",
      body: JSON.stringify({ emoji }),
    });
  }

  // Subscribers
  async listIssueSubscribers(issueId: string): Promise<IssueSubscriber[]> {
    const raw = await this.fetch<unknown>(`/api/issues/${issueId}/subscribers`);
    return parseWithFallback(raw, SubscribersListSchema, [], {
      endpoint: "GET /api/issues/:id/subscribers",
    });
  }

  async subscribeToIssue(issueId: string, userId?: string, userType?: string): Promise<void> {
    const body: Record<string, string> = {};
    if (userId) body.user_id = userId;
    if (userType) body.user_type = userType;
    await this.fetch(`/api/issues/${issueId}/subscribe`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  async unsubscribeFromIssue(
    issueId: string,
    userId?: string,
    userType?: string,
  ): Promise<void> {
    await this.fetch(`/api/issues/${issueId}/unsubscribe`, {
      method: "POST",
      body: JSON.stringify(subscriberTarget(userId, userType)),
    });
  }

  /**
   * Leaves this issue and every descendant, and keeps future children of the
   * tree from re-subscribing the user — the escape hatch for an agent-built
   * tree that keeps growing (MUL-5483).
   *
   * Deliberately its own endpoint rather than a `subtree` flag on
   * `unsubscribeFromIssue`. Web/desktop staging ships on merge while the
   * backend is deployed by hand, so this client regularly runs against an
   * older server; one that predates the feature would ignore an unknown body
   * field, unsubscribe only the root, and still answer 200. A distinct path
   * 404s there, which surfaces as a failed mutation instead of a silent lie.
   */
  async unsubscribeFromIssueSubtree(
    issueId: string,
    userId?: string,
    userType?: string,
  ): Promise<void> {
    await this.fetch(`/api/issues/${issueId}/unsubscribe/subtree`, {
      method: "POST",
      body: JSON.stringify(subscriberTarget(userId, userType)),
    });
  }

  // Agents
  async listAgents(params?: { workspace_id?: string; include_archived?: boolean }): Promise<Agent[]> {
    const search = new URLSearchParams();
    if (params?.workspace_id) search.set("workspace_id", params.workspace_id);
    if (params?.include_archived) search.set("include_archived", "true");
    return this.fetch(`/api/agents?${search}`);
  }

  async getAgent(id: string): Promise<Agent> {
    return this.fetch(`/api/agents/${id}`);
  }

  async createAgent(data: CreateAgentRequest): Promise<Agent> {
    assertAgentConversationStartersWriteSupported(data);
    return this.fetch("/api/agents", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  /**
   * Provisions the workspace's built-in Chief of Staff, or returns the
   * existing one.
   *
   * Only a runtime and a language are sent: name, description, avatar,
   * permissions, and the system instruction layer are server constants, so a
   * client cannot mint an agent that would claim them. The server is also the
   * idempotency boundary — calling twice yields the same agent.
   */
  async createMikaAgent(
    data: {
      runtime_id: string;
      language: "en" | "zh" | "ko" | "ja";
      /** Empty means "whatever the runtime defaults to". */
      model?: string;
      /** Label for the onboarding conversation, used only if this call is the
       *  one that creates it. The session's identity is the member and Mika,
       *  never this string — it is localized. */
      session_title?: string;
    },
    workspaceSlug?: string,
  ): Promise<MikaBootstrapResponse> {
    return this.fetch("/api/agents/mika", {
      method: "POST",
      headers: workspaceHeader(workspaceSlug),
      body: JSON.stringify(data),
    });
  }

  async createAgentBuilderSession(data: {
    runtime_id: string;
    model?: string;
  }): Promise<AgentBuilderSession> {
    const raw = await this.fetch<unknown>("/api/agent-builder/sessions", {
      method: "POST",
      body: JSON.stringify(data),
    });
    return parseWithFallback(
      raw,
      AgentBuilderSessionSchema,
      EMPTY_AGENT_BUILDER_SESSION,
      { endpoint: "POST /api/agent-builder/sessions" },
    );
  }

  /**
   * The caller's unfinished agent-creation conversations.
   *
   * Builder sessions are hidden from every chat list (their carrier agent is
   * `kind = 'system'`), so this is the only route back to one. A 404 means the
   * backend predates the endpoint: degrade to "no drafts" instead of erroring
   * the Agents page, exactly as listChatDraftRestores does.
   */
  async listAgentBuilderSessions(): Promise<AgentBuilderSessionSummary[]> {
    let raw: unknown;
    try {
      raw = await this.fetch<unknown>("/api/agent-builder/sessions");
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) return [];
      throw err;
    }
    return parseWithFallback(
      raw,
      AgentBuilderSessionListSchema,
      EMPTY_AGENT_BUILDER_SESSION_LIST,
      { endpoint: "GET /api/agent-builder/sessions" },
    ).sessions;
  }

  /**
   * Stores the configuration a creation conversation has arrived at, including
   * edits the user typed but has not sent. Whole-object last-write-wins: one
   * conversation has one editor, so a field-level merge could only reconstruct
   * a state nobody saw. Read back through `listAgentBuilderSessions`.
   */
  async saveAgentBuilderDraft(
    sessionId: string,
    draft: StoredAgentDraft,
  ): Promise<void> {
    await this.fetch(`/api/agent-builder/sessions/${sessionId}/draft`, {
      method: "PUT",
      body: JSON.stringify({ draft }),
    });
  }

  /** Rebinds a live builder conversation to another runtime. Callers must not
   *  show the new runtime as selected until this resolves — the whole point is
   *  that the UI's runtime and the executing runtime agree.
   *
   *  A non-2xx throws before we get here and nothing was committed. Reaching the
   *  parse means the server bound `data.runtime_id`, so that is the fallback for
   *  an unparseable body — see agentBuilderRuntimeSwitchFallback. */
  async switchAgentBuilderRuntime(
    sessionId: string,
    data: { runtime_id: string },
  ): Promise<AgentBuilderRuntimeSwitch> {
    const raw = await this.fetch<unknown>(
      `/api/agent-builder/sessions/${sessionId}/runtime`,
      { method: "PATCH", body: JSON.stringify(data) },
    );
    return parseWithFallback(
      raw,
      AgentBuilderRuntimeSwitchSchema,
      agentBuilderRuntimeSwitchFallback(data.runtime_id),
      { endpoint: "PATCH /api/agent-builder/sessions/{id}/runtime" },
    );
  }

  async updateAgent(id: string, data: UpdateAgentRequest): Promise<Agent> {
    assertAgentConversationStartersWriteSupported(data);
    return this.fetch(`/api/agents/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async archiveAgent(id: string): Promise<Agent> {
    return this.fetch(`/api/agents/${id}/archive`, { method: "POST" });
  }

  /**
   * Returns the plaintext `custom_env` map for an agent. Admits the
   * agent's owner or a workspace owner/admin (MUL-5438); calls from
   * agent-actor sessions get a 403. Every successful call writes an
   * `agent_env_revealed` activity_log row server-side. MUL-2600.
   */
  async getAgentEnv(id: string): Promise<AgentEnvResponse> {
    return this.fetch(`/api/agents/${id}/env`);
  }

  /**
   * Replaces an agent's `custom_env` wholesale. Values equal to
   * `"****"` are preserved server-side (the **** guard) so a partial
   * UI edit doesn't overwrite real secrets with the masked
   * placeholder. Admits the agent's owner or a workspace owner/admin
   * (MUL-5438); agent actors get a 403. Every successful call writes an
   * `agent_env_updated` activity_log row. MUL-2600.
   */
  async updateAgentEnv(id: string, data: UpdateAgentEnvRequest): Promise<AgentEnvResponse> {
    return this.fetch(`/api/agents/${id}/env`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async restoreAgent(id: string): Promise<Agent> {
    return this.fetch(`/api/agents/${id}/restore`, { method: "POST" });
  }

  // Bulk-cancel every active task (queued/dispatched/running) for the agent.
  // Permission: agent owner or workspace admin/owner. Server returns the
  // count of cancelled rows; broadcasts task:cancelled for each so other
  // surfaces can clear their live cards.
  async cancelAgentTasks(id: string): Promise<{ cancelled: number }> {
    return this.fetch(`/api/agents/${id}/cancel-tasks`, { method: "POST" });
  }

  async listQoderEnvironments(wsId: string, token: string, baseUrl: string, signal?: AbortSignal) {
    return parseQoderCatalog(await this.fetch(`/api/workspaces/${wsId}/qoder/environments`, { method: "POST", body: JSON.stringify({ qoder_token: token, base_url: baseUrl }), signal }));
  }
  async listQoderAgents(wsId: string) {
    return parseQoderCatalog(await this.fetch(`/api/workspaces/${wsId}/qoder/agents`));
  }
  async stopQoderConnection(wsId: string) {
    return parseQoderConnection(await this.fetch(`/api/workspaces/${wsId}/qoder/stop`, { method: "POST" }));
  }
  // Refuses with 409 `runtime_delete_plan_changed` and the current
  // `active_agents` when the confirmed list no longer matches.
  async disconnectQoderConnection(wsId: string, expectedActiveAgentIds: string[]) {
    return parseQoderConnection(await this.fetch(`/api/workspaces/${wsId}/qoder`, { method: "DELETE", body: JSON.stringify({ expected_active_agent_ids: expectedActiveAgentIds }) }));
  }
  async getQoderConnection(wsId: string) {
    return parseQoderConnection(await this.fetch(`/api/workspaces/${wsId}/qoder`));
  }
  // Saving keeps a paused connection paused; use resumeQoderConnection to run again.
  async saveQoderConnection(wsId: string, input: QoderInput) {
    return parseQoderConnection(await this.fetch(`/api/workspaces/${wsId}/qoder`, { method: "PUT", body: JSON.stringify({ name: input.name, base_url: input.baseUrl, environment_id: input.environmentId, qoder_token: input.qoderToken, github_tokens: input.githubTokens, max_concurrency: input.maxConcurrency, run_timeout_minutes: input.runTimeoutMinutes }) }));
  }
  async resumeQoderConnection(wsId: string, input: QoderInput) {
    return parseQoderConnection(await this.fetch(`/api/workspaces/${wsId}/qoder/resume`, { method: "POST", body: JSON.stringify({ name: input.name, base_url: input.baseUrl, environment_id: input.environmentId, qoder_token: input.qoderToken, github_tokens: input.githubTokens, max_concurrency: input.maxConcurrency, run_timeout_minutes: input.runTimeoutMinutes }) }));
  }
  async checkQoderConnection(wsId: string, input: QoderInput): Promise<void> {
    await this.fetch(`/api/workspaces/${wsId}/qoder/check`, { method: "POST", body: JSON.stringify({ name: input.name, base_url: input.baseUrl, environment_id: input.environmentId, qoder_token: input.qoderToken, github_tokens: input.githubTokens, max_concurrency: input.maxConcurrency, run_timeout_minutes: input.runTimeoutMinutes }) });
  }

  async listRuntimes(
    params?: { workspace_id?: string; owner?: "me" },
    workspaceSlug?: string,
  ): Promise<AgentRuntime[]> {
    const search = new URLSearchParams();
    if (params?.workspace_id) search.set("workspace_id", params.workspace_id);
    if (params?.owner) search.set("owner", params.owner);
    // workspace_id alone is not enough: the server resolves the workspace from
    // the slug header first, so a caller listing another workspace's runtimes
    // must override the header too.
    const raw = await this.fetch<unknown>(`/api/runtimes?${search}`, {
      headers: workspaceHeader(workspaceSlug),
    });
    return parseWithFallback(raw, AgentRuntimeSchema.array(), [], { endpoint: "listRuntimes" });
  }

  async listCloudRuntimeNodes(
    params?: ListCloudRuntimeNodesParams,
  ): Promise<CloudRuntimeNode[]> {
    const search = new URLSearchParams();
    if (params?.limit !== undefined) search.set("limit", String(params.limit));
    if (params?.offset !== undefined) search.set("offset", String(params.offset));
    const query = search.toString();
    const raw = await this.fetch<unknown>(
      `/api/cloud-runtime/nodes${query ? `?${query}` : ""}`,
    );
    return parseWithFallback(
      raw,
      CloudRuntimeNodeListSchema,
      EMPTY_CLOUD_RUNTIME_NODE_LIST,
      { endpoint: "GET /api/cloud-runtime/nodes" },
    );
  }

  async createCloudRuntimeNode(
    data: CreateCloudRuntimeNodeRequest,
  ): Promise<CloudRuntimeNode> {
    const res = await this.fetchRaw("/api/cloud-runtime/nodes", {
      method: "POST",
      body: JSON.stringify(data),
      extraHeaders: { "Content-Type": "application/json" },
    });
    const raw = await res.json() as unknown;
    return parseWithFallback(
      raw,
      CloudRuntimeNodeSchema,
      EMPTY_CLOUD_RUNTIME_NODE,
      { endpoint: "POST /api/cloud-runtime/nodes" },
    );
  }

  async deleteCloudRuntimeNode(instanceId: string): Promise<void> {
    await this.fetchRaw("/api/cloud-runtime/nodes", {
      method: "DELETE",
      body: JSON.stringify({ instance_id: instanceId }),
      extraHeaders: { "Content-Type": "application/json" },
    });
  }

  // Cloud Billing — proxies to multica-cloud /api/v1/billing/*. The
  // multica-api server stamps X-User-ID and forwards bytes; everything
  // here is upstream-shaped. See packages/core/types/billing.ts for the
  // response field documentation.

  async getCloudBillingBalance(): Promise<BillingBalance> {
    const raw = await this.fetch<unknown>("/api/cloud-billing/balance");
    return parseWithFallback(raw, BillingBalanceSchema, EMPTY_BILLING_BALANCE, {
      endpoint: "GET /api/cloud-billing/balance",
    });
  }

  async listCloudBillingTransactions(
    params?: { page?: number; page_size?: number },
  ): Promise<BillingTransactionsPage> {
    const search = new URLSearchParams();
    if (params?.page !== undefined) search.set("page", String(params.page));
    if (params?.page_size !== undefined) search.set("page_size", String(params.page_size));
    const query = search.toString();
    const raw = await this.fetch<unknown>(
      `/api/cloud-billing/transactions${query ? `?${query}` : ""}`,
    );
    return parseWithFallback(
      raw,
      BillingTransactionsPageSchema,
      EMPTY_BILLING_TRANSACTIONS_PAGE,
      { endpoint: "GET /api/cloud-billing/transactions" },
    );
  }

  async listCloudBillingBatches(
    params?: { page?: number; page_size?: number },
  ): Promise<BillingBatchesPage> {
    const search = new URLSearchParams();
    if (params?.page !== undefined) search.set("page", String(params.page));
    if (params?.page_size !== undefined) search.set("page_size", String(params.page_size));
    const query = search.toString();
    const raw = await this.fetch<unknown>(
      `/api/cloud-billing/batches${query ? `?${query}` : ""}`,
    );
    return parseWithFallback(
      raw,
      BillingBatchesPageSchema,
      EMPTY_BILLING_BATCHES_PAGE,
      { endpoint: "GET /api/cloud-billing/batches" },
    );
  }

  async listCloudBillingTopups(
    params?: { page?: number; page_size?: number },
  ): Promise<BillingTopupsPage> {
    const search = new URLSearchParams();
    if (params?.page !== undefined) search.set("page", String(params.page));
    if (params?.page_size !== undefined) search.set("page_size", String(params.page_size));
    const query = search.toString();
    const raw = await this.fetch<unknown>(
      `/api/cloud-billing/topups${query ? `?${query}` : ""}`,
    );
    return parseWithFallback(
      raw,
      BillingTopupsPageSchema,
      EMPTY_BILLING_TOPUPS_PAGE,
      { endpoint: "GET /api/cloud-billing/topups" },
    );
  }

  async listCloudBillingPriceTiers(): Promise<BillingPriceTier[]> {
    const raw = await this.fetch<unknown>("/api/cloud-billing/price-tiers");
    return parseWithFallback(
      raw,
      BillingPriceTierListSchema,
      EMPTY_BILLING_PRICE_TIER_LIST,
      { endpoint: "GET /api/cloud-billing/price-tiers" },
    );
  }

  async createCloudBillingCheckoutSession(
    data: CreateBillingCheckoutSessionRequest,
  ): Promise<CreateBillingCheckoutSessionResponse> {
    const res = await this.fetchRaw("/api/cloud-billing/checkout-sessions", {
      method: "POST",
      body: JSON.stringify(data),
      extraHeaders: { "Content-Type": "application/json" },
    });
    const raw = (await res.json()) as unknown;
    return parseWithFallback(
      raw,
      CreateBillingCheckoutSessionResponseSchema,
      EMPTY_CREATE_BILLING_CHECKOUT_SESSION_RESPONSE,
      { endpoint: "POST /api/cloud-billing/checkout-sessions" },
    );
  }

  async getCloudBillingCheckoutSession(
    sessionId: string,
  ): Promise<BillingCheckoutSessionStatus> {
    // Stripe session ids are `cs_<base62>` so they're URL-safe by
    // construction; encodeURIComponent is paranoia for the case where a
    // future Stripe format change adds a non-alphanumeric character. The
    // server has its own allow-list rejection for unsafe ids.
    const raw = await this.fetch<unknown>(
      `/api/cloud-billing/checkout-sessions/${encodeURIComponent(sessionId)}`,
    );
    return parseWithFallback(
      raw,
      BillingCheckoutSessionStatusSchema,
      EMPTY_BILLING_CHECKOUT_SESSION_STATUS,
      { endpoint: "GET /api/cloud-billing/checkout-sessions/{sessionId}" },
    );
  }

  async createCloudBillingPortalSession(): Promise<CreateBillingPortalSessionResponse> {
    const res = await this.fetchRaw("/api/cloud-billing/portal-sessions", {
      method: "POST",
      // Body is intentionally absent — the upstream endpoint requires no
      // payload today. fetchRaw with no body skips the Content-Type
      // default; that's fine because there's nothing to declare.
    });
    const raw = (await res.json()) as unknown;
    return parseWithFallback(
      raw,
      CreateBillingPortalSessionResponseSchema,
      EMPTY_CREATE_BILLING_PORTAL_SESSION_RESPONSE,
      { endpoint: "POST /api/cloud-billing/portal-sessions" },
    );
  }

  // Workspace subscriptions — the server resolves the workspace from the
  // authenticated request context, so no caller names one.
  //
  // Two distinct failure paths, both of which a caller must render as
  // "unavailable" and neither of which may look like Free:
  //
  //   - non-2xx (older cloud without the route, 403, 503) throws ApiError from
  //     `fetch`, so a React Query caller sees `isError`;
  //   - a 2xx body that does not match the contract returns null here.

  async getWorkspaceSubscriptionSummary(): Promise<WorkspaceSubscriptionSummary | null> {
    const raw = await this.fetch<unknown>("/api/cloud-subscriptions/summary");
    return parseWithFallback<WorkspaceSubscriptionSummary | null>(
      raw,
      WorkspaceSubscriptionSummarySchema,
      null,
      { endpoint: "GET /api/cloud-subscriptions/summary" },
    );
  }

  async getWorkspaceSubscriptionPrices(): Promise<WorkspaceSubscriptionPrices | null> {
    const raw = await this.fetch<unknown>("/api/cloud-subscriptions/prices");
    return parseWithFallback<WorkspaceSubscriptionPrices | null>(
      raw,
      WorkspaceSubscriptionPricesSchema,
      null,
      { endpoint: "GET /api/cloud-subscriptions/prices" },
    );
  }

  async createWorkspaceSubscriptionCheckout(
    data: CreateWorkspaceSubscriptionCheckoutRequest,
  ): Promise<CreateWorkspaceSubscriptionCheckoutResponse | null> {
    const res = await this.fetchRaw(
      "/api/cloud-subscriptions/checkout-sessions",
      {
        method: "POST",
        body: JSON.stringify({
          interval: data.interval,
          idempotency_key: data.idempotencyKey,
        }),
        extraHeaders: {
          "Content-Type": "application/json",
          "Idempotency-Key": data.idempotencyKey,
        },
      },
    );
    const raw = (await res.json()) as unknown;
    return parseWithFallback<CreateWorkspaceSubscriptionCheckoutResponse | null>(
      raw,
      CreateWorkspaceSubscriptionCheckoutResponseSchema,
      null,
      { endpoint: "POST /api/cloud-subscriptions/checkout-sessions" },
    );
  }

  async reconcileWorkspaceSubscriptionSeats(): Promise<
    WorkspaceSubscriptionSeatReconcileResult | null
  > {
    const res = await this.fetchRaw("/api/cloud-subscriptions/seats/reconcile", {
      method: "POST",
    });
    const raw = (await res.json()) as unknown;
    return parseWithFallback<WorkspaceSubscriptionSeatReconcileResult | null>(
      raw,
      WorkspaceSubscriptionSeatReconcileResultSchema,
      null,
      { endpoint: "POST /api/cloud-subscriptions/seats/reconcile" },
    );
  }

  async previewWorkspaceSeatPurchase(
    data: PreviewWorkspaceSeatPurchaseRequest,
  ): Promise<WorkspaceSeatPurchasePreview | null> {
    const res = await this.fetchRaw(
      "/api/cloud-subscriptions/seats/purchase-preview",
      {
        method: "POST",
        body: JSON.stringify({ additional_seats: data.additionalSeats }),
        extraHeaders: { "Content-Type": "application/json" },
      },
    );
    const raw = (await res.json()) as unknown;
    return parseWithFallback<WorkspaceSeatPurchasePreview | null>(
      raw,
      WorkspaceSeatPurchasePreviewSchema,
      null,
      { endpoint: "POST /api/cloud-subscriptions/seats/purchase-preview" },
    );
  }

  async purchaseWorkspaceSeats(
    data: PurchaseWorkspaceSeatsRequest,
  ): Promise<PurchaseWorkspaceSeatsResponse | null> {
    const res = await this.fetchRaw(
      "/api/cloud-subscriptions/seats/purchases",
      {
        method: "POST",
        body: JSON.stringify({
          additional_seats: data.additionalSeats,
          expected_current_seats: data.expectedCurrentSeats,
          expected_purchase_version: data.expectedPurchaseVersion,
          accepted_proration_amount: data.acceptedProrationAmount,
          currency: data.currency,
          idempotency_key: data.idempotencyKey,
        }),
        extraHeaders: {
          "Content-Type": "application/json",
          "Idempotency-Key": data.idempotencyKey,
        },
      },
    );
    const raw = (await res.json()) as unknown;
    return parseWithFallback<PurchaseWorkspaceSeatsResponse | null>(
      raw,
      PurchaseWorkspaceSeatsResponseSchema,
      null,
      { endpoint: "POST /api/cloud-subscriptions/seats/purchases" },
    );
  }

  async createWorkspaceSubscriptionPortal(
    idempotencyKey: string,
  ): Promise<CreateWorkspaceSubscriptionPortalResponse | null> {
    const res = await this.fetchRaw("/api/cloud-subscriptions/portal-sessions", {
      method: "POST",
      extraHeaders: { "Idempotency-Key": idempotencyKey },
    });
    const raw = (await res.json()) as unknown;
    return parseWithFallback<CreateWorkspaceSubscriptionPortalResponse | null>(
      raw,
      CreateWorkspaceSubscriptionPortalResponseSchema,
      null,
      { endpoint: "POST /api/cloud-subscriptions/portal-sessions" },
    );
  }

  async deleteRuntime(runtimeId: string): Promise<void> {
    await this.fetch(`/api/runtimes/${runtimeId}`, { method: "DELETE" });
  }

  // Confirmed variant of deleteRuntime. The strict DELETE refuses with
  // structured 409 (`code: "runtime_has_active_agents"`, body carries the
  // blocking agents) when active agents are bound; the front-end then opens
  // the confirmation dialog and submits the user-confirmed active agent set
  // here. Server compares the snapshot to the live set inside the transaction
  // and refuses with `code: "runtime_delete_plan_changed"` (same shape, fresh
  // `active_agents`) if they don't match — caller should re-render the agent
  // list and force the user to re-confirm.
  //
  // The agents are UNBOUND, not archived or deleted (MUL-5559): they keep their
  // configuration, chats and task history and need a new runtime to run again.
  // `agents_archived` is the server's deprecated mirror of `agents_unbound`,
  // kept because installed clients read it; prefer `agents_unbound`.
  async unbindAgentsAndDeleteRuntime(
    runtimeId: string,
    expectedActiveAgentIds: string[],
  ): Promise<{
    status: string;
    agents_unbound?: number;
    agents_archived?: number;
    tasks_cancelled: number;
    autopilots_paused?: number;
  }> {
    return this.fetch(`/api/runtimes/${runtimeId}/unbind-agents-and-delete`, {
      method: "POST",
      body: JSON.stringify({ expected_active_agent_ids: expectedActiveAgentIds }),
    });
  }

  async updateRuntime(
    runtimeId: string,
    patch: {
      visibility?: "private" | "public";
      shared_with?: string[];
      /**
       * Custom display name. Pass an empty string to clear it (the server
       * reverts to the default name). Omit to leave it unchanged — a JSON
       * `null` is treated as "unchanged", not "clear". See MUL-4217.
       */
      custom_name?: string;
      /** Apply custom_name to every runtime on the same machine. */
      apply_to_machine?: boolean;
      /** Runtime-wide concurrency cap; `null` removes it, omit to leave unchanged. */
      max_concurrent_tasks?: number | null;
    },
  ): Promise<AgentRuntime> {
    const raw = await this.fetch<unknown>(`/api/runtimes/${runtimeId}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
    return parseWithFallback(raw, AgentRuntimeSchema, EMPTY_RUNTIME, { endpoint: "updateRuntime" });
  }

  // Confirmed counterpart to a runtime access restriction PATCH. The PATCH
  // returns a structured 409 when teammates still have bound agents or active
  // tasks on the runtime; callers present that plan, then submit its exact
  // agent/task ID sets here. The server rechecks both sets in one transaction.
  async revokeRuntimeWorkspaceAccess(
    runtimeId: string,
    expectedNonownerAgentIds: string[],
    expectedTaskIds: string[],
    sharedWith?: string[],
  ): Promise<void> {
    await this.fetch(`/api/runtimes/${runtimeId}/revoke-workspace-access`, {
      method: "POST",
      body: JSON.stringify({
        expected_nonowner_agent_ids: expectedNonownerAgentIds,
        expected_task_ids: expectedTaskIds,
        shared_with: sharedWith,
      }),
    });
  }

  // Custom runtime profiles (MUL-3284). All workspace-scoped: the caller
  // passes the workspace id the same way the runtimes list resolves it.

  async listRuntimeProfiles(workspaceId: string): Promise<RuntimeProfile[]> {
    const res = await this.fetch<{ runtime_profiles?: RuntimeProfile[] }>(
      `/api/workspaces/${workspaceId}/runtime-profiles`,
    );
    return parseWithFallback(
      res.runtime_profiles ?? [],
      RuntimeProfileListSchema,
      [] as RuntimeProfile[],
      { endpoint: "listRuntimeProfiles" },
    );
  }

  async getRuntimeProfile(
    workspaceId: string,
    profileId: string,
  ): Promise<RuntimeProfile> {
    const result = await this.fetch<RuntimeProfile>(
      `/api/workspaces/${workspaceId}/runtime-profiles/${profileId}`,
    );
    return parseWithFallback(result, RuntimeProfileSchema, result, {
      endpoint: "runtimeProfile",
    });
  }

  async createRuntimeProfile(
    workspaceId: string,
    body: CreateRuntimeProfileRequest,
  ): Promise<RuntimeProfile> {
    const result = await this.fetch<RuntimeProfile>(
      `/api/workspaces/${workspaceId}/runtime-profiles`,
      {
        method: "POST",
        body: JSON.stringify(body),
      },
    );
    return parseWithFallback(result, RuntimeProfileSchema, result, {
      endpoint: "runtimeProfile",
    });
  }

  async updateRuntimeProfile(
    workspaceId: string,
    profileId: string,
    patch: UpdateRuntimeProfileRequest,
  ): Promise<RuntimeProfile> {
    const result = await this.fetch<RuntimeProfile>(
      `/api/workspaces/${workspaceId}/runtime-profiles/${profileId}`,
      {
        method: "PATCH",
        body: JSON.stringify(patch),
      },
    );
    return parseWithFallback(result, RuntimeProfileSchema, result, {
      endpoint: "runtimeProfile",
    });
  }

  async deleteRuntimeProfile(
    workspaceId: string,
    profileId: string,
  ): Promise<void> {
    await this.fetch(
      `/api/workspaces/${workspaceId}/runtime-profiles/${profileId}`,
      { method: "DELETE" },
    );
  }

  async getRuntimeUsage(
    runtimeId: string,
    params?: { days?: number; tz?: string },
  ): Promise<RuntimeUsage[]> {
    const search = new URLSearchParams();
    if (params?.days) search.set("days", String(params.days));
    // `tz` drives the calendar-day boundary for the trend chart (Viewing
    // layer). Caller-supplied; the backend falls back to user.timezone /
    // UTC if omitted.
    if (params?.tz) search.set("tz", params.tz);
    const raw = await this.fetch<unknown>(
      `/api/runtimes/${runtimeId}/usage?${search}`,
    );
    return parseWithFallback<RuntimeUsage[]>(raw, RuntimeUsageListSchema, [], {
      endpoint: "GET /api/runtimes/:id/usage",
    });
  }

  async getRuntimeTaskActivity(
    runtimeId: string,
    params?: { tz?: string },
  ): Promise<RuntimeHourlyActivity[]> {
    // Hour-of-day heatmap follows the viewer's tz, like the other reports on
    // this page. Pass the viewer's IANA zone so the server buckets correctly.
    const search = new URLSearchParams();
    if (params?.tz) search.set("tz", params.tz);
    const raw = await this.fetch<unknown>(
      `/api/runtimes/${runtimeId}/activity?${search}`,
    );
    return parseWithFallback<RuntimeHourlyActivity[]>(
      raw,
      RuntimeHourlyActivityListSchema,
      [],
      { endpoint: "GET /api/runtimes/:id/activity" },
    );
  }

  async getRuntimeUsageByAgent(
    runtimeId: string,
    params?: { days?: number; tz?: string },
  ): Promise<RuntimeUsageByAgent[]> {
    const search = new URLSearchParams();
    if (params?.days) search.set("days", String(params.days));
    if (params?.tz) search.set("tz", params.tz);
    const raw = await this.fetch<unknown>(
      `/api/runtimes/${runtimeId}/usage/by-agent?${search}`,
    );
    return parseWithFallback<RuntimeUsageByAgent[]>(
      raw,
      RuntimeUsageByAgentListSchema,
      [],
      { endpoint: "GET /api/runtimes/:id/usage/by-agent" },
    );
  }

  async getRuntimeUsageByHour(
    runtimeId: string,
    params?: { days?: number; tz?: string },
  ): Promise<RuntimeUsageByHour[]> {
    const search = new URLSearchParams();
    if (params?.days) search.set("days", String(params.days));
    if (params?.tz) search.set("tz", params.tz);
    const raw = await this.fetch<unknown>(
      `/api/runtimes/${runtimeId}/usage/by-hour?${search}`,
    );
    return parseWithFallback<RuntimeUsageByHour[]>(
      raw,
      RuntimeUsageByHourListSchema,
      [],
      { endpoint: "GET /api/runtimes/:id/usage/by-hour" },
    );
  }

  // Workspace dashboard — three independent rollups for `/{slug}/dashboard`.
  // Each accepts an optional `project_id` to narrow the scope to one project.
  // Cost is computed client-side from the model pricing table (same contract
  // as the per-runtime endpoints above).

  async getDashboardUsageDaily(
    params: { days?: number; project_id?: string | null; tz?: string },
  ): Promise<DashboardUsageDaily[]> {
    const search = new URLSearchParams();
    if (params.days) search.set("days", String(params.days));
    if (params.project_id) search.set("project_id", params.project_id);
    if (params.tz) search.set("tz", params.tz);
    const raw = await this.fetch<unknown>(`/api/dashboard/usage/daily?${search}`);
    return parseWithFallback<DashboardUsageDaily[]>(
      raw,
      DashboardUsageDailyListSchema,
      [],
      { endpoint: "GET /api/dashboard/usage/daily" },
    );
  }

  async getDashboardUsageByAgent(
    params: { days?: number; project_id?: string | null; tz?: string },
  ): Promise<DashboardUsageByAgent[]> {
    const search = new URLSearchParams();
    if (params.days) search.set("days", String(params.days));
    if (params.project_id) search.set("project_id", params.project_id);
    if (params.tz) search.set("tz", params.tz);
    const raw = await this.fetch<unknown>(`/api/dashboard/usage/by-agent?${search}`);
    return parseWithFallback<DashboardUsageByAgent[]>(
      raw,
      DashboardUsageByAgentListSchema,
      [],
      { endpoint: "GET /api/dashboard/usage/by-agent" },
    );
  }

  async getDashboardAgentRunTime(
    params: { days?: number; project_id?: string | null; tz?: string },
  ): Promise<DashboardAgentRunTime[]> {
    const search = new URLSearchParams();
    if (params.days) search.set("days", String(params.days));
    if (params.project_id) search.set("project_id", params.project_id);
    // `tz` aligns the "last N days" cutoff with the viewer's calendar,
    // matching the per-agent token card.
    if (params.tz) search.set("tz", params.tz);
    const raw = await this.fetch<unknown>(`/api/dashboard/agent-runtime?${search}`);
    return parseWithFallback<DashboardAgentRunTime[]>(
      raw,
      DashboardAgentRunTimeListSchema,
      [],
      { endpoint: "GET /api/dashboard/agent-runtime" },
    );
  }

  async getDashboardRunTimeDaily(
    params: { days?: number; project_id?: string | null; tz?: string },
  ): Promise<DashboardRunTimeDaily[]> {
    const search = new URLSearchParams();
    if (params.days) search.set("days", String(params.days));
    if (params.project_id) search.set("project_id", params.project_id);
    // `tz` cuts the day buckets in the viewer's calendar so Time / Tasks
    // align with the Cost / Tokens charts.
    if (params.tz) search.set("tz", params.tz);
    const raw = await this.fetch<unknown>(`/api/dashboard/runtime/daily?${search}`);
    return parseWithFallback<DashboardRunTimeDaily[]>(
      raw,
      DashboardRunTimeDailyListSchema,
      [],
      { endpoint: "GET /api/dashboard/runtime/daily" },
    );
  }

  async getDashboardFailuresDaily(
    params: { days?: number; project_id?: string | null; tz?: string },
  ): Promise<DashboardFailureDaily[]> {
    const search = new URLSearchParams();
    if (params.days) search.set("days", String(params.days));
    if (params.project_id) search.set("project_id", params.project_id);
    // `tz` cuts the day buckets in the viewer's calendar so the Errors chart
    // shares an x-axis with the other four metrics.
    if (params.tz) search.set("tz", params.tz);
    const raw = await this.fetch<unknown>(`/api/dashboard/failures/daily?${search}`);
    return parseWithFallback<DashboardFailureDaily[]>(
      raw,
      DashboardFailureDailyListSchema,
      [],
      { endpoint: "GET /api/dashboard/failures/daily" },
    );
  }

  async getDashboardFailuresByAgent(
    params: { days?: number; project_id?: string | null; tz?: string },
  ): Promise<DashboardFailureByAgent[]> {
    const search = new URLSearchParams();
    if (params.days) search.set("days", String(params.days));
    if (params.project_id) search.set("project_id", params.project_id);
    if (params.tz) search.set("tz", params.tz);
    const raw = await this.fetch<unknown>(`/api/dashboard/failures/by-agent?${search}`);
    return parseWithFallback<DashboardFailureByAgent[]>(
      raw,
      DashboardFailureByAgentListSchema,
      [],
      { endpoint: "GET /api/dashboard/failures/by-agent" },
    );
  }

  async initiateUpdate(
    runtimeId: string,
    targetVersion: string,
  ): Promise<RuntimeUpdate> {
    return this.fetch(`/api/runtimes/${runtimeId}/update`, {
      method: "POST",
      body: JSON.stringify({ target_version: targetVersion }),
    });
  }

  async getUpdateResult(
    runtimeId: string,
    updateId: string,
  ): Promise<RuntimeUpdate> {
    return this.fetch(`/api/runtimes/${runtimeId}/update/${updateId}`);
  }

  // Both discovery endpoints feed a UI state machine (poll while
  // pending/running, then render or fail), so the response is validated rather
  // than cast: an unparseable body degrades to an explicit "failed" record that
  // shows the discovery error and keeps manual model entry usable, instead of a
  // fabricated empty catalog or an endless spinner (MUL-5444).
  async initiateListModels(
    runtimeId: string,
    options: { force?: boolean } = {},
    workspaceSlug?: string,
  ): Promise<RuntimeModelListRequest> {
    const query = options.force === true ? "?force=true" : "";
    const raw = await this.fetch<unknown>(
      `/api/runtimes/${runtimeId}/models${query}`,
      {
        method: "POST",
        headers: workspaceHeader(workspaceSlug),
      },
    );
    return parseWithFallback<RuntimeModelListRequest>(
      raw,
      RuntimeModelListRequestSchema,
      { ...MALFORMED_RUNTIME_MODEL_LIST_REQUEST, runtime_id: runtimeId },
      { endpoint: "POST /api/runtimes/{id}/models" },
    );
  }

  async getListModelsResult(
    runtimeId: string,
    requestId: string,
    workspaceSlug?: string,
  ): Promise<RuntimeModelListRequest> {
    const raw = await this.fetch<unknown>(
      `/api/runtimes/${runtimeId}/models/${requestId}`,
      { headers: workspaceHeader(workspaceSlug) },
    );
    return parseWithFallback<RuntimeModelListRequest>(
      raw,
      RuntimeModelListRequestSchema,
      {
        ...MALFORMED_RUNTIME_MODEL_LIST_REQUEST,
        id: requestId,
        runtime_id: runtimeId,
      },
      { endpoint: "GET /api/runtimes/{id}/models/{requestId}" },
    );
  }

  async initiateListLocalSkills(
    runtimeId: string,
  ): Promise<RuntimeLocalSkillListRequest> {
    return this.fetch(`/api/runtimes/${runtimeId}/local-skills`, {
      method: "POST",
    });
  }

  async getListLocalSkillsResult(
    runtimeId: string,
    requestId: string,
  ): Promise<RuntimeLocalSkillListRequest> {
    return this.fetch(`/api/runtimes/${runtimeId}/local-skills/${requestId}`);
  }

  async initiateImportLocalSkill(
    runtimeId: string,
    data: CreateRuntimeLocalSkillImportRequest,
  ): Promise<RuntimeLocalSkillImportRequest> {
    return this.fetch(`/api/runtimes/${runtimeId}/local-skills/import`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async getImportLocalSkillResult(
    runtimeId: string,
    requestId: string,
  ): Promise<RuntimeLocalSkillImportRequest> {
    return this.fetch(`/api/runtimes/${runtimeId}/local-skills/import/${requestId}`);
  }

  async listAgentTasksPage(
    agentId: string,
    options: { limit?: number; before?: string; signal?: AbortSignal } = {},
  ): Promise<{ tasks: AgentTask[]; nextCursor: string | null }> {
    const search = new URLSearchParams({ limit: String(options.limit ?? 200) });
    if (options.before) search.set("before", options.before);
    const response = await this.fetchRaw(`/api/agents/${agentId}/tasks?${search}`, {
      signal: options.signal,
    });
    const tasks: unknown = await response.json();
    return parseWithFallback(
      { tasks, nextCursor: response.headers.get("X-Agent-Tasks-Next-Cursor") },
      AgentTaskPageSchema,
      { tasks: [], nextCursor: null },
      { endpoint: "GET /api/agents/:id/tasks" },
    );
  }

  // Workspace-scoped agent task snapshot: every active task
  // (queued/dispatched/running) plus each agent's most recent terminal task.
  // Powers the front-end's "active wins, else latest terminal" presence
  // derivation; one fetch backs every per-agent presence read in the app.
  // Workspace is resolved server-side from the X-Workspace-Slug header.
  async getAgentTaskSnapshot(): Promise<AgentTask[]> {
    return this.fetch(`/api/agent-task-snapshot`);
  }

  // Independent workspace-level projection. Unlike the task snapshot, this
  // already deduplicates running agents and returns only the display fields
  // consumers need. Callers may narrow the projection by task source and, for
  // issue work, the authenticated member's My Issues relation.
  // `parentIssueId` narrows the projection to that issue's direct children,
  // which is how the sub-issue header on issue detail reads the same source
  // as the Issues list header. The server rejects combining it with `scope`,
  // so callers pass one or the other.
  async getWorkspaceWorkingAgents(
    type?: WorkspaceWorkingAgentType,
    mineRelation?: WorkspaceWorkingAgentMineRelation,
    parentIssueId?: string,
  ): Promise<WorkspaceWorkingAgent[]> {
    const search = new URLSearchParams();
    if (type) search.set("type", type);
    if (mineRelation) {
      search.set("scope", "mine");
      search.set("relation", mineRelation);
    } else if (parentIssueId) {
      search.set("parent", parentIssueId);
    }
    const query = search.toString();
    return this.fetch(`/api/working-agents${query ? `?${query}` : ""}`);
  }

  // Per-agent daily activity for the last 30 days, anchored on
  // completed_at. One workspace-wide fetch backs both the Agents-list
  // sparkline (uses trailing 7 buckets) and the agent detail "Last 30
  // days" panel (uses all 30).
  async getWorkspaceAgentActivity30d(): Promise<AgentActivityBucket[]> {
    const raw = await this.fetch<unknown>(`/api/agent-activity-30d`);
    return parseWithFallback<AgentActivityBucket[]>(raw, AgentActivityBucketListSchema, [], {
      endpoint: "GET /api/agent-activity-30d",
    });
  }

  // Per-agent 30-day total run count for the Agents-list RUNS column.
  async getWorkspaceAgentRunCounts(): Promise<AgentRunCount[]> {
    return this.fetch(`/api/agent-run-counts`);
  }

  async getActiveTasksForIssue(issueId: string): Promise<{ tasks: AgentTask[] }> {
    return this.fetch(`/api/issues/${issueId}/active-task`);
  }

  async listTaskMessages(taskId: string): Promise<TaskMessagePayload[]> {
    const raw = await this.fetch<unknown>(`/api/tasks/${taskId}/messages`);
    return parseWithFallback<TaskMessagePayload[]>(raw, TaskMessageListSchema, [], {
      endpoint: "GET /api/tasks/:id/messages",
    });
  }

  async listTasksByIssue(issueId: string, includeDescendants = false): Promise<AgentTask[]> {
    const raw = await this.fetch<unknown>(
      `/api/issues/${issueId}/task-runs${includeDescendants ? "?scope=subtree" : ""}`,
    );
    return parseWithFallback<AgentTask[]>(raw, AgentTaskListSchema, [], {
      endpoint: "GET /api/issues/:id/task-runs",
    });
  }

  async retryTaskSupplement(issueId: string, taskId: string, commentId: string): Promise<void> {
    await this.fetch(`/api/issues/${issueId}/tasks/${taskId}/supplements/${commentId}/retry`, {
      method: "POST",
    });
  }

  async getIssueUsage(issueId: string): Promise<IssueUsageSummary> {
    return this.fetch(`/api/issues/${issueId}/usage`);
  }

  async cancelTask(issueId: string, taskId: string): Promise<AgentTask> {
    const raw = await this.fetch<unknown>(`/api/issues/${issueId}/tasks/${taskId}/cancel`, {
      method: "POST",
    });
    const task = parseWithFallback<AgentTask | null>(raw, AgentTaskSchema, null, {
      endpoint: "POST /api/issues/:id/tasks/:taskId/cancel",
    });
    if (!task) throw new Error("Invalid task cancellation response");
    return task;
  }

  async rerunIssue(issueId: string, taskId?: string): Promise<AgentTask> {
    return this.fetch(`/api/issues/${issueId}/rerun`, {
      method: "POST",
      body: JSON.stringify(taskId ? { task_id: taskId } : {}),
    });
  }

  async retrySourceContextQuickCreate(taskId: string): Promise<AgentTask> {
    const raw = await this.fetch<unknown>(`/api/tasks/${taskId}/retry-source-context`, {
      method: "POST",
    });
    const task = parseWithFallback<AgentTask | null>(raw, AgentTaskSchema, null, {
      endpoint: "POST /api/tasks/:id/retry-source-context",
    });
    if (!task) throw new Error("Invalid source-context retry response");
    return task;
  }

  /** Every unread mark, across all pages: a row missing here reads as "read". */
  async listIssueUnread(): Promise<IssueUnread[]> {
    const items: IssueUnread[] = [];
    let cursor: string | null = null;
    do {
      const query: string = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
      const raw = await this.fetch<unknown>(`/api/issues/unread${query}`);
      const page = parseWithFallback(raw, IssueUnreadPageSchema, EMPTY_ISSUE_UNREAD_PAGE, {
        endpoint: "GET /api/issues/unread",
      });
      items.push(...page.items);
      cursor = page.next_cursor === cursor ? null : page.next_cursor;
    } while (cursor);
    return items;
  }

  async listSubscribedIssueIds(): Promise<string[]> {
    const raw = await this.fetch<unknown>("/api/issues/subscribed");
    const parsed = parseWithFallback<{ issue_ids: string[] } | null>(raw, SubscribedIssueIdsSchema, null, {
      endpoint: "GET /api/issues/subscribed",
    });
    if (!parsed) throw new Error("GET /api/issues/subscribed returned a malformed body");
    return parsed.issue_ids;
  }

  async markIssueRead(issueId: string): Promise<void> {
    await this.fetch(`/api/issues/${issueId}/read`, { method: "POST" });
  }

  async markIssueUnread(issueId: string): Promise<void> {
    await this.fetch(`/api/issues/${issueId}/unread`, { method: "POST" });
  }

  // Inbox
  async listInbox(): Promise<InboxItem[]> {
    const raw = await this.fetch<unknown>("/api/inbox");
    return parseWithFallback(raw, InboxItemListSchema, EMPTY_INBOX_ITEMS, {
      endpoint: "GET /api/inbox",
    });
  }

  async markInboxRead(id: string): Promise<InboxItem> {
    return this.fetch(`/api/inbox/${id}/read`, { method: "POST" });
  }

  async markInboxUnread(id: string): Promise<InboxItem> {
    return this.fetch(`/api/inbox/${id}/unread`, { method: "POST" });
  }

  async archiveInbox(id: string): Promise<InboxItem> {
    return this.fetch(`/api/inbox/${id}/archive`, { method: "POST" });
  }

  async deleteInbox(id: string): Promise<{ count: number | null }> {
    const raw = await this.fetch<unknown>(`/api/inbox/${id}`, { method: "DELETE" });
    return parseWithFallback<{ count: number | null }>(raw, InboxDeleteSchema, { count: null }, {
      endpoint: "DELETE /api/inbox/{id}",
    });
  }

  // Archived notifications, backing the inbox's "Archived" sub-view. Capped
  // server-side (no pagination in v1). Schema-guarded so a contract drift
  // renders an empty archive instead of taking the inbox down with it.
  async listArchivedInbox(): Promise<InboxItem[]> {
    const raw = await this.fetch<unknown>("/api/inbox/archived");
    return parseWithFallback(raw, InboxItemListSchema, EMPTY_INBOX_ITEMS, {
      endpoint: "GET /api/inbox/archived",
    });
  }

  private archivedInboxParams(filters: ArchivedInboxFilters): URLSearchParams {
    return new URLSearchParams(archivedInboxQuery(filters));
  }

  async listArchivedInboxPage(filters: ArchivedInboxFilters, options: {
    cursor?: string | null; groupId?: string; signal?: AbortSignal;
  } = {}): Promise<ArchivedInboxPage> {
    const params = this.archivedInboxParams(filters);
    params.set("limit", "50");
    if (options.cursor) params.set("cursor", options.cursor);
    if (options.groupId) params.set("group_id", options.groupId);
    const raw = await this.fetch<unknown>(`/api/inbox/archived/page?${params}`, { signal: options.signal });
    const page = parseWithFallback<ArchivedInboxPage | null>(raw, ArchivedInboxPageSchema, null, {
      endpoint: "GET /api/inbox/archived/page",
    });
    if (!page) throw new Error("Invalid archived inbox page response");
    return page;
  }

  async getArchivedInboxFacets(filters: ArchivedInboxFilters, signal?: AbortSignal): Promise<ArchivedInboxFacets> {
    const raw = await this.fetch<unknown>(`/api/inbox/archived/facets?${this.archivedInboxParams(filters)}`, { signal });
    const facets = parseWithFallback<ArchivedInboxFacets | null>(raw, ArchivedInboxFacetsSchema, null, {
      endpoint: "GET /api/inbox/archived/facets",
    });
    if (!facets) throw new Error("Invalid archived inbox facets response");
    return facets;
  }

  async unarchiveInbox(id: string): Promise<InboxItem> {
    return this.fetch(`/api/inbox/${id}/unarchive`, { method: "POST" });
  }

  // Raw unread ROW count — not the number any badge shows. The inbox renders
  // one row per issue, so a single issue with three unread notifications
  // counts once there and three times here. `getInboxUnreadSummary` is the
  // deduplicated, per-workspace count the UI is built on (see
  // `useInboxUnreadCount`); reach for this one only when raw rows are what
  // you actually mean.
  async getUnreadInboxCount(): Promise<{ count: number }> {
    return this.fetch("/api/inbox/unread-count");
  }

  // Cross-workspace unread summary: one entry per workspace the user belongs
  // to that has unread inbox items. Backs the workspace-switcher dot for
  // OTHER workspaces. Schema-guarded so a contract drift hides the dot rather
  // than crashing the sidebar.
  async getInboxUnreadSummary(): Promise<InboxWorkspaceUnread[]> {
    const raw = await this.fetch<unknown>("/api/inbox/unread-summary");
    return parseWithFallback(raw, InboxUnreadSummarySchema, EMPTY_INBOX_UNREAD_SUMMARY, {
      endpoint: "GET /api/inbox/unread-summary",
    });
  }

  async markAllInboxRead(): Promise<{ count: number }> {
    return this.fetch("/api/inbox/mark-all-read", { method: "POST" });
  }

  /**
   * Reads every unread notification the caller has on one issue. `count` is
   * how many rows the server read, or `null` when the response did not say:
   * the write itself succeeded, so callers must not read `null` as "nothing
   * changed".
   */
  async markIssueInboxRead(issueId: string): Promise<{ count: number | null }> {
    const raw = await this.fetch<unknown>(`/api/inbox/issues/${issueId}/read`, { method: "POST" });
    return parseWithFallback<{ count: number | null }>(raw, IssueInboxReadSchema, { count: null }, {
      endpoint: "POST /api/inbox/issues/{id}/read",
    });
  }

  async archiveAllInbox(): Promise<{ count: number }> {
    return this.fetch("/api/inbox/archive-all", { method: "POST" });
  }

  async archiveAllReadInbox(): Promise<{ count: number }> {
    return this.fetch("/api/inbox/archive-all-read", { method: "POST" });
  }

  async archiveCompletedInbox(): Promise<{ count: number }> {
    return this.fetch("/api/inbox/archive-completed", { method: "POST" });
  }

  // Notification preferences
  //
  // `workspaceSlug` overrides the default `X-Workspace-Slug` header (which
  // follows the active workspace) so a caller can read a SPECIFIC workspace's
  // preferences — e.g. honoring the mute setting of the workspace an inbox
  // notification came from while the user is viewing a different one (#3766).
  async getNotificationPreferences(workspaceSlug?: string): Promise<NotificationPreferenceResponse> {
    const raw = await this.fetch<unknown>(
      "/api/notification-preferences",
      workspaceSlug ? { headers: { "X-Workspace-Slug": workspaceSlug } } : undefined,
    );
    return parseWithFallback(
      raw,
      NotificationPreferenceResponseSchema,
      EMPTY_NOTIFICATION_PREFERENCE_RESPONSE,
      { endpoint: "GET /api/notification-preferences" },
    );
  }

  async updateNotificationPreferences(
    preferences: NotificationPreferences,
    workspaceSlug?: string,
  ): Promise<NotificationPreferenceResponse> {
    const raw = await this.fetch<unknown>("/api/notification-preferences", {
      method: "PATCH",
      headers: workspaceHeader(workspaceSlug),
      body: JSON.stringify({ preferences }),
    });
    return parseWithFallback(
      raw,
      NotificationPreferenceResponseSchema,
      EMPTY_NOTIFICATION_PREFERENCE_RESPONSE,
      { endpoint: "PATCH /api/notification-preferences" },
    );
  }

  // App Config
  async getConfig(): Promise<AppConfigResponse> {
    const raw = await this.fetch<unknown>("/api/config");
    return parseWithFallback<AppConfigResponse>(raw, AppConfigSchema, EMPTY_APP_CONFIG, {
      endpoint: "GET /api/config",
    });
  }

  // Workspaces
  async listWorkspaces(): Promise<Workspace[]> {
    const raw = await this.fetch<unknown>("/api/workspaces");
    return parseWithFallback(raw, WorkspaceListItemSchema.array(), [] as Workspace[], {
      endpoint: "GET /api/workspaces",
    }) as Workspace[];
  }

  async setWorkspacePinned(id: string, pinned: boolean): Promise<{ pinned_at: string | null }> {
    const raw = await this.fetch<unknown>(`/api/workspaces/${id}/pin`, {
      method: "PUT", body: JSON.stringify({ pinned }),
    });
    return parseWithFallback(raw, WorkspacePinnedSchema, { pinned_at: null }, { endpoint: "PUT /api/workspaces/{id}/pin" });
  }

  async getWorkspace(id: string): Promise<Workspace> {
    return this.fetch(`/api/workspaces/${id}`);
  }

  async createWorkspace(data: { name: string; slug: string; description?: string; context?: string; issue_prefix?: string }): Promise<Workspace> {
    return this.fetch("/api/workspaces", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateWorkspace(id: string, data: { name?: string; description?: string; context?: string; settings?: Record<string, unknown>; repos?: WorkspaceRepo[]; issue_prefix?: string; avatar_url?: string }): Promise<Workspace> {
    return this.fetch(`/api/workspaces/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  async listPluginInstallations(workspaceId: string): Promise<PluginInstallationListResponse> {
    let raw: unknown;
    try {
      raw = await this.fetch<unknown>(`/api/workspaces/${workspaceId}/plugins`);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) return EMPTY_PLUGIN_INSTALLATION_LIST;
      throw error;
    }
    return parseWithFallback(raw, PluginInstallationListResponseSchema, EMPTY_PLUGIN_INSTALLATION_LIST, {
      endpoint: "GET /api/workspaces/{id}/plugins",
    });
  }

  /**
   * The workspace's MCP server library. The response carries identity and
   * transport only — the stored entries are write-only server-side, so there
   * is nothing here to redact.
   */
  async listWorkspaceMcpServers(workspaceId: string): Promise<WorkspaceMcpServer[]> {
    const raw = await this.fetch<unknown>(`/api/workspaces/${workspaceId}/mcp-servers`);
    return parseWithFallback(raw, WorkspaceMcpServerListSchema, [] as WorkspaceMcpServer[], {
      endpoint: "GET /api/workspaces/{id}/mcp-servers",
    });
  }

  /**
   * Adds a server to the library. It is assigned to NO agent — an agent gets
   * it only through addAgentMcpServer.
   */
  async createWorkspaceMcpServer(
    workspaceId: string,
    name: string,
    config: Record<string, unknown>,
  ): Promise<WorkspaceMcpServer> {
    const raw = await this.fetch<unknown>(`/api/workspaces/${workspaceId}/mcp-servers`, {
      method: "POST",
      body: JSON.stringify({ name, config }),
    });
    return parseWithFallback(raw, WorkspaceMcpServerSchema, EMPTY_WORKSPACE_MCP_SERVER, {
      endpoint: "POST /api/workspaces/{id}/mcp-servers",
    });
  }

  /**
   * Renames a library entry, replaces its configuration, or both. Agents keep
   * their assignment across a rename because assignments key off the id.
   */
  async updateWorkspaceMcpServer(
    workspaceId: string,
    serverId: string,
    update: { name?: string; config?: Record<string, unknown> },
  ): Promise<WorkspaceMcpServer> {
    const raw = await this.fetch<unknown>(
      `/api/workspaces/${workspaceId}/mcp-servers/${encodeURIComponent(serverId)}`,
      { method: "PUT", body: JSON.stringify(update) },
    );
    return parseWithFallback(raw, WorkspaceMcpServerSchema, EMPTY_WORKSPACE_MCP_SERVER, {
      endpoint: "PUT /api/workspaces/{id}/mcp-servers/{serverId}",
    });
  }

  /** Removes a library entry and every assignment to it. */
  async deleteWorkspaceMcpServer(workspaceId: string, serverId: string): Promise<void> {
    await this.fetch<unknown>(
      `/api/workspaces/${workspaceId}/mcp-servers/${encodeURIComponent(serverId)}`,
      { method: "DELETE" },
    );
  }

  /** The workspace MCP servers assigned to this agent, with their toggles. */
  async listAgentMcpServers(agentId: string): Promise<WorkspaceMcpServer[]> {
    const raw = await this.fetch<unknown>(`/api/agents/${agentId}/mcp-servers`);
    return parseWithFallback(raw, WorkspaceMcpServerListSchema, [] as WorkspaceMcpServer[], {
      endpoint: "GET /api/agents/{id}/mcp-servers",
    });
  }

  /**
   * Gives one workspace server to this agent. Every write returns the
   * resulting assignment list, so the client never has to guess the state.
   */
  async addAgentMcpServer(agentId: string, serverId: string): Promise<WorkspaceMcpServer[]> {
    const raw = await this.fetch<unknown>(`/api/agents/${agentId}/mcp-servers`, {
      method: "POST",
      body: JSON.stringify({ server_id: serverId }),
    });
    return parseWithFallback(raw, WorkspaceMcpServerListSchema, [] as WorkspaceMcpServer[], {
      endpoint: "POST /api/agents/{id}/mcp-servers",
    });
  }

  async setAgentMcpServerEnabled(
    agentId: string,
    serverId: string,
    enabled: boolean,
  ): Promise<WorkspaceMcpServer[]> {
    const raw = await this.fetch<unknown>(
      `/api/agents/${agentId}/mcp-servers/${encodeURIComponent(serverId)}/enabled`,
      { method: "PUT", body: JSON.stringify({ enabled }) },
    );
    return parseWithFallback(raw, WorkspaceMcpServerListSchema, [] as WorkspaceMcpServer[], {
      endpoint: "PUT /api/agents/{id}/mcp-servers/{serverId}/enabled",
    });
  }

  async removeAgentMcpServer(agentId: string, serverId: string): Promise<WorkspaceMcpServer[]> {
    const raw = await this.fetch<unknown>(
      `/api/agents/${agentId}/mcp-servers/${encodeURIComponent(serverId)}`,
      { method: "DELETE" },
    );
    return parseWithFallback(raw, WorkspaceMcpServerListSchema, [] as WorkspaceMcpServer[], {
      endpoint: "DELETE /api/agents/{id}/mcp-servers/{serverId}",
    });
  }

  /** Everything published into this workspace, with its versions. */
  async listPluginPackages(workspaceId: string): Promise<PluginPackageListResponse> {
    const raw = await this.fetch<unknown>(`/api/workspaces/${workspaceId}/plugins/packages`);
    return parseWithFallback(raw, PluginPackageListResponseSchema, EMPTY_PLUGIN_PACKAGE_LIST, {
      endpoint: "GET /api/workspaces/{id}/plugins/packages",
    });
  }

  /**
   * Publishes an artifact bundle: a zip holding the manifest and every file it
   * names. This is the whole publishing path — a plugin author needs no server
   * of their own, and nothing about a published version changes afterwards.
   *
   * Not routed through `this.fetch`, for the same reason uploadFile is not: the
   * browser has to set the multipart boundary itself.
   */
  async publishPluginPackage(workspaceId: string, bundle: File): Promise<PluginPackage> {
    const formData = new FormData();
    formData.append("bundle", bundle);

    const credentialUsed = this.getToken();
    const res = await fetch(`${this.baseUrl}/api/workspaces/${workspaceId}/plugins/packages`, {
      method: "POST",
      headers: this.authHeaders(),
      body: formData,
      credentials: "include",
    });
    if (!res.ok) {
      if (res.status === 401) this.handleUnauthorized(credentialUsed);
      throw new Error(await this.parseErrorMessage(res, `Publishing failed: ${res.status}`));
    }
    const raw = (await res.json()) as unknown;
    return parseWithFallback(raw, PluginPackageSchema, EMPTY_PLUGIN_PACKAGE, {
      endpoint: "POST /api/workspaces/{id}/plugins/packages",
    });
  }

  /**
   * Publishes from a directory the operator hosts (MULTICA_PLUGIN_DIR) — the
   * development channel, so iterating on a surface does not mean zipping and
   * uploading after every edit. It still produces an immutable version.
   */
  async publishLocalPluginPackage(workspaceId: string, name: string): Promise<PluginPackage> {
    const raw = await this.fetch<unknown>(`/api/workspaces/${workspaceId}/plugins/packages/local`, {
      method: "POST",
      body: JSON.stringify({ name }),
    });
    return parseWithFallback(raw, PluginPackageSchema, EMPTY_PLUGIN_PACKAGE, {
      endpoint: "POST /api/workspaces/{id}/plugins/packages/local",
    });
  }

  async deletePluginPackage(workspaceId: string, packageId: string): Promise<void> {
    await this.fetch<void>(`/api/workspaces/${workspaceId}/plugins/packages/${packageId}`, { method: "DELETE" });
  }

  /** Mint one hosted document URL and its single-use bridge proof. */
  async getPluginSurfaceLaunch(workspaceId: string, installationId: string, surfaceKey: string): Promise<PluginSurfaceLaunch> {
    const raw = await this.fetch<unknown>(
      `/api/workspaces/${workspaceId}/plugins/${installationId}/surfaces/${encodeURIComponent(surfaceKey)}/launch`,
    );
    return parseWithFallback(raw, PluginSurfaceLaunchSchema, EMPTY_PLUGIN_SURFACE_LAUNCH, {
      endpoint: "GET /api/workspaces/{id}/plugins/{installationId}/surfaces/{surfaceKey}/launch",
    });
  }

  /**
   * Step one of the two-step install. Nothing is written: the response is what
   * the consent screen shows before an installation exists.
   */
  async previewPlugin(workspaceId: string, request: PluginPreviewRequest): Promise<PluginPreview> {
    const raw = await this.fetch<unknown>(`/api/workspaces/${workspaceId}/plugins/preview`, {
      method: "POST",
      body: JSON.stringify(request),
    });
    return parseWithFallback(raw, PluginPreviewSchema, EMPTY_PLUGIN_PREVIEW, {
      endpoint: "POST /api/workspaces/{id}/plugins/preview",
    });
  }

  async installPlugin(workspaceId: string, request: PluginInstallRequest): Promise<PluginInstallation> {
    const raw = await this.fetch<unknown>(`/api/workspaces/${workspaceId}/plugins`, {
      method: "POST",
      body: JSON.stringify(request),
    });
    return parseWithFallback(raw, PluginInstallationSchema, EMPTY_PLUGIN_INSTALLATION, {
      endpoint: "POST /api/workspaces/{id}/plugins",
    });
  }

  async configurePlugin(workspaceId: string, installationId: string, request: PluginConfigRequest): Promise<PluginInstallation> {
    const raw = await this.fetch<unknown>(`/api/workspaces/${workspaceId}/plugins/${installationId}/config`, {
      method: "PUT",
      body: JSON.stringify(request),
    });
    return parseWithFallback(raw, PluginInstallationSchema, EMPTY_PLUGIN_INSTALLATION, {
      endpoint: "PUT /api/workspaces/{id}/plugins/{installationId}/config",
    });
  }

  async setPluginEnabled(workspaceId: string, installationId: string, enabled: boolean): Promise<PluginInstallation> {
    const action = enabled ? "enable" : "disable";
    const raw = await this.fetch<unknown>(`/api/workspaces/${workspaceId}/plugins/${installationId}/${action}`, {
      method: "POST",
    });
    return parseWithFallback(raw, PluginInstallationSchema, EMPTY_PLUGIN_INSTALLATION, {
      endpoint: `POST /api/workspaces/{id}/plugins/{installationId}/${action}`,
    });
  }

  /**
   * Performs one Action API call on behalf of a plugin surface.
   *
   * The surface has no credential — it asked the host over postMessage, and
   * this re-issues the call on the signed-in user's session. The installation
   * travels in a header the iframe cannot set for itself; the server derives
   * the workspace from it rather than trusting anything the client sends.
   */
  async callPluginAction(
    installationId: string,
    request: { method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE"; path: string; body?: unknown; issueId?: string },
  ): Promise<unknown> {
    const query = request.path === "/context" && request.issueId
      ? `?issue_id=${encodeURIComponent(request.issueId)}`
      : "";
    return this.fetch<unknown>(`/api/plugin-bridge/v1${request.path}${query}`, {
      method: request.method,
      headers: { "X-morechat.co-Plugin-Installation": installationId },
      body: request.body === undefined ? undefined : JSON.stringify(request.body),
    });
  }

  /**
   * Invokes one hook on behalf of a person.
   *
   * `ui` comes from a button inside a surface, `manual` from the issue actions
   * menu or the command palette. Both block this request and only this request:
   * somebody is waiting for the answer. The `event` trigger never comes through
   * here — the host dispatches it, so no client can ask for one and inherit an
   * identity that is supposed to be the plugin's.
   */
  async invokePluginHook(
    installationId: string,
    hookKey: string,
    request: { trigger: "ui" | "manual"; issueId?: string; input?: unknown },
  ): Promise<PluginHookResult> {
    const raw = await this.fetch<unknown>(`/api/plugin-bridge/v1/hooks/${encodeURIComponent(hookKey)}`, {
      method: "POST",
      headers: { "X-morechat.co-Plugin-Installation": installationId },
      body: JSON.stringify({ trigger: request.trigger, issue_id: request.issueId, input: request.input }),
    });
    return parseWithFallback(raw, PluginHookResultSchema, {
      status: "ok",
      hook_key: hookKey,
      trigger: request.trigger,
      latency_ms: 0,
      attempts: 1,
    }, { endpoint: "POST /api/plugin-bridge/v1/hooks/{key}" });
  }

  async listPluginInvocations(workspaceId: string, installationId: string): Promise<PluginInvocation[]> {
    const raw = await this.fetch<unknown>(`/api/workspaces/${workspaceId}/plugins/${installationId}/invocations`);
    return parseWithFallback(raw, PluginInvocationListSchema, { invocations: [] }, {
      endpoint: "GET /api/workspaces/{id}/plugins/{installationId}/invocations",
    }).invocations;
  }

  async rotatePluginToken(workspaceId: string, installationId: string): Promise<PluginTokenIssue> {
    const raw = await this.fetch<unknown>(`/api/workspaces/${workspaceId}/plugins/${installationId}/token`, {
      method: "POST",
    });
    return parseWithFallback(raw, PluginTokenIssueSchema, { token: "", signing_secret: "" }, {
      endpoint: "POST /api/workspaces/{id}/plugins/{installationId}/token",
    });
  }

  async revokePluginToken(workspaceId: string, installationId: string): Promise<void> {
    await this.fetch(`/api/workspaces/${workspaceId}/plugins/${installationId}/token`, { method: "DELETE" });
  }

  /**
   * Lists what an `mcp`-transport hook's server currently offers.
   *
   * Read-only: discovering a tool adopts nothing. approvePluginMCPTools is the
   * grant, which is the difference from an `http` hook — that one declares a
   * single endpoint in a manifest an administrator already read, while an MCP
   * server decides its own tool list at runtime and can change it later.
   */
  async listPluginMCPTools(workspaceId: string, installationId: string, hookKey: string): Promise<PluginMCPTool[]> {
    const raw = await this.fetch<unknown>(
      `/api/workspaces/${workspaceId}/plugins/${installationId}/mcp/${encodeURIComponent(hookKey)}/tools`,
    );
    return parseWithFallback(raw, PluginMCPToolListSchema, { tools: [] }, {
      endpoint: "GET /api/workspaces/{id}/plugins/{installationId}/mcp/{hookKey}/tools",
    }).tools;
  }

  /**
   * Pins the approved tool set for one hook.
   *
   * `tools` is the COMPLETE set, not a delta — removing one is the same request
   * shape as adding one, so there is no way to think you revoked something and
   * have it stay. An empty array withdraws the hook entirely.
   */
  async approvePluginMCPTools(
    workspaceId: string,
    installationId: string,
    hookKey: string,
    tools: string[],
  ): Promise<PluginInstallation> {
    const raw = await this.fetch<unknown>(
      `/api/workspaces/${workspaceId}/plugins/${installationId}/mcp/${encodeURIComponent(hookKey)}/tools`,
      { method: "PUT", body: JSON.stringify({ tools }) },
    );
    return parseWithFallback(raw, PluginInstallationSchema, EMPTY_PLUGIN_INSTALLATION, {
      endpoint: "PUT /api/workspaces/{id}/plugins/{installationId}/mcp/{hookKey}/tools",
    });
  }

  async uninstallPlugin(workspaceId: string, installationId: string): Promise<void> {
    await this.fetch(`/api/workspaces/${workspaceId}/plugins/${installationId}`, {
      method: "DELETE",
    });
  }

  // Members
  async listMembers(workspaceId: string): Promise<MemberWithUser[]> {
    return this.fetch(`/api/workspaces/${workspaceId}/members`);
  }

  async createMember(workspaceId: string, data: CreateMemberRequest): Promise<Invitation> {
    return this.fetch(`/api/workspaces/${workspaceId}/members`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateMember(workspaceId: string, memberId: string, data: UpdateMemberRequest): Promise<MemberWithUser> {
    return this.fetch(`/api/workspaces/${workspaceId}/members/${memberId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  async deleteMember(workspaceId: string, memberId: string): Promise<void> {
    await this.fetch(`/api/workspaces/${workspaceId}/members/${memberId}`, {
      method: "DELETE",
    });
  }

  /**
   * Files a member under a department, or clears the attribution with
   * `department_id: null`. Server-side this also adds/removes that member on
   * the department's private projects, so the response reports which project
   * ids the move touched.
   */
  async updateMemberDepartment(
    workspaceId: string,
    memberId: string,
    data: UpdateMemberDepartmentRequest,
  ): Promise<UpdateMemberDepartmentResponse> {
    return this.fetch(`/api/workspaces/${workspaceId}/members/${memberId}/department`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  async leaveWorkspace(workspaceId: string): Promise<void> {
    await this.fetch(`/api/workspaces/${workspaceId}/leave`, {
      method: "POST",
    });
  }

  // Invitations
  async listWorkspaceInvitations(workspaceId: string): Promise<Invitation[]> {
    return this.fetch(`/api/workspaces/${workspaceId}/invitations`);
  }

  async revokeInvitation(workspaceId: string, invitationId: string): Promise<void> {
    await this.fetch(`/api/workspaces/${workspaceId}/invitations/${invitationId}`, {
      method: "DELETE",
    });
  }

  async listMyInvitations(): Promise<Invitation[]> {
    return this.fetch("/api/invitations");
  }

  async getInvitation(invitationId: string): Promise<Invitation> {
    return this.fetch(`/api/invitations/${invitationId}`);
  }

  async acceptInvitation(invitationId: string): Promise<MemberWithUser> {
    return this.fetch(`/api/invitations/${invitationId}/accept`, {
      method: "POST",
    });
  }

  async declineInvitation(invitationId: string): Promise<void> {
    await this.fetch(`/api/invitations/${invitationId}/decline`, {
      method: "POST",
    });
  }

  // Departments. Reads are open to any workspace member; writes need
  // owner/admin. A department is attribution, not an ACL.
  async listDepartments(workspace?: WorkspaceScope): Promise<ListDepartmentsResponse> {
    const raw = await this.fetch<unknown>("/api/departments", { headers: workspaceHeader(workspace) });
    return parseWithFallback(raw, ListDepartmentsResponseSchema, EMPTY_LIST_DEPARTMENTS_RESPONSE, {
      endpoint: "GET /api/departments",
    });
  }

  async createDepartment(data: CreateDepartmentRequest): Promise<Department> {
    const raw = await this.fetch<unknown>("/api/departments", {
      method: "POST",
      body: JSON.stringify(data),
    });
    return parseWithFallback(raw, DepartmentSchema, EMPTY_DEPARTMENT, {
      endpoint: "POST /api/departments",
    });
  }

  async updateDepartment(id: string, data: UpdateDepartmentRequest): Promise<Department> {
    const raw = await this.fetch<unknown>(`/api/departments/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
    return parseWithFallback(raw, DepartmentSchema, EMPTY_DEPARTMENT, {
      endpoint: "PATCH /api/departments/:id",
    });
  }

  /**
   * Deletes a department. The delete detaches its projects and members, so the
   * response reports how many rows it touched rather than being empty.
   */
  async deleteDepartment(id: string): Promise<DeleteDepartmentResponse> {
    const raw = await this.fetch<unknown>(`/api/departments/${id}`, { method: "DELETE" });
    return parseWithFallback(raw, DeleteDepartmentResponseSchema, EMPTY_DELETE_DEPARTMENT_RESPONSE, {
      endpoint: "DELETE /api/departments/:id",
    });
  }

  // Workbench ledgers (docs/engineering/WORKBENCH-API.md §3). The workspace comes
  // from X-Workspace-Slug like every other workspace-scoped call; `department_id`
  // only narrows the two aggregates and is never an access boundary. Reads are
  // member-wide, writes are gated server-side (owners/admins, or the row owner),
  // so the client parses every response instead of pre-judging permission.

  async getWorkbenchOverview(params: { department_id?: string | null } = {}): Promise<WorkbenchOverviewResponse> {
    const raw = await this.fetch<unknown>(
      `/api/workbench/overview${workbenchSearch({ department_id: params.department_id })}`,
    );
    return parseWithFallback(raw, WorkbenchOverviewResponseSchema, EMPTY_WORKBENCH_OVERVIEW, {
      endpoint: "GET /api/workbench/overview",
    });
  }

  async getWorkbenchCounts(params: { department_id?: string | null } = {}): Promise<WorkbenchCountsResponse> {
    const raw = await this.fetch<unknown>(
      `/api/workbench/counts${workbenchSearch({ department_id: params.department_id })}`,
    );
    return parseWithFallback(raw, WorkbenchCountsResponseSchema, EMPTY_WORKBENCH_COUNTS_RESPONSE, {
      endpoint: "GET /api/workbench/counts",
    });
  }

  /**
   * The money block for one department scope (contract §3, `GET /finance`).
   *
   * Same read rules as the other two aggregates: any member may read, and
   * `department_id` narrows the aggregate instead of gating access. The whole
   * response degrades to the all-gaps shape rather than throwing, so a malformed
   * money payload leaves the tab with gap cards instead of a blank page.
   */
  /**
   * The money block for one calendar month. `month` is the `YYYY-MM` label;
   * omitting it reads the current month, which is what this endpoint always
   * answered before the parameter existed. A malformed month is a 400; a month
   * with no rows answers `insufficient_data` per figure, never a zero.
   */
  /**
   * Batch CSV import for the BD ledgers (WORKBENCH-API §23).
   *
   * `csv` is the file text itself — header row included — posted as `text/csv`; the
   * server parses it, so this method does not build a JSON body. `dryRun` defaults to
   * true on the server as well: omitting it previews. The response shape is identical
   * either way (only `committed` differs), so a preview and its confirmation can be
   * rendered by the same code.
   *
   * A rejected file is a **200** with `errors` populated and `committed: 0` — that is
   * a normal answer, not an API error. Only a malformed request (bad `kind`, non-CSV
   * content type, oversized body) throws.
   */
  // Capabilities (docs/engineering/WORKBENCH-API.md §24). The server resolves what
  // the caller may do; the client reads it once and hides entry points. Reads are
  // member-wide — this is not an access-check API, it is a rendering hint whose
  // authority is the 403 the real write would return.
  async getWorkbenchCapabilities(): Promise<WorkbenchCapabilitiesResponse> {
    const raw = await this.fetch<unknown>("/api/workbench/capabilities");
    return parseWithFallback(
      raw,
      WorkbenchCapabilitiesResponseSchema,
      EMPTY_WORKBENCH_CAPABILITIES_RESPONSE,
      { endpoint: "GET /api/workbench/capabilities" },
    );
  }

  async listWorkbenchRoleTemplates(): Promise<WorkbenchRoleTemplateListResponse> {
    const raw = await this.fetch<unknown>("/api/workbench/role-templates");
    return parseWithFallback(
      raw,
      WorkbenchRoleTemplateListResponseSchema,
      EMPTY_WORKBENCH_ROLE_TEMPLATE_LIST_RESPONSE,
      { endpoint: "GET /api/workbench/role-templates" },
    );
  }

  /** `PUT` replaces the whole set for one job title (owner/admin only). */
  async putWorkbenchRoleTemplate(
    jobTitle: string,
    capabilities: string[],
  ): Promise<WorkbenchRoleTemplate> {
    const raw = await this.fetch<unknown>(
      `/api/workbench/role-templates/${encodeURIComponent(jobTitle)}`,
      { method: "PUT", body: JSON.stringify({ capabilities }) },
    );
    return parseWithFallback(raw, WorkbenchRoleTemplateSchema, EMPTY_WORKBENCH_ROLE_TEMPLATE, {
      endpoint: "PUT /api/workbench/role-templates/:jobTitle",
    });
  }

  /** Removing a template returns its holders to the next resolution step. */
  async deleteWorkbenchRoleTemplate(jobTitle: string): Promise<void> {
    await this.fetch(`/api/workbench/role-templates/${encodeURIComponent(jobTitle)}`, {
      method: "DELETE",
    });
  }
  async importWorkbenchCsv(params: {
    kind: ImportKind;
    csv: string;
    dryRun?: boolean;
  }): Promise<ImportPreviewResponse> {
    const res = await this.fetchRaw(
      `/api/workbench/import${workbenchSearch({
        kind: params.kind,
        dry_run: params.dryRun === false ? 0 : 1,
      })}`,
      {
        method: "POST",
        body: params.csv,
        headers: { "Content-Type": "text/csv; charset=utf-8" },
      },
    );
    const raw = (await res.json()) as unknown;
    return parseWithFallback(
      raw,
      ImportPreviewResponseSchema,
      EMPTY_IMPORT_PREVIEW_RESPONSE,
      { endpoint: "POST /api/workbench/import" },
    );
  }
  async getWorkbenchFinance(
    params: { department_id?: string | null; month?: string } = {},
  ): Promise<WorkbenchFinanceResponse> {
    const raw = await this.fetch<unknown>(
      `/api/workbench/finance${workbenchSearch({ department_id: params.department_id, month: params.month })}`,
    );
    return parseWithFallback(raw, WorkbenchFinanceResponseSchema, EMPTY_WORKBENCH_FINANCE_RESPONSE, {
      endpoint: "GET /api/workbench/finance",
    });
  }

  /**
   * The month entries that feed the money block's cost side (contract §3,
   * migration 707): every entered month, newest first, or one month when
   * `month` (the `YYYY-MM` label) is given. Reads are member-wide; a malformed
   * body degrades to an empty history rather than throwing, so the tab keeps its
   * figures and the dialog opens on empty fields.
   */
  async listWorkbenchFinanceMonths(
    params: { month?: string | null } = {},
  ): Promise<WorkbenchFinanceMonthListResponse> {
    const raw = await this.fetch<unknown>(
      `/api/workbench/finance/months${workbenchSearch({ month: params.month })}`,
    );
    return parseWithFallback(
      raw,
      WorkbenchFinanceMonthListResponseSchema,
      EMPTY_WORKBENCH_FINANCE_MONTH_LIST,
      { endpoint: "GET /api/workbench/finance/months" },
    );
  }

  /**
   * Put one month's money entry (`PUT`, an upsert on workspace + month). The
   * server replaces the month, so an omitted amount is stored as "not recorded".
   */
  async upsertWorkbenchFinanceMonth(
    data: UpsertWorkbenchFinanceMonthRequest,
  ): Promise<WorkbenchFinanceMonth> {
    const raw = await this.fetch<unknown>("/api/workbench/finance/months", {
      method: "PUT",
      body: JSON.stringify(data),
    });
    return parseWithFallback(raw, WorkbenchFinanceMonthSchema, EMPTY_WORKBENCH_FINANCE_MONTH, {
      endpoint: "PUT /api/workbench/finance/months",
    });
  }

  async listCreators(filters: CreatorListFilters = {}): Promise<CreatorListResponse> {
    const raw = await this.fetch<unknown>(
      `/api/workbench/creators${workbenchSearch({
        kind: filters.kind,
        q: filters.q,
        sort: filters.sort,
        limit: filters.limit,
        cursor: filters.cursor,
        department_id: filters.department_id,
      })}`,
    );
    return parseWithFallback(raw, CreatorListResponseSchema, EMPTY_CREATOR_LIST_RESPONSE, {
      endpoint: "GET /api/workbench/creators",
    });
  }

  async createCreator(data: CreateCreatorRequest): Promise<Creator> {
    const raw = await this.fetch<unknown>("/api/workbench/creators", {
      method: "POST",
      body: JSON.stringify(data),
    });
    return parseWithFallback(raw, CreatorSchema, EMPTY_CREATOR, {
      endpoint: "POST /api/workbench/creators",
    });
  }

  async getCreator(id: string): Promise<Creator> {
    const raw = await this.fetch<unknown>(`/api/workbench/creators/${id}`);
    return parseWithFallback(raw, CreatorSchema, EMPTY_CREATOR, {
      endpoint: "GET /api/workbench/creators/:id",
    });
  }

  async updateCreator(id: string, data: UpdateCreatorRequest): Promise<Creator> {
    const raw = await this.fetch<unknown>(`/api/workbench/creators/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
    return parseWithFallback(raw, CreatorSchema, EMPTY_CREATOR, {
      endpoint: "PATCH /api/workbench/creators/:id",
    });
  }

  /** Soft delete: the server stamps `archived_at` and the row leaves the lists. */
  async deleteCreator(id: string): Promise<void> {
    await this.fetch(`/api/workbench/creators/${id}`, { method: "DELETE" });
  }

  async listCreatorPosts(filters: CreatorPostListFilters = {}): Promise<CreatorPostListResponse> {
    const raw = await this.fetch<unknown>(
      `/api/workbench/creator-posts${workbenchSearch({
        creator_id: filters.creator_id,
        from: filters.from,
        to: filters.to,
      })}`,
    );
    return parseWithFallback(raw, CreatorPostListResponseSchema, EMPTY_CREATOR_POST_LIST_RESPONSE, {
      endpoint: "GET /api/workbench/creator-posts",
    });
  }

  async createCreatorPost(data: CreateCreatorPostRequest): Promise<CreatorPost> {
    const raw = await this.fetch<unknown>("/api/workbench/creator-posts", {
      method: "POST",
      body: JSON.stringify(data),
    });
    return parseWithFallback(raw, CreatorPostSchema, EMPTY_CREATOR_POST, {
      endpoint: "POST /api/workbench/creator-posts",
    });
  }

  async updateCreatorPost(postId: string, data: UpdateCreatorPostRequest): Promise<CreatorPost> {
    const raw = await this.fetch<unknown>(`/api/workbench/creator-posts/${postId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
    return parseWithFallback(raw, CreatorPostSchema, EMPTY_CREATOR_POST, {
      endpoint: "PATCH /api/workbench/creator-posts/:postId",
    });
  }

  async deleteCreatorPost(postId: string): Promise<void> {
    await this.fetch(`/api/workbench/creator-posts/${postId}`, { method: "DELETE" });
  }

  async listCreatorPostMetrics(postId: string): Promise<CreatorPostMetricListResponse> {
    const raw = await this.fetch<unknown>(`/api/workbench/creator-posts/${postId}/metrics`);
    return parseWithFallback(
      raw,
      CreatorPostMetricListResponseSchema,
      EMPTY_CREATOR_POST_METRIC_LIST_RESPONSE,
      { endpoint: "GET /api/workbench/creator-posts/:postId/metrics" },
    );
  }

  /**
   * The creator health board (WORKBENCH-API §19): every creator in the workspace
   * with its latest content snapshot. A creator without one is still returned,
   * with null metrics — the board is not allowed to hide it.
   */
  async listCreatorHealth(
    filters: CreatorHealthListFilters = {},
  ): Promise<CreatorHealthListResponse> {
    const raw = await this.fetch<unknown>(
      `/api/workbench/creators/health${workbenchSearch({
        sort: filters.sort,
        limit: filters.limit,
        cursor: filters.cursor,
      })}`,
    );
    return parseWithFallback(raw, CreatorHealthListResponseSchema, EMPTY_CREATOR_HEALTH_LIST_RESPONSE, {
      endpoint: "GET /api/workbench/creators/health",
    });
  }

  /** One creator's newest snapshot plus the last 30 days of them. */
  async getCreatorHealth(creatorId: string): Promise<CreatorHealthDetailResponse> {
    const raw = await this.fetch<unknown>(`/api/workbench/creators/${creatorId}/health`);
    return parseWithFallback(
      raw,
      CreatorHealthDetailResponseSchema,
      EMPTY_CREATOR_HEALTH_DETAIL_RESPONSE,
      { endpoint: "GET /api/workbench/creators/:creatorId/health" },
    );
  }

  /**
   * The mirrored works behind a creator's content health, newest first
   * (WORKBENCH-API §19). The drawer's 最近作品 strip asks for five.
   */
  async listCreatorVideos(
    creatorId: string,
    limit?: number,
  ): Promise<CreatorVideoListResponse> {
    const raw = await this.fetch<unknown>(
      `/api/workbench/creators/${creatorId}/videos${workbenchSearch({ limit })}`,
    );
    return parseWithFallback(raw, CreatorVideoListResponseSchema, EMPTY_CREATOR_VIDEO_LIST_RESPONSE, {
      endpoint: "GET /api/workbench/creators/:creatorId/videos",
    });
  }

  /**
   * Upserts one day's snapshot for one post. `(post_id, captured_on)` is unique,
   * so re-submitting the same day corrects that day instead of adding a row.
   */
  async upsertCreatorPostMetric(
    postId: string,
    data: UpsertCreatorPostMetricRequest,
  ): Promise<CreatorPostMetric> {
    const raw = await this.fetch<unknown>(`/api/workbench/creator-posts/${postId}/metrics`, {
      method: "POST",
      body: JSON.stringify(data),
    });
    return parseWithFallback(raw, CreatorPostMetricSchema, EMPTY_CREATOR_POST_METRIC, {
      endpoint: "POST /api/workbench/creator-posts/:postId/metrics",
    });
  }

  async listCrmClients(filters: CrmClientListFilters = {}): Promise<CrmClientListResponse> {
    const raw = await this.fetch<unknown>(
      `/api/workbench/crm/clients${workbenchSearch({ q: filters.q })}`,
    );
    return parseWithFallback(raw, CrmClientListResponseSchema, EMPTY_CRM_CLIENT_LIST_RESPONSE, {
      endpoint: "GET /api/workbench/crm/clients",
    });
  }

  async createCrmClient(data: CreateCrmClientRequest): Promise<CrmClient> {
    const raw = await this.fetch<unknown>("/api/workbench/crm/clients", {
      method: "POST",
      body: JSON.stringify(data),
    });
    return parseWithFallback(raw, CrmClientSchema, EMPTY_CRM_CLIENT, {
      endpoint: "POST /api/workbench/crm/clients",
    });
  }

  async getCrmClient(id: string): Promise<CrmClient> {
    const raw = await this.fetch<unknown>(`/api/workbench/crm/clients/${id}`);
    return parseWithFallback(raw, CrmClientSchema, EMPTY_CRM_CLIENT, {
      endpoint: "GET /api/workbench/crm/clients/:clientId",
    });
  }

  async updateCrmClient(id: string, data: UpdateCrmClientRequest): Promise<CrmClient> {
    const raw = await this.fetch<unknown>(`/api/workbench/crm/clients/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
    return parseWithFallback(raw, CrmClientSchema, EMPTY_CRM_CLIENT, {
      endpoint: "PATCH /api/workbench/crm/clients/:clientId",
    });
  }

  async deleteCrmClient(id: string): Promise<void> {
    await this.fetch(`/api/workbench/crm/clients/${id}`, { method: "DELETE" });
  }

  async listCrmBriefs(filters: CrmBriefListFilters = {}): Promise<CrmBriefListResponse> {
    const raw = await this.fetch<unknown>(
      `/api/workbench/crm/briefs${workbenchSearch({
        status: filters.status,
        client_id: filters.client_id,
      })}`,
    );
    return parseWithFallback(raw, CrmBriefListResponseSchema, EMPTY_CRM_BRIEF_LIST_RESPONSE, {
      endpoint: "GET /api/workbench/crm/briefs",
    });
  }

  async createCrmBrief(data: CreateCrmBriefRequest): Promise<CrmBrief> {
    const raw = await this.fetch<unknown>("/api/workbench/crm/briefs", {
      method: "POST",
      body: JSON.stringify(data),
    });
    return parseWithFallback(raw, CrmBriefSchema, EMPTY_CRM_BRIEF, {
      endpoint: "POST /api/workbench/crm/briefs",
    });
  }

  async getCrmBrief(id: string): Promise<CrmBrief> {
    const raw = await this.fetch<unknown>(`/api/workbench/crm/briefs/${id}`);
    return parseWithFallback(raw, CrmBriefSchema, EMPTY_CRM_BRIEF, {
      endpoint: "GET /api/workbench/crm/briefs/:briefId",
    });
  }

  async updateCrmBrief(id: string, data: UpdateCrmBriefRequest): Promise<CrmBrief> {
    const raw = await this.fetch<unknown>(`/api/workbench/crm/briefs/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
    return parseWithFallback(raw, CrmBriefSchema, EMPTY_CRM_BRIEF, {
      endpoint: "PATCH /api/workbench/crm/briefs/:briefId",
    });
  }

  async deleteCrmBrief(id: string): Promise<void> {
    await this.fetch(`/api/workbench/crm/briefs/${id}`, { method: "DELETE" });
  }

  async listCrmCollabs(filters: CrmCollabListFilters = {}): Promise<CrmCollabListResponse> {
    const raw = await this.fetch<unknown>(
      `/api/workbench/crm/collabs${workbenchSearch({
        stage: filters.stage,
        brief_id: filters.brief_id,
        creator_id: filters.creator_id,
      })}`,
    );
    return parseWithFallback(raw, CrmCollabListResponseSchema, EMPTY_CRM_COLLAB_LIST_RESPONSE, {
      endpoint: "GET /api/workbench/crm/collabs",
    });
  }

  async createCrmCollab(data: CreateCrmCollabRequest): Promise<CrmCollab> {
    const raw = await this.fetch<unknown>("/api/workbench/crm/collabs", {
      method: "POST",
      body: JSON.stringify(data),
    });
    return parseWithFallback(raw, CrmCollabSchema, EMPTY_CRM_COLLAB, {
      endpoint: "POST /api/workbench/crm/collabs",
    });
  }

  async getCrmCollab(id: string): Promise<CrmCollab> {
    const raw = await this.fetch<unknown>(`/api/workbench/crm/collabs/${id}`);
    return parseWithFallback(raw, CrmCollabSchema, EMPTY_CRM_COLLAB, {
      endpoint: "GET /api/workbench/crm/collabs/:collabId",
    });
  }

  /** A `stage` change also writes `confirmed_at` / `published_at` / `accepted_at`
   *  server-side; the response carries those, so callers read it back. */
  async updateCrmCollab(id: string, data: UpdateCrmCollabRequest): Promise<CrmCollab> {
    const raw = await this.fetch<unknown>(`/api/workbench/crm/collabs/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }).catch((error: unknown) =>
      rethrowStaleWrite(
        error,
        CrmCollabSchema,
        EMPTY_CRM_COLLAB,
        "PATCH /api/workbench/crm/collabs/:collabId",
      ),
    );
    return parseWithFallback(raw, CrmCollabSchema, EMPTY_CRM_COLLAB, {
      endpoint: "PATCH /api/workbench/crm/collabs/:collabId",
    });
  }

  async deleteCrmCollab(id: string): Promise<void> {
    await this.fetch(`/api/workbench/crm/collabs/${id}`, { method: "DELETE" });
  }

  async listCrmSettlements(
    filters: CrmSettlementListFilters = {},
  ): Promise<CrmSettlementListResponse> {
    const raw = await this.fetch<unknown>(
      `/api/workbench/crm/settlements${workbenchSearch({
        collab_id: filters.collab_id,
        paid: filters.paid,
      })}`,
    );
    return parseWithFallback(
      raw,
      CrmSettlementListResponseSchema,
      EMPTY_CRM_SETTLEMENT_LIST_RESPONSE,
      { endpoint: "GET /api/workbench/crm/settlements" },
    );
  }

  async createCrmSettlement(data: CreateCrmSettlementRequest): Promise<CrmSettlement> {
    const raw = await this.fetch<unknown>("/api/workbench/crm/settlements", {
      method: "POST",
      body: JSON.stringify(data),
    });
    return parseWithFallback(raw, CrmSettlementSchema, EMPTY_CRM_SETTLEMENT, {
      endpoint: "POST /api/workbench/crm/settlements",
    });
  }

  // No GET for a single settlement (contract §3): the money ledger is read as a
  // list scoped by `collab_id`, and a detail read would only duplicate it.
  async updateCrmSettlement(
    id: string,
    data: UpdateCrmSettlementRequest,
  ): Promise<CrmSettlement> {
    const raw = await this.fetch<unknown>(`/api/workbench/crm/settlements/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }).catch((error: unknown) =>
      rethrowStaleWrite(
        error,
        CrmSettlementSchema,
        EMPTY_CRM_SETTLEMENT,
        "PATCH /api/workbench/crm/settlements/:settlementId",
      ),
    );
    return parseWithFallback(raw, CrmSettlementSchema, EMPTY_CRM_SETTLEMENT, {
      endpoint: "PATCH /api/workbench/crm/settlements/:settlementId",
    });
  }

  async deleteCrmSettlement(id: string): Promise<void> {
    await this.fetch(`/api/workbench/crm/settlements/${id}`, { method: "DELETE" });
  }

  // BD pipeline (docs/engineering/WORKBENCH-API.md §20): follow-ups, quotes and
  // collection campaigns, plus the 驾驶舱 aggregate. Reads are member-wide, writes
  // are gated server-side (owner/admin, or the row's owner), and there is no
  // `orders` resource on purpose — a collaboration is `/crm/collabs` (§20.1), and
  // a second one would be a second answer to "what did this creator cost us".

  async listBdActivities(
    filters: BdActivityListFilters = {},
  ): Promise<BdActivityListResponse> {
    const raw = await this.fetch<unknown>(
      `/api/workbench/bd/activities${workbenchSearch({
        creator_id: filters.creator_id,
        kind: filters.kind,
        from: filters.from,
        to: filters.to,
        limit: filters.limit,
      })}`,
    );
    return parseWithFallback(
      raw,
      BdActivityListResponseSchema,
      EMPTY_BD_ACTIVITY_LIST_RESPONSE,
      { endpoint: "GET /api/workbench/bd/activities" },
    );
  }

  async createBdActivity(data: CreateBdActivityRequest): Promise<BdActivity> {
    const raw = await this.fetch<unknown>("/api/workbench/bd/activities", {
      method: "POST",
      body: JSON.stringify(data),
    });
    return parseWithFallback(raw, BdActivitySchema, EMPTY_BD_ACTIVITY, {
      endpoint: "POST /api/workbench/bd/activities",
    });
  }

  async getBdActivity(id: string): Promise<BdActivity> {
    const raw = await this.fetch<unknown>(`/api/workbench/bd/activities/${id}`);
    return parseWithFallback(raw, BdActivitySchema, EMPTY_BD_ACTIVITY, {
      endpoint: "GET /api/workbench/bd/activities/:activityId",
    });
  }

  /** `creator_id` is not editable: the server answers 400 for it (§20.4). */
  async updateBdActivity(id: string, data: UpdateBdActivityRequest): Promise<BdActivity> {
    const raw = await this.fetch<unknown>(`/api/workbench/bd/activities/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }).catch((error: unknown) =>
      rethrowStaleWrite(
        error,
        BdActivitySchema,
        EMPTY_BD_ACTIVITY,
        "PATCH /api/workbench/bd/activities/:activityId",
      ),
    );
    return parseWithFallback(raw, BdActivitySchema, EMPTY_BD_ACTIVITY, {
      endpoint: "PATCH /api/workbench/bd/activities/:activityId",
    });
  }

  async deleteBdActivity(id: string): Promise<void> {
    await this.fetch(`/api/workbench/bd/activities/${id}`, { method: "DELETE" });
  }

  async listBdQuotes(filters: BdQuoteListFilters = {}): Promise<BdQuoteListResponse> {
    const raw = await this.fetch<unknown>(
      `/api/workbench/bd/quotes${workbenchSearch({
        creator_id: filters.creator_id,
        status: filters.status,
        limit: filters.limit,
      })}`,
    );
    return parseWithFallback(raw, BdQuoteListResponseSchema, EMPTY_BD_QUOTE_LIST_RESPONSE, {
      endpoint: "GET /api/workbench/bd/quotes",
    });
  }

  async createBdQuote(data: CreateBdQuoteRequest): Promise<BdQuote> {
    const raw = await this.fetch<unknown>("/api/workbench/bd/quotes", {
      method: "POST",
      body: JSON.stringify(data),
    });
    return parseWithFallback(raw, BdQuoteSchema, EMPTY_BD_QUOTE, {
      endpoint: "POST /api/workbench/bd/quotes",
    });
  }

  async getBdQuote(id: string): Promise<BdQuote> {
    const raw = await this.fetch<unknown>(`/api/workbench/bd/quotes/${id}`);
    return parseWithFallback(raw, BdQuoteSchema, EMPTY_BD_QUOTE, {
      endpoint: "GET /api/workbench/bd/quotes/:quoteId",
    });
  }

  /** The 400 on a commission rate outside 0–1 and on `valid_until < quoted_at`
   *  arrives as a thrown error, not as a patched row — the server refuses the
   *  write instead of flagging it (§20.4). */
  async updateBdQuote(id: string, data: UpdateBdQuoteRequest): Promise<BdQuote> {
    const raw = await this.fetch<unknown>(`/api/workbench/bd/quotes/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }).catch((error: unknown) =>
      rethrowStaleWrite(error, BdQuoteSchema, EMPTY_BD_QUOTE, "PATCH /api/workbench/bd/quotes/:quoteId"),
    );
    return parseWithFallback(raw, BdQuoteSchema, EMPTY_BD_QUOTE, {
      endpoint: "PATCH /api/workbench/bd/quotes/:quoteId",
    });
  }

  async deleteBdQuote(id: string): Promise<void> {
    await this.fetch(`/api/workbench/bd/quotes/${id}`, { method: "DELETE" });
  }

  async listBdCampaigns(
    filters: BdCampaignListFilters = {},
  ): Promise<BdCampaignListResponse> {
    const raw = await this.fetch<unknown>(
      `/api/workbench/bd/campaigns${workbenchSearch({
        kind: filters.kind,
        limit: filters.limit,
      })}`,
    );
    return parseWithFallback(
      raw,
      BdCampaignListResponseSchema,
      EMPTY_BD_CAMPAIGN_LIST_RESPONSE,
      { endpoint: "GET /api/workbench/bd/campaigns" },
    );
  }

  /** A duplicate name (case-insensitive, live rows) answers 409. */
  async createBdCampaign(data: CreateBdCampaignRequest): Promise<BdCampaign> {
    const raw = await this.fetch<unknown>("/api/workbench/bd/campaigns", {
      method: "POST",
      body: JSON.stringify(data),
    });
    return parseWithFallback(raw, BdCampaignSchema, EMPTY_BD_CAMPAIGN, {
      endpoint: "POST /api/workbench/bd/campaigns",
    });
  }

  async getBdCampaign(id: string): Promise<BdCampaign> {
    const raw = await this.fetch<unknown>(`/api/workbench/bd/campaigns/${id}`);
    return parseWithFallback(raw, BdCampaignSchema, EMPTY_BD_CAMPAIGN, {
      endpoint: "GET /api/workbench/bd/campaigns/:campaignId",
    });
  }

  async updateBdCampaign(id: string, data: UpdateBdCampaignRequest): Promise<BdCampaign> {
    const raw = await this.fetch<unknown>(`/api/workbench/bd/campaigns/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
    return parseWithFallback(raw, BdCampaignSchema, EMPTY_BD_CAMPAIGN, {
      endpoint: "PATCH /api/workbench/bd/campaigns/:campaignId",
    });
  }

  async deleteBdCampaign(id: string): Promise<void> {
    await this.fetch(`/api/workbench/bd/campaigns/${id}`, { method: "DELETE" });
  }

  /**
   * The 驾驶舱: four blocks in one round trip. Every number is three-state, so a
   * caller renders `value: null` as a gap and never as a zero it invented.
   */
  async getBdPipeline(): Promise<BdPipeline> {
    const raw = await this.fetch<unknown>("/api/workbench/bd/pipeline");
    return parseWithFallback(raw, BdPipelineSchema, EMPTY_BD_PIPELINE, {
      endpoint: "GET /api/workbench/bd/pipeline",
    });
  }

  /**
   * The windowed report (WORKBENCH-API §22). `from` / `to` are inclusive days and
   * both are optional — the server defaults to "this month so far" and echoes the
   * window it used, so the page can label the trend without recomputing it. An
   * inverted range is a 400, not an empty report.
   */
  async getBdPerformance(filters: BdPerformanceFilters = {}): Promise<BdPerformance> {
    const raw = await this.fetch<unknown>(
      `/api/workbench/bd/performance${workbenchSearch({
        from: filters.from,
        to: filters.to,
      })}`,
    );
    return parseWithFallback(raw, BdPerformanceSchema, EMPTY_BD_PERFORMANCE, {
      endpoint: "GET /api/workbench/bd/performance",
    });
  }

  // 千川投放 (docs/engineering/WORKBENCH-API.md §25). Six reads and no writes:
  // the only writer is `cmd/qianchuan-sync`, so there is no create/update method
  // here to call. Every amount carries its `basis` — `summary` takes one of the
  // five settlement windows per request, and there is no endpoint that adds two.
  async getAdsSummary(filters: AdsSummaryFilters = {}): Promise<AdsSummary> {
    const raw = await this.fetch<unknown>(
      `/api/workbench/ads/summary${workbenchSearch({
        from: filters.from,
        to: filters.to,
        basis: filters.basis,
      })}`,
    );
    return parseWithFallback(raw, AdsSummarySchema, EMPTY_ADS_SUMMARY, {
      endpoint: "GET /api/workbench/ads/summary",
    });
  }

  async listAdsAccounts(): Promise<AdsAccountListResponse> {
    const raw = await this.fetch<unknown>(`/api/workbench/ads/accounts`);
    return parseWithFallback(raw, AdsAccountListSchema, EMPTY_ADS_ACCOUNTS, {
      endpoint: "GET /api/workbench/ads/accounts",
    });
  }

  async listAdsPlans(filters: { account_id?: string; status?: string } = {}): Promise<AdsPlanListResponse> {
    const raw = await this.fetch<unknown>(
      `/api/workbench/ads/plans${workbenchSearch({
        account_id: filters.account_id,
        status: filters.status,
      })}`,
    );
    return parseWithFallback(raw, AdsPlanListSchema, EMPTY_ADS_PLANS, {
      endpoint: "GET /api/workbench/ads/plans",
    });
  }

  async listAdsMaterials(
    filters: { account_id?: string; type?: string } = {},
  ): Promise<AdsMaterialListResponse> {
    const raw = await this.fetch<unknown>(
      `/api/workbench/ads/materials${workbenchSearch({
        account_id: filters.account_id,
        type: filters.type,
      })}`,
    );
    return parseWithFallback(raw, AdsMaterialListSchema, EMPTY_ADS_MATERIALS, {
      endpoint: "GET /api/workbench/ads/materials",
    });
  }

  async listAdsViolations(filters: { status?: string } = {}): Promise<AdsViolationListResponse> {
    const raw = await this.fetch<unknown>(
      `/api/workbench/ads/violations${workbenchSearch({ status: filters.status })}`,
    );
    return parseWithFallback(raw, AdsViolationListSchema, EMPTY_ADS_VIOLATIONS, {
      endpoint: "GET /api/workbench/ads/violations",
    });
  }

  async listAdsRecon(filters: { account_id?: string } = {}): Promise<AdsReconListResponse> {
    const raw = await this.fetch<unknown>(
      `/api/workbench/ads/recon${workbenchSearch({ account_id: filters.account_id })}`,
    );
    return parseWithFallback(raw, AdsReconListSchema, EMPTY_ADS_RECON, {
      endpoint: "GET /api/workbench/ads/recon",
    });
  }

  // Affiliate distribution (docs/engineering/WORKBENCH-API.md §11). Same base and
  // same write scope as the ledgers above: reads are member-wide, writes are gated
  // server-side (owner/admin, or the row's owner; a daily fact inherits its pick's
  // owner, a settlement statement is owner/admin only). `settlements` has no
  // delete — a statement is a platform fact — and `daily` has no create: its only
  // write is the `(pick_id, stat_date)` upsert.

  async listAffiliateProducts(
    filters: AffiliateProductListFilters = {},
  ): Promise<AffiliateProductListResponse> {
    const raw = await this.fetch<unknown>(
      `/api/workbench/affiliate/products${workbenchSearch({
        client_id: filters.client_id,
        status: filters.status,
        platform: filters.platform,
        limit: filters.limit,
        cursor: filters.cursor,
      })}`,
    );
    return parseWithFallback(
      raw,
      AffiliateProductListResponseSchema,
      EMPTY_AFFILIATE_PRODUCT_LIST_RESPONSE,
      { endpoint: "GET /api/workbench/affiliate/products" },
    );
  }

  async createAffiliateProduct(
    data: CreateAffiliateProductRequest,
  ): Promise<AffiliateProduct> {
    const raw = await this.fetch<unknown>("/api/workbench/affiliate/products", {
      method: "POST",
      body: JSON.stringify(data),
    });
    return parseWithFallback(raw, AffiliateProductSchema, EMPTY_AFFILIATE_PRODUCT, {
      endpoint: "POST /api/workbench/affiliate/products",
    });
  }

  async getAffiliateProduct(id: string): Promise<AffiliateProduct> {
    const raw = await this.fetch<unknown>(`/api/workbench/affiliate/products/${id}`);
    return parseWithFallback(raw, AffiliateProductSchema, EMPTY_AFFILIATE_PRODUCT, {
      endpoint: "GET /api/workbench/affiliate/products/:productId",
    });
  }

  async updateAffiliateProduct(
    id: string,
    data: UpdateAffiliateProductRequest,
  ): Promise<AffiliateProduct> {
    const raw = await this.fetch<unknown>(`/api/workbench/affiliate/products/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
    return parseWithFallback(raw, AffiliateProductSchema, EMPTY_AFFILIATE_PRODUCT, {
      endpoint: "PATCH /api/workbench/affiliate/products/:productId",
    });
  }

  async deleteAffiliateProduct(id: string): Promise<void> {
    await this.fetch(`/api/workbench/affiliate/products/${id}`, { method: "DELETE" });
  }

  async listAffiliatePicks(
    filters: AffiliatePickListFilters = {},
  ): Promise<AffiliatePickListResponse> {
    const raw = await this.fetch<unknown>(
      `/api/workbench/affiliate/picks${workbenchSearch({
        product_id: filters.product_id,
        creator_id: filters.creator_id,
        status: filters.status,
        limit: filters.limit,
        cursor: filters.cursor,
      })}`,
    );
    return parseWithFallback(
      raw,
      AffiliatePickListResponseSchema,
      EMPTY_AFFILIATE_PICK_LIST_RESPONSE,
      { endpoint: "GET /api/workbench/affiliate/picks" },
    );
  }

  async createAffiliatePick(data: CreateAffiliatePickRequest): Promise<AffiliatePick> {
    const raw = await this.fetch<unknown>("/api/workbench/affiliate/picks", {
      method: "POST",
      body: JSON.stringify(data),
    });
    return parseWithFallback(raw, AffiliatePickSchema, EMPTY_AFFILIATE_PICK, {
      endpoint: "POST /api/workbench/affiliate/picks",
    });
  }

  async getAffiliatePick(id: string): Promise<AffiliatePick> {
    const raw = await this.fetch<unknown>(`/api/workbench/affiliate/picks/${id}`);
    return parseWithFallback(raw, AffiliatePickSchema, EMPTY_AFFILIATE_PICK, {
      endpoint: "GET /api/workbench/affiliate/picks/:pickId",
    });
  }

  async updateAffiliatePick(
    id: string,
    data: UpdateAffiliatePickRequest,
  ): Promise<AffiliatePick> {
    const raw = await this.fetch<unknown>(`/api/workbench/affiliate/picks/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
    return parseWithFallback(raw, AffiliatePickSchema, EMPTY_AFFILIATE_PICK, {
      endpoint: "PATCH /api/workbench/affiliate/picks/:pickId",
    });
  }

  async deleteAffiliatePick(id: string): Promise<void> {
    await this.fetch(`/api/workbench/affiliate/picks/${id}`, { method: "DELETE" });
  }

  async listAffiliateDaily(
    filters: AffiliateDailyListFilters = {},
  ): Promise<AffiliateDailyListResponse> {
    const raw = await this.fetch<unknown>(
      `/api/workbench/affiliate/daily${workbenchSearch({
        pick_id: filters.pick_id,
        from: filters.from,
        to: filters.to,
        limit: filters.limit,
      })}`,
    );
    return parseWithFallback(
      raw,
      AffiliateDailyListResponseSchema,
      EMPTY_AFFILIATE_DAILY_LIST_RESPONSE,
      { endpoint: "GET /api/workbench/affiliate/daily" },
    );
  }

  /** One day of one pick, upserted on `(pick_id, stat_date)`; PUT replaces the day. */
  async upsertAffiliateDaily(data: UpsertAffiliateDailyRequest): Promise<AffiliateDaily> {
    const raw = await this.fetch<unknown>("/api/workbench/affiliate/daily", {
      method: "PUT",
      body: JSON.stringify(data),
    });
    return parseWithFallback(raw, AffiliateDailySchema, EMPTY_AFFILIATE_DAILY, {
      endpoint: "PUT /api/workbench/affiliate/daily",
    });
  }

  async listAffiliateSettlements(
    filters: AffiliateSettlementListFilters = {},
  ): Promise<AffiliateSettlementListResponse> {
    const raw = await this.fetch<unknown>(
      `/api/workbench/affiliate/settlements${workbenchSearch({
        status: filters.status,
        from: filters.from,
        to: filters.to,
        limit: filters.limit,
      })}`,
    );
    return parseWithFallback(
      raw,
      AffiliateSettlementListResponseSchema,
      EMPTY_AFFILIATE_SETTLEMENT_LIST_RESPONSE,
      { endpoint: "GET /api/workbench/affiliate/settlements" },
    );
  }

  async createAffiliateSettlement(
    data: CreateAffiliateSettlementRequest,
  ): Promise<AffiliateSettlement> {
    const raw = await this.fetch<unknown>("/api/workbench/affiliate/settlements", {
      method: "POST",
      body: JSON.stringify(data),
    });
    return parseWithFallback(raw, AffiliateSettlementSchema, EMPTY_AFFILIATE_SETTLEMENT, {
      endpoint: "POST /api/workbench/affiliate/settlements",
    });
  }

  async updateAffiliateSettlement(
    id: string,
    data: UpdateAffiliateSettlementRequest,
  ): Promise<AffiliateSettlement> {
    const raw = await this.fetch<unknown>(`/api/workbench/affiliate/settlements/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
    return parseWithFallback(raw, AffiliateSettlementSchema, EMPTY_AFFILIATE_SETTLEMENT, {
      endpoint: "PATCH /api/workbench/affiliate/settlements/:settlementId",
    });
  }

  /**
   * One month of the affiliate ledger (§11): GMV, estimated and settled
   * commission, refund rate, platform tech fee, and the live plan set. Each block
   * is the contract's three-state entry, so a month with no imported report
   * leaves the money blocks on the gap card rather than at zero.
   */
  async getAffiliateSummary(
    params: AffiliateSummaryFilters = {},
  ): Promise<AffiliateSummaryResponse> {
    const raw = await this.fetch<unknown>(
      `/api/workbench/affiliate/summary${workbenchSearch({
        month: params.month,
        department_id: params.department_id,
      })}`,
    );
    return parseWithFallback(
      raw,
      AffiliateSummaryResponseSchema,
      EMPTY_AFFILIATE_SUMMARY_RESPONSE,
      { endpoint: "GET /api/workbench/affiliate/summary" },
    );
  }

  // Content workbench (docs/engineering/WORKBENCH-API.md §12). Base
  // `/api/workbench/media`, same read/write split as the ledgers above: reads are
  // member-wide, writes are gated server-side (owner/admin write everything, a
  // member writes the rows it owns, and a script or shoot is gated through the
  // topic it came from).
  //
  // Two shapes here are not "the row": `GET /ips/:id` answers the IP *with* its
  // accounts, and `listMediaShoots` filters on `shoot_date` with inclusive days.

  async listMediaIPs(filters: MediaIPListFilters = {}): Promise<MediaIPListResponse> {
    const raw = await this.fetch<unknown>(
      `/api/workbench/media/ips${workbenchSearch({
        status: filters.status,
        limit: filters.limit,
      })}`,
    );
    return parseWithFallback(raw, MediaIPListResponseSchema, EMPTY_MEDIA_IP_LIST_RESPONSE, {
      endpoint: "GET /api/workbench/media/ips",
    });
  }

  async createMediaIP(data: CreateMediaIPRequest): Promise<MediaIP> {
    const raw = await this.fetch<unknown>("/api/workbench/media/ips", {
      method: "POST",
      body: JSON.stringify(data),
    });
    return parseWithFallback(raw, MediaIPSchema, EMPTY_MEDIA_IP, {
      endpoint: "POST /api/workbench/media/ips",
    });
  }

  /** The IP plus the platform accounts attached to it (`creator.media_ip_id`). */
  async getMediaIP(id: string): Promise<MediaIPDetail> {
    const raw = await this.fetch<unknown>(`/api/workbench/media/ips/${id}`);
    return parseWithFallback(raw, MediaIPDetailSchema, EMPTY_MEDIA_IP_DETAIL, {
      endpoint: "GET /api/workbench/media/ips/:ipId",
    });
  }

  async updateMediaIP(id: string, data: UpdateMediaIPRequest): Promise<MediaIP> {
    const raw = await this.fetch<unknown>(`/api/workbench/media/ips/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
    return parseWithFallback(raw, MediaIPSchema, EMPTY_MEDIA_IP, {
      endpoint: "PATCH /api/workbench/media/ips/:ipId",
    });
  }

  /** Soft delete: the IP keeps its rows and stops appearing in lists. */
  async deleteMediaIP(id: string): Promise<void> {
    await this.fetch(`/api/workbench/media/ips/${id}`, { method: "DELETE" });
  }

  /**
   * Attach a platform account to an IP by writing `creator.media_ip_id`. An
   * account belongs to at most one IP, so attaching one that already carries a
   * pointer is a 409 on the server.
   */
  async attachMediaIPAccount(ipId: string, data: AttachMediaIPAccountRequest): Promise<MediaIPAccount> {
    const raw = await this.fetch<unknown>(`/api/workbench/media/ips/${ipId}/accounts`, {
      method: "POST",
      body: JSON.stringify(data),
    });
    return parseWithFallback(raw, MediaIPAccountSchema, EMPTY_MEDIA_IP_ACCOUNT, {
      endpoint: "POST /api/workbench/media/ips/:ipId/accounts",
    });
  }

  /** Clear the pointer. The account stays in the creator ledger. */
  async detachMediaIPAccount(ipId: string, creatorId: string): Promise<void> {
    await this.fetch(`/api/workbench/media/ips/${ipId}/accounts/${creatorId}`, {
      method: "DELETE",
    });
  }

  async listMediaTopics(filters: MediaTopicListFilters = {}): Promise<MediaTopicListResponse> {
    const raw = await this.fetch<unknown>(
      `/api/workbench/media/topics${workbenchSearch({
        ip_id: filters.ip_id,
        status: filters.status,
        limit: filters.limit,
      })}`,
    );
    return parseWithFallback(raw, MediaTopicListResponseSchema, EMPTY_MEDIA_TOPIC_LIST_RESPONSE, {
      endpoint: "GET /api/workbench/media/topics",
    });
  }

  async createMediaTopic(data: CreateMediaTopicRequest): Promise<MediaTopic> {
    const raw = await this.fetch<unknown>("/api/workbench/media/topics", {
      method: "POST",
      body: JSON.stringify(data),
    });
    return parseWithFallback(raw, MediaTopicSchema, EMPTY_MEDIA_TOPIC, {
      endpoint: "POST /api/workbench/media/topics",
    });
  }

  async getMediaTopic(id: string): Promise<MediaTopic> {
    const raw = await this.fetch<unknown>(`/api/workbench/media/topics/${id}`);
    return parseWithFallback(raw, MediaTopicSchema, EMPTY_MEDIA_TOPIC, {
      endpoint: "GET /api/workbench/media/topics/:topicId",
    });
  }

  async updateMediaTopic(id: string, data: UpdateMediaTopicRequest): Promise<MediaTopic> {
    const raw = await this.fetch<unknown>(`/api/workbench/media/topics/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
    return parseWithFallback(raw, MediaTopicSchema, EMPTY_MEDIA_TOPIC, {
      endpoint: "PATCH /api/workbench/media/topics/:topicId",
    });
  }

  async deleteMediaTopic(id: string): Promise<void> {
    await this.fetch(`/api/workbench/media/topics/${id}`, { method: "DELETE" });
  }

  /**
   * Every version of the topic's script, newest first. There is no "current
   * version" read: v1 has to stay readable next to v2 for the review screen.
   */
  async listMediaScripts(filters: MediaScriptListFilters = {}): Promise<MediaScriptListResponse> {
    const raw = await this.fetch<unknown>(
      `/api/workbench/media/scripts${workbenchSearch({
        topic_id: filters.topic_id,
        status: filters.status,
        limit: filters.limit,
      })}`,
    );
    return parseWithFallback(raw, MediaScriptListResponseSchema, EMPTY_MEDIA_SCRIPT_LIST_RESPONSE, {
      endpoint: "GET /api/workbench/media/scripts",
    });
  }

  async createMediaScript(data: CreateMediaScriptRequest): Promise<MediaScript> {
    const raw = await this.fetch<unknown>("/api/workbench/media/scripts", {
      method: "POST",
      body: JSON.stringify(data),
    });
    return parseWithFallback(raw, MediaScriptSchema, EMPTY_MEDIA_SCRIPT, {
      endpoint: "POST /api/workbench/media/scripts",
    });
  }

  async getMediaScript(id: string): Promise<MediaScript> {
    const raw = await this.fetch<unknown>(`/api/workbench/media/scripts/${id}`);
    return parseWithFallback(raw, MediaScriptSchema, EMPTY_MEDIA_SCRIPT, {
      endpoint: "GET /api/workbench/media/scripts/:scriptId",
    });
  }

  /**
   * Rewrite a script. By default a PATCH that touches the copy (hook / body /
   * cta / cover_note / tags) *creates the next version* and answers with it — the
   * previous version stays readable under its own id. Pass `inPlace` for a
   * correction that must not mint a version; a PATCH that only moves `status` or
   * `publish_at` never does, whatever this flag says.
   */
  async updateMediaScript(
    id: string,
    data: UpdateMediaScriptRequest,
    inPlace = false,
  ): Promise<MediaScript> {
    const raw = await this.fetch<unknown>(
      `/api/workbench/media/scripts/${id}${inPlace ? "?inPlace=1" : ""}`,
      { method: "PATCH", body: JSON.stringify(data) },
    );
    return parseWithFallback(raw, MediaScriptSchema, EMPTY_MEDIA_SCRIPT, {
      endpoint: "PATCH /api/workbench/media/scripts/:scriptId",
    });
  }

  async deleteMediaScript(id: string): Promise<void> {
    await this.fetch(`/api/workbench/media/scripts/${id}`, { method: "DELETE" });
  }

  /** The shoot calendar. `from`/`to` are inclusive `YYYY-MM-DD` days. */
  async listMediaShoots(filters: MediaShootListFilters = {}): Promise<MediaShootListResponse> {
    const raw = await this.fetch<unknown>(
      `/api/workbench/media/shoots${workbenchSearch({
        script_id: filters.script_id,
        from: filters.from,
        to: filters.to,
        limit: filters.limit,
      })}`,
    );
    return parseWithFallback(raw, MediaShootListResponseSchema, EMPTY_MEDIA_SHOOT_LIST_RESPONSE, {
      endpoint: "GET /api/workbench/media/shoots",
    });
  }

  async createMediaShoot(data: CreateMediaShootRequest): Promise<MediaShoot> {
    const raw = await this.fetch<unknown>("/api/workbench/media/shoots", {
      method: "POST",
      body: JSON.stringify(data),
    });
    return parseWithFallback(raw, MediaShootSchema, EMPTY_MEDIA_SHOOT, {
      endpoint: "POST /api/workbench/media/shoots",
    });
  }

  async getMediaShoot(id: string): Promise<MediaShoot> {
    const raw = await this.fetch<unknown>(`/api/workbench/media/shoots/${id}`);
    return parseWithFallback(raw, MediaShootSchema, EMPTY_MEDIA_SHOOT, {
      endpoint: "GET /api/workbench/media/shoots/:shootId",
    });
  }

  /** `checklist` merges over the stored ticks; `shots` replaces the document. */
  async updateMediaShoot(id: string, data: UpdateMediaShootRequest): Promise<MediaShoot> {
    const raw = await this.fetch<unknown>(`/api/workbench/media/shoots/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
    return parseWithFallback(raw, MediaShootSchema, EMPTY_MEDIA_SHOOT, {
      endpoint: "PATCH /api/workbench/media/shoots/:shootId",
    });
  }

  async deleteMediaShoot(id: string): Promise<void> {
    await this.fetch(`/api/workbench/media/shoots/${id}`, { method: "DELETE" });
  }

  // Hotspot radar and benchmark teardown (docs/engineering/WORKBENCH-API.md §21).
  // Two source ledgers behind the topic pool. Same read/write split as the content
  // chain above; `adopt` is the only write that touches `media_topic`, and it
  // answers with the new topic rather than with the source row — the caller is
  // being handed the thing it just created.

  async listMediaHot(filters: MediaHotListFilters = {}): Promise<MediaHotListResponse> {
    const raw = await this.fetch<unknown>(
      `/api/workbench/media/hot${workbenchSearch({
        captured_on: filters.captured_on,
        category: filters.category,
        platform: filters.platform,
        q: filters.q,
        limit: filters.limit,
      })}`,
    );
    return parseWithFallback(raw, MediaHotListResponseSchema, EMPTY_MEDIA_HOT_LIST_RESPONSE, {
      endpoint: "GET /api/workbench/media/hot",
    });
  }

  async createMediaHot(data: CreateMediaHotRequest): Promise<MediaHot> {
    const raw = await this.fetch<unknown>("/api/workbench/media/hot", {
      method: "POST",
      body: JSON.stringify(data),
    });
    return parseWithFallback(raw, MediaHotSchema, EMPTY_MEDIA_HOT, {
      endpoint: "POST /api/workbench/media/hot",
    });
  }

  async getMediaHot(id: string): Promise<MediaHot> {
    const raw = await this.fetch<unknown>(`/api/workbench/media/hot/${id}`);
    return parseWithFallback(raw, MediaHotSchema, EMPTY_MEDIA_HOT, {
      endpoint: "GET /api/workbench/media/hot/:hotId",
    });
  }

  /**
   * An omitted field keeps its stored value; `rank` / `heat_value` / `url` sent as
   * `null` clear the column — "the platform published none" is a state the radar
   * screen can set, not a value it has to leave behind.
   */
  async updateMediaHot(id: string, data: UpdateMediaHotRequest): Promise<MediaHot> {
    const raw = await this.fetch<unknown>(`/api/workbench/media/hot/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
    return parseWithFallback(raw, MediaHotSchema, EMPTY_MEDIA_HOT, {
      endpoint: "PATCH /api/workbench/media/hot/:hotId",
    });
  }

  async deleteMediaHot(id: string): Promise<void> {
    await this.fetch(`/api/workbench/media/hot/${id}`, { method: "DELETE" });
  }

  /**
   * Copy a hotspot into the topic pool: `source = 'hot'`, `hot_id` = this row,
   * `scores = {}`. The radar row is only read — adopting twice produces two topics,
   * which is what "I want it in two personas' pools" means.
   */
  async adoptMediaHot(id: string, data: AdoptMediaRequest): Promise<MediaTopic> {
    const raw = await this.fetch<unknown>(`/api/workbench/media/hot/${id}/adopt`, {
      method: "POST",
      body: JSON.stringify(data),
    });
    return parseWithFallback(raw, MediaTopicSchema, EMPTY_MEDIA_TOPIC, {
      endpoint: "POST /api/workbench/media/hot/:hotId/adopt",
    });
  }

  async listMediaBench(filters: MediaBenchListFilters = {}): Promise<MediaBenchListResponse> {
    const raw = await this.fetch<unknown>(
      `/api/workbench/media/bench${workbenchSearch({
        ip_id: filters.ip_id,
        captured_on: filters.captured_on,
        platform: filters.platform,
        q: filters.q,
        limit: filters.limit,
      })}`,
    );
    return parseWithFallback(raw, MediaBenchListResponseSchema, EMPTY_MEDIA_BENCH_LIST_RESPONSE, {
      endpoint: "GET /api/workbench/media/bench",
    });
  }

  async createMediaBench(data: CreateMediaBenchRequest): Promise<MediaBench> {
    const raw = await this.fetch<unknown>("/api/workbench/media/bench", {
      method: "POST",
      body: JSON.stringify(data),
    });
    return parseWithFallback(raw, MediaBenchSchema, EMPTY_MEDIA_BENCH, {
      endpoint: "POST /api/workbench/media/bench",
    });
  }

  async getMediaBench(id: string): Promise<MediaBench> {
    const raw = await this.fetch<unknown>(`/api/workbench/media/bench/${id}`);
    return parseWithFallback(raw, MediaBenchSchema, EMPTY_MEDIA_BENCH, {
      endpoint: "GET /api/workbench/media/bench/:benchId",
    });
  }

  /** `metrics` is written whole: a benchmark card is one artifact, not a patch. */
  async updateMediaBench(id: string, data: UpdateMediaBenchRequest): Promise<MediaBench> {
    const raw = await this.fetch<unknown>(`/api/workbench/media/bench/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
    return parseWithFallback(raw, MediaBenchSchema, EMPTY_MEDIA_BENCH, {
      endpoint: "PATCH /api/workbench/media/bench/:benchId",
    });
  }

  async deleteMediaBench(id: string): Promise<void> {
    await this.fetch(`/api/workbench/media/bench/${id}`, { method: "DELETE" });
  }

  /** The same copy from a benchmarked account: `source = 'bench'`. */
  async adoptMediaBench(id: string, data: AdoptMediaRequest): Promise<MediaTopic> {
    const raw = await this.fetch<unknown>(`/api/workbench/media/bench/${id}/adopt`, {
      method: "POST",
      body: JSON.stringify(data),
    });
    return parseWithFallback(raw, MediaTopicSchema, EMPTY_MEDIA_TOPIC, {
      endpoint: "POST /api/workbench/media/bench/:benchId/adopt",
    });
  }

  // General manager workbench (docs/engineering/WORKBENCH-API.md §13): OKR goals
  // with their key results and department packages, and the radar signals that
  // convert into a goal or an issue. `/api/workbench`, same read/write split as
  // the ledgers above: reads are member-wide, the write gate is server-side, and a
  // key result or a package is gated on the owner of the goal it hangs off.

  async listGoals(filters: GoalListFilters = {}): Promise<GoalListResponse> {
    const raw = await this.fetch<unknown>(
      `/api/workbench/goals${workbenchSearch({
        cycle: filters.cycle,
        status: filters.status,
        limit: filters.limit,
      })}`,
    );
    return parseWithFallback(raw, GoalListResponseSchema, EMPTY_GOAL_LIST_RESPONSE, {
      endpoint: "GET /api/workbench/goals",
    });
  }

  async createGoal(data: CreateGoalRequest): Promise<Goal> {
    const raw = await this.fetch<unknown>("/api/workbench/goals", {
      method: "POST",
      body: JSON.stringify(data),
    });
    return parseWithFallback(raw, GoalSchema, EMPTY_GOAL, {
      endpoint: "POST /api/workbench/goals",
    });
  }

  /** The goal plus its key results, its packages and the issues under it. */
  async getGoal(id: string): Promise<GoalDetail> {
    const raw = await this.fetch<unknown>(`/api/workbench/goals/${id}`);
    return parseWithFallback(raw, GoalDetailSchema, EMPTY_GOAL_DETAIL, {
      endpoint: "GET /api/workbench/goals/:goalId",
    });
  }

  async updateGoal(id: string, data: UpdateGoalRequest): Promise<Goal> {
    const raw = await this.fetch<unknown>(`/api/workbench/goals/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
    return parseWithFallback(raw, GoalSchema, EMPTY_GOAL, {
      endpoint: "PATCH /api/workbench/goals/:goalId",
    });
  }

  /** Soft delete; the goal's key results and packages are archived with it. */
  async deleteGoal(id: string): Promise<void> {
    await this.fetch(`/api/workbench/goals/${id}`, { method: "DELETE" });
  }

  async createGoalKeyResult(
    goalId: string,
    data: CreateGoalKeyResultRequest,
  ): Promise<GoalKeyResult> {
    const raw = await this.fetch<unknown>(`/api/workbench/goals/${goalId}/key-results`, {
      method: "POST",
      body: JSON.stringify(data),
    });
    return parseWithFallback(raw, GoalKeyResultSchema, EMPTY_GOAL_KEY_RESULT, {
      endpoint: "POST /api/workbench/goals/:goalId/key-results",
    });
  }

  /**
   * Records a key result's figure. `current` may exceed `target`; the server
   * stores what it is given and never re-derives one from the other.
   */
  async updateGoalKeyResult(
    goalId: string,
    keyResultId: string,
    data: UpdateGoalKeyResultRequest,
  ): Promise<GoalKeyResult> {
    const raw = await this.fetch<unknown>(
      `/api/workbench/goals/${goalId}/key-results/${keyResultId}`,
      { method: "PATCH", body: JSON.stringify(data) },
    );
    return parseWithFallback(raw, GoalKeyResultSchema, EMPTY_GOAL_KEY_RESULT, {
      endpoint: "PATCH /api/workbench/goals/:goalId/key-results/:keyResultId",
    });
  }

  async deleteGoalKeyResult(goalId: string, keyResultId: string): Promise<void> {
    await this.fetch(`/api/workbench/goals/${goalId}/key-results/${keyResultId}`, {
      method: "DELETE",
    });
  }

  async createGoalPackage(goalId: string, data: CreateGoalPackageRequest): Promise<GoalPackage> {
    const raw = await this.fetch<unknown>(`/api/workbench/goals/${goalId}/packages`, {
      method: "POST",
      body: JSON.stringify(data),
    });
    return parseWithFallback(raw, GoalPackageSchema, EMPTY_GOAL_PACKAGE, {
      endpoint: "POST /api/workbench/goals/:goalId/packages",
    });
  }

  async updateGoalPackage(
    goalId: string,
    packageId: string,
    data: UpdateGoalPackageRequest,
  ): Promise<GoalPackage> {
    const raw = await this.fetch<unknown>(`/api/workbench/goals/${goalId}/packages/${packageId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
    return parseWithFallback(raw, GoalPackageSchema, EMPTY_GOAL_PACKAGE, {
      endpoint: "PATCH /api/workbench/goals/:goalId/packages/:packageId",
    });
  }

  async deleteGoalPackage(goalId: string, packageId: string): Promise<void> {
    await this.fetch(`/api/workbench/goals/${goalId}/packages/${packageId}`, { method: "DELETE" });
  }

  /** Attaches an existing issue to the goal (`issue.goal_id`); 409 if it has one. */
  async attachGoalIssue(goalId: string, data: AttachGoalIssueRequest): Promise<GoalIssue> {
    const raw = await this.fetch<unknown>(`/api/workbench/goals/${goalId}/issues`, {
      method: "POST",
      body: JSON.stringify(data),
    });
    return parseWithFallback(raw, GoalIssueSchema, EMPTY_GOAL_ISSUE, {
      endpoint: "POST /api/workbench/goals/:goalId/issues",
    });
  }

  async detachGoalIssue(goalId: string, issueId: string): Promise<void> {
    await this.fetch(`/api/workbench/goals/${goalId}/issues/${issueId}`, { method: "DELETE" });
  }

  async listMarketSignals(filters: MarketSignalListFilters = {}): Promise<MarketSignalListResponse> {
    const raw = await this.fetch<unknown>(
      `/api/workbench/signals${workbenchSearch({
        cut: filters.cut,
        status: filters.status,
        category: filters.category,
        limit: filters.limit,
      })}`,
    );
    return parseWithFallback(raw, MarketSignalListResponseSchema, EMPTY_MARKET_SIGNAL_LIST_RESPONSE, {
      endpoint: "GET /api/workbench/signals",
    });
  }

  async createMarketSignal(data: CreateMarketSignalRequest): Promise<MarketSignal> {
    const raw = await this.fetch<unknown>("/api/workbench/signals", {
      method: "POST",
      body: JSON.stringify(data),
    });
    return parseWithFallback(raw, MarketSignalSchema, EMPTY_MARKET_SIGNAL, {
      endpoint: "POST /api/workbench/signals",
    });
  }

  /** `status: "converted"` is not accepted here — use `convertMarketSignal`. */
  async updateMarketSignal(id: string, data: UpdateMarketSignalRequest): Promise<MarketSignal> {
    const raw = await this.fetch<unknown>(`/api/workbench/signals/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
    return parseWithFallback(raw, MarketSignalSchema, EMPTY_MARKET_SIGNAL, {
      endpoint: "PATCH /api/workbench/signals/:signalId",
    });
  }

  async deleteMarketSignal(id: string): Promise<void> {
    await this.fetch(`/api/workbench/signals/${id}`, { method: "DELETE" });
  }

  /**
   * Turns a signal into work: a goal or an issue, with the landing pointer written
   * back onto the signal. A second convert of the same signal is a 409 — the
   * server answers that, so the client can surface it instead of creating a
   * duplicate objective.
   */
  async convertMarketSignal(
    id: string,
    data: ConvertMarketSignalRequest,
  ): Promise<MarketSignalConvertResponse> {
    const raw = await this.fetch<unknown>(`/api/workbench/signals/${id}/convert`, {
      method: "POST",
      body: JSON.stringify(data),
    });
    return parseWithFallback(
      raw,
      MarketSignalConvertResponseSchema,
      EMPTY_MARKET_SIGNAL_CONVERT_RESPONSE,
      { endpoint: "POST /api/workbench/signals/:signalId/convert" },
    );
  }

  // HR (docs/engineering/WORKBENCH-API.md §10.3). Same base and same write scope
  // as the ledgers above: reads are member-wide, writes are gated server-side.
  // `scorecards` has no single-row GET — a scorecard is read through its
  // interview — so there is no `getHrScorecard`, only the collection, the
  // create, and the two row writes.

  async listHrJobs(filters: HrJobListFilters = {}): Promise<HrJobListResponse> {
    const raw = await this.fetch<unknown>(
      `/api/workbench/hr/jobs${workbenchSearch({
        status: filters.status,
        department_id: filters.department_id,
      })}`,
    );
    return parseWithFallback(raw, HrJobListResponseSchema, EMPTY_HR_JOB_LIST_RESPONSE, {
      endpoint: "GET /api/workbench/hr/jobs",
    });
  }

  async createHrJob(data: CreateHrJobRequest): Promise<HrJob> {
    const raw = await this.fetch<unknown>("/api/workbench/hr/jobs", {
      method: "POST",
      body: JSON.stringify(data),
    });
    return parseWithFallback(raw, HrJobSchema, EMPTY_HR_JOB, {
      endpoint: "POST /api/workbench/hr/jobs",
    });
  }

  async getHrJob(id: string): Promise<HrJob> {
    const raw = await this.fetch<unknown>(`/api/workbench/hr/jobs/${id}`);
    return parseWithFallback(raw, HrJobSchema, EMPTY_HR_JOB, {
      endpoint: "GET /api/workbench/hr/jobs/:jobId",
    });
  }

  async updateHrJob(id: string, data: UpdateHrJobRequest): Promise<HrJob> {
    const raw = await this.fetch<unknown>(`/api/workbench/hr/jobs/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
    return parseWithFallback(raw, HrJobSchema, EMPTY_HR_JOB, {
      endpoint: "PATCH /api/workbench/hr/jobs/:jobId",
    });
  }

  async deleteHrJob(id: string): Promise<void> {
    await this.fetch(`/api/workbench/hr/jobs/${id}`, { method: "DELETE" });
  }

  async listHrCandidates(filters: HrCandidateListFilters = {}): Promise<HrCandidateListResponse> {
    const raw = await this.fetch<unknown>(
      `/api/workbench/hr/candidates${workbenchSearch({
        job_id: filters.job_id,
        stage: filters.stage,
      })}`,
    );
    return parseWithFallback(raw, HrCandidateListResponseSchema, EMPTY_HR_CANDIDATE_LIST_RESPONSE, {
      endpoint: "GET /api/workbench/hr/candidates",
    });
  }

  async createHrCandidate(data: CreateHrCandidateRequest): Promise<HrCandidate> {
    const raw = await this.fetch<unknown>("/api/workbench/hr/candidates", {
      method: "POST",
      body: JSON.stringify(data),
    });
    return parseWithFallback(raw, HrCandidateSchema, EMPTY_HR_CANDIDATE, {
      endpoint: "POST /api/workbench/hr/candidates",
    });
  }

  async getHrCandidate(id: string): Promise<HrCandidate> {
    const raw = await this.fetch<unknown>(`/api/workbench/hr/candidates/${id}`);
    return parseWithFallback(raw, HrCandidateSchema, EMPTY_HR_CANDIDATE, {
      endpoint: "GET /api/workbench/hr/candidates/:candidateId",
    });
  }

  async updateHrCandidate(id: string, data: UpdateHrCandidateRequest): Promise<HrCandidate> {
    const raw = await this.fetch<unknown>(`/api/workbench/hr/candidates/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
    return parseWithFallback(raw, HrCandidateSchema, EMPTY_HR_CANDIDATE, {
      endpoint: "PATCH /api/workbench/hr/candidates/:candidateId",
    });
  }

  async deleteHrCandidate(id: string): Promise<void> {
    await this.fetch(`/api/workbench/hr/candidates/${id}`, { method: "DELETE" });
  }

  /**
   * The hire transition: `stage = hired`, `hired_at` stamped, and the employee
   * profile created or updated in the same transaction (§10.3). The response is
   * the candidate row the route names; the profile it wrote is re-read through
   * `GET /hr/employees` (see `HireHrCandidateRequest`).
   */
  async hireHrCandidate(candidateId: string, data: HireHrCandidateRequest): Promise<HireHrCandidateResponse> {
    const raw = await this.fetch<unknown>(`/api/workbench/hr/candidates/${candidateId}/hire`, {
      method: "POST",
      body: JSON.stringify(data),
    });
    const parsed = await parseWithFallback(
      raw,
      HireHrCandidateResponseSchema,
      EMPTY_HIRE_HR_CANDIDATE_RESPONSE,
      { endpoint: "POST /api/workbench/hr/candidates/:candidateId/hire" },
    );
    return {
      candidate: parsed.candidate ?? EMPTY_HR_CANDIDATE,
      employee_profile: parsed.employee_profile ?? EMPTY_HR_EMPLOYEE_PROFILE,
    };
  }

  async listHrInterviews(filters: HrInterviewListFilters = {}): Promise<HrInterviewListResponse> {
    const raw = await this.fetch<unknown>(
      `/api/workbench/hr/interviews${workbenchSearch({
        candidate_id: filters.candidate_id,
        status: filters.status,
      })}`,
    );
    return parseWithFallback(raw, HrInterviewListResponseSchema, EMPTY_HR_INTERVIEW_LIST_RESPONSE, {
      endpoint: "GET /api/workbench/hr/interviews",
    });
  }

  async createHrInterview(data: CreateHrInterviewRequest): Promise<HrInterview> {
    const raw = await this.fetch<unknown>("/api/workbench/hr/interviews", {
      method: "POST",
      body: JSON.stringify(data),
    });
    return parseWithFallback(raw, HrInterviewSchema, EMPTY_HR_INTERVIEW, {
      endpoint: "POST /api/workbench/hr/interviews",
    });
  }

  async getHrInterview(id: string): Promise<HrInterview> {
    const raw = await this.fetch<unknown>(`/api/workbench/hr/interviews/${id}`);
    return parseWithFallback(raw, HrInterviewSchema, EMPTY_HR_INTERVIEW, {
      endpoint: "GET /api/workbench/hr/interviews/:interviewId",
    });
  }

  async updateHrInterview(id: string, data: UpdateHrInterviewRequest): Promise<HrInterview> {
    const raw = await this.fetch<unknown>(`/api/workbench/hr/interviews/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
    return parseWithFallback(raw, HrInterviewSchema, EMPTY_HR_INTERVIEW, {
      endpoint: "PATCH /api/workbench/hr/interviews/:interviewId",
    });
  }

  async deleteHrInterview(id: string): Promise<void> {
    await this.fetch(`/api/workbench/hr/interviews/${id}`, { method: "DELETE" });
  }

  async listHrScorecards(filters: HrScorecardListFilters = {}): Promise<HrScorecardListResponse> {
    const raw = await this.fetch<unknown>(
      `/api/workbench/hr/scorecards${workbenchSearch({ interview_id: filters.interview_id })}`,
    );
    return parseWithFallback(raw, HrScorecardListResponseSchema, EMPTY_HR_SCORECARD_LIST_RESPONSE, {
      endpoint: "GET /api/workbench/hr/scorecards",
    });
  }

  async createHrScorecard(data: CreateHrScorecardRequest): Promise<HrScorecard> {
    const raw = await this.fetch<unknown>("/api/workbench/hr/scorecards", {
      method: "POST",
      body: JSON.stringify(data),
    });
    return parseWithFallback(raw, HrScorecardSchema, EMPTY_HR_SCORECARD, {
      endpoint: "POST /api/workbench/hr/scorecards",
    });
  }

  async updateHrScorecard(id: string, data: UpdateHrScorecardRequest): Promise<HrScorecard> {
    const raw = await this.fetch<unknown>(`/api/workbench/hr/scorecards/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
    return parseWithFallback(raw, HrScorecardSchema, EMPTY_HR_SCORECARD, {
      endpoint: "PATCH /api/workbench/hr/scorecards/:scorecardId",
    });
  }

  async deleteHrScorecard(id: string): Promise<void> {
    await this.fetch(`/api/workbench/hr/scorecards/${id}`, { method: "DELETE" });
  }

  async listHrEmployees(
    filters: HrEmployeeProfileListFilters = {},
  ): Promise<HrEmployeeProfileListResponse> {
    const raw = await this.fetch<unknown>(
      `/api/workbench/hr/employees${workbenchSearch({ department_id: filters.department_id })}`,
    );
    return parseWithFallback(
      raw,
      HrEmployeeProfileListResponseSchema,
      EMPTY_HR_EMPLOYEE_PROFILE_LIST_RESPONSE,
      { endpoint: "GET /api/workbench/hr/employees" },
    );
  }

  async createHrEmployee(data: CreateHrEmployeeProfileRequest): Promise<HrEmployeeProfile> {
    const raw = await this.fetch<unknown>("/api/workbench/hr/employees", {
      method: "POST",
      body: JSON.stringify(data),
    });
    return parseWithFallback(raw, HrEmployeeProfileSchema, EMPTY_HR_EMPLOYEE_PROFILE, {
      endpoint: "POST /api/workbench/hr/employees",
    });
  }

  async getHrEmployee(id: string): Promise<HrEmployeeProfile> {
    const raw = await this.fetch<unknown>(`/api/workbench/hr/employees/${id}`);
    return parseWithFallback(raw, HrEmployeeProfileSchema, EMPTY_HR_EMPLOYEE_PROFILE, {
      endpoint: "GET /api/workbench/hr/employees/:employeeId",
    });
  }

  async updateHrEmployee(
    id: string,
    data: UpdateHrEmployeeProfileRequest,
  ): Promise<HrEmployeeProfile> {
    const raw = await this.fetch<unknown>(`/api/workbench/hr/employees/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
    return parseWithFallback(raw, HrEmployeeProfileSchema, EMPTY_HR_EMPLOYEE_PROFILE, {
      endpoint: "PATCH /api/workbench/hr/employees/:employeeId",
    });
  }

  async deleteHrEmployee(id: string): Promise<void> {
    await this.fetch(`/api/workbench/hr/employees/${id}`, { method: "DELETE" });
  }

  // Interview questions and per-round guides (docs/engineering/WORKBENCH-API.md
  // §14). Same base and same write scope as the HR ledger above: reads are
  // member-wide, writes are gated server-side on the question's own owner and on the
  // candidate a guide belongs to.
  //
  // `generate` writes nothing — it answers an unsaved draft that the caller reviews
  // and then saves through `createHrInterviewGuide`. The item routes answer the whole
  // updated outline rather than 204, because appending shifts no index but deleting
  // one renumbers the rest.

  async listHrQuestions(filters: HrQuestionListFilters = {}): Promise<HrQuestionListResponse> {
    const raw = await this.fetch<unknown>(
      `/api/workbench/hr/questions${workbenchSearch({
        job_id: filters.job_id,
        dimension: filters.dimension,
        q: filters.q,
      })}`,
    );
    return parseWithFallback(raw, HrQuestionListResponseSchema, EMPTY_HR_QUESTION_LIST_RESPONSE, {
      endpoint: "GET /api/workbench/hr/questions",
    });
  }

  async createHrQuestion(data: CreateHrQuestionRequest): Promise<HrQuestion> {
    const raw = await this.fetch<unknown>("/api/workbench/hr/questions", {
      method: "POST",
      body: JSON.stringify(data),
    });
    return parseWithFallback(raw, HrQuestionSchema, EMPTY_HR_QUESTION, {
      endpoint: "POST /api/workbench/hr/questions",
    });
  }

  async getHrQuestion(id: string): Promise<HrQuestion> {
    const raw = await this.fetch<unknown>(`/api/workbench/hr/questions/${id}`);
    return parseWithFallback(raw, HrQuestionSchema, EMPTY_HR_QUESTION, {
      endpoint: "GET /api/workbench/hr/questions/:questionId",
    });
  }

  async updateHrQuestion(id: string, data: UpdateHrQuestionRequest): Promise<HrQuestion> {
    const raw = await this.fetch<unknown>(`/api/workbench/hr/questions/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
    return parseWithFallback(raw, HrQuestionSchema, EMPTY_HR_QUESTION, {
      endpoint: "PATCH /api/workbench/hr/questions/:questionId",
    });
  }

  async deleteHrQuestion(id: string): Promise<void> {
    await this.fetch(`/api/workbench/hr/questions/${id}`, { method: "DELETE" });
  }

  async listHrInterviewGuides(filters: HrGuideListFilters = {}): Promise<HrGuideListResponse> {
    const raw = await this.fetch<unknown>(
      `/api/workbench/hr/guides${workbenchSearch({
        candidate_id: filters.candidate_id,
        interview_id: filters.interview_id,
        status: filters.status,
      })}`,
    );
    return parseWithFallback(raw, HrGuideListResponseSchema, EMPTY_HR_GUIDE_LIST_RESPONSE, {
      endpoint: "GET /api/workbench/hr/guides",
    });
  }

  async createHrInterviewGuide(data: CreateHrInterviewGuideRequest): Promise<HrInterviewGuide> {
    const raw = await this.fetch<unknown>("/api/workbench/hr/guides", {
      method: "POST",
      body: JSON.stringify(data),
    });
    return parseWithFallback(raw, HrInterviewGuideSchema, EMPTY_HR_INTERVIEW_GUIDE, {
      endpoint: "POST /api/workbench/hr/guides",
    });
  }

  async getHrInterviewGuide(id: string): Promise<HrInterviewGuide> {
    const raw = await this.fetch<unknown>(`/api/workbench/hr/guides/${id}`);
    return parseWithFallback(raw, HrInterviewGuideSchema, EMPTY_HR_INTERVIEW_GUIDE, {
      endpoint: "GET /api/workbench/hr/guides/:guideId",
    });
  }

  async updateHrInterviewGuide(
    id: string,
    data: UpdateHrInterviewGuideRequest,
  ): Promise<HrInterviewGuide> {
    const raw = await this.fetch<unknown>(`/api/workbench/hr/guides/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
    return parseWithFallback(raw, HrInterviewGuideSchema, EMPTY_HR_INTERVIEW_GUIDE, {
      endpoint: "PATCH /api/workbench/hr/guides/:guideId",
    });
  }

  async deleteHrInterviewGuide(id: string): Promise<void> {
    await this.fetch(`/api/workbench/hr/guides/${id}`, { method: "DELETE" });
  }

  /** Append one snapshot entry (usually a picked bank question) to an outline. */
  async appendHrGuideItem(guideId: string, item: HrGuideItem): Promise<HrInterviewGuide> {
    const raw = await this.fetch<unknown>(`/api/workbench/hr/guides/${guideId}/items`, {
      method: "POST",
      body: JSON.stringify(item),
    });
    return parseWithFallback(raw, HrInterviewGuideSchema, EMPTY_HR_INTERVIEW_GUIDE, {
      endpoint: "POST /api/workbench/hr/guides/:guideId/items",
    });
  }

  /** Tick a question, note the answer, or score it — by position in the snapshot. */
  async updateHrGuideItem(
    guideId: string,
    index: number,
    data: UpdateHrGuideItemRequest,
  ): Promise<HrInterviewGuide> {
    const raw = await this.fetch<unknown>(`/api/workbench/hr/guides/${guideId}/items/${index}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
    return parseWithFallback(raw, HrInterviewGuideSchema, EMPTY_HR_INTERVIEW_GUIDE, {
      endpoint: "PATCH /api/workbench/hr/guides/:guideId/items/:index",
    });
  }

  /** Remove one snapshot entry. The response is the renumbered outline. */
  async deleteHrGuideItem(guideId: string, index: number): Promise<HrInterviewGuide> {
    const raw = await this.fetch<unknown>(`/api/workbench/hr/guides/${guideId}/items/${index}`, {
      method: "DELETE",
    });
    return parseWithFallback(raw, HrInterviewGuideSchema, EMPTY_HR_INTERVIEW_GUIDE, {
      endpoint: "DELETE /api/workbench/hr/guides/:guideId/items/:index",
    });
  }

  /**
   * Draft an outline without saving it. `source` in the response says which
   * generator ran: `template` when the deployment has no model configured, `ai` when
   * one drafted the questions. Either way the caller gets 6–8 items and decides
   * whether to save them.
   */
  async generateHrInterviewGuide(data: HrGuideGenerateRequest): Promise<HrGuideGenerateResponse> {
    const raw = await this.fetch<unknown>("/api/workbench/hr/guides/generate", {
      method: "POST",
      body: JSON.stringify(data),
    });
    return parseWithFallback(raw, HrGuideGenerateResponseSchema, EMPTY_HR_GUIDE_GENERATE_RESPONSE, {
      endpoint: "POST /api/workbench/hr/guides/generate",
    });
  }

  // Offboarding management (docs/engineering/WORKBENCH-API.md §15). Reads are
  // member-wide; writes are gated server-side on the record's owner, and the two
  // routes that move the state machine (`advance` / `cancel`) additionally require
  // owner/admin.
  //
  // `advance` carries no body and answers `{ offboarding, employee }` — `employee`
  // is null until the record reaches `done`, which is when the leave date is
  // written onto the employee file. The three `handover` routes answer the whole
  // record rather than 204: deleting an entry renumbers the rest.

  async listHrOffboardings(
    filters: HrOffboardingListFilters = {},
  ): Promise<HrOffboardingListResponse> {
    const raw = await this.fetch<unknown>(
      `/api/workbench/hr/offboardings${workbenchSearch({
        status: filters.status,
        employee_id: filters.employee_id,
      })}`,
    );
    return parseWithFallback(raw, HrOffboardingListResponseSchema, EMPTY_HR_OFFBOARDING_LIST_RESPONSE, {
      endpoint: "GET /api/workbench/hr/offboardings",
    });
  }

  async createHrOffboarding(data: CreateHrOffboardingRequest): Promise<HrOffboarding> {
    const raw = await this.fetch<unknown>("/api/workbench/hr/offboardings", {
      method: "POST",
      body: JSON.stringify(data),
    });
    return parseWithFallback(raw, HrOffboardingSchema, EMPTY_HR_OFFBOARDING, {
      endpoint: "POST /api/workbench/hr/offboardings",
    });
  }

  async getHrOffboarding(id: string): Promise<HrOffboarding> {
    const raw = await this.fetch<unknown>(`/api/workbench/hr/offboardings/${id}`);
    return parseWithFallback(raw, HrOffboardingSchema, EMPTY_HR_OFFBOARDING, {
      endpoint: "GET /api/workbench/hr/offboardings/:offboardingId",
    });
  }

  async updateHrOffboarding(
    id: string,
    data: UpdateHrOffboardingRequest,
  ): Promise<HrOffboarding> {
    const raw = await this.fetch<unknown>(`/api/workbench/hr/offboardings/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
    return parseWithFallback(raw, HrOffboardingSchema, EMPTY_HR_OFFBOARDING, {
      endpoint: "PATCH /api/workbench/hr/offboardings/:offboardingId",
    });
  }

  async deleteHrOffboarding(id: string): Promise<void> {
    await this.fetch(`/api/workbench/hr/offboardings/${id}`, { method: "DELETE" });
  }

  /** apply → handover → done. 409 when the record is already past the step. */
  async advanceHrOffboarding(id: string): Promise<HrOffboardingAdvanceResponse> {
    const raw = await this.fetch<unknown>(`/api/workbench/hr/offboardings/${id}/advance`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    return parseWithFallback(
      raw,
      HrOffboardingAdvanceResponseSchema,
      EMPTY_HR_OFFBOARDING_ADVANCE_RESPONSE,
      { endpoint: "POST /api/workbench/hr/offboardings/:offboardingId/advance" },
    );
  }

  /** The way out: `cancelled` is terminal, and it frees the employee's slot. */
  async cancelHrOffboarding(id: string): Promise<HrOffboarding> {
    const raw = await this.fetch<unknown>(`/api/workbench/hr/offboardings/${id}/cancel`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    return parseWithFallback(raw, HrOffboardingSchema, EMPTY_HR_OFFBOARDING, {
      endpoint: "POST /api/workbench/hr/offboardings/:offboardingId/cancel",
    });
  }

  /** Append one checklist entry; the server assigns `key` when it is absent. */
  async appendHrOffboardingHandoverItem(
    id: string,
    item: Partial<HrHandoverItem> & { label: string },
  ): Promise<HrOffboarding> {
    const raw = await this.fetch<unknown>(`/api/workbench/hr/offboardings/${id}/handover`, {
      method: "POST",
      body: JSON.stringify(item),
    });
    return parseWithFallback(raw, HrOffboardingSchema, EMPTY_HR_OFFBOARDING, {
      endpoint: "POST /api/workbench/hr/offboardings/:offboardingId/handover",
    });
  }

  /** Tick an entry by position in the checklist, or note what is left to say. */
  async updateHrOffboardingHandoverItem(
    id: string,
    index: number,
    data: UpdateHrHandoverItemRequest,
  ): Promise<HrOffboarding> {
    const raw = await this.fetch<unknown>(
      `/api/workbench/hr/offboardings/${id}/handover/${index}`,
      { method: "PATCH", body: JSON.stringify(data) },
    );
    return parseWithFallback(raw, HrOffboardingSchema, EMPTY_HR_OFFBOARDING, {
      endpoint: "PATCH /api/workbench/hr/offboardings/:offboardingId/handover/:index",
    });
  }

  /** Remove one entry. The response is the renumbered checklist. */
  async deleteHrOffboardingHandoverItem(id: string, index: number): Promise<HrOffboarding> {
    const raw = await this.fetch<unknown>(
      `/api/workbench/hr/offboardings/${id}/handover/${index}`,
      { method: "DELETE" },
    );
    return parseWithFallback(raw, HrOffboardingSchema, EMPTY_HR_OFFBOARDING, {
      endpoint: "DELETE /api/workbench/hr/offboardings/:offboardingId/handover/:index",
    });
  }

  // Employee file change stream (docs/engineering/WORKBENCH-API.md §16). Reads are
  // member-wide; writes are gated on the employee profile's owner. Most rows are
  // written by the `PATCH /employees` hook server-side, so the client only creates
  // the manual entry (a salary adjustment has no profile column) and edits a note.
  //
  // `PATCH` accepts `note` and nothing else: the server answers 400 for any other
  // field, because a stream whose facts can be rewritten cannot answer "what
  // changed". `DELETE` is a soft delete.

  async listHrEmployeeChanges(
    filters: HrEmployeeChangeListFilters = {},
  ): Promise<HrEmployeeChangeListResponse> {
    const raw = await this.fetch<unknown>(
      `/api/workbench/hr/changes${workbenchSearch({
        employee_id: filters.employee_id,
        kind: filters.kind,
        from: filters.from,
        to: filters.to,
        limit: filters.limit,
      })}`,
    );
    return parseWithFallback(
      raw,
      HrEmployeeChangeListResponseSchema,
      EMPTY_HR_EMPLOYEE_CHANGE_LIST_RESPONSE,
      { endpoint: "GET /api/workbench/hr/changes" },
    );
  }

  async createHrEmployeeChange(data: CreateHrEmployeeChangeRequest): Promise<HrEmployeeChange> {
    const raw = await this.fetch<unknown>("/api/workbench/hr/changes", {
      method: "POST",
      body: JSON.stringify(data),
    });
    return parseWithFallback(raw, HrEmployeeChangeSchema, EMPTY_HR_EMPLOYEE_CHANGE, {
      endpoint: "POST /api/workbench/hr/changes",
    });
  }

  /** The one editable field. Sending anything else is a 400. */
  async updateHrEmployeeChange(
    id: string,
    data: UpdateHrEmployeeChangeRequest,
  ): Promise<HrEmployeeChange> {
    const raw = await this.fetch<unknown>(`/api/workbench/hr/changes/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
    return parseWithFallback(raw, HrEmployeeChangeSchema, EMPTY_HR_EMPLOYEE_CHANGE, {
      endpoint: "PATCH /api/workbench/hr/changes/:changeId",
    });
  }

  async deleteHrEmployeeChange(id: string): Promise<void> {
    await this.fetch(`/api/workbench/hr/changes/${id}`, { method: "DELETE" });
  }

  // Employee rewards and disciplines (docs/engineering/WORKBENCH-API.md §17). Reads
  // are member-wide; writes are gated on the employee profile's owner — recording
  // somebody's 奖励 or 处分 is part of editing their file.
  //
  // `amount` is always >= 0 and `kind` says which direction, so a fine is a
  // `discipline` of 500 rather than a bonus of -500. `PATCH` edits the six
  // descriptive columns and the server answers 400 for `employee_id` / `kind`.

  async listHrEmployeeRewards(
    filters: HrEmployeeRewardListFilters = {},
  ): Promise<HrEmployeeRewardListResponse> {
    const raw = await this.fetch<unknown>(
      `/api/workbench/hr/rewards${workbenchSearch({
        employee_id: filters.employee_id,
        kind: filters.kind,
        from: filters.from,
        to: filters.to,
        limit: filters.limit,
      })}`,
    );
    return parseWithFallback(
      raw,
      HrEmployeeRewardListResponseSchema,
      EMPTY_HR_EMPLOYEE_REWARD_LIST_RESPONSE,
      { endpoint: "GET /api/workbench/hr/rewards" },
    );
  }

  async createHrEmployeeReward(data: CreateHrEmployeeRewardRequest): Promise<HrEmployeeReward> {
    const raw = await this.fetch<unknown>("/api/workbench/hr/rewards", {
      method: "POST",
      body: JSON.stringify(data),
    });
    return parseWithFallback(raw, HrEmployeeRewardSchema, EMPTY_HR_EMPLOYEE_REWARD, {
      endpoint: "POST /api/workbench/hr/rewards",
    });
  }

  /** The six descriptive columns. `employee_id` / `kind` are a 400. */
  async updateHrEmployeeReward(
    id: string,
    data: UpdateHrEmployeeRewardRequest,
  ): Promise<HrEmployeeReward> {
    const raw = await this.fetch<unknown>(`/api/workbench/hr/rewards/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
    return parseWithFallback(raw, HrEmployeeRewardSchema, EMPTY_HR_EMPLOYEE_REWARD, {
      endpoint: "PATCH /api/workbench/hr/rewards/:rewardId",
    });
  }

  async deleteHrEmployeeReward(id: string): Promise<void> {
    await this.fetch(`/api/workbench/hr/rewards/${id}`, { method: "DELETE" });
  }

  // HR documents (docs/engineering/WORKBENCH-API.md §18). Reads are member-wide;
  // template writes and generation are owner/admin only, because the produced file
  // is filed in the person's record. `POST .../documents` renders the template,
  // stores the result as an ordinary attachment and returns the ledger row plus the
  // renderer's warnings — a warning means the file still contains a literal
  // `{{...}}`, so it should be looked at before it is printed and stamped.

  async listHrDocTemplates(
    filters: HrDocTemplateListFilters = {},
  ): Promise<HrDocTemplateListResponse> {
    const raw = await this.fetch<unknown>(
      `/api/workbench/hr/doc-templates${workbenchSearch({ kind: filters.kind })}`,
    );
    return parseWithFallback(
      raw,
      HrDocTemplateListResponseSchema,
      EMPTY_HR_DOC_TEMPLATE_LIST_RESPONSE,
      { endpoint: "GET /api/workbench/hr/doc-templates" },
    );
  }

  async createHrDocTemplate(data: CreateHrDocTemplateRequest): Promise<HrDocTemplate> {
    const raw = await this.fetch<unknown>("/api/workbench/hr/doc-templates", {
      method: "POST",
      body: JSON.stringify(data),
    });
    return parseWithFallback(raw, HrDocTemplateSchema, EMPTY_HR_DOC_TEMPLATE, {
      endpoint: "POST /api/workbench/hr/doc-templates",
    });
  }

  /** `PATCH` is a 400 on a builtin template: the server re-seeds those on every read. */
  async updateHrDocTemplate(
    id: string,
    data: UpdateHrDocTemplateRequest,
  ): Promise<HrDocTemplate> {
    const raw = await this.fetch<unknown>(`/api/workbench/hr/doc-templates/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
    return parseWithFallback(raw, HrDocTemplateSchema, EMPTY_HR_DOC_TEMPLATE, {
      endpoint: "PATCH /api/workbench/hr/doc-templates/:templateId",
    });
  }

  async deleteHrDocTemplate(id: string): Promise<void> {
    await this.fetch(`/api/workbench/hr/doc-templates/${id}`, { method: "DELETE" });
  }

  async listHrEmployeeDocuments(employeeId: string): Promise<HrDocGenerationListResponse> {
    const raw = await this.fetch<unknown>(
      `/api/workbench/hr/employees/${employeeId}/documents`,
    );
    return parseWithFallback(
      raw,
      HrDocGenerationListResponseSchema,
      EMPTY_HR_DOC_GENERATION_LIST_RESPONSE,
      { endpoint: "GET /api/workbench/hr/employees/{id}/documents" },
    );
  }

  /** `values` is optional: omitted, every slot is filled from the employee's file. */
  async createHrEmployeeDocument(
    employeeId: string,
    data: CreateHrDocGenerationRequest,
  ): Promise<CreateHrDocGenerationResponse> {
    const raw = await this.fetch<unknown>(
      `/api/workbench/hr/employees/${employeeId}/documents`,
      { method: "POST", body: JSON.stringify(data) },
    );
    return parseWithFallback(
      raw,
      HrDocGenerationEnvelopeSchema,
      EMPTY_HR_DOC_GENERATION_ENVELOPE,
      { endpoint: "POST /api/workbench/hr/employees/{id}/documents" },
    );
  }

  async createShareLink(workspaceId: string, data: { role?: string; expires_in?: number; max_uses?: number }): Promise<ShareLink> {
    const raw = await this.fetch<unknown>(`/api/workspaces/${workspaceId}/share-links`, {
      method: "POST",
      body: JSON.stringify(data),
    });
    return parseWithFallback(raw, ShareLinkSchema, EMPTY_SHARE_LINK, {
      endpoint: "POST /api/workspaces/{id}/share-links",
    });
  }

  async listShareLinks(workspaceId: string): Promise<ShareLink[]> {
    const raw = await this.fetch<unknown>(`/api/workspaces/${workspaceId}/share-links`);
    return parseWithFallback(raw, ShareLinkListResponseSchema, [], {
      endpoint: "GET /api/workspaces/{id}/share-links",
    });
  }

  async revokeShareLink(workspaceId: string, linkId: string): Promise<void> {
    await this.fetch(`/api/workspaces/${workspaceId}/share-links/${linkId}`, {
      method: "DELETE",
    });
  }

  async joinByShareLink(code: string): Promise<{ member: MemberWithUser; workspace_id: string; workspace_slug: string }> {
    const raw = await this.fetch<unknown>("/api/share-links/join", {
      method: "POST",
      body: JSON.stringify({ code }),
    });
    return parseWithFallback(raw, JoinShareLinkResponseSchema, EMPTY_JOIN_SHARE_LINK_RESPONSE, {
      endpoint: "POST /api/share-links/join",
    });
  }

  async getShareLinkInfo(code: string): Promise<ShareLinkInfo> {
    const raw = await this.fetch<unknown>(`/api/share-links/${encodeURIComponent(code)}`);
    return parseWithFallback(raw, ShareLinkInfoSchema, EMPTY_SHARE_LINK_INFO, {
      endpoint: "GET /api/share-links/{code}",
    });
  }

  async deleteWorkspace(workspaceId: string): Promise<void> {
    await this.fetch(`/api/workspaces/${workspaceId}`, {
      method: "DELETE",
    });
  }

  // Skills
  async listSkills(options?: {
    requireValidResponse?: boolean;
    workspaceSlug?: string;
  }): Promise<SkillSummary[]> {
    const raw = await this.fetch<unknown>("/api/skills", {
      headers: options?.workspaceSlug ? { "X-Workspace-Slug": options.workspaceSlug } : undefined,
    });
    // Rendering can degrade to an empty list; absence checks must fail closed.
    const skills = parseWithFallback<SkillSummary[] | null>(
      raw,
      options?.requireValidResponse ? SkillSummaryListSchema.removeDefault() : SkillSummaryListSchema,
      options?.requireValidResponse ? null : EMPTY_SKILL_SUMMARY_LIST,
      { endpoint: "GET /api/skills" },
    );
    if (skills === null) throw new Error("Invalid skill list response");
    return skills;
  }

  async getSkill(id: string): Promise<Skill> {
    return this.fetch(`/api/skills/${id}`);
  }

  async createSkill(data: CreateSkillRequest): Promise<Skill> {
    return this.fetch("/api/skills", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateSkill(id: string, data: UpdateSkillRequest): Promise<Skill> {
    return this.fetch(`/api/skills/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async deleteSkill(id: string): Promise<void> {
    await this.fetch(`/api/skills/${id}`, { method: "DELETE" });
  }

  async importSkill(data: { url: string }): Promise<Skill> {
    return this.fetch("/api/skills/import", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  /**
   * Imports a skill from a local .skill / .zip archive. Not routed through
   * `this.fetch`: the browser has to set the multipart boundary itself.
   *
   * The archive path always returns a structured `{ status, skill, reason }`
   * body. Created/updated responses yield the skill; anything else throws
   * with the server's reason (or `error`) so the dialog can show it.
   */
  async importSkillArchive(
    file: File,
    onConflict?: "fail" | "overwrite" | "rename" | "skip",
    options?: { workspaceSlug: string },
  ): Promise<Skill> {
    const formData = new FormData();
    formData.append("file", file, file.name || "skill.zip");
    if (onConflict) formData.append("on_conflict", onConflict);

    let res: Response;
    try {
      res = await this.fetchRaw("/api/skills/import", {
        method: "POST",
        body: formData,
        // Pin retries to the workspace that owns this import queue.
        headers: options ? { "X-Workspace-Slug": options.workspaceSlug } : undefined,
      });
    } catch (err) {
      throw remapSkillImportError(err);
    }

    const raw = (await res.json()) as unknown;
    return skillFromImportResult(raw, "POST /api/skills/import");
  }

  // Re-downloads the skill from its stored config.origin source, replacing
  // name/description/content/files in place while preserving the skill id and
  // its agent bindings.
  async refreshSkill(id: string): Promise<Skill> {
    const raw = await this.fetch<unknown>(`/api/skills/${id}/refresh`, {
      method: "POST",
    });
    return parseWithFallback(raw, SkillSchema, EMPTY_SKILL, {
      endpoint: "POST /api/skills/:id/refresh",
    });
  }

  // Content history, newest first. Metadata only; fetch one version for its
  // snapshot.
  async listSkillVersions(skillId: string): Promise<SkillVersionSummary[]> {
    const raw = await this.fetch<unknown>(`/api/skills/${skillId}/versions`);
    return parseWithFallback(
      raw,
      SkillVersionSummaryListSchema,
      EMPTY_SKILL_VERSION_SUMMARY_LIST,
      { endpoint: "GET /api/skills/:id/versions" },
    );
  }

  async getSkillVersion(skillId: string, version: number): Promise<SkillVersion> {
    const raw = await this.fetch<unknown>(
      `/api/skills/${skillId}/versions/${version}`,
    );
    return parseWithFallback(raw, SkillVersionSchema, EMPTY_SKILL_VERSION, {
      endpoint: "GET /api/skills/:id/versions/:version",
    });
  }

  // Writes the version's snapshot back to the skill. The server records the
  // result as a new latest version.
  async restoreSkillVersion(skillId: string, version: number): Promise<Skill> {
    const raw = await this.fetch<unknown>(
      `/api/skills/${skillId}/versions/${version}/restore`,
      { method: "POST" },
    );
    return parseWithFallback(raw, SkillSchema, EMPTY_SKILL, {
      endpoint: "POST /api/skills/:id/versions/:version/restore",
    });
  }

  async listAgentSkills(agentId: string): Promise<SkillSummary[]> {
    return this.fetch(`/api/agents/${agentId}/skills`);
  }

  async setAgentSkills(agentId: string, data: SetAgentSkillsRequest): Promise<void> {
    await this.fetch(`/api/agents/${agentId}/skills`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  // Incremental attach: POST /skills/add only inserts the given ids (the
  // server upserts with ON CONFLICT DO NOTHING), so callers don't need to
  // read the agent's current skill set first.
  async addAgentSkills(agentId: string, data: SetAgentSkillsRequest): Promise<void> {
    await this.fetch(`/api/agents/${agentId}/skills/add`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

	async setAgentSkillEnabled(agentId: string, skillId: string, enabled: boolean): Promise<void> {
		await this.fetch(`/api/agents/${agentId}/skills/${skillId}/enabled`, {
			method: "PUT",
			body: JSON.stringify({ enabled }),
		});
	}

	/**
	 * Marks one assigned skill as the agent's role skill ("主技能").
	 *
	 * The server keeps it singular: marking one clears the previous one in the
	 * same transaction. `false` clears it and leaves the agent with no role skill.
	 */
	async setAgentSkillPrimary(agentId: string, skillId: string, isPrimary: boolean): Promise<void> {
		await this.fetch(`/api/agents/${agentId}/skills/${skillId}/primary`, {
			method: "PUT",
			body: JSON.stringify({ is_primary: isPrimary }),
		});
	}

  async setAgentRuntimeSkillEnabled(
    agentId: string,
    data: SetAgentRuntimeSkillEnabledRequest,
  ): Promise<void> {
    await this.fetch(`/api/agents/${agentId}/runtime-skills/enabled`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

	async removeAgentSkill(agentId: string, skillId: string): Promise<void> {
		await this.fetch(`/api/agents/${agentId}/skills/${skillId}`, {
			method: "DELETE",
		});
	}

  // Personal Access Tokens
  async listPersonalAccessTokens(): Promise<PersonalAccessToken[]> {
    return this.fetch("/api/tokens");
  }

  async createPersonalAccessToken(data: CreatePersonalAccessTokenRequest): Promise<CreatePersonalAccessTokenResponse> {
    return this.fetch("/api/tokens", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async revokePersonalAccessToken(id: string): Promise<void> {
    await this.fetch(`/api/tokens/${id}`, { method: "DELETE" });
  }

  // File Upload & Attachments
  async uploadFile(
    file: File,
    opts?: { issueId?: string; commentId?: string; chatSessionId?: string },
    // Optional abort signal so a module-level upload coordinator (MUL-5181)
    // can cancel an in-flight upload on logout. When aborted, `fetch` rejects
    // with an AbortError, which the coordinator distinguishes from a real
    // failure via `signal.aborted` / `err.name === "AbortError"`.
    signal?: AbortSignal,
  ): Promise<Attachment> {
    const formData = new FormData();
    formData.append("file", file);
    if (opts?.issueId) formData.append("issue_id", opts.issueId);
    if (opts?.commentId) formData.append("comment_id", opts.commentId);
    if (opts?.chatSessionId) formData.append("chat_session_id", opts.chatSessionId);

    const rid = createRequestId();
    const start = Date.now();
    this.logger.info("→ POST /api/upload-file", { rid });

    const credentialUsed = this.getToken();
    const res = await fetch(`${this.baseUrl}/api/upload-file`, {
      method: "POST",
      headers: this.authHeaders(),
      body: formData,
      credentials: "include",
      signal,
    });

    if (!res.ok) {
      if (res.status === 401) this.handleUnauthorized(credentialUsed);
      const message = await this.parseErrorMessage(res, `Upload failed: ${res.status}`);
      this.logger.error(`← ${res.status} /api/upload-file`, { rid, duration: `${Date.now() - start}ms`, error: message });
      throw new Error(message);
    }

    this.logger.info(`← ${res.status} /api/upload-file`, { rid, duration: `${Date.now() - start}ms` });
    const raw = (await res.json()) as unknown;
    return parseWithFallback(raw, AttachmentResponseSchema, EMPTY_ATTACHMENT, {
      endpoint: "POST /api/upload-file",
    });
  }

  // Chat Sessions
  async listChatSessions(
    params?: { status?: string },
    workspace?: WorkspaceScope,
  ): Promise<ChatSession[]> {
    const query = params?.status ? `?status=${params.status}` : "";
    const raw: unknown = await this.fetch(`/api/chat/sessions${query}`, {
      headers: workspaceHeader(workspace),
    });
    return parseWithFallback(raw, ChatSessionListSchema, EMPTY_CHAT_SESSION_LIST, {
      endpoint: "GET /api/chat/sessions",
    });
  }

  async getChatSession(id: string): Promise<ChatSession> {
    const raw: unknown = await this.fetch(`/api/chat/sessions/${id}`);
    return parseWithFallback(raw, ChatSessionSchema, EMPTY_CHAT_SESSION, {
      endpoint: "GET /api/chat/sessions/:id",
    });
  }

  async createChatSession(
    data: {
      agent_id: string;
      title?: string;
      project_id?: string | null;
    },
    workspaceSlug?: string,
  ): Promise<ChatSession> {
    return this.fetch("/api/chat/sessions", {
      method: "POST",
      headers: workspaceHeader(workspaceSlug),
      body: JSON.stringify(data),
    });
  }

  async deleteChatSession(id: string): Promise<void> {
    await this.fetch(`/api/chat/sessions/${id}`, { method: "DELETE" });
  }

  // Refresh the quick-action suggestions for a session's latest assistant turn.
  // Fire-and-forget: the server enqueues a background regeneration pass and the
  // refreshed pills arrive over the chat:quick_actions realtime event, so the
  // caller anchors its pending placeholder on the turn it already knows rather
  // than on this response.
  // Refresh the quick actions for the given assistant turn. Sends the message
  // id the caller is refreshing so the server can atomically confirm it is still
  // the session's latest turn (409 otherwise) — that keeps the client's pending
  // marker aligned with the turn chat:quick_actions will resolve, with no
  // response reconciliation needed even under a WS-before-HTTP race (MUL-5149).
  async regenerateChatQuickActions(
    sessionId: string,
    messageId: string,
  ): Promise<void> {
    await this.fetch(`/api/chat/sessions/${sessionId}/quick-actions/regenerate`, {
      method: "POST",
      body: JSON.stringify({ message_id: messageId }),
    });
  }

  async updateChatSession(
    id: string,
    data: { title: string } | { project_id: string | null },
  ): Promise<ChatSession> {
    return this.fetch(`/api/chat/sessions/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  async setChatSessionPinned(id: string, pinned: boolean): Promise<ChatSession> {
    return this.fetch(`/api/chat/sessions/${id}/pin`, {
      method: "PATCH",
      body: JSON.stringify({ pinned }),
    });
  }

  async setChatSessionArchived(id: string, archived: boolean): Promise<ChatSession> {
    return this.fetch(`/api/chat/sessions/${id}/archive`, {
      method: "PATCH",
      body: JSON.stringify({ archived }),
    });
  }

  // Quick-agent bar: per-user pinned agents.
  async listChatPinnedAgents(workspace?: WorkspaceScope): Promise<ChatPinnedAgent[]> {
    return this.fetch("/api/chat/pinned-agents", { headers: workspaceHeader(workspace) });
  }

  async pinChatAgent(agentId: string): Promise<ChatPinnedAgent> {
    return this.fetch("/api/chat/pinned-agents", {
      method: "POST",
      body: JSON.stringify({ agent_id: agentId }),
    });
  }

  async unpinChatAgent(agentId: string): Promise<void> {
    await this.fetch(`/api/chat/pinned-agents/${agentId}`, { method: "DELETE" });
  }

  async listChatMessages(sessionId: string): Promise<ChatMessage[]> {
    const raw: unknown = await this.fetch(`/api/chat/sessions/${sessionId}/messages`);
    return parseWithFallback(raw, ChatMessageListSchema, EMPTY_CHAT_MESSAGE_LIST, {
      endpoint: "GET /api/chat/sessions/:id/messages",
    });
  }

  async listChatMessagesPage(
    sessionId: string,
    params: { before?: { created_at: string; id: string } | null; limit?: number } = {},
  ): Promise<ChatMessagesPage> {
    const limit = params.limit ?? 50;
    const query = new URLSearchParams({ limit: String(limit) });
    if (params.before) {
      query.set("before_created_at", params.before.created_at);
      query.set("before_id", params.before.id);
    }
    try {
      const raw: unknown = await this.fetch(
        `/api/chat/sessions/${sessionId}/messages/page?${query.toString()}`,
      );
      return parseWithFallback(
        raw,
        ChatMessagesPageSchema,
        { messages: [], limit, has_more: false, next_cursor: null },
        {
          endpoint: "GET /api/chat/sessions/:id/messages/page",
        },
      );
    } catch (err) {
      // Deployment-order compatibility: a backend deployed before this endpoint
      // existed returns 404 for the unknown route. Fall back to the legacy
      // full-list endpoint so chat never white-screens regardless of whether
      // the server or the client deploys first. Only the initial (cursorless)
      // page falls back — the legacy endpoint returns every message at once, so
      // the fallback page reports has_more: false and there is no follow-up
      // request to translate. A 404 on a cursor request is an unexpected state
      // and propagates instead of duplicating the whole list.
      if (err instanceof ApiError && err.status === 404 && !params.before) {
        const messages = await this.listChatMessages(sessionId);
        return { messages, limit, has_more: false, next_cursor: null };
      }
      throw err;
    }
  }

  async sendChatMessage(
    sessionId: string,
    content: string,
    attachmentIds?: string[],
  ): Promise<SendChatMessageResponse> {
    const body: {
      content: string;
      attachment_ids?: string[];
    } = { content };
    if (attachmentIds && attachmentIds.length > 0) {
      body.attachment_ids = attachmentIds;
    }
    const raw = await this.fetch<unknown>(`/api/chat/sessions/${sessionId}/messages`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    const response = parseWithFallback<SendChatMessageResponse | null>(
      raw,
      SendChatMessageResponseSchema,
      null,
      { endpoint: "POST /api/chat/sessions/:id/messages" },
    );
    if (!response) throw new Error("invalid send chat message response");
    return response;
  }

  async startMikaOnboarding(
    sessionId: string,
    data: {
      language: "en" | "zh" | "ko" | "ja";
    },
    workspaceSlug?: string,
  ): Promise<StartMikaOnboardingResponse> {
    const raw = await this.fetch<unknown>(`/api/chat/sessions/${sessionId}/onboarding`, {
      method: "POST",
      headers: workspaceHeader(workspaceSlug),
      body: JSON.stringify(data),
    });
    return parseWithFallback(
      raw,
      StartMikaOnboardingResponseSchema,
      { started: false },
      { endpoint: "POST /api/chat/sessions/:id/onboarding" },
    );
  }

  async getPendingChatTask(sessionId: string): Promise<ChatPendingTask> {
    const raw = await this.fetch<unknown>(`/api/chat/sessions/${sessionId}/pending-task`);
    return parseWithFallback(raw, ChatPendingTaskSchema, EMPTY_CHAT_PENDING_TASK, {
      endpoint: "GET /api/chat/sessions/:id/pending-task",
    });
  }

  async prioritizeQueuedChatTask(
    sessionId: string,
    taskId: string,
  ): Promise<PrioritizeQueuedChatTaskResponse> {
    const raw = await this.fetch<unknown>(
      `/api/chat/sessions/${sessionId}/queued-tasks/${taskId}/prioritize`,
      { method: "POST" },
    );
    return parseWithFallback(
      raw,
      PrioritizeQueuedChatTaskResponseSchema,
      EMPTY_PRIORITIZE_QUEUED_CHAT_TASK_RESPONSE,
      { endpoint: "POST /api/chat/sessions/:id/queued-tasks/:taskId/prioritize" },
    );
  }

  async clearQueuedChatTasks(sessionId: string): Promise<void> {
    await this.fetch(`/api/chat/sessions/${sessionId}/queued-tasks`, {
      method: "DELETE",
    });
  }

  /**
   * Pending deferred-cancellation draft restores for a session (#5219).
   * A 404 means the backend predates the endpoint — treat as "nothing
   * pending" so older servers never error the composer.
   */
  async listChatDraftRestores(sessionId: string): Promise<ChatDraftRestoresResponse> {
    let raw: unknown;
    try {
      raw = await this.fetch<unknown>(`/api/chat/sessions/${sessionId}/draft-restores`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        return { restores: [] };
      }
      throw err;
    }
    return parseWithFallback(raw, ChatDraftRestoresResponseSchema, EMPTY_CHAT_DRAFT_RESTORES, {
      endpoint: "GET /api/chat/sessions/{id}/draft-restores",
    });
  }

  /** Idempotent consume — deleting an already-consumed restore is a 204 no-op. */
  async consumeChatDraftRestore(sessionId: string, restoreId: string): Promise<void> {
    await this.fetch(`/api/chat/sessions/${sessionId}/draft-restores/${restoreId}`, {
      method: "DELETE",
    });
  }

  async listPendingChatTasks(workspace?: WorkspaceScope): Promise<PendingChatTasksResponse> {
    return this.fetch(`/api/chat/pending-tasks`, { headers: workspaceHeader(workspace) });
  }

  async hasAnyPendingChatTasks(workspace?: WorkspaceScope): Promise<HasPendingChatTasksResponse> {
    return this.fetch(`/api/chat/pending-tasks/has-any`, { headers: workspaceHeader(workspace) });
  }

  async markChatSessionRead(sessionId: string): Promise<void> {
    await this.fetch(`/api/chat/sessions/${sessionId}/read`, { method: "POST" });
  }

  // Advertises the durable draft-restore capability (#5219). The server only
  // defers the empty-transcript judgment — and therefore only withholds the
  // synchronous restore from the response — for clients that send this; without
  // it we would be treated as a pre-#5219 client and get the legacy behaviour.
  async cancelTaskById(
    taskId: string,
    options?: { queuedAction?: "edit" | "remove"; sessionId?: string },
  ): Promise<CancelTaskResponse> {
    const params = new URLSearchParams();
    if (options?.queuedAction) {
      if (!options.sessionId) throw new Error("sessionId is required for queued-only cancellation");
      params.set("expected_status", "queued");
      params.set("chat_session_id", options.sessionId);
      params.set("queue_action", options.queuedAction);
    }
    const query = params.size > 0 ? `?${params}` : "";
    const raw = await this.fetch<unknown>(`/api/tasks/${taskId}/cancel${query}`, {
      method: "POST",
      headers: { "X-Client-Capabilities": CHAT_DRAFT_RESTORE_CAPABILITY },
    });
    return parseWithFallback(raw, CancelTaskResponseSchema, EMPTY_CANCEL_TASK_RESPONSE, {
      endpoint: "POST /api/tasks/{taskId}/cancel",
    });
  }

  async listAttachments(issueId: string): Promise<Attachment[]> {
    return this.fetch(`/api/issues/${issueId}/attachments`);
  }

  // Fetches a fresh attachment metadata record. The server re-signs
  // `download_url` on every call (30 min expiry), so the click-time
  // download flow uses this endpoint to avoid handing the user a stale
  // signed URL cached in TanStack Query.
  async getAttachment(id: string): Promise<Attachment> {
    const raw = await this.fetch<unknown>(`/api/attachments/${id}`);
    return parseWithFallback(raw, AttachmentResponseSchema, EMPTY_ATTACHMENT, {
      endpoint: "GET /api/attachments/{id}",
    });
  }

  // The Markdown download path resolves the attachment's own workspace and
  // checks membership there. Its link may be pasted into another workspace.
  async getAttachmentForDownload(id: string): Promise<Attachment> {
    const raw = await this.fetch<unknown>(`/api/attachments/${id}/download-metadata`);
    return parseWithFallback(raw, AttachmentResponseSchema, EMPTY_ATTACHMENT, {
      endpoint: "GET /api/attachments/{id}/download-metadata",
    });
  }

  async deleteAttachment(id: string): Promise<void> {
    await this.fetch(`/api/attachments/${id}`, { method: "DELETE" });
  }

  // Fetches the raw bytes of a text-previewable attachment.
  //
  // The endpoint sidesteps CloudFront CORS (not configured on the CDN) and
  // bypasses Content-Disposition: attachment for the `text/*` family, both
  // of which would otherwise prevent the renderer from getting the body.
  // The server always replies with `text/plain; charset=utf-8` for safety;
  // the original MIME ships back in the `X-Original-Content-Type` header so
  // the preview dispatcher can choose between markdown / html / plain code.
  //
  // Routes through `fetchRaw` so it inherits the standard auth headers,
  // 401 → handleUnauthorized recovery, request-id logging, and ApiError
  // shape. 413 / 415 are translated to typed `Preview*Error` instances so
  // the modal can render specific fallbacks instead of generic failure.
  async getAttachmentTextContent(
    id: string,
  ): Promise<{ text: string; originalContentType: string }> {
    let res: Response;
    try {
      res = await this.fetchRaw(`/api/attachments/${id}/content`);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 413) throw new PreviewTooLargeError();
        if (err.status === 415) throw new PreviewUnsupportedError();
      }
      throw err;
    }
    return {
      text: await res.text(),
      originalContentType: res.headers.get("X-Original-Content-Type") ?? "",
    };
  }

  // Fetches the raw bytes of an attachment through the unified download
  // endpoint.
  //
  // This is the last-resort inline-media path for deployments where the
  // server has no natively-loadable URL to offer. `GET /api/attachments/{id}`
  // only upgrades `download_url` to a signed storage URL under CloudFront
  // signing or presign mode; in **proxy** mode (self-hosted MinIO or any
  // storage endpoint on an internal host, which the default `auto` mode
  // classifies as proxy) it returns the auth-gated API path again. Clients
  // that cannot ride the session cookie on a native `<img>` resource fetch —
  // Desktop's file:// renderer, the mobile webview, split-origin web — get
  // the bytes here and render them from an object URL instead.
  //
  // Routes through `fetchRaw` so it inherits the standard auth headers,
  // 401 → handleUnauthorized recovery, request-id logging and ApiError shape.
  // Callers must only reach for this once the metadata refresh has shown
  // there is no signed URL: in the other modes the endpoint 302s to storage,
  // where CORS is not configured for a JS fetch.
  async getAttachmentBlob(id: string, signal?: AbortSignal): Promise<Blob> {
    const res = await this.fetchRaw(`/api/attachments/${id}/download`, { signal });
    return res.blob();
  }

  // Projects
  async listProjects(params?: { status?: string }): Promise<ListProjectsResponse> {
    const search = new URLSearchParams();
    if (params?.status) search.set("status", params.status);
    const raw = await this.fetch<unknown>(`/api/projects?${search}`);
    return parseWithFallback(raw, ListProjectsResponseSchema, EMPTY_LIST_PROJECTS_RESPONSE, {
      endpoint: "GET /api/projects",
    });
  }

  async getProject(id: string): Promise<Project> {
    const raw = await this.fetch<unknown>(`/api/projects/${id}`);
    return parseWithFallback(raw, ProjectSchema, EMPTY_PROJECT, { endpoint: "GET /api/projects/:id" });
  }

  async createProject(data: CreateProjectRequest): Promise<Project> {
    const raw = await this.fetch<unknown>("/api/projects", {
      method: "POST",
      body: JSON.stringify(data),
    });
    return parseWithFallback(raw, ProjectSchema, EMPTY_PROJECT, { endpoint: "POST /api/projects" });
  }

  async updateProject(id: string, data: UpdateProjectRequest): Promise<Project> {
    const raw = await this.fetch<unknown>(`/api/projects/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
    return parseWithFallback(raw, ProjectSchema, EMPTY_PROJECT, { endpoint: "PUT /api/projects/:id" });
  }

  async deleteProject(id: string): Promise<void> {
    await this.fetch(`/api/projects/${id}`, { method: "DELETE" });
  }

  async getProjectMembers(id: string): Promise<ListProjectMembersResponse> {
    const raw = await this.fetch<unknown>(`/api/projects/${id}/members`);
    return parseWithFallback(raw, ListProjectMembersResponseSchema, { members: [], total: 0 }, {
      endpoint: "GET /api/projects/:id/members",
    });
  }

  async addProjectMembers(id: string, userIds: string[]): Promise<ListProjectMembersResponse> {
    const raw = await this.fetch<unknown>(`/api/projects/${id}/members`, {
      method: "POST", body: JSON.stringify({ user_ids: userIds }),
    });
    return parseWithFallback(raw, ListProjectMembersResponseSchema, { members: [], total: 0 }, {
      endpoint: "POST /api/projects/:id/members",
    });
  }

  async removeProjectMember(id: string, userId: string): Promise<void> {
    await this.fetch(`/api/projects/${id}/members/${userId}`, { method: "DELETE" });
  }

  // Project resources
  async listProjectResources(
    projectId: string,
  ): Promise<ListProjectResourcesResponse> {
    return this.fetch(`/api/projects/${projectId}/resources`);
  }

  async createProjectResource(
    projectId: string,
    data: CreateProjectResourceRequest,
  ): Promise<ProjectResource> {
    return this.fetch(`/api/projects/${projectId}/resources`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateProjectResource(
    projectId: string,
    resourceId: string,
    data: UpdateProjectResourceRequest,
  ): Promise<ProjectResource> {
    return this.fetch(`/api/projects/${projectId}/resources/${resourceId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async deleteProjectResource(
    projectId: string,
    resourceId: string,
  ): Promise<void> {
    await this.fetch(`/api/projects/${projectId}/resources/${resourceId}`, {
      method: "DELETE",
    });
  }

  // Labels
  async listLabels(resourceType: LabelResourceType = "issue"): Promise<ListLabelsResponse> {
    const raw = await this.fetch<unknown>(`/api/labels?resource_type=${resourceType}`);
    return parseWithFallback(raw, ListLabelsResponseSchema, EMPTY_LIST_LABELS_RESPONSE, {
      endpoint: "GET /api/labels",
    });
  }

  async getLabel(id: string): Promise<Label> {
    const raw = await this.fetch<unknown>(`/api/labels/${id}`);
    return parseWithFallback(raw, LabelSchema, EMPTY_LABEL, {
      endpoint: "GET /api/labels/{id}",
    });
  }

  async createLabel(data: CreateLabelRequest): Promise<Label> {
    const raw = await this.fetch<unknown>(`/api/labels`, {
      method: "POST",
      body: JSON.stringify(data),
    });
    return parseWithFallback(raw, LabelSchema, EMPTY_LABEL, {
      endpoint: "POST /api/labels",
    });
  }

  async updateLabel(id: string, data: UpdateLabelRequest): Promise<Label> {
    const raw = await this.fetch<unknown>(`/api/labels/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
    return parseWithFallback(raw, LabelSchema, EMPTY_LABEL, {
      endpoint: "PUT /api/labels/{id}",
    });
  }

  async deleteLabel(id: string): Promise<void> {
    await this.fetch(`/api/labels/${id}`, { method: "DELETE" });
  }

  // Workspace workflows (MUL-7420). Any workspace member may read and create
  // workflows; only the workflow owner and workspace admins may edit or delete.
  async listIssueWorkflows(): Promise<ListIssueWorkflowsResponse> {
    const raw = await this.fetch<unknown>(`/api/issue-workflows`);
    return parseWithFallback(raw, ListIssueWorkflowsResponseSchema, EMPTY_LIST_ISSUE_WORKFLOWS_RESPONSE, {
      endpoint: "GET /api/issue-workflows",
    });
  }

  async createIssueWorkflow(data: IssueWorkflowWriteRequest): Promise<IssueWorkflow> {
    const raw = await this.fetch<unknown>(`/api/issue-workflows`, {
      method: "POST",
      body: JSON.stringify(data),
    });
    return parseWithFallback(raw, IssueWorkflowSchema, EMPTY_ISSUE_WORKFLOW, {
      endpoint: "POST /api/issue-workflows",
    });
  }

  /**
   * Saves a workflow edit. When the edit removes statuses that issues of the
   * workflow's projects still use, the server answers 409
   * `workflow_status_mapping_required` with a plan; resend with
   * `status_mapping`. `dryRunIssueWorkflowUpdate` fetches that plan up front.
   */
  async updateIssueWorkflow(id: string, data: IssueWorkflowWriteRequest): Promise<IssueWorkflow> {
    const raw = await this.fetch<unknown>(`/api/issue-workflows/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ ...data, dry_run: false }),
    });
    return parseWithFallback(raw, IssueWorkflowSchema, EMPTY_ISSUE_WORKFLOW, {
      endpoint: "PATCH /api/issue-workflows/{id}",
    });
  }

  async dryRunIssueWorkflowUpdate(id: string, data: IssueWorkflowWriteRequest): Promise<IssueWorkflowDryRunResponse> {
    const raw = await this.fetch<unknown>(`/api/issue-workflows/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ ...data, dry_run: true }),
    });
    return parseWithFallback(raw, IssueWorkflowDryRunResponseSchema, EMPTY_ISSUE_WORKFLOW_DRY_RUN, {
      endpoint: "PATCH /api/issue-workflows/{id} (dry run)",
    });
  }

  async deleteIssueWorkflow(id: string): Promise<void> {
    await this.fetch(`/api/issue-workflows/${id}`, { method: "DELETE" });
  }

  /**
   * Renders the brief a column's handler would receive, from an unsaved
   * handoff. `project_id` names the project the preview is for, if any.
   */
  async previewWorkflowBrief(
    workflowId: string,
    data: SetWorkflowHandoffRequest & { status_key: string; project_id?: string },
  ): Promise<string> {
    const raw = await this.fetch<unknown>(`/api/issue-workflows/${workflowId}/brief`, {
      method: "POST",
      body: JSON.stringify(data),
    });
    const parsed = parseWithFallback(raw, IssueWorkflowBriefPreviewSchema, { brief: "" }, {
      endpoint: "POST /api/issue-workflows/{id}/brief",
    });
    return parsed.brief;
  }

  /**
   * Saves a workflow's handoff for one column, for every project using it;
   * handler "none" clears it. With `copyForProjectId` the workflow stays as
   * it is: the handoff lands on a copy that project switches to, and the copy
   * is returned. Admin only.
   */
  async setWorkflowHandoff(
    workflowId: string,
    statusKey: string,
    data: SetWorkflowHandoffRequest,
    copyForProjectId?: string,
  ): Promise<IssueWorkflow> {
    const body = copyForProjectId ? { ...data, copy_for_project_id: copyForProjectId } : data;
    const raw = await this.fetch<unknown>(
      `/api/issue-workflows/${workflowId}/handoffs/${encodeURIComponent(statusKey)}`,
      { method: "PUT", body: JSON.stringify(body) },
    );
    return parseWithFallback(raw, IssueWorkflowSchema, EMPTY_ISSUE_WORKFLOW, {
      endpoint: "PUT /api/issue-workflows/{id}/handoffs/{status}",
    });
  }

  /**
   * What moving an issue to `status` would do under its project's workflow:
   * who it goes to, the current agent's active runs, and the brief. Writes
   * nothing; a status outside the workflow answers 400. With `projectId` it
   * previews moving the issue into that project instead, entering the column
   * it lands on (`status` may then be empty).
   */
  async previewWorkflowHandoff(issueId: string, status: string, projectId?: string): Promise<WorkflowHandoffPreview> {
    const query = new URLSearchParams();
    if (status) query.set("status", status);
    if (projectId) query.set("project_id", projectId);
    const raw = await this.fetch<unknown>(`/api/issues/${issueId}/workflow-handoff?${query.toString()}`);
    return parseWithFallback(raw, WorkflowHandoffPreviewSchema, EMPTY_WORKFLOW_HANDOFF_PREVIEW, {
      endpoint: "GET /api/issues/{id}/workflow-handoff",
    });
  }

  /**
   * Switches a project's workflow; issues on unlisted statuses need a mapping.
   * Callers refetch the project and its issues, so the response is not read.
   */
  async setProjectWorkflow(projectId: string, data: SetProjectWorkflowRequest): Promise<void> {
    await this.fetch<unknown>(`/api/projects/${projectId}/workflow`, {
      method: "POST",
      body: JSON.stringify({ ...data, dry_run: false }),
    });
  }

  async dryRunProjectWorkflow(projectId: string, workflowId: string | null): Promise<IssueWorkflowDryRunResponse> {
    const raw = await this.fetch<unknown>(`/api/projects/${projectId}/workflow`, {
      method: "POST",
      body: JSON.stringify({ workflow_id: workflowId, dry_run: true }),
    });
    return parseWithFallback(raw, IssueWorkflowDryRunResponseSchema, EMPTY_ISSUE_WORKFLOW_DRY_RUN, {
      endpoint: "POST /api/projects/{id}/workflow (dry run)",
    });
  }

  // Issue status catalog (MUL-6243). Reads are open to any workspace member;
  // the mutations below are owner/admin only and return 403 otherwise.
  async listIssueStatuses(includeArchived = false): Promise<ListIssueStatusesResponse> {
    const query = includeArchived ? "?include_archived=true" : "";
    const raw = await this.fetch<unknown>(`/api/issue-statuses${query}`);
    return parseWithFallback(raw, ListIssueStatusesResponseSchema, EMPTY_LIST_ISSUE_STATUSES_RESPONSE, {
      endpoint: "GET /api/issue-statuses",
    });
  }

  async createIssueStatus(data: CreateIssueStatusRequest): Promise<IssueStatusEntry> {
    const raw = await this.fetch<unknown>(`/api/issue-statuses`, {
      method: "POST",
      body: JSON.stringify(data),
    });
    return parseWithFallback(raw, IssueStatusEntrySchema, EMPTY_ISSUE_STATUS_ENTRY, {
      endpoint: "POST /api/issue-statuses",
    });
  }

  async updateIssueStatus(id: string, data: UpdateIssueStatusRequest): Promise<IssueStatusEntry> {
    const raw = await this.fetch<unknown>(`/api/issue-statuses/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
    return parseWithFallback(raw, IssueStatusEntrySchema, EMPTY_ISSUE_STATUS_ENTRY, {
      endpoint: "PATCH /api/issue-statuses/{id}",
    });
  }

  /**
   * Rewrites one category's status order in a single server-side
   * statement. Not expressible as a sequence of `updateIssueStatus` calls: a
   * row rejected mid-sequence would leave the earlier rows already reordered
   * while the caller sees a failure. (MUL-6243)
   */
  async reorderIssueStatuses(
    category: IssueStatusCategory,
    ids: string[],
    includeSystem = false,
  ): Promise<ListIssueStatusesResponse> {
    const raw = await this.fetch<unknown>(`/api/issue-statuses/reorder`, {
      method: "PATCH",
      body: JSON.stringify({ category, ids, include_system: includeSystem }),
    });
    return parseWithFallback(raw, ListIssueStatusesResponseSchema, EMPTY_LIST_ISSUE_STATUSES_RESPONSE, {
      endpoint: "PATCH /api/issue-statuses/reorder",
    });
  }

  /**
   * Archives a custom status, retiring it from future use. Issues already on it
   * keep it and keep behaving as their category prescribes; only new
   * assignments are refused. Built-in statuses return 403.
   */
  async archiveIssueStatus(id: string): Promise<IssueStatusEntry> {
    const raw = await this.fetch<unknown>(`/api/issue-statuses/${id}`, { method: "DELETE" });
    return parseWithFallback(raw, IssueStatusEntrySchema, EMPTY_ISSUE_STATUS_ENTRY, {
      endpoint: "DELETE /api/issue-statuses/{id}",
    });
  }

  // Custom issue properties
  async listProperties(includeArchived = false): Promise<ListPropertiesResponse> {
    const suffix = includeArchived ? "?include_archived=true" : "";
    let raw: unknown;
    try {
      raw = await this.fetch<unknown>(`/api/properties${suffix}`);
    } catch (error) {
      // A backend predating custom properties 404s here (e.g. after a
      // server-only rollback). Treat it as an empty catalog: the property
      // UI sections disappear and the active-catalog reconciliation strips
      // persisted property sorts/filters, so no property params ever reach
      // the old server. Other errors keep normal query-error semantics.
      if (error instanceof Error && "status" in error && (error as { status?: number }).status === 404) {
        return EMPTY_LIST_PROPERTIES_RESPONSE;
      }
      throw error;
    }
    return parseWithFallback(raw, ListPropertiesResponseSchema, EMPTY_LIST_PROPERTIES_RESPONSE, {
      endpoint: "GET /api/properties",
    });
  }

  /**
   * Quick actions catalog — one projection for every caller.
   *
   * The server hides nothing beyond `private` ownership; whether the caller
   * may RUN an action is answered by runQuickAction, not here. There is
   * deliberately no "runnable only" mode: filtering the sidebar by permission
   * made two people looking at one issue see different sidebars with no
   * explanation.
   *
   * A backend predating quick actions 404s here; treat that as an empty
   * catalog so the sidebar section and settings tab simply do not render.
   */
  async listQuickActions(opts?: { includeArchived?: boolean }): Promise<ListQuickActionsResponse> {
    const suffix = opts?.includeArchived === true ? "?include_archived=true" : "";
    let raw: unknown;
    try {
      raw = await this.fetch<unknown>(`/api/quick-actions${suffix}`);
    } catch (error) {
      if (error instanceof Error && "status" in error && (error as { status?: number }).status === 404) {
        return EMPTY_LIST_QUICK_ACTIONS_RESPONSE;
      }
      throw error;
    }
    return parseWithFallback(raw, ListQuickActionsResponseSchema, EMPTY_LIST_QUICK_ACTIONS_RESPONSE, {
      endpoint: "GET /api/quick-actions",
    });
  }

  async createQuickAction(data: CreateQuickActionRequest): Promise<QuickAction> {
    const raw = await this.fetch<unknown>(`/api/quick-actions`, {
      method: "POST",
      body: JSON.stringify(data),
    });
    return parseWithFallback(raw, QuickActionSchema, EMPTY_QUICK_ACTION, {
      endpoint: "POST /api/quick-actions",
    });
  }

  async updateQuickAction(id: string, data: UpdateQuickActionRequest): Promise<QuickAction> {
    const raw = await this.fetch<unknown>(`/api/quick-actions/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
    return parseWithFallback(raw, QuickActionSchema, EMPTY_QUICK_ACTION, {
      endpoint: "PATCH /api/quick-actions/{id}",
    });
  }

  async deleteQuickAction(id: string): Promise<void> {
    await this.fetch<void>(`/api/quick-actions/${id}`, { method: "DELETE" });
  }

  /**
   * Run a quick action against one issue. The response is a Comment carrying
   * `trigger_outcomes` — the same shape POST /comments returns — so callers
   * reuse one result handler and inherit `queued` / `coalesced` / `deferred` /
   * `blocked` instead of a parallel vocabulary that would drift.
   */
  async runQuickAction(issueId: string, quickActionId: string): Promise<Comment> {
    const raw = await this.fetch<unknown>(`/api/issues/${issueId}/quick-actions/${quickActionId}/run`, {
      method: "POST",
    });
    return parseWithFallback(raw, CommentSchema, EMPTY_COMMENT, {
      endpoint: "POST /api/issues/{id}/quick-actions/{quickActionId}/run",
    });
  }

  /**
   * What a quick action WOULD post, with server-side validation but no send.
   * Retained for callers that resolve drafts over HTTP; the comment composer
   * builds its draft synchronously from the quick-action catalog.
   * Returns "" when the response cannot be read — callers must treat an empty
   * string as "insert nothing" rather than clearing the composer.
   */
  async renderQuickAction(issueId: string, quickActionId: string): Promise<string> {
    const raw = await this.fetch<unknown>(`/api/issues/${issueId}/quick-actions/${quickActionId}/render`, {
      method: "POST",
    });
    const parsed = parseWithFallback(raw, QuickActionRenderSchema, { content: "" }, {
      endpoint: "POST /api/issues/{id}/quick-actions/{quickActionId}/render",
    });
    return parsed.content;
  }

  async createProperty(data: CreatePropertyRequest): Promise<IssueProperty> {
    const raw = await this.fetch<unknown>(`/api/properties`, {
      method: "POST",
      body: JSON.stringify(data),
    });
    return parseWithFallback(raw, IssuePropertySchema, EMPTY_ISSUE_PROPERTY, {
      endpoint: "POST /api/properties",
    });
  }

  async updateProperty(id: string, data: UpdatePropertyRequest): Promise<IssueProperty> {
    const raw = await this.fetch<unknown>(`/api/properties/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
    return parseWithFallback(raw, IssuePropertySchema, EMPTY_ISSUE_PROPERTY, {
      endpoint: "PATCH /api/properties/{id}",
    });
  }

  async setIssueProperty(issueId: string, propertyId: string, value: IssuePropertyValue): Promise<IssuePropertiesResponse> {
    const raw = await this.fetch<unknown>(`/api/issues/${issueId}/properties/${propertyId}`, {
      method: "PUT",
      body: JSON.stringify({ value }),
    });
    return parseWithFallback(raw, IssuePropertiesResponseSchema, EMPTY_ISSUE_PROPERTIES_RESPONSE, {
      endpoint: "PUT /api/issues/{id}/properties/{propertyId}",
    });
  }

  async unsetIssueProperty(issueId: string, propertyId: string): Promise<IssuePropertiesResponse> {
    const raw = await this.fetch<unknown>(`/api/issues/${issueId}/properties/${propertyId}`, {
      method: "DELETE",
    });
    return parseWithFallback(raw, IssuePropertiesResponseSchema, EMPTY_ISSUE_PROPERTIES_RESPONSE, {
      endpoint: "DELETE /api/issues/{id}/properties/{propertyId}",
    });
  }

  async listLabelsForIssue(issueId: string): Promise<IssueLabelsResponse> {
    const raw = await this.fetch<unknown>(`/api/issues/${issueId}/labels`);
    return parseWithFallback(raw, ResourceLabelsResponseSchema, EMPTY_RESOURCE_LABELS_RESPONSE, {
      endpoint: "GET /api/issues/{id}/labels",
    });
  }

  async attachLabel(issueId: string, labelId: string): Promise<IssueLabelsResponse> {
    const raw = await this.fetch<unknown>(`/api/issues/${issueId}/labels`, {
      method: "POST",
      body: JSON.stringify({ label_id: labelId }),
    });
    return parseWithFallback(raw, ResourceLabelsResponseSchema, EMPTY_RESOURCE_LABELS_RESPONSE, {
      endpoint: "POST /api/issues/{id}/labels",
    });
  }

  async detachLabel(issueId: string, labelId: string): Promise<IssueLabelsResponse> {
    const raw = await this.fetch<unknown>(`/api/issues/${issueId}/labels/${labelId}`, {
      method: "DELETE",
    });
    return parseWithFallback(raw, ResourceLabelsResponseSchema, EMPTY_RESOURCE_LABELS_RESPONSE, {
      endpoint: "DELETE /api/issues/{id}/labels/{labelId}",
    });
  }

  async listLabelsForResource(
    resourceType: "agent" | "skill",
    resourceId: string,
  ): Promise<ResourceLabelsResponse> {
    const raw = await this.fetch<unknown>(`/api/${resourceType === "agent" ? "agents" : "skills"}/${resourceId}/labels`);
    return parseWithFallback(raw, ResourceLabelsResponseSchema, EMPTY_RESOURCE_LABELS_RESPONSE, {
      endpoint: `GET /api/${resourceType === "agent" ? "agents" : "skills"}/{id}/labels`,
    });
  }

  async attachLabelToResource(
    resourceType: "agent" | "skill",
    resourceId: string,
    labelId: string,
  ): Promise<ResourceLabelsResponse> {
    const raw = await this.fetch<unknown>(`/api/${resourceType === "agent" ? "agents" : "skills"}/${resourceId}/labels`, {
      method: "POST",
      body: JSON.stringify({ label_id: labelId }),
    });
    return parseWithFallback(raw, ResourceLabelsResponseSchema, EMPTY_RESOURCE_LABELS_RESPONSE, {
      endpoint: `POST /api/${resourceType === "agent" ? "agents" : "skills"}/{id}/labels`,
    });
  }

  async detachLabelFromResource(
    resourceType: "agent" | "skill",
    resourceId: string,
    labelId: string,
  ): Promise<ResourceLabelsResponse> {
    const raw = await this.fetch<unknown>(`/api/${resourceType === "agent" ? "agents" : "skills"}/${resourceId}/labels/${labelId}`, {
      method: "DELETE",
    });
    return parseWithFallback(raw, ResourceLabelsResponseSchema, EMPTY_RESOURCE_LABELS_RESPONSE, {
      endpoint: `DELETE /api/${resourceType === "agent" ? "agents" : "skills"}/{id}/labels/{labelId}`,
    });
  }

  // Saved issue views (MUL-4796). Responses go through zod so installed
  // desktop builds survive backend drift; a malformed list degrades to []
  // (selector shows only built-ins) rather than blanking the page.
  async listIssueViews(params: {
    scope_type: string;
    scope_id?: string | null;
  }): Promise<IssueView[]> {
    const qs = new URLSearchParams({ scope_type: params.scope_type });
    if (params.scope_id) qs.set("scope_id", params.scope_id);
    const raw = await this.fetch<unknown>(`/api/issue-views?${qs.toString()}`);
    return parseWithFallback(raw, IssueViewListSchema, [], {
      endpoint: "GET /api/issue-views",
    });
  }

  async createIssueView(data: CreateIssueViewRequest): Promise<IssueView | null> {
    const raw = await this.fetch<unknown>("/api/issue-views", {
      method: "POST",
      body: JSON.stringify(data),
    });
    // null fallback: the create itself succeeded server-side; a response we
    // cannot parse must not crash the dialog — callers refetch the list.
    return parseWithFallback(raw, IssueViewSchema.nullable(), null, {
      endpoint: "POST /api/issue-views",
    });
  }

  async updateIssueView(
    id: string,
    data: {
      name?: string;
      visibility?: "private" | "workspace";
      scope_variant?: string | null;
      query?: Record<string, unknown>;
      display?: Record<string, unknown>;
      expected_revision: number;
    },
  ): Promise<IssueView | null> {
    const raw = await this.fetch<unknown>(`/api/issue-views/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
    return parseWithFallback(raw, IssueViewSchema.nullable(), null, {
      endpoint: "PATCH /api/issue-views/{id}",
    });
  }

  async getIssueView(id: string): Promise<IssueView | null> {
    const raw = await this.fetch<unknown>(`/api/issue-views/${id}`);
    return parseWithFallback(raw, IssueViewSchema.nullable(), null, {
      endpoint: "GET /api/issue-views/{id}",
    });
  }

  async deleteIssueView(id: string): Promise<void> {
    await this.fetch(`/api/issue-views/${id}`, { method: "DELETE" });
  }

  async getIssueViewPreference(params: {
    scope_type: string;
    scope_id?: string | null;
  }): Promise<IssueViewPreference> {
    const qs = new URLSearchParams({ scope_type: params.scope_type });
    if (params.scope_id) qs.set("scope_id", params.scope_id);
    const raw = await this.fetch<unknown>(`/api/issue-view-preferences?${qs.toString()}`);
    return parseWithFallback(raw, IssueViewPreferenceSchema, EMPTY_ISSUE_VIEW_PREFERENCE, {
      endpoint: "GET /api/issue-view-preferences",
    });
  }

  async putIssueViewPreference(
    data: {
      scope_type: string;
      scope_id?: string | null;
      prefs: Record<string, unknown>;
    },
    workspaceSlug?: string,
  ): Promise<IssueViewPreference> {
    const raw = await this.fetch<unknown>("/api/issue-view-preferences", {
      method: "PUT",
      body: JSON.stringify(data),
      headers: workspaceHeader(workspaceSlug),
    });
    return parseWithFallback(raw, IssueViewPreferenceSchema, EMPTY_ISSUE_VIEW_PREFERENCE, {
      endpoint: "PUT /api/issue-view-preferences",
    });
  }

  // Pins
  async listPins(): Promise<PinnedItem[]> {
    // include=view is the capability opt-in: the server withholds view pins
    // from clients that don't declare support (old builds treated any
    // non-issue pin as a project pin and auto-deleted it on 404).
    return this.fetch("/api/pins?include=view");
  }

  async createPin(data: CreatePinRequest): Promise<PinnedItem> {
    return this.fetch("/api/pins", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async deletePin(itemType: PinnedItemType, itemId: string): Promise<void> {
    await this.fetch(`/api/pins/${itemType}/${itemId}`, { method: "DELETE" });
  }

  async reorderPins(data: ReorderPinsRequest): Promise<void> {
    await this.fetch("/api/pins/reorder", {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  // Squads
  async listSquads(): Promise<Squad[]> {
    const raw = await this.fetch<unknown>(`/api/squads`);
    return parseWithFallback(raw, SquadListSchema, EMPTY_SQUAD_LIST, {
      endpoint: "GET /api/squads",
    }) as Squad[];
  }

  async getSquad(id: string): Promise<Squad> {
    const raw = await this.fetch<unknown>(`/api/squads/${id}`);
    return parseWithFallback(raw, SquadSchema, EMPTY_SQUAD, {
      endpoint: "GET /api/squads/:id",
    }) as Squad;
  }

  async createSquad(data: { name: string; description?: string; leader_id: string; avatar_url?: string }): Promise<Squad> {
    const raw = await this.fetch<unknown>("/api/squads", { method: "POST", body: JSON.stringify(data) });
    return parseWithFallback(raw, SquadSchema, EMPTY_SQUAD, {
      endpoint: "POST /api/squads",
    }) as Squad;
  }

  async updateSquad(id: string, data: { name?: string; description?: string; instructions?: string; leader_id?: string; avatar_url?: string }): Promise<Squad> {
    const raw = await this.fetch<unknown>(`/api/squads/${id}`, { method: "PUT", body: JSON.stringify(data) });
    return parseWithFallback(raw, SquadSchema, EMPTY_SQUAD, {
      endpoint: "PUT /api/squads/:id",
    }) as Squad;
  }

  async deleteSquad(id: string): Promise<void> {
    await this.fetch(`/api/squads/${id}`, { method: "DELETE" });
  }

  async listSquadMembers(squadId: string): Promise<SquadMember[]> {
    return this.fetch(`/api/squads/${squadId}/members`);
  }

  async addSquadMember(squadId: string, data: { member_type: string; member_id: string; role?: string }): Promise<SquadMember> {
    return this.fetch(`/api/squads/${squadId}/members`, { method: "POST", body: JSON.stringify(data) });
  }

  async removeSquadMember(squadId: string, data: { member_type: string; member_id: string }): Promise<void> {
    await this.fetch(`/api/squads/${squadId}/members`, { method: "DELETE", body: JSON.stringify(data) });
  }

  async updateSquadMemberRole(squadId: string, data: { member_type: string; member_id: string; role: string }): Promise<SquadMember> {
    return this.fetch(`/api/squads/${squadId}/members/role`, { method: "PATCH", body: JSON.stringify(data) });
  }

  // Per-squad members status snapshot: one row per member with derived
  // working/idle/offline/unstable plus the issues each agent is currently
  // running. Parsed with a lenient schema so a new server-side status
  // value or extra field can't white-screen the Squad page (#2143).
  async getSquadMemberStatus(squadId: string): Promise<SquadMemberStatusListResponse> {
    const raw = await this.fetch<unknown>(`/api/squads/${squadId}/members/status`);
    return parseWithFallback(raw, SquadMemberStatusListResponseSchema, EMPTY_SQUAD_MEMBER_STATUS_LIST, {
      endpoint: "GET /api/squads/:id/members/status",
    }) as SquadMemberStatusListResponse;
  }

  // Autopilots
  async listAutopilots(params?: { status?: string }): Promise<ListAutopilotsResponse> {
    const search = new URLSearchParams();
    if (params?.status) search.set("status", params.status);
    const raw = await this.fetch<unknown>(`/api/autopilots?${search}`);
    return parseWithFallback(
      raw,
      ListAutopilotsResponseSchema,
      EMPTY_LIST_AUTOPILOTS_RESPONSE as ListAutopilotsResponse,
      { endpoint: "GET /api/autopilots" },
    );
  }

  async getAutopilot(id: string): Promise<GetAutopilotResponse> {
    return this.fetch(`/api/autopilots/${id}`);
  }

  async createAutopilot(data: CreateAutopilotRequest): Promise<Autopilot> {
    return this.fetch("/api/autopilots", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateAutopilot(id: string, data: UpdateAutopilotRequest): Promise<Autopilot> {
    return this.fetch(`/api/autopilots/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  async deleteAutopilot(id: string): Promise<void> {
    await this.fetch(`/api/autopilots/${id}`, { method: "DELETE" });
  }

  // Grant a workspace member explicit write access to the autopilot. Both
  // grant and revoke return the full updated collaborator list so callers can
  // refresh without a second round-trip.
  async grantAutopilotAccess(id: string, userId: string): Promise<AutopilotCollaboratorsResponse> {
    return this.fetch(`/api/autopilots/${id}/collaborators`, {
      method: "POST",
      body: JSON.stringify({ user_id: userId }),
    });
  }

  async revokeAutopilotAccess(id: string, userId: string): Promise<AutopilotCollaboratorsResponse> {
    return this.fetch(`/api/autopilots/${id}/collaborators/${userId}`, {
      method: "DELETE",
    });
  }

  async triggerAutopilot(id: string): Promise<AutopilotRun> {
    // Manual "run now" usually returns a run, including downstream admission
    // failures. Quota rejection is the exception and returns 429. The UI
    // handles both paths without presenting a false-success toast.
    const raw = await this.fetch<unknown>(`/api/autopilots/${id}/trigger`, {
      method: "POST",
      headers: { "Idempotency-Key": createSafeId() },
    });
    return parseWithFallback(raw, AutopilotRunSchema, FALLBACK_AUTOPILOT_RUN, {
      endpoint: "POST /api/autopilots/:id/trigger",
    });
  }

  async getAutopilotQuotaUsage(): Promise<AutopilotQuotaUsage> {
    const raw = await this.fetch<unknown>("/api/autopilots/usage");
    return parseWithFallback(
      raw,
      AutopilotQuotaUsageSchema,
      {
        action: "off",
        used: null,
        reserved: null,
        total: null,
        limit: null,
        reached: null,
        period_start: null,
        period_end: null,
        reset_at: null,
        blocked_counts: null,
      },
      { endpoint: "GET /api/autopilots/usage" },
    );
  }

  async listAutopilotRuns(id: string, params?: { limit?: number; offset?: number }): Promise<ListAutopilotRunsResponse> {
    const search = new URLSearchParams();
    if (params?.limit) search.set("limit", params.limit.toString());
    if (params?.offset) search.set("offset", params.offset.toString());
    return this.fetch(`/api/autopilots/${id}/runs?${search}`);
  }

  // Returns a single run including its full trigger_payload. List responses
  // omit trigger_payload to keep them small (a webhook envelope can be
  // up to 256 KiB × limit rows), so the detail view fetches via this route.
  async getAutopilotRun(autopilotId: string, runId: string): Promise<AutopilotRun> {
    return this.fetch(`/api/autopilots/${autopilotId}/runs/${runId}`);
  }

  async createAutopilotTrigger(autopilotId: string, data: CreateAutopilotTriggerRequest): Promise<AutopilotTrigger> {
    return this.fetch(`/api/autopilots/${autopilotId}/triggers`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateAutopilotTrigger(autopilotId: string, triggerId: string, data: UpdateAutopilotTriggerRequest): Promise<AutopilotTrigger> {
    return this.fetch(`/api/autopilots/${autopilotId}/triggers/${triggerId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  async deleteAutopilotTrigger(autopilotId: string, triggerId: string): Promise<void> {
    await this.fetch(`/api/autopilots/${autopilotId}/triggers/${triggerId}`, { method: "DELETE" });
  }

  async cronPreview(params: { expr: string; tz: string }): Promise<CronPreviewResponse> {
    const search = new URLSearchParams();
    search.set("expr", params.expr);
    search.set("tz", params.tz);
    const raw = await this.fetch<unknown>(`/api/autopilots/cron-preview?${search}`);
    return parseWithFallback(
      raw,
      CronPreviewResponseSchema,
      UNREADABLE_CRON_PREVIEW_RESPONSE,
      { endpoint: "GET /api/autopilots/cron-preview" },
    );
  }

  async rotateAutopilotTriggerWebhookToken(
    autopilotId: string,
    triggerId: string,
  ): Promise<AutopilotTrigger> {
    return this.fetch(
      `/api/autopilots/${autopilotId}/triggers/${triggerId}/rotate-webhook-token`,
      { method: "POST" },
    );
  }

  // Webhook deliveries — list is slim (no raw_body / selected_headers /
  // response_body); detail returns the full row. Both responses are parsed
  // through a lenient schema so an unknown server-side `status` /
  // `signature_status` value degrades to a generic row instead of dropping
  // the whole list.
  async listAutopilotDeliveries(
    autopilotId: string,
    params?: { limit?: number; offset?: number },
  ): Promise<ListWebhookDeliveriesResponse> {
    const search = new URLSearchParams();
    if (params?.limit) search.set("limit", params.limit.toString());
    if (params?.offset) search.set("offset", params.offset.toString());
    const raw = await this.fetch<unknown>(
      `/api/autopilots/${autopilotId}/deliveries?${search}`,
    );
    return parseWithFallback(
      raw,
      ListWebhookDeliveriesResponseSchema,
      EMPTY_LIST_WEBHOOK_DELIVERIES_RESPONSE,
      { endpoint: "GET /api/autopilots/:id/deliveries" },
    );
  }

  async getAutopilotDelivery(
    autopilotId: string,
    deliveryId: string,
  ): Promise<WebhookDelivery> {
    const raw = await this.fetch<unknown>(
      `/api/autopilots/${autopilotId}/deliveries/${deliveryId}`,
    );
    return parseWithFallback(
      raw,
      WebhookDeliveryResponseSchema,
      { ...EMPTY_WEBHOOK_DELIVERY, id: deliveryId, autopilot_id: autopilotId },
      { endpoint: "GET /api/autopilots/:id/deliveries/:deliveryId" },
    );
  }

  // Replay creates a NEW delivery row referencing the original via
  // `replayed_from_delivery_id`. Server rejects replays of
  // signature-invalid / rejected deliveries with 400 — the UI keeps the
  // button disabled for those rows, but the server is the source of truth.
  async replayAutopilotDelivery(
    autopilotId: string,
    deliveryId: string,
  ): Promise<WebhookDelivery> {
    const raw = await this.fetch<unknown>(
      `/api/autopilots/${autopilotId}/deliveries/${deliveryId}/replay`,
      { method: "POST", headers: { "Idempotency-Key": createSafeId() } },
    );
    return parseWithFallback(
      raw,
      WebhookDeliveryResponseSchema,
      { ...EMPTY_WEBHOOK_DELIVERY, autopilot_id: autopilotId },
      { endpoint: "POST /api/autopilots/:id/deliveries/:deliveryId/replay" },
    );
  }

  // GitHub integration
  async getGitHubConnectURL(
    workspaceId: string,
    returnTo?: "github" | "repositories",
  ): Promise<GitHubConnectResponse> {
    const search = new URLSearchParams();
    if (returnTo) search.set("return_to", returnTo);
    const suffix = search.size > 0 ? `?${search.toString()}` : "";
    const raw = await this.fetch<unknown>(
      `/api/workspaces/${workspaceId}/github/connect${suffix}`,
    );
    return parseWithFallback(
      raw,
      GitHubConnectResponseSchema,
      EMPTY_GITHUB_CONNECT_RESPONSE,
      { endpoint: "GET /api/workspaces/:id/github/connect" },
    );
  }

  async listGitHubInstallations(workspaceId: string): Promise<ListGitHubInstallationsResponse> {
    const raw = await this.fetch<unknown>(
      `/api/workspaces/${workspaceId}/github/installations`,
    );
    return parseWithFallback(
      raw,
      ListGitHubInstallationsResponseSchema,
      EMPTY_LIST_GITHUB_INSTALLATIONS_RESPONSE,
      { endpoint: "GET /api/workspaces/:id/github/installations" },
    );
  }

  async listGitHubInstallationRepositories(
    workspaceId: string,
    installationId: string,
    params: { page?: number; per_page?: number } = {},
  ): Promise<ListGitHubRepositoriesResponse> {
    const search = new URLSearchParams();
    if (params.page !== undefined) search.set("page", String(params.page));
    if (params.per_page !== undefined) search.set("per_page", String(params.per_page));
    const suffix = search.size > 0 ? `?${search.toString()}` : "";
    const raw = await this.fetch<unknown>(
      `/api/workspaces/${workspaceId}/github/installations/${installationId}/repositories${suffix}`,
    );
    return parseWithFallback(
      raw,
      ListGitHubRepositoriesResponseSchema,
      EMPTY_LIST_GITHUB_REPOSITORIES_RESPONSE,
      { endpoint: "GET /api/workspaces/:id/github/installations/:installationId/repositories" },
    );
  }

  async deleteGitHubInstallation(workspaceId: string, installationId: string): Promise<void> {
    await this.fetch(`/api/workspaces/${workspaceId}/github/installations/${installationId}`, {
      method: "DELETE",
    });
  }

  async listIssuePullRequests(issueId: string): Promise<IssuePullRequestsResponse> {
    const raw = await this.fetch<unknown>(`/api/issues/${issueId}/pull-requests`);
    return parseWithFallback(
      raw,
      IssuePullRequestsResponseSchema,
      EMPTY_ISSUE_PULL_REQUESTS_RESPONSE,
      { endpoint: "GET /api/issues/:id/pull-requests" },
    );
  }

  /** Environments the issue's runs started, live ones plus recently ended. */
  async listIssueEnvironments(issueId: string): Promise<IssueEnvironmentsResponse> {
    const raw = await this.fetch<unknown>(`/api/issues/${issueId}/environments`);
    return parseWithFallback(
      raw,
      IssueEnvironmentsResponseSchema,
      EMPTY_ISSUE_ENVIRONMENTS_RESPONSE,
      { endpoint: "GET /api/issues/:id/environments" },
    );
  }

  /** Link a PR the workspace already mirrors, by pasted URL or by id (undo). */
  async linkIssuePullRequest(
    issueId: string,
    body: { url: string } | { pull_request_id: string },
  ): Promise<IssuePullRequestsResponse> {
    const raw = await this.fetch<unknown>(`/api/issues/${issueId}/pull-requests`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    return parseWithFallback(
      raw,
      IssuePullRequestsResponseSchema,
      EMPTY_ISSUE_PULL_REQUESTS_RESPONSE,
      { endpoint: "POST /api/issues/:id/pull-requests" },
    );
  }

  /** Remove a PR from an issue; later webhooks will not link it again. */
  async unlinkIssuePullRequest(issueId: string, pullRequestId: string): Promise<IssuePullRequestsResponse> {
    const raw = await this.fetch<unknown>(
      `/api/issues/${issueId}/pull-requests/${pullRequestId}`,
      { method: "DELETE" },
    );
    return parseWithFallback(
      raw,
      IssuePullRequestsResponseSchema,
      EMPTY_ISSUE_PULL_REQUESTS_RESPONSE,
      { endpoint: "DELETE /api/issues/:id/pull-requests/:prId" },
    );
  }

  /** Turn PR auto-complete off (or back on) for one issue. */
  async setIssuePRAutoComplete(issueId: string, disabled: boolean): Promise<IssuePullRequestsResponse> {
    const raw = await this.fetch<unknown>(`/api/issues/${issueId}/pr-auto-complete`, {
      method: "PUT",
      body: JSON.stringify({ disabled }),
    });
    return parseWithFallback(
      raw,
      IssuePullRequestsResponseSchema,
      EMPTY_ISSUE_PULL_REQUESTS_RESPONSE,
      { endpoint: "PUT /api/issues/:id/pr-auto-complete" },
    );
  }

  // VCS integration (Forgejo / Gitea / GitLab)
  async listVCSConnections(workspaceId: string): Promise<ListVCSConnectionsResponse> {
    return this.fetch(`/api/workspaces/${workspaceId}/vcs/connections`);
  }

  async connectVCS(
    workspaceId: string,
    body: ConnectVCSRequest,
  ): Promise<ConnectVCSResponse> {
    return this.fetch(`/api/workspaces/${workspaceId}/vcs/connections`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  async deleteVCSConnection(workspaceId: string, connectionId: string): Promise<void> {
    await this.fetch(`/api/workspaces/${workspaceId}/vcs/connections/${connectionId}`, {
      method: "DELETE",
    });
  }

  async rotateVCSWebhook(
    workspaceId: string,
    connectionId: string,
  ): Promise<ConnectVCSResponse> {
    return this.fetch(
      `/api/workspaces/${workspaceId}/vcs/connections/${connectionId}/rotate-webhook`,
      { method: "POST" },
    );
  }

  // Lark integration
  async listLarkInstallations(workspaceId: string): Promise<ListLarkInstallationsResponse> {
    const endpoint = `/api/workspaces/${workspaceId}/lark/installations`;
    return parseWithFallback(
      await this.fetch(endpoint),
      ListLarkInstallationsResponseSchema,
      EMPTY_LIST_LARK_INSTALLATIONS_RESPONSE,
      { endpoint },
    );
  }

  async beginLarkInstall(
    workspaceId: string,
    agentId: string,
    region: "feishu" | "lark",
  ): Promise<BeginLarkInstallResponse> {
    // The user picks the cloud explicitly in the UI ("Bind to Feishu"
    // vs "Bind to Lark"), and the backend POSTs the device-flow `begin`
    // against the corresponding accounts host (accounts.feishu.cn vs
    // accounts.larksuite.com) so the QR renders against the right
    // cloud up front. Empty / omitted region still resolves to Feishu
    // server-side (RegionOrDefault) — we surface region as a required
    // arg here so every call site is forced to make a deliberate
    // choice rather than silently defaulting to mainland.
    const search = new URLSearchParams({ agent_id: agentId, region });
    return this.fetch(`/api/workspaces/${workspaceId}/lark/install/begin?${search.toString()}`, {
      method: "POST",
    });
  }

  async getLarkInstallStatus(workspaceId: string, sessionId: string): Promise<LarkInstallStatusResponse> {
    return this.fetch(`/api/workspaces/${workspaceId}/lark/install/${sessionId}/status`);
  }

  async deleteLarkInstallation(workspaceId: string, installationId: string): Promise<void> {
    await this.fetch(`/api/workspaces/${workspaceId}/lark/installations/${installationId}`, {
      method: "DELETE",
    });
  }

  async redeemLarkBindingToken(token: string): Promise<RedeemLarkBindingTokenResponse> {
    return this.fetch(`/api/lark/binding/redeem`, {
      method: "POST",
      body: JSON.stringify({ token }),
    });
  }

  // Composio integration (MUL-3720). All routes are user-scoped (a connection
  // belongs to a user, not a workspace), so none take a workspaceId.

  /** The project's connectable Composio toolkits (those with an enabled auth
   * config). Since MUL-4009 the backend filters out non-connectable toolkits,
   * so every entry has `connectable: true`. A resolver/upstream failure is a
   * 502 rather than an empty list. */
  async listComposioToolkits(): Promise<ComposioToolkit[]> {
    return this.fetch(`/api/integrations/composio/toolkits`);
  }

  /** The caller's active Composio connections. */
  async listComposioConnections(): Promise<ComposioConnection[]> {
    return this.fetch(`/api/integrations/composio/connections`);
  }

  /** Starts a hosted Composio connect flow for a toolkit and returns the
   * redirect URL the browser should be sent to. */
  async beginComposioConnect(toolkitSlug: string): Promise<ComposioConnectInitResponse> {
    return this.fetch(`/api/integrations/composio/connect/init`, {
      method: "POST",
      body: JSON.stringify({ toolkit_slug: toolkitSlug }),
    });
  }

  /** Disconnects a Composio connection the caller owns. */
  async deleteComposioConnection(connectionId: string): Promise<void> {
    await this.fetch(`/api/integrations/composio/connections/${connectionId}`, {
      method: "DELETE",
    });
  }

  // Connected Apps (MUL-8516). Workspace-scoped: team accounts belong to the
  // workspace, personal accounts to the caller.

  async getAppsOverview(): Promise<AppsOverview> {
    const raw = await this.fetch<unknown>(`/api/apps`);
    return parseWithFallback(raw, AppsOverviewSchema, EMPTY_APPS_OVERVIEW, { endpoint: "GET /api/apps" });
  }

  /** The workspace's catalog; `view: "all"` (admins) lists every app with
   * whether the catalog allows it. */
  async listAppCatalog(view?: "all"): Promise<AppCatalogResponse> {
    const raw = await this.fetch<unknown>(`/api/apps/catalog${view ? `?view=${view}` : ""}`);
    return parseWithFallback(raw, AppCatalogResponseSchema, EMPTY_APP_CATALOG, { endpoint: "GET /api/apps/catalog" });
  }

  /** Starts connecting an account; the browser is sent to the returned URL
   * and comes back to `returnTo` (an app path) when given. */
  async connectApp(scope: AppAccountScope, toolkitSlug: string, returnTo?: string): Promise<ComposioConnectInitResponse> {
    const raw = await this.fetch<unknown>(`/api/apps/${scope}/connect`, {
      method: "POST",
      body: JSON.stringify({ toolkit_slug: toolkitSlug, ...(returnTo ? { return_to: returnTo } : {}) }),
    });
    const endpoint = `POST /api/apps/${scope}/connect`;
    const parsed = parseWithFallback<ComposioConnectInitResponse | null>(raw, AppConnectInitSchema, null, { endpoint });
    if (!parsed) throw new Error(`Malformed response from ${endpoint}`);
    return parsed;
  }

  async disconnectTeamApp(connectionId: string): Promise<void> {
    await this.fetch(`/api/apps/team/connections/${connectionId}`, { method: "DELETE" });
  }

  async getTeamAppImpact(toolkitSlug: string): Promise<TeamAppImpact> {
    const raw = await this.fetch<unknown>(`/api/apps/team/impact?toolkit_slug=${encodeURIComponent(toolkitSlug)}`);
    return parseWithFallback(raw, TeamAppImpactSchema, EMPTY_TEAM_APP_IMPACT, { endpoint: "GET /api/apps/team/impact" });
  }

  // Write responses parse to null when malformed; callers refetch instead of
  // caching a guess.

  async updateAppSettings(body: {
    catalog_mode: AppCatalogMode;
    allowed_toolkits?: string[];
  }): Promise<{ catalog_mode: AppCatalogMode; allowed_toolkits: string[] } | null> {
    const raw = await this.fetch<unknown>(`/api/apps/settings`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
    return parseWithFallback(raw, AppSettingsResponseSchema, null, { endpoint: "PUT /api/apps/settings" });
  }

  async listAppTools(toolkitSlug: string): Promise<{ tools: AppTool[] }> {
    const raw = await this.fetch<unknown>(`/api/apps/tools?toolkit_slug=${encodeURIComponent(toolkitSlug)}`);
    return parseWithFallback(raw, AppToolsResponseSchema, { tools: [] }, { endpoint: "GET /api/apps/tools" });
  }

  /** Corrects one tool's class; `null` restores the automatic class. */
  async updateAppToolClass(toolkitSlug: string, toolSlug: string, actionClass: AppActionClass | null): Promise<void> {
    await this.fetch(`/api/apps/tools/class`, {
      method: "PUT",
      body: JSON.stringify({ toolkit_slug: toolkitSlug, tool_slug: toolSlug, action_class: actionClass ?? "" }),
    });
  }

  async listIssueAppCalls(issueId: string): Promise<{ calls: IssueAppCall[] }> {
    const raw = await this.fetch<unknown>(`/api/app-calls?issue_id=${encodeURIComponent(issueId)}`);
    return parseWithFallback(raw, IssueAppCallsResponseSchema, { calls: [] }, { endpoint: "GET /api/app-calls" });
  }

  async getAppRules(toolkitSlug: string, scope: AppAccountScope): Promise<{ rules: AppRule[] }> {
    const raw = await this.fetch<unknown>(`/api/apps/rules?toolkit_slug=${encodeURIComponent(toolkitSlug)}&scope=${scope}`);
    return parseWithFallback(raw, AppRulesResponseSchema, { rules: [] }, { endpoint: "GET /api/apps/rules" });
  }

  async updateAppRules(
    toolkitSlug: string,
    scope: AppAccountScope,
    rules: { action_class: AppActionClass; policy: AppActionPolicy }[],
  ): Promise<{ rules: AppRule[] } | null> {
    const raw = await this.fetch<unknown>(`/api/apps/rules?toolkit_slug=${encodeURIComponent(toolkitSlug)}&scope=${scope}`, {
      method: "PUT",
      body: JSON.stringify({ rules }),
    });
    return parseWithFallback(raw, AppRulesResponseSchema, null, { endpoint: "PUT /api/apps/rules" });
  }

  async listAppActivity(toolkitSlug: string, scope: AppAccountScope): Promise<{ calls: AppToolCall[] }> {
    const raw = await this.fetch<unknown>(`/api/apps/activity?toolkit_slug=${encodeURIComponent(toolkitSlug)}&scope=${scope}`);
    return parseWithFallback(raw, AppActivityResponseSchema, { calls: [] }, { endpoint: "GET /api/apps/activity" });
  }

  async listAgentApps(agentId: string): Promise<{ apps: AgentApp[] }> {
    const raw = await this.fetch<unknown>(`/api/agents/${agentId}/apps`);
    return parseWithFallback(raw, AgentAppsResponseSchema, { apps: [] }, { endpoint: "GET /api/agents/:id/apps" });
  }

  async updateAgentApps(agentId: string, body: UpdateAgentAppsRequest): Promise<{ apps: AgentApp[] } | null> {
    const raw = await this.fetch<unknown>(`/api/agents/${agentId}/apps`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
    return parseWithFallback(raw, AgentAppsResponseSchema, null, { endpoint: "PUT /api/agents/:id/apps" });
  }

  /** Requests of an issue, of a chat, or (neither given) the caller's
   * pending ones. The first page holds every pending request and the newest
   * decided ones; `before` (a `next_before`) pages back through history. */
  async listAppRequests(
    params: { issueId?: string; chatSessionId?: string; before?: string } = {},
  ): Promise<AppRequestList> {
    const qs = new URLSearchParams();
    if (params.issueId) qs.set("issue_id", params.issueId);
    if (params.chatSessionId) qs.set("chat_session_id", params.chatSessionId);
    if (params.before) qs.set("before", params.before);
    const query = qs.toString();
    const raw = await this.fetch<unknown>(`/api/app-requests${query ? `?${query}` : ""}`);
    return parseWithFallback(raw, AppRequestListSchema, { requests: [], next_before: null }, {
      endpoint: "GET /api/app-requests",
    });
  }

  async approveAppRequest(requestId: string, args?: Record<string, unknown>): Promise<AppRequest | null> {
    const raw = await this.fetch<unknown>(`/api/app-requests/${requestId}/approve`, {
      method: "POST",
      body: JSON.stringify(args ? { arguments: args } : {}),
    });
    return parseWithFallback(raw, AppRequestSchema, null, { endpoint: "POST /api/app-requests/:id/approve" });
  }

  async rejectAppRequest(requestId: string, reason?: string): Promise<AppRequest | null> {
    const raw = await this.fetch<unknown>(`/api/app-requests/${requestId}/reject`, {
      method: "POST",
      body: JSON.stringify(reason ? { reason } : {}),
    });
    return parseWithFallback(raw, AppRequestSchema, null, { endpoint: "POST /api/app-requests/:id/reject" });
  }

  // Slack integration (MUL-3666)
  async listSlackInstallations(workspaceId: string): Promise<ListSlackInstallationsResponse> {
    return this.fetch(`/api/workspaces/${workspaceId}/slack/installations`);
  }

  // registerSlackBYO performs a bring-your-own-app install: the admin pastes the
  // bot token (xoxb-) + app-level token (xapp-) of the Slack app they created,
  // and the backend validates + persists it, returning the new installation.
  async registerSlackBYO(
    workspaceId: string,
    agentId: string,
    body: RegisterSlackBYORequest,
  ): Promise<SlackInstallation> {
    const search = new URLSearchParams({ agent_id: agentId });
    return this.fetch(`/api/workspaces/${workspaceId}/slack/install/byo?${search.toString()}`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  async deleteSlackInstallation(workspaceId: string, installationId: string): Promise<void> {
    await this.fetch(`/api/workspaces/${workspaceId}/slack/installations/${installationId}`, {
      method: "DELETE",
    });
  }

  async redeemSlackBindingToken(token: string): Promise<RedeemSlackBindingTokenResponse> {
    return this.fetch(`/api/slack/binding/redeem`, {
      method: "POST",
      body: JSON.stringify({ token }),
    });
  }

  // DingTalk integration
  async listDingTalkInstallations(
    workspaceId: string,
  ): Promise<ListDingTalkInstallationsResponse> {
    const raw = await this.fetch<unknown>(`/api/workspaces/${workspaceId}/dingtalk/installations`);
    return parseWithFallback(
      raw,
      ListDingTalkInstallationsResponseSchema,
      EMPTY_LIST_DINGTALK_INSTALLATIONS_RESPONSE,
      { endpoint: "GET /api/workspaces/:id/dingtalk/installations" },
    );
  }

  async listDingTalkGroups(
    workspaceId: string,
    params: ListDingTalkGroupsParams = {},
  ): Promise<ListDingTalkGroupsResponse> {
    let raw: unknown;
    try {
      const search = dingTalkGroupSearch(params);
      raw = await this.fetch<unknown>(`/api/workspaces/${workspaceId}/dingtalk/groups${search}`);
    } catch (error) {
      // Installed clients can be newer than the server they reconnect to. A
      // backend predating group discovery 404s this additive endpoint. The
      // first admin-only version returns 403 to members; both mean this client
      // cannot use the workspace inventory, while real failures stay visible.
      if (
        error instanceof ApiError &&
        (error.status === 404 || error.status === 403)
      ) {
        return EMPTY_LIST_DINGTALK_GROUPS_RESPONSE;
      }
      throw error;
    }
    return parseWithFallback(
      raw,
      ListDingTalkGroupsResponseSchema,
      EMPTY_LIST_DINGTALK_GROUPS_RESPONSE,
      { endpoint: "GET /api/workspaces/:id/dingtalk/groups" },
    );
  }

  async listAgentDingTalkGroups(
    agentId: string,
    params: ListDingTalkGroupsParams = {},
  ): Promise<ListDingTalkGroupsResponse> {
    let raw: unknown;
    try {
      const search = dingTalkGroupSearch(params);
      raw = await this.fetch<unknown>(`/api/agents/${agentId}/dingtalk/groups${search}`);
    } catch (error) {
      // Keep installed clients compatible with servers that predate agent-
      // scoped group discovery. Authorization failures must remain visible.
      if (error instanceof ApiError && error.status === 404) {
        return EMPTY_LIST_DINGTALK_GROUPS_RESPONSE;
      }
      throw error;
    }
    return parseWithFallback(
      raw,
      ListDingTalkGroupsResponseSchema,
      EMPTY_LIST_DINGTALK_GROUPS_RESPONSE,
      { endpoint: "GET /api/agents/:id/dingtalk/groups" },
    );
  }

  async forgetDingTalkGroup(
    workspaceId: string,
    installationId: string,
    conversationId: string,
  ): Promise<void> {
    await this.fetch(
      `/api/workspaces/${workspaceId}/dingtalk/installations/${installationId}/groups/${encodeURIComponent(conversationId)}`,
      { method: "DELETE" },
    );
  }

  // registerDingTalkBYO performs a bring-your-own-app install: the agent owner
  // or a workspace owner/admin pastes the AppKey (client id) + AppSecret
  // (client secret) of the DingTalk Stream-mode robot they created, and the
  // backend validates + persists it, returning the new installation.
  async registerDingTalkBYO(
    workspaceId: string,
    agentId: string,
    body: RegisterDingTalkBYORequest,
  ): Promise<DingTalkInstallation> {
    const search = new URLSearchParams({ agent_id: agentId });
    const raw = await this.fetch<unknown>(
      `/api/workspaces/${workspaceId}/dingtalk/install/byo?${search.toString()}`,
      {
        method: "POST",
        body: JSON.stringify(body),
      },
    );
    return parseWithFallback(raw, DingTalkInstallationSchema, EMPTY_DINGTALK_INSTALLATION, {
      endpoint: "POST /api/workspaces/:id/dingtalk/install/byo",
    });
  }

  async deleteDingTalkInstallation(workspaceId: string, installationId: string): Promise<void> {
    await this.fetch(`/api/workspaces/${workspaceId}/dingtalk/installations/${installationId}`, {
      method: "DELETE",
    });
  }

  async redeemDingTalkBindingToken(
    token: string,
  ): Promise<RedeemDingTalkBindingTokenResponse> {
    const raw = await this.fetch<unknown>(`/api/dingtalk/binding/redeem`, {
      method: "POST",
      body: JSON.stringify({ token }),
    });
    return parseWithFallback(
      raw,
      RedeemDingTalkBindingTokenResponseSchema,
      EMPTY_REDEEM_DINGTALK_BINDING_TOKEN_RESPONSE,
      { endpoint: "POST /api/dingtalk/binding/redeem" },
    );
  }
  // WeCom smart-bot ("智能机器人" / aibot) integration. The bot dials a
  // WebSocket long connection to wss://openws.work.weixin.qq.com and stays
  // authenticated with (bot_id, secret); no public callback URL is required.
  // These three methods drive the Settings-page BYO Connect dialog + list +
  // disconnect only — the inbound WebSocket loop runs entirely server-side.
  async listWecomInstallations(workspaceId: string): Promise<ListWecomInstallationsResponse> {
    const raw = await this.fetch<unknown>(`/api/workspaces/${workspaceId}/wecom/installations`);
    return parseWithFallback(
      raw,
      ListWecomInstallationsResponseSchema,
      EMPTY_LIST_WECOM_INSTALLATIONS_RESPONSE,
      { endpoint: "GET /api/workspaces/:id/wecom/installations" },
    );
  }

  // registerWecomBYO performs a bring-your-own-app install: the admin pastes
  // the bot id and long-connection secret from the WeCom admin console,
  // and the backend seals the secret with MULTICA_WECOM_SECRET_KEY before
  // persisting, returning the new installation.
  async registerWecomBYO(
    workspaceId: string,
    agentId: string,
    body: RegisterWecomBYORequest,
  ): Promise<WecomInstallation> {
    const search = new URLSearchParams({ agent_id: agentId });
    const raw = await this.fetch<unknown>(
      `/api/workspaces/${workspaceId}/wecom/install/byo?${search.toString()}`,
      {
        method: "POST",
        body: JSON.stringify(body),
      },
    );
    return parseWithFallback(raw, WecomInstallationSchema, EMPTY_WECOM_INSTALLATION, {
      endpoint: "POST /api/workspaces/:id/wecom/install/byo",
    });
  }

  // beginWecomInstall starts (or resumes) a scan-code install: the backend
  // hands back a session id, and the install worker fetches the QR from WeCom
  // out of band. Callers poll getWecomInstallStatus for the QR itself.
  //
  // idempotencyKey must be stable for one user gesture — a retried or
  // double-submitted request with the same key reuses the existing session
  // rather than burning a WeCom generate quota slot on a second QR.
  async beginWecomInstall(
    workspaceId: string,
    agentId: string,
    idempotencyKey: string,
  ): Promise<BeginWecomInstallResponse> {
    const search = new URLSearchParams({ agent_id: agentId });
    const raw = await this.fetch<unknown>(
      `/api/workspaces/${workspaceId}/wecom/install/begin?${search.toString()}`,
      {
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKey },
      },
    );
    return parseWithFallback(
      raw,
      BeginWecomInstallResponseSchema,
      MALFORMED_BEGIN_WECOM_INSTALL_RESPONSE,
      { endpoint: "POST /api/workspaces/:id/wecom/install/begin" },
    );
  }

  // getWecomInstallStatus is one poll of a scan-install session. The response
  // carries the QR while pending, and the installation id once bound.
  async getWecomInstallStatus(
    workspaceId: string,
    sessionId: string,
  ): Promise<WecomInstallStatusResponse> {
    const raw = await this.fetch<unknown>(
      `/api/workspaces/${workspaceId}/wecom/install/${sessionId}`,
    );
    return parseWithFallback(
      raw,
      WecomInstallStatusResponseSchema,
      MALFORMED_WECOM_INSTALL_STATUS_RESPONSE,
      { endpoint: "GET /api/workspaces/:id/wecom/install/:sessionId" },
    );
  }

  async deleteWecomInstallation(workspaceId: string, installationId: string): Promise<void> {
    await this.fetch(`/api/workspaces/${workspaceId}/wecom/installations/${installationId}`, {
      method: "DELETE",
    });
  }

  // redeemWecomBindingToken binds the WeCom aibot userid carried by the
  // token to the logged-in morechat.co user. Called by the /wecom/bind redeem
  // page after the user clicks through the "link your morechat.co account"
  // prompt the bot sent in WeCom. Status codes:
  //   410 Gone      → invalid / expired / already consumed
  //   409 Conflict  → the WeCom user is already bound to a different user
  //   403 Forbidden → the logged-in user is not a workspace member
  async redeemWecomBindingToken(token: string): Promise<RedeemWecomBindingTokenResponse> {
    const raw = await this.fetch<unknown>(`/api/wecom/binding/redeem`, {
      method: "POST",
      body: JSON.stringify({ token }),
    });
    return parseWithFallback(
      raw,
      RedeemWecomBindingTokenResponseSchema,
      EMPTY_REDEEM_WECOM_BINDING_TOKEN_RESPONSE,
      { endpoint: "POST /api/wecom/binding/redeem" },
    );
  }

  async listTelegramInstallations(
    workspaceId: string,
  ): Promise<ListTelegramInstallationsResponse> {
    const raw = await this.fetch<unknown>(`/api/workspaces/${workspaceId}/telegram/installations`);
    return parseWithFallback(
      raw,
      ListTelegramInstallationsResponseSchema,
      EMPTY_LIST_TELEGRAM_INSTALLATIONS_RESPONSE,
      { endpoint: "GET /api/workspaces/:id/telegram/installations" },
    );
  }

  async registerTelegramBot(
    workspaceId: string,
    agentId: string,
    body: RegisterTelegramRequest,
  ): Promise<TelegramInstallation> {
    const search = new URLSearchParams({ agent_id: agentId });
    const raw = await this.fetch<unknown>(
      `/api/workspaces/${workspaceId}/telegram/install?${search.toString()}`,
      {
        method: "POST",
        body: JSON.stringify(body),
      },
    );
    return parseWithFallback(raw, TelegramInstallationSchema, EMPTY_TELEGRAM_INSTALLATION, {
      endpoint: "POST /api/workspaces/:id/telegram/install",
    });
  }

  async deleteTelegramInstallation(workspaceId: string, installationId: string): Promise<void> {
    await this.fetch(`/api/workspaces/${workspaceId}/telegram/installations/${installationId}`, {
      method: "DELETE",
    });
  }

  async redeemTelegramBindingToken(token: string): Promise<RedeemTelegramBindingTokenResponse> {
    const raw = await this.fetch<unknown>(`/api/telegram/binding/redeem`, {
      method: "POST",
      body: JSON.stringify({ token }),
    });
    return parseWithFallback(
      raw,
      RedeemTelegramBindingTokenResponseSchema,
      EMPTY_REDEEM_TELEGRAM_BINDING_TOKEN_RESPONSE,
      { endpoint: "POST /api/telegram/binding/redeem" },
    );
  }
}
