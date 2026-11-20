package handler

import (
	"context"
	"net/http"
	"testing"

	"github.com/jerry-halo2026/morchat.co/server/internal/featureflags"
	"github.com/jerry-halo2026/morchat.co/server/internal/testutil"
)

// docs/engineering/ORG-MODEL.md §3: a project is filed under a department by
// attribution. Until this change the only writer was the department_default_scope
// switch, so with the switch off (its default) a project could not be filed at
// all — not from the UI and not from the API, which silently dropped the field.
// These cases pin the explicit request field: it wins over the switch, it needs
// a department in this workspace, and it changes no visibility.

// An explicit department is stored with the switch off, and the project keeps
// the visibility the caller asked for: attribution is not access.
func TestCreateProjectFilesExplicitDepartment(t *testing.T) {
	withFeatureFlag(t, testHandler, featureflags.DepartmentDefaultScope, false)
	departmentID := departmentScopeTestDepartment(t, testUserID)

	project := createScopedProject(t, map[string]any{
		"title":         "explicit department",
		"department_id": departmentID,
	})

	if project.DepartmentID == nil || *project.DepartmentID != departmentID {
		t.Fatalf("response department_id = %v, want %s", project.DepartmentID, departmentID)
	}
	if project.Visibility != "workspace" {
		t.Fatalf("visibility = %q, want workspace — filing is attribution, not access", project.Visibility)
	}

	var stored *string
	dbfx.QueryRow(t, `SELECT department_id::text FROM project WHERE id = $1`, project.ID).Scan(&stored)
	if stored == nil || *stored != departmentID {
		t.Fatalf("project.department_id = %v, want %s", stored, departmentID)
	}
	if members := departmentProjectMembers(t, project.ID); len(members) != 0 {
		t.Fatalf("project_member rows = %v, want none — an explicit department does not make the project private", members)
	}
}

// The explicit value outweighs the switch: the operator's answer is not
// overridden by the guess the switch would have made from the creator.
func TestCreateProjectExplicitDepartmentBeatsScopeSwitch(t *testing.T) {
	withFeatureFlag(t, testHandler, featureflags.DepartmentDefaultScope, true)
	creatorDepartment := departmentScopeTestDepartment(t, testUserID)
	otherDepartment := departmentScopeTestDepartment(t, "")
	setFixtureMemberDepartment(t, testUserID, creatorDepartment)

	project := createScopedProject(t, map[string]any{
		"title":         "explicit department wins",
		"department_id": otherDepartment,
	})

	if project.DepartmentID == nil || *project.DepartmentID != otherDepartment {
		t.Fatalf("department_id = %v, want the explicitly requested %s", project.DepartmentID, otherDepartment)
	}
	if project.DepartmentID != nil && *project.DepartmentID == creatorDepartment {
		t.Fatalf("department_id fell back to the creator's department %s", creatorDepartment)
	}
}

// A dangling id has no foreign key behind it, so it must be refused rather
// than stored: the project would otherwise name a department that does not
// exist, and every department-joined read would be empty with no explanation.
func TestCreateProjectRejectsUnknownDepartment(t *testing.T) {
	withFeatureFlag(t, testHandler, featureflags.DepartmentDefaultScope, false)

	testutil.Call(t, testHandler.CreateProject, newRequest("POST", "/api/projects", map[string]any{
		"title":         "unknown department",
		"department_id": "11111111-2222-3333-4444-555555555555",
	})).Want(http.StatusBadRequest)

	testutil.Call(t, testHandler.CreateProject, newRequest("POST", "/api/projects", map[string]any{
		"title":         "malformed department",
		"department_id": "not-a-uuid",
	})).Want(http.StatusBadRequest)

	// Nothing was created by either request.
	var count int
	if err := testPool.QueryRow(context.Background(),
		`SELECT count(*) FROM project WHERE workspace_id = $1 AND title IN ('unknown department', 'malformed department')`,
		testWorkspaceID).Scan(&count); err != nil {
		t.Fatalf("count projects: %v", err)
	}
	if count != 0 {
		t.Fatalf("projects created = %d, want 0", count)
	}
}

// A filing made at creation can be corrected afterwards through PATCH: the
// project moves to the requested department and the response, the stored row
// and the read path all agree. Filing stays attribution — no member rows, no
// visibility change — so moving a project between departments grants nothing.
func TestUpdateProjectRefilesDepartment(t *testing.T) {
	withFeatureFlag(t, testHandler, featureflags.DepartmentDefaultScope, false)
	departmentID := departmentScopeTestDepartment(t, "")
	project := createScopedProject(t, map[string]any{"title": "refile department"})
	if project.DepartmentID != nil {
		t.Fatalf("new project department_id = %v, want unfiled", project.DepartmentID)
	}

	var filed ProjectResponse
	testutil.Call(t, testHandler.UpdateProject, withURLParam(newRequest(http.MethodPatch, "/api/projects/"+project.ID,
		map[string]any{"department_id": departmentID}), "id", project.ID)).Want(http.StatusOK).JSON(&filed)
	if filed.DepartmentID == nil || *filed.DepartmentID != departmentID {
		t.Fatalf("response department_id = %v, want %s", filed.DepartmentID, departmentID)
	}
	if filed.Visibility != "workspace" {
		t.Fatalf("visibility = %q, want workspace — re-filing is attribution, not access", filed.Visibility)
	}
	if members := departmentProjectMembers(t, project.ID); len(members) != 0 {
		t.Fatalf("project_member rows = %v, want none — a department does not make the project private", members)
	}

	var stored *string
	dbfx.QueryRow(t, `SELECT department_id::text FROM project WHERE id = $1`, project.ID).Scan(&stored)
	if stored == nil || *stored != departmentID {
		t.Fatalf("project.department_id = %v, want %s", stored, departmentID)
	}

	// An absent key is "unchanged": a PATCH that only renames the project keeps
	// the filing it was given above.
	var renamed ProjectResponse
	testutil.Call(t, testHandler.UpdateProject, withURLParam(newRequest(http.MethodPatch, "/api/projects/"+project.ID,
		map[string]any{"title": "refile department renamed"}), "id", project.ID)).Want(http.StatusOK).JSON(&renamed)
	if renamed.DepartmentID == nil || *renamed.DepartmentID != departmentID {
		t.Fatalf("department_id after an unrelated PATCH = %v, want the untouched %s", renamed.DepartmentID, departmentID)
	}

	// A GET reads the filing back from the stored row, not from the last request.
	var fetched ProjectResponse
	testutil.Call(t, testHandler.GetProject, withURLParam(newRequest(http.MethodGet, "/api/projects/"+project.ID, nil), "id", project.ID)).
		Want(http.StatusOK).JSON(&fetched)
	if fetched.DepartmentID == nil || *fetched.DepartmentID != departmentID {
		t.Fatalf("GET department_id = %v, want %s", fetched.DepartmentID, departmentID)
	}
}

// Clearing is explicit: an empty string means "no department". It has to be
// distinguishable from an omitted key, which leaves the filing alone.
func TestUpdateProjectClearsDepartmentWithEmptyString(t *testing.T) {
	withFeatureFlag(t, testHandler, featureflags.DepartmentDefaultScope, false)
	departmentID := departmentScopeTestDepartment(t, "")
	project := createScopedProject(t, map[string]any{
		"title":         "clear department",
		"department_id": departmentID,
	})
	if project.DepartmentID == nil || *project.DepartmentID != departmentID {
		t.Fatalf("create department_id = %v, want %s", project.DepartmentID, departmentID)
	}

	var cleared ProjectResponse
	testutil.Call(t, testHandler.UpdateProject, withURLParam(newRequest(http.MethodPatch, "/api/projects/"+project.ID,
		map[string]any{"department_id": ""}), "id", project.ID)).Want(http.StatusOK).JSON(&cleared)
	if cleared.DepartmentID != nil {
		t.Fatalf("response department_id = %v, want cleared", *cleared.DepartmentID)
	}

	var stored *string
	dbfx.QueryRow(t, `SELECT department_id::text FROM project WHERE id = $1`, project.ID).Scan(&stored)
	if stored != nil {
		t.Fatalf("project.department_id = %v, want NULL after clearing", *stored)
	}
}

// Same rule as CreateProject: there is no foreign key behind the column, so an
// id that names no department in this workspace is refused rather than stored,
// and a refused request must leave the existing filing untouched.
func TestUpdateProjectRejectsUnknownDepartment(t *testing.T) {
	withFeatureFlag(t, testHandler, featureflags.DepartmentDefaultScope, false)
	departmentID := departmentScopeTestDepartment(t, "")
	project := createScopedProject(t, map[string]any{
		"title":         "unknown department on update",
		"department_id": departmentID,
	})

	for _, body := range []map[string]any{
		{"department_id": "11111111-2222-3333-4444-555555555555"},
		{"department_id": "not-a-uuid"},
	} {
		testutil.Call(t, testHandler.UpdateProject,
			withURLParam(newRequest(http.MethodPatch, "/api/projects/"+project.ID, body), "id", project.ID)).
			Want(http.StatusBadRequest)
	}

	var stored *string
	dbfx.QueryRow(t, `SELECT department_id::text FROM project WHERE id = $1`, project.ID).Scan(&stored)
	if stored == nil || *stored != departmentID {
		t.Fatalf("project.department_id = %v, want the original %s", stored, departmentID)
	}
}

// Clearing the department must not touch the project's visibility or its member
// list: if it did, either clearing or (worse) re-filing would decide who can
// read the project, and §3 says filing never does.
func TestUpdateProjectClearingDepartmentLeavesVisibilityUntouched(t *testing.T) {
	withFeatureFlag(t, testHandler, featureflags.DepartmentDefaultScope, false)
	departmentID := departmentScopeTestDepartment(t, "")
	project := createScopedProject(t, map[string]any{
		"title":         "private project loses its department",
		"visibility":    "private",
		"department_id": departmentID,
	})
	if project.Visibility != "private" {
		t.Fatalf("create visibility = %q, want private", project.Visibility)
	}
	before := departmentProjectMembers(t, project.ID)
	if !before[testUserID] {
		t.Fatalf("project members after create = %v, want the caller %s", before, testUserID)
	}

	var cleared ProjectResponse
	testutil.Call(t, testHandler.UpdateProject, withURLParam(newRequest(http.MethodPatch, "/api/projects/"+project.ID,
		map[string]any{"department_id": ""}), "id", project.ID)).Want(http.StatusOK).JSON(&cleared)
	if cleared.DepartmentID != nil {
		t.Fatalf("response department_id = %v, want cleared", *cleared.DepartmentID)
	}
	if cleared.Visibility != "private" {
		t.Fatalf("visibility after clearing = %q, want private", cleared.Visibility)
	}

	var storedVisibility string
	dbfx.QueryRow(t, `SELECT visibility FROM project WHERE id = $1`, project.ID).Scan(&storedVisibility)
	if storedVisibility != "private" {
		t.Fatalf("stored visibility = %q, want private", storedVisibility)
	}
	after := departmentProjectMembers(t, project.ID)
	if len(after) != len(before) {
		t.Fatalf("project members after clearing = %v, want the unchanged %v", after, before)
	}
	for userID := range before {
		if !after[userID] {
			t.Fatalf("project member %s was dropped by clearing the department", userID)
		}
	}
}
