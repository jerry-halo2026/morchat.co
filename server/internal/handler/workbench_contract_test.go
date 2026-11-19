package handler

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/jerry-halo2026/morchat.co/server/internal/testutil"
)

// The queue's wire shape, pinned (WORKBENCH-CONTRACT §3.3).
//
// The client schema reads `rows` while this server calls the array `items`; that
// mismatch made the review queue render empty against a real server for as long as
// nobody called the endpoint with actual pending rows. The client now accepts the
// wire name, and this test keeps the wire name from drifting in the other
// direction.
func TestWorkbenchReviewQueueEnvelopeShape(t *testing.T) {
	agentID, taskID := agentWriteFixture(t)
	collabID := agentCollabFixture(t, "Review envelope", agentID)

	req := workbenchRequest(t, "PATCH", "/api/workbench/crm/collabs/"+collabID, map[string]any{
		"stage": "negotiating",
	}, testUserID)
	req.Header.Set("X-Agent-ID", agentID)
	req.Header.Set("X-Task-ID", taskID)
	testutil.Call(t, testHandler.UpdateCrmCollab,
		withURLParam(req, "collabId", collabID)).Want(http.StatusOK)

	res := testutil.Call(t, testHandler.GetWorkbenchReviewQueue,
		workbenchRequest(t, "GET", "/api/workbench/review", nil, testUserID)).Want(http.StatusOK)

	var envelope map[string]json.RawMessage
	if err := json.Unmarshal([]byte(res.Text()), &envelope); err != nil {
		t.Fatalf("queue is not a JSON object: %v", err)
	}
	if _, ok := envelope["items"]; !ok {
		t.Fatalf("queue has no `items` key; keys = %v", contractKeys(envelope))
	}

	var items []map[string]json.RawMessage
	if err := json.Unmarshal(envelope["items"], &items); err != nil {
		t.Fatalf("items is not an array: %v", err)
	}
	if len(items) == 0 {
		t.Fatalf("the pending collab is not in the queue")
	}
	// The columns a reviewer needs before deciding; the client type names them, so a
	// missing one renders as a blank cell rather than an error.
	for _, field := range []string{"domain", "id", "review_state", "revision", "updated_at"} {
		if _, ok := items[0][field]; !ok {
			t.Fatalf("queue row has no %q; keys = %v", field, contractKeys(items[0]))
		}
	}
}

func contractKeys(m map[string]json.RawMessage) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	return out
}
