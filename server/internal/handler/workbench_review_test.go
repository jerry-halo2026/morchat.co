package handler

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"github.com/jerry-halo2026/morchat.co/server/internal/testutil"
)

// The review gate (docs/engineering/WORKBENCH-API.md 鎼?6): what an agent wrote,
// or what a person changed on a money field, waits for a human verdict; a person
// who overwrites an agent's row must say why, otherwise the overwrite rate cannot
// distinguish "the agent was wrong" from "the reader changed their mind"; and the
// REST surface refuses money fields to an agent outright, independent of the
// delegator's capabilities.

// reviewStateOf reads one row's review columns straight from the table, because
// the property under test is what the ledger stores, not what a list renders.
func reviewStateOf(t *testing.T, table, id string) (state string, reviewedBy string) {
	t.Helper()
	var by *string
	if err := testPool.QueryRow(t.Context(),
		"SELECT review_state, reviewed_by::text FROM "+table+" WHERE id = $1", id).
		Scan(&state, &by); err != nil {
		t.Fatalf("read %s review state: %v", table, err)
	}
	if by != nil {
		reviewedBy = *by
	}
	return state, reviewedBy
}

// agentCollabFixture seeds a collab the agent is assigned to, which is the one
// shape the row gate lets an agent write.
func agentCollabFixture(t *testing.T, name, agentID string) string {
	t.Helper()
	collab := collabFixture(t, name)
	if err := testPool.QueryRow(t.Context(), `
		UPDATE crm_collab SET assignee_type = 'agent', assignee_id = $2 WHERE id = $1
		RETURNING id`, collab.ID, agentID).Scan(&collab.ID); err != nil {
		t.Fatalf("assign collab to agent: %v", err)
	}
	return collab.ID
}

// TestAgentWriteLandsInTheReviewQueue is the point of the whole batch: an agent's
// business change is not silently live, it waits for someone with review.accept.
func TestAgentWriteLandsInTheReviewQueue(t *testing.T) {
	agentID, taskID := agentWriteFixture(t)
	collabID := agentCollabFixture(t, "Review queue", agentID)

	req := workbenchRequest(t, "PATCH", "/api/workbench/crm/collabs/"+collabID, map[string]any{
		"stage": "negotiating",
	}, testUserID)
	req.Header.Set("X-Agent-ID", agentID)
	req.Header.Set("X-Task-ID", taskID)
	testutil.Call(t, testHandler.UpdateCrmCollab,
		withURLParam(req, "collabId", collabID)).Want(http.StatusOK)

	if state, _ := reviewStateOf(t, "crm_collab", collabID); state != "pending" {
		t.Fatalf("agent-written collab review_state = %q, want pending", state)
	}

	var parsed WorkbenchReviewQueueResponse
	testutil.Call(t, testHandler.GetWorkbenchReviewQueue,
		workbenchRequest(t, "GET", "/api/workbench/review", nil, testUserID)).
		Want(http.StatusOK).JSON(&parsed)
	found := false
	for _, item := range parsed.Items {
		if item.ID == collabID && item.Domain == "collabs" {
			found = true
		}
	}
	if !found {
		t.Fatalf("queue did not list the pending collab: %+v", parsed.Items)
	}
}

// TestHumanWriteStaysAccepted: the gate is not a tax on people. A member writing an
// ordinary field produces a reviewed row immediately, so the queue stays a queue of
// exceptions rather than of everything.
func TestHumanWriteStaysAccepted(t *testing.T) {
	collab := collabFixture(t, "Human write")
	req := workbenchRequest(t, "PATCH", "/api/workbench/crm/collabs/"+collab.ID, map[string]any{
		"stage": "negotiating",
	}, testUserID)
	testutil.Call(t, testHandler.UpdateCrmCollab,
		withURLParam(req, "collabId", collab.ID)).Want(http.StatusOK)
	if state, _ := reviewStateOf(t, "crm_collab", collab.ID); state != "accepted" {
		t.Fatalf("human-written collab review_state = %q, want accepted", state)
	}
}

// TestReviewAcceptAndRejectDecideTheRow: the verdict is recorded on the row and in
// the trail, and a rejection without a reason is refused.
func TestReviewAcceptAndRejectDecideTheRow(t *testing.T) {
	agentID, taskID := agentWriteFixture(t)

	acceptID := agentCollabFixture(t, "Review accept", agentID)
	req := workbenchRequest(t, "PATCH", "/api/workbench/crm/collabs/"+acceptID, map[string]any{
		"stage": "negotiating",
	}, testUserID)
	req.Header.Set("X-Agent-ID", agentID)
	req.Header.Set("X-Task-ID", taskID)
	testutil.Call(t, testHandler.UpdateCrmCollab,
		withURLParam(req, "collabId", acceptID)).Want(http.StatusOK)

	accept := workbenchRequest(t, "POST", "/api/workbench/review/collabs/"+acceptID+"/accept", nil, testUserID)
	accept = withURLParams(accept, "domain", "collabs", "id", acceptID)
	testutil.Call(t, testHandler.AcceptWorkbenchReview, accept).Want(http.StatusNoContent)
	state, by := reviewStateOf(t, "crm_collab", acceptID)
	if state != "accepted" || by == "" {
		t.Fatalf("after accept: state=%q reviewed_by=%q", state, by)
	}

	rejectID := agentCollabFixture(t, "Review reject", agentID)
	req = workbenchRequest(t, "PATCH", "/api/workbench/crm/collabs/"+rejectID, map[string]any{
		"stage": "negotiating",
	}, testUserID)
	req.Header.Set("X-Agent-ID", agentID)
	req.Header.Set("X-Task-ID", taskID)
	testutil.Call(t, testHandler.UpdateCrmCollab,
		withURLParam(req, "collabId", rejectID)).Want(http.StatusOK)

	noReason := workbenchRequest(t, "POST", "/api/workbench/review/collabs/"+rejectID+"/reject", map[string]any{}, testUserID)
	noReason = withURLParams(noReason, "domain", "collabs", "id", rejectID)
	testutil.Call(t, testHandler.RejectWorkbenchReview, noReason).Want(http.StatusBadRequest)

	withReason := workbenchRequest(t, "POST", "/api/workbench/review/collabs/"+rejectID+"/reject",
		map[string]any{"reason": "wrong stage: the brief was never quoted"}, testUserID)
	withReason = withURLParams(withReason, "domain", "collabs", "id", rejectID)
	testutil.Call(t, testHandler.RejectWorkbenchReview, withReason).Want(http.StatusNoContent)
	if state, _ := reviewStateOf(t, "crm_collab", rejectID); state != "rejected" {
		t.Fatalf("after reject: state=%q, want rejected", state)
	}
}

// TestOverwritingAnAgentsRowNeedsAReason: without the reason the overwrite rate is
// unmeasurable, so a human edit on top of an agent's change is a 400.
func TestOverwritingAnAgentsRowNeedsAReason(t *testing.T) {
	agentID, taskID := agentWriteFixture(t)
	collabID := agentCollabFixture(t, "Overwrite reason", agentID)

	req := workbenchRequest(t, "PATCH", "/api/workbench/crm/collabs/"+collabID, map[string]any{
		"stage": "negotiating",
	}, testUserID)
	req.Header.Set("X-Agent-ID", agentID)
	req.Header.Set("X-Task-ID", taskID)
	testutil.Call(t, testHandler.UpdateCrmCollab,
		withURLParam(req, "collabId", collabID)).Want(http.StatusOK)

	blind := workbenchRequest(t, "PATCH", "/api/workbench/crm/collabs/"+collabID, map[string]any{
		"stage": "quoted",
	}, testUserID)
	testutil.Call(t, testHandler.UpdateCrmCollab,
		withURLParam(blind, "collabId", collabID)).Want(http.StatusBadRequest)

	told := workbenchRequest(t, "PATCH", "/api/workbench/crm/collabs/"+collabID, map[string]any{
		"stage":            "quoted",
		"overwrite_reason": "wrong_judgement",
	}, testUserID)
	testutil.Call(t, testHandler.UpdateCrmCollab,
		withURLParam(told, "collabId", collabID)).Want(http.StatusOK)
}

// TestAgentCannotTouchMoneyOverREST: the MCP tools never declare money, but the
// REST surface is reachable with the same actor headers, so it needs its own gate.
func TestAgentCannotTouchMoneyOverREST(t *testing.T) {
	agentID, taskID := agentWriteFixture(t)
	collabID := agentCollabFixture(t, "Agent money gate", agentID)

	req := workbenchRequest(t, "PATCH", "/api/workbench/crm/collabs/"+collabID, map[string]any{
		"final_amount": 999999,
	}, testUserID)
	req.Header.Set("X-Agent-ID", agentID)
	req.Header.Set("X-Task-ID", taskID)
	body := testutil.Call(t, testHandler.UpdateCrmCollab,
		withURLParam(req, "collabId", collabID)).Want(http.StatusForbidden).Map()
	if body["error"] != "forbidden_agent_money" {
		t.Fatalf("403 body = %v, want forbidden_agent_money", body)
	}
}

// ---- the queue row's projection --------------------------------------------
//
// A queue that names the ledger and nothing else is a list of links, not a review
// desk: the reviewer cannot tell an agent's guess from a person's edit, cannot see
// which number moved, and cannot see the money on the row without opening it.
// These three cases pin the projection the client type already declares —
// actor_type/agent_name, changed_fields, amount/currency — and the empty states
// that must stay distinguishable from "nothing happened".

// reviewQueueItems reads the whole queue as the client receives it.
func reviewQueueItems(t *testing.T) []WorkbenchReviewItem {
	t.Helper()
	var parsed WorkbenchReviewQueueResponse
	testutil.Call(t, testHandler.GetWorkbenchReviewQueue,
		workbenchRequest(t, "GET", "/api/workbench/review", nil, testUserID)).
		Want(http.StatusOK).JSON(&parsed)
	return parsed.Items
}

// reviewQueueItem is one row of the queue, addressed by ledger and id.
func reviewQueueItem(t *testing.T, domain, id string) WorkbenchReviewItem {
	t.Helper()
	for _, item := range reviewQueueItems(t) {
		if item.Domain == domain && item.ID == id {
			return item
		}
	}
	t.Fatalf("the queue does not list %s/%s", domain, id)
	return WorkbenchReviewItem{}
}

// reviewQueueRawItem is the same row before it is decoded, for the assertions that
// are about the wire shape rather than about a Go value.
func reviewQueueRawItem(t *testing.T, domain, id string) map[string]json.RawMessage {
	t.Helper()
	res := testutil.Call(t, testHandler.GetWorkbenchReviewQueue,
		workbenchRequest(t, "GET", "/api/workbench/review", nil, testUserID)).Want(http.StatusOK)
	var envelope struct {
		Items []map[string]json.RawMessage `json:"items"`
	}
	if err := json.Unmarshal([]byte(res.Text()), &envelope); err != nil {
		t.Fatalf("the queue is not JSON: %v", err)
	}
	for _, item := range envelope.Items {
		var gotDomain, gotID string
		_ = json.Unmarshal(item["domain"], &gotDomain)
		_ = json.Unmarshal(item["id"], &gotID)
		if gotDomain == domain && gotID == id {
			return item
		}
	}
	t.Fatalf("the queue does not list %s/%s", domain, id)
	return nil
}

// TestWorkbenchReviewQueueRowSaysWhoChangedWhatAndForHowMuch is the agent case: the
// newest business event is the agent's stage change, so the row must name the
// agent, list `stage` as the field it touched, and carry the collab's own amount.
func TestWorkbenchReviewQueueRowSaysWhoChangedWhatAndForHowMuch(t *testing.T) {
	agentID, taskID := agentWriteFixture(t)
	collabID := agentCollabFixture(t, "Queue projection", agentID)

	req := workbenchRequest(t, "PATCH", "/api/workbench/crm/collabs/"+collabID, map[string]any{
		"stage": "negotiating",
	}, testUserID)
	req.Header.Set("X-Agent-ID", agentID)
	req.Header.Set("X-Task-ID", taskID)
	testutil.Call(t, testHandler.UpdateCrmCollab,
		withURLParam(req, "collabId", collabID)).Want(http.StatusOK)

	var agentName string
	if err := testPool.QueryRow(t.Context(),
		`SELECT name FROM agent WHERE id = $1`, agentID).Scan(&agentName); err != nil {
		t.Fatalf("read the agent's name: %v", err)
	}

	item := reviewQueueItem(t, "collabs", collabID)
	if item.ActorType != "agent" {
		t.Fatalf("queue row actor_type = %q, want agent", item.ActorType)
	}
	if item.ActorID == nil || *item.ActorID != agentID {
		t.Fatalf("queue row actor_id = %v, want the agent %s", item.ActorID, agentID)
	}
	if item.AgentName == nil || *item.AgentName != agentName {
		t.Fatalf("queue row agent_name = %v, want %q", item.AgentName, agentName)
	}
	if len(item.ChangedFields) != 1 || item.ChangedFields[0] != "stage" {
		t.Fatalf("queue row changed_fields = %v, want [stage]", item.ChangedFields)
	}
	// The fixture collab costs 10000 CNY; the agent changed the stage and no money.
	if item.Amount == nil || *item.Amount != 10000 {
		t.Fatalf("queue row amount = %v, want the collab's 10000", item.Amount)
	}
	if item.Currency != "CNY" {
		t.Fatalf("queue row currency = %q, want CNY", item.Currency)
	}
	if !strings.Contains(item.Summary, "negotiating") {
		t.Fatalf("queue row summary = %q, want the stage it moved to", item.Summary)
	}
	if !strings.Contains(item.Summary, "Queue projection creator") {
		t.Fatalf("queue row summary = %q, want the creator's name", item.Summary)
	}
	if item.CreatedAt == "" {
		t.Fatalf("queue row has no created_at")
	}
}

// TestWorkbenchReviewQueueRowNamesTheMemberWhoWroteIt is the human case: an offer
// with a fee on it is high value, so a member's own write waits for review — and
// the row says a person wrote it, not an agent.
func TestWorkbenchReviewQueueRowNamesTheMemberWhoWroteIt(t *testing.T) {
	creator := createWorkbenchCreator(t, testUserID, "Queue quote creator")
	req := workbenchRequest(t, "POST", "/api/workbench/bd/quotes", map[string]any{
		"creator_id": creator.ID,
		"status":     "sent",
		"fee_amount": 1500,
	}, testUserID)
	quote := testutil.Decode[BdQuoteResponse](t, testHandler.CreateBdQuote, req, http.StatusCreated)
	t.Cleanup(func() {
		_, _ = testPool.Exec(t.Context(), `DELETE FROM creator_quote WHERE id = $1`, quote.ID)
	})

	var userName string
	if err := testPool.QueryRow(t.Context(),
		`SELECT name FROM "user" WHERE id = $1`, testUserID).Scan(&userName); err != nil {
		t.Fatalf("read the member's name: %v", err)
	}

	item := reviewQueueItem(t, "quotes", quote.ID)
	if item.ReviewState != "pending" {
		t.Fatalf("quote queue row review_state = %q, want pending", item.ReviewState)
	}
	if item.ActorType != "member" {
		t.Fatalf("quote queue row actor_type = %q, want member", item.ActorType)
	}
	if item.ActorName == nil || *item.ActorName != userName {
		t.Fatalf("quote queue row actor_name = %v, want %q", item.ActorName, userName)
	}
	if item.AgentName != nil {
		t.Fatalf("quote queue row agent_name = %v, want null for a member's write", *item.AgentName)
	}
	if item.Amount == nil || *item.Amount != 1500 || item.Currency != "CNY" {
		t.Fatalf("quote queue row amount = %v %q, want 1500 CNY", item.Amount, item.Currency)
	}
	if !strings.Contains(strings.Join(item.ChangedFields, ","), "fee_amount") {
		t.Fatalf("quote queue row changed_fields = %v, want the fee it quoted", item.ChangedFields)
	}
	if !strings.Contains(item.Summary, "1500 CNY") {
		t.Fatalf("quote queue row summary = %q, want the quoted fee", item.Summary)
	}
}

// TestWorkbenchReviewQueueRowSaysNothingAboutWhatItCannotSee pins the empty state:
// an event with no `after` is "the server cannot say what moved", and the row says
// so with an empty array — not null, and not a missing key the client would have to
// guess at.
func TestWorkbenchReviewQueueRowSaysNothingAboutWhatItCannotSee(t *testing.T) {
	agentID, _ := agentWriteFixture(t)
	collabID := agentCollabFixture(t, "Queue empty trail", agentID)

	// collabFixture drops the creation event, so this is the row's whole trail: an
	// event with an empty envelope, which is what a write that recorded no field
	// detail leaves behind.
	if _, err := testPool.Exec(t.Context(), `
		INSERT INTO activity_log (workspace_id, subject_type, subject_id, actor_type, actor_id, action, details)
		VALUES ($1, $2, $3, 'agent', $4, 'crm_collab.updated', '{}'::jsonb)`,
		testWorkspaceID, subjectCrmCollab, collabID, agentID); err != nil {
		t.Fatalf("insert an empty audit event: %v", err)
	}
	t.Cleanup(func() {
		_, _ = testPool.Exec(t.Context(),
			`DELETE FROM activity_log WHERE subject_type = $1 AND subject_id = $2`,
			subjectCrmCollab, collabID)
	})
	if _, err := testPool.Exec(t.Context(),
		`UPDATE crm_collab SET review_state = 'pending' WHERE id = $1`, collabID); err != nil {
		t.Fatalf("put the collab in the queue: %v", err)
	}

	raw := reviewQueueRawItem(t, "collabs", collabID)
	if got := string(raw["changed_fields"]); got != "[]" {
		t.Fatalf("changed_fields on the wire = %s, want []", got)
	}
	item := reviewQueueItem(t, "collabs", collabID)
	if item.ChangedFields == nil || len(item.ChangedFields) != 0 {
		t.Fatalf("changed_fields = %v, want an empty array", item.ChangedFields)
	}
	if item.ActorType != "agent" || item.AgentName == nil {
		t.Fatalf("the empty event still has an actor: %q / %v", item.ActorType, item.AgentName)
	}
}
