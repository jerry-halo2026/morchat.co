package featureflags

import (
	"context"

	"github.com/jerry-halo2026/morchat.co/server/pkg/featureflag"
)

const (
	// BillingWorkspaceSubscriptions gates the workspace-scoped entitlement,
	// Stripe Checkout, seat reconcile, and Billing Portal proxy surface. It is
	// deliberately off by default so the main repository can ship before the
	// managed cloud enables its matching billing.subscriptions capability.
	BillingWorkspaceSubscriptions = "billing_workspace_subscriptions"
	// ComposioMCPApps gates the Composio app management UI and — together with
	// the MUL-3963 permission_mode / invocation_targets access model it depends
	// on — the aligned Private / Public-to picker in the agent create flow.
	// The access model exists to gate Composio sharing, so the two ship on the
	// same switch.
	ComposioMCPApps = "composio_mcp_apps"
	// PluginsV1 gates the user-facing Plugin catalog and lifecycle management
	// APIs while the first product slice is dogfooded. It deliberately does not
	// gate pinned Task/Run execution: disabling discovery and management must not
	// mutate an immutable execution manifest that is already in flight.
	PluginsV1 = "plugins_v1"
	// TriageV1 gates the Triage inbox (MUL-7189): creating issues into Triage,
	// triage runs, and the Triage page. It is a GLOBAL switch — per-workspace
	// targeting has no production wiring — which is enough because a
	// workspace with no triager configured and no Triage issues sees nothing
	// either way. Turning it off stops new intake and triage runs but leaves
	// existing Triage issues workable.
	TriageV1 = "triage_v1"
	// LocalSearchIndex gates the sync endpoints behind Web/Desktop local search
	// (MUL-7754). On by default. Turning it off (FF_LOCAL_SEARCH_INDEX=off)
	// makes those endpoints answer 404, so clients stop syncing and search
	// through the server again without a client release.
	LocalSearchIndex = "local_search_index"
	// KnowledgeProjectACL enforces knowledge_items.acl_mode=project against
	// project_member (docs/engineering/ORG-MODEL.md §5 gap 1). Off by default and
	// deliberately so: enforcing it SHRINKS what people can see, so the switch
	// first runs as an observation — retrieve/list log what it would hide and
	// from whom, and nothing changes — and only then flips. FF_KNOWLEDGE_PROJECT_ACL=on
	// turns the observation on; the enforcement step is a code change described in
	// server/internal/knowledge/visibility.go.
	KnowledgeProjectACL = "knowledge_project_acl"
	// KnowledgeAdminVisibility gives workspace owner/admin the read bypass
	// ORG-MODEL §2 promises for acl_mode=private items (§5 gap 3). Independent of
	// KnowledgeProjectACL: it only widens visibility, so it can be observed and
	// rolled back on its own.
	KnowledgeAdminVisibility = "knowledge_admin_visibility"
	// KnowledgeDepartmentScope groups the knowledge space switcher by the
	// department each space is filed under (ORG-MODEL §3). Groups and sorts only:
	// no space is hidden and, while it is off, the switcher renders exactly as
	// before. It is a frontend decision, published through /api/config.
	KnowledgeDepartmentScope = "knowledge_department_scope"
	// agentBuilderCompat is no longer a release flag. Keep publishing the key
	// as enabled so installed desktop clients that still gate the AI creation
	// entry on this config decision receive the permanently enabled behavior.
	agentBuilderCompat = "agents_agent_builder"
	// agentSkillTogglesCompat is no longer a release flag. Keep publishing the
	// key as enabled so installed v0.4.0 desktop clients, which still gate the
	// switch on this config decision, receive the permanently enabled behavior.
	agentSkillTogglesCompat = "agents_skill_toggles"
	// resourceLabelsCompat is no longer a release flag. Keep publishing the key
	// as enabled for installed desktop clients from v0.4.0 through at least
	// v0.4.15, every release shipped before this change. Unlike the skill-toggle
	// gate above, which was removed client-side in v0.4.1, the resource-label
	// gate remained in every such client and fails closed (default false) if
	// the key stops being published.
	resourceLabelsCompat = "settings_resource_labels"
	// projectWorkflowsCompat keeps workflow UI available in installed desktop
	// clients that still gate it on this config decision and default to false.
	projectWorkflowsCompat = "project_workflows_v1"
	// DepartmentDefaultScope gates the department default scope
	// (docs/engineering/ORG-MODEL.md §3): a project created by a member with a
	// department starts private to that department, and an issue created
	// without a project lands in the department inbox instead of being visible
	// to the whole workspace. Off by default, and it only ever adds rows at
	// creation time — no read path consults department_id, so turning it off
	// leaves every existing object exactly as visible as it is today.
	DepartmentDefaultScope = "department_default_scope"
)

var frontendPublicFlags = []string{
	BillingWorkspaceSubscriptions,
	ComposioMCPApps,
	PluginsV1,
	KnowledgeDepartmentScope,
}

func BillingWorkspaceSubscriptionsEnabled(ctx context.Context, flags *featureflag.Service) bool {
	return flags.IsEnabled(ctx, BillingWorkspaceSubscriptions, false)
}

func ComposioMCPAppsEnabled(ctx context.Context, flags *featureflag.Service) bool {
	return flags.IsEnabled(ctx, ComposioMCPApps, false)
}

func PluginsV1Enabled(ctx context.Context, flags *featureflag.Service) bool {
	return flags.IsEnabled(ctx, PluginsV1, false)
}

func TriageV1Enabled(ctx context.Context, flags *featureflag.Service) bool {
	return flags.IsEnabled(ctx, TriageV1, false)
}

func LocalSearchIndexEnabled(ctx context.Context, flags *featureflag.Service) bool {
	return flags.IsEnabled(ctx, LocalSearchIndex, true)
}

// KnowledgeProjectACLEnabled reports whether the project-ACL observation runs.
// Enforcement is not wired to this switch yet: see knowledge.VisibilityFlags.
func KnowledgeProjectACLEnabled(ctx context.Context, flags *featureflag.Service) bool {
	return flags.IsEnabled(ctx, KnowledgeProjectACL, false)
}

// KnowledgeAdminVisibilityEnabled reports the owner/admin read bypass.
func KnowledgeAdminVisibilityEnabled(ctx context.Context, flags *featureflag.Service) bool {
	return flags.IsEnabled(ctx, KnowledgeAdminVisibility, false)
}

// KnowledgeDepartmentScopeEnabled reports whether the knowledge space switcher
// groups by department. Off by default: the switcher then renders as before.
func KnowledgeDepartmentScopeEnabled(ctx context.Context, flags *featureflag.Service) bool {
	return flags.IsEnabled(ctx, KnowledgeDepartmentScope, false)
}

func DepartmentDefaultScopeEnabled(ctx context.Context, flags *featureflag.Service) bool {
	return flags.IsEnabled(ctx, DepartmentDefaultScope, false)
}

func EvaluateFrontendPublicFlags(ctx context.Context, flags *featureflag.Service) map[string]bool {
	out := make(map[string]bool, len(frontendPublicFlags)+4)
	for _, key := range frontendPublicFlags {
		out[key] = flags.IsEnabled(ctx, key, false)
	}
	out[agentBuilderCompat] = true
	out[agentSkillTogglesCompat] = true
	out[resourceLabelsCompat] = true
	out[projectWorkflowsCompat] = true
	return out
}
