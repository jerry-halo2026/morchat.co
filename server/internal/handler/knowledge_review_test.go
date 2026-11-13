package handler

// Tests for the knowledge review gate (knowledge_review.go, W1-A).
//
// They run against the migrated dev database the rest of the handler suite uses,
// through the real workspace middleware, so what is asserted is the contract a
// client sees: the three review error codes, who is allowed through, and the
// review record an approval leaves behind.
//
// The permission matrix is the point of the file. Each allowed role approves an
// item in a space it does NOT own — otherwise "workspace owner" would pass every
// case on the strength of the role alone, and the space-owner and department-lead
// branches would never be exercised.

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/jerry-halo2026/morchat.co/server/internal/middleware"
	"github.com/jerry-halo2026/morchat.co/server/internal/testutil"
)

const knowledgeReviewSource = "https://example.test/knowledge/review"

// knowledgeReviewIssueID creates an issue in the suite's workspace (or in
// workspaceID when given) and returns its id. status is the issue's status, which
// is what the gate classifies.
func knowledgeReviewIssueID(t *testing.T, workspaceID, status string) string {
	t.Helper()
	over := testutil.Cols{"status": status}
	if workspaceID != "" {
		over["workspace_id"] = workspaceID
	}
	return dbfx.Issue(t, "Review "+status, over)
}

// knowledgeApproveItem drives POST /api/knowledge/items/{id}/approve.
func knowledgeApproveItem(t *testing.T, itemID, userID, issueID string) (int, map[string]any) {
	t.Helper()
	return knowledgeDo(t, testHandler.ApproveKnowledgeItem,
		testutil.JSONRequest(http.MethodPost, "/api/knowledge/items/"+itemID+"/approve",
			map[string]any{"review_issue_id": issueID}), userID, "", "itemId", itemID)
}

// knowledgeCreateDraft creates an item that is reviewable: owned by the caller
// and with a source. extra overrides any field.
func knowledgeCreateDraft(t *testing.T, spaceID, title, userID, workspaceID string, extra map[string]any) string {
	t.Helper()
	payload := map[string]any{}
	for key, value := range extra {
		payload[key] = value
	}
	if _, ok := payload["source_ref"]; !ok {
		payload["source_ref"] = knowledgeReviewSource
	}
	return knowledgeCreateItem(t, spaceID, title, userID, workspaceID, payload)
}

// knowledgeCreateActiveItem is the only way to get an active item now: create a
// draft, then approve it against a done issue.
func knowledgeCreateActiveItem(t *testing.T, spaceID, title, userID, workspaceID string, extra map[string]any) string {
	t.Helper()
	itemID := knowledgeCreateDraft(t, spaceID, title, userID, workspaceID, extra)
	issueID := knowledgeReviewIssueID(t, workspaceID, "done")
	status, body := knowledgeApproveItem(t, itemID, userID, issueID)
	if status != http.StatusOK {
		t.Fatalf("approve item: status = %d, body = %v", status, body)
	}
	return itemID
}

// knowledgeReviewOf pulls the review object out of an item response.
func knowledgeReviewOf(t *testing.T, body map[string]any) map[string]any {
	t.Helper()
	review, ok := body["review"].(map[string]any)
	if !ok {
		t.Fatalf("response carries no review object: %v", body)
	}
	return review
}

// TestKnowledgeReviewApprovalMatrix is the who-may-approve table.
func TestKnowledgeReviewApprovalMatrix(t *testing.T) {
	if testPool == nil {
		t.Skip("handler tests require a reachable DATABASE_URL")
	}

	spaceOwner := dbfx.User(t, "Review space owner", "review-space-owner@multica.ai")
	dbfx.Member(t, testWorkspaceID, spaceOwner, "member")
	deptLead := dbfx.User(t, "Review dept lead", "review-dept-lead@multica.ai")
	dbfx.Member(t, testWorkspaceID, deptLead, "member")
	admin := dbfx.User(t, "Review admin", "review-admin@multica.ai")
	dbfx.Member(t, testWorkspaceID, admin, "admin")
	plainMember := dbfx.User(t, "Review plain", "review-plain@multica.ai")
	dbfx.Member(t, testWorkspaceID, plainMember, "member")

	// A space owned by a plain member: only that member (and workspace
	// owner/admin) may approve items in it.
	ownedSpaceID := knowledgeCreateSpace(t, "Review owned space", spaceOwner, "")
	issueID := knowledgeReviewIssueID(t, "", "done")

	t.Run("space owner approves", func(t *testing.T) {
		itemID := knowledgeCreateDraft(t, ownedSpaceID, "Owner approves", spaceOwner, "", nil)
		status, body := knowledgeApproveItem(t, itemID, spaceOwner, issueID)
		if status != http.StatusOK {
			t.Fatalf("status = %d, body = %v", status, body)
		}
		if got, _ := body["status"].(string); got != "active" {
			t.Fatalf("status = %q, want active", got)
		}
		review := knowledgeReviewOf(t, body)
		if got, _ := review["reviewed_by"].(string); got != spaceOwner {
			t.Fatalf("reviewed_by = %q, want the approving member", got)
		}
		if got, _ := review["review_issue_id"].(string); got != issueID {
			t.Fatalf("review_issue_id = %q, want %q", got, issueID)
		}
		if reviewedAt, _ := review["reviewed_at"].(string); reviewedAt == "" {
			t.Fatalf("review carries no reviewed_at: %v", review)
		}
		staleAfter, _ := review["stale_after"].(string)
		stale, err := time.Parse(time.RFC3339Nano, staleAfter)
		if err != nil {
			t.Fatalf("stale_after = %q is not a timestamp", staleAfter)
		}
		// 180 days, give or take the seconds this test spends running.
		if days := time.Until(stale).Hours() / 24; days < 178 || days > 181 {
			t.Fatalf("stale_after is %.1f days out, want ~180", days)
		}
	})

	t.Run("workspace admin approves", func(t *testing.T) {
		itemID := knowledgeCreateDraft(t, ownedSpaceID, "Admin approves", spaceOwner, "", nil)
		status, body := knowledgeApproveItem(t, itemID, admin, issueID)
		if status != http.StatusOK {
			t.Fatalf("status = %d, body = %v", status, body)
		}
		if got, _ := knowledgeReviewOf(t, body)["reviewed_by"].(string); got != admin {
			t.Fatalf("reviewed_by = %q, want the admin", got)
		}
	})

	t.Run("department lead approves", func(t *testing.T) {
		// Filed under a department whose lead is not the space owner: the lead,
		// not the owner, is what earns the approval here.
		deptID := dbfx.Insert(t, "department", testutil.Cols{
			"workspace_id": testWorkspaceID,
			"name":         "Review department",
			"lead_user_id": deptLead,
		})
		spaceID := knowledgeCreateSpace(t, "Review department space", "", "")
		dbfx.Exec(t, `UPDATE knowledge_spaces SET department_id = $1 WHERE id = $2`, deptID, spaceID)

		itemID := knowledgeCreateDraft(t, spaceID, "Lead approves", "", "", nil)
		status, body := knowledgeApproveItem(t, itemID, deptLead, issueID)
		if status != http.StatusOK {
			t.Fatalf("status = %d, body = %v", status, body)
		}
		if got, _ := knowledgeReviewOf(t, body)["reviewed_by"].(string); got != deptLead {
			t.Fatalf("reviewed_by = %q, want the department lead", got)
		}
	})

	t.Run("plain member is refused", func(t *testing.T) {
		itemID := knowledgeCreateDraft(t, ownedSpaceID, "Plain member", spaceOwner, "", nil)
		status, body := knowledgeApproveItem(t, itemID, plainMember, issueID)
		if status != http.StatusForbidden {
			t.Fatalf("status = %d, body = %v", status, body)
		}
		if code, _ := body["code"].(string); code != "knowledge_review_forbidden" {
			t.Fatalf("code = %q, want knowledge_review_forbidden", code)
		}
	})

	t.Run("agent is refused even as a workspace owner", func(t *testing.T) {
		itemID := knowledgeCreateDraft(t, ownedSpaceID, "Agent attempt", spaceOwner, "", nil)

		req := testutil.JSONRequest(http.MethodPost, "/api/knowledge/items/"+itemID+"/approve",
			map[string]any{"review_issue_id": issueID})
		// X-Actor-Source is server-set in production; here it is the authoritative
		// header the auth middleware would have stamped for a mat_ token.
		req = testutil.WithHeaders(req,
			"X-User-ID", testUserID,
			"X-Workspace-ID", testWorkspaceID,
			"X-Agent-ID", dbfx.Agent(t, "Review gate agent", ""),
			"X-Task-ID", "11111111-2222-3333-4444-555555555555",
			"X-Actor-Source", "task_token")
		req = testutil.WithURLParams(req, "itemId", itemID)
		rec := httptest.NewRecorder()
		middleware.RequireWorkspaceMember(testHandler.Queries)(http.HandlerFunc(testHandler.ApproveKnowledgeItem)).ServeHTTP(rec, req)

		if rec.Code != http.StatusForbidden {
			t.Fatalf("agent approval: status = %d, body = %s", rec.Code, rec.Body.String())
		}
		var body map[string]any
		if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
			t.Fatalf("decode body %q: %v", rec.Body.String(), err)
		}
		if code, _ := body["code"].(string); code != "knowledge_review_forbidden" {
			t.Fatalf("code = %q, want knowledge_review_forbidden", code)
		}
	})
}

// TestKnowledgeReviewValidation is the "not yet reviewable" table: every one of
// these items is refused with a code a client can act on.
func TestKnowledgeReviewValidation(t *testing.T) {
	if testPool == nil {
		t.Skip("handler tests require a reachable DATABASE_URL")
	}

	spaceID := knowledgeCreateSpace(t, "Review validation", "", "")
	doneIssueID := knowledgeReviewIssueID(t, "", "done")

	t.Run("missing owner", func(t *testing.T) {
		// A row with no owner: nobody stands behind it, so there is nothing to
		// review. Inserted directly — the HTTP create always sets an owner.
		itemID := dbfx.Insert(t, "knowledge_items", testutil.Cols{
			"workspace_id": testWorkspaceID,
			"space_id":     spaceID,
			"title":        "Unowned draft",
			"source_ref":   knowledgeReviewSource,
		})
		status, body := knowledgeApproveItem(t, itemID, "", doneIssueID)
		if status != http.StatusBadRequest {
			t.Fatalf("status = %d, body = %v", status, body)
		}
		if code, _ := body["code"].(string); code != "knowledge_review_required" {
			t.Fatalf("code = %q, want knowledge_review_required", code)
		}
	})

	t.Run("missing source_ref", func(t *testing.T) {
		itemID := dbfx.Insert(t, "knowledge_items", testutil.Cols{
			"workspace_id": testWorkspaceID,
			"space_id":     spaceID,
			"title":        "Sourceless draft",
			"owner_id":     testUserID,
		})
		status, body := knowledgeApproveItem(t, itemID, "", doneIssueID)
		if status != http.StatusBadRequest {
			t.Fatalf("status = %d, body = %v", status, body)
		}
		if code, _ := body["code"].(string); code != "knowledge_review_required" {
			t.Fatalf("code = %q, want knowledge_review_required", code)
		}
	})

	t.Run("no review issue", func(t *testing.T) {
		itemID := knowledgeCreateDraft(t, spaceID, "No issue", "", "", nil)
		status, body := knowledgeApproveItem(t, itemID, "", "")
		if status != http.StatusBadRequest {
			t.Fatalf("status = %d, body = %v", status, body)
		}
		if code, _ := body["code"].(string); code != "knowledge_review_required" {
			t.Fatalf("code = %q, want knowledge_review_required", code)
		}
	})

	t.Run("issue is not done", func(t *testing.T) {
		itemID := knowledgeCreateDraft(t, spaceID, "Unfinished issue", "", "", nil)
		openIssueID := knowledgeReviewIssueID(t, "", "in_progress")
		status, body := knowledgeApproveItem(t, itemID, "", openIssueID)
		if status != http.StatusBadRequest {
			t.Fatalf("status = %d, body = %v", status, body)
		}
		if code, _ := body["code"].(string); code != "knowledge_review_issue_invalid" {
			t.Fatalf("code = %q, want knowledge_review_issue_invalid", code)
		}
	})

	t.Run("issue is in another workspace", func(t *testing.T) {
		otherWorkspaceID := dbfx.Workspace(t, "Review other workspace", "review-other-ws")
		foreignIssueID := knowledgeReviewIssueID(t, otherWorkspaceID, "done")
		itemID := knowledgeCreateDraft(t, spaceID, "Foreign issue", "", "", nil)
		status, body := knowledgeApproveItem(t, itemID, "", foreignIssueID)
		if status != http.StatusBadRequest {
			t.Fatalf("status = %d, body = %v", status, body)
		}
		if code, _ := body["code"].(string); code != "knowledge_review_issue_invalid" {
			t.Fatalf("code = %q, want knowledge_review_issue_invalid", code)
		}
	})

	t.Run("custom status in the done category approves", func(t *testing.T) {
		// The category helper, not a status enumeration, decides this: a custom
		// status stored with category=done is a finished review.
		customKey := "accepted_knowledge"
		dbfx.Insert(t, "issue_status", testutil.Cols{
			"workspace_id": testWorkspaceID,
			"key":          customKey,
			"name":         "Accepted",
			"category":     "done",
			"color":        "#16a34a",
		})
		itemID := knowledgeCreateDraft(t, spaceID, "Custom done", "", "", nil)
		issueID := knowledgeReviewIssueID(t, "", customKey)
		status, body := knowledgeApproveItem(t, itemID, "", issueID)
		if status != http.StatusOK {
			t.Fatalf("status = %d, body = %v", status, body)
		}
		if got, _ := body["status"].(string); got != "active" {
			t.Fatalf("status = %q, want active", got)
		}
	})
}

// TestKnowledgeReviewCreateAndPatchGoThroughTheGate pins the two write paths
// that could otherwise mint active knowledge without a review.
func TestKnowledgeReviewCreateAndPatchGoThroughTheGate(t *testing.T) {
	if testPool == nil {
		t.Skip("handler tests require a reachable DATABASE_URL")
	}

	spaceID := knowledgeCreateSpace(t, "Review write paths", "", "")
	doneIssueID := knowledgeReviewIssueID(t, "", "done")

	// POST with status=active and no review issue is refused.
	status, body := knowledgeDo(t, testHandler.CreateKnowledgeItem,
		testutil.JSONRequest(http.MethodPost, "/api/knowledge/items", map[string]any{
			"space_id":   spaceID,
			"title":      "Active without review",
			"source_ref": knowledgeReviewSource,
			"status":     "active",
		}), "", "")
	if status != http.StatusBadRequest {
		t.Fatalf("create active without review: status = %d, body = %v", status, body)
	}
	if code, _ := body["code"].(string); code != "knowledge_review_required" {
		t.Fatalf("code = %q, want knowledge_review_required", code)
	}

	// POST with status=active and a done review issue is approved on the way in.
	status, body = knowledgeDo(t, testHandler.CreateKnowledgeItem,
		testutil.JSONRequest(http.MethodPost, "/api/knowledge/items", map[string]any{
			"space_id":        spaceID,
			"title":           "Active with review",
			"source_ref":      knowledgeReviewSource,
			"status":          "active",
			"review_issue_id": doneIssueID,
		}), "", "")
	if status != http.StatusCreated {
		t.Fatalf("create active with review: status = %d, body = %v", status, body)
	}
	if got, _ := body["status"].(string); got != "active" {
		t.Fatalf("created status = %q, want active", got)
	}
	if got, _ := knowledgeReviewOf(t, body)["review_issue_id"].(string); got != doneIssueID {
		t.Fatalf("created review_issue_id = %q, want %q", got, doneIssueID)
	}
	itemID, _ := body["id"].(string)

	// PATCH to active without a review issue is refused; the item stays a draft.
	draftID := knowledgeCreateDraft(t, spaceID, "Patch to active", "", "", nil)
	status, body = knowledgeDo(t, testHandler.UpdateKnowledgeItem,
		testutil.JSONRequest(http.MethodPatch, "/api/knowledge/items/"+draftID, map[string]any{
			"status": "active",
		}), "", "", "itemId", draftID)
	if status != http.StatusBadRequest {
		t.Fatalf("patch to active without review: status = %d, body = %v", status, body)
	}
	if code, _ := body["code"].(string); code != "knowledge_review_required" {
		t.Fatalf("code = %q, want knowledge_review_required", code)
	}

	// PATCH with a review issue approves through the same function.
	status, body = knowledgeDo(t, testHandler.UpdateKnowledgeItem,
		testutil.JSONRequest(http.MethodPatch, "/api/knowledge/items/"+draftID, map[string]any{
			"status":          "active",
			"review_issue_id": doneIssueID,
		}), "", "", "itemId", draftID)
	if status != http.StatusOK {
		t.Fatalf("patch to active with review: status = %d, body = %v", status, body)
	}
	if got, _ := body["status"].(string); got != "active" {
		t.Fatalf("patched status = %q, want active", got)
	}

	// A second PATCH to active re-uses the issue already recorded on the item,
	// so "approve again" does not need the body to repeat it.
	status, body = knowledgeDo(t, testHandler.UpdateKnowledgeItem,
		testutil.JSONRequest(http.MethodPatch, "/api/knowledge/items/"+draftID, map[string]any{
			"status": "active",
		}), "", "", "itemId", draftID)
	if status != http.StatusOK {
		t.Fatalf("re-patch to active: status = %d, body = %v", status, body)
	}

	// The GET path carries the review summary too.
	status, body = knowledgeDo(t, testHandler.GetKnowledgeItem,
		testutil.JSONRequest(http.MethodGet, "/api/knowledge/items/"+itemID, nil), "", "", "itemId", itemID)
	if status != http.StatusOK {
		t.Fatalf("get item: status = %d, body = %v", status, body)
	}
	if got, _ := knowledgeReviewOf(t, body)["review_issue_id"].(string); got != doneIssueID {
		t.Fatalf("read-back review_issue_id = %q, want %q", got, doneIssueID)
	}
}

// TestKnowledgeReviewAudit reports the three classes without changing anything.
func TestKnowledgeReviewAudit(t *testing.T) {
	if testPool == nil {
		t.Skip("handler tests require a reachable DATABASE_URL")
	}

	spaceID := knowledgeCreateSpace(t, "Review audit", "", "")
	issueID := knowledgeReviewIssueID(t, "", "done")

	unreviewedID := dbfx.Insert(t, "knowledge_items", testutil.Cols{
		"workspace_id": testWorkspaceID,
		"space_id":     spaceID,
		"title":        "Audit unreviewed active",
		"status":       "active",
		"owner_id":     testUserID,
		"source_ref":   knowledgeReviewSource,
	})
	staleID := dbfx.Insert(t, "knowledge_items", testutil.Cols{
		"workspace_id":    testWorkspaceID,
		"space_id":        spaceID,
		"title":           "Audit stale",
		"status":          "active",
		"owner_id":        testUserID,
		"source_ref":      knowledgeReviewSource,
		"review_issue_id": issueID,
		"reviewed_by":     testUserID,
		"reviewed_at":     testutil.Raw("now() - interval '200 days'"),
		"stale_after":     testutil.Raw("now() - interval '20 days'"),
	})
	orphanID := dbfx.Insert(t, "knowledge_items", testutil.Cols{
		"workspace_id": testWorkspaceID,
		"space_id":     spaceID,
		"title":        "Audit orphan",
		"source_ref":   knowledgeReviewSource,
	})

	status, body := knowledgeDo(t, testHandler.AuditKnowledgeReview,
		testutil.JSONRequest(http.MethodGet, "/api/knowledge/review-audit", nil), "", "")
	if status != http.StatusOK {
		t.Fatalf("audit: status = %d, body = %v", status, body)
	}

	// The database is shared with the rest of the handler suite, so each class
	// is asserted by membership of OUR rows, never by counts.
	if !knowledgeAuditClassHas(body, "unreviewed_active", unreviewedID) {
		t.Fatalf("unreviewed item missing from unreviewed_active: %v", body["unreviewed_active"])
	}
	if !knowledgeAuditClassHas(body, "stale", staleID) {
		t.Fatalf("stale item missing from stale: %v", body["stale"])
	}
	if !knowledgeAuditClassHas(body, "orphaned", orphanID) {
		t.Fatalf("sourceless-owner item missing from orphaned: %v", body["orphaned"])
	}

	// Read-only: the audited rows are untouched.
	var reviewed *time.Time
	dbfx.QueryRow(t, `SELECT reviewed_at FROM knowledge_items WHERE id = $1`, unreviewedID).Scan(&reviewed)
	if reviewed != nil {
		t.Fatalf("audit wrote reviewed_at = %v", reviewed)
	}
}

func knowledgeAuditClassHas(body map[string]any, class, itemID string) bool {
	rows, _ := body[class].([]any)
	for _, row := range rows {
		entry, _ := row.(map[string]any)
		if id, _ := entry["item_id"].(string); id == itemID {
			return true
		}
	}
	return false
}
