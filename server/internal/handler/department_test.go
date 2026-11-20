package handler

import (
	"context"
	"net/http"
	"testing"

	"github.com/google/uuid"

	"github.com/jerry-halo2026/morchat.co/server/internal/testutil"
)

// Department is attribution, not an ACL, so these tests only assert the CRUD
// contract and the workspace boundary — no read path is expected to change.

func uniqueDepartmentName(prefix string) string {
	return prefix + "-" + uuid.NewString()[:8]
}

func TestDepartmentCRUD(t *testing.T) {
	name := uniqueDepartmentName("engineering")

	// List is available to any workspace member and returns the envelope the
	// client parses.
	list := testutil.Call(t, testHandler.ListDepartments, newRequest("GET", "/api/departments", nil)).Want(http.StatusOK)
	var listed struct {
		Departments []DepartmentResponse `json:"departments"`
		Total       int                  `json:"total"`
	}
	list.JSON(&listed)

	// Create
	created := testutil.Decode[DepartmentResponse](t, testHandler.CreateDepartment,
		newRequest("POST", "/api/departments", map[string]any{"name": name}), http.StatusCreated)
	if created.ID == "" {
		t.Fatal("CreateDepartment: expected an id in the response")
	}
	if created.Name != name {
		t.Fatalf("CreateDepartment: name = %q, want %q", created.Name, name)
	}
	if created.WorkspaceID != testWorkspaceID {
		t.Fatalf("CreateDepartment: workspace_id = %q, want %q", created.WorkspaceID, testWorkspaceID)
	}
	if created.LeadUserID != nil {
		t.Fatalf("CreateDepartment: lead_user_id = %v, want nil", *created.LeadUserID)
	}
	t.Cleanup(func() {
		_, _ = testPool.Exec(context.Background(), `DELETE FROM department WHERE id = $1`, created.ID)
	})

	// List now carries it.
	list = testutil.Call(t, testHandler.ListDepartments, newRequest("GET", "/api/departments", nil)).Want(http.StatusOK)
	list.JSON(&listed)
	found := false
	for _, d := range listed.Departments {
		if d.ID == created.ID {
			found = true
		}
	}
	if !found {
		t.Fatalf("ListDepartments: created department %q missing from %+v", created.ID, listed.Departments)
	}

	// Rename. An omitted lead/system_key keeps the stored value.
	renamedName := name + "-renamed"
	renamed := testutil.Decode[DepartmentResponse](t, testHandler.UpdateDepartment,
		withURLParam(newRequest("PATCH", "/api/departments/"+created.ID, map[string]any{"name": renamedName}), "id", created.ID),
		http.StatusOK)
	if renamed.Name != renamedName {
		t.Fatalf("UpdateDepartment: name = %q, want %q", renamed.Name, renamedName)
	}

	// Duplicate names inside one workspace collide with the unique key.
	testutil.Call(t, testHandler.CreateDepartment,
		newRequest("POST", "/api/departments", map[string]any{"name": renamedName})).Want(http.StatusConflict)

	// Delete reports the detach counts; nothing referenced it.
	deleted := testutil.Decode[DeleteDepartmentResponse](t, testHandler.DeleteDepartment,
		withURLParam(newRequest("DELETE", "/api/departments/"+created.ID, nil), "id", created.ID),
		http.StatusOK)
	if deleted.DetachedProjects != 0 || deleted.DetachedMembers != 0 {
		t.Fatalf("DeleteDepartment: detached projects=%d members=%d, want 0/0", deleted.DetachedProjects, deleted.DetachedMembers)
	}

	// A second delete is a 404, not a silent success.
	testutil.Call(t, testHandler.DeleteDepartment,
		withURLParam(newRequest("DELETE", "/api/departments/"+created.ID, nil), "id", created.ID)).
		Want(http.StatusNotFound)
}

// Deleting a department detaches the projects filed under it instead of leaving
// a dangling id (there is no foreign key to do it).
func TestDepartmentDeleteDetachesProjects(t *testing.T) {
	departmentID := dbfx.Insert(t, "department", testutil.Cols{
		"workspace_id": testWorkspaceID,
		"name":         uniqueDepartmentName("ops"),
	})
	projectID := dbfx.Project(t, "Department-owned project", testutil.Cols{
		"department_id": departmentID,
	})

	deleted := testutil.Decode[DeleteDepartmentResponse](t, testHandler.DeleteDepartment,
		withURLParam(newRequest("DELETE", "/api/departments/"+departmentID, nil), "id", departmentID),
		http.StatusOK)
	if deleted.DetachedProjects != 1 {
		t.Fatalf("DeleteDepartment: detached_projects = %d, want 1", deleted.DetachedProjects)
	}

	var remaining *string
	dbfx.QueryRow(t, `SELECT department_id::text FROM project WHERE id = $1`, projectID).Scan(&remaining)
	if remaining != nil {
		t.Fatalf("project.department_id = %v after delete, want NULL", *remaining)
	}
}

// A knowledge space filed under a department is unfiled, not deleted, when that
// department goes away: department_id is attribution with no foreign key behind
// it, so the delete transaction has to clear it or the space keeps naming a row
// that no longer exists.
func TestDepartmentDeleteDetachesKnowledgeSpaces(t *testing.T) {
	departmentID := dbfx.Insert(t, "department", testutil.Cols{
		"workspace_id": testWorkspaceID,
		"name":         uniqueDepartmentName("wiki"),
	})
	spaceID := knowledgeCreateSpace(t, "Department-owned space "+uuid.NewString()[:8], "", "")
	dbfx.Exec(t, `UPDATE knowledge_spaces SET department_id = $2 WHERE id = $1`, spaceID, departmentID)
	if stored := knowledgeStoredSpaceDepartment(t, spaceID); stored == nil || *stored != departmentID {
		t.Fatalf("knowledge_spaces.department_id = %v before delete, want %q", stored, departmentID)
	}

	deleted := testutil.Decode[DeleteDepartmentResponse](t, testHandler.DeleteDepartment,
		withURLParam(newRequest("DELETE", "/api/departments/"+departmentID, nil), "id", departmentID),
		http.StatusOK)
	if deleted.DetachedProjects != 0 || deleted.DetachedMembers != 0 {
		t.Fatalf("DeleteDepartment: detached projects=%d members=%d, want 0/0",
			deleted.DetachedProjects, deleted.DetachedMembers)
	}

	if remaining := knowledgeStoredSpaceDepartment(t, spaceID); remaining != nil {
		t.Fatalf("knowledge_spaces.department_id = %v after delete, want NULL", *remaining)
	}
	if n := dbfx.Count(t, `SELECT count(*) FROM knowledge_spaces WHERE id = $1`, spaceID); n != 1 {
		t.Fatalf("knowledge space rows after delete = %d, want 1", n)
	}
}

// A department belongs to exactly one workspace: another workspace's row is
// invisible to reads and untouchable by writes.
func TestDepartmentCrossWorkspaceIsolation(t *testing.T) {
	foreignWorkspaceID := dbfx.Insert(t, "workspace", testutil.Cols{
		"name":         "Department foreign workspace",
		"slug":         "dept-foreign-" + uuid.NewString()[:8],
		"description":  "Foreign workspace",
		"issue_prefix": "DPT",
	})
	foreignDepartmentID := dbfx.Insert(t, "department", testutil.Cols{
		"workspace_id": foreignWorkspaceID,
		"name":         uniqueDepartmentName("foreign"),
	})
	ownDepartmentID := dbfx.Insert(t, "department", testutil.Cols{
		"workspace_id": testWorkspaceID,
		"name":         uniqueDepartmentName("own"),
	})

	list := testutil.Call(t, testHandler.ListDepartments, newRequest("GET", "/api/departments", nil)).Want(http.StatusOK)
	var listed struct {
		Departments []DepartmentResponse `json:"departments"`
	}
	list.JSON(&listed)
	for _, d := range listed.Departments {
		if d.ID == foreignDepartmentID {
			t.Fatalf("ListDepartments leaked a department from another workspace: %+v", d)
		}
	}

	testutil.Call(t, testHandler.UpdateDepartment,
		withURLParam(newRequest("PATCH", "/api/departments/"+foreignDepartmentID, map[string]any{"name": "hijacked"}), "id", foreignDepartmentID)).
		Want(http.StatusNotFound)
	testutil.Call(t, testHandler.DeleteDepartment,
		withURLParam(newRequest("DELETE", "/api/departments/"+foreignDepartmentID, nil), "id", foreignDepartmentID)).
		Want(http.StatusNotFound)

	// The foreign row and our own row both survive the rejected writes.
	if n := dbfx.Count(t, `SELECT count(*) FROM department WHERE id = $1`, foreignDepartmentID); n != 1 {
		t.Fatalf("foreign department rows = %d, want 1", n)
	}
	if n := dbfx.Count(t, `SELECT count(*) FROM department WHERE id = $1`, ownDepartmentID); n != 1 {
		t.Fatalf("own department rows = %d, want 1", n)
	}
}

// Reading the org chart is a member right; changing it is not.
func TestDepartmentMemberCanReadButNotWrite(t *testing.T) {
	email := "department-member-" + uuid.NewString() + "@multica.ai"
	memberUserID := dbfx.User(t, "Department Read-Only Member", email)
	dbfx.Member(t, testWorkspaceID, memberUserID, "member")
	departmentID := dbfx.Insert(t, "department", testutil.Cols{
		"workspace_id": testWorkspaceID,
		"name":         uniqueDepartmentName("readonly"),
	})

	asMember := func(req *http.Request) *http.Request {
		req.Header.Set("X-User-ID", memberUserID)
		return req
	}

	testutil.Call(t, testHandler.ListDepartments, asMember(newRequest("GET", "/api/departments", nil))).Want(http.StatusOK)
	testutil.Call(t, testHandler.CreateDepartment,
		asMember(newRequest("POST", "/api/departments", map[string]any{"name": uniqueDepartmentName("denied")}))).
		Want(http.StatusForbidden)
	testutil.Call(t, testHandler.UpdateDepartment,
		asMember(withURLParam(newRequest("PATCH", "/api/departments/"+departmentID, map[string]any{"name": "denied"}), "id", departmentID))).
		Want(http.StatusForbidden)
	testutil.Call(t, testHandler.DeleteDepartment,
		asMember(withURLParam(newRequest("DELETE", "/api/departments/"+departmentID, nil), "id", departmentID))).
		Want(http.StatusForbidden)

	// Nothing changed.
	var name string
	dbfx.QueryRow(t, `SELECT name FROM department WHERE id = $1`, departmentID).Scan(&name)
	if name == "denied" {
		t.Fatal("a member's rejected update was applied")
	}
}

func TestDepartmentCreateRejectsNonMemberLead(t *testing.T) {
	testutil.Call(t, testHandler.CreateDepartment,
		newRequest("POST", "/api/departments", map[string]any{
			"name":         uniqueDepartmentName("bad-lead"),
			"lead_user_id": uuid.NewString(),
		})).Want(http.StatusBadRequest)

	// A malformed id is a bad request too, and a workspace member is accepted.
	testutil.Call(t, testHandler.CreateDepartment,
		newRequest("POST", "/api/departments", map[string]any{
			"name":         uniqueDepartmentName("bad-lead-uuid"),
			"lead_user_id": "not-a-uuid",
		})).Want(http.StatusBadRequest)

	created := testutil.Decode[DepartmentResponse](t, testHandler.CreateDepartment,
		newRequest("POST", "/api/departments", map[string]any{
			"name":         uniqueDepartmentName("good-lead"),
			"lead_user_id": testUserID,
		}), http.StatusCreated)
	t.Cleanup(func() {
		_, _ = testPool.Exec(context.Background(), `DELETE FROM department WHERE id = $1`, created.ID)
	})
	if created.LeadUserID == nil || *created.LeadUserID != testUserID {
		t.Fatalf("CreateDepartment: lead_user_id = %v, want %q", created.LeadUserID, testUserID)
	}

	// PATCH with an empty lead clears it.
	cleared := testutil.Decode[DepartmentResponse](t, testHandler.UpdateDepartment,
		withURLParam(newRequest("PATCH", "/api/departments/"+created.ID, map[string]any{"lead_user_id": ""}), "id", created.ID),
		http.StatusOK)
	if cleared.LeadUserID != nil {
		t.Fatalf("UpdateDepartment: lead_user_id = %v after clear, want nil", *cleared.LeadUserID)
	}
}

// The member list is the surface the org chart reads, so it has to carry the
// department.
func TestMemberListCarriesDepartmentID(t *testing.T) {
	email := "department-listed-" + uuid.NewString() + "@multica.ai"
	memberUserID := dbfx.User(t, "Department Listed Member", email)
	memberID := dbfx.Member(t, testWorkspaceID, memberUserID, "member")
	departmentID := dbfx.Insert(t, "department", testutil.Cols{
		"workspace_id": testWorkspaceID,
		"name":         uniqueDepartmentName("listed"),
	})
	dbfx.Exec(t, `UPDATE member SET department_id = $2 WHERE id = $1`, memberID, departmentID)

	req := withURLParam(newRequest("GET", "/api/workspaces/"+testWorkspaceID+"/members", nil), "id", testWorkspaceID)
	var members []MemberWithUserResponse
	testutil.Call(t, testHandler.ListMembersWithUser, req).Want(http.StatusOK).JSON(&members)

	var checked bool
	for _, m := range members {
		if m.UserID != memberUserID {
			continue
		}
		checked = true
		if m.DepartmentID == nil || *m.DepartmentID != departmentID {
			t.Fatalf("member %q department_id = %v, want %q", memberUserID, m.DepartmentID, departmentID)
		}
	}
	if !checked {
		t.Fatalf("ListMembersWithUser did not return fixture member %q", memberUserID)
	}
}

// An invitation may name the department the invitee joins. Omitting it keeps
// the existing behaviour exactly.
func TestCreateInvitationOptionalDepartment(t *testing.T) {
	clearInvitationsForTestWorkspace(t)
	departmentID := dbfx.Insert(t, "department", testutil.Cols{
		"workspace_id": testWorkspaceID,
		"name":         uniqueDepartmentName("invite"),
	})

	withDepartmentEmail := "department-invite-" + uuid.NewString() + "@multica.ai"
	req := withURLParam(newRequest("POST", "/api/workspaces/"+testWorkspaceID+"/members", CreateMemberRequest{
		Email:        withDepartmentEmail,
		Role:         "member",
		DepartmentID: departmentID,
	}), "id", testWorkspaceID)
	var invitation InvitationResponse
	testutil.Call(t, testHandler.CreateInvitation, req).Want(http.StatusCreated).JSON(&invitation)
	if invitation.DepartmentID == nil || *invitation.DepartmentID != departmentID {
		t.Fatalf("CreateInvitation: department_id = %v, want %q", invitation.DepartmentID, departmentID)
	}

	plainEmail := "department-invite-none-" + uuid.NewString() + "@multica.ai"
	plain := testutil.Decode[InvitationResponse](t, testHandler.CreateInvitation,
		withURLParam(newRequest("POST", "/api/workspaces/"+testWorkspaceID+"/members", CreateMemberRequest{
			Email: plainEmail,
			Role:  "member",
		}), "id", testWorkspaceID), http.StatusCreated)
	if plain.DepartmentID != nil {
		t.Fatalf("CreateInvitation without department: department_id = %v, want nil", *plain.DepartmentID)
	}

	// A department from another workspace is rejected instead of being stored
	// as a dangling id.
	foreignWorkspaceID := dbfx.Insert(t, "workspace", testutil.Cols{
		"name":         "Invite foreign workspace",
		"slug":         "dept-invite-foreign-" + uuid.NewString()[:8],
		"description":  "Foreign workspace",
		"issue_prefix": "DPF",
	})
	foreignDepartmentID := dbfx.Insert(t, "department", testutil.Cols{
		"workspace_id": foreignWorkspaceID,
		"name":         uniqueDepartmentName("invite-foreign"),
	})
	testutil.Call(t, testHandler.CreateInvitation,
		withURLParam(newRequest("POST", "/api/workspaces/"+testWorkspaceID+"/members", CreateMemberRequest{
			Email:        "department-invite-foreign-" + uuid.NewString() + "@multica.ai",
			Role:         "member",
			DepartmentID: foreignDepartmentID,
		}), "id", testWorkspaceID)).Want(http.StatusBadRequest)
}

// Accepting an invitation that named a department files the new member under
// it, in the same transaction as the membership.
func TestAcceptInvitationAttachesDepartment(t *testing.T) {
	email := "department-accept-" + uuid.NewString() + "@multica.ai"
	userID := dbfx.User(t, "Department Accept Invitee", email)
	departmentID := dbfx.Insert(t, "department", testutil.Cols{
		"workspace_id": testWorkspaceID,
		"name":         uniqueDepartmentName("accept"),
	})
	invitationID := dbfx.Insert(t, "workspace_invitation", testutil.Cols{
		"workspace_id":    testWorkspaceID,
		"inviter_id":      testUserID,
		"invitee_email":   email,
		"invitee_user_id": userID,
		"role":            "member",
		"status":          "pending",
		"department_id":   departmentID,
		"expires_at":      testutil.Raw("now() + interval '1 day'"),
	})
	t.Cleanup(func() {
		_, _ = testPool.Exec(context.Background(), `DELETE FROM member WHERE workspace_id = $1 AND user_id = $2`, testWorkspaceID, userID)
	})

	req := newRequest("POST", "/api/invitations/"+invitationID+"/accept", nil)
	req.Header.Set("X-User-ID", userID)
	req = withURLParam(req, "id", invitationID)

	var member MemberWithUserResponse
	testutil.Call(t, testHandler.AcceptInvitation, req).Want(http.StatusOK).JSON(&member)
	if member.DepartmentID == nil || *member.DepartmentID != departmentID {
		t.Fatalf("AcceptInvitation: department_id = %v, want %q", member.DepartmentID, departmentID)
	}

	var stored *string
	dbfx.QueryRow(t, `SELECT department_id::text FROM member WHERE workspace_id = $1 AND user_id = $2`,
		testWorkspaceID, userID).Scan(&stored)
	if stored == nil || *stored != departmentID {
		t.Fatalf("member.department_id = %v, want %q", stored, departmentID)
	}
}
