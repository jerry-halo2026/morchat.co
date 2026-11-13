package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/google/uuid"

	"github.com/jerry-halo2026/morchat.co/server/internal/featureflags"
	"github.com/jerry-halo2026/morchat.co/server/internal/testutil"
)

// W2-D (docs/engineering/ORG-MODEL.md §3 and §5 gaps 4/5). Two rules live here:
// a project (or a project-less issue) created by a member with a department
// lands in that department's default scope, and moving a member between
// departments moves their private-project memberships with them. Both are gated
// by department_default_scope except the move, which only rewrites rows the
// caller explicitly asked to rewrite.
//
// Nothing in these tests asserts on a read path: no endpoint filters by
// department_id in this workstream (§5 gaps 1-3 are W2-E's).

// departmentScopeTestProject deletes a project this test created, so its
// private visibility cannot leak into another test's hidden-project set.
func departmentScopeTestProject(t *testing.T, projectID string) {
	t.Helper()
	t.Cleanup(func() {
		ctx := context.Background()
		_, _ = testPool.Exec(ctx, `DELETE FROM issue WHERE project_id = $1`, projectID)
		_, _ = testPool.Exec(ctx, `DELETE FROM project_member WHERE project_id = $1`, projectID)
		_, _ = testPool.Exec(ctx, `DELETE FROM project_resource WHERE project_id = $1`, projectID)
		_, _ = testPool.Exec(ctx, `DELETE FROM project WHERE id = $1`, projectID)
	})
}

// departmentScopeTestDepartment inserts a department and removes it again. The
// projects filed under it are detached by the delete handler, not by a foreign
// key, so the cleanup nulls them explicitly.
func departmentScopeTestDepartment(t *testing.T, leadUserID string) string {
	t.Helper()
	over := testutil.Cols{"workspace_id": testWorkspaceID, "name": uniqueDepartmentName("scope")}
	if leadUserID != "" {
		over["lead_user_id"] = leadUserID
	}
	departmentID := dbfx.Insert(t, "department", over)
	t.Cleanup(func() {
		_, _ = testPool.Exec(context.Background(), `UPDATE project SET department_id = NULL WHERE department_id = $1`, departmentID)
	})
	return departmentID
}

// setFixtureMemberDepartment files an existing member under a department and
// restores the previous value when the test ends: member.department_id is
// workspace state other tests read through the member list.
func setFixtureMemberDepartment(t *testing.T, userID, departmentID string) {
	t.Helper()
	var previous *string
	dbfx.QueryRow(t, `SELECT department_id::text FROM member WHERE workspace_id = $1 AND user_id = $2`,
		testWorkspaceID, userID).Scan(&previous)
	dbfx.Exec(t, `UPDATE member SET department_id = $3 WHERE workspace_id = $1 AND user_id = $2`,
		testWorkspaceID, userID, departmentID)
	t.Cleanup(func() {
		ctx := context.Background()
		if previous == nil {
			_, _ = testPool.Exec(ctx, `UPDATE member SET department_id = NULL WHERE workspace_id = $1 AND user_id = $2`,
				testWorkspaceID, userID)
			return
		}
		_, _ = testPool.Exec(ctx, `UPDATE member SET department_id = $3 WHERE workspace_id = $1 AND user_id = $2`,
			testWorkspaceID, userID, *previous)
	})
}

func createScopedProject(t *testing.T, body map[string]any) ProjectResponse {
	t.Helper()
	resp := testutil.Decode[ProjectResponse](t, testHandler.CreateProject,
		newRequest("POST", "/api/projects", body), http.StatusCreated)
	departmentScopeTestProject(t, resp.ID)
	return resp
}

func departmentProjectMembers(t *testing.T, projectID string) map[string]bool {
	t.Helper()
	rows, err := testPool.Query(context.Background(),
		`SELECT user_id::text FROM project_member WHERE project_id = $1`, projectID)
	if err != nil {
		t.Fatalf("list project members: %v", err)
	}
	defer rows.Close()
	members := map[string]bool{}
	for rows.Next() {
		var userID string
		if err := rows.Scan(&userID); err != nil {
			t.Fatalf("scan project member: %v", err)
		}
		members[userID] = true
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("iterate project members: %v", err)
	}
	return members
}

// With the switch off nothing changes: the project is workspace-visible, has no
// department and no member rows, exactly as before this workstream.
func TestCreateProjectKeepsWorkspaceVisibilityWhenFlagOff(t *testing.T) {
	withFeatureFlag(t, testHandler, featureflags.DepartmentDefaultScope, false)
	departmentID := departmentScopeTestDepartment(t, testUserID)
	setFixtureMemberDepartment(t, testUserID, departmentID)

	project := createScopedProject(t, map[string]any{"title": "no department scope"})

	if project.Visibility != "workspace" {
		t.Fatalf("visibility = %q, want workspace", project.Visibility)
	}
	var storedDepartment *string
	dbfx.QueryRow(t, `SELECT department_id::text FROM project WHERE id = $1`, project.ID).Scan(&storedDepartment)
	if storedDepartment != nil {
		t.Fatalf("project.department_id = %v, want NULL with the switch off", *storedDepartment)
	}
	if members := departmentProjectMembers(t, project.ID); len(members) != 0 {
		t.Fatalf("project_member rows = %v, want none with the switch off", members)
	}
}

// With the switch on the project is private to the department: every member is
// on it and the department head leads it.
func TestCreateProjectFallsIntoDepartmentScope(t *testing.T) {
	withFeatureFlag(t, testHandler, featureflags.DepartmentDefaultScope, true)
	leadUserID := dbfx.User(t, "Department Scope Lead", "department-scope-lead-"+uuid.NewString()+"@multica.ai")
	dbfx.Member(t, testWorkspaceID, leadUserID, "member")
	peerUserID := dbfx.User(t, "Department Scope Peer", "department-scope-peer-"+uuid.NewString()+"@multica.ai")
	dbfx.Member(t, testWorkspaceID, peerUserID, "member")
	departmentID := departmentScopeTestDepartment(t, leadUserID)
	setFixtureMemberDepartment(t, testUserID, departmentID)
	setFixtureMemberDepartment(t, leadUserID, departmentID)
	setFixtureMemberDepartment(t, peerUserID, departmentID)

	project := createScopedProject(t, map[string]any{"title": "department default project"})

	if project.Visibility != "private" {
		t.Fatalf("visibility = %q, want private", project.Visibility)
	}
	if project.LeadID == nil || *project.LeadID != leadUserID {
		t.Fatalf("lead_id = %v, want the department head %q", project.LeadID, leadUserID)
	}
	if project.LeadType == nil || *project.LeadType != "member" {
		t.Fatalf("lead_type = %v, want member", project.LeadType)
	}
	var storedDepartment *string
	dbfx.QueryRow(t, `SELECT department_id::text FROM project WHERE id = $1`, project.ID).Scan(&storedDepartment)
	if storedDepartment == nil || *storedDepartment != departmentID {
		t.Fatalf("project.department_id = %v, want %q", storedDepartment, departmentID)
	}
	members := departmentProjectMembers(t, project.ID)
	for _, want := range []string{testUserID, leadUserID, peerUserID} {
		if !members[want] {
			t.Fatalf("project members = %v, missing department member %q", members, want)
		}
	}
	if len(members) != 3 {
		t.Fatalf("project members = %v, want exactly the three department members", members)
	}
}

// A department without a head falls back to the creator, so the project always
// has a human lead who can manage its access.
func TestCreateProjectWithoutDepartmentLeadUsesCreator(t *testing.T) {
	withFeatureFlag(t, testHandler, featureflags.DepartmentDefaultScope, true)
	departmentID := departmentScopeTestDepartment(t, "")
	setFixtureMemberDepartment(t, testUserID, departmentID)

	project := createScopedProject(t, map[string]any{"title": "headless department project"})

	if project.Visibility != "private" {
		t.Fatalf("visibility = %q, want private", project.Visibility)
	}
	if project.LeadID == nil || *project.LeadID != testUserID {
		t.Fatalf("lead_id = %v, want the creator %q", project.LeadID, testUserID)
	}
}

// An explicit visibility is the caller's decision and is not overridden.
func TestCreateProjectExplicitVisibilityWinsOverDepartmentScope(t *testing.T) {
	withFeatureFlag(t, testHandler, featureflags.DepartmentDefaultScope, true)
	departmentID := departmentScopeTestDepartment(t, testUserID)
	setFixtureMemberDepartment(t, testUserID, departmentID)

	project := createScopedProject(t, map[string]any{
		"title":      "explicitly shared project",
		"visibility": "workspace",
	})

	if project.Visibility != "workspace" {
		t.Fatalf("visibility = %q, want the requested workspace", project.Visibility)
	}
	var storedDepartment *string
	dbfx.QueryRow(t, `SELECT department_id::text FROM project WHERE id = $1`, project.ID).Scan(&storedDepartment)
	if storedDepartment != nil {
		t.Fatalf("project.department_id = %v, want NULL for an explicit workspace project", *storedDepartment)
	}
}

// With the switch off an issue created without a project keeps the old shape:
// no project at all.
func TestCreateIssueWithoutProjectWhenFlagOff(t *testing.T) {
	withFeatureFlag(t, testHandler, featureflags.DepartmentDefaultScope, false)
	departmentID := departmentScopeTestDepartment(t, testUserID)
	setFixtureMemberDepartment(t, testUserID, departmentID)

	var created CreateIssueResponse
	testutil.Call(t, testHandler.CreateIssue, newRequest("POST", "/api/issues", map[string]any{
		"title": "no inbox while the switch is off",
	})).Want(http.StatusCreated).JSON(&created)
	t.Cleanup(func() {
		_, _ = testPool.Exec(context.Background(), `DELETE FROM issue WHERE id = $1`, created.ID)
	})

	if created.ProjectID != nil {
		t.Fatalf("issue.project_id = %v, want nil with the switch off", *created.ProjectID)
	}
	if n := dbfx.Count(t, `SELECT count(*) FROM project WHERE workspace_id = $1 AND system_key = $2`,
		testWorkspaceID, departmentInboxSystemKey); n != 0 {
		t.Fatalf("department inbox projects = %d, want none with the switch off", n)
	}
}

// With the switch on a project-less issue lands in the department inbox, and the
// second one reuses the same project instead of creating another.
func TestCreateIssueLandsInDepartmentInbox(t *testing.T) {
	withFeatureFlag(t, testHandler, featureflags.DepartmentDefaultScope, true)
	leadUserID := dbfx.User(t, "Inbox Lead", "department-inbox-lead-"+uuid.NewString()+"@multica.ai")
	dbfx.Member(t, testWorkspaceID, leadUserID, "member")
	departmentID := departmentScopeTestDepartment(t, leadUserID)
	setFixtureMemberDepartment(t, testUserID, departmentID)
	setFixtureMemberDepartment(t, leadUserID, departmentID)

	create := func(title string) CreateIssueResponse {
		t.Helper()
		var created CreateIssueResponse
		testutil.Call(t, testHandler.CreateIssue, newRequest("POST", "/api/issues", map[string]any{
			"title": title,
		})).Want(http.StatusCreated).JSON(&created)
		t.Cleanup(func() {
			_, _ = testPool.Exec(context.Background(), `DELETE FROM issue WHERE id = $1`, created.ID)
		})
		return created
	}

	first := create("inbox reachable through the issue list")
	if first.ProjectID == nil {
		t.Fatal("issue.project_id = nil, want the department inbox project")
	}
	inboxID := *first.ProjectID
	departmentScopeTestProject(t, inboxID)

	var visibility, storedDepartment, leadID string
	dbfx.QueryRow(t, `SELECT visibility, department_id::text, lead_id::text FROM project WHERE id = $1`, inboxID).
		Scan(&visibility, &storedDepartment, &leadID)
	if visibility != "private" {
		t.Fatalf("inbox visibility = %q, want private", visibility)
	}
	if storedDepartment != departmentID {
		t.Fatalf("inbox department_id = %q, want %q", storedDepartment, departmentID)
	}
	if leadID != leadUserID {
		t.Fatalf("inbox lead_id = %q, want the department head %q", leadID, leadUserID)
	}
	members := departmentProjectMembers(t, inboxID)
	if !members[leadUserID] || !members[testUserID] {
		t.Fatalf("inbox members = %v, want the department roster", members)
	}

	second := create("second inbox issue")
	if second.ProjectID == nil || *second.ProjectID != inboxID {
		t.Fatalf("second issue.project_id = %v, want the same inbox %q", second.ProjectID, inboxID)
	}
	if n := dbfx.Count(t, `SELECT count(*) FROM project WHERE workspace_id = $1 AND department_id = $2 AND system_key = $3`,
		testWorkspaceID, departmentID, departmentInboxSystemKey); n != 1 {
		t.Fatalf("department inbox projects = %d, want exactly 1", n)
	}
}

// A sub-issue is left alone: it follows its parent, not the creator's
// department.
func TestCreateIssueChildStaysWithItsParentProject(t *testing.T) {
	withFeatureFlag(t, testHandler, featureflags.DepartmentDefaultScope, true)
	departmentID := departmentScopeTestDepartment(t, testUserID)
	setFixtureMemberDepartment(t, testUserID, departmentID)

	parentID := dbfx.Issue(t, "parent outside any project")

	var created CreateIssueResponse
	testutil.Call(t, testHandler.CreateIssue, newRequest("POST", "/api/issues", map[string]any{
		"title":           "child of a project-less parent",
		"parent_issue_id": parentID,
	})).Want(http.StatusCreated).JSON(&created)
	t.Cleanup(func() {
		_, _ = testPool.Exec(context.Background(), `DELETE FROM issue WHERE id = $1`, created.ID)
	})

	if created.ProjectID != nil {
		t.Fatalf("child issue.project_id = %v, want nil so it stays with its parent", *created.ProjectID)
	}
}

func createDepartmentScopedProject(t *testing.T, departmentID, title string) string {
	t.Helper()
	projectID := dbfx.Project(t, title, testutil.Cols{
		"department_id": departmentID,
		"visibility":    "private",
	})
	departmentScopeTestProject(t, projectID)
	return projectID
}

// Moving a member between departments moves their private-project memberships in
// one transaction and leaves an audit row behind.
func TestUpdateMemberDepartmentMovesProjectMemberships(t *testing.T) {
	fromDepartmentID := departmentScopeTestDepartment(t, "")
	toDepartmentID := departmentScopeTestDepartment(t, "")
	email := "department-transfer-" + uuid.NewString() + "@multica.ai"
	userID := dbfx.User(t, "Department Transfer", email)
	memberID := dbfx.Member(t, testWorkspaceID, userID, "member", testutil.Cols{"department_id": fromDepartmentID})

	oldProjectID := createDepartmentScopedProject(t, fromDepartmentID, "old department project")
	newProjectID := createDepartmentScopedProject(t, toDepartmentID, "new department project")
	dbfx.InsertNoID(t, "project_member", testutil.Cols{
		"workspace_id": testWorkspaceID,
		"project_id":   oldProjectID,
		"user_id":      userID,
	}, "project_id = $1 AND user_id = $2", oldProjectID, userID)

	var moved UpdateMemberDepartmentResponse
	testutil.Call(t, testHandler.UpdateMemberDepartment,
		testutil.WithURLParams(newRequest(http.MethodPatch, "/api/workspaces/"+testWorkspaceID+"/members/"+memberID+"/department",
			map[string]any{"department_id": toDepartmentID}), "id", testWorkspaceID, "memberId", memberID)).
		Want(http.StatusOK).JSON(&moved)

	if moved.DepartmentID == nil || *moved.DepartmentID != toDepartmentID {
		t.Fatalf("department_id = %v, want %q", moved.DepartmentID, toDepartmentID)
	}
	if len(moved.RemovedProjects) != 1 || moved.RemovedProjects[0] != oldProjectID {
		t.Fatalf("removed_projects = %v, want [%q]", moved.RemovedProjects, oldProjectID)
	}
	if len(moved.AddedProjects) != 1 || moved.AddedProjects[0] != newProjectID {
		t.Fatalf("added_projects = %v, want [%q]", moved.AddedProjects, newProjectID)
	}

	var storedDepartment *string
	dbfx.QueryRow(t, `SELECT department_id::text FROM member WHERE id = $1`, memberID).Scan(&storedDepartment)
	if storedDepartment == nil || *storedDepartment != toDepartmentID {
		t.Fatalf("member.department_id = %v, want %q", storedDepartment, toDepartmentID)
	}
	if n := dbfx.Count(t, `SELECT count(*) FROM project_member WHERE project_id = $1 AND user_id = $2`, oldProjectID, userID); n != 0 {
		t.Fatalf("old department project memberships = %d, want 0", n)
	}
	if n := dbfx.Count(t, `SELECT count(*) FROM project_member WHERE project_id = $1 AND user_id = $2`, newProjectID, userID); n != 1 {
		t.Fatalf("new department project memberships = %d, want 1", n)
	}

	// The move is auditable: one row naming both departments and the projects
	// that changed hands.
	details, err := departmentTransferActivityDetails(t, memberID)
	if err != nil {
		t.Fatalf("read activity: %v", err)
	}
	if details["from_department_id"] != fromDepartmentID || details["to_department_id"] != toDepartmentID {
		t.Fatalf("activity details = %v, want the from/to departments", details)
	}
}

// departmentTransferActivityDetails reads back the audit row(s) for one member,
// keyed by field so the assertion names the departments instead of the payload.
func departmentTransferActivityDetails(t *testing.T, memberID string) (map[string]string, error) {
	t.Helper()
	rows, err := testPool.Query(context.Background(),
		`SELECT details::text FROM activity_log
		 WHERE workspace_id = $1 AND action = $2 AND details->>'member_id' = $3`,
		testWorkspaceID, departmentTransferActivity, memberID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]string{}
	for rows.Next() {
		var raw string
		if err := rows.Scan(&raw); err != nil {
			return nil, err
		}
		var parsed map[string]any
		if err := json.Unmarshal([]byte(raw), &parsed); err != nil {
			return nil, err
		}
		for _, key := range []string{"from_department_id", "to_department_id"} {
			if v, ok := parsed[key].(string); ok {
				out[key] = v
			}
		}
	}
	return out, rows.Err()
}

// Moving a member to no department clears the attribution and takes them out of
// the department's private projects.
func TestUpdateMemberDepartmentClearsAttribution(t *testing.T) {
	fromDepartmentID := departmentScopeTestDepartment(t, "")
	email := "department-clear-" + uuid.NewString() + "@multica.ai"
	userID := dbfx.User(t, "Department Clear", email)
	memberID := dbfx.Member(t, testWorkspaceID, userID, "member", testutil.Cols{"department_id": fromDepartmentID})
	projectID := createDepartmentScopedProject(t, fromDepartmentID, "cleared department project")
	dbfx.InsertNoID(t, "project_member", testutil.Cols{
		"workspace_id": testWorkspaceID,
		"project_id":   projectID,
		"user_id":      userID,
	}, "project_id = $1 AND user_id = $2", projectID, userID)

	var moved UpdateMemberDepartmentResponse
	testutil.Call(t, testHandler.UpdateMemberDepartment,
		testutil.WithURLParams(newRequest(http.MethodPatch, "/api/workspaces/"+testWorkspaceID+"/members/"+memberID+"/department",
			map[string]any{"department_id": ""}), "id", testWorkspaceID, "memberId", memberID)).
		Want(http.StatusOK).JSON(&moved)

	if moved.DepartmentID != nil {
		t.Fatalf("department_id = %v, want nil after clearing", *moved.DepartmentID)
	}
	if len(moved.RemovedProjects) != 1 || moved.RemovedProjects[0] != projectID {
		t.Fatalf("removed_projects = %v, want [%q]", moved.RemovedProjects, projectID)
	}
	if n := dbfx.Count(t, `SELECT count(*) FROM member WHERE id = $1 AND department_id IS NULL`, memberID); n != 1 {
		t.Fatal("member.department_id was not cleared")
	}
}

// Changing the org chart is an owner/admin action: a plain member is refused and
// a non-member learns nothing about the workspace.
func TestUpdateMemberDepartmentRequiresAdmin(t *testing.T) {
	fromDepartmentID := departmentScopeTestDepartment(t, "")
	toDepartmentID := departmentScopeTestDepartment(t, "")

	memberUserID := dbfx.User(t, "Department Target Member", "department-target-"+uuid.NewString()+"@multica.ai")
	memberID := dbfx.Member(t, testWorkspaceID, memberUserID, "member", testutil.Cols{"department_id": fromDepartmentID})

	plainUserID := dbfx.User(t, "Department Plain Member", "department-plain-"+uuid.NewString()+"@multica.ai")
	dbfx.Member(t, testWorkspaceID, plainUserID, "member")
	outsiderID := dbfx.User(t, "Department Outsider", "department-outsider-"+uuid.NewString()+"@multica.ai")

	asUser := func(req *http.Request, userID string) *http.Request {
		req.Header.Set("X-User-ID", userID)
		return req
	}
	move := func(userID string) *http.Request {
		return testutil.WithURLParams(
			asUser(newRequest(http.MethodPatch, "/api/workspaces/"+testWorkspaceID+"/members/"+memberID+"/department",
				map[string]any{"department_id": toDepartmentID}), userID),
			"id", testWorkspaceID, "memberId", memberID)
	}

	testutil.Call(t, testHandler.UpdateMemberDepartment, move(plainUserID)).Want(http.StatusForbidden)
	testutil.Call(t, testHandler.UpdateMemberDepartment, move(outsiderID)).Want(http.StatusNotFound)

	// Neither rejected request changed anything.
	var storedDepartment string
	dbfx.QueryRow(t, `SELECT department_id::text FROM member WHERE id = $1`, memberID).Scan(&storedDepartment)
	if storedDepartment != fromDepartmentID {
		t.Fatalf("member.department_id = %q after rejected requests, want %q", storedDepartment, fromDepartmentID)
	}
	if n := dbfx.Count(t, `SELECT count(*) FROM project_member WHERE user_id = $1`, memberUserID); n != 0 {
		t.Fatalf("project memberships = %d after rejected requests, want 0", n)
	}
}

// A department from another workspace is rejected rather than stored as a
// dangling id (there is no foreign key to catch it).
func TestUpdateMemberDepartmentRejectsForeignDepartment(t *testing.T) {
	email := "department-foreign-" + uuid.NewString() + "@multica.ai"
	userID := dbfx.User(t, "Department Foreign Target", email)
	memberID := dbfx.Member(t, testWorkspaceID, userID, "member")

	foreignWorkspaceID := dbfx.Insert(t, "workspace", testutil.Cols{
		"name":         "Department scope foreign workspace",
		"slug":         "dept-scope-foreign-" + uuid.NewString()[:8],
		"description":  "Foreign workspace",
		"issue_prefix": "DSF",
	})
	foreignDepartmentID := dbfx.Insert(t, "department", testutil.Cols{
		"workspace_id": foreignWorkspaceID,
		"name":         uniqueDepartmentName("foreign-scope"),
	})

	testutil.Call(t, testHandler.UpdateMemberDepartment,
		testutil.WithURLParams(newRequest(http.MethodPatch, "/api/workspaces/"+testWorkspaceID+"/members/"+memberID+"/department",
			map[string]any{"department_id": foreignDepartmentID}), "id", testWorkspaceID, "memberId", memberID)).
		Want(http.StatusBadRequest)

	if n := dbfx.Count(t, `SELECT count(*) FROM member WHERE id = $1 AND department_id IS NULL`, memberID); n != 1 {
		t.Fatal("a rejected department was stored on the member")
	}
}
