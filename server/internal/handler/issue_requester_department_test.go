package handler

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/jerry-halo2026/morchat.co/server/internal/featureflags"
)

// The requester snapshot (MUL-3806) resolves the human behind an agent-created
// issue from the acting task's attribution. Upstream only exercises its own two
// origins (quick_create, agent_create+chat), so these tests cover the path WE
// add on top: an agent files an issue on a member's behalf and the W2-D
// department scope routes it into that member's department inbox.
//
// department_scope.go does not insert issues — it picks the project, and the
// row still comes from CreateIssue → IssueService.Create. These tests prove
// that inheritance holds, instead of assuming it.

// attributeChatRun stamps a chat-attributed run onto taskID: originator_source
// direct_human + evidence chat is the pair ResolveIssueRequester accepts for an
// agent_create origin.
func attributeChatRun(t *testing.T, taskID, evidence string) {
	t.Helper()
	dbfx.Exec(t, `UPDATE agent_task_queue
		SET originator_user_id = $2, accountable_user_id = $2,
		    originator_source = 'direct_human', trigger_evidence_kind = $3
		WHERE id = $1`, taskID, testUserID, evidence)
}

// createIssueAsAgent posts one issue through the ordinary create path with the
// server-set agent identity headers a task-token request carries.
func createIssueAsAgent(t *testing.T, title, agentID, taskID string) IssueResponse {
	t.Helper()
	w := httptest.NewRecorder()
	req := newRequest("POST", "/api/issues?workspace_id="+testWorkspaceID, map[string]any{"title": title})
	req.Header.Set("X-Agent-ID", agentID)
	req.Header.Set("X-Task-ID", taskID)
	testHandler.CreateIssue(w, req)
	if w.Code != http.StatusCreated {
		t.Fatalf("CreateIssue: got %d: %s", w.Code, w.Body.String())
	}
	var created IssueResponse
	if err := json.NewDecoder(w.Body).Decode(&created); err != nil {
		t.Fatalf("decode issue: %v", err)
	}
	return created
}

// TestIssueRequesterDepartmentInboxDelegate is the D-2 supplement check: an
// agent's issue that lands in the requester's department inbox still records
// that person as its requester, and therefore shows up under "Created by me".
func TestIssueRequesterDepartmentInboxDelegate(t *testing.T) {
	if testHandler == nil {
		t.Skip("database not available")
	}
	withFeatureFlag(t, testHandler, featureflags.DepartmentDefaultScope, true)
	departmentID := departmentScopeTestDepartment(t, testUserID)
	setFixtureMemberDepartment(t, testUserID, departmentID)

	agentID := createHandlerTestAgent(t, "Department requester agent", nil)
	taskID := createHandlerTestTaskForAgent(t, agentID)
	attributeChatRun(t, taskID, "chat")

	title := fmt.Sprintf("Department inbox delegate %d", time.Now().UnixNano())
	created := createIssueAsAgent(t, title, agentID, taskID)
	dbfx.Cleanup(t, "DELETE FROM issue WHERE id = $1", created.ID)

	var projectID, storedRequester, storedDepartment, systemKey string
	dbfx.QueryRow(t, `SELECT coalesce(i.project_id::text, ''),
		coalesce(i.requester_user_id::text, ''),
		coalesce(p.department_id::text, ''),
		coalesce(p.system_key, '')
		FROM issue i LEFT JOIN project p ON p.id = i.project_id
		WHERE i.id = $1`, created.ID).Scan(&projectID, &storedRequester, &storedDepartment, &systemKey)
	if projectID != "" {
		departmentScopeTestProject(t, projectID)
	}

	// The W2-D routing still happened: the issue is in this department's inbox.
	if projectID == "" {
		t.Fatalf("issue landed in no project; the department scope did not apply")
	}
	if systemKey != departmentInboxSystemKey || storedDepartment != departmentID {
		t.Fatalf("project = %s (system_key=%q, department=%q), want the department inbox of %q",
			projectID, systemKey, storedDepartment, departmentID)
	}

	// And the delegate is credited to the member who asked for it.
	if storedRequester != testUserID {
		t.Fatalf("requester_user_id = %q, want %q (the human behind the run)", storedRequester, testUserID)
	}
	if created.RequesterID == nil || *created.RequesterID != testUserID {
		t.Fatalf("response requester_id = %v, want %q", created.RequesterID, testUserID)
	}

	// End to end: the issue is in the member's Created view.
	var listed struct {
		Issues []IssueResponse `json:"issues"`
	}
	w := httptest.NewRecorder()
	testHandler.ListIssues(w, newRequest("GET", "/api/issues?created_by_user_id="+testUserID, nil))
	if w.Code != http.StatusOK {
		t.Fatalf("ListIssues: got %d: %s", w.Code, w.Body.String())
	}
	if err := json.NewDecoder(w.Body).Decode(&listed); err != nil {
		t.Fatalf("decode listing: %v", err)
	}
	found := false
	for _, issue := range listed.Issues {
		if issue.ID == created.ID {
			found = true
		}
	}
	if !found {
		t.Fatalf("department-inbox delegate missing from created_by_user_id=%s", testUserID)
	}
}

// TestIssueRequesterLeavesCommentDrivenCreateUnattributed pins the boundary
// upstream chose: an agent_create whose trigger was an issue comment does NOT
// credit the commenter. Our department inbox accepts such creates too, so this
// documents what a member will not see under Created — a product decision to
// revisit deliberately, not a regression to "fix" by widening the query.
func TestIssueRequesterLeavesCommentDrivenCreateUnattributed(t *testing.T) {
	if testHandler == nil {
		t.Skip("database not available")
	}
	agentID := createHandlerTestAgent(t, "Comment driven requester agent", nil)
	taskID := createHandlerTestTaskForAgent(t, agentID)
	attributeChatRun(t, taskID, "comment")

	title := fmt.Sprintf("Comment driven agent create %d", time.Now().UnixNano())
	created := createIssueAsAgent(t, title, agentID, taskID)
	dbfx.Cleanup(t, "DELETE FROM issue WHERE id = $1", created.ID)

	var storedRequester *string
	dbfx.QueryRow(t, `SELECT requester_user_id::text FROM issue WHERE id = $1`, created.ID).Scan(&storedRequester)
	if storedRequester != nil {
		t.Fatalf("requester_user_id = %q, want NULL for a comment-driven create", *storedRequester)
	}
}
