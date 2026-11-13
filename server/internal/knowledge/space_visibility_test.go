package knowledge

import (
	"bytes"
	"context"
	"errors"
	"log/slog"
	"strings"
	"testing"

	"github.com/google/uuid"

	"github.com/jerry-halo2026/morchat.co/server/internal/featureflags"
	"github.com/jerry-halo2026/morchat.co/server/internal/testutil"
	"github.com/jerry-halo2026/morchat.co/server/pkg/featureflag"
)

// The space rule (docs/engineering/ORG-MODEL.md §2, gap 2): a space filed under a
// department belongs to that department, a space with no department belongs to
// the whole workspace, and owner/admin see everything.
//
// The rule is pure, so the matrix below needs no database. The observation and
// enforcement tests at the bottom do, because "which spaces would disappear" is a
// question about rows.

const (
	spcWS      = "33333333-3333-3333-3333-333333333333"
	spcOtherWS = "44444444-4444-4444-4444-444444444444"
	spcUser    = "cccccccc-0000-0000-0000-000000000001"
	spcDeptEng = "dddddddd-0000-0000-0000-00000000000e"
	spcDeptOth = "dddddddd-0000-0000-0000-00000000000f"
)

// spcRoles is the role dimension. "" is "no membership row": a plain member.
var spcRoles = []struct {
	name string
	role string
}{
	{"member", "member"},
	{"admin", "admin"},
	{"owner", "owner"},
	{"no-role", ""},
}

// spcViewerDepartments is the department dimension of the viewer:
// own department, another department, and none.
var spcViewerDepartments = []struct {
	name string
	id   string
}{
	{"viewer-in-eng", spcDeptEng},
	{"viewer-in-other", spcDeptOth},
	{"viewer-no-department", ""},
}

// spcSpaces is the space dimension: a departmental space of the viewer's
// department, one of another department, and the shared (department-less) one.
var spcSpaces = []struct {
	name string
	id   string
	dept string
}{
	{"space-in-eng", "space-eng", spcDeptEng},
	{"space-in-other", "space-other", spcDeptOth},
	{"space-shared", "space-shared", ""},
}

// spcSpace builds one ViewableSpace for the matrix.
func spcSpace(id, workspaceID, departmentID string) ViewableSpace {
	return ViewableSpace{ID: id, WorkspaceID: workspaceID, Name: id, DepartmentID: departmentID}
}

// TestSpaceVisibleToMatrix covers roles x viewer departments x space departments
// x both switch states: 4 x 3 x 3 x 2 cells, written out as one expectation
// function per switch state so a rule change has to be made twice on purpose.
func TestSpaceVisibleToMatrix(t *testing.T) {
	for _, combo := range []struct {
		name  string
		flags VisibilityFlags
		want  func(role, viewerDept, spaceDept string) bool
	}{{
		name: "scope-off",
		flags: VisibilityFlags{},
		// Today: every member of the workspace sees every space.
		want: func(string, string, string) bool { return true },
	}, {
		name:  "scope-on",
		flags: VisibilityFlags{SpaceScope: true},
		want: func(role, viewerDept, spaceDept string) bool {
			if role == "owner" || role == "admin" {
				return true // managers run the org; being scoped to their own unit would strand the rest
			}
			if spaceDept == "" {
				return true // shared with the whole workspace
			}
			return viewerDept != "" && viewerDept == spaceDept
		},
	}} {
		t.Run(combo.name, func(t *testing.T) {
			for _, role := range spcRoles {
				for _, viewerDept := range spcViewerDepartments {
					for _, space := range spcSpaces {
						viewer := Viewer{
							WorkspaceID:  spcWS,
							UserID:       spcUser,
							Role:         role.role,
							DepartmentID: viewerDept.id,
						}
						got := SpaceVisibleTo(spcSpace(space.id, spcWS, space.dept), viewer, combo.flags)
						want := combo.want(role.role, viewerDept.id, space.dept)
						if got != want {
							t.Errorf("role=%s viewer_dept=%s space=%s: got %v, want %v",
								role.name, viewerDept.name, space.name, got, want)
						}
					}
				}
			}
		})
	}
}

// TestSpaceVisibleToGuards covers the parts of the rule that are not about
// departments: tenancy, the shared space for a department-less member, and the
// manager bypass being part of the rule rather than a second switch.
func TestSpaceVisibleToGuards(t *testing.T) {
	scope := VisibilityFlags{SpaceScope: true}
	memberNoDept := Viewer{WorkspaceID: spcWS, UserID: spcUser, Role: "member"}
	memberEng := Viewer{WorkspaceID: spcWS, UserID: spcUser, Role: "member", DepartmentID: spcDeptEng}

	cases := []struct {
		name  string
		space ViewableSpace
		ed    Viewer
		flags VisibilityFlags
		want  bool
	}{
		{
			name:  "another workspace is never visible",
			space: spcSpace("s", spcOtherWS, ""),
			ed:    Viewer{WorkspaceID: spcWS, UserID: spcUser, Role: "owner"},
			flags: scope,
			want:  false,
		},
		{
			name:  "department-less member sees the shared space",
			space: spcSpace("s", spcWS, ""),
			ed:    memberNoDept,
			flags: scope,
			want:  true,
		},
		{
			name:  "department-less member sees no departmental space",
			space: spcSpace("s", spcWS, spcDeptEng),
			ed:    memberNoDept,
			flags: scope,
			want:  false,
		},
		{
			name:  "manager bypass does not need knowledge_admin_visibility",
			space: spcSpace("s", spcWS, spcDeptOth),
			ed:    Viewer{WorkspaceID: spcWS, UserID: spcUser, Role: "admin", DepartmentID: spcDeptEng},
			flags: scope,
			want:  true,
		},
		{
			name:  "scope off ignores departments entirely",
			space: spcSpace("s", spcWS, spcDeptOth),
			ed:    memberEng,
			flags: VisibilityFlags{},
			want:  true,
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := SpaceVisibleTo(tc.space, tc.ed, tc.flags); got != tc.want {
				t.Fatalf("SpaceVisibleTo = %v, want %v", got, tc.want)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// Observation and enforcement, against rows
// ---------------------------------------------------------------------------

// seedSpaceScopeOrg creates two departments, three spaces (one per department and
// the shared one) and three members (a plain member in each department plus an
// admin with no department). It returns the ids the tests assert on.
func seedSpaceScopeOrg(t *testing.T) (engSpace, otherSpace, sharedSpace, engMember, otherMember string) {
	t.Helper()
	dbfx.Cleanup(t, `DELETE FROM knowledge_pages WHERE workspace_id = $1`, testWorkspaceID)

	engDept := dbfx.Insert(t, "department", testutil.Cols{
		"workspace_id": testWorkspaceID,
		"name":         "Scope Engineering " + uuid.NewString()[:8],
	})
	otherDept := dbfx.Insert(t, "department", testutil.Cols{
		"workspace_id": testWorkspaceID,
		"name":         "Scope Design " + uuid.NewString()[:8],
	})

	// testSpace creates the instance too; the extra spaces reuse it.
	testSpace(t, testWorkspaceID)
	engSpace = dbfx.Insert(t, "knowledge_spaces", testutil.Cols{
		"workspace_id":  testWorkspaceID,
		"wiki_id":       "default",
		"slug":          "scope-eng-" + uuid.NewString()[:8],
		"display_name":  "Platform",
		"department_id": engDept,
	})
	otherSpace = dbfx.Insert(t, "knowledge_spaces", testutil.Cols{
		"workspace_id":  testWorkspaceID,
		"wiki_id":       "default",
		"slug":          "scope-design-" + uuid.NewString()[:8],
		"display_name":  "Design system",
		"department_id": otherDept,
	})
	sharedSpace = dbfx.Insert(t, "knowledge_spaces", testutil.Cols{
		"workspace_id": testWorkspaceID,
		"wiki_id":      "default",
		"slug":         "scope-shared-" + uuid.NewString()[:8],
		"display_name": "Company handbook",
	})

	engMember = dbfx.User(t, "Scope Eng Member", "scope-eng-"+uuid.NewString()+"@multica.ai")
	otherMember = dbfx.User(t, "Scope Other Member", "scope-other-"+uuid.NewString()+"@multica.ai")
	dbfx.Member(t, testWorkspaceID, engMember, "member", testutil.Cols{"department_id": engDept})
	dbfx.Member(t, testWorkspaceID, otherMember, "member", testutil.Cols{"department_id": otherDept})
	return engSpace, otherSpace, sharedSpace, engMember, otherMember
}

// spaceScopeService is shadowService with the two space switches.
func spaceScopeService(t *testing.T, log *bytes.Buffer, enforce, shadow bool) *Service {
	t.Helper()
	provider := featureflag.NewStaticProvider()
	provider.Set(featureflags.KnowledgeSpaceScope, featureflag.Rule{Default: enforce})
	provider.Set(featureflags.KnowledgeSpaceScopeShadow, featureflag.Rule{Default: shadow})
	return NewService(testPool,
		WithFeatureFlags(featureflag.NewService(provider)),
		WithLogger(slog.New(slog.NewJSONHandler(log, nil))))
}

func spaceIDs(spaces []Space) []string {
	out := make([]string, 0, len(spaces))
	for _, space := range spaces {
		out = append(out, space.ID)
	}
	return out
}

// TestSpaceScopeShadowCountsWhatWouldHide is the observation: a member of another
// department would lose this department's space, and the audience is everyone
// outside that department who is not a manager.
func TestSpaceScopeShadowCountsWhatWouldHide(t *testing.T) {
	requireDB(t)
	engSpace, otherSpace, sharedSpace, engMember, _ := seedSpaceScopeOrg(t)
	svc := spaceScopeService(t, &bytes.Buffer{}, false, true)

	shadow, err := svc.SpaceScopeShadow(context.Background(), testWorkspaceID, engMember)
	if err != nil {
		t.Fatalf("SpaceScopeShadow: %v", err)
	}
	// The workspace is shared with the rest of this package's tests, so the
	// counts are asserted on this fixture's rows, never on the workspace total.
	if shadow.Spaces == 0 {
		t.Fatal("the observation read no spaces at all")
	}
	if shadow.HiddenCount != 1 {
		t.Fatalf("would_hide = %d, want 1 (the other department's space): %+v",
			shadow.HiddenCount, shadow.HiddenSpaces)
	}
	if shadow.HiddenSpaces[0].SpaceID != otherSpace {
		t.Fatalf("hidden space = %s, want %s", shadow.HiddenSpaces[0].SpaceID, otherSpace)
	}
	if shadow.ViewerDepartment == "" || shadow.ViewerRole != "member" {
		t.Fatalf("viewer identity = %q/%q, want member of a department", shadow.ViewerRole, shadow.ViewerDepartment)
	}
	// The audience is every non-manager member outside the other department:
	// the engineering member and any department-less non-manager.
	want := dbfx.Count(t, `
		SELECT count(*) FROM member
		WHERE workspace_id = $1 AND role NOT IN ('owner','admin')
		  AND coalesce(department_id::text,'') <> (
			SELECT department_id::text FROM knowledge_spaces WHERE id = $2)`,
		testWorkspaceID, otherSpace)
	if shadow.AffectedMembers != want {
		t.Fatalf("affected_members = %d, want %d", shadow.AffectedMembers, want)
	}
	for _, id := range []string{engSpace, sharedSpace} {
		for _, hidden := range shadow.HiddenSpaces {
			if hidden.SpaceID == id {
				t.Fatalf("space %s is visible under the new rule but was reported hidden", id)
			}
		}
	}
}

// TestSpaceScopeShadowLeavesListSpacesAlone is the "observe only" promise: with
// the shadow on and enforcement off, the listing is byte-for-byte the same and
// the log fires.
func TestSpaceScopeShadowLeavesListSpacesAlone(t *testing.T) {
	requireDB(t)
	_, _, _, engMember, _ := seedSpaceScopeOrg(t)
	ctx := context.Background()

	var offLog bytes.Buffer
	before, err := spaceScopeService(t, &offLog, false, false).ListSpaces(ctx, testWorkspaceID, engMember)
	if err != nil {
		t.Fatalf("ListSpaces(no switches): %v", err)
	}
	if offLog.Len() != 0 {
		t.Fatalf("the observation logged with both switches off: %s", offLog.String())
	}

	var onLog bytes.Buffer
	after, err := spaceScopeService(t, &onLog, false, true).ListSpaces(ctx, testWorkspaceID, engMember)
	if err != nil {
		t.Fatalf("ListSpaces(shadow): %v", err)
	}
	if got, want := spaceIDs(after), spaceIDs(before); len(got) != len(want) {
		t.Fatalf("listing changed with the shadow on: %v vs %v", got, want)
	}
	for i := range before {
		if after[i].ID != before[i].ID {
			t.Fatalf("listing order changed with the shadow on: %v vs %v", spaceIDs(after), spaceIDs(before))
		}
	}
	if !strings.Contains(onLog.String(), "knowledge space scope shadow") {
		t.Fatalf("the shadow switch was on but no observation line was written: %s", onLog.String())
	}
	if !strings.Contains(onLog.String(), `"would_hide":1`) {
		t.Fatalf("observation line does not report the space it would hide: %s", onLog.String())
	}
	t.Logf("observation line: %s", strings.TrimSpace(onLog.String()))
}

// TestSpaceScopeEnforcedListing is the enforced half: the member sees their own
// department's space plus the shared one, the other department's space is 404 on
// detail, and an admin sees all three.
func TestSpaceScopeEnforcedListing(t *testing.T) {
	requireDB(t)
	engSpace, otherSpace, sharedSpace, engMember, _ := seedSpaceScopeOrg(t)
	ctx := context.Background()
	svc := spaceScopeService(t, &bytes.Buffer{}, true, false)

	spaces, err := svc.ListSpaces(ctx, testWorkspaceID, engMember)
	if err != nil {
		t.Fatalf("ListSpaces: %v", err)
	}
	got := spaceIDs(spaces)
	for _, id := range got {
		if id == otherSpace {
			t.Fatalf("the other department's space leaked into the listing: %v", got)
		}
	}
	var sawEng, sawShared bool
	for _, id := range got {
		if id == engSpace {
			sawEng = true
		}
		if id == sharedSpace {
			sawShared = true
		}
	}
	if !sawEng || !sawShared {
		t.Fatalf("listing = %v, want both %s and %s", got, engSpace, sharedSpace)
	}

	if _, err := svc.GetSpace(ctx, testWorkspaceID, engMember, otherSpace); err == nil {
		t.Fatal("GetSpace returned the other department's space")
	} else if !isSpaceNotFound(err) {
		t.Fatalf("GetSpace error = %v, want ErrSpaceNotFound", err)
	}
	if _, err := svc.GetSpace(ctx, testWorkspaceID, engMember, sharedSpace); err != nil {
		t.Fatalf("GetSpace(shared): %v", err)
	}

	adminID := dbfx.User(t, "Scope Admin", "scope-admin-"+uuid.NewString()+"@multica.ai")
	dbfx.Member(t, testWorkspaceID, adminID, "admin")
	adminSpaces, err := svc.ListSpaces(ctx, testWorkspaceID, adminID)
	if err != nil {
		t.Fatalf("ListSpaces(admin): %v", err)
	}
	// Fixture-relative, not a total: other tests in this package share the
	// workspace and may own spaces too.
	adminSees := map[string]struct{}{}
	for _, id := range spaceIDs(adminSpaces) {
		adminSees[id] = struct{}{}
	}
	for _, id := range []string{engSpace, otherSpace, sharedSpace} {
		if _, ok := adminSees[id]; !ok {
			t.Fatalf("admin does not see space %s; listing = %v", id, spaceIDs(adminSpaces))
		}
	}
}

// TestSpaceScopePagesFollowTheSpace proves the page read obeys the same rule:
// a hidden space answers 404, and an all-spaces listing drops its pages.
func TestSpaceScopePagesFollowTheSpace(t *testing.T) {
	requireDB(t)
	engSpace, otherSpace, _, engMember, _ := seedSpaceScopeOrg(t)
	ctx := context.Background()
	svc := spaceScopeService(t, &bytes.Buffer{}, true, false)

	for _, spaceID := range []string{engSpace, otherSpace} {
		if _, err := svc.Store().CreatePage(ctx, testWorkspaceID, spaceID,
			"scope/page-"+uuid.NewString()[:8], "", "", ""); err != nil {
			t.Fatalf("create page in %s: %v", spaceID, err)
		}
	}

	if _, _, err := svc.ListPages(ctx, testWorkspaceID, engMember, otherSpace, ""); !isSpaceNotFound(err) {
		t.Fatalf("ListPages(other space) error = %v, want ErrSpaceNotFound", err)
	}
	pages, _, err := svc.ListPages(ctx, testWorkspaceID, engMember, "", "")
	if err != nil {
		t.Fatalf("ListPages(all spaces): %v", err)
	}
	// Fixture-relative: the workspace is shared with the rest of the package, so
	// the assertion is "my space's page is here, the hidden space's is not".
	bySpace := map[string]int{}
	for _, page := range pages {
		bySpace[page.SpaceID]++
	}
	if bySpace[engSpace] == 0 {
		t.Fatalf("the engineering space's page is missing from the listing: %+v", bySpace)
	}
	if bySpace[otherSpace] != 0 {
		t.Fatalf("%d page(s) leaked from the other department's space", bySpace[otherSpace])
	}
}

// isSpaceNotFound keeps the assertions readable without repeating errors.Is.
func isSpaceNotFound(err error) bool {
	return errors.Is(err, ErrSpaceNotFound)
}
