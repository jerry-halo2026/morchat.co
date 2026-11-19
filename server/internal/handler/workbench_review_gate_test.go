package handler

import (
	"net/http"
	"testing"

	"github.com/jerry-halo2026/morchat.co/server/internal/testutil"
)

// Regressions for the four blocking findings of the main..dev review
// (docs/engineering/DEV-REVIEW.md §1).

// TestReviewGateSurvivesAnOrdinaryEdit: a pending row must stay pending when a
// person edits a field that is not money. Without this, any member with the
// domain's write capability could accept an agent's money row by touching `note`,
// and the flip left no trace.
func TestReviewGateSurvivesAnOrdinaryEdit(t *testing.T) {
	agentID, taskID := agentWriteFixture(t)
	collabID := agentCollabFixture(t, "Review gate survives", agentID)

	req := workbenchRequest(t, "PATCH", "/api/workbench/crm/collabs/"+collabID, map[string]any{
		"stage": "negotiating",
	}, testUserID)
	req.Header.Set("X-Agent-ID", agentID)
	req.Header.Set("X-Task-ID", taskID)
	testutil.Call(t, testHandler.UpdateCrmCollab,
		withURLParam(req, "collabId", collabID)).Want(http.StatusOK)
	if state, _ := reviewStateOf(t, "crm_collab", collabID); state != "pending" {
		t.Fatalf("agent write left review_state = %q, want pending", state)
	}

	// A person edits something that is not money, with the overwrite reason the
	// gate asks for (the row's last actor is an agent).
	edit := workbenchRequest(t, "PATCH", "/api/workbench/crm/collabs/"+collabID, map[string]any{
		"stage":            "quoted",
		"overwrite_reason": "wrong_judgement",
	}, testUserID)
	testutil.Call(t, testHandler.UpdateCrmCollab,
		withURLParam(edit, "collabId", collabID)).Want(http.StatusOK)

	if state, _ := reviewStateOf(t, "crm_collab", collabID); state != "pending" {
		t.Fatalf("after an ordinary human edit review_state = %q, want pending "+
			"(editing a row does not review it)", state)
	}

	// And the existing pending row is still in the queue.
	var queue WorkbenchReviewQueueResponse
	testutil.Call(t, testHandler.GetWorkbenchReviewQueue,
		workbenchRequest(t, "GET", "/api/workbench/review", nil, testUserID)).
		Want(http.StatusOK).JSON(&queue)
	found := false
	for _, item := range queue.Items {
		if item.ID == collabID {
			found = true
		}
	}
	if !found {
		t.Fatalf("the still-pending collab disappeared from the queue")
	}
}

// TestPatchCurrencyEmptyIsRefused: `{"currency": ""}` used to fall into the
// "default CNY" branch and silently re-denominate a USD row (WORKBENCH-API §3.4
// lists currency among the NOT NULL columns a clear cannot touch).
func TestPatchCurrencyEmptyIsRefused(t *testing.T) {
	collab := collabFixture(t, "Currency clear")

	for _, body := range []map[string]any{
		{"currency": ""},
		{"currency": "   "},
	} {
		req := workbenchRequest(t, "PATCH", "/api/workbench/crm/collabs/"+collab.ID, body, testUserID)
		testutil.Call(t, testHandler.UpdateCrmCollab,
			withURLParam(req, "collabId", collab.ID)).Want(http.StatusBadRequest)
	}

	// The row kept the currency it had, and a valid code still works.
	clear := workbenchRequest(t, "PATCH", "/api/workbench/crm/collabs/"+collab.ID,
		map[string]any{"currency": "usd"}, testUserID)
	updated := testutil.Decode[CrmCollabResponse](t, testHandler.UpdateCrmCollab,
		withURLParam(clear, "collabId", collab.ID), http.StatusOK)
	if updated.Currency != "USD" {
		t.Fatalf("currency = %q, want USD (upper-cased)", updated.Currency)
	}
}

// TestImportLeavesAnAuditTrail: a bulk import created rows with no `activity_log`
// entry at all, so `last_actor` stayed empty and §26.3's overwrite attribution
// could never fire for anything that arrived as a spreadsheet.
func TestImportLeavesAnAuditTrail(t *testing.T) {
	creator := createWorkbenchCreator(t, testUserID, "Import audit creator")
	cleanupWorkbenchAudit(t, "creator_quote", creator.ID) // no-op guard, rows are keyed by quote
	csv := "creator_id,status,fee_amount,currency,note\n" +
		creator.ID + ",sent,1500,CNY,imported row\n"

	preview := testutil.Call(t, testHandler.ImportWorkbenchCSV,
		importRequest(t, "?kind=quotes", csv, testUserID)).Want(http.StatusOK).Map()
	if accepted, _ := preview["accepted"].(float64); accepted != 1 {
		t.Fatalf("preview accepted = %v, want 1 (%v)", preview["accepted"], preview)
	}

	body := testutil.Call(t, testHandler.ImportWorkbenchCSV,
		importRequest(t, "?kind=quotes&dry_run=0", csv, testUserID)).Want(http.StatusOK).Map()
	if committed, _ := body["committed"].(float64); committed != 1 {
		t.Fatalf("committed = %v, want 1 (%v)", body["committed"], body)
	}

	var quoteID string
	if err := testPool.QueryRow(t.Context(),
		`SELECT id::text FROM creator_quote WHERE workspace_id = $1 AND creator_id = $2 AND archived_at IS NULL`,
		testWorkspaceID, creator.ID).Scan(&quoteID); err != nil {
		t.Fatalf("read the imported quote: %v", err)
	}
	t.Cleanup(func() {
		_, _ = testPool.Exec(t.Context(), `DELETE FROM activity_log WHERE subject_id = $1`, quoteID)
	})

	rows := workbenchAuditRows(t, "creator_quote", quoteID)
	if len(rows) != 1 {
		t.Fatalf("imported quote has %d audit rows, want 1 (.created)", len(rows))
	}
	if rows[0].Action != "creator_quote.created" {
		t.Fatalf("audit action = %q, want creator_quote.created", rows[0].Action)
	}
	if rows[0].ActorType != "member" || rows[0].ActorID != testUserID {
		t.Fatalf("audit actor = %s/%s, want member/%s", rows[0].ActorType, rows[0].ActorID, testUserID)
	}
}
