package knowledge

// Visibility of one item: the rule as a pure function, then the log-only
// observer the project-ACL switch needs before it may enforce anything.
//
// docs/engineering/ORG-MODEL.md §2/§5 (gaps 1 and 3): `acl_mode=project` is
// declared but behaves exactly like `workspace`, and `acl_mode=private` is
// owner-only even for a workspace owner/admin. Both fixes sit behind switches
// that default to false, because either one changes what people can see:
//
//	knowledge_project_acl       enforce acl_mode=project (this half: log only)
//	knowledge_admin_visibility  let owner/admin read every item
//
// ItemVisibleTo is the rule. It takes an item, a viewer and the flags and reads
// no database, so one function answers the three questions that must not drift
// apart: today's answer (flags off), the shadow answer (ProjectACL on, logged
// only), and the enforced answer after the switch is flipped.
//
// Turning `project` into a real filter shrinks visibility, so it lands as an
// observation first: observeProjectACL computes exactly what the flip would hide
// from this viewer and who would lose it, writes one structured log line, and
// changes nothing else — no rows, no response, no predicate.

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"sort"
	"strings"

	"github.com/jackc/pgx/v5"

	"github.com/jerry-halo2026/morchat.co/server/internal/featureflags"
	"github.com/jerry-halo2026/morchat.co/server/internal/projectaccess"
)

// VisibilityFlags is the pair of switches the item rule reads. The zero value is
// today's behaviour: `project` items are workspace-visible and only their owner
// reads a `private` item.
type VisibilityFlags struct {
	// ProjectACL makes acl_mode=project ask project_member instead of answering
	// yes for everyone in the workspace.
	ProjectACL bool
	// AdminVisibility lets a workspace owner/admin read every item, which is the
	// ORG-MODEL §2 row for 知识条目 that `canViewItem` never implemented.
	AdminVisibility bool
}

// Viewer is the observer a visibility decision is made for.
type Viewer struct {
	// WorkspaceID is the tenancy boundary: an item of another workspace is not
	// "hidden", it is not an item.
	WorkspaceID string
	UserID      string
	// Role is member.role — "owner", "admin", or "member". An empty role is not
	// a manager, so the bypass has to be asked for twice (flag and role).
	Role string
	// ProjectIDs is the viewer's project_member set. Only ACLModeProject reads
	// it; a nil set means "member of no project".
	ProjectIDs map[string]struct{}
}

// InProject reports whether the viewer is a member of projectID.
func (v Viewer) InProject(projectID string) bool {
	if projectID == "" {
		return false
	}
	_, ok := v.ProjectIDs[projectID]
	return ok
}

// IsManager reports whether the viewer is a workspace owner or admin. The role
// vocabulary is projectaccess's, so the two packages cannot disagree about who
// counts as a manager.
func (v Viewer) IsManager() bool { return projectaccess.IsManagerRole(v.Role) }

// ViewableItem is the item side of the rule: the fields one visibility decision
// reads, and nothing else. It is exported so the rule can be exercised as a pure
// function, without fixtures.
type ViewableItem struct {
	ID          string
	WorkspaceID string
	SpaceID     string
	Title       string
	Kind        string
	ACLMode     string
	// OwnerID is the item's owner, "" when the column is NULL.
	OwnerID string
	// ProjectID is the item's project, "" when it has none. An ACLModeProject
	// item with no project names no member set, so it stays workspace-visible;
	// the shadow counts those separately instead of hiding them by accident.
	ProjectID string
	Status    string
}

// ItemVisibleTo is the single "may this viewer see this item" rule.
//
//   - the item must live in the viewer's workspace: a workspace is the tenancy
//     boundary, so crossing it is not "not found", it is forbidden;
//   - a deprecated item is readable directly but not retrievable, so it is
//     refused here as well — retrieval must not surface it by another route;
//   - `workspace` items are visible to every member;
//   - `project` items are visible to every member while ProjectACL is off (the
//     pre-switch behaviour), and to the item's project members once it is on;
//   - `private` items are visible to their owner only;
//   - with AdminVisibility on, a workspace owner/admin sees all of it. The
//     bypass is applied after the lifecycle check on purpose: it widens the ACL
//     decision, it does not make a deprecated item retrievable again.
func ItemVisibleTo(item ViewableItem, viewer Viewer, flags VisibilityFlags) bool {
	if item.WorkspaceID != viewer.WorkspaceID {
		return false
	}
	if item.Status == StatusDeprecated {
		return false
	}
	if flags.AdminVisibility && viewer.IsManager() {
		return true
	}
	switch item.ACLMode {
	case ACLModeWorkspace:
		return true
	case ACLModeProject:
		if !flags.ProjectACL || item.ProjectID == "" {
			return true
		}
		return viewer.InProject(item.ProjectID)
	case ACLModePrivate:
		return item.OwnerID != "" && item.OwnerID == viewer.UserID
	}
	return false
}

// canViewItem is today's rule, kept as the name the retrieval paths call. It is
// ItemVisibleTo with the switches off, so the enforced rule and the current one
// cannot disagree about workspace, status, or private items.
func canViewItem(item ViewableItem, workspaceID, viewerID string) bool {
	return ItemVisibleTo(item, Viewer{WorkspaceID: workspaceID, UserID: viewerID}, VisibilityFlags{})
}

// ---------------------------------------------------------------------------
// Flags
// ---------------------------------------------------------------------------

// projectACLEnabled reports knowledge_project_acl. A nil Service is legal and
// answers the default (false), so every caller keeps today's behaviour.
func (s *Service) projectACLEnabled(ctx context.Context) bool {
	return featureflags.KnowledgeProjectACLEnabled(ctx, s.flags)
}

// adminVisibilityEnabled reports knowledge_admin_visibility.
func (s *Service) adminVisibilityEnabled(ctx context.Context) bool {
	return featureflags.KnowledgeAdminVisibilityEnabled(ctx, s.flags)
}

// ---------------------------------------------------------------------------
// Log-only observation
// ---------------------------------------------------------------------------

// shadowItemLimit bounds how many indexable items one observation reads. It is
// far above the item count of any workspace this ships to; reaching it sets
// truncated so the log never claims a total it did not count.
const shadowItemLimit = 2000

// shadowSampleItems is how many hidden items one log line lists. The count is
// exact; this is only the excerpt a human reads.
const shadowSampleItems = 5

// shadowSampleUsers is how many affected user ids one log line lists.
const shadowSampleUsers = 5

// ShadowItem is one item an enforced project ACL would take away from the
// viewer, plus who else would lose it.
type ShadowItem struct {
	ItemID    string `json:"item_id"`
	ProjectID string `json:"project_id"`
	OwnerID   string `json:"owner_id,omitempty"`
	// AffectedMembers counts the workspace members who are not project members,
	// i.e. the people currently seeing this item who would stop seeing it.
	AffectedMembers int      `json:"affected_members"`
	AffectedUsers   []string `json:"affected_users,omitempty"`
}

// ProjectACLShadow is what one observation found. It exists to be logged, never
// returned, so its fields describe an experiment rather than a contract.
type ProjectACLShadow struct {
	ViewerRole     string
	ViewerProjects int
	IndexableItems int
	// HiddenCount is exact; HiddenItems is the bounded excerpt.
	HiddenCount    int
	HiddenItems    []ShadowItem
	AffectedMembers int
	AffectedUsers  []string
	// NoProjectItems counts acl_mode=project items with no project_id. They stay
	// visible under the new rule (there is no member set to intersect), which is
	// a decision the flip can still revisit — so they are counted, not hidden.
	NoProjectItems int
	Truncated      bool
}

// viewerRole reads member.role for the viewer. A missing membership is not an
// error here: the observation reports an empty role and the bypass simply does
// not apply.
func (s *Service) viewerRole(ctx context.Context, workspaceID, viewerID string) (string, error) {
	var role string
	err := s.db.QueryRow(ctx, `
		SELECT role FROM member
		WHERE workspace_id = $1 AND user_id::text = $2`, workspaceID, viewerID).Scan(&role)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", nil
	}
	if err != nil {
		return "", fmt.Errorf("read viewer role: %w", err)
	}
	return role, nil
}

// viewerProjects reads the viewer's project_member set for this workspace.
func (s *Service) viewerProjects(ctx context.Context, workspaceID, viewerID string) (map[string]struct{}, error) {
	rows, err := s.db.Query(ctx, `
		SELECT project_id::text FROM project_member
		WHERE workspace_id = $1 AND user_id::text = $2`, workspaceID, viewerID)
	if err != nil {
		return nil, fmt.Errorf("read viewer projects: %w", err)
	}
	defer rows.Close()
	out := map[string]struct{}{}
	for rows.Next() {
		var projectID string
		if err := rows.Scan(&projectID); err != nil {
			return nil, fmt.Errorf("scan viewer project: %w", err)
		}
		out[projectID] = struct{}{}
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("read viewer projects: %w", err)
	}
	return out, nil
}

// ProjectACLShadow computes what enforcing knowledge_project_acl would hide from
// one viewer right now, and who else would lose it.
//
// It reads the same indexable set the retrieval index layer reads (draft +
// active, not archived), answers each item with ItemVisibleTo twice — flags off
// (what happens today) and ProjectACL on (what the flip would do) — and keeps
// only the items that go from visible to hidden.
func (s *Service) ProjectACLShadow(ctx context.Context, workspaceID, viewerID, spaceID string) (ProjectACLShadow, error) {
	var shadow ProjectACLShadow
	if strings.TrimSpace(workspaceID) == "" || strings.TrimSpace(viewerID) == "" {
		return shadow, fmt.Errorf("%w: workspace_id and viewer_id are required", ErrInvalidField)
	}

	role, err := s.viewerRole(ctx, workspaceID, viewerID)
	if err != nil {
		return shadow, err
	}
	shadow.ViewerRole = role

	projects, err := s.viewerProjects(ctx, workspaceID, viewerID)
	if err != nil {
		return shadow, err
	}
	shadow.ViewerProjects = len(projects)

	args := []any{workspaceID}
	where := `i.workspace_id = $1
		AND i.status IN ('draft', 'active')
		AND coalesce(i.metadata->>'archived', 'false') <> 'true'`
	if spaceID = strings.TrimSpace(spaceID); spaceID != "" {
		args = append(args, spaceID)
		where += fmt.Sprintf(" AND i.space_id::text = $%d", len(args))
	}
	args = append(args, shadowItemLimit+1)

	rows, err := s.db.Query(ctx, fmt.Sprintf(`
		SELECT i.id::text, i.workspace_id::text, i.space_id::text, i.title, i.kind,
		       i.acl_mode, coalesce(i.owner_id::text, ''), coalesce(i.project_id::text, ''),
		       i.status
		FROM knowledge_items i
		WHERE %s
		ORDER BY i.updated_at DESC, i.id DESC
		LIMIT $%d`, where, len(args)), args...)
	if err != nil {
		return shadow, fmt.Errorf("read items for acl shadow: %w", err)
	}
	defer rows.Close()

	viewer := Viewer{WorkspaceID: workspaceID, UserID: viewerID, Role: role, ProjectIDs: projects}
	current := VisibilityFlags{}
	enforced := VisibilityFlags{
		ProjectACL:      true,
		AdminVisibility: s.adminVisibilityEnabled(ctx),
	}

	hiddenProjects := map[string]struct{}{}
	read := 0
	for rows.Next() {
		var item ViewableItem
		if err := rows.Scan(&item.ID, &item.WorkspaceID, &item.SpaceID, &item.Title,
			&item.Kind, &item.ACLMode, &item.OwnerID, &item.ProjectID, &item.Status); err != nil {
			return shadow, fmt.Errorf("scan item for acl shadow: %w", err)
		}
		read++
		if read > shadowItemLimit {
			shadow.Truncated = true
			break
		}
		shadow.IndexableItems++
		if item.ACLMode == ACLModeProject && item.ProjectID == "" {
			shadow.NoProjectItems++
		}
		if !ItemVisibleTo(item, viewer, current) || ItemVisibleTo(item, viewer, enforced) {
			continue
		}
		shadow.HiddenCount++
		hiddenProjects[item.ProjectID] = struct{}{}
		if len(shadow.HiddenItems) < shadowSampleItems {
			shadow.HiddenItems = append(shadow.HiddenItems, ShadowItem{
				ItemID:    item.ID,
				ProjectID: item.ProjectID,
				OwnerID:   item.OwnerID,
			})
		}
	}
	if err := rows.Err(); err != nil {
		return shadow, fmt.Errorf("read items for acl shadow: %w", err)
	}
	if shadow.HiddenCount == 0 {
		return shadow, nil
	}

	affected, err := s.shadowAudience(ctx, workspaceID, sortedKeys(hiddenProjects))
	if err != nil {
		return shadow, err
	}
	shadow.AffectedMembers = affected.total
	shadow.AffectedUsers = affected.users
	for i := range shadow.HiddenItems {
		one := affected.byProject[shadow.HiddenItems[i].ProjectID]
		shadow.HiddenItems[i].AffectedMembers = one.count
		shadow.HiddenItems[i].AffectedUsers = one.users
	}
	return shadow, nil
}

// shadowAudience is who would stop seeing the hidden items: the workspace
// members who are not project members. `total` counts people affected by at
// least one item; `byProject` carries the same answer per project, which is what
// makes "which people" answerable in the log.
type shadowAudience struct {
	total     int
	users     []string
	byProject map[string]projectAudience
}

type projectAudience struct {
	count int
	users []string
}

// shadowAudience reads the audience of every project that would lose items.
//
// The window count(*) OVER () is evaluated before LIMIT, so `affected` is the
// full member count while the row set stays small: this observation runs inside
// a read path and must not turn into "list every member of the workspace".
func (s *Service) shadowAudience(ctx context.Context, workspaceID string, projectIDs []string) (shadowAudience, error) {
	out := shadowAudience{byProject: map[string]projectAudience{}}
	if len(projectIDs) == 0 {
		return out, nil
	}
	rows, err := s.db.Query(ctx, `
		SELECT p.project_id, x.user_id::text, x.affected
		FROM unnest($2::text[]) AS p(project_id)
		JOIN LATERAL (
			SELECT m.user_id, count(*) OVER () AS affected
			FROM member m
			WHERE m.workspace_id = $1
			  AND NOT EXISTS (
				SELECT 1 FROM project_member pm
				WHERE pm.workspace_id = m.workspace_id
				  AND pm.project_id::text = p.project_id
				  AND pm.user_id = m.user_id)
			ORDER BY m.user_id
			LIMIT $3
		) x ON true`, workspaceID, projectIDs, shadowSampleUsers+1)
	if err != nil {
		return out, fmt.Errorf("read acl shadow audience: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var projectID, userID string
		var affected int
		if err := rows.Scan(&projectID, &userID, &affected); err != nil {
			return out, fmt.Errorf("scan acl shadow audience: %w", err)
		}
		one := out.byProject[projectID]
		one.count = affected
		if len(one.users) < shadowSampleUsers {
			one.users = append(one.users, userID)
		}
		out.byProject[projectID] = one
	}
	if err := rows.Err(); err != nil {
		return out, fmt.Errorf("read acl shadow audience: %w", err)
	}

	// One number for "people affected by at least one hidden item", which the
	// per-project counts cannot answer: the same member appears in many of them.
	var total int
	var all []string
	err = s.db.QueryRow(ctx, `
		SELECT count(*), coalesce(array_agg(s.user_id::text ORDER BY s.user_id::text), '{}')
		FROM (
			SELECT DISTINCT m.user_id
			FROM unnest($2::text[]) AS p(project_id)
			JOIN member m ON m.workspace_id = $1
			WHERE NOT EXISTS (
				SELECT 1 FROM project_member pm
				WHERE pm.workspace_id = m.workspace_id
				  AND pm.project_id::text = p.project_id
				  AND pm.user_id = m.user_id)
		) s`, workspaceID, projectIDs).Scan(&total, &all)
	if err != nil {
		return out, fmt.Errorf("count acl shadow audience: %w", err)
	}
	out.total = total
	if len(all) > shadowSampleUsers {
		all = all[:shadowSampleUsers]
	}
	out.users = all
	return out, nil
}

// sortedKeys is a deterministic project order, so two log lines about the same
// workspace can be compared.
func sortedKeys(set map[string]struct{}) []string {
	out := make([]string, 0, len(set))
	for key := range set {
		out = append(out, key)
	}
	sort.Strings(out)
	return out
}

// observeProjectACL writes the one log line this phase exists for. It runs
// *after* the response data is computed, touches no result, and turns every
// failure into a warning: an observation may never break a read.
func (s *Service) observeProjectACL(ctx context.Context, op, workspaceID, viewerID, spaceID string) {
	if !s.projectACLEnabled(ctx) {
		return
	}
	shadow, err := s.ProjectACLShadow(ctx, workspaceID, viewerID, spaceID)
	if err != nil {
		s.logger.WarnContext(ctx, "knowledge project acl shadow failed",
			slog.String("op", op),
			slog.String("workspace_id", workspaceID),
			slog.String("viewer_id", viewerID),
			slog.String("error", err.Error()))
		return
	}
	s.logger.InfoContext(ctx, "knowledge project acl shadow",
		slog.String("op", op),
		slog.String("workspace_id", workspaceID),
		slog.String("viewer_id", viewerID),
		slog.String("space_id", strings.TrimSpace(spaceID)),
		slog.String("viewer_role", shadow.ViewerRole),
		slog.Int("viewer_projects", shadow.ViewerProjects),
		slog.Bool("admin_visibility", s.adminVisibilityEnabled(ctx)),
		slog.Int("indexable_items", shadow.IndexableItems),
		slog.Int("would_hide", shadow.HiddenCount),
		slog.Int("affected_members", shadow.AffectedMembers),
		slog.Any("affected_user_ids", shadow.AffectedUsers),
		slog.Int("project_items_without_project", shadow.NoProjectItems),
		slog.Bool("truncated", shadow.Truncated),
		slog.Any("hidden_items", shadow.HiddenItems))
}

// ---------------------------------------------------------------------------
// Reserved SQL predicates
// ---------------------------------------------------------------------------

// The enforced counterparts of search.go's visCond, written now so the flip is a
// replacement rather than a rewrite, and NOT referenced by any query: a grep for
// visCondProjectACL matches this file and its test only.
//
// Switching knowledge_project_acl to enforcement means editing exactly two lines:
//
//	search.go:204   const visCond = ...            -> the body of visCondProjectACL
//	keys.go:284     where := []string{..., visCond} -> ..., visCondProjectACLAliasI
//
// plus, when knowledge_admin_visibility is also on, appending visCondManagerBypass
// to both. The two spellings differ only in the table qualifier: the retrieval
// queries name knowledge_items without an alias, while ListItems aliases it `i`.
//
// A `project` item with no project_id stays visible in this predicate as well,
// exactly like ItemVisibleTo: there is no member set to intersect, and hiding it
// would be a second, undocumented change on the same flip.
const visCondProjectACL = `(acl_mode = 'workspace'
  OR (acl_mode = 'project' AND (
        knowledge_items.project_id IS NULL
        OR EXISTS (
          SELECT 1 FROM project_member pm
          WHERE pm.workspace_id = knowledge_items.workspace_id
            AND pm.project_id = knowledge_items.project_id
            AND pm.user_id::text = $2)))
  OR (acl_mode = 'private' AND coalesce(owner_id::text = $2, false)))`

// visCondProjectACLAliasI is visCondProjectACL for the queries that alias
// knowledge_items as `i` (Store.ListItems in keys.go).
const visCondProjectACLAliasI = `(i.acl_mode = 'workspace'
  OR (i.acl_mode = 'project' AND (
        i.project_id IS NULL
        OR EXISTS (
          SELECT 1 FROM project_member pm
          WHERE pm.workspace_id = i.workspace_id
            AND pm.project_id = i.project_id
            AND pm.user_id::text = $2)))
  OR (i.acl_mode = 'private' AND coalesce(i.owner_id::text = $2, false)))`

// visCondManagerBypass is the knowledge_admin_visibility half of the enforced
// predicate: a workspace owner/admin sees every item of the workspace.
const visCondManagerBypass = `EXISTS (
  SELECT 1 FROM member m
  WHERE m.workspace_id = $1
    AND m.user_id::text = $2
    AND m.role IN ('owner', 'admin'))`
