package knowledge

import (
	"bytes"
	"context"
	"log/slog"
	"os"
	"strings"
	"testing"

	"github.com/google/uuid"

	"github.com/jerry-halo2026/morchat.co/server/internal/featureflags"
	"github.com/jerry-halo2026/morchat.co/server/internal/testutil"
	"github.com/jerry-halo2026/morchat.co/server/pkg/featureflag"
)

// The visibility rule is a pure function, so the matrices below need no
// database. The observation tests at the bottom do need one, because "what would
// the flip hide" is a question about rows.

const (
	visWS      = "11111111-1111-1111-1111-111111111111"
	visOtherWS = "22222222-2222-2222-2222-222222222222"
	visUser    = "aaaaaaaa-0000-0000-0000-000000000001"
	visOwner   = "aaaaaaaa-0000-0000-0000-000000000002"
	visProject = "bbbbbbbb-0000-0000-0000-000000000001"
)

// visRoles is the role dimension of every matrix below. "" is "no membership
// row", which must behave like a plain member: no bypass.
var visRoles = []struct {
	name string
	role string
}{
	{"member", "member"},
	{"admin", "admin"},
	{"owner", "owner"},
	{"no-role", ""},
}

// visFlags is the switch dimension: both switches, in every combination, so a
// future default change cannot silently alter one cell.
var visFlags = []struct {
	name  string
	flags VisibilityFlags
}{
	{"switches-off", VisibilityFlags{}},
	{"project-acl", VisibilityFlags{ProjectACL: true}},
	{"admin-visibility", VisibilityFlags{AdminVisibility: true}},
	{"both", VisibilityFlags{ProjectACL: true, AdminVisibility: true}},
}

// wantCell is the expectation for one role x membership cell. Writing it as a
// small function keeps each matrix readable and keeps the expectation separate
// from ItemVisibleTo's own branches.
type wantCell func(role string, inProject bool, flags VisibilityFlags) bool

func visViewer(role string, inProject bool) Viewer {
	viewer := Viewer{WorkspaceID: visWS, UserID: visUser, Role: role}
	if inProject {
		viewer.ProjectIDs = map[string]struct{}{visProject: {}}
	}
	return viewer
}

func assertMatrix(t *testing.T, item ViewableItem, want wantCell) {
	t.Helper()
	for _, combo := range visFlags {
		t.Run(combo.name, func(t *testing.T) {
			for _, role := range visRoles {
				for _, inProject := range []bool{false, true} {
					viewer := visViewer(role.role, inProject)
					got := ItemVisibleTo(item, viewer, combo.flags)
					expected := want(role.role, inProject, combo.flags)
					if got != expected {
						t.Errorf("acl=%s role=%s project_member=%v flags=%+v: got %v, want %v",
							item.ACLMode, role.name, inProject, combo.flags, got, expected)
					}
				}
			}
		})
	}
}

// TestItemVisibleToModesMatrix covers the three acl modes x three roles (+ no
// membership row) x project member/non-member x four switch combinations.
func TestItemVisibleToModesMatrix(t *testing.T) {
	base := ViewableItem{
		ID:          "item",
		WorkspaceID: visWS,
		SpaceID:     "space",
		Title:       "note",
		Kind:        KindNote,
		Status:      StatusActive,
		OwnerID:     visOwner,
		ProjectID:   visProject,
	}

	t.Run(ACLModeWorkspace, func(t *testing.T) {
		item := base
		item.ACLMode = ACLModeWorkspace
		// Every member of the workspace, under every switch combination.
		assertMatrix(t, item, func(string, bool, VisibilityFlags) bool { return true })
	})

	t.Run(ACLModeProject, func(t *testing.T) {
		item := base
		item.ACLMode = ACLModeProject
		// Off: today's behaviour, visible to the whole workspace. On: project
		// members only. The admin bypass wins over both when it is on.
		assertMatrix(t, item, func(role string, inProject bool, flags VisibilityFlags) bool {
			if flags.AdminVisibility && (role == "owner" || role == "admin") {
				return true
			}
			if !flags.ProjectACL {
				return true
			}
			return inProject
		})
	})

	t.Run(ACLModePrivate+"-owned-by-other", func(t *testing.T) {
		item := base
		item.ACLMode = ACLModePrivate
		// The owner reads it; a manager reads it only with the bypass on; the
		// project_member set is irrelevant in both readings.
		assertMatrix(t, item, func(role string, _ bool, flags VisibilityFlags) bool {
			return flags.AdminVisibility && (role == "owner" || role == "admin")
		})
	})

	t.Run(ACLModePrivate+"-owned-by-viewer", func(t *testing.T) {
		item := base
		item.ACLMode = ACLModePrivate
		item.OwnerID = visUser
		assertMatrix(t, item, func(string, bool, VisibilityFlags) bool { return true })
	})
}

// TestItemVisibleToGuards covers the non-ACL halves of the rule: tenancy,
// lifecycle, and the acl_mode/field combinations that carry no member set.
func TestItemVisibleToGuards(t *testing.T) {
	member := Viewer{WorkspaceID: visWS, UserID: visUser, Role: "member"}
	manager := Viewer{WorkspaceID: visWS, UserID: visUser, Role: "admin"}

	cases := []struct {
		name   string
		item   ViewableItem
		viewer Viewer
		flags  VisibilityFlags
		want   bool
	}{
		{
			name:   "another workspace is never visible, even with the bypass",
			item:   ViewableItem{WorkspaceID: visOtherWS, Status: StatusActive, ACLMode: ACLModeWorkspace},
			viewer: manager,
			flags:  VisibilityFlags{ProjectACL: true, AdminVisibility: true},
			want:   false,
		},
		{
			name:   "deprecated is refused before the bypass applies",
			item:   ViewableItem{WorkspaceID: visWS, Status: StatusDeprecated, ACLMode: ACLModePrivate, OwnerID: visUser},
			viewer: manager,
			flags:  VisibilityFlags{ProjectACL: true, AdminVisibility: true},
			want:   false,
		},
		{
			name:   "project item with no project stays visible",
			item:   ViewableItem{WorkspaceID: visWS, Status: StatusActive, ACLMode: ACLModeProject},
			viewer: member,
			flags:  VisibilityFlags{ProjectACL: true},
			want:   true,
		},
		{
			name:   "project item with no project is not a bypass either",
			item:   ViewableItem{WorkspaceID: visWS, Status: StatusActive, ACLMode: ACLModeProject},
			viewer: Viewer{WorkspaceID: visWS, UserID: visUser},
			flags:  VisibilityFlags{ProjectACL: true},
			want:   true,
		},
		{
			name:   "private item with no owner belongs to nobody",
			item:   ViewableItem{WorkspaceID: visWS, Status: StatusActive, ACLMode: ACLModePrivate},
			viewer: Viewer{WorkspaceID: visWS},
			want:   false,
		},
		{
			name:   "unknown acl mode is refused",
			item:   ViewableItem{WorkspaceID: visWS, Status: StatusActive, ACLMode: "team"},
			viewer: member,
			flags:  VisibilityFlags{ProjectACL: true, AdminVisibility: true},
			want:   false,
		},
		{
			name:   "project member keeps a project item when enforcement is on",
			item:   ViewableItem{WorkspaceID: visWS, Status: StatusActive, ACLMode: ACLModeProject, ProjectID: visProject},
			viewer: Viewer{WorkspaceID: visWS, UserID: visUser, ProjectIDs: map[string]struct{}{visProject: {}}},
			flags:  VisibilityFlags{ProjectACL: true},
			want:   true,
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := ItemVisibleTo(tc.item, tc.viewer, tc.flags); got != tc.want {
				t.Fatalf("ItemVisibleTo = %v, want %v", got, tc.want)
			}
		})
	}
}

// TestACLRuleMatchesCurrentBehaviourWithSwitchesOff is the compatibility check
// for the first half of W2-E: with both switches off, ItemVisibleTo has to answer
// exactly what retrieval answered before this change - `project` is effectively
// `workspace`, and `private` is owner-only.
func TestACLRuleMatchesCurrentBehaviourWithSwitchesOff(t *testing.T) {
	items := []ViewableItem{
		{ID: "ws", WorkspaceID: visWS, Status: StatusActive, ACLMode: ACLModeWorkspace},
		{ID: "proj", WorkspaceID: visWS, Status: StatusActive, ACLMode: ACLModeProject, ProjectID: visProject},
		{ID: "proj-nil", WorkspaceID: visWS, Status: StatusActive, ACLMode: ACLModeProject},
		{ID: "priv-mine", WorkspaceID: visWS, Status: StatusActive, ACLMode: ACLModePrivate, OwnerID: visUser},
		{ID: "priv-other", WorkspaceID: visWS, Status: StatusActive, ACLMode: ACLModePrivate, OwnerID: visOwner},
		{ID: "priv-nil", WorkspaceID: visWS, Status: StatusActive, ACLMode: ACLModePrivate},
		{ID: "old", WorkspaceID: visWS, Status: StatusDeprecated, ACLMode: ACLModeWorkspace},
	}
	today := map[string]bool{
		"ws":         true,
		"proj":       true,
		"proj-nil":   true,
		"priv-mine":  true,
		"priv-other": false,
		"priv-nil":   false,
		"old":        false,
	}
	for _, item := range items {
		// The role is admin on purpose: with both switches off it must not
		// matter, which is exactly what "behaviour unchanged" means.
		viewer := Viewer{WorkspaceID: visWS, UserID: visUser, Role: "admin"}
		if got, want := ItemVisibleTo(item, viewer, VisibilityFlags{}), today[item.ID]; got != want {
			t.Errorf("%s: ItemVisibleTo(switches off) = %v, want %v (today's answer)", item.ID, got, want)
		}
		if got, want := canViewItem(item, visWS, visUser), today[item.ID]; got != want {
			t.Errorf("%s: canViewItem = %v, want %v", item.ID, got, want)
		}
	}
}

// TestACLPredicatesAreReservedAndUnwired is the guard for the SQL half of the
// deliverable: the enforced predicates exist, describe project_member, and are
// referenced by no query - flipping the switch is an edit, not a rewrite.
func TestACLPredicatesAreReservedAndUnwired(t *testing.T) {
	for name, predicate := range map[string]string{
		"visCondProjectACL":       visCondProjectACL,
		"visCondProjectACLAliasI": visCondProjectACLAliasI,
	} {
		for _, needed := range []string{"project_member", "acl_mode = 'workspace'", "acl_mode = 'private'", "$2"} {
			if !strings.Contains(predicate, needed) {
				t.Errorf("%s does not mention %q", name, needed)
			}
		}
	}
	if !strings.Contains(visCondManagerBypass, "role IN ('owner', 'admin')") {
		t.Error("visCondManagerBypass does not name the manager roles")
	}

	for _, source := range []string{"search.go", "keys.go"} {
		body := readFile(t, source)
		if strings.Contains(body, "visCondProjectACL") || strings.Contains(body, "visCondManagerBypass") {
			t.Errorf("%s already references the reserved predicate; the switch is supposed to be the only way in", source)
		}
	}
}

// ---------------------------------------------------------------------------
// Log-only observation, against rows
// ---------------------------------------------------------------------------

// shadowService builds a Service over the test database with the given switches.
func shadowService(t *testing.T, log *bytes.Buffer, projectACL, adminVisibility bool) *Service {
	t.Helper()
	provider := featureflag.NewStaticProvider()
	provider.Set(featureflags.KnowledgeProjectACL, featureflag.Rule{Default: projectACL})
	provider.Set(featureflags.KnowledgeAdminVisibility, featureflag.Rule{Default: adminVisibility})
	return NewService(testPool,
		WithFeatureFlags(featureflag.NewService(provider)),
		WithLogger(slog.New(slog.NewJSONHandler(log, nil))))
}

// seedShadowOrg creates one private project, one of its members, and the two
// items the observation is about. It returns (spaceID, memberUserID, adminUserID).
func seedShadowOrg(t *testing.T) (spaceID, memberID, adminID string) {
	t.Helper()
	cleanupItems(t)
	dbfx.Cleanup(t, `DELETE FROM project_member WHERE workspace_id = $1`, testWorkspaceID)

	spaceID = testSpace(t, testWorkspaceID)
	memberID = dbfx.User(t, "Knowledge Shadow Member", "knowledge-shadow-"+uuid.NewString()+"@multica.ai")
	adminID = dbfx.User(t, "Knowledge Shadow Admin", "knowledge-shadow-admin-"+uuid.NewString()+"@multica.ai")
	dbfx.Member(t, testWorkspaceID, memberID, "member")
	dbfx.Member(t, testWorkspaceID, adminID, "admin")

	projectID := dbfx.Project(t, "Department Project", testutil.Cols{"visibility": "private"})
	dbfx.InsertNoID(t, "project_member", testutil.Cols{
		"workspace_id": testWorkspaceID,
		"project_id":   projectID,
		"user_id":      adminID,
	}, "project_id = $1 AND user_id = $2", projectID, adminID)

	store := NewStore(testPool)
	ctx := context.Background()
	for _, in := range []NewItem{
		{
			WorkspaceID: testWorkspaceID,
			SpaceID:     spaceID,
			Title:       "project scoped note",
			Kind:        KindNote,
			ACLMode:     ACLModeProject,
			ProjectID:   &projectID,
			OwnerID:     &adminID,
		},
		{
			WorkspaceID: testWorkspaceID,
			SpaceID:     spaceID,
			Title:       "workspace note",
			Kind:        KindNote,
			ACLMode:     ACLModeWorkspace,
			OwnerID:     &adminID,
		},
	} {
		if _, err := store.CreateItem(ctx, in); err != nil {
			t.Fatalf("create %q: %v", in.Title, err)
		}
	}
	return spaceID, memberID, adminID
}

// TestProjectACLShadowCountsWhatWouldHide is the observation itself: a member who
// is not in the project would lose the project-scoped item, and the audience is
// everyone outside the project.
func TestProjectACLShadowCountsWhatWouldHide(t *testing.T) {
	requireDB(t)
	spaceID, memberID, _ := seedShadowOrg(t)
	svc := shadowService(t, &bytes.Buffer{}, true, false)

	shadow, err := svc.ProjectACLShadow(context.Background(), testWorkspaceID, memberID, spaceID)
	if err != nil {
		t.Fatalf("ProjectACLShadow: %v", err)
	}
	if shadow.IndexableItems != 2 {
		t.Fatalf("indexable items = %d, want 2", shadow.IndexableItems)
	}
	if shadow.HiddenCount != 1 {
		t.Fatalf("would_hide = %d, want 1", shadow.HiddenCount)
	}
	members := dbfx.Count(t, `SELECT count(*) FROM member WHERE workspace_id = $1`, testWorkspaceID)
	inProject := dbfx.Count(t, `SELECT count(*) FROM project_member WHERE workspace_id = $1`, testWorkspaceID)
	wantAffected := members - inProject
	if shadow.AffectedMembers != wantAffected {
		t.Fatalf("affected_members = %d, want %d (every member outside the project)", shadow.AffectedMembers, wantAffected)
	}
	if len(shadow.HiddenItems) != 1 || shadow.HiddenItems[0].ProjectID == "" {
		t.Fatalf("hidden item detail = %+v, want one item naming its project", shadow.HiddenItems)
	}
	if shadow.HiddenItems[0].AffectedMembers != wantAffected {
		t.Fatalf("per-item affected = %d, want %d", shadow.HiddenItems[0].AffectedMembers, wantAffected)
	}
	if shadow.ViewerRole != "member" {
		t.Fatalf("viewer_role = %q, want member", shadow.ViewerRole)
	}
}

// TestProjectACLShadowAdminBypass keeps the two switches independent: the same
// project item is hidden from an admin until knowledge_admin_visibility is on.
func TestProjectACLShadowAdminBypass(t *testing.T) {
	requireDB(t)
	spaceID, _, adminID := seedShadowOrg(t)

	off := shadowService(t, &bytes.Buffer{}, true, false)
	shadow, err := off.ProjectACLShadow(context.Background(), testWorkspaceID, adminID, spaceID)
	if err != nil {
		t.Fatalf("ProjectACLShadow(admin bypass off): %v", err)
	}
	if shadow.ViewerRole != "admin" {
		t.Fatalf("viewer_role = %q, want admin", shadow.ViewerRole)
	}
	if shadow.HiddenCount != 0 {
		t.Fatalf("would_hide with project membership = %d, want 0", shadow.HiddenCount)
	}

	// The same admin after leaving the project: hidden until the bypass is on.
	dbfx.Cleanup(t, `DELETE FROM project_member WHERE workspace_id = $1`, testWorkspaceID)
	if _, err := testPool.Exec(context.Background(),
		`DELETE FROM project_member WHERE workspace_id = $1`, testWorkspaceID); err != nil {
		t.Fatalf("clear project_member: %v", err)
	}
	shadow, err = off.ProjectACLShadow(context.Background(), testWorkspaceID, adminID, spaceID)
	if err != nil {
		t.Fatalf("ProjectACLShadow(after leaving the project): %v", err)
	}
	if shadow.HiddenCount != 1 {
		t.Fatalf("would_hide = %d, want 1 without the bypass", shadow.HiddenCount)
	}

	on := shadowService(t, &bytes.Buffer{}, true, true)
	shadow, err = on.ProjectACLShadow(context.Background(), testWorkspaceID, adminID, spaceID)
	if err != nil {
		t.Fatalf("ProjectACLShadow(admin bypass on): %v", err)
	}
	if shadow.HiddenCount != 0 {
		t.Fatalf("would_hide with the admin bypass = %d, want 0", shadow.HiddenCount)
	}
}

// TestProjectACLObservationLeavesListItemsAlone is red line 1 as a test: with
// knowledge_project_acl on, list_items writes the log line and returns exactly
// the rows it returned with the switch off.
func TestProjectACLObservationLeavesListItemsAlone(t *testing.T) {
	requireDB(t)
	spaceID, memberID, _ := seedShadowOrg(t)
	ctx := context.Background()

	listIDs := func(svc *Service) []string {
		list, err := svc.ListItems(ctx, ListItemsInput{
			WorkspaceID: testWorkspaceID,
			ViewerID:    memberID,
			SpaceID:     spaceID,
		})
		if err != nil {
			t.Fatalf("ListItems: %v", err)
		}
		ids := make([]string, 0, len(list.Items))
		for _, item := range list.Items {
			ids = append(ids, item.ID)
		}
		return ids
	}

	var offLog bytes.Buffer
	before := listIDs(shadowService(t, &offLog, false, false))
	if offLog.Len() != 0 {
		t.Fatalf("the observation logged with the switch off: %s", offLog.String())
	}

	var onLog bytes.Buffer
	after := listIDs(shadowService(t, &onLog, true, false))
	if len(before) != len(after) {
		t.Fatalf("list_items returned %d items with the switch on, %d with it off", len(after), len(before))
	}
	for i := range before {
		if before[i] != after[i] {
			t.Fatalf("list_items result changed with the switch on: %v vs %v", after, before)
		}
	}
	if !strings.Contains(onLog.String(), "knowledge project acl shadow") {
		t.Fatalf("the switch was on but no observation line was written: %s", onLog.String())
	}
	if !strings.Contains(onLog.String(), `"would_hide":1`) {
		t.Fatalf("observation line does not report the item it would hide: %s", onLog.String())
	}
	// The line itself, so a run of this test doubles as the sample the W2-E
	// report quotes.
	t.Logf("observation line: %s", strings.TrimSpace(onLog.String()))
}

// TestProjectACLShadowOnDeploymentData is the one-off harness behind the sample
// log in the W2-E report: it chains nothing, seeds nothing, and prints one
// observation per workspace member of a database that already has items. It is
// skipped unless explicitly asked for, because it reads whatever database it is
// pointed at instead of its own fixtures.
func TestProjectACLShadowOnDeploymentData(t *testing.T) {
	if os.Getenv("KNOWLEDGE_ACL_SHADOW_SAMPLE") != "1" {
		t.Skip("set KNOWLEDGE_ACL_SHADOW_SAMPLE=1 to observe a real database")
	}
	requireDB(t)
	ctx := context.Background()
	var log bytes.Buffer
	svc := shadowService(t, &log, true, false)

	rows, err := testPool.Query(ctx, `
		SELECT w.id::text, m.user_id::text
		FROM workspace w
		JOIN member m ON m.workspace_id = w.id
		WHERE EXISTS (SELECT 1 FROM knowledge_items i WHERE i.workspace_id = w.id)
		ORDER BY w.id, m.role DESC
		LIMIT 12`)
	if err != nil {
		t.Fatalf("read deployment workspaces: %v", err)
	}
	defer rows.Close()
	for rows.Next() {
		var workspaceID, viewerID string
		if err := rows.Scan(&workspaceID, &viewerID); err != nil {
			t.Fatalf("scan deployment workspace: %v", err)
		}
		svc.observeProjectACL(ctx, "retrieve", workspaceID, viewerID, "")
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("read deployment workspaces: %v", err)
	}
	t.Logf("observation lines:\n%s", log.String())
}
