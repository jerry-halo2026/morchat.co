import { z } from "zod";
import { normalizeIssueStatusCategory } from "../issues/config/status";
import type {
  AppCatalogResponse,
  AppsOverview,
  TeamAppImpact,
  WorkflowHandoffPreview,
  IssueWorkflow,
  IssueWorkflowDryRunResponse,
  IssueWorkflowHandlerType,
  ListIssueWorkflowsResponse,
  AgentBuilderRuntimeSwitch,
  AgentBuilderSession,
  AgentBuilderSessionSummary,
  Attachment,
  AutopilotRun,
  BillingBalance,
  BillingBatchesPage,
  BillingCheckoutSessionStatus,
  BillingPriceTier,
  BillingTopupsPage,
  BillingTransactionsPage,
  CancelTaskResponse,
  ChatMessage,
  ChatDraftRestoresResponse,
  ChatPendingTask,
  ChatSession,
  PrioritizeQueuedChatTaskResponse,
  SendChatMessageResponse,
  StartMikaOnboardingResponse,
  Comment,
  CreateBillingCheckoutSessionResponse,
  CreateBillingPortalSessionResponse,
  WorkspaceSubscriptionEntitlements,
  WorkspaceSubscriptionSummary,
  IssueLimitUsage,
  WorkspaceSubscriptionPrice,
  WorkspaceSubscriptionPrices,
  CreateWorkspaceSubscriptionCheckoutResponse,
  WorkspaceSubscriptionSeatReconcileResult,
  WorkspaceSeatPurchasePreview,
  PurchaseWorkspaceSeatsResponse,
  CreateWorkspaceSubscriptionPortalResponse,
  CronPreviewResponse,
  DingTalkInstallation,
  ListDingTalkInstallationsResponse,
  ListDingTalkGroupsResponse,
  RedeemDingTalkBindingTokenResponse,
  WecomInstallation,
  ListLarkInstallationsResponse,
  ListWecomInstallationsResponse,
  BeginWecomInstallResponse,
  WecomInstallStatusResponse,
  RedeemWecomBindingTokenResponse,
  TelegramInstallation,
  ListTelegramInstallationsResponse,
  RedeemTelegramBindingTokenResponse,
  GroupedIssuesResponse,
  GitHubConnectResponse,
  IssuePullRequestsResponse,
  IssueEnvironmentsResponse,
  InboxItem,
  InboxWorkspaceUnread,
  IssueUnread,
  Label,
  Project,
  ListProjectsResponse,
  MemberWithUser,
  IssueProperty,
  ListPropertiesResponse,
  QuickAction,
  ListQuickActionsResponse,
  IssuePropertiesResponse,
  IssueTableGroupDescriptor,
  IssueTableFacetsResponse,
  IssueTableGroupsResponse,
  IssueTableRowsResponse,
  ListIssuesResponse,
  ListGitHubInstallationsResponse,
  ListGitHubRepositoriesResponse,
  ListLabelsResponse,
  ListWebhookDeliveriesResponse,
  DeleteDepartmentResponse,
  Department,
  ListDepartmentsResponse,
  IssueStatusEntry,
  ListIssueStatusesResponse,
  NotificationPreferenceResponse,
  PluginInstallation,
  PluginInstallationListResponse,
  PluginPackage,
  PluginPackageListResponse,
  PluginPreview,
  PluginSurfaceLaunch,
  ResourceLabelsResponse,
  RuntimeModelListRequest,
  SearchIssuesResponse,
  SearchProjectsResponse,
  ShareLink,
  ShareLinkInfo,
  Skill,
  SkillImportResult,
  SkillSummary,
  SkillVersion,
  SkillVersionSummary,
  Squad,
  TimelineEntry,
  User,
  WebhookDelivery,
  WorkspaceMcpServer,
  Creator,
  CreatorListResponse,
  CreatorPost,
  CreatorPostListResponse,
  CreatorPostMetric,
  CreatorPostMetricListResponse,
  CreatorHealth,
  CreatorHealthDetailResponse,
  CreatorHealthListResponse,
  CreatorMetric,
  CreatorVideo,
  CreatorVideoListResponse,
  CrmClient,
  CrmClientListResponse,
  CrmBrief,
  CrmBriefListResponse,
  CrmCollab,
  CrmCollabListResponse,
  CrmSettlement,
  CrmSettlementListResponse,
  // BD pipeline (WORKBENCH-API 搂20): follow-ups, quotes, campaigns and the
  // 椹鹃┒鑸?aggregate. 搂22 adds the windowed performance report.
  BdActivity,
  BdActivityListResponse,
  BdCampaign,
  BdCampaignListResponse,
  BdPerformance,
  BdPipeline,
  BdQuote,
  BdQuoteListResponse,
  WorkbenchCountsResponse,
  WorkbenchThread,
  WorkbenchFinanceMonth,
  WorkbenchFinanceMonthListResponse,
  WorkbenchFinanceResponse,
  // Batch CSV import (WORKBENCH-API §23).
  ImportPreviewResponse,
  // Capabilities (WORKBENCH-API §24).
  WorkbenchCapabilitiesResponse,
  WorkbenchRoleTemplate,
  WorkbenchRoleTemplateListResponse,
  // The review queue (WORKBENCH-API §26).
  ReviewQueueResponse,
} from "../types";
import type { CloudRuntimeNode } from "../runtimes/cloud-runtime";
import type { CreateFeedbackResponse } from "../feedback/types";
// The HR block is imported from its own module rather than the `../types`
// barrel so this file does not depend on the barrel re-exporting it.
import type {
  HrCandidate,
  HrCandidateListResponse,
  HrEmployeeProfile,
  HrEmployeeProfileListResponse,
  HrInterview,
  HrInterviewListResponse,
  HrJob,
  HrJobListResponse,
  HrScorecard,
  HrScorecardListResponse,
} from "../types/workbench";
// The affiliate block (搂11) comes from the same module, for the same reason.
import type {
  AffiliateDaily,
  AffiliateDailyListResponse,
  AffiliatePick,
  AffiliatePickListResponse,
  AffiliateProduct,
  AffiliateProductListResponse,
  AffiliateSettlement,
  AffiliateSettlementListResponse,
  AffiliateSummaryResponse,
} from "../types/workbench";
// Content workbench (搂12) has its own module (types/media.ts) rather than living
// in the commerce barrel: the content pipeline is a separate domain with its own
// frozen artifact contract.
import type {
  MediaBench,
  MediaBenchListResponse,
  MediaHot,
  MediaHotListResponse,
  MediaIP,
  MediaIPAccount,
  MediaIPDetail,
  MediaIPListResponse,
  MediaScores,
  MediaScript,
  MediaScriptListResponse,
  MediaShoot,
  MediaShootListResponse,
  MediaTopic,
  MediaTopicListResponse,
} from "../types/media";
// General manager workbench (搂13): its own module (types/goal.ts) for the same
// reason 鈥?OKR and radar are a separate domain, not more commerce rows.
import type {
  Goal,
  GoalDetail,
  GoalIssue,
  GoalKeyResult,
  GoalListResponse,
  GoalPackage,
  MarketSignal,
  MarketSignalConvertResponse,
  MarketSignalListResponse,
} from "../types/goal";
// Interview questions and guides (搂14): its own module (types/guide.ts), because a
// guide's `items` is a snapshot document with rules of its own.
import type {
  HrGuideGenerateResponse,
  HrGuideItem,
  HrGuideListResponse,
  HrInterviewGuide,
  HrQuestion,
  HrQuestionListResponse,
} from "../types/guide";
// Offboarding (搂15): its own module (types/offboard.ts), because the record is a
// state machine 鈥?`status` moves through advance/cancel, never through a PATCH 鈥?
// and the `done` step writes the employee's `leave_date`.
import type {
  HrHandoverItem,
  HrOffboarding,
  HrOffboardingAdvanceResponse,
  HrOffboardingEmployee,
  HrOffboardingListResponse,
} from "../types/offboard";
// Employee file change stream (搂16): its own module (types/change.ts), because an
// append-only event list is a different contract from the profile it describes 鈥?
// `PATCH` accepts `note` and nothing else.
import type {
  HrEmployeeChange,
  HrEmployeeChangeListResponse,
} from "../types/change";
// Rewards and disciplines (搂17): its own module (types/reward.ts), because the
// stored `amount` is always positive and `kind` carries the direction.
import type {
  HrEmployeeReward,
  HrEmployeeRewardListResponse,
} from "../types/reward";
// HR documents (搂18): its own module (types/doc.ts). The generated file is a
// different contract from the profile it is about 鈥?the values are a snapshot, an
// unknown placeholder is kept rather than blanked, and a builtin template is
// read-only.
import type {
  CreateHrDocGenerationResponse,
  HrDocGeneration,
  HrDocGenerationListResponse,
  HrDocTemplate,
  HrDocTemplateListResponse,
} from "../types/doc";

export const PluginConfigFieldSchema = z.object({
  key: z.string(),
  type: z.string().default("string"),
  label: z.string().default(""),
  description: z.string().optional(),
  required: z.boolean().default(false),
  options: z.array(z.string()).default([]),
  placeholder: z.string().optional(),
  multiline: z.boolean().default(false),
}).loose();

export const PluginSurfaceSchema = z.object({
  key: z.string(),
  type: z.string().default(""),
  name: z.string().default(""),
  entry: z.string().default(""),
  platforms: z.array(z.string()).default([]),
}).loose();

export const PluginHookSchema = z.object({
  key: z.string(),
  name: z.string().default(""),
  description: z.string().default(""),
  triggers: z.array(z.string()).default([]),
  events: z.array(z.string()).default([]),
  schedule: z.object({
    cron: z.string().default(""),
    timezone: z.string().default(""),
    next_run_at: z.string().optional(),
  }).loose().optional(),
  transport: z.string().default(""),
}).loose();

export const PluginResourceSchema = z.object({
  type: z.string().default(""),
  key: z.string(),
  entry: z.string().default(""),
}).loose();

export const PluginInstallationSchema = z.object({
  id: z.string(),
  plugin_key: z.string().default(""),
  name: z.string().default(""),
  description: z.string().optional(),
  version: z.string().default(""),
  package_version_id: z.string().default(""),
  enabled: z.boolean().default(false),
  granted_scopes: z.array(z.string()).default([]),
  config_schema: z.array(PluginConfigFieldSchema).default([]),
  config: z.record(z.string(), z.unknown()).default({}),
  configured_secrets: z.array(z.string()).default([]),
  surfaces: z.array(PluginSurfaceSchema).default([]),
  hooks: z.array(PluginHookSchema).default([]),
  resources: z.array(PluginResourceSchema).default([]),
  created_at: z.string().default(""),
  updated_at: z.string().default(""),
}).loose();

export const EMPTY_PLUGIN_INSTALLATION: PluginInstallation = {
  id: "",
  plugin_key: "",
  name: "",
  version: "",
  package_version_id: "",
  enabled: false,
  granted_scopes: [],
  config_schema: [],
  config: {},
  configured_secrets: [],
  surfaces: [],
  hooks: [],
  resources: [],
  created_at: "",
  updated_at: "",
};

export const PluginInstallationListResponseSchema = z.object({
  plugins: z.array(PluginInstallationSchema).default([]),
}).loose();

export const EMPTY_PLUGIN_INSTALLATION_LIST: PluginInstallationListResponse = {
  plugins: [],
};

/**
 * One completed hook call. `status` is the host's classification, not the
 * endpoint's: "refused" means we declined to make the call at all, which is a
 * different problem for the reader than an endpoint that answered badly.
 */
export const PluginHookResultSchema = z.object({
  status: z.string().default("ok"),
  output: z.unknown().optional(),
  error: z.string().optional(),
  latency_ms: z.number().default(0),
  hook_key: z.string().default(""),
  trigger: z.string().default(""),
  attempts: z.number().default(1),
}).loose();

export const PluginInvocationSchema = z.object({
  id: z.string().default(""),
  hook_key: z.string().default(""),
  trigger: z.string().default(""),
  status: z.string().default(""),
  event_type: z.string().optional(),
  attempt: z.number().default(1),
  latency_ms: z.number().default(0),
  error: z.string().optional(),
  delivery_id: z.string().optional(),
  planned_at: z.string().optional(),
  created_at: z.string().default(""),
}).loose();

export const PluginInvocationListSchema = z.object({
  invocations: z.array(PluginInvocationSchema).default([]),
}).loose();

/**
 * Returned once, by the request that minted it. There is no read endpoint for
 * either value, so a client that discards this cannot recover it.
 */
export const PluginTokenIssueSchema = z.object({
  token: z.string().default(""),
  signing_secret: z.string().default(""),
}).loose();

/**
 * Discovered tools for one `mcp`-transport hook.
 *
 * Defaults matter here in the usual direction: an unparseable response yields
 * an EMPTY list and nothing approved, so a drifted backend cannot make the UI
 * render a tool as already-approved.
 */
export const PluginMCPToolSchema = z.object({
  name: z.string().default(""),
  description: z.string().default(""),
  schema_digest: z.string().default(""),
  approved: z.boolean().default(false),
  drifted: z.boolean().default(false),
}).loose();

export const PluginMCPToolListSchema = z.object({
  tools: z.array(PluginMCPToolSchema).default([]),
}).loose();

export const PluginManifestSummarySchema = z.object({
  key: z.string().default(""),
  name: z.string().default(""),
  description: z.string().optional(),
  version: z.string().default(""),
  author: z.object({
    name: z.string().default(""),
    url: z.string().optional(),
  }).loose().default({ name: "" }),
  contributes: z.object({
    hooks: z.array(z.object({
      key: z.string().default(""),
      name: z.string().default(""),
      triggers: z.array(z.string()).default([]),
      schedule: z.object({
        cron: z.string().default(""),
        timezone: z.string().default(""),
      }).loose().optional(),
    }).loose()).default([]),
  }).loose().optional(),
}).loose();

export const PluginPreviewSchema = z.object({
  manifest: PluginManifestSummarySchema,
  scopes: z.array(z.string()).default([]),
  config_schema: z.array(PluginConfigFieldSchema).default([]),
  version_id: z.string().default(""),
  version: z.string().default(""),
  digest: z.string().default(""),
  installed: z.boolean().default(false),
  installed_version: z.string().optional(),
  added_scopes: z.array(z.string()).default([]),
}).loose();

export const EMPTY_PLUGIN_PREVIEW: PluginPreview = {
  manifest: { key: "", name: "", version: "", author: { name: "" } },
  scopes: [],
  config_schema: [],
  version_id: "",
  version: "",
  digest: "",
  installed: false,
  added_scopes: [],
};

/**
 * A published version. `installed` is the marker the settings page reads to
 * answer "which one am I on"; it defaults to false so a malformed response can
 * never claim a version is running that is not.
 */
export const PluginPackageVersionSchema = z.object({
  id: z.string().default(""),
  version: z.string().default(""),
  digest: z.string().default(""),
  size_bytes: z.number().default(0),
  published_at: z.string().default(""),
  installed: z.boolean().default(false),
}).loose();

export const PluginPackageSchema = z.object({
  id: z.string().default(""),
  plugin_key: z.string().default(""),
  name: z.string().default(""),
  versions: z.array(PluginPackageVersionSchema).default([]),
  created_at: z.string().default(""),
}).loose();

export const PluginPackageListResponseSchema = z.object({
  packages: z.array(PluginPackageSchema).default([]),
}).loose();

export const EMPTY_PLUGIN_PACKAGE_LIST: PluginPackageListResponse = {
  packages: [],
};

export const EMPTY_PLUGIN_PACKAGE: PluginPackage = {
  id: "",
  plugin_key: "",
  name: "",
  versions: [],
  created_at: "",
};

/** A malformed launch becomes unavailable, never a partly trusted frame. */
export const PluginSurfaceLaunchSchema = z.object({
  url: z.string().default(""),
  bridge_token: z.string().default(""),
  version: z.string().default(""),
  digest: z.string().default(""),
}).loose();

export const EMPTY_PLUGIN_SURFACE_LAUNCH: PluginSurfaceLaunch = {
  url: "",
  bridge_token: "",
  version: "",
  digest: "",
};

export const GitHubInstallationSchema = z.object({
  id: z.string(),
  workspace_id: z.string(),
  installation_id: z.number().optional(),
  account_login: z.string(),
  account_type: z.string(),
  account_avatar_url: z.string().nullable(),
  created_at: z.string(),
  connected_by: z.string().optional(),
}).loose();

export const ListGitHubInstallationsResponseSchema = z.object({
  installations: z.array(GitHubInstallationSchema).default([]),
  configured: z.boolean().optional().default(false),
  repository_browse_configured: z.boolean().optional().default(false),
  can_manage: z.boolean().optional().default(false),
}).loose();

export const EMPTY_LIST_GITHUB_INSTALLATIONS_RESPONSE: ListGitHubInstallationsResponse = {
  installations: [],
  configured: false,
  repository_browse_configured: false,
  can_manage: false,
};

export const GitHubConnectResponseSchema = z.object({
  url: z.string().optional(),
  configured: z.boolean().optional().default(false),
}).loose();

export const EMPTY_GITHUB_CONNECT_RESPONSE: GitHubConnectResponse = {
  configured: false,
};

export const GitHubRepositorySchema = z.object({
  id: z.number(),
  full_name: z.string(),
  html_url: z.string(),
  clone_url: z.string(),
  description: z.string().nullable(),
  private: z.boolean(),
  archived: z.boolean(),
  default_branch: z.string(),
}).loose();

export const ListGitHubRepositoriesResponseSchema = z.object({
  repositories: z.array(GitHubRepositorySchema).default([]),
  total_count: z.number().optional().default(0),
  next_page: z.number().nullable().optional().default(null),
}).loose();

export const EMPTY_LIST_GITHUB_REPOSITORIES_RESPONSE: ListGitHubRepositoriesResponse = {
  repositories: [],
  total_count: 0,
  next_page: null,
};

export const GitHubPullRequestSchema = z.object({
  id: z.string(),
  provider: z.string().optional().default("github"),
  workspace_id: z.string(),
  repo_owner: z.string(),
  repo_name: z.string(),
  number: z.number(),
  title: z.string(),
  state: z.string(),
  html_url: z.string(),
  branch: z.string().nullable(),
  author_login: z.string().nullable(),
  author_avatar_url: z.string().nullable(),
  merged_at: z.string().nullable(),
  closed_at: z.string().nullable(),
  pr_created_at: z.string(),
  pr_updated_at: z.string(),
  link_source: z.enum(["manual", "title", "branch", "auto"]).optional().catch(undefined),
  mergeable: z.string().nullable().optional(),
  merge_state_status: z.string().nullable().optional(),
  snapshot_available: z.boolean().optional(),
  checks_rollup: z.string().nullable().optional(),
  checks_conclusion: z.string().nullable().optional(),
  checks_total: z.number().optional().default(0),
  checks_passed: z.number().optional().default(0),
  checks_failed: z.number().optional().default(0),
  checks_running: z.number().optional().default(0),
  checks_pending: z.number().optional().default(0),
  failed_check_names: z.array(z.string()).optional().default([]),
  snapshot_stale: z.boolean().optional().default(false),
  snapshot_fetched_at: z.string().nullable().optional(),
  mergeable_state: z.string().nullable().optional(),
  additions: z.number().optional().default(0),
  deletions: z.number().optional().default(0),
  changed_files: z.number().optional().default(0),
}).loose();

// A malformed auto_complete block degrades to null (the issue page shows no
// automation line) instead of discarding the PR list with it.
export const PRAutoCompleteSchema = z.object({
  state: z.string(),
  pull_request_ids: z.array(z.string()).default([]),
  issue_disabled: z.boolean().default(false),
  workspace_enabled: z.boolean().default(true),
  target_status: z.string().optional().catch(undefined),
}).loose();

export const IssuePullRequestsResponseSchema = z.object({
  pull_requests: z.array(GitHubPullRequestSchema).default([]),
  auto_complete: PRAutoCompleteSchema.nullable().optional().default(null).catch(null),
}).loose();

export const EMPTY_ISSUE_PULL_REQUESTS_RESPONSE: IssuePullRequestsResponse = {
  pull_requests: [],
  auto_complete: null,
};

// One malformed environment drops out of the list instead of taking the
// whole section with it; an unknown state from a newer server reads as
// unreachable, which offers no Open action.
export const IssueEnvironmentSchema = z.object({
  id: z.string(),
  issue_id: z.string(),
  task_id: z.string(),
  runtime_id: z.string().nullable().optional().default(null),
  agent_id: z.string().nullable().optional().default(null),
  source: z.enum(["config", "detected"]).catch("detected"),
  name: z.string(),
  label: z.string().optional().default(""),
  url: z.string().optional().default(""),
  port: z.number().nullable().optional().default(null),
  state: z.enum(["starting", "running", "exited", "stopped", "unreachable"]).catch("unreachable"),
  detail: z.string().optional().default(""),
  started_at: z.string(),
  expires_at: z.string().nullable().optional().default(null),
  last_seen_at: z.string(),
  ended_at: z.string().nullable().optional().default(null),
}).loose();

export const IssueEnvironmentsResponseSchema = z.object({
  environments: z
    .array(z.unknown())
    .default([])
    .transform((items) =>
      items.flatMap((item) => {
        const parsed = IssueEnvironmentSchema.safeParse(item);
        return parsed.success ? [parsed.data] : [];
      }),
    ),
}).loose();

export const EMPTY_ISSUE_ENVIRONMENTS_RESPONSE: IssueEnvironmentsResponse = {
  environments: [],
};

// Label responses are consumed by settings tables and resource pickers. Keep
// the resource type lenient so newer server scopes do not break older clients,
// while defaulting fields that predate scoped label catalogs.
export const LabelSchema = z.object({
  id: z.string(),
  workspace_id: z.string(),
  resource_type: z.string().optional().default("issue"),
  name: z.string(),
  description: z.string().optional().default(""),
  color: z.string(),
  usage_count: z.number().optional().default(0),
  created_at: z.string(),
  updated_at: z.string(),
}).loose();

export const EMPTY_LABEL: Label = {
  id: "",
  workspace_id: "",
  resource_type: "issue",
  name: "",
  description: "",
  color: "#6b7280",
  usage_count: 0,
  created_at: "",
  updated_at: "",
};

export const ListLabelsResponseSchema = z.object({
  labels: z.array(LabelSchema).default([]),
  total: z.number().default(0),
}).loose();

export const EMPTY_LIST_LABELS_RESPONSE: ListLabelsResponse = {
  labels: [],
  total: 0,
};

// Issue status catalog (MUL-6243). `category` is parsed as a plain string
// rather than an enum: a newer server could in principle report a category this
// build does not know, and failing the whole catalog parse would leave the UI
// with no statuses at all. Consumers fall back to rendering by `color`/`name`
// when they do not recognize a category.
export const IssueStatusEntrySchema = z.object({
  id: z.string(),
  workspace_id: z.string(),
  key: z.string(),
  name: z.string(),
  description: z.string().optional().default(""),
  category: z.string().transform((value) => normalizeIssueStatusCategory(value) ?? value),
  color: z.string().optional().default("#6b7280"),
  icon: z.string().nullable().optional(),
  is_system: z.boolean().optional().default(false),
  position: z.number().optional().default(0),
  archived_at: z.string().nullable().optional().default(null),
  created_at: z.string(),
  updated_at: z.string(),
}).loose();

export const EMPTY_ISSUE_STATUS_ENTRY: IssueStatusEntry = {
  id: "",
  workspace_id: "",
  key: "",
  name: "",
  description: "",
  category: "unstarted",
  color: "#6b7280",
  is_system: false,
  position: 0,
  archived_at: null,
  created_at: "",
  updated_at: "",
};

export const ListIssueStatusesResponseSchema = z.object({
  statuses: z.array(IssueStatusEntrySchema).default([]),
  categories: z.array(z.string()).default([]).transform((values) => [...new Set(values.map((value) => normalizeIssueStatusCategory(value) ?? value))]),
  total: z.number().default(0),
}).loose();

// The fallback carries the four lifecycle categories. Concrete built-in status
// keys remain available through the status configuration.
export const EMPTY_LIST_ISSUE_STATUSES_RESPONSE: ListIssueStatusesResponse = {
  statuses: [],
  categories: ["unstarted", "started", "done", "closed"],
  total: 0,
};

// Workspace workflows (MUL-7420). Handler types parse as plain strings and an
// unknown one degrades to "none": a newer server may add a handler this build
// cannot render, and the step's status must still show.
const IssueWorkflowHandlerSchema = z.object({
  type: z.string().transform((value): IssueWorkflowHandlerType =>
    ISSUE_WORKFLOW_HANDLER_TYPES.has(value) ? (value as IssueWorkflowHandlerType) : "none",
  ),
  id: z.string().optional(),
}).loose();

const ISSUE_WORKFLOW_HANDLER_TYPES = new Set<string>([
  "none", "agent", "squad", "member", "project_lead", "creator",
]);

const IssueWorkflowStepSchema = z.object({
  status_key: z.string(),
  handler: IssueWorkflowHandlerSchema.default({ type: "none" }),
  instructions: z.string().default(""),
  next_status_key: z.string().optional(),
  back_status_key: z.string().optional(),
}).loose();

export const IssueWorkflowSchema = z.object({
  id: z.string(),
  workspace_id: z.string(),
  name: z.string(),
  description: z.string().default(""),
  is_default: z.boolean().default(false),
  owner_id: z.string().nullable().default(null),
  steps: z.array(IssueWorkflowStepSchema).default([]),
  project_ids: z.array(z.string()).default([]),
  created_at: z.string(),
  updated_at: z.string(),
}).loose();

export const ListIssueWorkflowsResponseSchema = z.object({
  workflows: z.array(IssueWorkflowSchema).default([]),
  total: z.number().default(0),
}).loose();

export const EMPTY_LIST_ISSUE_WORKFLOWS_RESPONSE: ListIssueWorkflowsResponse = {
  workflows: [],
  total: 0,
};

export const EMPTY_ISSUE_WORKFLOW: IssueWorkflow = {
  id: "",
  workspace_id: "",
  name: "",
  description: "",
  is_default: false,
  owner_id: null,
  steps: [],
  project_ids: [],
  created_at: "",
  updated_at: "",
};

export const IssueWorkflowMappingPlanSchema = z.object({
  required: z.array(z.object({
    status_key: z.string(),
    issue_count: z.number().default(0),
    suggested_status_key: z.string().default(""),
  }).loose()).default([]),
  unchanged: z.array(z.object({
    status_key: z.string(),
    issue_count: z.number().default(0),
  }).loose()).default([]),
  total_issues: z.number().default(0),
  affected_issues: z.number().default(0),
}).loose();

export const IssueWorkflowDryRunResponseSchema = z.object({
  dry_run: z.literal(true).default(true),
  plan: IssueWorkflowMappingPlanSchema.default({ required: [], unchanged: [], total_issues: 0, affected_issues: 0 }),
}).loose();

export const EMPTY_ISSUE_WORKFLOW_DRY_RUN: IssueWorkflowDryRunResponse = {
  dry_run: true,
  plan: { required: [], unchanged: [], total_issues: 0, affected_issues: 0 },
};

export const IssueWorkflowBriefPreviewSchema = z.object({
  brief: z.string().default(""),
}).loose();

const HANDOFF_HANDLER_TYPES = new Set(["agent", "squad", "member"]);

export const WorkflowHandoffPreviewSchema = z.object({
  handoff: z.boolean().default(false),
  workflow_name: z.string().default(""),
  from_status: z.string().default(""),
  to_status: z.string().default(""),
  handler_type: z.string().optional().transform((value): WorkflowHandoffPreview["handler_type"] =>
    value && HANDOFF_HANDLER_TYPES.has(value) ? (value as "agent" | "squad" | "member") : null,
  ),
  handler_id: z.string().nullable().optional().transform((value) => value || null),
  previous_assignee_type: z.string().nullable().default(null),
  previous_assignee_id: z.string().nullable().default(null),
  previous_runs: z.array(z.object({
    task_id: z.string(),
    agent_id: z.string(),
    status: z.string().default(""),
    started_at: z.string().nullable().default(null),
  }).loose()).default([]),
  brief: z.string().default(""),
}).loose();

// A preview the client cannot read says "no handoff": the write path still
// applies the workflow, it only loses the confirmation.
export const EMPTY_WORKFLOW_HANDOFF_PREVIEW: WorkflowHandoffPreview = {
  handoff: false,
  workflow_name: "",
  from_status: "",
  to_status: "",
  handler_type: null,
  handler_id: null,
  previous_assignee_type: null,
  previous_assignee_id: null,
  previous_runs: [],
  brief: "",
};

export const ResourceLabelsResponseSchema = z.object({
  labels: z.array(LabelSchema).default([]),
  issue_revision: z.number().int().positive().optional(),
}).loose();

export const EMPTY_RESOURCE_LABELS_RESPONSE: ResourceLabelsResponse = {
  labels: [],
};

// Saved issue views (MUL-4796). `query`/`display` are opaque definition
// blobs interpreted client-side per `definition_version` 鈥?keep them as
// loose records so newer servers can add fields freely. `scope_type` /
// `visibility` stay lenient strings; downstream code uses explicit `===`
// comparisons and default branches per the API-compat rules.
export const IssueViewSchema = z.object({
  id: z.string(),
  workspace_id: z.string().default(""),
  owner_id: z.string().default(""),
  name: z.string().default(""),
  scope_type: z.string().default("workspace"),
  scope_id: z.string().nullish(),
  scope_variant: z.string().nullish(),
  visibility: z.string().default("private"),
  definition_version: z.number().default(1),
  query: z.record(z.string(), z.unknown()).default({}),
  display: z.record(z.string(), z.unknown()).default({}),
  revision: z.number().default(1),
  created_at: z.string().default(""),
  updated_at: z.string().default(""),
}).loose();

export type IssueView = z.infer<typeof IssueViewSchema>;

export const IssueViewListSchema = z.array(IssueViewSchema);

export const IssueViewPreferenceSchema = z.object({
  scope_type: z.string().default("workspace"),
  scope_id: z.string().nullish(),
  prefs: z.object({
    hidden: z.array(z.string()).default([]),
    order: z.array(z.string()).default([]),
  }).loose().default({ hidden: [], order: [] }),
  updated_at: z.string().default(""),
}).loose();

export type IssueViewPreference = z.infer<typeof IssueViewPreferenceSchema>;

export const EMPTY_ISSUE_VIEW_PREFERENCE: IssueViewPreference = {
  scope_type: "workspace",
  scope_id: null,
  prefs: { hidden: [], order: [] },
  updated_at: "",
};

/**
 * The `sidebar_projects` preference document. Another client version may have
 * saved values this one does not know; every field that does not parse comes
 * out undefined so the caller's default stands in for it.
 */
export const SidebarProjectPrefsDocSchema = z.object({
  projects: z.object({
    ordering: z.enum(["manual", "name", "updated", "created"]).optional().catch(undefined),
    statuses: z.array(z.string()).optional().catch(undefined),
    onlyMine: z.boolean().optional().catch(undefined),
    showCount: z.boolean().optional().catch(undefined),
  }).catch({}),
  issues: z.object({
    sortBy: z.enum(["updated_at", "created_at", "priority", "status", "title", "due_date"]).optional().catch(undefined),
    sortDirection: z.enum(["asc", "desc"]).optional().catch(undefined),
    hiddenStatuses: z.array(z.string()).nullable().optional().catch(undefined),
    assignee: z.enum(["anyone", "me", "my_agents", "me_and_my_agents"]).optional().catch(undefined),
    showSubIssues: z.boolean().optional().catch(undefined),
  }).catch({}),
  order: z.array(z.unknown()).catch([]).transform((ids) => ids.filter((id): id is string => typeof id === "string")),
});

export type SidebarProjectPrefsDoc = z.infer<typeof SidebarProjectPrefsDocSchema>;

export interface CreateIssueViewRequest {
  name: string;
  scope_type: "workspace" | "my" | "project";
  scope_id?: string | null;
  scope_variant?: "assigned" | "created" | "involved" | "any" | "members" | "agents" | null;
  visibility: "private" | "workspace";
  definition_version: number;
  query: Record<string, unknown>;
  display: Record<string, unknown>;
}

// Custom property definitions. `type` stays a lenient string so newer server
// types don't break installed clients; UI narrows with isKnownPropertyType.
export const IssuePropertySchema = z.object({
  id: z.string(),
  workspace_id: z.string(),
  name: z.string(),
  type: z.string(),
  description: z.string().optional().default(""),
  icon: z.string().optional().default(""),
  config: z.object({
    options: z.array(z.object({
      id: z.string(),
      name: z.string(),
      color: z.string().optional().default("#6b7280"),
    }).loose()).optional(),
  }).loose().default({}),
  position: z.number().optional().default(0),
  archived: z.boolean().optional().default(false),
  archived_at: z.string().nullable().optional(),
  usage_count: z.number().optional().default(0),
  created_at: z.string(),
  updated_at: z.string(),
}).loose();

export const EMPTY_ISSUE_PROPERTY: IssueProperty = {
  id: "",
  workspace_id: "",
  name: "",
  type: "text",
  description: "",
  icon: "",
  config: {},
  position: 0,
  archived: false,
  usage_count: 0,
  created_at: "",
  updated_at: "",
};

// Quick actions (MUL-5465). `visibility` and `status` stay z.string() rather
// than z.enum: they are server-driven, and a newer server adding a value must
// degrade to the UI's default branch, not blank the whole list.
export const QuickActionSchema = z.object({
  id: z.string(),
  workspace_id: z.string(),
  name: z.string(),
  description: z.string().optional().default(""),
  assignee_type: z.string(),
  assignee_id: z.string(),
  prompt: z.string().optional().default(""),
  visibility: z.string().optional().default("public"),
  status: z.string().optional().default("active"),
  last_used_at: z.string().nullable().optional().default(null),
  use_count: z.number().optional().default(0),
  created_by_id: z.string().optional().default(""),
  created_at: z.string(),
  updated_at: z.string(),
  target_name: z.string().optional(),
  // Both default to the pessimistic reading on an older server: "not known to
  // be public" and "not known to be missing" keep the settings row honest
  // rather than asserting a state the server never sent.
  target_public: z.boolean().optional().default(false),
  target_missing: z.boolean().optional().default(false),
}).loose();

export const EMPTY_QUICK_ACTION: QuickAction = {
  id: "",
  workspace_id: "",
  name: "",
  description: "",
  assignee_type: "agent",
  assignee_id: "",
  prompt: "",
  visibility: "public",
  status: "active",
  last_used_at: null,
  use_count: 0,
  created_by_id: "",
  created_at: "",
  updated_at: "",
  target_public: false,
  target_missing: true,
};

export const ListQuickActionsResponseSchema = z.object({
  quick_actions: z.array(QuickActionSchema).default([]),
}).loose();

export const EMPTY_LIST_QUICK_ACTIONS_RESPONSE: ListQuickActionsResponse = {
  quick_actions: [],
};

export const QuickActionRenderSchema = z.object({
  content: z.string().default(""),
}).loose();

export const ListPropertiesResponseSchema = z.object({
  properties: z.array(IssuePropertySchema).default([]),
  total: z.number().default(0),
}).loose();

export const EMPTY_LIST_PROPERTIES_RESPONSE: ListPropertiesResponse = {
  properties: [],
  total: 0,
};

// Value bag: keyed by definition UUID; values are primitives or string
// arrays (multi_select). The preprocess step drops entries with unknown
// shapes BEFORE validation 鈥?a newer server shipping an object-shaped value
// (future actor/relation types) must degrade to "that one property missing",
// never fail the whole IssueSchema and blank the list via parseWithFallback.
export const IssuePropertyValuesSchema = z.preprocess(
  (raw) => {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(raw)) {
      const ok =
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean" ||
        (Array.isArray(value) && value.every((item) => typeof item === "string"));
      if (ok) out[key] = value;
    }
    return out;
  },
  z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.array(z.string())])).default({}),
);

export const IssuePropertiesResponseSchema = z.object({
  properties: IssuePropertyValuesSchema,
  issue_revision: z.number().int().positive().optional(),
}).loose();

export const EMPTY_ISSUE_PROPERTIES_RESPONSE: IssuePropertiesResponse = {
  properties: {},
};

export interface AppConfigResponse {
  cdn_domain: string;
  attachment_public_url?: string;
  // True when the CDN domain serves private content via time-bounded signed
  // URLs (CloudFront signing) 鈥?raw storage URLs on that domain are NOT
  // publicly fetchable and must not be used as native media sources
  // (MUL-3254). Older servers omit the field; treat that as false.
  cdn_signed?: boolean;
  allow_signup: boolean;
  google_client_id?: string;
  posthog_key?: string;
  posthog_host?: string;
  analytics_environment?: string;
  daemon_server_url?: string;
  daemon_app_url?: string;
  daemon_setup_target?: "cloud" | "self_host" | "unknown";
  workspace_creation_disabled?: boolean;
  /** Whether this deployment offers the self-hosted Git provider integration
   * (self-host only; off on the managed cloud). Absent/false hides the whole
   * Settings 鈫?Integrations "Git providers" section. */
  vcs_integration_available?: boolean;
  feature_flags?: Record<string, boolean>;
  /** Whether this server understands local_directory `execution_mode` and
   * gates worktree mode at save time. Absent on every server that predates this
   * capability signal, which includes the ones that silently DROPPED an unknown
   * `execution_mode` and answered 201 鈥?the resource then ran in place while
   * the user was promised isolation (#7113). Servers between that fix and this
   * signal do validate but cannot say so, and are treated as unable: the client
   * has no way to tell them apart, and only one of the two answers is safe. */
  local_worktree_supported?: boolean;
  /** Whether agent create/update persists `conversation_starters`. Older servers
   * silently ignored the unknown field, so absent must be treated as false. */
  agent_conversation_starters_supported?: boolean;
  /** Whether issue create atomically validates and persists `properties`.
   * Older servers silently ignore the field, so absent means unsupported. */
  issue_create_properties_supported?: boolean;
  /** Whether deleting a comment keeps its replies and the server routes
   * DELETE /api/comments/{id}/keep-replies. Older servers deleted the replies
   * too, so absent must be treated as false (#8296). */
  comment_delete_keep_replies_supported?: boolean;
  server_version?: string;
}

// Schemas for the highest-risk API endpoints 鈥?those whose responses drive
// the issue detail page (timeline, comments, subscribers) and the issues
// list. These are the surfaces that white-screened in #2143 / #2147 / #2192.
//
// These schemas are intentionally LENIENT:
//   - String enums are stored as `z.string()` rather than `z.enum([...])`.
//     A new server-side enum value should render as a generic fallback in
//     the UI, never crash a `safeParse`.
//   - Optional fields are unioned with `null` and given fallbacks where
//     existing UI code already coerces them.
//   - Arrays default to `[]` so a missing `reactions` / `attachments` /
//     `entries` field doesn't take the page down.
//   - Every object schema ends with `.loose()` so unknown server-side
//     fields pass through unchanged. zod 4's `.object()` defaults to STRIP,
//     which would silently delete fields the schema didn't explicitly list
//     鈥?fine while the TS type doesn't claim them, but the moment a future
//     PR adds a TS field without updating the schema, the cast `as T` lies
//     and the field shows up as `undefined` at runtime. `.loose()` removes
//     that synchronisation hazard.
//
// These schemas are deliberately not typed as `z.ZodType<TimelineEntry>` /
// `z.ZodType<Issue>` etc. 鈥?the strict TS types narrow string fields to
// literal unions, which would defeat the leniency above. `parseWithFallback`
// returns the parsed value cast to the caller-supplied `T`, so the strict
// type still flows out at the call site; the schema only guards shape.

const ReactionSchema = z.object({
  id: z.string(),
  comment_id: z.string(),
  actor_type: z.string(),
  actor_id: z.string(),
  emoji: z.string(),
  created_at: z.string(),
});

// Nested attachments embedded in timeline/comment responses stay lenient on
// purpose: a single malformed attachment must not knock the whole timeline
// into the fallback `[]`.
const AttachmentImageFields = {
  width: z.number().int().positive().optional().catch(undefined),
  height: z.number().int().positive().optional().catch(undefined),
};

const AttachmentSchema = z.object({
  id: z.string(),
  ...AttachmentImageFields,
}).loose();

const ChatQuickActionSchema = z.object({
  label: z.string(),
  prompt: z.string(),
  primary: z.boolean().optional(),
}).loose();

export const ChatMessageSchema = z.object({
  id: z.string(),
  chat_session_id: z.string(),
  role: z.enum(["user", "assistant"]).catch("assistant"),
  content: z.string().default(""),
  task_id: z.string().nullable().default(null),
  created_at: z.string().default(""),
  attachments: z.array(AttachmentSchema).optional(),
  failure_reason: z.string().nullable().optional(),
  elapsed_ms: z.number().nullable().optional(),
  message_kind: z
    .enum(["message", "no_response", "onboarding_kickoff", "onboarding_opening"])
    .catch("message")
    .optional(),
  // Optional additive data degrades independently: a malformed suggestion
  // must not hide the assistant reply that contains it.
  quick_actions: z.array(ChatQuickActionSchema).catch([]).optional().default([]),
}).loose();

export const ChatMessageListSchema = z.array(ChatMessageSchema).default([]);
export const EMPTY_CHAT_MESSAGE_LIST: ChatMessage[] = [];

export const ChatMessagesPageSchema = z.object({
  messages: z.array(ChatMessageSchema).default([]),
  limit: z.number().default(50),
  has_more: z.boolean().default(false),
  next_cursor: z.object({
    created_at: z.string(),
    id: z.string(),
  }).loose().nullable().optional(),
}).loose();

// Standalone attachment lookup (`GET /api/attachments/{id}`) is the source of
// truth for click-time download URLs. The two fields the download flow opens
// in a new tab 鈥?`download_url` and `url` 鈥?must be strings, otherwise we'd
// happily `window.open(undefined)`. `filename` gates the toast/title and is
// also enforced so a missing value falls back to the empty record below.
//
// `markdown_url` is parsed lenient: a server old enough to predate
// MUL-3192 omits the field, in which case the schema defaults it to "".
// Callers that need to persist a URL into markdown should go through the
// `useFileUpload` helper (which falls back to the legacy
// `attachmentDownloadPath` shape when `markdown_url` is empty), so the
// empty-string default does not silently break any persistence path.
export const AttachmentResponseSchema = z.object({
  id: z.string(),
  url: z.string(),
  download_url: z.string(),
  // Forced-attachment ("download button") URL 鈥?credential-free and, unlike
  // `download_url`, always Content-Disposition: attachment across every storage
  // mode. Optional: a server older than this field omits it, and callers fall
  // back to `download_url` / the stable endpoint. Never persisted (short-lived).
  attachment_download_url: z.string().optional(),
  markdown_url: z.string().optional().default(""),
  filename: z.string(),
  chat_session_id: z.string().nullable().optional(),
  chat_message_id: z.string().nullable().optional(),
  // Image metadata is optional and degrades on its own: a malformed value
  // means "unknown dimensions", never a lost attachment.
  ...AttachmentImageFields,
}).loose();

export const EMPTY_ATTACHMENT: Attachment = {
  id: "",
  workspace_id: "",
  issue_id: null,
  comment_id: null,
  chat_session_id: null,
  chat_message_id: null,
  uploader_type: "",
  uploader_id: "",
  filename: "",
  url: "",
  download_url: "",
  markdown_url: "",
  content_type: "",
  size_bytes: 0,
  created_at: "",
};

// All object schemas use `.loose()` so unknown server-side fields pass
// through unchanged. zod 4's `.object()` defaults to STRIP, which would
// silently drop new fields and surface as a "field neither showed up in
// the UI" mystery the next time the TS type adopted them but the schema
// wasn't updated in lock-step. `.loose()` removes that synchronisation
// hazard 鈥?the schema validates the shape it knows about and leaves the
// rest alone.
// One receipt per running turn a comment steered. A malformed receipt is
// dropped on its own rather than failing the whole comment.
const CommentSupplementReceiptSchema = z.object({
  task_id: z.string(),
  agent_id: z.string().optional().catch(undefined),
  status: z.enum(["pending", "delivering", "delivered", "failed"]),
  failure_reason: z.string().optional().catch(undefined),
  delivered_at: z.string().optional().catch(undefined),
});

const CommentSupplementReceiptsSchema = z.array(z.unknown()).optional().catch(undefined)
  .transform((raw) => raw?.flatMap((item) => {
    const parsed = CommentSupplementReceiptSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  }));

const TimelineEntrySchema = z.object({
  type: z.string(),
  id: z.string(),
  actor_type: z.string(),
  actor_id: z.string(),
  created_at: z.string(),
  actor_name: z.string().optional(),
  actor_avatar_url: z.string().optional(),
  action: z.string().optional(),
  details: z.record(z.string(), z.unknown()).optional(),
  content: z.string().optional(),
  parent_id: z.string().nullable().optional(),
  updated_at: z.string().optional(),
  revision: z.number().int().positive().optional(),
  comment_type: z.string().optional(),
  reactions: z.array(ReactionSchema).optional(),
  attachments: z.array(AttachmentSchema).optional(),
  source_task_id: z.string().nullable().optional(),
  supplements: CommentSupplementReceiptsSchema,
  supplement_task_id: z.string().optional().catch(undefined),
  supplement_status: z.enum(["pending", "delivering", "delivered", "failed"]).optional().catch(undefined),
  supplement_failure_reason: z.string().optional().catch(undefined),
  supplement_delivered_at: z.string().optional().catch(undefined),
  // Tombstone marker (#8296). Lenient: a malformed value reads as a live
  // comment instead of failing the whole timeline.
  deleted_at: z.string().nullable().optional().catch(undefined),
  coalesced_count: z.number().optional(),
}).loose();

// /timeline returns a flat array of TimelineEntry, oldest first. The
// previously cursor-paginated wrapper was removed (#1929) 鈥?at observed data
// sizes (p99 ~30 entries per issue) paged delivery only created bugs.
export const TimelineEntriesSchema = z.array(TimelineEntrySchema);

export const EMPTY_TIMELINE_ENTRIES: TimelineEntry[] = [];

const OptionalStringSchema = z.preprocess(
  (value) => (typeof value === "string" ? value : undefined),
  z.string().optional(),
);

const BooleanWithDefaultSchema = (fallback: boolean) =>
  z.preprocess(
    (value) => (typeof value === "boolean" ? value : undefined),
    z.boolean().default(fallback),
  );

const FeatureFlagsSchema = z.preprocess(
  (value) =>
    value && typeof value === "object" && !Array.isArray(value)
      ? value
      : undefined,
  z.record(z.string(), BooleanWithDefaultSchema(false)).default({}),
);

/**
 * POST /api/auth/refresh 鈥?sliding session renewal (MUL-7436).
 *
 * `token` is present only for clients that carry the session as a string
 * (Desktop, mobile). A cookie-authenticated browser gets the renewed session
 * as a Set-Cookie and must never be handed a readable JWT, so the field is
 * absent there rather than empty.
 *
 * `renewed: false` is the normal answer to asking early, not an error 鈥?
 * clients poll on a cadence and most calls land outside the renewal window.
 * `check_again_in_seconds` is that cadence: the server derives it from the
 * deployment's configured TTL, so no client hardcodes one.
 */
export interface RefreshSessionResponse {
  token?: string;
  expires_at: string;
  renewed: boolean;
  check_again_in_seconds: number;
}

export const RefreshSessionResponseSchema = z.object({
  token: OptionalStringSchema,
  expires_at: OptionalStringSchema,
  renewed: BooleanWithDefaultSchema(false),
  check_again_in_seconds: z.number().int().nonnegative().default(0),
}).loose();

// Fail closed: an unreadable response means "nothing was renewed", so the
// client keeps the session it already has and retries later. A fallback that
// claimed renewal would drop a working session on the floor.
export const EMPTY_REFRESH_SESSION_RESPONSE: RefreshSessionResponse = {
  expires_at: "",
  renewed: false,
  check_again_in_seconds: 0,
};

export const AppConfigSchema = z.object({
  cdn_domain: z.string().default(""),
  attachment_public_url: OptionalStringSchema,
  cdn_signed: BooleanWithDefaultSchema(false),
  allow_signup: BooleanWithDefaultSchema(true),
  google_client_id: OptionalStringSchema,
  posthog_key: OptionalStringSchema,
  posthog_host: OptionalStringSchema,
  analytics_environment: OptionalStringSchema,
  daemon_server_url: OptionalStringSchema,
  daemon_app_url: OptionalStringSchema,
  daemon_setup_target: z.enum(["cloud", "self_host", "unknown"]).optional().catch("unknown"),
  workspace_creation_disabled: BooleanWithDefaultSchema(false).optional(),
  vcs_integration_available: BooleanWithDefaultSchema(false).optional(),
  feature_flags: FeatureFlagsSchema,
  local_worktree_supported: BooleanWithDefaultSchema(false),
  agent_conversation_starters_supported: BooleanWithDefaultSchema(false),
  issue_create_properties_supported: BooleanWithDefaultSchema(false),
  comment_delete_keep_replies_supported: BooleanWithDefaultSchema(false),
  server_version: OptionalStringSchema,
}).loose();

export const EMPTY_APP_CONFIG: AppConfigResponse = {
  cdn_domain: "",
  attachment_public_url: "",
  cdn_signed: false,
  allow_signup: true,
  google_client_id: "",
  daemon_server_url: "",
  daemon_app_url: "",
  daemon_setup_target: "unknown",
  workspace_creation_disabled: false,
  vcs_integration_available: false,
  // Fail closed: an unreadable config must not look like a server that
  // validates execution_mode.
  local_worktree_supported: false,
  // Fail closed: old servers returned success while dropping the field.
  agent_conversation_starters_supported: false,
  // Fail closed: old servers returned success while dropping create properties.
  issue_create_properties_supported: false,
  // Fail closed: old servers delete a comment's replies with it.
  comment_delete_keep_replies_supported: false,
  feature_flags: {},
};

// Preference keys may grow over time, so keep both the key and value spaces
// forward-compatible while still rejecting non-string persisted data.
export const NotificationPreferenceResponseSchema = z.object({
  workspace_id: z.string(),
  preferences: z.record(z.string(), z.string()).default({}),
}).loose();

export const EMPTY_NOTIFICATION_PREFERENCE_RESPONSE: NotificationPreferenceResponse = {
  workspace_id: "",
  preferences: {},
};

export const CreateFeedbackResponseSchema = z.object({
  id: z.string(),
  created_at: z.string(),
}).loose();

export const EMPTY_CREATE_FEEDBACK_RESPONSE: CreateFeedbackResponse = {
  id: "",
  created_at: "",
};

export const CommentSchema = z.object({
  id: z.string(),
  issue_id: z.string(),
  author_type: z.string(),
  author_id: z.string(),
  content: z.string(),
  type: z.string(),
  parent_id: z.string().nullable(),
  reactions: z.array(ReactionSchema).default([]),
  attachments: z.array(AttachmentSchema).default([]),
  created_at: z.string(),
  updated_at: z.string(),
  revision: z.number().int().positive().optional(),
  source_task_id: z.string().nullable().optional(),
  supplements: CommentSupplementReceiptsSchema,
  supplement_task_id: z.string().optional().catch(undefined),
  supplement_status: z.enum(["pending", "delivering", "delivered", "failed"]).optional().catch(undefined),
  supplement_failure_reason: z.string().optional().catch(undefined),
  supplement_delivered_at: z.string().optional().catch(undefined),
  // Set only on comments a quick action produced (MUL-5465). Server-only.
  quick_action_id: z.string().nullable().optional(),
  deleted_at: z.string().nullable().optional().catch(undefined),
}).loose();

export const CommentsListSchema = z.array(CommentSchema);

// Degraded placeholder for a comment response that failed schema validation.
// The empty id is the caller's signal that nothing usable came back 鈥?the run
// UI treats it as "could not read the result" rather than a successful run.
export const EMPTY_COMMENT: Comment = {
  id: "",
  issue_id: "",
  author_type: "member",
  author_id: "",
  content: "",
  type: "comment",
  parent_id: null,
  reactions: [],
  attachments: [],
  created_at: "",
  updated_at: "",
  resolved_at: null,
  resolved_by_type: null,
  resolved_by_id: null,
};

const CommentTriggerPreviewAgentSchema = z.object({
  id: z.string(),
  name: z.string().default(""),
  avatar_url: z.string().optional(),
  source: z.string().default(""),
  reason: z.string().default(""),
}).loose();

// Per-target outcome of an explicit @agent / @squad mention (MUL-4525 搂2).
// target_id is required to correlate with the client's rendered mention; a
// malformed entry (missing id) is dropped rather than failing the whole payload.
export const CommentTriggerOutcomeSchema = z.object({
  target_type: z.string().default(""),
  target_id: z.string(),
  status: z.string().default(""),
  reason_code: z.string().default(""),
}).loose();

export const CommentTriggerPreviewSchema = z.object({
  agents: z.array(CommentTriggerPreviewAgentSchema).default([]),
  // Drop malformed blocked entries INDIVIDUALLY (MUL-4525): a single bad item
  // must not discard the whole set of valid blocked mentions. A non-array
  // degrades to []; each valid entry is kept, each malformed one dropped.
  blocked: z
    .array(z.unknown())
    .catch([])
    .default([])
    .transform((items) =>
      items.flatMap((item) => {
        const parsed = CommentTriggerOutcomeSchema.safeParse(item);
        return parsed.success ? [parsed.data] : [];
      }),
    ),
}).loose();

const IssueTriggerPreviewItemSchema = z.object({
  issue_id: z.string(),
  agent_id: z.string().default(""),
  source: z.string().default(""),
}).loose();

export const IssueTriggerPreviewSchema = z.object({
  triggers: z.array(IssueTriggerPreviewItemSchema).default([]),
  total_count: z.number().default(0),
}).loose();

// Metadata is primitive-only by API/DB contract. Stay lenient on shape:
// unknown keys land as `unknown` to a caller, but the field itself defaults
// to {} so consumers never need to nil-guard `issue.metadata`.
const IssueMetadataSchema = z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({});

const SourceContextAttachmentSchema = z.object({
  id: z.string(),
  source_attachment_id: z.string().optional(),
  owner_type: z.string(),
  owner_id: z.string(),
  filename: z.string(),
  content_type: z.string(),
  size_bytes: z.number(),
  created_at: z.string(),
}).loose();

// Early source-context servers encoded an empty Go slice as JSON null. Keep
// installed clients compatible while normalizing consumers onto the canonical
// array shape emitted by current servers.
const SourceContextAttachmentsSchema = z.array(SourceContextAttachmentSchema)
  .nullish()
  .transform((attachments) => attachments ?? []);

const SourceContextAuthorSchema = z.object({
  type: z.string(),
  id: z.string(),
  name: z.string(),
}).loose();

const SourceContextIssueSnapshotSchema = z.object({
  id: z.string(),
  identifier: z.string(),
  number: z.number(),
  title: z.string(),
  description: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  revision: z.number(),
  attachments: SourceContextAttachmentsSchema,
}).loose();

const SourceContextCommentSnapshotSchema = z.object({
  id: z.string(),
  parent_id: z.string().nullable(),
  type: z.string(),
  content: z.string(),
  author: SourceContextAuthorSchema,
  created_at: z.string(),
  updated_at: z.string(),
  revision: z.number(),
  attachments: SourceContextAttachmentsSchema,
  deleted: z.boolean().optional().catch(undefined),
}).loose();

export const SourceContextSnapshotSchema = z.object({
  version: z.number().optional(),
  captured_by_user_id: z.string().optional(),
  captured_at: z.string().optional(),
  source_issue: SourceContextIssueSnapshotSchema,
  comment_thread: z.array(SourceContextCommentSnapshotSchema),
  anchor_comment_id: z.string(),
}).loose();

export const SourceContextPreviewSchema = SourceContextSnapshotSchema.extend({
  capture_token: z.string().min(1),
  limits: z.object({
    comment_count: z.number(),
    text_bytes: z.number(),
    attachment_count: z.number(),
    attachment_bytes: z.number(),
  }).loose(),
}).loose();

const IssueSourceContextSchema = z.object({
  id: z.string(),
  version: z.number(),
  usage: z.string(),
  captured_at: z.string(),
  display_state: z.string(),
  source_issue_state: z.string(),
  comment_thread_state: z.string(),
  anchor_comment_state: z.string(),
  can_open_current_source: z.boolean(),
  change_reasons: z.array(z.string()).optional(),
  change_details: z.object({
    changed_comment_ids: z.array(z.string()),
    added_comments: z.array(SourceContextCommentSnapshotSchema).optional(),
    removed_comment_ids: z.array(z.string()).optional(),
    description_attachment_changes: z.array(z.object({
      kind: z.string(),
      attachment_id: z.string(),
      filename: z.string(),
      previous_filename: z.string().optional(),
    }).loose()),
  }).loose().optional(),
  current_source: z.object({
    issue_id: z.string(),
    identifier: z.string(),
    anchor_comment_id: z.string(),
  }).loose().optional(),
  source_author_state: z.array(z.object({
    type: z.string(),
    id: z.string(),
    captured_name: z.string(),
    current_name: z.string().optional(),
    state: z.string(),
  }).loose()).optional(),
  snapshot: SourceContextSnapshotSchema,
}).loose();

export const CommentSubIssueTaskResponseSchema = z.object({
  task_id: z.string().min(1),
}).loose();

export const IssueSchema = z.object({
  id: z.string(),
  workspace_id: z.string(),
  number: z.number(),
  identifier: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  status: z.string(),
  // The canonical status whose platform behavior `status` carries 鈥?equal to
  // `status` for the 7 built-ins, and the inherited category for a custom
  // status. Optional because only endpoints that resolve it emit it, so
  // consumers must fall back to `status` rather than treat "" as a category.
  // (MUL-6243)
  status_category: z.string().transform((value) => normalizeIssueStatusCategory(value) ?? value).optional(),
  // A CUSTOM status's display name; "" for a built-in, which clients localize
  // from the key. Optional so a response from a server that predates the field
  // still validates.
  //
  // .catch(undefined) because this is ADDITIVE display data and the failure it
  // guards against is disproportionate: a parse failure anywhere in IssueSchema
  // takes the whole response through parseWithFallback to EMPTY_LIST_ISSUES_RESPONSE,
  // so one malformed name from a mixed-version deploy would blank an entire
  // issue list. Same treatment as source_context and labels above. Nothing reads
  // this field to make a decision 鈥?useStatusLabel resolves the label from the
  // catalog 鈥?so dropping it costs a fallback to the key. (MUL-6749)
  status_name: z.string().optional().catch(undefined),
  priority: z.string(),
  assignee_type: z.string().nullable(),
  assignee_id: z.string().nullable(),
  creator_type: z.string(),
  creator_id: z.string(),
  requester_id: z.string().nullable().optional().catch(undefined),
  parent_issue_id: z.string().nullable(),
  // Additive pointer (MUL-7349); same disproportionate-failure reasoning as
  // status_name above, and older backends do not send it at all.
  duplicate_of: z
    .object({ id: z.string(), identifier: z.string(), title: z.string(), status: z.string() })
    .nullable()
    .optional()
    .catch(undefined),
  project_id: z.string().nullable(),
  position: z.number(),
  // Older backends predate `stage`; default to null so a missing field parses
  // cleanly into the non-optional Issue.stage (number | null).
  stage: z.number().nullable().default(null),
  start_date: z.string().nullable(),
  due_date: z.string().nullable(),
  metadata: IssueMetadataSchema,
  // Older backends predate custom properties; default {} so consumers never
  // nil-guard issue.properties.
  properties: IssuePropertyValuesSchema,
  reactions: z.array(z.unknown()).optional(),
  labels: z.array(z.unknown()).optional(),
  created_at: z.string(),
  updated_at: z.string(),
  revision: z.number().int().positive().optional(),
  // Optional for compatibility with older self-hosted backends; a current
  // backend emits null until its historical backfill reaches the issue.
  last_activity_at: z.string().nullable().optional(),
  // Detail-only and potentially large. A malformed additive field must not
  // erase an otherwise usable issue returned by a mixed-version server.
  source_context: IssueSourceContextSchema.optional().catch(undefined),
}).loose();

export const ListIssuesResponseSchema = z.object({
  issues: z.array(IssueSchema).default([]),
  total: z.number().default(0),
}).loose();

// Response schema for POST /api/issues. Two tightenings over IssueSchema:
//
//   - `id` must be non-empty. A created issue always carries a real id, so an
//     empty/absent id means the create effectively failed. createIssue turns a
//     schema failure into a rejection (not a fabricated success), so tightening
//     id here routes an id-less body to that same failure path.
//   - `labels` is the backend-compatibility signal the create modal reads to
//     decide whether the backend attached labels in the create transaction
//     (present) or predates that (absent 鈫?fall back to per-label attach).
//     Validate it strictly as Label[] and degrade a malformed value to
//     `undefined` 鈥?the same as an absent field 鈥?so a wrong shape (null,
//     object, a garbage array) can never masquerade as "handled" and suppress
//     the fallback. Unlike the loose IssueSchema.labels (z.array(z.unknown())),
//     the elements are fully validated. See packages/views/modals/create-issue.tsx.
export const CreateIssueResponseSchema = IssueSchema.extend({
  id: z.string().min(1),
  labels: z.array(LabelSchema).optional().catch(undefined),
  pr_auto_complete_disabled: z.boolean().optional().catch(undefined),
}).loose();

export const EMPTY_LIST_ISSUES_RESPONSE: ListIssuesResponse = {
  issues: [],
  total: 0,
};

const SearchIssueResultSchema = IssueSchema.extend({
  match_source: z.string(),
  matched_snippet: z.string().optional(),
  matched_description_snippet: z.string().optional(),
  matched_comment_snippet: z.string().optional(),
}).loose();

export const SearchIssuesResponseSchema = z.object({
  issues: z.array(SearchIssueResultSchema).default([]),
}).loose();

export const EMPTY_SEARCH_ISSUES_RESPONSE: SearchIssuesResponse = {
  issues: [],
};

export const ProjectSchema = z.object({
  id: z.string(),
  workspace_id: z.string(),
  title: z.string(),
  visibility: z.enum(["workspace", "private"]).default("workspace").catch("private"),
  description: z.string().nullable(),
  icon: z.string().nullable(),
  status: z.string(),
  priority: z.string(),
  lead_type: z.string().nullable(),
  lead_id: z.string().nullable(),
  creator_type: z.string().nullable().default(null).catch(null),
  creator_id: z.string().nullable().default(null).catch(null),
  // .default(null) so a project from an older backend (frontend deploys before
  // backend) that omits these keys parses to null instead of failing the whole
  // object 鈥?which would degrade a search/list batch to the empty fallback.
  start_date: z.string().nullable().default(null),
  due_date: z.string().nullable().default(null),
  created_at: z.string(),
  updated_at: z.string(),
  issue_count: z.number().default(0),
  done_count: z.number().default(0),
  resource_count: z.number().default(0),
  workflow_id: z.string().nullable().default(null),
  // Org unit the project belongs to (docs/engineering/ORG-MODEL.md). The server
  // has sent it since departments shipped; defaulted so a backend that predates
  // them parses to "unfiled" instead of failing the object.
  department_id: z.string().nullable().default(null),
}).loose();

export const EMPTY_PROJECT: Project = {
  id: "", workspace_id: "", title: "", description: null, icon: null,
  status: "planned", priority: "none", lead_type: null, lead_id: null,
  creator_type: null, creator_id: null, start_date: null, due_date: null,
  created_at: "", updated_at: "", issue_count: 0, done_count: 0, resource_count: 0,
  department_id: null,
};

export const ListProjectsResponseSchema = z.object({
  projects: z.array(ProjectSchema).default([]),
  total: z.number().default(0),
}).loose();

export const EMPTY_LIST_PROJECTS_RESPONSE: ListProjectsResponse = { projects: [], total: 0 };

export const ProjectMemberSchema = z.object({
  project_id: z.string(),
  user_id: z.string(),
  name: z.string(),
  email: z.string(),
  avatar_url: z.string().nullable().default(null),
}).loose();

export const ListProjectMembersResponseSchema = z.object({
  members: z.array(ProjectMemberSchema),
  total: z.number(),
}).loose();

// Departments (docs/engineering/ORG-MODEL.md). Every field is defaulted so a
// backend that predates the feature parses to an empty-but-usable department
// list instead of throwing away the page.
export const DepartmentSchema = z.object({
  id: z.string(),
  workspace_id: z.string().default(""),
  name: z.string(),
  lead_user_id: z.string().nullable().default(null),
  system_key: z.string().nullable().default(null),
  created_at: z.string().default(""),
  updated_at: z.string().default(""),
}).loose();

export const EMPTY_DEPARTMENT: Department = {
  id: "",
  workspace_id: "",
  name: "",
  lead_user_id: null,
  system_key: null,
  created_at: "",
  updated_at: "",
};

export const ListDepartmentsResponseSchema = z.object({
  departments: z.array(DepartmentSchema).default([]),
  total: z.number().default(0),
}).loose();

export const EMPTY_LIST_DEPARTMENTS_RESPONSE: ListDepartmentsResponse = {
  departments: [],
  total: 0,
};

export const DeleteDepartmentResponseSchema = z.object({
  detached_projects: z.number().default(0),
  detached_members: z.number().default(0),
}).loose();

export const EMPTY_DELETE_DEPARTMENT_RESPONSE: DeleteDepartmentResponse = {
  detached_projects: 0,
  detached_members: 0,
};

const SearchProjectResultSchema = ProjectSchema.extend({
  match_source: z.string(),
  matched_snippet: z.string().optional(),
}).loose();

export const SearchProjectsResponseSchema = z.object({
  projects: z.array(SearchProjectResultSchema).default([]),
}).loose();

export const EMPTY_SEARCH_PROJECTS_RESPONSE: SearchProjectsResponse = {
  projects: [],
};

// Local search index sync (MUL-7754). Callers reject a response that fails
// these schemas instead of degrading to an empty value: an empty snapshot page
// or change set would be applied to the local copy as truth.
const SearchIndexIssueSchema = IssueSchema.extend({
  search_updated_at: z.string(),
}).loose();

const SearchIndexProjectSchema = ProjectSchema.extend({
  search_updated_at: z.string(),
}).loose();

const SearchIndexCommentSchema = z.object({
  id: z.string().min(1),
  issue_id: z.string().min(1),
  content: z.string(),
  created_at: z.string(),
}).loose();

export const SearchIndexManifestSchema = z.object({
  cursor: z.string().min(1),
  issue_count: z.number(),
  comment_count: z.number(),
  project_count: z.number(),
  text_bytes: z.number(),
}).loose();

export const SearchIndexSnapshotPageSchema = z.object({
  issues: z.array(SearchIndexIssueSchema),
  comments: z.array(SearchIndexCommentSchema),
  projects: z.array(SearchIndexProjectSchema),
  next_after_number: z.number(),
  done: z.boolean(),
}).loose();

export const SearchIndexChangesSchema = z.object({
  issues: z.array(SearchIndexIssueSchema),
  comments: z.array(SearchIndexCommentSchema),
  projects: z.array(SearchIndexProjectSchema),
  deleted: z.object({
    issues: z.array(z.string()),
    comments: z.array(z.string()),
    projects: z.array(z.string()),
  }).loose(),
  cursor: z.string().min(1),
  has_more: z.boolean(),
}).loose();

const IssueAssigneeGroupSchema = z.object({
  id: z.string(),
  assignee_type: z.string().nullable(),
  assignee_id: z.string().nullable(),
  issues: z.array(IssueSchema).default([]),
  total: z.number().default(0),
}).loose();

export const GroupedIssuesResponseSchema = z.object({
  groups: z.array(IssueAssigneeGroupSchema).default([]),
}).loose();

export const EMPTY_GROUPED_ISSUES_RESPONSE: GroupedIssuesResponse = {
  groups: [],
};

const IssueTableActorRefSchema = z.object({
  // Server-driven enums stay open so installed desktop clients survive a
  // backend that introduces another actor kind.
  type: z.string(),
  id: z.string(),
}).loose();

const IssueTableParentRefSchema = z.object({
  id: z.string(),
  number: z.number(),
  identifier: z.string(),
  title: z.string(),
  status: z.string(),
}).loose();

const IssueTableGroupValueSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("status"),
    // Preserve the requested bucket vocabulary (legacy wire, lifecycle, or
    // concrete status). Normalizing here would disconnect values from keys.
    status: z.string(),
  }).loose(),
  z.object({
    kind: z.literal("assignee"),
    actor: IssueTableActorRefSchema.nullable(),
  }).loose(),
  z.object({
    kind: z.literal("project"),
    project_id: z.string().nullable().optional().default(null),
  }).loose(),
  z.object({
    kind: z.literal("parent"),
    parent_id: z.string().nullable().optional().default(null),
    parent: IssueTableParentRefSchema.nullable().optional().default(null),
    value_state: z.enum(["value", "unavailable", "unset"]),
  }).loose(),
  z.object({
    kind: z.literal("property"),
    property_id: z.string(),
    value: z.union([z.string(), z.boolean(), z.null()]).optional(),
    value_state: z.enum(["value", "unavailable", "unset"]),
  }).loose(),
]);

const IssueTableGroupDescriptorSchema: z.ZodType<IssueTableGroupDescriptor> = z.lazy(() => z.object({
  key: z.string(),
  value: IssueTableGroupValueSchema,
  count: z.number(),
  secondary_groups: z.array(IssueTableGroupDescriptorSchema).optional(),
}).loose());

export const IssueTableGroupsResponseSchema = z.object({
  query_fingerprint: z.string(),
  total: z.number(),
  groups: z.array(IssueTableGroupDescriptorSchema).default([]),
  next_cursor: z.string().nullable().default(null),
}).loose();

export const EMPTY_ISSUE_TABLE_GROUPS_RESPONSE: IssueTableGroupsResponse = {
  query_fingerprint: "",
  total: 0,
  groups: [],
  next_cursor: null,
};

const IssueTableRowSchema = z.object({
  issue: IssueSchema,
  direct_child_count: z.number().default(0),
}).loose();

export const IssueTableRowsResponseSchema = z.object({
  query_fingerprint: z.string(),
  group_key: z.string().nullable().default(null),
  parent_id: z.string().nullable().default(null),
  total: z.number(),
  rows: z.array(IssueTableRowSchema).default([]),
  branch_total: z.number(),
  next_cursor: z.string().nullable().default(null),
}).loose();

export const EMPTY_ISSUE_TABLE_ROWS_RESPONSE: IssueTableRowsResponse = {
  query_fingerprint: "",
  group_key: null,
  parent_id: null,
  total: 0,
  rows: [],
  branch_total: 0,
  next_cursor: null,
};

const IssueTableFacetValueSchema = z.object({
  key: z.string(),
  count: z.number(),
}).loose();

const IssueTableFacetSchema = z.object({
  kind: z.enum(["status", "priority", "assignee", "creator", "project", "label", "property", "working_agents"]),
  property_id: z.string().optional(),
  values: z.array(IssueTableFacetValueSchema).default([]),
}).loose();

export const IssueTableFacetsResponseSchema = z.object({
  query_fingerprint: z.string(),
  total: z.number(),
  facets: z.array(IssueTableFacetSchema).default([]),
}).loose();

export const EMPTY_ISSUE_TABLE_FACETS_RESPONSE: IssueTableFacetsResponse = {
  query_fingerprint: "",
  total: 0,
  facets: [],
};

const SubscriberSchema = z.object({
  issue_id: z.string(),
  user_type: z.string(),
  user_id: z.string(),
  reason: z.string(),
  created_at: z.string(),
}).loose();

export const SubscribersListSchema = z.array(SubscriberSchema);

export const ChildIssuesResponseSchema = z.object({
  issues: z.array(IssueSchema).default([]),
}).loose();

export const IssueDuplicatesResponseSchema = z.object({
  duplicate_of: IssueSchema.nullable().default(null),
  duplicates: z.array(IssueSchema).default([]),
}).loose();

export const ChildIssueProgressResponseSchema = z.object({
  progress: z
    .array(
      z
        .object({
          parent_issue_id: z.string(),
          total: z.number(),
          done: z.number(),
        })
        .loose(),
    )
    .default([]),
}).loose();

export const CloudRuntimeNodeSchema = z.object({
  id: z.string(),
  owner_id: z.string(),
  instance_id: z.string(),
  region: z.string(),
  instance_type: z.string(),
  image_id: z.string(),
  subnet_id: z.string(),
  name: z.string(),
  status: z.string(),
  tags: z.record(z.string(), z.string()).default({}),
  metadata: z.record(z.string(), z.unknown()).default({}),
  created_at: z.string(),
  updated_at: z.string(),
}).loose();

export const CloudRuntimeNodeListSchema = z.array(CloudRuntimeNodeSchema);

export const EMPTY_CLOUD_RUNTIME_NODE_LIST: CloudRuntimeNode[] = [];

export const EMPTY_CLOUD_RUNTIME_NODE: CloudRuntimeNode = {
  id: "",
  owner_id: "",
  instance_id: "",
  region: "",
  instance_type: "",
  image_id: "",
  subnet_id: "",
  name: "",
  status: "",
  tags: {},
  metadata: {},
  created_at: "",
  updated_at: "",
};

// Workspace dashboard schemas
//
// The dashboard hits three independent rollup endpoints. Each returns a flat
// array, and every field is consumed by chart / KPI math 鈥?a missing number
// silently degrades to NaN downstream, so we coerce missing numbers to 0.
// String fields default to "" (no enum narrowing) to survive future model /
// agent ID drift, and so a single null from tz-aware SQL bucketing fails
// only that row instead of dropping the whole array to the `[]` fallback.

// Cost split carried by every usage row. `cost_usd_ticks` is what the provider
// itself charged for the rows behind this aggregate (1e-10 USD); the
// `uncosted_*` counts are the tokens from rows the provider did NOT price, and
// so are the only ones the client should run through its rate table.
//
// The `uncosted_*` fields are deliberately `.optional()` rather than
// `.default(0)`: a backend that predates them sends nothing, and defaulting
// those rows to "0 tokens left to estimate" would silently zero their cost.
// `undefined` means "this backend doesn't split", and the consumer falls back
// to the full token counts 鈥?i.e. exactly the old behaviour. A real 0 from a
// current backend means "everything here is already priced", which is a
// different thing and must stay distinguishable.
const CostSplitShape = {
  cost_usd_ticks: z.number().optional(),
  uncosted_input_tokens: z.number().optional(),
  uncosted_output_tokens: z.number().optional(),
  uncosted_cache_read_tokens: z.number().optional(),
  uncosted_cache_write_tokens: z.number().optional(),
};

const DashboardUsageDailySchema = z.object({
  date: z.string().default(""),
  provider: z.string().default(""),
  model: z.string().default(""),
  input_tokens: z.number().default(0),
  output_tokens: z.number().default(0),
  cache_read_tokens: z.number().default(0),
  cache_write_tokens: z.number().default(0),
  ...CostSplitShape,
  task_count: z.number().default(0),
}).loose();

export const DashboardUsageDailyListSchema = z.array(DashboardUsageDailySchema);

const DashboardUsageByAgentSchema = z.object({
  agent_id: z.string().default(""),
  provider: z.string().default(""),
  model: z.string().default(""),
  input_tokens: z.number().default(0),
  output_tokens: z.number().default(0),
  cache_read_tokens: z.number().default(0),
  cache_write_tokens: z.number().default(0),
  ...CostSplitShape,
  task_count: z.number().default(0),
}).loose();

export const DashboardUsageByAgentListSchema = z.array(DashboardUsageByAgentSchema);

// `cancelled_count` defaults to 0 so an installed client pointed at a
// backend that predates it still renders: those rows simply carry no
// cancelled segment, which is exactly what that backend measured.
const DashboardAgentRunTimeSchema = z.object({
  agent_id: z.string().default(""),
  total_seconds: z.number().default(0),
  task_count: z.number().default(0),
  metered_task_count: z.number().optional().catch(undefined),
  failed_count: z.number().default(0),
  cancelled_count: z.number().default(0),
}).loose();

export const DashboardAgentRunTimeListSchema = z.array(DashboardAgentRunTimeSchema);

const DashboardRunTimeDailySchema = z.object({
  date: z.string().default(""),
  total_seconds: z.number().default(0),
  task_count: z.number().default(0),
  failed_count: z.number().default(0),
  cancelled_count: z.number().default(0),
}).loose();

export const DashboardRunTimeDailyListSchema = z.array(DashboardRunTimeDailySchema);

// Failure rollups. `failure_reason` is an open string on purpose 鈥?it carries
// the backend's canonical taxonomy, which grows as new classifier rules land
// (server/pkg/taskfailure). Pinning it to a z.enum would make an installed
// desktop client drop rows for a reason its build predates; the client folds
// unrecognised reasons into an "other" display class instead. The empty
// string is the succeeded bucket, so `.default("")` is a meaningful default
// only for a row that already lost its reason 鈥?such a row lands in the
// denominator rather than inventing a failure that never happened.
const DashboardFailureDailySchema = z.object({
  date: z.string().default(""),
  failure_reason: z.string().default(""),
  task_count: z.number().default(0),
}).loose();

export const DashboardFailureDailyListSchema = z.array(DashboardFailureDailySchema);

const DashboardFailureByAgentSchema = z.object({
  agent_id: z.string().default(""),
  failure_reason: z.string().default(""),
  task_count: z.number().default(0),
}).loose();

export const DashboardFailureByAgentListSchema = z.array(
  DashboardFailureByAgentSchema,
);

// Runtime usage schemas 鈥?the runtime-detail page's four usage endpoints
// (`/api/runtimes/:id/usage*`). Same leniency rules as the dashboard
// schemas above: numbers default to 0, strings to "", `.loose()` passes
// unknown fields.

const RuntimeUsageSchema = z.object({
  runtime_id: z.string().default(""),
  date: z.string().default(""),
  provider: z.string().default(""),
  model: z.string().default(""),
  input_tokens: z.number().default(0),
  output_tokens: z.number().default(0),
  cache_read_tokens: z.number().default(0),
  cache_write_tokens: z.number().default(0),
  ...CostSplitShape,
}).loose();

export const RuntimeUsageListSchema = z.array(RuntimeUsageSchema);

const RuntimeHourlyActivitySchema = z.object({
  hour: z.number().default(0),
  count: z.number().default(0),
}).loose();

export const RuntimeHourlyActivityListSchema = z.array(RuntimeHourlyActivitySchema);

const RuntimeUsageByAgentSchema = z.object({
  agent_id: z.string().default(""),
  provider: z.string().default(""),
  model: z.string().default(""),
  input_tokens: z.number().default(0),
  output_tokens: z.number().default(0),
  cache_read_tokens: z.number().default(0),
  cache_write_tokens: z.number().default(0),
  ...CostSplitShape,
  task_count: z.number().default(0),
}).loose();

export const RuntimeUsageByAgentListSchema = z.array(RuntimeUsageByAgentSchema);

const RuntimeUsageByHourSchema = z.object({
  hour: z.number().default(0),
  model: z.string().default(""),
  input_tokens: z.number().default(0),
  output_tokens: z.number().default(0),
  cache_read_tokens: z.number().default(0),
  cache_write_tokens: z.number().default(0),
  ...CostSplitShape,
  task_count: z.number().default(0),
}).loose();

export const RuntimeUsageByHourListSchema = z.array(RuntimeUsageByHourSchema);

// Agent task responses. The base object stays loose so daemon/runtime fields
// can drift while task-list consumers still validate the fields they render.

// Human attribution (MUL-4302 搂9): who an agent run is accountable to, and how
// that human was resolved. Every field is defensive so a departed member, an
// autopilot run (no originator), or an older backend degrades to a partial
// object instead of a parse failure.
const AttributionUserSchema = z.object({
  id: z.string().default(""),
  name: z.string().optional(),
  email: z.string().optional(),
  avatar_url: z.string().optional(),
}).loose();

const TaskEvidenceSchema = z.object({
  kind: z.string().default(""),
  ref_id: z.string().default(""),
}).loose();

const TaskAttributionSchema = z.object({
  source: z.string().default("unattributed"),
  precise: z.boolean().default(false),
  initiator: AttributionUserSchema.optional(),
  originator: AttributionUserSchema.optional(),
  evidence: TaskEvidenceSchema.optional(),
  rule_version_id: z.string().optional(),
  delegated_from_task_id: z.string().optional(),
  retry_of_task_id: z.string().optional(),
  rerun_of_task_id: z.string().optional(),
}).loose();

const TaskCancellationActorSchema = z.object({
  type: z.string().default(""),
  id: z.string().optional(),
  name: z.string().optional(),
}).loose();

const OptionalStringArraySchema = z.preprocess(
  (value) =>
    Array.isArray(value) && value.every((item) => typeof item === "string")
      ? value
      : undefined,
  z.array(z.string()).optional(),
);

// One (provider, model) slice of a run's token usage. Token counts default to
// 0 rather than failing the row: a slice missing one counter is still worth
// pricing on the counters it does have, and the "we have no usage at all" case
// is carried by the field's absence, not by a zeroed entry.
const TaskUsageSchema = z.object({
  provider: z.string().optional(),
  model: z.string().default(""),
  input_tokens: z.number().default(0),
  output_tokens: z.number().default(0),
  cache_read_tokens: z.number().default(0),
  cache_write_tokens: z.number().default(0),
  cost_usd_ticks: z.number().optional(),
  credits_micros: z.number().optional().catch(undefined),
}).loose();

export const AgentTaskSchema = z.object({
  wakeup_id: z.string().optional().catch(undefined),
  cancelled_by_comment_change: z.boolean().optional().catch(undefined),
  cancelled_by: TaskCancellationActorSchema.optional().catch(undefined),
  id: z.string(),
  agent_id: z.string().default(""),
  runtime_id: z.string().default(""),
  issue_id: z.string().default(""),
  issue_identifier: z.string().optional().catch(undefined),
  issue_title: z.string().optional().catch(undefined),
  status: z.string().default("cancelled"),
  priority: z.number().default(0),
  dispatched_at: z.string().nullable().default(null),
  started_at: z.string().nullable().default(null),
  completed_at: z.string().nullable().default(null),
  result: z.unknown().default(null),
  error: z.string().nullable().default(null),
  failure_reason: z.string().optional(),
  created_at: z.string().default(""),
  chat_session_id: z.string().optional(),
  autopilot_run_id: z.string().optional(),
  parent_task_id: z.string().optional(),
  attempt: z.number().optional(),
  trigger_comment_id: z.string().optional(),
  // Coverage is additive display metadata. A mixed-version or partially
  // upgraded server must not make one malformed optional field erase the
  // entire execution log, so degrade that field to "absent" independently.
  coalesced_comment_ids: OptionalStringArraySchema,
  delivered_comment_ids: OptionalStringArraySchema,
  supplement_capability: z.string().optional().catch(undefined),
  supplement_comment_ids: OptionalStringArraySchema,
  can_supplement: z.boolean().optional().catch(undefined),
  trigger_summary: z.string().optional(),
  kind: z.string().optional(),
  work_dir: z.string().optional().catch(undefined),
  relative_work_dir: z.string().optional().catch(undefined),
  durable_work_dir: z.string().optional().catch(undefined),
  relative_durable_work_dir: z.string().optional().catch(undefined),
  branch_name: z.string().optional().catch(undefined),
  attribution: TaskAttributionSchema.optional(),
  // Per-run token usage. Same independent-degradation rule as the coverage
  // arrays above: usage is additive display metadata, so one malformed entry
  // must cost the row its usage figure, not erase the whole execution log.
  // `.catch(undefined)` collapses a bad array to "no usage recorded", which
  // the UI already renders as an em dash.
  usage: z.array(TaskUsageSchema).optional().catch(undefined),
}).loose();

// Outcome counts are required: every backend that serves this endpoint
// reports them, so a response missing them is a contract drift, not an
// older peer. `parseWithFallback` then degrades the whole list to `[]`
// rather than letting a partial window masquerade as measured outcomes.
export const AgentActivityBucketListSchema = z.array(z.object({
  agent_id: z.string(),
  bucket_at: z.string(),
  task_count: z.number().int().nonnegative(),
  failed_count: z.number().int().nonnegative(),
  completed_count: z.number().int().nonnegative(),
  cancelled_count: z.number().int().nonnegative(),
  duration_ms: z.number().nonnegative().optional().catch(undefined),
  duration_count: z.number().int().nonnegative().optional().catch(undefined),
}).loose());

export const AgentTaskListSchema = z.array(AgentTaskSchema);

export const AgentTaskPageSchema = z.object({
  tasks: AgentTaskListSchema,
  nextCursor: z.string().min(1).nullable(),
});

// One row of a run transcript. `output_truncated` gates a completeness claim
// the UI makes about a tool's output, so it stays `.optional()` with no
// default: a server that does not send it means "unknown", and defaulting it
// to false would turn a missing field into an assertion that the record is
// complete. `.catch(undefined)` keeps a malformed value that far too 鈥?without
// it a single bad boolean fails its row, the array fails with it, and
// `parseWithFallback` hands the viewer an empty transcript. Degrading one
// field to "unknown" is the correct loss; deleting the run is not. Every other
// field keeps a default for the same reason.
export const TaskMessagePayloadSchema = z.object({
  call_id: z.string().optional().catch(undefined),
  task_id: z.string().default(""),
  issue_id: z.string().default(""),
  chat_session_id: z.string().optional(),
  seq: z.number().default(0),
  type: z.enum(["text", "thinking", "tool_use", "tool_result", "error"]).catch("text"),
  tool: z.string().optional(),
  content: z.string().optional(),
  input: z.record(z.string(), z.unknown()).optional(),
  output: z.string().optional(),
  output_truncated: z.boolean().optional().catch(undefined),
  created_at: z.string().optional(),
}).loose();

export const TaskMessageListSchema = z.array(TaskMessagePayloadSchema).default([]);

// Task cancellation (`POST /api/tasks/:id/cancel`) is consumed directly by
// chat recovery. Its optional message payload must be well-formed before the
// UI deletes a message from cache or restores text into the input.
const CancelledChatMessageSchema = z.object({
  chat_session_id: z.string(),
  message_id: z.string(),
  content: z.string(),
  restore_to_input: z.boolean().default(false),
  // Attachments detached from the deleted message so a restored draft can
  // re-bind them on re-send. Absent on servers that predate the field.
  attachments: z.array(AttachmentSchema).optional(),
}).loose();

export const CancelTaskResponseSchema = AgentTaskSchema.extend({
  cancelled_chat_message: CancelledChatMessageSchema.nullish()
    .transform((value) => value ?? undefined),
}).loose();

const ChatLastMessageSchema = z.object({
  content: z.string().default(""),
  role: z.enum(["user", "assistant"]).catch("assistant"),
  created_at: z.string().default(""),
  failure_reason: z.string().nullable().optional(),
  message_kind: z.enum([
    "message",
    "no_response",
    "onboarding_kickoff",
    "onboarding_opening",
  ]).optional().catch(undefined),
}).loose();

const ChatChannelSourceSchema = z.object({
  channel_type: z.string().default(""),
  installation_id: z.string().default(""),
  route_revision: z.number().default(0),
}).loose();

export const ChatSessionSchema: z.ZodType<ChatSession> = z.object({
  id: z.string(),
  workspace_id: z.string().default(""),
  agent_id: z.string().default(""),
  creator_id: z.string().default(""),
  project_id: z.string().nullable().optional(),
  title: z.string().default(""),
  status: z.enum(["active", "archived"]).catch("active"),
  has_unread: z.boolean().default(false),
  unread_count: z.number().optional(),
  last_message: ChatLastMessageSchema.nullable().optional().catch(undefined),
  pinned: z.boolean().optional(),
  channel_source: ChatChannelSourceSchema.optional().catch(undefined),
  is_current_channel_route: z.boolean().optional().catch(undefined),
  created_at: z.string().default(""),
  updated_at: z.string().default(""),
}).loose();

export const EMPTY_CHAT_SESSION: ChatSession = {
  id: "",
  workspace_id: "",
  agent_id: "",
  creator_id: "",
  title: "",
  status: "active",
  has_unread: false,
  created_at: "",
  updated_at: "",
};
export const ChatSessionListSchema = z
  .array(ChatSessionSchema.catch(EMPTY_CHAT_SESSION))
  .transform((sessions) => sessions.filter((session) => session.id !== ""))
  .default([]);
export const EMPTY_CHAT_SESSION_LIST: ChatSession[] = [];

// Deferred-cancellation draft restores
// (`GET /api/chat/sessions/{id}/draft-restores`, #5219) feed the composer
// directly: `content` becomes the draft text, `attachments` re-bind on
// re-send, and `id` is the consume key. A malformed response falls back to
// an empty list 鈥?the durable row stays pending server-side, so nothing is
// lost by skipping a fetch.
const ChatDraftRestoreSchema = z.object({
  id: z.string(),
  chat_session_id: z.string(),
  task_id: z.string().optional(),
  content: z.string().default(""),
  attachments: z.array(AttachmentSchema).optional(),
  created_at: z.string().optional(),
}).loose();

export const ChatDraftRestoresResponseSchema = z.object({
  restores: z.array(ChatDraftRestoreSchema).default([]),
}).loose();

const ChatQueuedTaskSchema = z.object({
  task_id: z.string(),
  status: z.string().default("queued"),
  created_at: z.string().default(""),
  message_id: z.string().optional(),
  content: z.string().optional(),
}).loose();

const ChatQueuedTasksSchema = z.array(z.unknown()).transform((tasks) =>
  tasks.flatMap((task) => {
    const parsed = ChatQueuedTaskSchema.safeParse(task);
    return parsed.success ? [parsed.data] : [];
  }),
);

// Root fields retain the legacy single-task response shape. Keep additive
// fields optional so callers can distinguish an older server from an empty
// queue. A malformed queue row is ignored without discarding a valid head.
export const ChatPendingTaskSchema: z.ZodType<ChatPendingTask> = z.object({
  task_id: z.string().optional(),
  status: z.string().optional(),
  created_at: z.string().optional(),
  supports_queue: z.boolean().optional(),
  queued_tasks: ChatQueuedTasksSchema.optional(),
}).loose();

export const EMPTY_CHAT_PENDING_TASK: ChatPendingTask = {};

export const SendChatMessageResponseSchema: z.ZodType<SendChatMessageResponse> = z.object({
  message_id: z.string().min(1),
  task_id: z.string().min(1),
  supports_queue: z.boolean().optional(),
  queued: z.boolean().optional().catch(undefined),
  created_at: z.string().min(1),
  attachment_ids: z.array(z.string()).nullish().transform((ids) => ids ?? undefined),
}).loose();

// `started` is the only field the flow branches on, and a malformed response
// must not be read as "the opening landed" 鈥?parseWithFallback's fallback says
// it did not, which leaves the flow's own retry as the recovery path.
export const StartMikaOnboardingResponseSchema: z.ZodType<StartMikaOnboardingResponse> = z.object({
  started: z.boolean(),
  message_id: z.string().nullish().transform((id) => id ?? undefined),
  created_at: z.string().nullish().transform((at) => at ?? undefined),
}).loose();

export const PrioritizeQueuedChatTaskResponseSchema:
  z.ZodType<PrioritizeQueuedChatTaskResponse> = z.object({
    task_id: z.string(),
    active_task_id: z.string().optional(),
  }).loose();

export const EMPTY_PRIORITIZE_QUEUED_CHAT_TASK_RESPONSE:
  PrioritizeQueuedChatTaskResponse = { task_id: "" };

export const EMPTY_CHAT_DRAFT_RESTORES: ChatDraftRestoresResponse = {
  restores: [],
};

export const EMPTY_CANCEL_TASK_RESPONSE: CancelTaskResponse = {
  id: "",
  agent_id: "",
  runtime_id: "",
  issue_id: "",
  status: "cancelled",
  priority: 0,
  dispatched_at: null,
  started_at: null,
  completed_at: null,
  result: null,
  error: null,
  created_at: "",
};

export const AgentBuilderSessionSchema = z.object({
  session_id: z.string(),
  builder_agent_id: z.string(),
  runtime_id: z.string(),
}).loose();

export const EMPTY_AGENT_BUILDER_SESSION: AgentBuilderSession = {
  session_id: "",
  builder_agent_id: "",
  runtime_id: "",
};

/**
 * The stored configuration of a creation conversation. Every field falls back
 * to empty on its own: a draft written by a newer build (or truncated in
 * transit) must still restore the fields it does understand rather than
 * discarding the user's work wholesale.
 */
export const StoredAgentDraftSchema = z.object({
  name: z.string().catch(""),
  description: z.string().catch(""),
  instructions: z.string().catch(""),
  conversation_starters: z
    .array(
      z.object({
        label: z.string().catch(""),
        prompt: z.string().catch(""),
      }),
    )
    .catch([]),
  avatar_url: z.string().nullable().catch(null),
  model: z.string().catch(""),
  thinking_level: z.string().catch(""),
  service_tier: z.string().catch(""),
  skill_ids: z.array(z.string()).catch([]),
  permission_scope: z
    .enum(["private", "workspace", "members"])
    .catch("private"),
  member_ids: z.array(z.string()).catch([]),
  team_ids: z.array(z.string()).catch([]),
  qoder_agent_id: z.string().catch(""),
  applied_message_id: z.string().nullable().catch(null),
  dismissed_message_id: z.string().nullish().catch(null),
}).loose();

/**
 * One unfinished creation draft. Every field except the id has a safe empty
 * default: an older server that omits `runtime_id` must degrade to "let the
 * user pick" rather than dropping the whole row and losing the conversation.
 */
export const AgentBuilderSessionSummarySchema = z.object({
  session_id: z.string(),
  title: z.string().catch(""),
  runtime_id: z.string().catch(""),
  created_at: z.string().catch(""),
  updated_at: z.string().catch(""),
  last_message_content: z.string().catch(""),
  last_message_role: z.string().catch(""),
  last_message_at: z.string().catch(""),
  // Absent for a conversation the user has never hand-edited; the client then
  // replays the last <agent_draft> block instead of restoring a stored copy.
  draft: StoredAgentDraftSchema.nullish().catch(null),
}).loose();

export const AgentBuilderSessionListSchema = z.object({
  sessions: z.array(AgentBuilderSessionSummarySchema).catch([]),
}).loose();

export const EMPTY_AGENT_BUILDER_SESSION_LIST: {
  sessions: AgentBuilderSessionSummary[];
} = { sessions: [] };

export const AgentBuilderRuntimeSwitchSchema = z.object({
  runtime_id: z.string(),
}).loose();

// This endpoint returns 2xx only after the carrier has been bound to the
// runtime the caller asked for; anything else is a thrown error and no commit.
// So the safe fallback for an unparseable SUCCESS body is the requested id, not
// an empty one: the rebind did happen, and reporting "unknown" would leave the
// picker showing a runtime that is no longer executing 鈥?the exact split this
// endpoint exists to close.
export const agentBuilderRuntimeSwitchFallback = (
  requestedRuntimeID: string,
): AgentBuilderRuntimeSwitch => ({ runtime_id: requestedRuntimeID });

// Squad list responses carry lightweight membership previews used by hover
// cards. The preview fields are additive API fields, so older backends default
// cleanly to no preview instead of breaking newer frontends.
const SquadMemberPreviewSchema = z.object({
  member_type: z.string(),
  member_id: z.string(),
  role: z.string().default(""),
}).loose();

export const SquadSchema = z.object({
  id: z.string(),
  workspace_id: z.string(),
  name: z.string(),
  description: z.string().default(""),
  instructions: z.string().default(""),
  system_key: z.string().optional(),
  system_instructions: z.string().optional(),
  avatar_url: z.string().nullable().optional().transform((v) => v ?? null),
  leader_id: z.string(),
  creator_id: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  archived_at: z.string().nullable().optional().transform((v) => v ?? null),
  archived_by: z.string().nullable().optional().transform((v) => v ?? null),
  member_count: z.number().default(0),
  member_preview: z.array(SquadMemberPreviewSchema).default([]),
}).loose();

export const SquadListSchema = z.array(SquadSchema);
export const EMPTY_SQUAD_LIST: Squad[] = [];
export const EMPTY_SQUAD: Squad = {
  id: "",
  workspace_id: "",
  name: "",
  description: "",
  instructions: "",
  avatar_url: null,
  leader_id: "",
  creator_id: "",
  created_at: "",
  updated_at: "",
  archived_at: null,
  archived_by: null,
  member_count: 0,
  member_preview: [],
};

// Squad member status 鈥?backs the Squad detail page's Members tab. status
// is `string | null` (not the narrow `SquadMemberStatusValue` union) so a
// new server-side status doesn't fail the parse; the UI defaults to a
// neutral pill for unknown values.
const SquadActiveIssueBriefSchema = z.object({
  issue_id: z.string(),
  identifier: z.string(),
  title: z.string(),
  issue_status: z.string(),
}).loose();

const SquadMemberStatusSchema = z.object({
  member_type: z.string(),
  member_id: z.string(),
  status: z.string().nullable().optional().transform((v) => v ?? null),
  active_issues: z.array(SquadActiveIssueBriefSchema).default([]),
  last_active_at: z.string().nullable().optional().transform((v) => v ?? null),
}).loose();

export const SquadMemberStatusListResponseSchema = z.object({
  members: z.array(SquadMemberStatusSchema).default([]),
}).loose();

export const EMPTY_SQUAD_MEMBER_STATUS_LIST = { members: [] };

// Structured error body 鈥?POST /api/workspaces/:wsId/issues 409 conflict.
//
// When the server detects an active issue with the same title in the same
// workspace, it returns `{ code: "active_duplicate_issue", error, issue }`
// instead of letting the create through. The UI uses the embedded issue ref
// to offer "view existing" rather than dropping the user into a generic
// "create failed" toast.
//
// Strict guarantees:
//   - `code` is a literal so a future server rename (e.g. `duplicate_issue`)
//     fails the parse and falls back to a normal error toast 鈥?drift never
//     ships as a broken duplicate UI.
//   - `issue` is required; without an id/identifier/title the "view existing"
//     button has nothing to point at, so we'd rather fall back than guess.
//   - `issue.status` is intentionally OMITTED: the duplicate toast doesn't
//     render a StatusIcon (which has no fallback for unknown enum values),
//     so a future server-side rename of `status` must not knock this branch
//     out. `.loose()` lets the field pass through unchanged for any other
//     consumer.

export const DuplicateIssueErrorBodySchema = z.object({
  code: z.literal("active_duplicate_issue"),
  error: z.string().optional(),
  issue: z.object({
    id: z.string(),
    identifier: z.string(),
    title: z.string(),
  }).loose(),
}).loose();

// A destructive confirmation must fail closed on an incomplete plan. Do not
// default missing arrays to empty or silently discard malformed entries.
export const RuntimeAccessRevocationPlanSchema = z.object({
  code: z.enum(["runtime_has_nonowner_dependents", "runtime_access_revocation_plan_changed"]),
  nonowner_agents: z.array(z.object({ id: z.string().uuid(), name: z.string() })),
  active_task_ids: z.array(z.string().uuid()),
}).refine((body) =>
  new Set(body.nonowner_agents.map((agent) => agent.id)).size === body.nonowner_agents.length &&
  new Set(body.active_task_ids).size === body.active_task_ids.length,
).transform((body) => ({ agents: body.nonowner_agents, activeTaskIds: body.active_task_ids }));

export interface DuplicateIssueErrorBody {
  code: "active_duplicate_issue";
  error?: string;
  issue: {
    id: string;
    identifier: string;
    title: string;
  };
}

// Webhook delivery schemas 鈥?backing the Autopilot Deliveries section. Enums
// (`status`, `signature_status`, `provider`) are kept as `z.string()` so a
// future server-side value (e.g. a Stripe provider, a new dedupe state)
// degrades to a generic UI fallback rather than collapsing the list into
// the empty array. `.loose()` lets unknown fields pass through, matching
// the rule used by every other endpoint here.

const WebhookDeliverySchema = z.object({
  id: z.string(),
  workspace_id: z.string(),
  autopilot_id: z.string(),
  trigger_id: z.string(),
  provider: z.string(),
  event: z.string(),
  dedupe_key: z.string().nullable(),
  dedupe_source: z.string().nullable(),
  signature_status: z.string(),
  status: z.string(),
  attempt_count: z.number().default(0),
  // Older servers predate the durable dispatch queue. Defaults preserve
  // compatibility while the UI rolls out alongside the new worker.
  dispatch_attempts: z.number().default(0),
  available_at: z.string().default(""),
  content_type: z.string().nullable(),
  response_status: z.number().nullable(),
  autopilot_run_id: z.string().nullable(),
  replayed_from_delivery_id: z.string().nullable(),
  error: z.string().nullable(),
  reason_code: z.string().nullable().default(null),
  replay_idempotency_key: z.string().nullable().default(null),
  received_at: z.string(),
  last_attempt_at: z.string(),
  created_at: z.string(),
  // Detail-only fields. The list endpoint omits them; the detail endpoint
  // populates raw_body / selected_headers / response_body.
  selected_headers: z.record(z.string(), z.unknown()).nullable().optional(),
  raw_body: z.string().nullable().optional(),
  response_body: z.string().nullable().optional(),
}).loose();

export const ListWebhookDeliveriesResponseSchema = z.object({
  deliveries: z.array(WebhookDeliverySchema).default([]),
  total: z.number().default(0),
}).loose();

export const WebhookDeliveryResponseSchema = WebhookDeliverySchema;

export const EMPTY_LIST_WEBHOOK_DELIVERIES_RESPONSE: ListWebhookDeliveriesResponse = {
  deliveries: [],
  total: 0,
};

// Autopilot list schema. Enums (`status`, `execution_mode`, `trigger_kinds`,
// `last_run_status`) stay `z.string()` so future server-side values degrade
// to a generic UI fallback. The three derived fields (trigger_kinds /
// next_run_at / last_run_status) are list-endpoint-only and absent on older
// servers 鈥?optional by contract, the list renders "鈥? without them.

const AutopilotListItemSchema = z.object({
  id: z.string(),
  workspace_id: z.string(),
  title: z.string(),
  description: z.string().nullable().optional(),
  project_id: z.string().nullable().optional(),
  // Older servers (pre-MUL-2429) omit assignee_type; "agent" is the
  // documented default.
  assignee_type: z.string().default("agent"),
  assignee_id: z.string(),
  status: z.string(),
  execution_mode: z.string(),
  issue_title_template: z.string().nullable().optional(),
  created_by_type: z.string(),
  created_by_id: z.string(),
  last_run_at: z.string().nullable().optional(),
  created_at: z.string(),
  updated_at: z.string(),
  trigger_kinds: z.array(z.string()).optional(),
  next_run_at: z.string().nullable().optional(),
  last_run_status: z.string().nullable().optional(),
  // Per-caller write capability; absent on older servers (treated as unknown).
  can_write: z.boolean().optional(),
  // Narrower per-caller access-management capability (detail endpoint only).
  can_manage_access: z.boolean().optional(),
}).loose();

export const ListAutopilotsResponseSchema = z.object({
  autopilots: z.array(AutopilotListItemSchema).default([]),
  total: z.number().default(0),
}).loose();

export const EMPTY_LIST_AUTOPILOTS_RESPONSE = {
  autopilots: [],
  total: 0,
};

// Autopilot run (POST /trigger, GET /runs). Consumed by the "run now" flow,
// which branches on `status` to avoid a false-success toast (MUL-4525), so the
// response must be schema-parsed. `reason_code` is an additive, stable
// classification of a non-success run the UI localizes; older servers omit it.
// Defaults are conservative: an unreadable run degrades to a non-success status
// so the UI never shows success it cannot confirm. .loose() tolerates new fields.
export const AutopilotRunSchema = z.object({
  id: z.string().default(""),
  autopilot_id: z.string().default(""),
  trigger_id: z.string().nullable().default(null),
  source: z.string().default("manual"),
  status: z.string().default("failed"),
  issue_id: z.string().nullable().default(null),
  task_id: z.string().nullable().default(null),
  triggered_at: z.string().default(""),
  completed_at: z.string().nullable().default(null),
  failure_reason: z.string().nullable().default(null),
  reason_code: z.string().optional(),
  trigger_payload: z.unknown().default(null),
  result: z.unknown().default(null),
  created_at: z.string().default(""),
}).loose();

export const AutopilotQuotaUsageSchema = z.object({
  action: z.enum(["off", "observe", "enforce"]).default("off"),
  used: z.number().nullable().default(null),
  reserved: z.number().nullable().default(null),
  total: z.number().nullable().default(null),
  limit: z.number().nullable().default(null),
  reached: z.boolean().nullable().default(null),
  period_start: z.string().nullable().default(null),
  period_end: z.string().nullable().default(null),
  reset_at: z.string().nullable().default(null),
  blocked_counts: z.record(z.string(), z.number().int().nonnegative()).nullable().catch(null).default(null),
}).loose();

export const FALLBACK_AUTOPILOT_RUN: AutopilotRun = {
  id: "",
  autopilot_id: "",
  trigger_id: null,
  source: "manual",
  status: "failed",
  issue_id: null,
  task_id: null,
  triggered_at: "",
  completed_at: null,
  failure_reason: null,
  trigger_payload: null,
  result: null,
  created_at: "",
};

// Cron preview: the server is the authority on the next occurrences. No
// `.default([])` here 鈥?a missing or reshaped field must fail validation so it
// degrades to the `next_runs: null` fallback ("preview unreadable") instead of
// masquerading as a valid empty list ("this expression never fires").
export const CronPreviewResponseSchema = z.object({
  next_runs: z.array(z.string()),
}).loose();

export const UNREADABLE_CRON_PREVIEW_RESPONSE: CronPreviewResponse = {
  next_runs: null,
};

export const EMPTY_WEBHOOK_DELIVERY: WebhookDelivery = {
  id: "",
  workspace_id: "",
  autopilot_id: "",
  trigger_id: "",
  provider: "",
  event: "",
  dedupe_key: null,
  dedupe_source: null,
  signature_status: "not_required",
  status: "queued",
  attempt_count: 0,
  dispatch_attempts: 0,
  available_at: "",
  content_type: null,
  response_status: null,
  autopilot_run_id: null,
  replayed_from_delivery_id: null,
  error: null,
  reason_code: null,
  replay_idempotency_key: null,
  received_at: "",
  last_attempt_at: "",
  created_at: "",
};

// User (`/api/me` GET + PATCH). The auth store and Settings 鈫?Account both
// trust this shape 鈥?a drift here would knock both surfaces out. Kept
// lenient by the same rules as IssueSchema: enums stay `z.string()`,
// nullable fields are unioned with `null`, unknown server fields pass
// through via `.loose()`. `profile_description` is the field added in
// MUL-2406; the server emits `""` when unset (NOT NULL DEFAULT ''), so
// the schema defaults to `""` too 鈥?keeps the type tight without
// breaking older backends that don't return the column yet.

export const UserSchema = z.object({
  id: z.string(),
  name: z.string().default(""),
  email: z.string().default(""),
  avatar_url: z.string().nullable().default(null),
  onboarded_at: z.string().nullable().default(null),
  onboarding_questionnaire: z.record(z.string(), z.unknown()).default({}),
  language: z.string().nullable().default(null),
  profile_description: z.string().default(""),
  timezone: z.string().nullable().default(null),
  // No default: absence is the "server cannot track" signal. A malformed
  // value degrades to that state instead of discarding the whole user.
  whats_new_seen_version: z.string().nullable().optional().catch(undefined),
  // Same "absent means unsupported" contract as above.
  star_prompt_shown_count: z.number().int().nonnegative().optional().catch(undefined),
  star_prompt_last_shown_at: z.string().nullable().optional().catch(undefined),
  star_prompt_starred_at: z.string().nullable().optional().catch(undefined),
  created_at: z.string().default(""),
  updated_at: z.string().default(""),
}).loose();

export const EMPTY_USER: User = {
  id: "",
  name: "",
  email: "",
  avatar_url: null,
  onboarded_at: null,
  onboarding_questionnaire: {},
  language: null,
  profile_description: "",
  timezone: null,
  created_at: "",
  updated_at: "",
};

// Cross-workspace unread inbox summary (`/api/inbox/unread-summary` GET).
// One entry per workspace the user belongs to that has unread items; the
// sidebar derives the workspace-switcher dot from it. Lenient per the usual
// rules so a future field addition can't blank the dot 鈥?on malformed JSON
// parseWithFallback returns the empty list, which simply hides the dot.

export const InboxUnreadSummarySchema = z.array(
  z
    .object({
      workspace_id: z.string(),
      count: z.number(),
    })
    .loose(),
);

export const EMPTY_INBOX_UNREAD_SUMMARY: InboxWorkspaceUnread[] = [];

// The viewer's unread issues (`/api/issues/unread` GET), behind the sidebar's
// unread dot. `outcome` stays a string so a future kind still lights the dot;
// on malformed JSON parseWithFallback returns the empty list, which hides it.

export const IssueUnreadPageSchema = z
  .object({
    items: z.array(
      z
        .object({
          issue_id: z.string(),
          outcome: z.string(),
          agent_id: z.string().nullish().transform((v) => v ?? null),
          task_id: z.string().nullish().transform((v) => v ?? null),
          comment_id: z.string().nullish().transform((v) => v ?? null),
          created_at: z.string(),
        })
        .loose(),
    ),
    next_cursor: z.string().nullish().transform((v) => v ?? null),
  })
  .loose();

export const EMPTY_ISSUE_UNREAD_PAGE: { items: IssueUnread[]; next_cursor: string | null } = {
  items: [],
  next_cursor: null,
};

// Reading one issue's notifications (`/api/inbox/issues/{id}/read` POST).
// `count` is how many rows the write read; the client refreshes its inbox
// caches only when it is above zero. A body without a usable count cannot say
// that nothing changed, so the client treats it as unknown and refreshes.
export const IssueInboxReadSchema = z
  .object({
    count: z.number().int().nonnegative(),
  })
  .loose();

// Deletion returns the number of notifications removed from the selected view.
export const InboxDeleteSchema = z
  .object({ count: z.number().int().nonnegative() })
  .loose();

// The viewer's subscribed issue ids (`/api/issues/subscribed` GET), behind the
// "subscribed" relation filter on client-filtered surfaces. A non-string entry
// is dropped; a body without the list has no safe fallback 鈥?an empty set
// would hide every row under the filter 鈥?so the client fails the request.
export const SubscribedIssueIdsSchema = z
  .object({
    issue_ids: z
      .array(z.unknown())
      .transform((ids) => ids.filter((id): id is string => typeof id === "string" && id.length > 0)),
  })
  .loose();

// Inbox items (`/api/inbox` and `/api/inbox/archived` GET).
// Lenient per the usual rules: `severity` / `type` / `recipient_type` stay
// `z.string()` so a notification kind this client doesn't know yet still
// parses and renders (the UI's type-label lookup already tolerates unknown
// kinds). Nullable optional fields are declared optional as well, since older
// rows can omit them entirely. On malformed JSON parseWithFallback returns the
// empty list 鈥?the affected view then reads as empty rather than white-
// screening the inbox. Both endpoints share this boundary because they return
// the same row shape and both feed the status/priority filter UI.

export const InboxItemListSchema = z.array(
  z
    .object({
      id: z.string(),
      workspace_id: z.string(),
      recipient_type: z.string(),
      recipient_id: z.string(),
      type: z.string(),
      severity: z.string(),
      issue_id: z.string().nullish(),
      title: z.string(),
      body: z.string().nullish(),
      issue_status: z.string().nullish(),
      issue_priority: z.string().nullish(),
      issue_project_id: z.string().nullish(),
      issue_assignee_type: z.string().nullish(),
      issue_assignee_id: z.string().nullish(),
      issue_due_date: z.string().nullish(),
      issue_label_ids: z.array(z.string()).nullish(),
      read: z.boolean(),
      archived: z.boolean(),
      created_at: z.string(),
    })
    .loose(),
);

export const ArchivedInboxPageSchema = z.object({
  items: InboxItemListSchema,
  next_cursor: z.string().min(1).nullable(),
  has_more: z.boolean(),
}).refine((page) => page.has_more === (page.next_cursor !== null) &&
  (!page.has_more || page.items.length > 0))
  .transform((page) => ({ items: page.items, nextCursor: page.next_cursor, hasMore: page.has_more }));

const FacetCountsSchema = z.record(z.string(), z.number().int().nonnegative());

// The type / project / assignee / label counts arrived later; an older server
// omits them, so they default to empty rather than failing the whole menu.
export const ArchivedInboxFacetsSchema = z.object({
  statuses: FacetCountsSchema,
  priorities: FacetCountsSchema,
  actors: FacetCountsSchema,
  types: FacetCountsSchema.optional(),
  projects: FacetCountsSchema.optional(),
  assignees: FacetCountsSchema.optional(),
  labels: FacetCountsSchema.optional(),
  unread_count: z.number().int().nonnegative(),
}).transform((facets) => ({
  statuses: facets.statuses, priorities: facets.priorities,
  actors: facets.actors, types: facets.types ?? {},
  projects: facets.projects ?? {}, assignees: facets.assignees ?? {},
  labels: facets.labels ?? {}, unreadCount: facets.unread_count,
}));

export const EMPTY_INBOX_ITEMS: InboxItem[] = [];

// Billing schemas (cloud-billing proxy surface)
//
// All billing JSON we receive comes from multica-cloud verbatim 鈥?we proxy
// the bytes without re-shaping. These schemas use `loose()` so a future
// non-breaking field addition on the cloud side doesn't crash us; required
// fields are still strictly enforced. EMPTY_* constants supply the
// fallback parseWithFallback uses when the upstream response is malformed
// or unparseable.

export const BillingBalanceSchema = z.object({
  owner_id: z.string(),
  balance_micro: z.number(),
  balance_credit: z.number(),
  updated_at: z.string(),
}).loose();

export const EMPTY_BILLING_BALANCE: BillingBalance = {
  owner_id: "",
  balance_micro: 0,
  balance_credit: 0,
  updated_at: "",
};

// `tx_type` and `source` are kept as plain strings here; the cloud doc
// enumerates the canonical values but the frontend display tolerates
// unknown ones gracefully. Strict enums would crash the page on a future
// addition (e.g. a new `topup` source kind).
export const BillingTransactionSchema = z.object({
  id: z.string(),
  owner_id: z.string(),
  idempotency_key: z.string().default(""),
  tx_type: z.string(),
  source: z.string(),
  amount_micro: z.number(),
  balance_after: z.number(),
  reference_id: z.string().default(""),
  description: z.string().default(""),
  metadata: z.record(z.string(), z.unknown()).default({}),
  created_at: z.string(),
}).loose();

export const BillingTransactionsPageSchema = z.object({
  items: z.array(BillingTransactionSchema).default([]),
  total: z.number().default(0),
  page: z.number().default(1),
  page_size: z.number().default(20),
}).loose();

export const EMPTY_BILLING_TRANSACTIONS_PAGE: BillingTransactionsPage = {
  items: [],
  total: 0,
  page: 1,
  page_size: 20,
};

export const BillingBatchSchema = z.object({
  id: z.string(),
  owner_id: z.string(),
  source_tx_id: z.string().default(""),
  source_type: z.string(),
  total_micro: z.number(),
  remaining_micro: z.number(),
  // Cloud either omits the key (never expires) or sends a string
  // timestamp. Null is also tolerated since some serializers emit
  // explicit nulls for absent timestamps.
  expires_at: z.string().nullable().optional(),
  created_at: z.string(),
  updated_at: z.string(),
}).loose();

export const BillingBatchesPageSchema = z.object({
  items: z.array(BillingBatchSchema).default([]),
  total: z.number().default(0),
  page: z.number().default(1),
  page_size: z.number().default(20),
}).loose();

export const EMPTY_BILLING_BATCHES_PAGE: BillingBatchesPage = {
  items: [],
  total: 0,
  page: 1,
  page_size: 20,
};

export const BillingTopupSchema = z.object({
  id: z.string(),
  owner_id: z.string(),
  amount_cents: z.number(),
  currency: z.string().default("usd"),
  credits: z.number(),
  bonus_credits: z.number().default(0),
  status: z.string(),
  tier_id: z.string().default(""),
  stripe_checkout_id: z.string().default(""),
  // Only set after status reaches `credited` 鈥?leave optional rather
  // than coerce to "" so a UI can branch on existence.
  purchase_batch_id: z.string().optional(),
  created_at: z.string(),
  updated_at: z.string(),
}).loose();

export const BillingTopupsPageSchema = z.object({
  items: z.array(BillingTopupSchema).default([]),
  total: z.number().default(0),
  page: z.number().default(1),
  page_size: z.number().default(20),
}).loose();

export const EMPTY_BILLING_TOPUPS_PAGE: BillingTopupsPage = {
  items: [],
  total: 0,
  page: 1,
  page_size: 20,
};

export const BillingPriceTierSchema = z.object({
  id: z.string(),
  // Cloud doc says display_name falls back to id; tolerate empty too.
  display_name: z.string().default(""),
  amount_cents: z.number(),
  credits: z.number(),
  bonus_credits: z.number().optional(),
  bonus_expires_in: z.string().optional(),
}).loose();

export const BillingPriceTierListSchema = z.array(BillingPriceTierSchema);

export const EMPTY_BILLING_PRICE_TIER_LIST: BillingPriceTier[] = [];

export const CreateBillingCheckoutSessionResponseSchema = z.object({
  order_id: z.string(),
  session_id: z.string(),
  url: z.string(),
}).loose();

export const EMPTY_CREATE_BILLING_CHECKOUT_SESSION_RESPONSE: CreateBillingCheckoutSessionResponse = {
  order_id: "",
  session_id: "",
  url: "",
};

export const BillingCheckoutSessionStatusSchema = z.object({
  order_id: z.string(),
  status: z.string(),
  amount_cents: z.number(),
  credits: z.number(),
  bonus_credits: z.number().default(0),
  currency: z.string().default("usd"),
  tier_id: z.string().default(""),
}).loose();

export const EMPTY_BILLING_CHECKOUT_SESSION_STATUS: BillingCheckoutSessionStatus = {
  order_id: "",
  status: "pending",
  amount_cents: 0,
  credits: 0,
  bonus_credits: 0,
  currency: "usd",
  tier_id: "",
};

export const CreateBillingPortalSessionResponseSchema = z.object({
  url: z.string(),
}).loose();

export const EMPTY_CREATE_BILLING_PORTAL_SESSION_RESPONSE: CreateBillingPortalSessionResponse = {
  url: "",
};

// Workspace subscriptions (`/api/cloud-subscriptions/*`)
//
// These schemas are the compatibility boundary with multica-cloud. Three rules
// hold for all of them:
//
//  1. There is no fallback value. Callers get `null` on any parse failure and
//     must render "unavailable" 鈥?never a synthetic Free plan, because that
//     turns an upstream outage or an older cloud into a silent downgrade of a
//     paying workspace.
//  2. `.loose()` keeps unknown keys, so a cloud that adds fields does not break
//     an older client.
//  3. `plan` and `status` stay open strings. A new plan or Stripe status must
//     surface as unknown rather than be coerced into a known one.

const WorkspaceSubscriptionIntervalSchema = z.enum(["month", "year"]);

// Stripe hosts Checkout and Portal, so those URLs leave the app. `z.string()
// .url()` is not enough on its own 鈥?`new URL("javascript:...")` parses 鈥?and
// the caller hands this value to location.assign, so the scheme is pinned here.
const StripeHostedURLSchema = z.string().url().refine(
  (value) => value.startsWith("https://"),
  { message: "Stripe hosted URL must use HTTPS" },
);

const WorkspaceEntitlementLimitSchema = z
  .discriminatedUnion("mode", [
    z
      .object({
        mode: z.literal("limited"),
        limit: z.number().int().positive(),
      })
      .loose(),
    z.object({ mode: z.literal("unlimited") }).loose(),
  ])
  .transform(
    (value): WorkspaceSubscriptionEntitlements["limits"]["issueCount"] =>
      value.mode === "limited"
        ? { mode: "limited", limit: value.limit }
        : { mode: "unlimited", limit: null },
  );

export const WorkspaceSubscriptionEntitlementsSchema = z
  .object({
    workspace_id: z.string(),
    plan: z.string(),
    status: z.string(),
    // Cloud documents seats as >= 1, but accepting 0 costs nothing and keeps a
    // workspace that momentarily reports no human members readable instead of
    // failing the whole snapshot.
    seats: z.number().int().nonnegative(),
    limits: z
      .object({
        issue_count: WorkspaceEntitlementLimitSchema,
        autopilot_runs: WorkspaceEntitlementLimitSchema,
      })
      .loose(),
    current_period_end: z.string().nullable().optional(),
    snapshot_expires_at: z.string().nullable().optional(),
    version: z.number().int().nonnegative(),
  })
  .loose()
  .transform(
    (value): WorkspaceSubscriptionEntitlements => ({
      workspaceId: value.workspace_id,
      plan: value.plan,
      status: value.status,
      seats: value.seats,
      limits: {
        issueCount: value.limits.issue_count,
        autopilotRuns: value.limits.autopilot_runs,
      },
      currentPeriodEnd: value.current_period_end ?? null,
      snapshotExpiresAt: value.snapshot_expires_at ?? null,
      version: value.version,
    }),
  );

export const WorkspaceSubscriptionSummarySchema = z
  .object({
    entitlement: WorkspaceSubscriptionEntitlementsSchema,
    billing_interval: WorkspaceSubscriptionIntervalSchema.nullable(),
    human_members: z.number().int().nonnegative(),
    seat_capacity: z
      .object({
        purchased: z.number().int().positive(),
        used: z.number().int().nonnegative(),
        reserved: z.number().int().nonnegative(),
        available: z.number().int().nonnegative(),
        overcommitted: z.boolean(),
        version: z.number().int().positive(),
        pending_quantity: z.number().int().positive().nullable(),
        active_purchase: z
          .object({
            request_id: z.string(),
            target_seats: z.number().int().positive(),
            status: z.enum(["pending", "processing", "submitted"]),
            expires_at: z.string().min(1).optional(),
          })
          .loose()
          .optional(),
      })
      .loose()
      .nullable(),
    cancel_at_period_end: z.boolean(),
    grace_until: z.string().nullable(),
    has_stripe_customer: z.boolean(),
    available_actions: z.object({
      checkout: z.boolean(),
      portal: z.boolean(),
      purchase_seats: z.boolean(),
    }).loose(),
  })
  .loose()
  .transform(
    (value): WorkspaceSubscriptionSummary => ({
      entitlement: value.entitlement,
      billingInterval: value.billing_interval,
      humanMembers: value.human_members,
      seatCapacity: value.seat_capacity
        ? {
            purchased: value.seat_capacity.purchased,
            used: value.seat_capacity.used,
            reserved: value.seat_capacity.reserved,
            available: value.seat_capacity.available,
            overcommitted: value.seat_capacity.overcommitted,
            version: value.seat_capacity.version,
            pendingQuantity: value.seat_capacity.pending_quantity,
            activePurchase: value.seat_capacity.active_purchase
              ? {
                  requestId:
                    value.seat_capacity.active_purchase.request_id,
                  targetSeats:
                    value.seat_capacity.active_purchase.target_seats,
                  status: value.seat_capacity.active_purchase.status,
                  expiresAt:
                    value.seat_capacity.active_purchase.expires_at ?? null,
                }
              : null,
          }
        : null,
      cancelAtPeriodEnd: value.cancel_at_period_end,
      graceUntil: value.grace_until,
      hasStripeCustomer: value.has_stripe_customer,
      availableActions: {
        checkout: value.available_actions.checkout,
        portal: value.available_actions.portal,
        purchaseSeats: value.available_actions.purchase_seats,
      },
    }),
  );

export const IssueLimitUsageSchema = z
  .object({
    used: z.number().int().nonnegative(),
    limit: z.number().int().positive(),
  })
  .loose()
  .transform(
    (value): IssueLimitUsage => ({
      used: value.used,
      limit: value.limit,
    }),
  );

const WorkspaceSubscriptionPriceSchema = (
  expected: "month" | "year",
) =>
  z
    .object({
      currency: z.string().min(1),
      // Reject 0 and negatives: a free or malformed Price must read as
      // "price unavailable", not as a real amount shown next to a purchase
      // button.
      unit_amount: z.number().int().positive(),
      // Pinned to the slot it arrived in. Cloud validates this too, but a
      // schema that accepted a yearly Price under `month` would let the UI
      // quote a yearly amount as a monthly one 鈥?the schema is an independent
      // boundary, so it checks the correspondence itself.
      interval: z.literal(expected),
      interval_count: z.literal(1),
    })
    .loose()
    .transform(
      (value): WorkspaceSubscriptionPrice => ({
        currency: value.currency,
        unitAmount: value.unit_amount,
        interval: value.interval,
        intervalCount: value.interval_count,
      }),
    );

export const WorkspaceSubscriptionPricesSchema = z
  .object({
    month: WorkspaceSubscriptionPriceSchema("month"),
    year: WorkspaceSubscriptionPriceSchema("year"),
  })
  .loose()
  .transform(
    (value): WorkspaceSubscriptionPrices => ({
      month: value.month,
      year: value.year,
    }),
  );

export const CreateWorkspaceSubscriptionCheckoutResponseSchema = z
  .object({
    request_id: z.string(),
    session_id: z.string(),
    url: StripeHostedURLSchema,
  })
  .loose()
  .transform(
    (value): CreateWorkspaceSubscriptionCheckoutResponse => ({
      requestId: value.request_id,
      sessionId: value.session_id,
      url: value.url,
    }),
  );

export const WorkspaceSubscriptionSeatReconcileResultSchema = z
  .object({
    workspace_id: z.string(),
    action: z.string(),
    version: z.number().int().nonnegative(),
  })
  .loose()
  .transform(
    (value): WorkspaceSubscriptionSeatReconcileResult => ({
      workspaceId: value.workspace_id,
      action: value.action,
      version: value.version,
    }),
  );

export const WorkspaceSeatPurchasePreviewSchema = z
  .object({
    current_seats: z.number().int().positive(),
    additional_seats: z.number().int().positive(),
    resulting_seats: z.number().int().positive(),
    purchase_version: z.number().int().positive(),
    currency: z.string().regex(/^[a-z]{3}$/),
    proration_amount: z.number().int().nonnegative(),
    next_invoice_amount: z.number().int().nonnegative(),
    quoted_at: z.string().min(1),
  })
  .loose()
  .transform(
    (value): WorkspaceSeatPurchasePreview => ({
      currentSeats: value.current_seats,
      additionalSeats: value.additional_seats,
      resultingSeats: value.resulting_seats,
      purchaseVersion: value.purchase_version,
      currency: value.currency,
      prorationAmount: value.proration_amount,
      nextInvoiceAmount: value.next_invoice_amount,
      quotedAt: value.quoted_at,
    }),
  );

export const PurchaseWorkspaceSeatsResponseSchema = z
  .object({
    request_id: z.string(),
    current_seats: z.number().int().positive(),
    additional_seats: z.number().int().positive(),
    resulting_seats: z.number().int().positive(),
    currency: z.string().regex(/^[a-z]{3}$/),
    proration_amount: z.number().int().nonnegative(),
    next_invoice_amount: z.number().int().nonnegative(),
    status: z.enum(["pending", "submitted", "confirmed"]),
  })
  .loose()
  .transform(
    (value): PurchaseWorkspaceSeatsResponse => ({
      requestId: value.request_id,
      currentSeats: value.current_seats,
      additionalSeats: value.additional_seats,
      resultingSeats: value.resulting_seats,
      currency: value.currency,
      prorationAmount: value.proration_amount,
      nextInvoiceAmount: value.next_invoice_amount,
      status: value.status,
    }),
  );

export const CreateWorkspaceSubscriptionPortalResponseSchema = z
  .object({
    url: StripeHostedURLSchema,
  })
  .loose()
  .transform(
    (value): CreateWorkspaceSubscriptionPortalResponse => ({
      url: value.url,
    }),
  );

// Runtime model discovery (`POST /api/runtimes/:id/models`,
// `GET /api/runtimes/:id/models/:requestId`). Both endpoints return the same
// request record, and the UI drives a state machine off `status`, so the two
// fields that decide behaviour are pinned: `status` gates the polling loop and
// `supported` gates whether the picker is usable at all. Everything else stays
// lenient per the rules at the top of this file.
//
// `status` deliberately stays `z.string()` (a newer server may add a state);
// `resolveRuntimeModels` treats anything it does not recognise as an explicit
// failure rather than a completed-but-empty catalog. `supported` defaults to
// true so a server old enough to omit it keeps the picker enabled instead of
// rendering "managed by runtime" off an `undefined`.
//
// `cached` / `cached_at` are additive markers for a snapshot served from the
// server-side catalog cache (MUL-5444); an older backend omits them.

const RuntimeModelThinkingLevelSchema = z.object({
  value: z.string(),
  label: z.string().default(""),
  description: z.string().optional(),
}).loose();

const RuntimeModelThinkingSchema = z.object({
  supported_levels: z.array(RuntimeModelThinkingLevelSchema).default([]),
  default_level: z.string().optional(),
}).loose();

const RuntimeModelServiceTierSchema = z.object({
  id: z.string(),
  name: z.string().default(""),
  description: z.string().optional(),
}).loose();

// A model entry with no `id` is unselectable 鈥?`onChange(m.id)` would persist
// an empty model 鈥?so `id` is required and a malformed entry drops the whole
// response to the fallback rather than rendering a dead row.
const RuntimeModelSchema = z.object({
  id: z.string(),
  label: z.string().default(""),
  provider: z.string().optional(),
  default: z.boolean().optional(),
  thinking: RuntimeModelThinkingSchema.nullable().optional()
    .transform((v) => v ?? undefined),
  service_tiers: z.array(RuntimeModelServiceTierSchema).optional(),
  supports_explicit_standard_service_tier: z.boolean().optional(),
}).loose();

// A row the runtime named but will not run (MUL-6961). Parsed from its own
// top-level list, never from `models`, so nothing here can become a selectable
// value. `id` is required for the same reason it is on RuntimeModelSchema 鈥?a
// row without one cannot even be keyed in a list.
const RuntimeUnavailableModelSchema = z.object({
  id: z.string(),
  label: z.string().default(""),
  reason: z.string().optional(),
}).loose();

export const RuntimeModelListRequestSchema = z.object({
  id: z.string().default(""),
  runtime_id: z.string().default(""),
  status: z.string(),
  models: z.array(RuntimeModelSchema).optional(),
  // Absent on any daemon or server older than the field, which simply means
  // the picker shows no unavailable section.
  unavailable_models: z.array(RuntimeUnavailableModelSchema).optional(),
  supported: z.boolean().default(true),
  error: z.string().optional(),
  created_at: z.string().default(""),
  updated_at: z.string().default(""),
  cached: z.boolean().optional(),
  cached_at: z.string().optional(),
}).loose();

// Fallback for an unparseable model-discovery response. `failed` is the only
// honest choice: `completed` would fabricate an empty catalog (and silently
// clear a saved model when `supported` is read as false), while `pending`
// would spin the picker until the client-side poll timeout. `failed` surfaces
// "discovery failed" immediately and leaves the creatable manual-entry field
// working, which is the same degradation as a real discovery failure.
export const MALFORMED_RUNTIME_MODEL_LIST_REQUEST: RuntimeModelListRequest = {
  id: "",
  runtime_id: "",
  status: "failed",
  supported: true,
  error: "invalid model discovery response",
  created_at: "",
  updated_at: "",
};

export const DingTalkInstallationSchema = z.object({
  id: z.string(),
  workspace_id: z.string().default(""),
  agent_id: z.string().default(""),
  installer_user_id: z.string().default(""),
  status: z.string().default("revoked"),
  installed_at: z.string().default(""),
  created_at: z.string().default(""),
  updated_at: z.string().default(""),
  agent_available: z.boolean().optional(),
  bound_dingtalk_user_ids: z.array(z.string()).catch([]).default([]),
}).loose();

export const EMPTY_DINGTALK_INSTALLATION: DingTalkInstallation = {
  id: "",
  workspace_id: "",
  agent_id: "",
  installer_user_id: "",
  status: "revoked",
  installed_at: "",
  created_at: "",
  updated_at: "",
  bound_dingtalk_user_ids: [],
};

export const ListDingTalkInstallationsResponseSchema = z.object({
  installations: z.array(DingTalkInstallationSchema).default([]),
  configured: z.boolean().default(false),
  install_supported: z.boolean().optional(),
}).loose();

export const EMPTY_LIST_DINGTALK_INSTALLATIONS_RESPONSE: ListDingTalkInstallationsResponse = {
  installations: [],
  configured: false,
};

export const DingTalkGroupBotSchema = z.object({
  installation_id: z.string().default(""),
  agent_id: z.string().default(""),
  bot_name: z.string().default(""),
  bot_identity_issue: z.string().default(""),
  last_active_at: z.string().optional(),
  mention_count: z.number().int().nonnegative().optional(),
}).loose();

export const DingTalkGroupSchema = z.object({
  conversation_id: z.string(),
  conversation_title: z.string().default(""),
  bots: z.array(DingTalkGroupBotSchema).catch([]).default([]),
}).loose();

export const ListDingTalkGroupsResponseSchema = z.object({
  groups: z.array(DingTalkGroupSchema).default([]),
  group_discovery_supported: z.boolean().default(false),
  inactive_group_counts: z.record(z.string(), z.number().int().nonnegative()).optional(),
  bot_identities: z.record(z.string(), DingTalkGroupBotSchema).optional(),
  next_offset: z.number().int().nonnegative().optional(),
}).loose();

export const EMPTY_LIST_DINGTALK_GROUPS_RESPONSE: ListDingTalkGroupsResponse = {
  groups: [],
  group_discovery_supported: false,
};

export const RedeemDingTalkBindingTokenResponseSchema = z.object({
  workspace_id: z.string().default(""),
  installation_id: z.string().default(""),
  dingtalk_user_id: z.string().default(""),
}).loose();

export const EMPTY_REDEEM_DINGTALK_BINDING_TOKEN_RESPONSE: RedeemDingTalkBindingTokenResponse = {
  workspace_id: "",
  installation_id: "",
  dingtalk_user_id: "",
};

// WeCom smart-bot ("鏅鸿兘鏈哄櫒浜? / aibot) installation responses. `.loose()` so a
// newer backend field never fails the parse on an older desktop build (see
// CLAUDE.md 鈫?API Compatibility). Defaults are chosen so a malformed response
// degrades safely: `configured` defaults false (renders the "ask your operator"
// state rather than a Connect dialog whose submit is guaranteed to fail), and a
// missing `status` defaults to "revoked" rather than "active" so a broken read
// never shows a bot as connected when it may not be.
export const WecomInstallationSchema = z.object({
  id: z.string(),
  workspace_id: z.string().default(""),
  agent_id: z.string().default(""),
  bot_id: z.string().default(""),
  installer_user_id: z.string().default(""),
  status: z.string().default("revoked"),
}).loose();

export const EMPTY_WECOM_INSTALLATION: WecomInstallation = {
  id: "",
  workspace_id: "",
  agent_id: "",
  bot_id: "",
  installer_user_id: "",
  status: "revoked",
};

export const ListWecomInstallationsResponseSchema = z.object({
  installations: z.array(WecomInstallationSchema).default([]),
  configured: z.boolean().default(false),
  install_supported: z.boolean().optional(),
  // The settings tab gates the QR install entry point on this, so it is
  // declared and validated here rather than left to pass through the loose
  // object unchecked.
  scan_install_supported: z.boolean().optional(),
}).loose();

export const EMPTY_LIST_WECOM_INSTALLATIONS_RESPONSE: ListWecomInstallationsResponse = {
  installations: [],
  configured: false,
};

export const BeginWecomInstallResponseSchema = z.object({
  session_id: z.string(),
  status: z.string().default("error"),
  poll_interval_seconds: z.number().optional().default(1),
}).loose();

// A malformed begin response degrades to a terminal error rather than a session
// the client would poll forever with an empty id.
export const MALFORMED_BEGIN_WECOM_INSTALL_RESPONSE: BeginWecomInstallResponse = {
  session_id: "",
  status: "error",
  poll_interval_seconds: 1,
};

export const WecomInstallStatusResponseSchema = z.object({
  status: z.string().default("error"),
  qr_code_url: z.string().optional(),
  expires_in_seconds: z.number().optional(),
  poll_interval_seconds: z.number().optional().default(2),
  installation_id: z.string().optional(),
  error_reason: z.string().optional(),
}).loose();

// Same reasoning: an unparseable status stops the poll loop instead of leaving
// the dialog spinning on a response nobody can read.
export const MALFORMED_WECOM_INSTALL_STATUS_RESPONSE: WecomInstallStatusResponse = {
  status: "error",
  poll_interval_seconds: 2,
  error_reason: "internal_error",
};

export const RedeemWecomBindingTokenResponseSchema = z.object({
  workspace_id: z.string().default(""),
  installation_id: z.string().default(""),
  wecom_user_id: z.string().default(""),
}).loose();

export const EMPTY_REDEEM_WECOM_BINDING_TOKEN_RESPONSE: RedeemWecomBindingTokenResponse = {
  workspace_id: "",
  installation_id: "",
  wecom_user_id: "",
};

export const TelegramInstallationSchema = z.object({
  id: z.string(),
  workspace_id: z.string().default(""),
  agent_id: z.string().default(""),
  bot_id: z.string().default(""),
  bot_username: z.string().default(""),
  installer_user_id: z.string().default(""),
  status: z.string().default("revoked"),
  installed_at: z.string().default(""),
  created_at: z.string().default(""),
  updated_at: z.string().default(""),
}).loose();

export const EMPTY_TELEGRAM_INSTALLATION: TelegramInstallation = {
  id: "",
  workspace_id: "",
  agent_id: "",
  bot_id: "",
  bot_username: "",
  installer_user_id: "",
  status: "revoked",
  installed_at: "",
  created_at: "",
  updated_at: "",
};

export const ListTelegramInstallationsResponseSchema = z.object({
  installations: z.array(TelegramInstallationSchema).default([]),
  configured: z.boolean().default(false),
  install_supported: z.boolean().optional(),
}).loose();

export const EMPTY_LIST_TELEGRAM_INSTALLATIONS_RESPONSE: ListTelegramInstallationsResponse = {
  installations: [],
  configured: false,
};

export const RedeemTelegramBindingTokenResponseSchema = z.object({
  workspace_id: z.string().default(""),
  installation_id: z.string().default(""),
  telegram_user_id: z.string().default(""),
}).loose();

export const EMPTY_REDEEM_TELEGRAM_BINDING_TOKEN_RESPONSE: RedeemTelegramBindingTokenResponse = {
  workspace_id: "",
  installation_id: "",
  telegram_user_id: "",
};

// Skills. Introduced for `POST /api/skills/:id/refresh` (update a skill from
// its imported source). `config` stays a loose record: the server owns the
// `origin` provenance shape and may extend it freely.
export const SkillFileSchema = z.object({
  id: z.string(),
  skill_id: z.string(),
  path: z.string(),
  content: z.string().optional().default(""),
  created_at: z.string().optional().default(""),
  updated_at: z.string().optional().default(""),
}).loose();

// Workspace list shape (`GET /api/skills`). Intentionally no `content` /
// `files`: those belong on the detail endpoint. Defaulting them here used
// to invent empty bodies on every list row (GH #2174).
export const SkillSummarySchema = z.object({
  id: z.string(),
  workspace_id: z.string(),
  name: z.string(),
  description: z.string().optional().default(""),
  config: z.record(z.string(), z.unknown()).optional().default({}),
  created_by: z.string().nullable().optional().default(null),
  created_at: z.string().optional().default(""),
  updated_at: z.string().optional().default(""),
  enabled: z.boolean().optional(),
  // Catch-to-empty so a missing/malformed labels field cannot fail the
  // whole skill (or the list it lives in). Older backends omit it; the
  // filter treats an empty array as "no labels".
  labels: z.array(LabelSchema).catch([]),
}).loose();

export const EMPTY_SKILL_SUMMARY: SkillSummary = {
  id: "",
  workspace_id: "",
  name: "",
  description: "",
  config: {},
  created_by: null,
  created_at: "",
  updated_at: "",
  labels: [],
};

export const SkillSchema = SkillSummarySchema.extend({
  content: z.string().optional().default(""),
  files: z.array(SkillFileSchema).optional().default([]),
}).loose();

export const EMPTY_SKILL: Skill = {
  ...EMPTY_SKILL_SUMMARY,
  content: "",
  files: [],
};

export const SkillSummaryListSchema = z.array(SkillSummarySchema).default([]);

const SKILL_VERSION_SOURCES = [
  "baseline",
  "create",
  "update",
  "import",
  "refresh",
  "restore",
] as const;

export const SkillVersionSummarySchema = z.object({
  id: z.string(),
  skill_id: z.string(),
  version: z.number(),
  name: z.string().optional().default(""),
  source: z.enum(SKILL_VERSION_SOURCES).catch("update"),
  restored_from_version: z.number().nullable().optional().default(null),
  created_by: z.string().nullable().optional().default(null),
  created_at: z.string().optional().default(""),
}).loose();

export const SkillVersionSummaryListSchema = z
  .array(SkillVersionSummarySchema)
  .default([]);

export const EMPTY_SKILL_VERSION_SUMMARY_LIST: SkillVersionSummary[] = [];

export const SkillVersionSchema = SkillVersionSummarySchema.extend({
  description: z.string().optional().default(""),
  content: z.string().optional().default(""),
  files: z
    .array(z.object({ path: z.string(), content: z.string().optional().default("") }).loose())
    .optional()
    .default([]),
}).loose();

export const EMPTY_SKILL_VERSION: SkillVersion = {
  id: "",
  skill_id: "",
  version: 0,
  name: "",
  source: "update",
  restored_from_version: null,
  created_by: null,
  created_at: "",
  description: "",
  content: "",
  files: [],
};

export const EMPTY_SKILL_SUMMARY_LIST: SkillSummary[] = [];

export const SkillImportExistingSkillSchema = z.object({
  id: z.string(),
  name: z.string(),
  created_by: z.string().optional(),
  can_overwrite: z.boolean().optional(),
}).loose();

/**
 * Envelope of POST /api/skills/import.
 *
 * `status` stays a plain string (not an enum) so a status added by a newer
 * backend still parses and its `reason` survives to the user. `z.enum` here
 * would fail the whole envelope on an unknown value, drop the server's reason
 * and leave only a generic "Import failed" 鈥?the server field is a bare
 * `string`, so it is free to grow. `skillFromImportResult` has the default
 * branch: anything outside created/updated is treated as a failure.
 */
export const SkillImportResultSchema = z.object({
  status: z.string().default("failed"),
  reason: z.string().optional().default(""),
  skill: SkillSchema.optional(),
  existing_skill: SkillImportExistingSkillSchema.optional(),
}).loose();

export const EMPTY_SKILL_IMPORT_RESULT: SkillImportResult = {
  status: "failed",
  reason: "",
};

/**
 * Read shape of one workspace MCP server.
 *
 * This is the ONLY schema in this file that must not be `.loose()`. Everywhere
 * else, keeping unknown fields is forward-compatibility; here it would be a
 * hole in the write-only boundary 鈥?a server that regressed to returning the
 * stored entry (or a `url` / `headers` on the summary) would have it land in
 * the parsed object and in the query cache. zod strips unknown keys by
 * default, so the client only ever holds the safe summary.
 *
 * `transport` stays a plain string (not an enum) so an unknown value from a
 * newer backend still parses 鈥?the UI has a default branch for it.
 */
export const WorkspaceMcpServerSchema = z.object({
  id: z.string().default(""),
  workspace_id: z.string().default(""),
  name: z.string().default(""),
  transport: z.string().default("unknown"),
  enabled: z.boolean().optional(),
  // Older servers omit it; a malformed value drops to "unknown" rather than
  // failing the whole list.
  agent_count: z.number().int().nonnegative().optional().catch(undefined),
  created_at: z.string().default(""),
  updated_at: z.string().default(""),
});

export const WorkspaceMcpServerListSchema = z.array(WorkspaceMcpServerSchema);

export const EMPTY_WORKSPACE_MCP_SERVER: WorkspaceMcpServer = {
  id: "",
  workspace_id: "",
  name: "",
  transport: "unknown",
  created_at: "",
  updated_at: "",
};

// Share links. Introduced with the workspace share-link invite flow; schemas
// mirror the API responses so malformed payloads fall back to safe defaults.
export const ShareLinkSchema = z.object({
  id: z.string(),
  workspace_id: z.string(),
  code: z.string(),
  created_by: z.string(),
  role: z.string(),
  expires_at: z.string().nullable().optional().default(null),
  max_uses: z.number().nullable().optional().default(null),
  use_count: z.number().optional().default(0),
  is_active: z.boolean().optional().default(true),
  created_at: z.string().optional().default(""),
  creator_name: z.string().optional().default(""),
  creator_email: z.string().optional().default(""),
}).loose();

export const EMPTY_SHARE_LINK: ShareLink = {
  id: "",
  workspace_id: "",
  code: "",
  created_by: "",
  role: "member",
  expires_at: null,
  max_uses: null,
  use_count: 0,
  is_active: false,
  created_at: "",
};

export const ShareLinkListResponseSchema = z.array(ShareLinkSchema).default([]);

export const ShareLinkInfoSchema = z.object({
  workspace_name: z.string().optional().default(""),
  workspace_slug: z.string().optional().default(""),
  creator_name: z.string().optional().default(""),
  role: z.string().optional().default("member"),
}).loose();

export const EMPTY_SHARE_LINK_INFO: ShareLinkInfo = {
  workspace_name: "",
  workspace_slug: "",
  role: "member",
};

export const MemberWithUserSchema = z.object({
  id: z.string(),
  workspace_id: z.string(),
  user_id: z.string(),
  role: z.string(),
  created_at: z.string().optional().default(""),
  name: z.string().optional().default(""),
  email: z.string().optional().default(""),
  avatar_url: z.string().nullable().optional().default(null),
}).loose();

export const JoinShareLinkResponseSchema = z.object({
  member: MemberWithUserSchema,
  workspace_id: z.string(),
  workspace_slug: z.string().optional().default(""),
}).loose();

export const EMPTY_JOIN_SHARE_LINK_RESPONSE: {
  member: MemberWithUser;
  workspace_id: string;
  workspace_slug: string;
} = {
  member: {
    id: "",
    workspace_id: "",
    user_id: "",
    role: "member",
    created_at: "",
    name: "",
    email: "",
    avatar_url: null,
  },
  workspace_id: "",
  workspace_slug: "",
};

export const WakeupConditionSchema = z.union([
  z.object({ type: z.literal("issue_field"), field: z.literal("status"), value: z.string() }),
  z.object({ type: z.literal("issue_field"), field: z.literal("assignee"), assignee_type: z.enum(["member", "agent", "squad"]), assignee_id: z.string() }),
  z.object({ type: z.literal("issue_field"), field: z.literal("label"), label_id: z.string() }),
  z.object({ type: z.literal("issue_field"), field: z.literal("property"), property_id: z.string(), value: z.unknown() }),
  z.object({ type: z.literal("children_done"), stage: z.number().int().nullish() }),
  z.object({ type: z.literal("pull_request"), event: z.enum(["checks_finished", "merged", "conflicts"]) }),
  z.object({ type: z.literal("other_issue"), issue_id: z.string(), state: z.enum(["done", "ended", "in_review", "blocked"]), identifier: z.string().optional() }),
]);

export const WakeupRunSchema = z.object({
  id: z.string(), status: z.string(), created_at: z.string(),
  started_at: z.string().nullable(), completed_at: z.string().nullable(),
  checkin_note: z.string().default(""), triggers: z.array(z.string()).default([]),
  commented: z.boolean().default(false),
});

export const PausedWakeupSchema = z.object({
  issue_id: z.string(), id: z.string(), agent_id: z.string(),
  paused_reason: z.enum(["max_fires", "loop", "rate"]).catch("rate"),
});

export const IssueWakeupSchema = z.object({
  id: z.string(), issue_id: z.string(), agent_id: z.string(), agent_name: z.string().default(""),
  instruction: z.string(), kind: z.enum(["event", "at", "every", "cron"]), mode: z.enum(["once", "continuous"]),
  event_types: z.array(z.string()), filter_agent_id: z.string().nullable(), filter_task_id: z.string().nullable(),
  interval_seconds: z.number().nullable(), cron_expression: z.string().nullable(), timezone: z.string(),
  next_fire_at: z.string().nullable(), enabled: z.boolean(), disabled_at: z.string().nullable(),
  last_task_id: z.string().nullable(), last_error: z.string().nullable(),
  filter_actor_type: z.enum(["member", "agent"]).nullable().optional(),
  filter_actor_id: z.string().nullable().optional(),
  filter_actor_name: z.string().nullable().optional(),
  revision: z.number().int().positive().optional(),
  filter_agent_name: z.string().nullable().optional(), last_task_status: z.string().nullable().optional(),
  expires_at: z.string().nullish(), expiry_seconds: z.number().nullish(),
  on_timeout: z.enum(["wake", "end"]).nullish().catch(null), timed_out_at: z.string().nullish(),
  created_by_agent: z.boolean().optional(), created_by_name: z.string().nullish(),
  source_agent_id: z.string().nullish(), source_agent_name: z.string().nullish(),
  // An unknown condition shape from a newer server reads as "no condition".
  condition: WakeupConditionSchema.nullish().catch(null),
  max_fires: z.number().int().nullish(), fire_count: z.number().int().nonnegative().optional().catch(undefined),
  paused_reason: z.enum(["max_fires", "loop", "rate"]).nullish().catch(null),
});

export const SystemWakeupSchema = z.object({
  id: z.string().default(""), revision: z.number().int().nonnegative().default(0),
  rule: z.literal("child_done"), enabled: z.boolean(), instruction: z.string().default(""),
  default_instruction: z.string().default(""), customized: z.boolean().default(false),
  paused_reason: z.enum(["max_fires", "loop", "rate"]).nullish().catch(null).transform((v) => v ?? null),
  staged: z.boolean(), stage: z.number().int().nullable(), total: z.number().int().nonnegative(),
  remaining: z.number().int().nonnegative(), waiting: z.array(z.string()).default([]),
  target: z.object({ type: z.enum(["agent", "squad", "member"]), id: z.string(), name: z.string() }).nullable().catch(null),
  blocked: z.enum(["", "backlog", "member_assignee", "no_assignee"]).catch(""),
  workspace_default: z.boolean().default(true),
});

export const WorkspaceSystemWakeupSchema = z.object({
  rule: z.literal("child_done"), enabled: z.boolean().default(true), instruction: z.string().default(""),
  builtin_instruction: z.string().default(""), customized: z.number().int().nonnegative().default(0),
});

export const IssueWakeupSummaryRowSchema = IssueWakeupSchema.pick({
  id: true, issue_id: true, agent_id: true, agent_name: true, kind: true, mode: true,
  event_types: true, filter_task_id: true, filter_agent_name: true, interval_seconds: true,
  filter_actor_type: true, filter_actor_id: true, filter_actor_name: true,
  cron_expression: true, timezone: true, next_fire_at: true, condition: true,
}).extend({ active_count: z.number().int().positive(), event_count: z.number().int().nonnegative() });

export const WorkspaceWakeupPageSchema = z.object({
  items: z.array(IssueWakeupSchema.omit({ instruction: true }).extend({
    issue_title: z.string(), issue_identifier: z.string(), issue_closed: z.boolean(),
    can_manage: z.boolean(), active_runs: z.number().int().nonnegative(),
    task: AgentTaskSchema.nullable(),
    // System rule rows have no target when the issue has no agent assignee,
    // and no revision.
    agent_id: z.string().nullish().transform((v) => v ?? ""),
    revision: z.number().int().positive().nullish().catch(undefined).transform((v) => v ?? undefined),
    source: z.enum(["member", "agent", "system"]).catch("member").default("member"),
    runs_7d: z.number().int().nonnegative().default(0),
    rule: z.literal("child_done").nullish().catch(null),
    system_stage: z.number().int().nullish(), system_remaining: z.number().int().nullish(),
    target_type: z.string().nullish(),
  })),
  total: z.number().int().nonnegative(),
  counts: z.object({
    active: z.number().int().nonnegative(), all: z.number().int().nonnegative(),
    paused: z.number().int().nonnegative().default(0),
    disabled: z.number().int().nonnegative(), ended: z.number().int().nonnegative(),
  }),
  agents: z.array(z.object({ id: z.string(), name: z.string() })),
});

// Older servers omit runtime_type; the protocol remains their compatibility target.
export const RuntimeProfileSchema = z
  .object({
    id: z.string(),
    workspace_id: z.string(),
    display_name: z.string(),
    protocol_family: z.string(),
    runtime_type: z.string().nullish().catch(undefined),
    command_name: z.string(),
    description: z.string().nullable().catch(null),
    fixed_args: z.array(z.string()).catch([]),
    visibility: z.string().catch("workspace"),
    created_by: z.string().nullable().catch(null),
    enabled: z.boolean().catch(true),
    created_at: z.string().catch(""),
    updated_at: z.string().catch(""),
  })
  .passthrough()
  .transform((profile) => ({
    ...profile,
    runtime_type: profile.runtime_type || profile.protocol_family,
  }));
export const RuntimeProfileListSchema = z.array(RuntimeProfileSchema);

// Receipt evidence is optional across mixed server/desktop versions. A malformed
// timestamp must never render the binding as verified.
export const LarkInstallationSchema = z.object({
  id: z.string(),
  workspace_id: z.string().default(""),
  agent_id: z.string().default(""),
  app_id: z.string().default(""),
  bot_open_id: z.string().default(""),
  installer_user_id: z.string().default(""),
  tenant_key: z.string().nullable().optional(),
  status: z.string().default("revoked"),
  region: z.string().optional(),
  installed_at: z.string().default(""),
  created_at: z.string().default(""),
  updated_at: z.string().default(""),
  first_message_received_at: z.iso.datetime({ offset: true }).nullable().optional().catch(undefined),
}).loose();

export const ListLarkInstallationsResponseSchema = z.object({
  installations: z.array(LarkInstallationSchema).default([]),
  configured: z.boolean().default(false),
  install_supported: z.boolean().optional(),
}).loose();

export const EMPTY_LIST_LARK_INSTALLATIONS_RESPONSE: ListLarkInstallationsResponse = {
  installations: [],
  configured: false,
};

// Connected Apps (MUL-8516). Enum fields the UI indexes into label tables
// fall back to their most cautious value, so a value this client does not
// know yet renders as something safe instead of a missing label; statuses
// and outcomes stay strings because their renderers already handle unknowns.

const appNullableString = z.string().nullish().transform((v) => v ?? null);
const AppAccountScopeSchema = z.enum(["team", "personal"]).catch("personal");
const AppAccessLevelSchema = z.enum(["read", "confirm_writes", "write"]).catch("confirm_writes");
const AppActionClassSchema = z.enum(["read", "write", "send", "delete", "share"]).catch("send");
const AppActionPolicySchema = z.enum(["allow", "confirm", "block"]).catch("confirm");
const AppCatalogModeSchema = z.enum(["all", "curated", "custom"]).catch("curated");

const AppConnectionSchema = z.object({
  id: z.string(),
  toolkit_slug: z.string(),
  status: z.string().default("active"),
  connected_by: appNullableString,
  connected_at: z.string().default(""),
  last_used_at: appNullableString,
  actions_blocked: z.boolean().default(false).catch(false),
}).loose();

const AgentAppSchema = z.object({
  agent_id: z.string(),
  toolkit_slug: z.string(),
  account_scope: AppAccountScopeSchema,
  level: AppAccessLevelSchema,
}).loose();

export const AppsOverviewSchema = z.object({
  catalog_mode: AppCatalogModeSchema,
  allowed_toolkits: z.array(z.string()).default([]).catch([]),
  can_manage: z.boolean().default(false).catch(false),
  team: z.array(AppConnectionSchema).default([]),
  personal: z.array(AppConnectionSchema).default([]),
  agent_apps: z.array(AgentAppSchema).default([]),
}).loose();

const AppCatalogEntrySchema = z.object({
  slug: z.string(),
  name: z.string().default(""),
  logo: z.string().optional().catch(undefined),
  category: z.string().optional().catch(undefined),
  curated: z.boolean().default(false).catch(false),
  recommended_scope: AppAccountScopeSchema.optional(),
  allowed: z.boolean().optional().catch(undefined),
}).loose();

export const AppCatalogResponseSchema = z.object({
  catalog_mode: AppCatalogModeSchema,
  apps: z.array(AppCatalogEntrySchema).default([]),
}).loose();

export const AppSettingsResponseSchema = z.object({
  catalog_mode: AppCatalogModeSchema,
  allowed_toolkits: z.array(z.string()).default([]).catch([]),
}).loose();

export const AppRulesResponseSchema = z.object({
  rules: z.array(z.object({
    action_class: AppActionClassSchema,
    policy: AppActionPolicySchema,
    default_policy: AppActionPolicySchema,
    custom: z.boolean().default(false).catch(false),
  }).loose()).default([]),
}).loose();

export const AppActivityResponseSchema = z.object({
  calls: z.array(z.object({
    id: z.string(),
    agent_id: z.string(),
    issue_id: appNullableString,
    chat_session_id: appNullableString,
    triggered_by: appNullableString,
    tool_slug: z.string(),
    action_class: AppActionClassSchema,
    outcome: z.string(),
    error: appNullableString,
    created_at: z.string(),
  }).loose()).default([]),
}).loose();

export const TeamAppImpactSchema = z.object({
  agents: z.array(z.object({ id: z.string(), name: z.string().default("") }).loose()).default([]),
  active_tasks: z.number().default(0).catch(0),
  active_autopilots: z.number().default(0).catch(0),
  pending_requests: z.number().default(0).catch(0),
}).loose();

export const AgentAppsResponseSchema = z.object({
  apps: z.array(AgentAppSchema).default([]),
}).loose();

export const AppRequestSchema = z.object({
  id: z.string(),
  kind: z.enum(["action", "connect"]).catch("action"),
  status: z.string(),
  agent_id: z.string(),
  issue_id: appNullableString,
  chat_session_id: appNullableString,
  approver_user_id: z.string(),
  account_scope: AppAccountScopeSchema,
  toolkit_slug: z.string(),
  tool_slug: z.string().default(""),
  action_class: AppActionClassSchema,
  summary: z.string().default(""),
  arguments: z.record(z.string(), z.unknown()).optional().catch(undefined),
  approved_arguments: z.record(z.string(), z.unknown()).optional().catch(undefined),
  result: z.unknown().optional(),
  error: appNullableString,
  reason: appNullableString,
  // Withhold the details unless the server said otherwise.
  redacted: z.boolean().default(true).catch(true),
  expires_at: z.string(),
  decided_by: appNullableString,
  decided_at: appNullableString,
  created_at: z.string(),
}).loose();

export const AppRequestListSchema = z.object({
  requests: z.array(AppRequestSchema).default([]),
  next_before: appNullableString,
}).loose();

export const AppToolsResponseSchema = z.object({
  tools: z.array(z.object({
    slug: z.string(),
    name: z.string().default(""),
    description: z.string().default(""),
    auto_class: AppActionClassSchema,
    class: AppActionClassSchema,
    overridden: z.boolean().default(false).catch(false),
  }).loose()).default([]),
}).loose();

export const IssueAppCallsResponseSchema = z.object({
  calls: z.array(z.object({
    id: z.string(),
    task_id: appNullableString,
    agent_id: z.string(),
    account_scope: AppAccountScopeSchema,
    account_owner_user_id: appNullableString,
    toolkit_slug: z.string(),
    tool_slug: z.string(),
    action_class: AppActionClassSchema,
    outcome: z.string(),
    request_id: appNullableString,
    error: appNullableString,
    created_at: z.string(),
  }).loose()).default([]),
}).loose();

export const AppConnectInitSchema = z.object({ redirect_url: z.string().min(1) }).loose();

export const EMPTY_APPS_OVERVIEW: AppsOverview = {
  catalog_mode: "curated",
  allowed_toolkits: [],
  can_manage: false,
  team: [],
  personal: [],
  agent_apps: [],
};

export const EMPTY_APP_CATALOG: AppCatalogResponse = { catalog_mode: "curated", apps: [] };

export const EMPTY_TEAM_APP_IMPACT: TeamAppImpact = {
  agents: [],
  active_tasks: 0,
  active_autopilots: 0,
  pending_requests: 0,
};

// Only `pinned_at` is new here; every other field keeps its pre-schema
// leniency so one odd workspace can never empty the whole switcher.
export const WorkspaceListItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  created_at: z.string(),
  pinned_at: z.iso.datetime({ offset: true }).nullable().optional().catch(null).default(null),
}).loose();

export const WorkspacePinnedSchema = z.object({
  pinned_at: z.iso.datetime({ offset: true }).nullable().catch(null),
});

// --- Workbench ledgers (docs/engineering/WORKBENCH-API.md 搂2/搂3) -----------
//
// Seven ledger records. Two rules shape every schema below:
//
// 1. Enums stay `z.string()` (or a plain string with a default) so a server that
//    adds a collab stage, a post source or a settlement kind still parses. The
//    wire type in `types/workbench.ts` is the union the UI default-cases against;
//    an unknown value must degrade one row's presentation, never the ledger.
// 2. Nullable columns are `.nullable().default(null)` and counters default to 0,
//    so a row written before a column existed parses instead of failing the page.
//
// Money arrives as a JSON number (the server converts NUMERIC(14,2)); `currency`
// travels beside it, and the amount fields never default to 0 鈥?null means
// "not quoted yet", which the UI renders differently from a quoted zero.

const workbenchNullableString = z.string().nullable().default(null);
const workbenchNullableNumber = z.number().nullable().default(null);

/** orange's own tag vocabulary, copied verbatim (id + name + colour). */
export const CreatorTagSchema = z.object({
  id: z.string().default(""),
  name: z.string().default(""),
  color: workbenchNullableString,
}).loose();

export const CreatorSchema = z.object({
  id: z.string(),
  workspace_id: z.string().default(""),
  kind: z.string().default("external"),
  display_name: z.string().default(""),
  platform: z.string().default(""),
  handle: z.string().default(""),
  url: workbenchNullableString,
  fans: z.number().default(0),
  fans_d7: z.number().default(0),
  avg_play: z.number().default(0),
  engagement_rate: workbenchNullableNumber,
  category: workbenchNullableString,
  audience_note: workbenchNullableString,
  region: workbenchNullableString,
  price_note: workbenchNullableString,
  score: workbenchNullableNumber,
  risk_flag: z.boolean().default(false),
  blacklist_reason: workbenchNullableString,
  owner_member_id: workbenchNullableString,
  media_ip_project_id: workbenchNullableString,
  created_by: workbenchNullableString,
  created_at: z.string().default(""),
  updated_at: z.string().default(""),
  archived_at: workbenchNullableString,
  // Mirrored from orange (docs/engineering/ORANGE-SYNC.md). Defaults are null
  // because the ledger surface did not carry them before the mirror existed: an
  // old server must not fail the parse.
  sec_uid: workbenchNullableString,
  douyin_id: workbenchNullableString,
  dy_uid: workbenchNullableString,
  fans_display: workbenchNullableString,
  quote_min: workbenchNullableNumber,
  quote_max: workbenchNullableNumber,
  cooperation_intent: workbenchNullableString,
  lead_status: workbenchNullableString,
  last_dm_at: workbenchNullableString,
  likes_total: workbenchNullableNumber,
  following_count: workbenchNullableNumber,
  verify_type: workbenchNullableString,
  tags: z.array(CreatorTagSchema).default([]),
  source_type: workbenchNullableString,
  source_keyword: workbenchNullableString,
  source_rank: workbenchNullableNumber,
  source_system: workbenchNullableString,
  source_id: workbenchNullableString,
  // The newest content-health snapshot, joined on by the list endpoint only
  // (WORKBENCH-API 搂19). Optional rather than defaulted so a `GET /creators/{id}`
  // response 鈥?which returns the row and nothing joined 鈥?stays a valid parse.
  hit_rate: workbenchNullableNumber.optional(),
  posts_last_30d: workbenchNullableNumber.optional(),
  videos_with_stats: workbenchNullableNumber.optional(),
  metric_captured_on: workbenchNullableString.optional(),
}).loose();

export const EMPTY_CREATOR: Creator = {
  id: "", workspace_id: "", kind: "external", display_name: "", platform: "",
  handle: "", url: null, fans: 0, fans_d7: 0, avg_play: 0, engagement_rate: null,
  category: null, audience_note: null, region: null, price_note: null, score: null,
  risk_flag: false, blacklist_reason: null, owner_member_id: null,
  media_ip_project_id: null, created_by: null, created_at: "", updated_at: "",
  archived_at: null,
  sec_uid: null, douyin_id: null, dy_uid: null, fans_display: null,
  quote_min: null, quote_max: null, cooperation_intent: null, lead_status: null,
  last_dm_at: null, likes_total: null, following_count: null, verify_type: null,
  tags: [], source_type: null, source_keyword: null, source_rank: null,
  source_system: null, source_id: null,
};

/**
 * One mirrored work (WORKBENCH-DATA-CONTRACT 搂2.1). Every counter is nullable:
 * "not collected yet" is NULL, not 0, so the drawer can draw its dash instead of
 * claiming a video got no plays.
 */
export const CreatorVideoSchema = z.object({
  id: z.string(),
  workspace_id: z.string().default(""),
  creator_id: z.string().default(""),
  aweme_id: z.string().default(""),
  desc_text: workbenchNullableString,
  topics: z.array(z.string()).default([]),
  create_time: workbenchNullableString,
  duration_ms: workbenchNullableNumber,
  digg_count: workbenchNullableNumber,
  comment_count: workbenchNullableNumber,
  share_count: workbenchNullableNumber,
  play_count: workbenchNullableNumber,
  cover_url: workbenchNullableString,
  video_url: workbenchNullableString,
  stats_collected_at: workbenchNullableString,
  source_system: workbenchNullableString,
  source_id: workbenchNullableString,
  created_at: z.string().default(""),
  updated_at: z.string().default(""),
  // Never sent: the read only returns live works. Defaulted so the parsed object
  // is a `CreatorVideo`.
  archived_at: workbenchNullableString,
}).loose();

export const EMPTY_CREATOR_VIDEO: CreatorVideo = {
  id: "", workspace_id: "", creator_id: "", aweme_id: "", desc_text: null,
  topics: [], create_time: null, duration_ms: null, digg_count: null,
  comment_count: null, share_count: null, play_count: null, cover_url: null,
  video_url: null, stats_collected_at: null, source_system: null, source_id: null,
  created_at: "", updated_at: "", archived_at: null,
};

export const CreatorVideoListResponseSchema = z.object({
  videos: z.array(CreatorVideoSchema).default([]),
  total: z.number().default(0),
}).loose();

export const EMPTY_CREATOR_VIDEO_LIST_RESPONSE: CreatorVideoListResponse = {
  videos: [],
  total: 0,
};

export const CreatorListResponseSchema = z.object({
  creators: z.array(CreatorSchema).default([]),
  total: z.number().default(0),
  // Cursor paging: absent/null means this is the last page.
  next_cursor: workbenchNullableString,
}).loose();

export const EMPTY_CREATOR_LIST_RESPONSE: CreatorListResponse = {
  creators: [],
  total: 0,
  next_cursor: null,
};

export const CreatorPostSchema = z.object({
  id: z.string(),
  workspace_id: z.string().default(""),
  creator_id: z.string().default(""),
  collab_id: workbenchNullableString,
  content_issue_id: workbenchNullableString,
  // 713: the affiliate pointers a product placement carries (搂11). Null for a
  // post that ran no 灏忛粍杞?and for rows imported before the columns existed.
  product_id: workbenchNullableString,
  pick_id: workbenchNullableString,
  // 733: the script version this post was published from (section 12).
  media_script_id: workbenchNullableString,
  platform: z.string().default(""),
  title: workbenchNullableString,
  url: z.string().default(""),
  published_at: z.string().default(""),
  source: z.string().default("manual"),
  created_by: workbenchNullableString,
  created_at: z.string().default(""),
  updated_at: z.string().default(""),
  archived_at: workbenchNullableString,
}).loose();

export const EMPTY_CREATOR_POST: CreatorPost = {
  id: "", workspace_id: "", creator_id: "", collab_id: null,
  content_issue_id: null, product_id: null, pick_id: null, media_script_id: null, platform: "", title: null,
  url: "", published_at: "", source: "manual", created_by: null, created_at: "",
  updated_at: "", archived_at: null,
};

export const CreatorPostListResponseSchema = z.object({
  posts: z.array(CreatorPostSchema).default([]),
  total: z.number().default(0),
}).loose();

export const EMPTY_CREATOR_POST_LIST_RESPONSE: CreatorPostListResponse = {
  posts: [],
  total: 0,
};

// Every measure is nullable: a platform that reports only likes must not look
// like it reported zero plays (docs/METRICS.md rule 3).
export const CreatorPostMetricSchema = z.object({
  id: z.string(),
  workspace_id: z.string().default(""),
  post_id: z.string().default(""),
  captured_on: z.string().default(""),
  play: workbenchNullableNumber,
  likes: workbenchNullableNumber,
  comments: workbenchNullableNumber,
  shares: workbenchNullableNumber,
  clicks: workbenchNullableNumber,
  converts: workbenchNullableNumber,
  gmv_amount: workbenchNullableNumber,
  currency: z.string().default("CNY"),
  source: z.string().default("manual"),
  created_at: z.string().default(""),
  updated_at: z.string().default(""),
}).loose();

export const EMPTY_CREATOR_POST_METRIC: CreatorPostMetric = {
  id: "", workspace_id: "", post_id: "", captured_on: "", play: null, likes: null,
  comments: null, shares: null, clicks: null, converts: null, gmv_amount: null,
  currency: "CNY", source: "manual", created_at: "", updated_at: "",
};

export const CreatorPostMetricListResponseSchema = z.object({
  metrics: z.array(CreatorPostMetricSchema).default([]),
  total: z.number().default(0),
}).loose();

export const EMPTY_CREATOR_POST_METRIC_LIST_RESPONSE: CreatorPostMetricListResponse = {
  metrics: [],
  total: 0,
};

// Content health (WORKBENCH-API 搂19, WORKBENCH-DATA-CONTRACT 搂2.2). Every measure
// is nullable because NULL is the contract's "not computable" 鈥?a zero here would
// be a claim about the creator, and `sample_note` carries the reason instead.
export const CreatorMetricSchema = z.object({
  id: z.string(),
  workspace_id: z.string().default(""),
  creator_id: z.string().default(""),
  captured_on: z.string().default(""),
  video_count: workbenchNullableNumber,
  videos_with_stats: workbenchNullableNumber,
  posts_last_30d: workbenchNullableNumber,
  avg_digg: workbenchNullableNumber,
  avg_comment: workbenchNullableNumber,
  avg_share: workbenchNullableNumber,
  // Deliberately unclamped: values above 1 are real upstream data and mean the
  // follower count disagrees with the works.
  engagement_rate: workbenchNullableNumber,
  hit_rate: workbenchNullableNumber,
  sample_note: workbenchNullableString,
  created_at: z.string().default(""),
  updated_at: z.string().default(""),
}).loose();

export const EMPTY_CREATOR_METRIC: CreatorMetric = {
  id: "", workspace_id: "", creator_id: "", captured_on: "", video_count: null,
  videos_with_stats: null, posts_last_30d: null, avg_digg: null, avg_comment: null,
  avg_share: null, engagement_rate: null, hit_rate: null, sample_note: null,
  created_at: "", updated_at: "",
};

/** One board row: a creator plus its latest snapshot, nulls intact. */
export const CreatorHealthSchema = z.object({
  id: z.string(),
  display_name: z.string().default(""),
  fans: z.number().default(0),
  engagement_rate: workbenchNullableNumber,
  hit_rate: workbenchNullableNumber,
  posts_last_30d: workbenchNullableNumber,
  videos_with_stats: workbenchNullableNumber,
  captured_on: workbenchNullableString,
}).loose();

export const EMPTY_CREATOR_HEALTH: CreatorHealth = {
  id: "", display_name: "", fans: 0, engagement_rate: null, hit_rate: null,
  posts_last_30d: null, videos_with_stats: null, captured_on: null,
};

export const CreatorHealthListResponseSchema = z.object({
  creators: z.array(CreatorHealthSchema).default([]),
  total: z.number().default(0),
  next_cursor: workbenchNullableString,
}).loose();

export const EMPTY_CREATOR_HEALTH_LIST_RESPONSE: CreatorHealthListResponse = {
  creators: [],
  total: 0,
  next_cursor: null,
};

export const CreatorHealthDetailResponseSchema = z.object({
  creator_id: z.string().default(""),
  latest: CreatorMetricSchema.nullable().default(null),
  recent: z.array(CreatorMetricSchema).default([]),
}).loose();

export const EMPTY_CREATOR_HEALTH_DETAIL_RESPONSE: CreatorHealthDetailResponse = {
  creator_id: "",
  latest: null,
  recent: [],
};

export const CrmClientSchema = z.object({
  id: z.string(),
  workspace_id: z.string().default(""),
  name: z.string().default(""),
  brand: workbenchNullableString,
  industry: workbenchNullableString,
  contact_name: workbenchNullableString,
  contact_channel: workbenchNullableString,
  contract_entity: workbenchNullableString,
  payment_terms: workbenchNullableString,
  credit_note: workbenchNullableString,
  owner_member_id: workbenchNullableString,
  created_by: workbenchNullableString,
  created_at: z.string().default(""),
  updated_at: z.string().default(""),
  archived_at: workbenchNullableString,
}).loose();

export const EMPTY_CRM_CLIENT: CrmClient = {
  id: "", workspace_id: "", name: "", brand: null, industry: null,
  contact_name: null, contact_channel: null, contract_entity: null,
  payment_terms: null, credit_note: null, owner_member_id: null, created_by: null,
  created_at: "", updated_at: "", archived_at: null,
};

export const CrmClientListResponseSchema = z.object({
  clients: z.array(CrmClientSchema).default([]),
  total: z.number().default(0),
}).loose();

export const EMPTY_CRM_CLIENT_LIST_RESPONSE: CrmClientListResponse = {
  clients: [],
  total: 0,
};

export const CrmBriefSchema = z.object({
  id: z.string(),
  workspace_id: z.string().default(""),
  client_id: z.string().default(""),
  title: z.string().default(""),
  category: workbenchNullableString,
  budget_min_amount: workbenchNullableNumber,
  budget_max_amount: workbenchNullableNumber,
  target_audience: workbenchNullableString,
  deliverable_type: workbenchNullableString,
  // TEXT[] NOT NULL DEFAULT '{}': a brief with no platform filter is an empty
  // list, never null.
  platforms: z.array(z.string()).default([]),
  schedule_from: workbenchNullableString,
  schedule_to: workbenchNullableString,
  kpi_play: workbenchNullableNumber,
  kpi_gmv_amount: workbenchNullableNumber,
  status: z.string().default("draft"),
  owner_member_id: workbenchNullableString,
  created_by: workbenchNullableString,
  created_at: z.string().default(""),
  updated_at: z.string().default(""),
  archived_at: workbenchNullableString,
}).loose();

export const EMPTY_CRM_BRIEF: CrmBrief = {
  id: "", workspace_id: "", client_id: "", title: "", category: null,
  budget_min_amount: null, budget_max_amount: null, target_audience: null,
  deliverable_type: null, platforms: [], schedule_from: null, schedule_to: null,
  kpi_play: null, kpi_gmv_amount: null, status: "draft", owner_member_id: null,
  created_by: null, created_at: "", updated_at: "", archived_at: null,
};

export const CrmBriefListResponseSchema = z.object({
  briefs: z.array(CrmBriefSchema).default([]),
  total: z.number().default(0),
}).loose();

export const EMPTY_CRM_BRIEF_LIST_RESPONSE: CrmBriefListResponse = {
  briefs: [],
  total: 0,
};

/**
 * The audit fold a workbench GET carries (COLLAB-MODEL §2): the newest event
 * about the row. Degrades to null — a row whose trail predates migration 819 has
 * none, and a missing annotation must not blank the row it annotates.
 */
export const WorkbenchLastActorSchema = z
  .object({
    type: z.string().default(""),
    id: workbenchNullableString,
    action: z.string().default(""),
    at: z.string().default(""),
  })
  .nullable()
  .default(null);

/** `member | agent`; free text on the wire like every workbench enum. */
export const workbenchAssigneeType = z.string().nullable().default(null);

/**
 * A ledger row's discussion (COLLAB-MODEL §5). Degrades to null like the trail
 * above: a row on a server that predates B4-3 has no thread, and `null` also covers
 * "nobody opened one yet" — both render as "no discussion", never as an error.
 *
 * `state` is free text on the wire (`linked | gone`); anything unrecognised is
 * treated as `gone` by the renderer rather than assumed linkable, because a link to
 * an issue this client cannot describe is worse than saying the discussion is
 * archived.
 */
export const WorkbenchThreadSchema = z
  .object({
    issue_id: z.string().default(""),
    number: z.number().default(0),
    title: z.string().default(""),
    status: z.string().default(""),
    state: z.string().default("gone"),
    comment_count: z.number().default(0),
    last_comment_at: workbenchNullableString,
    last_comment_preview: workbenchNullableString,
  })
  .nullable()
  .default(null);

export const EMPTY_WORKBENCH_THREAD: WorkbenchThread = {
  issue_id: "", number: 0, title: "", status: "", state: "gone",
  comment_count: 0, last_comment_at: null, last_comment_preview: null,
};

export const CrmCollabSchema = z.object({
  id: z.string(),
  workspace_id: z.string().default(""),
  brief_id: z.string().default(""),
  creator_id: z.string().default(""),
  stage: z.string().default("inquiry"),
  quote_amount: workbenchNullableNumber,
  final_amount: workbenchNullableNumber,
  prob: workbenchNullableNumber,
  creator_fee: workbenchNullableNumber,
  sample_cost: workbenchNullableNumber,
  platform_fee: workbenchNullableNumber,
  currency: z.string().default("CNY"),
  settlement_mode: workbenchNullableString,
  commission_rate: workbenchNullableNumber,
  sample_required: z.boolean().default(false),
  script_required: z.boolean().default(false),
  scheduled_at: workbenchNullableString,
  confirmed_at: workbenchNullableString,
  published_at: workbenchNullableString,
  accepted_at: workbenchNullableString,
  issue_id: workbenchNullableString,
  owner_member_id: workbenchNullableString,
  created_by: workbenchNullableString,
  created_at: z.string().default(""),
  updated_at: z.string().default(""),
  archived_at: workbenchNullableString,
  // Fulfilment (WORKBENCH-API 搂20.2, migration 810). Absent on a server that
  // predates them; null means "not published / not settled", not "empty string".
  publish_url: workbenchNullableString,
  settled_on: workbenchNullableString,
  // Assignment, concurrency and the trail (COLLAB-MODEL §1/§2/§3, migration
  // 821). Absent on a server that predates them: `revision: 1` matches the
  // column default, and a missing `assignee_*` reads as unassigned rather than
  // rejecting the row.
  assignee_type: workbenchAssigneeType,
  assignee_id: workbenchNullableString,
  revision: z.number().default(1),
  last_actor: WorkbenchLastActorSchema,
  // The row's discussion (COLLAB-MODEL §5, B4-3). Null when nobody opened one.
  thread: WorkbenchThreadSchema,
}).loose();

export const EMPTY_CRM_COLLAB: CrmCollab = {
  id: "", workspace_id: "", brief_id: "", creator_id: "", stage: "inquiry",
  quote_amount: null, final_amount: null, prob: null, creator_fee: null,
  sample_cost: null, platform_fee: null, currency: "CNY", settlement_mode: null,
  commission_rate: null, sample_required: false, script_required: false,
  scheduled_at: null, confirmed_at: null, published_at: null, accepted_at: null,
  issue_id: null, owner_member_id: null, created_by: null, created_at: "",
  updated_at: "", archived_at: null, publish_url: null, settled_on: null,
  assignee_type: null, assignee_id: null, revision: 1, last_actor: null, thread: null,
};

export const CrmCollabListResponseSchema = z.object({
  collabs: z.array(CrmCollabSchema).default([]),
  total: z.number().default(0),
}).loose();

export const EMPTY_CRM_COLLAB_LIST_RESPONSE: CrmCollabListResponse = {
  collabs: [],
  total: 0,
};

export const CrmSettlementSchema = z.object({
  id: z.string(),
  workspace_id: z.string().default(""),
  collab_id: z.string().default(""),
  kind: z.string().default("final"),
  // The one non-nullable amount: a settlement row exists to move money.
  amount: z.number().default(0),
  currency: z.string().default("CNY"),
  due_at: workbenchNullableString,
  paid_at: workbenchNullableString,
  invoice_no: workbenchNullableString,
  note: workbenchNullableString,
  created_by: workbenchNullableString,
  created_at: z.string().default(""),
  updated_at: z.string().default(""),
  archived_at: workbenchNullableString,
  // Assignment, concurrency and the trail (COLLAB-MODEL §1/§2/§3).
  assignee_type: workbenchAssigneeType,
  assignee_id: workbenchNullableString,
  revision: z.number().default(1),
  last_actor: WorkbenchLastActorSchema,
}).loose();

export const EMPTY_CRM_SETTLEMENT: CrmSettlement = {
  id: "", workspace_id: "", collab_id: "", kind: "final", amount: 0,
  currency: "CNY", due_at: null, paid_at: null, invoice_no: null, note: null,
  created_by: null, created_at: "", updated_at: "", archived_at: null,
  assignee_type: null, assignee_id: null, revision: 1, last_actor: null,
};

export const CrmSettlementListResponseSchema = z.object({
  settlements: z.array(CrmSettlementSchema).default([]),
  total: z.number().default(0),
}).loose();

export const EMPTY_CRM_SETTLEMENT_LIST_RESPONSE: CrmSettlementListResponse = {
  settlements: [],
  total: 0,
};

// --- BD pipeline (`/api/workbench/bd`, WORKBENCH-API 搂20) -------------------
//
// Three ledgers plus one aggregate. Same leniency rules as the CRM block above:
// every field degrades rather than rejecting the row, because a renamed or missing
// key must not blank a page that could still show the rest. Two states are
// distinct and both load-bearing:
//
//   * `null` means "not recorded" (a note with no outcome, a draft with no
//     `quoted_at`), which is not an empty string and not a zero;
//   * a cockpit number carries `empty: "insufficient_data"` with `value: null`
//     when nothing was summed, so the client can draw a gap instead of 锟?.00.

export const BdActivitySchema = z.object({
  id: z.string(),
  workspace_id: z.string().default(""),
  creator_id: z.string().default(""),
  kind: z.string().default("note"),
  happened_at: z.string().default(""),
  summary: z.string().default(""),
  outcome: workbenchNullableString,
  next_follow_at: workbenchNullableString,
  owner_member_id: workbenchNullableString,
  created_by: workbenchNullableString,
  created_at: z.string().default(""),
  updated_at: z.string().default(""),
  // Assignment, concurrency and the trail (COLLAB-MODEL §1/§2/§3).
  assignee_type: workbenchAssigneeType,
  assignee_id: workbenchNullableString,
  revision: z.number().default(1),
  last_actor: WorkbenchLastActorSchema,
}).loose();

export const EMPTY_BD_ACTIVITY: BdActivity = {
  id: "", workspace_id: "", creator_id: "", kind: "note", happened_at: "",
  summary: "", outcome: null, next_follow_at: null, owner_member_id: null,
  created_by: null, created_at: "", updated_at: "",
  assignee_type: null, assignee_id: null, revision: 1, last_actor: null,
};

export const BdActivityListResponseSchema = z.object({
  activities: z.array(BdActivitySchema).default([]),
  total: z.number().default(0),
}).loose();

export const EMPTY_BD_ACTIVITY_LIST_RESPONSE: BdActivityListResponse = {
  activities: [],
  total: 0,
};

export const BdQuoteSchema = z.object({
  id: z.string(),
  workspace_id: z.string().default(""),
  creator_id: z.string().default(""),
  brief_id: workbenchNullableString,
  status: z.string().default("draft"),
  quoted_at: workbenchNullableString,
  valid_until: workbenchNullableString,
  fee_amount: workbenchNullableNumber,
  // 0鈥?. A server that sent 20 would be a contract bug; the number is kept as it
  // arrived so the display layer can show what the server actually said.
  commission_rate: workbenchNullableNumber,
  currency: z.string().default("CNY"),
  // The line-item breakdown. An absent or malformed one degrades to the empty
  // array the column defaults to, never to null: the reader iterates it.
  items: z.array(z.unknown()).default([]),
  note: workbenchNullableString,
  owner_member_id: workbenchNullableString,
  created_by: workbenchNullableString,
  created_at: z.string().default(""),
  updated_at: z.string().default(""),
  // Assignment, concurrency and the trail (COLLAB-MODEL §1/§2/§3).
  assignee_type: workbenchAssigneeType,
  assignee_id: workbenchNullableString,
  revision: z.number().default(1),
  last_actor: WorkbenchLastActorSchema,
  // The quote's discussion, found by its origin stamp (COLLAB-MODEL §5, B4-3).
  thread: WorkbenchThreadSchema,
}).loose();

export const EMPTY_BD_QUOTE: BdQuote = {
  id: "", workspace_id: "", creator_id: "", brief_id: null, status: "draft",
  quoted_at: null, valid_until: null, fee_amount: null, commission_rate: null,
  currency: "CNY", items: [], note: null, owner_member_id: null, created_by: null,
  created_at: "", updated_at: "",
  assignee_type: null, assignee_id: null, revision: 1, last_actor: null, thread: null,
};

export const BdQuoteListResponseSchema = z.object({
  quotes: z.array(BdQuoteSchema).default([]),
  total: z.number().default(0),
}).loose();

export const EMPTY_BD_QUOTE_LIST_RESPONSE: BdQuoteListResponse = {
  quotes: [],
  total: 0,
};

// --- the review queue (`/api/workbench/review`, WORKBENCH-API §26) ----------
//
// Four ledgers flattened into one row shape, so the same leniency rules apply:
// every field degrades rather than rejecting the row. Two of them carry a
// meaning that must not be flattened into a default:
//
//   * `amount: null` is "this ledger has no money on this row" (a follow-up),
//     not zero — the row renders a dash, not ¥0;
//   * `changed_fields: []` means the server could not say what moved, which is
//     a weaker statement than "nothing moved", and the row says so.

export const ReviewQueueRowSchema = z
  .object({
    domain: z.string().default(""),
    id: z.string(),
    review_state: z.string().default("pending"),
    actor_type: z.string().default("member"),
    actor_id: workbenchNullableString,
    agent_name: workbenchNullableString,
    actor_name: workbenchNullableString,
    summary: z.string().default(""),
    changed_fields: z.array(z.string()).default([]),
    amount: workbenchNullableNumber,
    currency: z.string().default("CNY"),
    revision: z.number().default(1),
    created_at: z.string().default(""),
    updated_at: z.string().default(""),
  })
  .loose();

export const ReviewQueueResponseSchema = z
  .object({
    rows: z.array(ReviewQueueRowSchema).default([]),
    total: z.number().default(0),
  })
  .loose();

export const EMPTY_REVIEW_QUEUE_RESPONSE: ReviewQueueResponse = {
  rows: [],
  total: 0,
};

export const BdCampaignSchema = z.object({
  id: z.string(),
  workspace_id: z.string().default(""),
  name: z.string().default(""),
  kind: z.string().default("manual"),
  budget_amount: workbenchNullableNumber,
  currency: z.string().default("CNY"),
  started_on: workbenchNullableString,
  ended_on: workbenchNullableString,
  source_keyword: workbenchNullableString,
  creator_count: z.number().default(0),
  note: workbenchNullableString,
  owner_member_id: workbenchNullableString,
  created_by: workbenchNullableString,
  created_at: z.string().default(""),
  updated_at: z.string().default(""),
}).loose();

export const EMPTY_BD_CAMPAIGN: BdCampaign = {
  id: "", workspace_id: "", name: "", kind: "manual", budget_amount: null,
  currency: "CNY", started_on: null, ended_on: null, source_keyword: null,
  creator_count: 0, note: null, owner_member_id: null, created_by: null,
  created_at: "", updated_at: "",
};

export const BdCampaignListResponseSchema = z.object({
  campaigns: z.array(BdCampaignSchema).default([]),
  total: z.number().default(0),
}).loose();

export const EMPTY_BD_CAMPAIGN_LIST_RESPONSE: BdCampaignListResponse = {
  campaigns: [],
  total: 0,
};

/**
 * Which empty rule a cockpit number is in. A closed pair on purpose: an unknown
 * value degrades to `insufficient_data`, so a build that does not know a future
 * third state draws a gap rather than claiming a zero.
 */
const bdPipelineEmptyState = z
  .enum(["zero", "insufficient_data"])
  .catch("insufficient_data");

const BdPipelineNumberSchema = z
  .object({
    value: z.number().nullable().default(null),
    sample_count: z.number().default(0),
    empty: bdPipelineEmptyState,
  })
  .loose();

const BdPipelineMoneySchema = z
  .object({
    amount: z.number().nullable().default(null),
    // Present even while empty: the figure still has to be labelled.
    currency: z.string().default("CNY"),
    sample_count: z.number().default(0),
    empty: bdPipelineEmptyState,
  })
  .loose();

/** A number that never answers: what a missing block degrades to. */
const EMPTY_BD_PIPELINE_NUMBER: z.output<typeof BdPipelineNumberSchema> = {
  value: null,
  sample_count: 0,
  empty: "insufficient_data",
};

const EMPTY_BD_PIPELINE_MONEY: z.output<typeof BdPipelineMoneySchema> = {
  amount: null,
  currency: "CNY",
  sample_count: 0,
  empty: "insufficient_data",
};

const bdPipelineNumber = BdPipelineNumberSchema.default(
  EMPTY_BD_PIPELINE_NUMBER,
).catch(EMPTY_BD_PIPELINE_NUMBER);

const bdPipelineMoney = BdPipelineMoneySchema.default(EMPTY_BD_PIPELINE_MONEY).catch(
  EMPTY_BD_PIPELINE_MONEY,
);

export const BdPipelineSchema = z
  .object({
    creators: z
      .object({
        total: bdPipelineNumber,
        contacted: bdPipelineNumber,
        replied: bdPipelineNumber,
        quoted: bdPipelineNumber,
        signed: bdPipelineNumber,
        deal: bdPipelineNumber,
      })
      .loose(),
    quotes: z
      .object({
        open: bdPipelineNumber,
        accepted: bdPipelineNumber,
        rejected: bdPipelineNumber,
        total_fee: bdPipelineMoney,
      })
      .loose(),
    orders: z
      .object({
        open: bdPipelineNumber,
        delivered: bdPipelineNumber,
        settled: bdPipelineNumber,
        total_amount: bdPipelineMoney,
        paid_amount: bdPipelineMoney,
      })
      .loose(),
    followups: z
      .object({
        due_today: bdPipelineNumber,
        overdue: bdPipelineNumber,
      })
      .loose(),
  })
  .loose();

export const EMPTY_BD_PIPELINE: BdPipeline = {
  creators: {
    total: EMPTY_BD_PIPELINE_NUMBER,
    contacted: EMPTY_BD_PIPELINE_NUMBER,
    replied: EMPTY_BD_PIPELINE_NUMBER,
    quoted: EMPTY_BD_PIPELINE_NUMBER,
    signed: EMPTY_BD_PIPELINE_NUMBER,
    deal: EMPTY_BD_PIPELINE_NUMBER,
  },
  quotes: {
    open: EMPTY_BD_PIPELINE_NUMBER,
    accepted: EMPTY_BD_PIPELINE_NUMBER,
    rejected: EMPTY_BD_PIPELINE_NUMBER,
    total_fee: EMPTY_BD_PIPELINE_MONEY,
  },
  orders: {
    open: EMPTY_BD_PIPELINE_NUMBER,
    delivered: EMPTY_BD_PIPELINE_NUMBER,
    settled: EMPTY_BD_PIPELINE_NUMBER,
    total_amount: EMPTY_BD_PIPELINE_MONEY,
    paid_amount: EMPTY_BD_PIPELINE_MONEY,
  },
  followups: {
    due_today: EMPTY_BD_PIPELINE_NUMBER,
    overdue: EMPTY_BD_PIPELINE_NUMBER,
  },
};

export const WorkbenchCountsResponseSchema = z.object({
  creators: z.number().default(0),
  clients: z.number().default(0),
  briefs: z.number().default(0),
  collabs_open: z.number().default(0),
  settlements_pending: z.number().default(0),
  // Absent on a pre-B1 server; the panel draws no number rather than 0.
  jobs: z.number().optional(),
  candidates: z.number().optional(),
  interviews: z.number().optional(),
  employees: z.number().optional(),
}).loose();

export const EMPTY_WORKBENCH_COUNTS_RESPONSE: WorkbenchCountsResponse = {
  creators: 0,
  clients: 0,
  briefs: 0,
  collabs_open: 0,
  settlements_pending: 0,
};

// --- Workbench money block (`GET /api/workbench/finance`) -------------------
//
// Five entries in the metric strip's own three-state shape. Two rules, both
// borrowed from `../metrics/response`:
//
// 1. A missing figure degrades to "nothing measured" (`value: null` +
//    `insufficient_data`), never to a zero: rendering 0 for a figure the server
//    could not state is the confusion docs/METRICS.md rule 3 exists to prevent.
// 2. A drifted block (a number arriving as a string, an unknown `empty`) degrades
//    by itself instead of failing the whole response. One broken figure must cost
//    a tile, not the money tab.
//
// `value` stays `number | null`; money is never a string on the wire
// (搂3.1), so a string here is drift and belongs in the degradation path.

const workbenchFinanceEmptyState = z
  .enum(["zero", "insufficient_data"])
  .catch("insufficient_data");

/**
 * Which cost set a figure used (the server's `basis`). An unknown value is drift
 * and degrades to `none` 鈥?the "no cost side" reading 鈥?because naming a cost set
 * the client does not understand would make the card claim a number it cannot
 * explain.
 */
const workbenchFinanceCostBasis = z
  .enum(["entered", "settled_collabs", "none"])
  .catch("none");

export const WorkbenchFinanceBlockSchema = z
  .object({
    value: z.number().nullable().default(null),
    sample_count: z.number().default(0),
    empty: workbenchFinanceEmptyState,
  })
  .loose();

/** A figure that carries the cost set behind it (gross margin, cash floor). */
export const WorkbenchFinanceCostBlockSchema = WorkbenchFinanceBlockSchema.extend({
  basis: workbenchFinanceCostBasis,
});

const EMPTY_WORKBENCH_FINANCE_BLOCK: z.output<typeof WorkbenchFinanceBlockSchema> = {
  value: null,
  sample_count: 0,
  empty: "insufficient_data",
};

const EMPTY_WORKBENCH_FINANCE_COST_BLOCK: z.output<typeof WorkbenchFinanceCostBlockSchema> = {
  ...EMPTY_WORKBENCH_FINANCE_BLOCK,
  basis: "none",
};

/**
 * One block, with both guards applied: absent 鈫?the gap block (`.default`), and
 * malformed 鈫?the gap block (`.catch`). The order matters 鈥?a missing key never
 * reaches the inner schema, so the default has to sit on the outside.
 */
const workbenchFinanceBlock = WorkbenchFinanceBlockSchema.default(
  EMPTY_WORKBENCH_FINANCE_BLOCK,
).catch(EMPTY_WORKBENCH_FINANCE_BLOCK);

const workbenchFinanceCostBlock = WorkbenchFinanceCostBlockSchema.default(
  EMPTY_WORKBENCH_FINANCE_COST_BLOCK,
).catch(EMPTY_WORKBENCH_FINANCE_COST_BLOCK);

export const WorkbenchFinanceResponseSchema = z
  .object({
    // The month label is display copy, so a missing one degrades to an empty
    // string rather than rejecting the figures the server did send.
    window: z
      .object({ month: z.string().default("") })
      .default({ month: "" })
      .catch({ month: "" }),
    signed: workbenchFinanceBlock,
    collected: workbenchFinanceBlock,
    gross_margin: workbenchFinanceCostBlock,
    receivable_days: workbenchFinanceBlock,
    cash_floor: workbenchFinanceCostBlock,
  })
  .loose();

export const EMPTY_WORKBENCH_FINANCE_RESPONSE: WorkbenchFinanceResponse = {
  window: { month: "" },
  signed: EMPTY_WORKBENCH_FINANCE_BLOCK,
  collected: EMPTY_WORKBENCH_FINANCE_BLOCK,
  gross_margin: EMPTY_WORKBENCH_FINANCE_COST_BLOCK,
  receivable_days: EMPTY_WORKBENCH_FINANCE_BLOCK,
  cash_floor: EMPTY_WORKBENCH_FINANCE_COST_BLOCK,
};

// --- Month entry (`/api/workbench/finance/months`, migration 707) -----------
//
// The inputs the money block cannot derive: opening cash and the month's own cost
// bill. Same leniency rules as the ledgers above 鈥?every field degrades instead of
// rejecting the row, and a null amount stays null, because "not recorded" is what
// keeps the figures on the gap card.

const workbenchFinanceMonthNumber = z.number().nullable().default(null);

export const WorkbenchFinanceMonthSchema = z
  .object({
    id: z.string().default(""),
    workspace_id: z.string().default(""),
    // `YYYY-MM-DD` (C7). The server validates the key on the write path; here it
    // is display copy, so a missing one degrades to an empty string.
    month: z.string().default(""),
    cash_open: workbenchFinanceMonthNumber,
    fixed_cost: workbenchFinanceMonthNumber,
    variable_cost: workbenchFinanceMonthNumber,
    note: workbenchNullableString,
    created_by: workbenchNullableString,
    created_at: z.string().default(""),
    updated_at: z.string().default(""),
  })
  .loose();

// The empty row, typed as the schema's own output so `.catch` below can take it
// (a `.loose()` object carries an index signature the interface does not).
const EMPTY_WORKBENCH_FINANCE_MONTH_ROW: z.output<typeof WorkbenchFinanceMonthSchema> =
  WorkbenchFinanceMonthSchema.parse({});

export const EMPTY_WORKBENCH_FINANCE_MONTH: WorkbenchFinanceMonth =
  EMPTY_WORKBENCH_FINANCE_MONTH_ROW;

export const WorkbenchFinanceMonthListResponseSchema = z
  .object({
    months: z
      .array(WorkbenchFinanceMonthSchema.catch(EMPTY_WORKBENCH_FINANCE_MONTH_ROW))
      .default([])
      .catch([]),
    total: z.number().default(0),
  })
  .loose();

export const EMPTY_WORKBENCH_FINANCE_MONTH_LIST: WorkbenchFinanceMonthListResponse = {
  months: [],
  total: 0,
};

// --- HR (docs/engineering/WORKBENCH-API.md 搂10) ----------------------------
//
// Same leniency rules as the ledgers above, plus three that are specific to this
// block:
//
// 1. Every enum is a plain `z.string()` with the column's default. `stage`,
//    `status`, `verdict` and `mode` are the four values 搂10.2 constrains today;
//    a server that adds a stage (say `background_check`) must still parse, or a
//    candidate would vanish from the board instead of landing in its "other"
//    column.
// 2. `mode` and `verdict` are nullable columns. A missing channel or an
//    unrecorded verdict is `null`, not a fabricated default 鈥?the UI renders
//    "not chosen" differently from "phone".
// 3. `ability` and `disc` are JSONB open maps. A row whose JSONB drifted into a
//    string must still parse as an empty matrix: these two fields are never
//    aggregated, so losing them costs a panel, not the row.
// 4. `status` and `currency` carry a DEFAULT but no NOT NULL, so a NULL there is
//    a presentation default, not a broken row (see `hrDefaultedText`).
// 5. `dimensions` (703) and `keywords` (704) are JSONB containers like
//    `ability`/`disc`: an open key set, never aggregated as a scalar here, so a
//    drifted value degrades to `{}` / `[]` and the row survives.

const hrNullableNumber = workbenchNullableNumber;

/** JSONB score maps: an open key set, and a drifted value degrades to `{}`. */
const hrScoreMap = z.record(z.string(), z.number()).default({}).catch({});

/**
 * A JSONB string array (requisition keywords, migration 704). Always an array:
 * the client maps over it, so a drifted value degrades to an empty list instead
 * of blanking the row.
 */
const hrKeywordArray = z.array(z.string()).default([]).catch([]);

/**
 * A column that has a DEFAULT but no NOT NULL (搂10.2 writes `status TEXT CHECK
 * (...)`, `currency CHAR(3) DEFAULT 'CNY'`): an API-written row always has a
 * value, an imported one can be NULL. `catch` keeps such a row instead of
 * failing the page over a presentation default.
 */
const hrDefaultedText = (fallback: string) => z.string().catch(fallback).default(fallback);
const hrCurrency = hrDefaultedText("CNY");

export const HrJobSchema = z.object({
  id: z.string(),
  workspace_id: z.string().default(""),
  title: z.string().default(""),
  department_id: workbenchNullableString,
  level: workbenchNullableString,
  headcount: z.number().default(1),
  status: hrDefaultedText("draft"),
  salary_min: hrNullableNumber,
  salary_max: hrNullableNumber,
  currency: hrCurrency,
  requirements: workbenchNullableString,
  // Migration 704: the match-score inputs, the AI input and the urgent flag.
  edu: workbenchNullableString,
  years: workbenchNullableString,
  city: workbenchNullableString,
  jd: workbenchNullableString,
  urgent: z.boolean().default(false).catch(false),
  keywords: hrKeywordArray,
  owner_member_id: workbenchNullableString,
  created_by: workbenchNullableString,
  created_at: z.string().default(""),
  updated_at: z.string().default(""),
  archived_at: workbenchNullableString,
}).loose();

export const EMPTY_HR_JOB: HrJob = {
  id: "", workspace_id: "", title: "", department_id: null, level: null,
  headcount: 1, status: "draft", salary_min: null, salary_max: null,
  currency: "CNY", requirements: null, edu: null, years: null, city: null,
  jd: null, urgent: false, keywords: [], owner_member_id: null, created_by: null,
  created_at: "", updated_at: "", archived_at: null,
};

export const HrJobListResponseSchema = z.object({
  jobs: z.array(HrJobSchema).default([]),
  total: z.number().default(0),
}).loose();

export const EMPTY_HR_JOB_LIST_RESPONSE: HrJobListResponse = {
  jobs: [],
  total: 0,
};

export const HrCandidateSchema = z.object({
  id: z.string(),
  workspace_id: z.string().default(""),
  job_id: z.string().default(""),
  name: z.string().default(""),
  stage: z.string().default("screening"),
  source: workbenchNullableString,
  phone: workbenchNullableString,
  email: workbenchNullableString,
  resume_attachment_id: workbenchNullableString,
  match_score: hrNullableNumber,
  score_resume: hrNullableNumber,
  score_test: hrNullableNumber,
  score_interview: hrNullableNumber,
  expected_salary: hrNullableNumber,
  offer_salary: hrNullableNumber,
  currency: hrCurrency,
  owner_member_id: workbenchNullableString,
  // Migration 705: the candidate's half of the match score. Null means "not
  // recorded", which the score treats as no signal rather than as a zero.
  edu: workbenchNullableString,
  years_experience: hrNullableNumber,
  resume_text: workbenchNullableString,
  // Server-stamped by the hire transition; null until the candidate is hired.
  hired_at: workbenchNullableString,
  rejected_reason: workbenchNullableString,
  created_by: workbenchNullableString,
  created_at: z.string().default(""),
  updated_at: z.string().default(""),
  archived_at: workbenchNullableString,
}).loose();

export const EMPTY_HR_CANDIDATE: HrCandidate = {
  id: "", workspace_id: "", job_id: "", name: "", stage: "screening", source: null,
  phone: null, email: null, resume_attachment_id: null, match_score: null,
  score_resume: null, score_test: null, score_interview: null,
  expected_salary: null, offer_salary: null, currency: "CNY",
  owner_member_id: null, edu: null, years_experience: null, resume_text: null,
  hired_at: null, rejected_reason: null, created_by: null,
  created_at: "", updated_at: "", archived_at: null,
};

export const HrCandidateListResponseSchema = z.object({
  candidates: z.array(HrCandidateSchema).default([]),
  total: z.number().default(0),
}).loose();

export const EMPTY_HR_CANDIDATE_LIST_RESPONSE: HrCandidateListResponse = {
  candidates: [],
  total: 0,
};

export const HrInterviewSchema = z.object({
  id: z.string(),
  workspace_id: z.string().default(""),
  candidate_id: z.string().default(""),
  round: z.number().default(1),
  scheduled_at: z.string().default(""),
  duration_minutes: z.number().default(45),
  interviewer_member_id: workbenchNullableString,
  // Migration 702: the interviewer is usually an outside person, so the name is
  // recorded text. A row from before the column, or a body without one, is "".
  interviewer_name: z.string().default(""),
  // Nullable column: nobody has picked a channel yet.
  mode: workbenchNullableString,
  status: z.string().default("scheduled"),
  rescheduled_count: z.number().default(0),
  note: workbenchNullableString,
  created_by: workbenchNullableString,
  created_at: z.string().default(""),
  updated_at: z.string().default(""),
  archived_at: workbenchNullableString,
}).loose();

export const EMPTY_HR_INTERVIEW: HrInterview = {
  id: "", workspace_id: "", candidate_id: "", round: 1, scheduled_at: "",
  duration_minutes: 45, interviewer_member_id: null, interviewer_name: "",
  mode: null, status: "scheduled", rescheduled_count: 0, note: null,
  created_by: null, created_at: "", updated_at: "", archived_at: null,
};

export const HrInterviewListResponseSchema = z.object({
  interviews: z.array(HrInterviewSchema).default([]),
  total: z.number().default(0),
}).loose();

export const EMPTY_HR_INTERVIEW_LIST_RESPONSE: HrInterviewListResponse = {
  interviews: [],
  total: 0,
};

export const HrScorecardSchema = z.object({
  id: z.string(),
  workspace_id: z.string().default(""),
  interview_id: z.string().default(""),
  reviewer_member_id: workbenchNullableString,
  score_skill: hrNullableNumber,
  score_experience: hrNullableNumber,
  score_culture: hrNullableNumber,
  score_potential: hrNullableNumber,
  weighted_score: hrNullableNumber,
  // Migration 703: the current shape, dimension name 鈫?0鈥?. The four score_*
  // numbers above are read-only legacy; a card that predates the map still
  // parses, an unscored one is `{}`.
  dimensions: hrScoreMap,
  // Nullable column: a saved draft scorecard has no verdict yet.
  verdict: workbenchNullableString,
  comment: workbenchNullableString,
  created_by: workbenchNullableString,
  created_at: z.string().default(""),
  updated_at: z.string().default(""),
  archived_at: workbenchNullableString,
}).loose();

export const EMPTY_HR_SCORECARD: HrScorecard = {
  id: "", workspace_id: "", interview_id: "", reviewer_member_id: null,
  score_skill: null, score_experience: null, score_culture: null,
  score_potential: null, weighted_score: null, dimensions: {}, verdict: null,
  comment: null, created_by: null, created_at: "", updated_at: "",
  archived_at: null,
};

export const HrScorecardListResponseSchema = z.object({
  scorecards: z.array(HrScorecardSchema).default([]),
  total: z.number().default(0),
}).loose();

export const EMPTY_HR_SCORECARD_LIST_RESPONSE: HrScorecardListResponse = {
  scorecards: [],
  total: 0,
};

export const HrEmployeeProfileSchema = z.object({
  id: z.string(),
  workspace_id: z.string().default(""),
  member_id: z.string().default(""),
  department_id: workbenchNullableString,
  job_title: workbenchNullableString,
  grade: workbenchNullableString,
  hire_date: workbenchNullableString,
  regular_date: workbenchNullableString,
  contract_end: workbenchNullableString,
  // Written when an offboarding reaches done; null until then.
  leave_date: workbenchNullableString,
  // JSONB NOT NULL DEFAULT '{}': an unassessed profile is an empty matrix.
  ability: hrScoreMap,
  disc: hrScoreMap,
  owner_member_id: workbenchNullableString,
  created_by: workbenchNullableString,
  created_at: z.string().default(""),
  updated_at: z.string().default(""),
  archived_at: workbenchNullableString,
}).loose();

export const EMPTY_HR_EMPLOYEE_PROFILE: HrEmployeeProfile = {
  id: "", workspace_id: "", member_id: "", department_id: null, job_title: null,
  grade: null, hire_date: null, regular_date: null, contract_end: null, leave_date: null,
  ability: {}, disc: {}, owner_member_id: null, created_by: null,
  created_at: "", updated_at: "", archived_at: null,
};

export const HrEmployeeProfileListResponseSchema = z.object({
  employees: z.array(HrEmployeeProfileSchema).default([]),
  total: z.number().default(0),
}).loose();

export const EMPTY_HR_EMPLOYEE_PROFILE_LIST_RESPONSE: HrEmployeeProfileListResponse = {
  employees: [],
  total: 0,
};

// Hiring answers with both halves of its transaction: the candidate that moved
// to `hired`, and the profile it created or updated. Defaults rather than a
// rejection, so a server returning only one half still yields a usable pair.
// Both halves are optional at the parse boundary: a server that returns only one
// of them (or reshapes the body) must not fail the whole response. The client
// substitutes the empty row for whichever half is missing.
export const HireHrCandidateResponseSchema = z
  .object({
    candidate: HrCandidateSchema.nullish(),
    employee_profile: HrEmployeeProfileSchema.nullish(),
  })
  .loose();

export const EMPTY_HIRE_HR_CANDIDATE_RESPONSE = {
  candidate: null,
  employee_profile: null,
};

// --- Affiliate distribution (docs/engineering/WORKBENCH-API.md 搂11) --------
//
// 绮鹃€夎仈鐩?鍒嗛攢. The same two leniency rules as the ledgers above (enums stay
// `z.string()`, nullable columns default to null) plus one of its own: the money
// columns of `affiliate_daily` and `affiliate_settlement` are NOT NULL on the
// server, so a missing one is drift and degrades to 0 rather than blanking the
// row 鈥?an unreported day is a row of zeros, not a row of nulls.
//
// `commission_rate` and the summary's `refund_rate` travel at the 0鈥? scale
// (docs/METRICS.md 搂3 C3) and are never rescaled here: the display layer
// multiplies by 100, and a schema that did it would apply the scale twice.
//
// The three labels 725鈥?27 add (`ownership`, `settled_to`, and the pick's
// `agency_share_rate`) are the two-value enums the ledger's income split rests
// on. They follow the lenient-enum rule above: a value we do not know degrades to
// the default the server would have applied 鈥?`client_brand`, `agency` 鈥?because
// those are also the readings every row created before the migrations had, so an
// old client renders an old row exactly as it did.

export const AffiliateProductSchema = z
  .object({
    id: z.string(),
    workspace_id: z.string().default(""),
    ownership: z.string().default("client_brand"),
    client_id: workbenchNullableString,
    platform: z.string().default(""),
    platform_product_id: z.string().default(""),
    title: z.string().default(""),
    category: workbenchNullableString,
    price: workbenchNullableNumber,
    currency: z.string().default("CNY"),
    commission_rate: workbenchNullableNumber,
    activity: workbenchNullableString,
    status: z.string().default("on_shelf"),
    owner_member_id: workbenchNullableString,
    created_by: workbenchNullableString,
    created_at: z.string().default(""),
    updated_at: z.string().default(""),
    archived_at: workbenchNullableString,
  })
  .loose();

export const EMPTY_AFFILIATE_PRODUCT: AffiliateProduct = {
  id: "", workspace_id: "", ownership: "client_brand", client_id: null, platform: "",
  platform_product_id: "", title: "", category: null, price: null, currency: "CNY",
  commission_rate: null, activity: null, status: "on_shelf", owner_member_id: null,
  created_by: null, created_at: "", updated_at: "", archived_at: null,
};

export const AffiliateProductListResponseSchema = z
  .object({
    products: z.array(AffiliateProductSchema).default([]),
    total: z.number().default(0),
  })
  .loose();

export const EMPTY_AFFILIATE_PRODUCT_LIST_RESPONSE: AffiliateProductListResponse = {
  products: [],
  total: 0,
};

export const AffiliatePickSchema = z
  .object({
    id: z.string(),
    workspace_id: z.string().default(""),
    product_id: z.string().default(""),
    creator_id: z.string().default(""),
    commission_rate: workbenchNullableNumber,
    agency_share_rate: workbenchNullableNumber,
    service_fee_amount: workbenchNullableNumber,
    bound_at: z.string().default(""),
    status: z.string().default("active"),
    note: workbenchNullableString,
    owner_member_id: workbenchNullableString,
    created_by: workbenchNullableString,
    created_at: z.string().default(""),
    updated_at: z.string().default(""),
    archived_at: workbenchNullableString,
  })
  .loose();

export const EMPTY_AFFILIATE_PICK: AffiliatePick = {
  id: "", workspace_id: "", product_id: "", creator_id: "", commission_rate: null,
  agency_share_rate: null, service_fee_amount: null, bound_at: "", status: "active",
  note: null, owner_member_id: null, created_by: null, created_at: "", updated_at: "",
  archived_at: null,
};

export const AffiliatePickListResponseSchema = z
  .object({
    picks: z.array(AffiliatePickSchema).default([]),
    total: z.number().default(0),
  })
  .loose();

export const EMPTY_AFFILIATE_PICK_LIST_RESPONSE: AffiliatePickListResponse = {
  picks: [],
  total: 0,
};

export const AffiliateDailySchema = z
  .object({
    id: z.string(),
    workspace_id: z.string().default(""),
    pick_id: z.string().default(""),
    stat_date: z.string().default(""),
    gmv_amount: z.number().default(0),
    order_count: z.number().default(0),
    refund_amount: z.number().default(0),
    est_commission: z.number().default(0),
    settled_commission: z.number().default(0),
    currency: z.string().default("CNY"),
    created_at: z.string().default(""),
    updated_at: z.string().default(""),
  })
  .loose();

export const EMPTY_AFFILIATE_DAILY: AffiliateDaily = {
  id: "", workspace_id: "", pick_id: "", stat_date: "", gmv_amount: 0,
  order_count: 0, refund_amount: 0, est_commission: 0, settled_commission: 0,
  currency: "CNY", created_at: "", updated_at: "",
};

export const AffiliateDailyListResponseSchema = z
  .object({
    daily: z.array(AffiliateDailySchema).default([]),
    total: z.number().default(0),
  })
  .loose();

export const EMPTY_AFFILIATE_DAILY_LIST_RESPONSE: AffiliateDailyListResponse = {
  daily: [],
  total: 0,
};

export const AffiliateSettlementSchema = z
  .object({
    id: z.string(),
    workspace_id: z.string().default(""),
    period_start: z.string().default(""),
    period_end: z.string().default(""),
    gross_commission: z.number().default(0),
    tech_service_fee: z.number().default(0),
    refund_deduction: z.number().default(0),
    net_amount: z.number().default(0),
    currency: z.string().default("CNY"),
    status: z.string().default("pending"),
    settled_to: z.string().default("agency"),
    paid_at: workbenchNullableString,
    external_no: workbenchNullableString,
    note: workbenchNullableString,
    created_by: workbenchNullableString,
    created_at: z.string().default(""),
    updated_at: z.string().default(""),
  })
  .loose();

export const EMPTY_AFFILIATE_SETTLEMENT: AffiliateSettlement = {
  id: "", workspace_id: "", period_start: "", period_end: "", gross_commission: 0,
  tech_service_fee: 0, refund_deduction: 0, net_amount: 0, currency: "CNY",
  status: "pending", settled_to: "agency", paid_at: null, external_no: null, note: null,
  created_by: null, created_at: "", updated_at: "",
};

export const AffiliateSettlementListResponseSchema = z
  .object({
    settlements: z.array(AffiliateSettlementSchema).default([]),
    total: z.number().default(0),
  })
  .loose();

export const EMPTY_AFFILIATE_SETTLEMENT_LIST_RESPONSE: AffiliateSettlementListResponse = {
  settlements: [],
  total: 0,
};

/**
 * `GET /api/workbench/affiliate/summary`: one month, ten three-state blocks.
 *
 * Same guards as the money block above 鈥?absent degrades to the gap block,
 * malformed degrades to the gap block 鈥?because a rejected summary would cost
 * the whole strip while a single drifted figure should cost one tile.
 *
 * `commission_agency`, `commission_creator` and `agency_share_income` are the
 * income split (725鈥?27). A server that predates them simply omits the keys, and
 * each degrades to the same gap block as the money it would have carried.
 */
export const AffiliateSummaryResponseSchema = z
  .object({
    window: z
      .object({ month: z.string().default("") })
      .default({ month: "" })
      .catch({ month: "" }),
    gmv: workbenchFinanceBlock,
    commission_est: workbenchFinanceBlock,
    commission_settled: workbenchFinanceBlock,
    commission_agency: workbenchFinanceBlock,
    commission_creator: workbenchFinanceBlock,
    agency_share_income: workbenchFinanceBlock,
    refund_rate: workbenchFinanceBlock,
    tech_fee: workbenchFinanceBlock,
    pick_count: workbenchFinanceBlock,
    active_creator_count: workbenchFinanceBlock,
  })
  .loose();

export const EMPTY_AFFILIATE_SUMMARY_RESPONSE: AffiliateSummaryResponse = {
  window: { month: "" },
  gmv: EMPTY_WORKBENCH_FINANCE_BLOCK,
  commission_est: EMPTY_WORKBENCH_FINANCE_BLOCK,
  commission_settled: EMPTY_WORKBENCH_FINANCE_BLOCK,
  commission_agency: EMPTY_WORKBENCH_FINANCE_BLOCK,
  commission_creator: EMPTY_WORKBENCH_FINANCE_BLOCK,
  agency_share_income: EMPTY_WORKBENCH_FINANCE_BLOCK,
  refund_rate: EMPTY_WORKBENCH_FINANCE_BLOCK,
  tech_fee: EMPTY_WORKBENCH_FINANCE_BLOCK,
  pick_count: EMPTY_WORKBENCH_FINANCE_BLOCK,
  active_creator_count: EMPTY_WORKBENCH_FINANCE_BLOCK,
};

// --- Content workbench (docs/engineering/WORKBENCH-API.md 搂12) --------------
//
// IP 鈫?閫夐 鈫?鑴氭湰锛堟寜鐗堟湰锛夆啋 鎷嶆憚, plus the two link columns that join the new
// chain to `creator` (a platform account) and `creator_post` (a publish).
//
// The same two leniency rules as the ledgers above apply 鈥?enums stay
// `z.string()`, nullable columns default to null 鈥?plus two of its own:
//
//   * `scores` is normalised to the five dimensions with 0 defaults. The server
//     always stores the full card, so a missing dimension means an older payload,
//     and "no score" is 0 rather than undefined: the radar chart must draw five
//     axes, not four and a gap.
//   * `shots` holds a `shotlist.v1` artifact and is passed through as
//     `z.unknown()` on purpose. Re-validating a frozen contract in zod would give
//     us a second copy of it to keep in step by hand; the server already rejects a
//     document that breaks it, and `MediaShotList` in `types/media.ts` is the typed
//     view the editor uses. `checklist` is the only part parsed: it is a tick map.

export const MediaIPSchema = z
  .object({
    id: z.string(),
    workspace_id: z.string().default(""),
    name: z.string().default(""),
    persona: workbenchNullableString,
    track: workbenchNullableString,
    audience: workbenchNullableString,
    color: workbenchNullableString,
    week_goal: z.number().default(0),
    status: z.string().default("active"),
    owner_member_id: workbenchNullableString,
    created_by: workbenchNullableString,
    created_at: z.string().default(""),
    updated_at: z.string().default(""),
    archived_at: workbenchNullableString,
  })
  .loose();

export const EMPTY_MEDIA_IP: MediaIP = {
  id: "", workspace_id: "", name: "", persona: null, track: null, audience: null,
  color: null, week_goal: 0, status: "active", owner_member_id: null, created_by: null,
  created_at: "", updated_at: "", archived_at: null,
};

export const MediaIPAccountSchema = z
  .object({
    id: z.string(),
    media_ip_id: z.string().default(""),
    kind: z.string().default("external"),
    display_name: z.string().default(""),
    platform: z.string().default(""),
    handle: z.string().default(""),
    url: workbenchNullableString,
    fans: z.number().default(0),
    avg_play: z.number().default(0),
    owner_member_id: workbenchNullableString,
    created_at: z.string().default(""),
  })
  .loose();

export const EMPTY_MEDIA_IP_ACCOUNT: MediaIPAccount = {
  id: "", media_ip_id: "", kind: "external", display_name: "", platform: "", handle: "",
  url: null, fans: 0, avg_play: 0, owner_member_id: null, created_at: "",
};

/**
 * `GET /media/ips/{id}`. `accounts` defaults to an empty list: an IP whose
 * account list the server could not read is still a usable IP row, and a rejected
 * parse would blank the whole detail screen.
 */
export const MediaIPDetailSchema = MediaIPSchema.extend({
  accounts: z.array(MediaIPAccountSchema).default([]),
}).loose();

export const EMPTY_MEDIA_IP_DETAIL: MediaIPDetail = {
  ...EMPTY_MEDIA_IP,
  accounts: [],
};

export const MediaIPListResponseSchema = z
  .object({
    ips: z.array(MediaIPSchema).default([]),
    total: z.number().default(0),
  })
  .loose();

export const EMPTY_MEDIA_IP_LIST_RESPONSE: MediaIPListResponse = { ips: [], total: 0 };

/** The five dimensions, each 0鈥?00, all present after a parse. */
export const MediaScoresSchema = z
  .object({
    pain: z.number().default(0),
    save: z.number().default(0),
    debate: z.number().default(0),
    susp: z.number().default(0),
    fit: z.number().default(0),
  })
  .loose();

export const EMPTY_MEDIA_SCORES: MediaScores = { pain: 0, save: 0, debate: 0, susp: 0, fit: 0 };

export const MediaTopicSchema = z
  .object({
    id: z.string(),
    workspace_id: z.string().default(""),
    ip_id: z.string().default(""),
    title: z.string().default(""),
    source: z.string().default("manual"),
    scores: MediaScoresSchema.default(EMPTY_MEDIA_SCORES),
    status: z.string().default("pool"),
    hot_id: workbenchNullableString,
    note: workbenchNullableString,
    owner_member_id: workbenchNullableString,
    created_by: workbenchNullableString,
    created_at: z.string().default(""),
    updated_at: z.string().default(""),
    archived_at: workbenchNullableString,
  })
  .loose();

export const EMPTY_MEDIA_TOPIC: MediaTopic = {
  id: "", workspace_id: "", ip_id: "", title: "", source: "manual",
  scores: EMPTY_MEDIA_SCORES, status: "pool", hot_id: null, note: null,
  owner_member_id: null, created_by: null, created_at: "", updated_at: "",
  archived_at: null,
};

export const MediaTopicListResponseSchema = z
  .object({
    topics: z.array(MediaTopicSchema).default([]),
    total: z.number().default(0),
  })
  .loose();

export const EMPTY_MEDIA_TOPIC_LIST_RESPONSE: MediaTopicListResponse = { topics: [], total: 0 };

export const MediaScriptSchema = z
  .object({
    id: z.string(),
    workspace_id: z.string().default(""),
    topic_id: z.string().default(""),
    ip_id: workbenchNullableString,
    version: z.number().default(1),
    hook: workbenchNullableString,
    body: workbenchNullableString,
    cta: workbenchNullableString,
    cover_note: workbenchNullableString,
    tags: z.array(z.string()).default([]),
    status: z.string().default("draft"),
    publish_at: workbenchNullableString,
    owner_member_id: workbenchNullableString,
    created_by: workbenchNullableString,
    created_at: z.string().default(""),
    updated_at: z.string().default(""),
    archived_at: workbenchNullableString,
  })
  .loose();

export const EMPTY_MEDIA_SCRIPT: MediaScript = {
  id: "", workspace_id: "", topic_id: "", ip_id: null, version: 1, hook: null,
  body: null, cta: null, cover_note: null, tags: [], status: "draft", publish_at: null,
  owner_member_id: null, created_by: null, created_at: "", updated_at: "",
  archived_at: null,
};

export const MediaScriptListResponseSchema = z
  .object({
    scripts: z.array(MediaScriptSchema).default([]),
    total: z.number().default(0),
  })
  .loose();

export const EMPTY_MEDIA_SCRIPT_LIST_RESPONSE: MediaScriptListResponse = { scripts: [], total: 0 };

export const MediaShootSchema = z
  .object({
    id: z.string(),
    workspace_id: z.string().default(""),
    script_id: z.string().default(""),
    shoot_date: z.string().default(""),
    location: workbenchNullableString,
    // `{}` before the shot list is planned; a `shotlist.v1` document otherwise.
    // See the block comment above for why this is not re-validated here.
    shots: z.unknown().default({}),
    checklist: z.record(z.string(), z.boolean()).default({}),
    status: z.string().default("planned"),
    owner_member_id: workbenchNullableString,
    created_by: workbenchNullableString,
    created_at: z.string().default(""),
    updated_at: z.string().default(""),
    archived_at: workbenchNullableString,
  })
  .loose();

export const EMPTY_MEDIA_SHOOT: MediaShoot = {
  id: "", workspace_id: "", script_id: "", shoot_date: "", location: null, shots: {},
  checklist: {}, status: "planned", owner_member_id: null, created_by: null,
  created_at: "", updated_at: "", archived_at: null,
};

export const MediaShootListResponseSchema = z
  .object({
    shoots: z.array(MediaShootSchema).default([]),
    total: z.number().default(0),
  })
  .loose();

export const EMPTY_MEDIA_SHOOT_LIST_RESPONSE: MediaShootListResponse = { shoots: [], total: 0 };

// --- General manager workbench (docs/engineering/WORKBENCH-API.md 搂13) ------
//
// OKR goals 鐩爣 -> key results -> department packages, and the radar signals that
// convert into a goal or an issue.
//
// The same leniency rules as the ledgers above apply 鈥?enums stay `z.string()`,
// nullable columns default to null 鈥?plus two of its own:
//
//   * the child lists (`key_results`, `packages`, `issues`) default to empty
//     arrays. The server always sends them, so a missing one means an older
//     payload; a goal whose children a rejected parse blanked would render as an
//     objective with no progress, which is a worse lie than an empty list.
//   * `target` and `score` stay nullable numbers. A key result with no target is
//     a row whose number is undecided, and reading it as 0 would claim it is
//     already missed.

export const GoalKeyResultSchema = z
  .object({
    id: z.string(),
    workspace_id: z.string().default(""),
    goal_id: z.string().default(""),
    title: z.string().default(""),
    target: z.number().nullable().default(null),
    current: z.number().default(0),
    unit: workbenchNullableString,
    position: z.number().default(0),
    status: z.string().default("on_track"),
    created_by: workbenchNullableString,
    created_at: z.string().default(""),
    updated_at: z.string().default(""),
    archived_at: workbenchNullableString,
  })
  .loose();

export const EMPTY_GOAL_KEY_RESULT: GoalKeyResult = {
  id: "", workspace_id: "", goal_id: "", title: "", target: null, current: 0,
  unit: null, position: 0, status: "on_track", created_by: null,
  created_at: "", updated_at: "", archived_at: null,
};

export const GoalPackageSchema = z
  .object({
    id: z.string(),
    workspace_id: z.string().default(""),
    goal_id: z.string().default(""),
    department_id: z.string().default(""),
    title: z.string().default(""),
    owner_member_id: workbenchNullableString,
    status: z.string().default("draft"),
    position: z.number().default(0),
    created_by: workbenchNullableString,
    created_at: z.string().default(""),
    updated_at: z.string().default(""),
    archived_at: workbenchNullableString,
  })
  .loose();

export const EMPTY_GOAL_PACKAGE: GoalPackage = {
  id: "", workspace_id: "", goal_id: "", department_id: "", title: "",
  owner_member_id: null, status: "draft", position: 0, created_by: null,
  created_at: "", updated_at: "", archived_at: null,
};

export const GoalSchema = z
  .object({
    id: z.string(),
    workspace_id: z.string().default(""),
    cycle: z.string().default(""),
    title: z.string().default(""),
    description: workbenchNullableString,
    owner_member_id: z.string().default(""),
    department_id: workbenchNullableString,
    status: z.string().default("draft"),
    due_date: workbenchNullableString,
    priority: z.string().default("P2"),
    created_by: workbenchNullableString,
    created_at: z.string().default(""),
    updated_at: z.string().default(""),
    archived_at: workbenchNullableString,
    key_results: z.array(GoalKeyResultSchema).default([]),
    packages: z.array(GoalPackageSchema).default([]),
  })
  .loose();

export const EMPTY_GOAL: Goal = {
  id: "", workspace_id: "", cycle: "", title: "", description: null,
  owner_member_id: "", department_id: null, status: "draft", due_date: null,
  priority: "P2", created_by: null, created_at: "", updated_at: "",
  archived_at: null, key_results: [], packages: [],
};

export const GoalIssueSchema = z
  .object({
    id: z.string(),
    number: z.number().default(0),
    title: z.string().default(""),
    status: z.string().default(""),
    goal_id: workbenchNullableString,
  })
  .loose();

export const EMPTY_GOAL_ISSUE: GoalIssue = {
  id: "", number: 0, title: "", status: "todo", goal_id: null,
};

/**
 * `GET /goals/{id}`. `issues` defaults to an empty list for the same reason as
 * the other child lists: an older payload must not blank the task strip.
 */
export const GoalDetailSchema = GoalSchema.extend({
  issues: z.array(GoalIssueSchema).default([]),
}).loose();

export const EMPTY_GOAL_DETAIL: GoalDetail = {
  ...EMPTY_GOAL,
  issues: [],
};

export const GoalListResponseSchema = z
  .object({
    goals: z.array(GoalSchema).default([]),
    total: z.number().default(0),
  })
  .loose();

export const EMPTY_GOAL_LIST_RESPONSE: GoalListResponse = { goals: [], total: 0 };

export const MarketSignalSchema = z
  .object({
    id: z.string(),
    workspace_id: z.string().default(""),
    title: z.string().default(""),
    category: z.string().default("other"),
    source: z.string().default("manual"),
    url: workbenchNullableString,
    summary: workbenchNullableString,
    cut: z.string().default("warm"),
    score: z.number().nullable().default(null),
    urgency: z.string().default("medium"),
    status: z.string().default("new"),
    converted_goal_id: workbenchNullableString,
    converted_issue_id: workbenchNullableString,
    note: workbenchNullableString,
    owner_member_id: workbenchNullableString,
    created_by: workbenchNullableString,
    created_at: z.string().default(""),
    updated_at: z.string().default(""),
    archived_at: workbenchNullableString,
  })
  .loose();

export const EMPTY_MARKET_SIGNAL: MarketSignal = {
  id: "", workspace_id: "", title: "", category: "other", source: "manual",
  url: null, summary: null, cut: "warm", score: null, urgency: "medium",
  status: "new", converted_goal_id: null, converted_issue_id: null, note: null,
  owner_member_id: null, created_by: null, created_at: "", updated_at: "",
  archived_at: null,
};

export const MarketSignalListResponseSchema = z
  .object({
    signals: z.array(MarketSignalSchema).default([]),
    total: z.number().default(0),
  })
  .loose();

export const EMPTY_MARKET_SIGNAL_LIST_RESPONSE: MarketSignalListResponse = {
  signals: [],
  total: 0,
};

/**
 * `POST /signals/{id}/convert`. Exactly one of `goal` / `issue` arrives, chosen
 * by the `target` that was sent; both are optional here so a client does not have
 * to branch on the response shape before reading the signal it just converted.
 */
export const MarketSignalConvertResponseSchema = z
  .object({
    signal: MarketSignalSchema,
    goal: GoalSchema.optional(),
    issue: GoalIssueSchema.optional(),
  })
  .loose();

export const EMPTY_MARKET_SIGNAL_CONVERT_RESPONSE: MarketSignalConvertResponse = {
  signal: EMPTY_MARKET_SIGNAL,
};

// ---- interview questions and guides (WORKBENCH-API 搂14) --------------------
//
// Three rules from the contract's response section show up here:
//
//   * `items` is a snapshot array and is always present (`[]`, never null): the
//     outline panel maps over it, and a null would be a branch for no content.
//   * `score` stays a nullable number. A question scored 0 and a question nobody
//     scored are different answers, so 0 must not be the read of "unscored".
//   * both lists default to empty, so a payload from an older server blanks the
//     panel instead of the page.

export const HrQuestionSchema = z
  .object({
    id: z.string(),
    workspace_id: z.string().default(""),
    // Null = a general question that fits any requisition.
    job_id: workbenchNullableString,
    dimension: z.string().default("skill"),
    question: z.string().default(""),
    intent: workbenchNullableString,
    signals: workbenchNullableString,
    red_flags: workbenchNullableString,
    source: z.string().default("manual"),
    tags: z.array(z.string()).default([]),
    usage_count: z.number().default(0),
    owner_member_id: workbenchNullableString,
    created_by: workbenchNullableString,
    created_at: z.string().default(""),
    updated_at: z.string().default(""),
    archived_at: workbenchNullableString,
  })
  .loose();

export const EMPTY_HR_QUESTION: HrQuestion = {
  id: "", workspace_id: "", job_id: null, dimension: "skill", question: "",
  intent: null, signals: null, red_flags: null, source: "manual", tags: [],
  usage_count: 0, owner_member_id: null, created_by: null, created_at: "",
  updated_at: "", archived_at: null,
};

export const HrQuestionListResponseSchema = z
  .object({
    questions: z.array(HrQuestionSchema).default([]),
    total: z.number().default(0),
  })
  .loose();

export const EMPTY_HR_QUESTION_LIST_RESPONSE: HrQuestionListResponse = {
  questions: [],
  total: 0,
};

/**
 * One guide item. Every text field falls back to "" rather than null: the snapshot
 * stores strings, and `""` is the honest read of "nothing written down".
 */
export const HrGuideItemSchema = z
  .object({
    question_id: workbenchNullableString,
    dimension: z.string().default("skill"),
    question: z.string().default(""),
    intent: z.string().default(""),
    signals: z.string().default(""),
    red_flags: z.string().default(""),
    asked: z.boolean().default(false),
    note: z.string().default(""),
    score: z.number().nullable().default(null),
  })
  .loose();

export const EMPTY_HR_GUIDE_ITEM: HrGuideItem = {
  question_id: null, dimension: "skill", question: "", intent: "", signals: "",
  red_flags: "", asked: false, note: "", score: null,
};

export const HrInterviewGuideSchema = z
  .object({
    id: z.string(),
    workspace_id: z.string().default(""),
    // Null until the round is booked 鈥?an outline is normally prepared first.
    interview_id: workbenchNullableString,
    candidate_id: z.string().default(""),
    job_id: workbenchNullableString,
    round: z.number().default(1),
    status: z.string().default("draft"),
    items: z.array(HrGuideItemSchema).default([]),
    note: workbenchNullableString,
    owner_member_id: workbenchNullableString,
    created_by: workbenchNullableString,
    created_at: z.string().default(""),
    updated_at: z.string().default(""),
    archived_at: workbenchNullableString,
  })
  .loose();

export const EMPTY_HR_INTERVIEW_GUIDE: HrInterviewGuide = {
  id: "", workspace_id: "", interview_id: null, candidate_id: "", job_id: null,
  round: 1, status: "draft", items: [], note: null, owner_member_id: null,
  created_by: null, created_at: "", updated_at: "", archived_at: null,
};

export const HrGuideListResponseSchema = z
  .object({
    guides: z.array(HrInterviewGuideSchema).default([]),
    total: z.number().default(0),
  })
  .loose();

export const EMPTY_HR_GUIDE_LIST_RESPONSE: HrGuideListResponse = {
  guides: [],
  total: 0,
};

/**
 * `POST /guides/generate` 鈥?an unsaved draft. `source` is kept as a plain string so
 * a future generator name still parses; the UI reads `template` to label the draft as
 * the deterministic skeleton.
 */
export const HrGuideGenerateResponseSchema = z
  .object({
    candidate_id: z.string().default(""),
    round: z.number().default(1),
    job_id: workbenchNullableString,
    source: z.string().default("template"),
    items: z.array(HrGuideItemSchema).default([]),
    total: z.number().default(0),
  })
  .loose();

export const EMPTY_HR_GUIDE_GENERATE_RESPONSE: HrGuideGenerateResponse = {
  candidate_id: "",
  round: 1,
  job_id: null,
  source: "template",
  items: [],
  total: 0,
};

// ---- offboarding (WORKBENCH-API 搂15) ---------------------------------------
//
// Four rules from the contract's response section show up here:
//
//   * `handover` is always an array (`[]`, never null): the checklist panel maps
//     over it, and a null would be a branch for no content.
//   * `status` and `kind` stay plain strings. An unknown segment must render 鈥?the
//     page shows what the row says 鈥?and defaulting an unknown value to `apply`
//     would show a finished record as just started.
//   * `last_day` is a calendar day (`YYYY-MM-DD`), the same wire form as every
//     other HR date.
//   * the advance answer keeps `employee` nullable: only the `done` step touches
//     the employee file, so "no profile" is the honest read of the earlier one.

export const HrHandoverItemSchema = z
  .object({
    key: z.string().default(""),
    label: z.string().default(""),
    done: z.boolean().default(false),
    note: z.string().default(""),
  })
  .loose();

export const EMPTY_HR_HANDOVER_ITEM: HrHandoverItem = {
  key: "",
  label: "",
  done: false,
  note: "",
};

export const HrOffboardingSchema = z
  .object({
    id: z.string(),
    workspace_id: z.string().default(""),
    employee_id: z.string().default(""),
    status: z.string().default("apply"),
    last_day: z.string().default(""),
    reason: workbenchNullableString,
    kind: z.string().default("voluntary"),
    handover: z.array(HrHandoverItemSchema).default([]),
    cert_done: z.boolean().default(false),
    note: workbenchNullableString,
    owner_member_id: workbenchNullableString,
    created_by: workbenchNullableString,
    created_at: z.string().default(""),
    updated_at: z.string().default(""),
    archived_at: workbenchNullableString,
  })
  .loose();

export const EMPTY_HR_OFFBOARDING: HrOffboarding = {
  id: "",
  workspace_id: "",
  employee_id: "",
  status: "apply",
  last_day: "",
  reason: null,
  kind: "voluntary",
  handover: [],
  cert_done: false,
  note: null,
  owner_member_id: null,
  created_by: null,
  created_at: "",
  updated_at: "",
  archived_at: null,
};

export const HrOffboardingListResponseSchema = z
  .object({
    offboardings: z.array(HrOffboardingSchema).default([]),
    total: z.number().default(0),
  })
  .loose();

export const EMPTY_HR_OFFBOARDING_LIST_RESPONSE: HrOffboardingListResponse = {
  offboardings: [],
  total: 0,
};

/**
 * The employee file plus the column the `done` transition writes. Built by
 * extending the profile schema rather than re-listing it, so a field added to the
 * employee payload cannot silently disappear from this answer.
 */
export const HrOffboardingEmployeeSchema = HrEmployeeProfileSchema.extend({
  leave_date: workbenchNullableString,
});

export const EMPTY_HR_OFFBOARDING_EMPLOYEE: HrOffboardingEmployee = {
  ...EMPTY_HR_EMPLOYEE_PROFILE,
  leave_date: null,
};

export const HrOffboardingAdvanceResponseSchema = z
  .object({
    offboarding: HrOffboardingSchema,
    // Null until `done`: the earlier step does not move the employee file.
    employee: HrOffboardingEmployeeSchema.nullish(),
  })
  .loose();

export const EMPTY_HR_OFFBOARDING_ADVANCE_RESPONSE: HrOffboardingAdvanceResponse = {
  offboarding: EMPTY_HR_OFFBOARDING,
  employee: null,
};

// ---- employee file change stream (WORKBENCH-API 搂16) -----------------------
//
// Three rules from the contract's response section show up here:
//
//   * `kind` stays a plain string. A kind this build does not know must still
//     render 鈥?the 寮傚姩 list shows what the row says 鈥?and collapsing it to
//     `other` would relabel a real event.
//   * every from/to pair is nullable and defaults to null: a change that was not
//     about a field must not look like it cleared the field.
//   * amounts are JSON numbers (搂3.1) and `effective_on` is a calendar day, the
//     same wire forms as the rest of HR.

export const HrEmployeeChangeSchema = z
  .object({
    id: z.string(),
    workspace_id: z.string().default(""),
    employee_id: z.string().default(""),
    kind: z.string().default("other"),
    effective_on: z.string().default(""),
    from_department_id: workbenchNullableString,
    to_department_id: workbenchNullableString,
    from_job_title: workbenchNullableString,
    to_job_title: workbenchNullableString,
    from_grade: workbenchNullableString,
    to_grade: workbenchNullableString,
    from_contract_end: workbenchNullableString,
    to_contract_end: workbenchNullableString,
    from_amount: workbenchNullableNumber,
    to_amount: workbenchNullableNumber,
    currency: z.string().default(""),
    note: workbenchNullableString,
    owner_member_id: workbenchNullableString,
    created_by: workbenchNullableString,
    created_at: z.string().default(""),
    archived_at: workbenchNullableString,
  })
  .loose();

export const EMPTY_HR_EMPLOYEE_CHANGE: HrEmployeeChange = {
  id: "",
  workspace_id: "",
  employee_id: "",
  kind: "other",
  effective_on: "",
  from_department_id: null,
  to_department_id: null,
  from_job_title: null,
  to_job_title: null,
  from_grade: null,
  to_grade: null,
  from_contract_end: null,
  to_contract_end: null,
  from_amount: null,
  to_amount: null,
  currency: "",
  note: null,
  owner_member_id: null,
  created_by: null,
  created_at: "",
  archived_at: null,
};

export const HrEmployeeChangeListResponseSchema = z
  .object({
    changes: z.array(HrEmployeeChangeSchema).default([]),
    total: z.number().default(0),
  })
  .loose();

export const EMPTY_HR_EMPLOYEE_CHANGE_LIST_RESPONSE: HrEmployeeChangeListResponse = {
  changes: [],
  total: 0,
};

// ---- employee rewards and disciplines (WORKBENCH-API 搂17) -------------------
//
// Four rules from the contract's response section show up here:
//
//   * `kind` stays a plain string: a kind this build does not know must still
//     render, and folding it into `reward` would relabel somebody's 澶勫垎.
//   * `amount` is a JSON number (搂3.1) or null 鈥?null is "no money attached",
//     which is not 0, and is always >= 0 (the sign lives in `kind`).
//   * `currency` is always a string (the column is NOT NULL, default CNY).
//   * `decided_on` is a calendar day, the same wire form as the rest of HR.

export const HrEmployeeRewardSchema = z
  .object({
    id: z.string(),
    workspace_id: z.string().default(""),
    employee_id: z.string().default(""),
    kind: z.string().default("reward"),
    category: workbenchNullableString,
    reason: z.string().default(""),
    amount: workbenchNullableNumber,
    currency: z.string().default("CNY"),
    decided_on: z.string().default(""),
    note: workbenchNullableString,
    owner_member_id: workbenchNullableString,
    created_by: workbenchNullableString,
    created_at: z.string().default(""),
    updated_at: z.string().default(""),
    archived_at: workbenchNullableString,
  })
  .loose();

export const EMPTY_HR_EMPLOYEE_REWARD: HrEmployeeReward = {
  id: "",
  workspace_id: "",
  employee_id: "",
  kind: "reward",
  category: null,
  reason: "",
  amount: null,
  currency: "CNY",
  decided_on: "",
  note: null,
  owner_member_id: null,
  created_by: null,
  created_at: "",
  updated_at: "",
  archived_at: null,
};

export const HrEmployeeRewardListResponseSchema = z
  .object({
    rewards: z.array(HrEmployeeRewardSchema).default([]),
    total: z.number().default(0),
  })
  .loose();

export const EMPTY_HR_EMPLOYEE_REWARD_LIST_RESPONSE: HrEmployeeRewardListResponse = {
  rewards: [],
  total: 0,
};

// HR documents (docs/engineering/WORKBENCH-API.md 搂18). The templates and the
// generation ledger live in their own module (types/doc.ts).
//
// Rules from the contract that show up here:
//
//   * `kind` stays a plain string: a kind this build does not know must still
//     render, and folding it into `other` would relabel a real document.
//   * `placeholders` defaults to `[]` rather than failing: it is derived from
//     `body` server-side, and a client built before that field existed still gets a
//     usable template.
//   * `builtin` defaults to `false` 鈥?the safe reading, because the read-only rules
//     are what a client gates the edit affordance on.
//   * `values` defaults to `{}` and `url` / `filename` / `template_id` /
//     `attachment_id` default to null-or-empty: the attachment can be deleted from
//     the file list, and that must not break the row rendered next to it.
//   * `format` stays a string for the same reason `kind` does.

export const HrDocTemplateSchema = z
  .object({
    id: z.string(),
    workspace_id: z.string().default(""),
    name: z.string().default(""),
    kind: z.string().default("other"),
    body: z.string().default(""),
    builtin: z.boolean().default(false),
    placeholders: z.array(z.string()).default([]),
    owner_member_id: workbenchNullableString,
    created_by: workbenchNullableString,
    created_at: z.string().default(""),
    updated_at: z.string().default(""),
    archived_at: workbenchNullableString,
  })
  .loose();

export const EMPTY_HR_DOC_TEMPLATE: HrDocTemplate = {
  id: "",
  workspace_id: "",
  name: "",
  kind: "other",
  body: "",
  builtin: false,
  placeholders: [],
  owner_member_id: null,
  created_by: null,
  created_at: "",
  updated_at: "",
  archived_at: null,
};

export const HrDocTemplateListResponseSchema = z
  .object({
    templates: z.array(HrDocTemplateSchema).default([]),
    total: z.number().default(0),
  })
  .loose();

export const EMPTY_HR_DOC_TEMPLATE_LIST_RESPONSE: HrDocTemplateListResponse = {
  templates: [],
  total: 0,
};

export const HrDocGenerationSchema = z
  .object({
    id: z.string(),
    workspace_id: z.string().default(""),
    employee_id: z.string().default(""),
    template_id: workbenchNullableString,
    template_name: z.string().default(""),
    format: z.string().default("docx"),
    attachment_id: workbenchNullableString,
    url: z.string().default(""),
    filename: z.string().default(""),
    values: z.record(z.string(), z.string()).default({}),
    generated_by: workbenchNullableString,
    created_at: z.string().default(""),
  })
  .loose();

export const EMPTY_HR_DOC_GENERATION: HrDocGeneration = {
  id: "",
  workspace_id: "",
  employee_id: "",
  template_id: null,
  template_name: "",
  format: "docx",
  attachment_id: null,
  url: "",
  filename: "",
  values: {},
  generated_by: null,
  created_at: "",
};

export const HrDocGenerationListResponseSchema = z
  .object({
    documents: z.array(HrDocGenerationSchema).default([]),
    total: z.number().default(0),
  })
  .loose();

export const EMPTY_HR_DOC_GENERATION_LIST_RESPONSE: HrDocGenerationListResponse = {
  documents: [],
  total: 0,
};

// `POST .../documents` answers `{ document, warnings }`. A malformed envelope still
// has to yield a document, because the caller navigates on it; `warnings` defaults
// to an empty array, which is the "nothing was kept verbatim" reading.
export const HrDocGenerationEnvelopeSchema = z
  .object({
    document: HrDocGenerationSchema,
    warnings: z.array(z.string()).default([]),
  })
  .loose();

export const EMPTY_HR_DOC_GENERATION_ENVELOPE: CreateHrDocGenerationResponse = {
  document: EMPTY_HR_DOC_GENERATION,
  warnings: [],
};

// --- Hotspot radar / benchmark teardown (docs/engineering/WORKBENCH-API.md 搂21)
//
// Two source ledgers, one shape: a row captured on a day. The leniency rules of
// the content block above apply (`z.string()` enums, nullable columns default to
// null, `.loose()` for forward compatibility), plus two of its own:
//
//   * `rank` and `heat_value` stay nullable numbers. A capture without a position
//     or a heat figure is an ordinary row 鈥?defaulting them to 0 would claim a
//     rank nobody was given.
//   * `metrics` is `z.record(z.string(), z.unknown())`. The metric set is per
//     platform and it is the operator's, not a schema's; re-validating it here
//     would reject a card some future platform fields.

export const MediaHotSchema = z
  .object({
    id: z.string(),
    workspace_id: z.string().default(""),
    title: z.string().default(""),
    platform: z.string().default(""),
    url: workbenchNullableString,
    rank: workbenchNullableNumber,
    heat_value: workbenchNullableNumber,
    category: workbenchNullableString,
    captured_on: z.string().default(""),
    source: z.string().default("manual"),
    note: workbenchNullableString,
    owner_member_id: workbenchNullableString,
    created_by: workbenchNullableString,
    created_at: z.string().default(""),
    updated_at: z.string().default(""),
    archived_at: workbenchNullableString,
  })
  .loose();

export const EMPTY_MEDIA_HOT: MediaHot = {
  id: "", workspace_id: "", title: "", platform: "", url: null, rank: null,
  heat_value: null, category: null, captured_on: "", source: "manual", note: null,
  owner_member_id: null, created_by: null, created_at: "", updated_at: "",
  archived_at: null,
};

export const MediaHotListResponseSchema = z
  .object({
    hot: z.array(MediaHotSchema).default([]),
    total: z.number().default(0),
  })
  .loose();

export const EMPTY_MEDIA_HOT_LIST_RESPONSE: MediaHotListResponse = { hot: [], total: 0 };

export const MediaBenchSchema = z
  .object({
    id: z.string(),
    workspace_id: z.string().default(""),
    ip_id: workbenchNullableString,
    platform: z.string().default(""),
    name: z.string().default(""),
    url: workbenchNullableString,
    follower_count: workbenchNullableNumber,
    metrics: z.record(z.string(), z.unknown()).default({}),
    captured_on: z.string().default(""),
    note: workbenchNullableString,
    owner_member_id: workbenchNullableString,
    created_by: workbenchNullableString,
    created_at: z.string().default(""),
    updated_at: z.string().default(""),
    archived_at: workbenchNullableString,
  })
  .loose();

export const EMPTY_MEDIA_BENCH: MediaBench = {
  id: "", workspace_id: "", ip_id: null, platform: "", name: "", url: null,
  follower_count: null, metrics: {}, captured_on: "", note: null,
  owner_member_id: null, created_by: null, created_at: "", updated_at: "",
  archived_at: null,
};

export const MediaBenchListResponseSchema = z
  .object({
    bench: z.array(MediaBenchSchema).default([]),
    total: z.number().default(0),
  })
  .loose();

export const EMPTY_MEDIA_BENCH_LIST_RESPONSE: MediaBenchListResponse = { bench: [], total: 0 };

// --- Performance over a date range (docs/engineering/WORKBENCH-API.md 搂22) ---
//
// The windowed counterpart of the cockpit (搂20). Same three-state numbers
// (`bdPipelineNumber` / `bdPipelineMoney`, the default+catch wrappers), so a
// surface renders a gap the same way in both places.
//
// Two leniencies worth stating:
//   * `by_member` / `by_month` default to empty arrays. The report always sends
//     them; a missing list means an older payload, and an empty trend is a better
//     rendering than a rejected one.
//   * `empty` stays `z.string()` (not an enum) so a future state renders as itself
//     instead of failing the whole report.

const BdPerformanceTotalsShape = {
  signed_count: z.number().default(0),
  signed_amount: workbenchNullableNumber,
  delivered_count: z.number().default(0),
  collected_count: z.number().default(0),
  collected_amount: workbenchNullableNumber,
  quote_sent: z.number().default(0),
  quote_accepted: z.number().default(0),
  quote_amount: workbenchNullableNumber,
  followups: z.number().default(0),
  replied: z.number().default(0),
  meetings: z.number().default(0),
};

export const BdPerformanceMemberRowSchema = z
  .object({
    member_id: z.string().default(""),
    name: z.string().default(""),
    win_rate: workbenchNullableNumber,
    ...BdPerformanceTotalsShape,
  })
  .loose();

export const BdPerformanceMonthRowSchema = z
  .object({
    month: z.string().default(""),
    win_rate: workbenchNullableNumber,
    ...BdPerformanceTotalsShape,
  })
  .loose();

export const BdPerformanceSchema = z
  .object({
    from: z.string().default(""),
    to: z.string().default(""),
    currency: z.string().default("CNY"),
    empty: z.string().default("insufficient_data"),
    signed: z
      .object({
        count: bdPipelineNumber,
        amount: bdPipelineMoney,
      })
      .loose(),
    delivered: z
      .object({ count: bdPipelineNumber, amount: bdPipelineMoney })
      .loose(),
    collected: z
      .object({ count: bdPipelineNumber, amount: bdPipelineMoney })
      .loose(),
    quotes: z
      .object({
        sent: bdPipelineNumber,
        accepted: bdPipelineNumber,
        win_rate: bdPipelineNumber,
        amount: bdPipelineMoney,
      })
      .loose(),
    followups: z
      .object({
        count: bdPipelineNumber,
        replied: bdPipelineNumber,
        meetings: bdPipelineNumber,
      })
      .loose(),
    affiliate: z
      .object({
        agency: bdPipelineMoney,
        creator: bdPipelineMoney,
        settled: bdPipelineMoney,
      })
      .loose(),
    by_member: z.array(BdPerformanceMemberRowSchema).default([]),
    by_month: z.array(BdPerformanceMonthRowSchema).default([]),
  })
  .loose();

export const EMPTY_BD_PERFORMANCE: BdPerformance = {
  from: "", to: "", currency: "CNY", empty: "insufficient_data",
  signed: { count: EMPTY_BD_PIPELINE_NUMBER, amount: EMPTY_BD_PIPELINE_MONEY },
  delivered: { count: EMPTY_BD_PIPELINE_NUMBER, amount: EMPTY_BD_PIPELINE_MONEY },
  collected: { count: EMPTY_BD_PIPELINE_NUMBER, amount: EMPTY_BD_PIPELINE_MONEY },
  quotes: {
    sent: EMPTY_BD_PIPELINE_NUMBER,
    accepted: EMPTY_BD_PIPELINE_NUMBER,
    win_rate: EMPTY_BD_PIPELINE_NUMBER,
    amount: EMPTY_BD_PIPELINE_MONEY,
  },
  followups: {
    count: EMPTY_BD_PIPELINE_NUMBER,
    replied: EMPTY_BD_PIPELINE_NUMBER,
    meetings: EMPTY_BD_PIPELINE_NUMBER,
  },
  affiliate: {
    agency: EMPTY_BD_PIPELINE_MONEY,
    creator: EMPTY_BD_PIPELINE_MONEY,
    settled: EMPTY_BD_PIPELINE_MONEY,
  },
  by_member: [],
  by_month: [],
};

// --- Batch CSV import (docs/engineering/WORKBENCH-API.md §23) ---------------
//
// Same shape for a preview and a real import. The leniencies follow the workbench
// block above:
//
//   * `rows` / `errors` default to empty arrays — a rejected file has no rows and a
//     clean file has no errors, and neither should blank the response.
//   * `reason` and `action` stay `z.string()`: the client renders unknown codes as
//     themselves instead of dropping the row, and the reason list is expected to
//     grow (§23.3 records what exists today).
//   * `preview` is an open record: what a row carries differs per kind, and the
//     server, not this schema, is the authority on those fields.
export const ImportPreviewResponseSchema = z
  .object({
    kind: z.string().default("quotes"),
    parsed: z.number().default(0),
    accepted: z.number().default(0),
    committed: z.number().default(0),
    rows: z
      .array(
        z
          .object({
            line: z.number().default(0),
            action: z.string().default("create"),
            preview: z.record(z.string(), z.unknown()).default({}),
          })
          .loose(),
      )
      .default([]),
    errors: z
      .array(
        z
          .object({
            line: z.number().default(0),
            column: z.string().default(""),
            reason: z.string().default(""),
          })
          .loose(),
      )
      .default([]),
  })
  .loose();

export const EMPTY_IMPORT_PREVIEW_RESPONSE: ImportPreviewResponse = {
  kind: "quotes",
  parsed: 0,
  accepted: 0,
  committed: 0,
  rows: [],
  errors: [],
};

// --- Capabilities (docs/engineering/WORKBENCH-API.md §24) -------------------
//
// The server resolves what the caller may do (§24.2: role → job-title template →
// department default → read-only fallback); the client never computes it. These
// schemas are the boundary defense: a missing field degrades to "no capabilities",
// which hides entry points instead of offering a button that 403s.
//
// `capabilities` is `z.array(z.string())`, not an enum union: a server that learns a
// new capability must not blank the whole response for an older client, and an unknown
// string simply never matches a known one.
export const WorkbenchCapabilitiesResponseSchema = z
  .object({
    capabilities: z.array(z.string()).default([]),
    source: z.string().default("fallback"),
    role: z.string().default("member"),
    visibility: z.string().default("transparent"),
  })
  .loose();

export const EMPTY_WORKBENCH_CAPABILITIES_RESPONSE: WorkbenchCapabilitiesResponse = {
  capabilities: [],
  source: "fallback",
  role: "member",
  visibility: "transparent",
};

export const WorkbenchRoleTemplateSchema = z
  .object({
    id: z.string().default(""),
    workspace_id: z.string().default(""),
    job_title: z.string().default(""),
    capabilities: z.array(z.string()).default([]),
    created_at: z.string().default(""),
    updated_at: z.string().default(""),
  })
  .loose();

export const EMPTY_WORKBENCH_ROLE_TEMPLATE: WorkbenchRoleTemplate = {
  id: "",
  workspace_id: "",
  job_title: "",
  capabilities: [],
  created_at: "",
  updated_at: "",
};

export const WorkbenchRoleTemplateListResponseSchema = z
  .object({
    templates: z.array(WorkbenchRoleTemplateSchema).default([]),
    total: z.number().default(0),
  })
  .loose();

export const EMPTY_WORKBENCH_ROLE_TEMPLATE_LIST_RESPONSE: WorkbenchRoleTemplateListResponse = {
  templates: [],
  total: 0,
};
