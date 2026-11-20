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

// VisibilityFlags is the pair of switches the item rule reads, plus the space
// switch the space rule reads. The zero value is today's behaviour: `project`
// items are workspace-visible, only their owner reads a `private` item, and every
// member of the workspace sees every space.
type VisibilityFlags struct {
	// ProjectACL makes acl_mode=project ask project_member instead of answering
	// yes for everyone in the workspace.
	ProjectACL bool
	// AdminVisibility lets a workspace owner/admin read every item, which is the
	// ORG-MODEL §2 row for 知识条目 that `canViewItem` never implemented.
	AdminVisibility bool
	// SpaceScope narrows a knowledge space to its department: a space filed
	// under a department is visible to that department (and to owner/admin),
	// while a space with no department stays visible to the whole workspace.
	SpaceScope bool
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
	// DepartmentID is the viewer's member.department_id, "" when unassigned.
	// Only the space rule reads it: a member with no department sees the shared
	// (department-less) spaces and nothing else.
	DepartmentID string
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
	// ProjectVisibility is the item's project visibility — project.visibility,
	// `workspace` or `private` — and "" when the caller does not know it.
	//
	// A project-scoped item follows its project: under a workspace-visible
	// project it is visible to the whole workspace, because hiding it from
	// non-members would mean "the project is everyone's, the knowledge is not".
	// Empty is the not-known case and is read as NOT workspace-visible, i.e.
	// fail-closed; that is why the enforcement paths must fill it from the
	// project row before they start enforcing (see the reserved predicates).
	ProjectVisibility string
	// SpaceOwnerID is knowledge_spaces.owner_id of the item's space, "" when the
	// space names no owner or the caller does not know it.
	//
	// It is not a column of knowledge_items: the draft rule needs it, and the
	// by-id reads fill it from the space row (see draftFactsFor). A caller that
	// leaves it empty gets the fail-closed reading — an unapproved draft with no
	// space owner is readable by its own owner and by a workspace manager, and by
	// nobody else.
	SpaceOwnerID string
	// DepartmentLeadID is department.lead_user_id of the department the item's
	// space is filed under, "" when the space has no department or the caller
	// does not know it. Filled and read exactly like SpaceOwnerID.
	DepartmentLeadID string
	Status           string
}

// draftReadableBy reports whether the viewer belongs to the set that may read an
// unapproved draft: its owner, the owner of the space it is filed in, the lead of
// that space's department, and any workspace owner/admin.
//
// It is the row-level half of the intake gate in docs/engineering/CONTRACTS.md
// ("知识入库闸门", who may approve): the people the review waits on must be able
// to read what they are deciding on, and they are exactly the people the approval
// path admits. search.go's draftApproverCond spells the same four in SQL, so a
// draft the retrieval index will show is a draft its reader can open by id.
func draftReadableBy(item ViewableItem, viewer Viewer) bool {
	if viewer.UserID == "" {
		return false
	}
	return (item.OwnerID != "" && item.OwnerID == viewer.UserID) ||
		(item.SpaceOwnerID != "" && item.SpaceOwnerID == viewer.UserID) ||
		(item.DepartmentLeadID != "" && item.DepartmentLeadID == viewer.UserID) ||
		viewer.IsManager()
}

// ItemVisibleTo is the single "may this viewer see this item" rule.
//
//   - the item must live in the viewer's workspace: a workspace is the tenancy
//     boundary, so crossing it is not "not found", it is forbidden;
//   - a deprecated item is readable directly but not retrievable, so it is
//     refused here as well — retrieval must not surface it by another route;
//   - an unapproved draft is a proposal, not knowledge yet, so it is readable
//     only by its owner, its space's owner, the lead of its space's department,
//     and a workspace owner/admin (draftReadableBy). Those are the people the
//     review gate admits, which is what keeps the approve path able to read the
//     row it is about to activate. `active` has no such narrowing;
//   - `workspace` items are visible to every member;
//   - `project` items are visible to every member while ProjectACL is off (the
//     pre-switch behaviour), and once it is on they follow their project: a
//     workspace-visible project keeps them visible to everyone, a private one
//     narrows them to project members;
//   - `private` items are visible to their owner only;
//   - with AdminVisibility on, a workspace owner/admin sees all of it. The
//     bypass is applied after the lifecycle check on purpose: it widens the ACL
//     decision, it does not make a deprecated item retrievable again.
//
// The draft rule is an upper bound, not a grant: an acl_mode branch still applies
// afterwards, so a `private` draft stays its owner's alone even for the space
// owner. That is the same conjunction the retrieval index applies
// (visCondIndexable = draft approver AND acl), so "findable" and "readable by id"
// cannot name different people.
func ItemVisibleTo(item ViewableItem, viewer Viewer, flags VisibilityFlags) bool {
	if item.WorkspaceID != viewer.WorkspaceID {
		return false
	}
	if item.Status == StatusDeprecated {
		return false
	}
	if item.Status == StatusDraft && !draftReadableBy(item, viewer) {
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
		if item.ProjectVisibility == projectaccess.VisibilityWorkspace {
			return true
		}
		return viewer.InProject(item.ProjectID)
	case ACLModePrivate:
		return item.OwnerID != "" && item.OwnerID == viewer.UserID
	}
	return false
}

// canViewItem is the row-only reading of the rule: ItemVisibleTo with the
// switches off and a viewer that has no membership row, so no role and no
// department. It answers the ACL halves unchanged and reads an unapproved draft
// fail-closed (owner only), because the approver facts live on the space row and
// this function reads no database.
//
// The by-id paths therefore do not call it: they call itemVisibleToViewer, which
// fills those facts first. canViewItem survives as the pure boundary the
// retrieval recheck used to be, and every caller that has only a row and two ids
// gets the conservative answer.
func canViewItem(item ViewableItem, workspaceID, viewerID string) bool {
	return ItemVisibleTo(item, Viewer{WorkspaceID: workspaceID, UserID: viewerID}, VisibilityFlags{})
}

// ---------------------------------------------------------------------------
// Draft readers: the space-side facts the rule cannot read itself
// ---------------------------------------------------------------------------

// draftReaderFacts are the two people a space names for the intake gate: its
// owner and the lead of the department it is filed under.
type draftReaderFacts struct {
	SpaceOwnerID     string
	DepartmentLeadID string
}

// spaceDraftReaderFacts reads the draft-approver facts of a batch of spaces in
// one query. A space that is unknown, has no owner, or has no department leaves
// the corresponding field empty, which draftReadableBy reads fail-closed.
func (s *Service) spaceDraftReaderFacts(ctx context.Context, workspaceID string, spaceIDs []string) (map[string]draftReaderFacts, error) {
	out := make(map[string]draftReaderFacts, len(spaceIDs))
	if len(spaceIDs) == 0 {
		return out, nil
	}
	rows, err := s.db.Query(ctx, `
		SELECT sp.id::text,
		       coalesce(sp.owner_id::text, ''),
		       coalesce(d.lead_user_id::text, '')
		FROM knowledge_spaces sp
		LEFT JOIN department d
		       ON d.workspace_id = sp.workspace_id AND d.id = sp.department_id
		WHERE sp.workspace_id = $1 AND sp.id::text = ANY($2::text[])`, workspaceID, spaceIDs)
	if err != nil {
		return nil, fmt.Errorf("read knowledge space draft readers: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var spaceID string
		var facts draftReaderFacts
		if err := rows.Scan(&spaceID, &facts.SpaceOwnerID, &facts.DepartmentLeadID); err != nil {
			return nil, fmt.Errorf("scan knowledge space draft readers: %w", err)
		}
		out[spaceID] = facts
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("read knowledge space draft readers: %w", err)
	}
	return out, nil
}

// itemsVisibleToViewer is the by-id gate for a batch of rows: ItemVisibleTo over
// the viewer's real identity, with the draft facts filled in first.
//
// It is the one function every by-id read goes through — GetItemForViewer and the
// retrieval recheck in search.go, ReadItem in keys.go — so "GET by id", the
// agent's knowledge.get and the post-retrieval recheck cannot disagree about who
// may read a draft.
//
// A batch with no draft in it answers exactly the ACL rule it answered before the
// draft rule existed, and pays no extra read: the role and the space facts are
// only fetched when a draft is actually being judged.
func (s *Service) itemsVisibleToViewer(ctx context.Context, workspaceID, viewerID string, items []ViewableItem) ([]bool, error) {
	visible := make([]bool, len(items))
	if len(items) == 0 {
		return visible, nil
	}
	viewer := Viewer{WorkspaceID: workspaceID, UserID: viewerID}
	if draftSpaces := draftSpaceIDs(items); len(draftSpaces) > 0 {
		// The role is what makes a workspace owner/admin a draft reader, so the
		// viewer is read with its real membership rather than the empty-role
		// viewer canViewItem uses.
		var err error
		if viewer, err = s.spaceViewer(ctx, workspaceID, viewerID); err != nil {
			return nil, err
		}
		facts, err := s.spaceDraftReaderFacts(ctx, workspaceID, draftSpaces)
		if err != nil {
			return nil, err
		}
		for i := range items {
			if itemFacts, ok := facts[items[i].SpaceID]; ok {
				items[i].SpaceOwnerID = itemFacts.SpaceOwnerID
				items[i].DepartmentLeadID = itemFacts.DepartmentLeadID
			}
		}
	}
	for i := range items {
		visible[i] = ItemVisibleTo(items[i], viewer, VisibilityFlags{})
	}
	return visible, nil
}

// draftSpaceIDs is the distinct set of spaces a batch of drafts is filed in:
// only those rows carry a space-side fact to read.
func draftSpaceIDs(items []ViewableItem) []string {
	spaceIDs := make([]string, 0, len(items))
	seen := make(map[string]struct{}, len(items))
	for _, item := range items {
		if item.Status != StatusDraft || item.SpaceID == "" {
			continue
		}
		if _, ok := seen[item.SpaceID]; ok {
			continue
		}
		seen[item.SpaceID] = struct{}{}
		spaceIDs = append(spaceIDs, item.SpaceID)
	}
	return spaceIDs
}

// itemVisibleToViewer is itemsVisibleToViewer for the by-id read of one row.
func (s *Service) itemVisibleToViewer(ctx context.Context, workspaceID, viewerID string, item ViewableItem) (bool, error) {
	visible, err := s.itemsVisibleToViewer(ctx, workspaceID, viewerID, []ViewableItem{item})
	if err != nil {
		return false, err
	}
	return visible[0], nil
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

// spaceScopeEnabled reports knowledge_space_scope: the space rule enforces.
func (s *Service) spaceScopeEnabled(ctx context.Context) bool {
	return featureflags.KnowledgeSpaceScopeEnabled(ctx, s.flags)
}

// spaceScopeShadowEnabled reports knowledge_space_scope_shadow: the space rule
// only observes.
func (s *Service) spaceScopeShadowEnabled(ctx context.Context) bool {
	return featureflags.KnowledgeSpaceScopeShadowEnabled(ctx, s.flags)
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
	HiddenCount     int
	HiddenItems     []ShadowItem
	AffectedMembers int
	AffectedUsers   []string
	// NoProjectItems counts acl_mode=project items with no project_id. They stay
	// visible under the new rule (there is no member set to intersect), which is
	// a decision the flip can still revisit — so they are counted, not hidden.
	NoProjectItems int
	Truncated      bool
}

// viewerIdentity reads member.role and member.department_id for the viewer. A
// missing membership is not an error here: the observation reports an empty role
// and department, and neither the manager bypass nor the department match
// applies.
func (s *Service) viewerIdentity(ctx context.Context, workspaceID, viewerID string) (role, departmentID string, err error) {
	err = s.db.QueryRow(ctx, `
		SELECT role, coalesce(department_id::text, '') FROM member
		WHERE workspace_id = $1 AND user_id::text = $2`, workspaceID, viewerID).Scan(&role, &departmentID)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", "", nil
	}
	if err != nil {
		return "", "", fmt.Errorf("read viewer identity: %w", err)
	}
	return role, departmentID, nil
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

	role, _, err := s.viewerIdentity(ctx, workspaceID, viewerID)
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
		       coalesce(p.visibility, ''), coalesce(sp.owner_id::text, ''),
		       coalesce(d.lead_user_id::text, ''), i.status
		FROM knowledge_items i
		LEFT JOIN project p ON p.workspace_id = i.workspace_id AND p.id = i.project_id
		LEFT JOIN knowledge_spaces sp ON sp.workspace_id = i.workspace_id AND sp.id = i.space_id
		LEFT JOIN department d ON d.workspace_id = sp.workspace_id AND d.id = sp.department_id
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
			&item.Kind, &item.ACLMode, &item.OwnerID, &item.ProjectID,
			&item.ProjectVisibility, &item.SpaceOwnerID, &item.DepartmentLeadID,
			&item.Status); err != nil {
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
	byProject map[string]shadowPeople
}

// shadowPeople is one group's audience: a count and the sampled ids behind it.
// Both observations (project ACL, space scope) report in this shape.
type shadowPeople struct {
	count int
	users []string
}

// shadowAudience reads the audience of every project that would lose items.
//
// The window count(*) OVER () is evaluated before LIMIT, so `affected` is the
// full member count while the row set stays small: this observation runs inside
// a read path and must not turn into "list every member of the workspace".
func (s *Service) shadowAudience(ctx context.Context, workspaceID string, projectIDs []string) (shadowAudience, error) {
	out := shadowAudience{byProject: map[string]shadowPeople{}}
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
// Switching knowledge_project_acl to enforcement is a two-line change in SQL:
//
//	search.go:204   const visCond = ...             -> the body of visCondProjectACL
//	keys.go:291     where := []string{..., visCond}  -> ..., visCondProjectACLAliasI
//
// plus, when knowledge_admin_visibility is also on, appending visCondManagerBypass
// to both. The two spellings differ only in the table qualifier: the retrieval
// queries name knowledge_items without an alias, while ListItems aliases it `i`.
//
// Both spellings carry the project-visibility branch: a `project` item under a
// workspace-visible project stays visible to the whole workspace, exactly as
// ItemVisibleTo says, so "the project is everyone's, the knowledge is not" cannot
// happen.
//
// The SQL is only half of the flip. itemsVisibleToViewer in this file is the
// result-layer recheck and still answers with the switches off, so enforcement
// also means:
//
//  1. passing the service's VisibilityFlags into itemsVisibleToViewer, whose
//     three call sites are recheckItems and GetItemForViewer in search.go and
//     ReadItem in keys.go. Without that, knowledge.get would keep serving an
//     item the index layer has started hiding;
//  2. filling ViewableItem.ProjectVisibility there from the project row (a
//     `LEFT JOIN project p ON p.workspace_id = i.workspace_id AND p.id = i.project_id`
//     is enough; the shadow already reads it that way). Leaving it empty is
//     read as "not workspace-visible", so an item under a workspace project
//     would be hidden by the recheck while the SQL above keeps it — the safe
//     direction, but the wrong answer.
//
// A `project` item with no project_id stays visible in this predicate as well,
// exactly like ItemVisibleTo: there is no member set to intersect, and hiding it
// would be a second, undocumented change on the same flip.
const visCondProjectACL = `(acl_mode = 'workspace'
  OR (acl_mode = 'project' AND (
        knowledge_items.project_id IS NULL
        OR EXISTS (
          SELECT 1 FROM project p
          WHERE p.workspace_id = knowledge_items.workspace_id
            AND p.id = knowledge_items.project_id
            AND p.visibility = 'workspace')
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
          SELECT 1 FROM project p
          WHERE p.workspace_id = i.workspace_id
            AND p.id = i.project_id
            AND p.visibility = 'workspace')
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
