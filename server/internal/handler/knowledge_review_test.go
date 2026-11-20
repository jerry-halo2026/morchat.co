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
		// An unapproved draft is readable by its owner, its space's owner, its
		// department's lead and a workspace owner/admin, and by nobody else, so
		// this caller cannot even open the row: the read that loads the item
		// refuses before the review question is asked, with the same
		// knowledge_forbidden any hidden item answers. Asking the review question
		// first would tell a stranger that the id names a knowledge item.
		if code, _ := body["code"].(string); code != "knowledge_forbidden" {
			t.Fatalf("code = %q, want knowledge_forbidden", code)
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

// knowledgeReviewAudit reads GET /api/knowledge/review-audit once, so a test can
// assert which class (if any) its own rows landed in.
func knowledgeReviewAudit(t *testing.T) map[string]any {
	t.Helper()
	status, body := knowledgeDo(t, testHandler.AuditKnowledgeReview,
		testutil.JSONRequest(http.MethodGet, "/api/knowledge/review-audit", nil), "", "")
	if status != http.StatusOK {
		t.Fatalf("audit: status = %d, body = %v", status, body)
	}
	return body
}

// knowledgeReviewRecord reads the stamp an approval leaves on a stored row.
func knowledgeReviewRecord(t *testing.T, itemID string) (reviewedBy string, reviewedAt *time.Time) {
	t.Helper()
	dbfx.QueryRow(t, `SELECT coalesce(reviewed_by::text, ''), reviewed_at
		FROM knowledge_items WHERE id = $1`, itemID).Scan(&reviewedBy, &reviewedAt)
	return reviewedBy, reviewedAt
}

// knowledgeAssertSelfReviewed pins what an approver's import records: the
// decision is on the row (so the item counts as reviewed), no issue carried it,
// and the audit therefore stops reporting the item as never reviewed.
func knowledgeAssertSelfReviewed(t *testing.T, itemID, approver string) {
	t.Helper()
	var reviewIssueID string
	var staleAfter *time.Time
	reviewedBy, reviewedAt := knowledgeReviewRecord(t, itemID)
	dbfx.QueryRow(t, `SELECT coalesce(review_issue_id::text, ''), stale_after
		FROM knowledge_items WHERE id = $1`, itemID).Scan(&reviewIssueID, &staleAfter)
	if reviewedBy != approver {
		t.Fatalf("reviewed_by = %q, want the importing approver %q", reviewedBy, approver)
	}
	if reviewedAt == nil {
		t.Fatalf("self-published import carries no reviewed_at")
	}
	if staleAfter == nil {
		t.Fatalf("self-published import carries no stale_after")
	}
	// The import named no review issue, and the schema allows that: the columns
	// are independently nullable, so this is a complete self-review, not a half
	// stamped row.
	if reviewIssueID != "" {
		t.Fatalf("self-published import recorded review_issue_id = %q", reviewIssueID)
	}
	if knowledgeAuditClassHas(knowledgeReviewAudit(t), "unreviewed_active", itemID) {
		t.Fatalf("self-published import %s is still listed as unreviewed active", itemID)
	}
}

// knowledgeImport drives POST /api/knowledge/import. extra overrides body fields,
// so a caller can ask for a status or leave it out; headers are the auth facts a
// machine credential carries.
func knowledgeImport(t *testing.T, spaceID, title, userID string, extra map[string]any, headers ...string) (int, map[string]any) {
	t.Helper()
	payload := map[string]any{
		"space_id":   spaceID,
		"title":      title,
		"source_ref": "knowledge/imports/test/gate.md",
		"content":    "# " + title + "\n\nbody text about airships\n",
	}
	for key, value := range extra {
		payload[key] = value
	}
	if userID == "" {
		userID = testUserID
	}
	req := testutil.JSONRequest(http.MethodPost, "/api/knowledge/import", payload)
	req = testutil.WithHeaders(req, append([]string{
		"X-User-ID", userID,
		"X-Workspace-ID", testWorkspaceID,
	}, headers...)...)
	rec := httptest.NewRecorder()
	middleware.RequireWorkspaceMember(testHandler.Queries)(http.HandlerFunc(testHandler.StartKnowledgeImport)).ServeHTTP(rec, req)

	var body map[string]any
	if rec.Body.Len() > 0 {
		if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
			t.Fatalf("decode body %q: %v", rec.Body.String(), err)
		}
	}
	return rec.Code, body
}

// knowledgeImportedItem waits for an import task to become terminal and returns
// the item it created together with that row's status. The pipeline runs in its
// own goroutine, so the task row — what a polling client reads — is the only
// observation both sides agree on.
func knowledgeImportedItem(t *testing.T, taskID string) (itemID, status string) {
	t.Helper()
	deadline := time.Now().Add(10 * time.Second)
	for {
		var taskStatus, taskError string
		var created *string
		dbfx.QueryRow(t, `SELECT status, coalesce(error, ''), item_id::text FROM knowledge_import_tasks WHERE id = $1`,
			taskID).Scan(&taskStatus, &taskError, &created)
		if taskStatus == "failed" {
			t.Fatalf("import task %s failed: %s", taskID, taskError)
		}
		if taskStatus == "done" {
			if created == nil {
				t.Fatalf("import task %s finished %q without an item", taskID, taskStatus)
			}
			dbfx.QueryRow(t, `SELECT status FROM knowledge_items WHERE id = $1`, *created).Scan(&status)
			return *created, status
		}
		if time.Now().After(deadline) {
			t.Fatalf("import task %s never finished (status %q)", taskID, taskStatus)
		}
		time.Sleep(20 * time.Millisecond)
	}
}

// TestKnowledgeImportGoesThroughTheGate pins the bulk door to the same review
// gate as approval: an import may only land active for a caller who could have
// approved the item, and asking for active without that right is refused rather
// than quietly turned into a draft.
func TestKnowledgeImportGoesThroughTheGate(t *testing.T) {
	if testPool == nil {
		t.Skip("handler tests require a reachable DATABASE_URL")
	}

	spaceOwner := dbfx.User(t, "Import gate space owner", "import-gate-space-owner@multica.ai")
	dbfx.Member(t, testWorkspaceID, spaceOwner, "member")
	plainMember := dbfx.User(t, "Import gate plain", "import-gate-plain@multica.ai")
	dbfx.Member(t, testWorkspaceID, plainMember, "member")
	// The space belongs to someone else, so plainMember is not an approver here
	// while spaceOwner is (by ownership, not by workspace role). The suite's own
	// user is a workspace owner and would pass every case on the role alone.
	spaceID := knowledgeCreateSpace(t, "Import gate space", spaceOwner, "")

	t.Run("non-approver lands a draft", func(t *testing.T) {
		status, body := knowledgeImport(t, spaceID, "Import gate draft", plainMember, nil)
		if status != http.StatusAccepted {
			t.Fatalf("status = %d, body = %v", status, body)
		}
		itemID, itemStatus := knowledgeImportedItem(t, knowledgeString(t, body, "id"))
		if itemStatus != "draft" {
			t.Fatalf("imported status = %q, want draft", itemStatus)
		}
		var reviewIssueID string
		dbfx.QueryRow(t, `SELECT coalesce(review_issue_id::text, '') FROM knowledge_items WHERE id = $1`,
			itemID).Scan(&reviewIssueID)
		if reviewIssueID != "" {
			t.Fatalf("unreviewed import recorded review_issue_id = %q", reviewIssueID)
		}
		// A draft is exactly the row the audit must keep asking about.
		if reviewedBy, reviewedAt := knowledgeReviewRecord(t, itemID); reviewedBy != "" || reviewedAt != nil {
			t.Fatalf("draft import recorded a review: reviewed_by=%q reviewed_at=%v", reviewedBy, reviewedAt)
		}
	})

	t.Run("approver imports active explicitly", func(t *testing.T) {
		status, body := knowledgeImport(t, spaceID, "Import gate active", spaceOwner,
			map[string]any{"status": "active"})
		if status != http.StatusAccepted {
			t.Fatalf("status = %d, body = %v", status, body)
		}
		itemID, itemStatus := knowledgeImportedItem(t, knowledgeString(t, body, "id"))
		if itemStatus != "active" {
			t.Fatalf("imported status = %q, want active", itemStatus)
		}
		knowledgeAssertSelfReviewed(t, itemID, spaceOwner)
	})

	t.Run("approver omitting status keeps publishing", func(t *testing.T) {
		status, body := knowledgeImport(t, spaceID, "Import gate default", spaceOwner, nil)
		if status != http.StatusAccepted {
			t.Fatalf("status = %d, body = %v", status, body)
		}
		itemID, itemStatus := knowledgeImportedItem(t, knowledgeString(t, body, "id"))
		if itemStatus != "active" {
			t.Fatalf("imported status = %q, want active", itemStatus)
		}
		knowledgeAssertSelfReviewed(t, itemID, spaceOwner)
	})

	t.Run("non-approver asking for active is refused", func(t *testing.T) {
		title := "Import gate refused"
		status, body := knowledgeImport(t, spaceID, title, plainMember,
			map[string]any{"status": "active"})
		if status != http.StatusForbidden {
			t.Fatalf("status = %d, body = %v", status, body)
		}
		if code, _ := body["code"].(string); code != "knowledge_review_forbidden" {
			t.Fatalf("code = %q, want knowledge_review_forbidden", code)
		}
		// Refused before the task exists: no draft, no active row.
		var items, tasks int
		dbfx.QueryRow(t, `SELECT count(*) FROM knowledge_items WHERE workspace_id = $1 AND title = $2`,
			testWorkspaceID, title).Scan(&items)
		if items != 0 {
			t.Fatalf("refused import created %d knowledge rows", items)
		}
		dbfx.QueryRow(t, `SELECT count(*) FROM knowledge_import_tasks WHERE workspace_id = $1 AND title = $2`,
			testWorkspaceID, title).Scan(&tasks)
		if tasks != 0 {
			t.Fatalf("refused import created %d import tasks", tasks)
		}
	})

	t.Run("agent lands a draft", func(t *testing.T) {
		status, body := knowledgeImport(t, spaceID, "Import gate agent draft", "", nil,
			"X-Actor-Source", "task_token")
		if status != http.StatusAccepted {
			t.Fatalf("status = %d, body = %v", status, body)
		}
		if _, itemStatus := knowledgeImportedItem(t, knowledgeString(t, body, "id")); itemStatus != "draft" {
			t.Fatalf("imported status = %q, want draft", itemStatus)
		}
	})

	t.Run("agent asking for active is refused", func(t *testing.T) {
		status, body := knowledgeImport(t, spaceID, "Import gate agent active", "",
			map[string]any{"status": "active"}, "X-Actor-Source", "task_token")
		if status != http.StatusForbidden {
			t.Fatalf("status = %d, body = %v", status, body)
		}
		if code, _ := body["code"].(string); code != "knowledge_review_forbidden" {
			t.Fatalf("code = %q, want knowledge_review_forbidden", code)
		}
	})
}
