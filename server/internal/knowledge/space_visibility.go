package knowledge

// Department scope for knowledge spaces.
//
// docs/engineering/ORG-MODEL.md §2 puts 知识空间 in the same row as 项目: a
// department sees its own spaces, while `department_id IS NULL` means "the whole
// company's" (the handbook, the shared runbooks) and stays visible to everyone.
// Gap 2 of §5 names the missing piece: `knowledge_spaces.department_id` was a
// dead column until migration 646, and nothing filtered on it.
//
// Same discipline as the project ACL: filtering a read shrinks what people see,
// so it lands in two steps.
//
//	knowledge_space_scope_shadow   observe only: log what would hide, from whom
//	knowledge_space_scope          enforce: the three space reads filter
//
// Both default to false, so a deployment that sets nothing reads exactly what it
// reads today. SpaceVisibleTo is the rule; it is pure, so the observation, the
// enforced read, and the tests cannot disagree.
//
// What this deliberately does NOT touch: `acl_mode=project` items (that is
// search.go's visCond, a different switch) and the item-level paths. A page or
// item reached by id is out of scope here — see the note on Service.ListPages.

import (
	"context"
	"fmt"
	"log/slog"
	"sort"
	"strings"
)

// ViewableSpace is the space side of the rule: the fields one visibility
// decision reads, and nothing else.
type ViewableSpace struct {
	ID          string
	WorkspaceID string
	Name        string
	// DepartmentID is the space's department, "" when the space is shared with
	// the whole workspace (the DDL's NULL).
	DepartmentID string
}

// SpaceVisibleTo is the single "may this viewer see this space" rule.
//
//   - another workspace's space is not "hidden", it is not a space;
//   - with SpaceScope off every member sees every space of the workspace, which
//     is today's behaviour and the reason the switch can be rolled back by
//     turning one flag off;
//   - with it on, a workspace owner/admin sees every space (they run the org;
//     limiting them to their own department would strand the other departments'
//     spaces), a space with no department stays visible to everyone, and a
//     departmental space is visible to the members of that department only;
//   - a member with no department therefore sees the shared spaces and nothing
//     else, which is the honest reading of "belongs to no unit yet".
func SpaceVisibleTo(space ViewableSpace, viewer Viewer, flags VisibilityFlags) bool {
	if space.WorkspaceID != viewer.WorkspaceID {
		return false
	}
	if !flags.SpaceScope {
		return true
	}
	if viewer.IsManager() {
		return true
	}
	if space.DepartmentID == "" {
		return true
	}
	return viewer.DepartmentID != "" && space.DepartmentID == viewer.DepartmentID
}

// ---------------------------------------------------------------------------
// Enforced reads
// ---------------------------------------------------------------------------

// spaceViewer builds the Viewer the space rule needs: role and department, plus
// the identity the log line reports. A workspace member without a membership row
// is treated as a plain member with no department.
func (s *Service) spaceViewer(ctx context.Context, workspaceID, viewerID string) (Viewer, error) {
	role, departmentID, err := s.viewerIdentity(ctx, workspaceID, viewerID)
	if err != nil {
		return Viewer{}, err
	}
	return Viewer{
		WorkspaceID:  workspaceID,
		UserID:       viewerID,
		Role:         role,
		DepartmentID: departmentID,
	}, nil
}

// visibleSpaces filters spaces down to the ones the viewer may see under the
// given flags. It is order-preserving, because the caller's order is the
// switcher's order.
func visibleSpaces(spaces []Space, viewer Viewer, flags VisibilityFlags) []Space {
	out := make([]Space, 0, len(spaces))
	for _, space := range spaces {
		viewable := ViewableSpace{
			ID:          space.ID,
			WorkspaceID: space.WorkspaceID,
			Name:        space.Name,
		}
		if space.DepartmentID != nil {
			viewable.DepartmentID = *space.DepartmentID
		}
		if SpaceVisibleTo(viewable, viewer, flags) {
			out = append(out, space)
		}
	}
	return out
}

// spaceVisible resolves one space id against the viewer's scope. It is used by
// the paths that take a space id from a URL: there, "not visible" has to look
// like "not there", which is what the space reads already answer with
// ErrSpaceNotFound.
func (s *Service) spaceVisible(ctx context.Context, workspaceID, viewerID, spaceID string) (bool, error) {
	if !s.spaceScopeEnabled(ctx) {
		return true, nil
	}
	space, err := s.store.GetSpace(ctx, workspaceID, spaceID)
	if err != nil {
		return false, err
	}
	viewer, err := s.spaceViewer(ctx, workspaceID, viewerID)
	if err != nil {
		return false, err
	}
	viewable := ViewableSpace{ID: space.ID, WorkspaceID: space.WorkspaceID, Name: space.Name}
	if space.DepartmentID != nil {
		viewable.DepartmentID = *space.DepartmentID
	}
	return SpaceVisibleTo(viewable, viewer, VisibilityFlags{SpaceScope: true}), nil
}

// ListSpaces is the space listing with the department scope applied.
//
// With knowledge_space_scope off this is Store.ListSpaces unchanged (one flag
// read, same rows, same order). With it on, the viewer's department decides; an
// owner/admin sees everything.
func (s *Service) ListSpaces(ctx context.Context, workspaceID, viewerID string) ([]Space, error) {
	spaces, err := s.store.ListSpaces(ctx, workspaceID)
	if err != nil {
		return nil, err
	}
	s.observeSpaceScope(ctx, "list_spaces", workspaceID, viewerID)
	if !s.spaceScopeEnabled(ctx) {
		return spaces, nil
	}
	viewer, err := s.spaceViewer(ctx, workspaceID, viewerID)
	if err != nil {
		return nil, err
	}
	return visibleSpaces(spaces, viewer, VisibilityFlags{SpaceScope: true}), nil
}

// GetSpace is the space detail with the department scope applied. A space the
// viewer may not see answers ErrSpaceNotFound, exactly like a space of another
// workspace: an invisible row is not "forbidden", it is not there.
func (s *Service) GetSpace(ctx context.Context, workspaceID, viewerID, spaceID string) (Space, error) {
	space, err := s.store.GetSpace(ctx, workspaceID, spaceID)
	if err != nil {
		return Space{}, err
	}
	s.observeSpaceScope(ctx, "get_space", workspaceID, viewerID)
	if !s.spaceScopeEnabled(ctx) {
		return space, nil
	}
	viewer, err := s.spaceViewer(ctx, workspaceID, viewerID)
	if err != nil {
		return Space{}, err
	}
	viewable := ViewableSpace{ID: space.ID, WorkspaceID: space.WorkspaceID, Name: space.Name}
	if space.DepartmentID != nil {
		viewable.DepartmentID = *space.DepartmentID
	}
	if !SpaceVisibleTo(viewable, viewer, VisibilityFlags{SpaceScope: true}) {
		return Space{}, fmt.Errorf("%w: space %s", ErrSpaceNotFound, spaceID)
	}
	return space, nil
}

// ListPages is the page listing with the department scope applied.
//
// A page is only readable through a space, so the rule is the space rule:
//
//   - an explicit space_id the viewer may not see answers ErrSpaceNotFound;
//   - a listing across spaces (no space_id) keeps the pages of the visible
//     spaces and drops the rest.
//
// Reading a page by its own id is deliberately unchanged: the task is the space
// read path, and widening it to page-by-id would be a second change (it needs
// the page's space loaded, and the editor's writes go through the same route).
// Noted in the W2-E report as the remaining hole once enforcement is on.
func (s *Service) ListPages(ctx context.Context, workspaceID, viewerID, spaceID, query string) ([]PageSummary, []*PageSummary, error) {
	if strings.TrimSpace(spaceID) != "" {
		visible, err := s.spaceVisible(ctx, workspaceID, viewerID, spaceID)
		if err != nil {
			return nil, nil, err
		}
		if !visible {
			return nil, nil, fmt.Errorf("%w: space %s", ErrSpaceNotFound, spaceID)
		}
	}
	pages, tree, err := s.store.ListPages(ctx, workspaceID, spaceID, query)
	if err != nil {
		return nil, nil, err
	}
	s.observeSpaceScope(ctx, "list_pages", workspaceID, viewerID)
	if !s.spaceScopeEnabled(ctx) || strings.TrimSpace(spaceID) != "" {
		return pages, tree, nil
	}

	spaces, err := s.store.ListSpaces(ctx, workspaceID)
	if err != nil {
		return nil, nil, err
	}
	viewer, err := s.spaceViewer(ctx, workspaceID, viewerID)
	if err != nil {
		return nil, nil, err
	}
	allowed := map[string]struct{}{}
	for _, space := range visibleSpaces(spaces, viewer, VisibilityFlags{SpaceScope: true}) {
		allowed[space.ID] = struct{}{}
	}
	kept := make([]PageSummary, 0, len(pages))
	for _, page := range pages {
		if _, ok := allowed[page.SpaceID]; ok {
			kept = append(kept, page)
		}
	}
	return kept, buildPageTree(kept), nil
}

// ---------------------------------------------------------------------------
// Shadow observation
// ---------------------------------------------------------------------------

// ShadowSpace is one space an enforced department scope would take away from the
// viewer, plus who else would lose it.
type ShadowSpace struct {
	SpaceID      string `json:"space_id"`
	DepartmentID string `json:"department_id"`
	Name         string `json:"name,omitempty"`
	// AffectedMembers counts the workspace members who are neither in that
	// department nor an owner/admin: the people seeing this space today who
	// would stop seeing it.
	AffectedMembers int      `json:"affected_members"`
	AffectedUsers   []string `json:"affected_users,omitempty"`
}

// SpaceScopeShadow is what one observation found. Like ProjectACLShadow it
// exists to be logged, never returned.
type SpaceScopeShadow struct {
	ViewerRole       string
	ViewerDepartment string
	Spaces           int
	// HiddenCount is exact; HiddenSpaces is the bounded excerpt.
	HiddenCount     int
	HiddenSpaces    []ShadowSpace
	AffectedMembers int
	AffectedUsers   []string
	// SharedSpaces counts department-less spaces, which stay visible under the
	// new rule and therefore never appear as hidden.
	SharedSpaces int
	Truncated    bool
}

// spaceShadowLimit bounds how many spaces one observation reads. A workspace has
// tens of spaces, not thousands; reaching it sets truncated so the log never
// claims a total it did not count.
const spaceShadowLimit = 500

// SpaceScopeShadow computes what enforcing knowledge_space_scope would hide from
// one viewer right now, and who else would lose it.
func (s *Service) SpaceScopeShadow(ctx context.Context, workspaceID, viewerID string) (SpaceScopeShadow, error) {
	var shadow SpaceScopeShadow
	if strings.TrimSpace(workspaceID) == "" || strings.TrimSpace(viewerID) == "" {
		return shadow, fmt.Errorf("%w: workspace_id and viewer_id are required", ErrInvalidField)
	}
	role, departmentID, err := s.viewerIdentity(ctx, workspaceID, viewerID)
	if err != nil {
		return shadow, err
	}
	shadow.ViewerRole = role
	shadow.ViewerDepartment = departmentID

	spaces, err := s.store.ListSpaces(ctx, workspaceID)
	if err != nil {
		return shadow, err
	}
	if len(spaces) > spaceShadowLimit {
		shadow.Truncated = true
		spaces = spaces[:spaceShadowLimit]
	}

	viewer := Viewer{WorkspaceID: workspaceID, UserID: viewerID, Role: role, DepartmentID: departmentID}
	hiddenDepartments := map[string]string{} // department id -> space name
	for _, space := range spaces {
		shadow.Spaces++
		viewable := ViewableSpace{ID: space.ID, WorkspaceID: space.WorkspaceID, Name: space.Name}
		if space.DepartmentID != nil {
			viewable.DepartmentID = *space.DepartmentID
		}
		if viewable.DepartmentID == "" {
			shadow.SharedSpaces++
		}
		if !SpaceVisibleTo(viewable, viewer, VisibilityFlags{}) ||
			SpaceVisibleTo(viewable, viewer, VisibilityFlags{SpaceScope: true}) {
			continue
		}
		shadow.HiddenCount++
		hiddenDepartments[viewable.DepartmentID] = space.Name
		if len(shadow.HiddenSpaces) < shadowSampleItems {
			shadow.HiddenSpaces = append(shadow.HiddenSpaces, ShadowSpace{
				SpaceID:      space.ID,
				DepartmentID: viewable.DepartmentID,
				Name:         space.Name,
			})
		}
	}
	if shadow.HiddenCount == 0 {
		return shadow, nil
	}

	audience, err := s.spaceAudience(ctx, workspaceID, sortedDepartmentKeys(hiddenDepartments))
	if err != nil {
		return shadow, err
	}
	shadow.AffectedMembers = audience.total
	shadow.AffectedUsers = audience.users
	for i := range shadow.HiddenSpaces {
		one := audience.byDepartment[shadow.HiddenSpaces[i].DepartmentID]
		shadow.HiddenSpaces[i].AffectedMembers = one.count
		shadow.HiddenSpaces[i].AffectedUsers = one.users
	}
	return shadow, nil
}

// spaceAudience is who would stop seeing the hidden spaces: the workspace
// members who are not in the space's department and are not owner/admin.
type spaceAudience struct {
	total        int
	users        []string
	byDepartment map[string]shadowPeople
}

// spaceAudience reads the audience of every department that would lose spaces.
// The window count(*) OVER () is evaluated before LIMIT, so `affected` is the
// full member count while the row set stays small (same shape as shadowAudience
// for the project rule).
func (s *Service) spaceAudience(ctx context.Context, workspaceID string, departmentIDs []string) (spaceAudience, error) {
	out := spaceAudience{byDepartment: map[string]shadowPeople{}}
	if len(departmentIDs) == 0 {
		return out, nil
	}
	rows, err := s.db.Query(ctx, `
		SELECT d.department_id, x.user_id::text, x.affected
		FROM unnest($2::text[]) AS d(department_id)
		JOIN LATERAL (
			SELECT m.user_id, count(*) OVER () AS affected
			FROM member m
			WHERE m.workspace_id = $1
			  AND m.role NOT IN ('owner', 'admin')
			  AND coalesce(m.department_id::text, '') <> d.department_id
			ORDER BY m.user_id
			LIMIT $3
		) x ON true`, workspaceID, departmentIDs, shadowSampleUsers+1)
	if err != nil {
		return out, fmt.Errorf("read space shadow audience: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var departmentID, userID string
		var affected int
		if err := rows.Scan(&departmentID, &userID, &affected); err != nil {
			return out, fmt.Errorf("scan space shadow audience: %w", err)
		}
		one := out.byDepartment[departmentID]
		one.count = affected
		if len(one.users) < shadowSampleUsers {
			one.users = append(one.users, userID)
		}
		out.byDepartment[departmentID] = one
	}
	if err := rows.Err(); err != nil {
		return out, fmt.Errorf("read space shadow audience: %w", err)
	}

	var total int
	var all []string
	err = s.db.QueryRow(ctx, `
		SELECT count(*), coalesce(array_agg(s.user_id::text ORDER BY s.user_id::text), '{}')
		FROM (
			SELECT DISTINCT m.user_id
			FROM unnest($2::text[]) AS d(department_id)
			JOIN member m ON m.workspace_id = $1
			WHERE m.role NOT IN ('owner', 'admin')
			  AND coalesce(m.department_id::text, '') <> d.department_id
		) s`, workspaceID, departmentIDs).Scan(&total, &all)
	if err != nil {
		return out, fmt.Errorf("count space shadow audience: %w", err)
	}
	out.total = total
	if len(all) > shadowSampleUsers {
		all = all[:shadowSampleUsers]
	}
	out.users = all
	return out, nil
}

// sortedDepartmentKeys is the department counterpart of sortedKeys.
func sortedDepartmentKeys(set map[string]string) []string {
	out := make([]string, 0, len(set))
	for key := range set {
		out = append(out, key)
	}
	sort.Strings(out)
	return out
}

// observeSpaceScope writes the one log line the shadow half exists for. It runs
// after the read it describes, changes no result, and turns every failure into a
// warning: an observation may never break a read.
func (s *Service) observeSpaceScope(ctx context.Context, op, workspaceID, viewerID string) {
	if !s.spaceScopeShadowEnabled(ctx) {
		return
	}
	shadow, err := s.SpaceScopeShadow(ctx, workspaceID, viewerID)
	if err != nil {
		s.logger.WarnContext(ctx, "knowledge space scope shadow failed",
			slog.String("op", op),
			slog.String("workspace_id", workspaceID),
			slog.String("viewer_id", viewerID),
			slog.String("error", err.Error()))
		return
	}
	s.logger.InfoContext(ctx, "knowledge space scope shadow",
		slog.String("op", op),
		slog.String("workspace_id", workspaceID),
		slog.String("viewer_id", viewerID),
		slog.String("viewer_role", shadow.ViewerRole),
		slog.String("viewer_department", shadow.ViewerDepartment),
		slog.Bool("space_scope", s.spaceScopeEnabled(ctx)),
		slog.Int("spaces", shadow.Spaces),
		slog.Int("would_hide", shadow.HiddenCount),
		slog.Int("affected_members", shadow.AffectedMembers),
		slog.Any("affected_user_ids", shadow.AffectedUsers),
		slog.Int("shared_spaces", shadow.SharedSpaces),
		slog.Bool("truncated", shadow.Truncated),
		slog.Any("hidden_spaces", shadow.HiddenSpaces))
}
