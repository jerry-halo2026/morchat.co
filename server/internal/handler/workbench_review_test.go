package handler

import (
	"net/http"
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
