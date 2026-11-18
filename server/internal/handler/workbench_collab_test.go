package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/jerry-halo2026/morchat.co/server/internal/testutil"
)

// Audit and concurrency for the four core ledgers
// (docs/engineering/COLLAB-MODEL.md §1/§2/§3).
//
// Written against the handler, not the SQL, because the properties are about
// what a *caller* gets: a second writer is told the row moved (409 with the
// current row) instead of silently overwriting it, an old client that sends no
// `expected_revision` keeps working, a business change leaves exactly one audit
// row naming what moved, a note-only edit leaves none, and an agent's write is
// recorded as the agent's rather than as the human whose identity it ran under.

// auditRow is one activity_log row, as the assertions read it.
type auditRow struct {
	Action    string
	ActorType string
	ActorID   string
	Details   string
}

func workbenchAuditRows(t *testing.T, subject, subjectID string) []auditRow {
	t.Helper()
	rows, err := testPool.Query(context.Background(), `
		SELECT action, coalesce(actor_type, ''), coalesce(actor_id::text, ''), details::text
		FROM activity_log
		WHERE workspace_id = $1 AND subject_type = $2 AND subject_id = $3
		ORDER BY created_at, id`, testWorkspaceID, subject, subjectID)
	if err != nil {
		t.Fatalf("read audit rows: %v", err)
	}
	defer rows.Close()
	out := []auditRow{}
	for rows.Next() {
		var row auditRow
		if err := rows.Scan(&row.Action, &row.ActorType, &row.ActorID, &row.Details); err != nil {
			t.Fatalf("scan audit row: %v", err)
		}
		out = append(out, row)
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("read audit rows: %v", err)
	}
	return out
}

func cleanupWorkbenchAudit(t *testing.T, subject, subjectID string) {
	t.Helper()
	t.Cleanup(func() {
		_, _ = testPool.Exec(context.Background(),
			`DELETE FROM activity_log WHERE subject_type = $1 AND subject_id = $2`, subject, subjectID)
	})
}

// auditDetails decodes a row's `details` into its two halves.
func auditDetails(t *testing.T, raw string) (before, after map[string]any) {
	t.Helper()
	var envelope struct {
		Before map[string]any `json:"before"`
		After  map[string]any `json:"after"`
	}
	if err := json.Unmarshal([]byte(raw), &envelope); err != nil {
		t.Fatalf("decode audit details %q: %v", raw, err)
	}
	return envelope.Before, envelope.After
}

// collabFixture builds one collaboration through the handler and returns it.
func collabFixture(t *testing.T, label string) CrmCollabResponse {
	t.Helper()
	client := createWorkbenchClient(t, testUserID, label+" client")
	brief := createWorkbenchBrief(t, client.ID, label+" brief")
	creator := createWorkbenchCreator(t, testUserID, label+" creator")
	collab := createWorkbenchCollab(t, brief.ID, creator.ID, nil)
	cleanupWorkbenchAudit(t, subjectCrmCollab, collab.ID)
	return collab
}

// TestCrmCollabStaleWriteRejectsTheSecondWriter is the 409 contract (§3): two
// writers who both read revision 1 cannot both win, and the loser is handed the
// row it did not see so it can refresh instead of replaying its body.
func TestCrmCollabStaleWriteRejectsTheSecondWriter(t *testing.T) {
	collab := collabFixture(t, "Stale write")
	if collab.Revision != 1 {
		t.Fatalf("new collab revision = %d, want 1", collab.Revision)
	}

	// Writer A read revision 1 and moves the card.
	req := workbenchRequest(t, "PATCH", "/api/workbench/crm/collabs/"+collab.ID, map[string]any{
		"stage":             "negotiating",
		"expected_revision": 1,
	}, testUserID)
	first := testutil.Decode[CrmCollabResponse](t, testHandler.UpdateCrmCollab,
		withURLParam(req, "collabId", collab.ID), http.StatusOK)
	if first.Revision != 2 || first.Stage != "negotiating" {
		t.Fatalf("first write = revision %d stage %q, want 2/negotiating",
			first.Revision, first.Stage)
	}

	// Writer B read the same revision 1.
	req = workbenchRequest(t, "PATCH", "/api/workbench/crm/collabs/"+collab.ID, map[string]any{
		"stage":             "confirmed",
		"expected_revision": 1,
	}, testUserID)
	conflict := testutil.Call(t, testHandler.UpdateCrmCollab,
		withURLParam(req, "collabId", collab.ID)).Want(http.StatusConflict).Map()
	if conflict["error"] != "stale_write" {
		t.Fatalf("409 body error = %v, want stale_write", conflict["error"])
	}
	current, ok := conflict["current"].(map[string]any)
	if !ok {
		t.Fatalf("409 body has no current row: %v", conflict)
	}
	if current["revision"] != float64(2) {
		t.Fatalf("409 current revision = %v, want 2", current["revision"])
	}
	if current["stage"] != "negotiating" {
		t.Fatalf("409 current stage = %v, want the other writer's negotiating", current["stage"])
	}

	// The loser's write did not land: the row still says negotiating.
	req = workbenchRequest(t, "GET", "/api/workbench/crm/collabs/"+collab.ID, nil, testUserID)
	after := testutil.Decode[CrmCollabResponse](t, testHandler.GetCrmCollab,
		withURLParam(req, "collabId", collab.ID), http.StatusOK)
	if after.Stage != "negotiating" || after.Revision != 2 {
		t.Fatalf("after the 409 the row = stage %q revision %d, want negotiating/2",
			after.Stage, after.Revision)
	}

	// An old client sends no expected_revision: no check, and it wins.
	req = workbenchRequest(t, "PATCH", "/api/workbench/crm/collabs/"+collab.ID, map[string]any{
		"stage": "confirmed",
	}, testUserID)
	legacy := testutil.Decode[CrmCollabResponse](t, testHandler.UpdateCrmCollab,
		withURLParam(req, "collabId", collab.ID), http.StatusOK)
	if legacy.Stage != "confirmed" || legacy.Revision != 3 {
		t.Fatalf("legacy write = stage %q revision %d, want confirmed/3",
			legacy.Stage, legacy.Revision)
	}
}

// TestCrmCollabAuditRecordsOnlyBusinessChanges pins the trail's discipline: one
// row per business change, nothing for a PATCH that changed nothing, and a
// `last_actor` on the row the GET hands back.
func TestCrmCollabAuditRecordsOnlyBusinessChanges(t *testing.T) {
	collab := collabFixture(t, "Audit trail")

	created := workbenchAuditRows(t, subjectCrmCollab, collab.ID)
	if len(created) != 1 || created[0].Action != subjectCrmCollab+".created" {
		t.Fatalf("create audit = %+v, want one crm_collab.created", created)
	}
	if created[0].ActorType != "member" || created[0].ActorID != testUserID {
		t.Fatalf("create audit actor = %s/%s, want member/%s",
			created[0].ActorType, created[0].ActorID, testUserID)
	}
	// A create has nothing before it: the envelope documents only what exists.
	before, after := auditDetails(t, created[0].Details)
	if len(before) != 0 {
		t.Fatalf("created details.before = %v, want empty", before)
	}
	if after["stage"] != "inquiry" {
		t.Fatalf("created details.after.stage = %v, want inquiry", after["stage"])
	}

	req := workbenchRequest(t, "PATCH", "/api/workbench/crm/collabs/"+collab.ID, map[string]any{
		"stage":        "scheduled",
		"final_amount": 12000,
	}, testUserID)
	updated := testutil.Decode[CrmCollabResponse](t, testHandler.UpdateCrmCollab,
		withURLParam(req, "collabId", collab.ID), http.StatusOK)

	rows := workbenchAuditRows(t, subjectCrmCollab, collab.ID)
	if len(rows) != 2 {
		t.Fatalf("audit rows after one edit = %d, want 2", len(rows))
	}
	edit := rows[1]
	if edit.Action != subjectCrmCollab+".stage_changed" {
		t.Fatalf("stage edit action = %q, want crm_collab.stage_changed", edit.Action)
	}
	before, after = auditDetails(t, edit.Details)
	if before["stage"] != "inquiry" || after["stage"] != "scheduled" {
		t.Fatalf("stage details = %v -> %v, want inquiry -> scheduled", before["stage"], after["stage"])
	}
	if before["final_amount"] != float64(10000) || after["final_amount"] != float64(12000) {
		t.Fatalf("amount details = %v -> %v, want 10000 -> 12000",
			before["final_amount"], after["final_amount"])
	}

	// `last_actor` folds the newest event into the row the client renders.
	if updated.LastActor == nil || updated.LastActor.Action != subjectCrmCollab+".stage_changed" {
		t.Fatalf("PATCH last_actor = %+v, want the stage change", updated.LastActor)
	}
	if updated.LastActor.Type != "member" || updated.LastActor.ID == nil || *updated.LastActor.ID != testUserID {
		t.Fatalf("PATCH last_actor = %+v, want member/%s", updated.LastActor, testUserID)
	}

	// Re-sending the stored values changes nothing: no audit row, revision still
	// moves (the row was written; the trail records *what* changed).
	req = workbenchRequest(t, "PATCH", "/api/workbench/crm/collabs/"+collab.ID, map[string]any{
		"stage":        "scheduled",
		"final_amount": 12000,
	}, testUserID)
	repeat := testutil.Decode[CrmCollabResponse](t, testHandler.UpdateCrmCollab,
		withURLParam(req, "collabId", collab.ID), http.StatusOK)
	if repeat.Revision != updated.Revision+1 {
		t.Fatalf("no-op repeat revision = %d, want %d", repeat.Revision, updated.Revision+1)
	}
	if got := len(workbenchAuditRows(t, subjectCrmCollab, collab.ID)); got != 2 {
		t.Fatalf("audit rows after a no-op PATCH = %d, want 2", got)
	}

	// The list carries the same annotation, in one query for the page.
	req = workbenchRequest(t, "GET", "/api/workbench/crm/collabs", nil, testUserID)
	req = withURLParam(req, "collabId", collab.ID)
	var list struct {
		Collabs []CrmCollabResponse `json:"collabs"`
	}
	testutil.Call(t, testHandler.ListCrmCollabs, req).Want(http.StatusOK).JSON(&list)
	found := false
	for _, row := range list.Collabs {
		if row.ID != collab.ID {
			continue
		}
		found = true
		if row.LastActor == nil || row.LastActor.Action != subjectCrmCollab+".stage_changed" {
			t.Fatalf("list last_actor = %+v, want the stage change", row.LastActor)
		}
	}
	if !found {
		t.Fatalf("the fixture collab is missing from the list")
	}

	// A delete is a business change too: the row leaves the ledger, the event stays.
	req = workbenchRequest(t, "DELETE", "/api/workbench/crm/collabs/"+collab.ID, nil, testUserID)
	testutil.Call(t, testHandler.DeleteCrmCollab,
		withURLParam(req, "collabId", collab.ID)).Want(http.StatusNoContent)
	rows = workbenchAuditRows(t, subjectCrmCollab, collab.ID)
	if len(rows) != 3 || rows[2].Action != subjectCrmCollab+".deleted" {
		t.Fatalf("audit rows after delete = %+v, want a third crm_collab.deleted", rows)
	}
	before, after = auditDetails(t, rows[2].Details)
	if before["stage"] != "scheduled" {
		t.Fatalf("deleted details.before.stage = %v, want scheduled", before["stage"])
	}
	if len(after) != 0 {
		t.Fatalf("deleted details.after = %v, want empty", after)
	}
}

// TestCrmSettlementNoteOnlyPatchLeavesNoAudit is the §2 exception: a note is not
// a business state, so editing it must not bury the money changes in noise.
func TestCrmSettlementNoteOnlyPatchLeavesNoAudit(t *testing.T) {
	collab := collabFixture(t, "Settlement note")
	req := workbenchRequest(t, "POST", "/api/workbench/crm/settlements", map[string]any{
		"collab_id": collab.ID,
		"kind":      "prepay",
		"amount":    3000,
	}, testUserID)
	settlement := testutil.Decode[CrmSettlementResponse](t, testHandler.CreateCrmSettlement,
		req, http.StatusCreated)
	t.Cleanup(func() { dbfx.Exec(t, `DELETE FROM crm_settlement WHERE id = $1`, settlement.ID) })
	cleanupWorkbenchAudit(t, subjectCrmSettlement, settlement.ID)

	if settlement.Revision != 1 {
		t.Fatalf("new settlement revision = %d, want 1", settlement.Revision)
	}
	if got := len(workbenchAuditRows(t, subjectCrmSettlement, settlement.ID)); got != 1 {
		t.Fatalf("create audit rows = %d, want 1", got)
	}

	req = workbenchRequest(t, "PATCH", "/api/workbench/crm/settlements/"+settlement.ID, map[string]any{
		"note": "chasing the invoice",
	}, testUserID)
	noted := testutil.Decode[CrmSettlementResponse](t, testHandler.UpdateCrmSettlement,
		withURLParam(req, "settlementId", settlement.ID), http.StatusOK)
	if noted.Revision != 2 {
		t.Fatalf("note-only revision = %d, want 2 (the row was written)", noted.Revision)
	}
	if got := len(workbenchAuditRows(t, subjectCrmSettlement, settlement.ID)); got != 1 {
		t.Fatalf("note-only PATCH left %d audit rows, want the create's 1", got)
	}

	req = workbenchRequest(t, "PATCH", "/api/workbench/crm/settlements/"+settlement.ID, map[string]any{
		"amount": 2500,
	}, testUserID)
	testutil.Decode[CrmSettlementResponse](t, testHandler.UpdateCrmSettlement,
		withURLParam(req, "settlementId", settlement.ID), http.StatusOK)
	rows := workbenchAuditRows(t, subjectCrmSettlement, settlement.ID)
	if len(rows) != 2 || rows[1].Action != subjectCrmSettlement+".updated" {
		t.Fatalf("amount change audit = %+v, want a crm_settlement.updated", rows)
	}
	before, after := auditDetails(t, rows[1].Details)
	if before["amount"] != float64(3000) || after["amount"] != float64(2500) {
		t.Fatalf("amount details = %v -> %v, want 3000 -> 2500", before["amount"], after["amount"])
	}
	if _, ok := after["note"]; ok {
		t.Fatalf("amount change recorded the note: %v", after)
	}
}

// TestWorkbenchAssigneeDefaultsAndValidation covers the assignee pair
// (COLLAB-MODEL §1): a new row starts assigned to its owner — the rule migration
// 821 backfilled with — a row with no owner stays unassigned, and the pair is
// validated against this workspace's members and agents.
func TestWorkbenchAssigneeDefaultsAndValidation(t *testing.T) {
	collab := collabFixture(t, "Assignee")
	if collab.AssigneeType == nil || *collab.AssigneeType != "member" {
		t.Fatalf("new collab assignee_type = %v, want member (its owner)", collab.AssigneeType)
	}
	if collab.AssigneeID == nil || *collab.AssigneeID != testUserID {
		t.Fatalf("new collab assignee_id = %v, want the owner %s", collab.AssigneeID, testUserID)
	}

	memberUserID := workbenchTestMember(t)
	req := workbenchRequest(t, "PATCH", "/api/workbench/crm/collabs/"+collab.ID, map[string]any{
		"assignee_type": "member",
		"assignee_id":   memberUserID,
	}, testUserID)
	handed := testutil.Decode[CrmCollabResponse](t, testHandler.UpdateCrmCollab,
		withURLParam(req, "collabId", collab.ID), http.StatusOK)
	if handed.AssigneeID == nil || *handed.AssigneeID != memberUserID {
		t.Fatalf("assignee after hand-over = %v, want %s", handed.AssigneeID, memberUserID)
	}
	// The owner is unchanged: assigning the work is not reassigning the deal.
	if handed.OwnerMemberID == nil || *handed.OwnerMemberID != testUserID {
		t.Fatalf("owner after hand-over = %v, want %s", handed.OwnerMemberID, testUserID)
	}

	// An agent may hold the work (§1) — it is not an owner seat.
	agentID := dbfx.Agent(t, "Assignee fixture agent", "")
	req = workbenchRequest(t, "PATCH", "/api/workbench/crm/collabs/"+collab.ID, map[string]any{
		"assignee_type": "agent",
		"assignee_id":   agentID,
	}, testUserID)
	toAgent := testutil.Decode[CrmCollabResponse](t, testHandler.UpdateCrmCollab,
		withURLParam(req, "collabId", collab.ID), http.StatusOK)
	if toAgent.AssigneeType == nil || *toAgent.AssigneeType != "agent" {
		t.Fatalf("assignee_type after agent hand-over = %v, want agent", toAgent.AssigneeType)
	}

	// Half a pair is a 400, not a guess.
	req = workbenchRequest(t, "PATCH", "/api/workbench/crm/collabs/"+collab.ID, map[string]any{
		"assignee_type": "member",
	}, testUserID)
	testutil.Call(t, testHandler.UpdateCrmCollab,
		withURLParam(req, "collabId", collab.ID)).Want(http.StatusBadRequest)

	// An id that is not a member of this workspace is refused.
	req = workbenchRequest(t, "PATCH", "/api/workbench/crm/collabs/"+collab.ID, map[string]any{
		"assignee_type": "member",
		"assignee_id":   "00000000-0000-0000-0000-000000000099",
	}, testUserID)
	testutil.Call(t, testHandler.UpdateCrmCollab,
		withURLParam(req, "collabId", collab.ID)).Want(http.StatusBadRequest)

	// An empty type clears both halves.
	req = workbenchRequest(t, "PATCH", "/api/workbench/crm/collabs/"+collab.ID, map[string]any{
		"assignee_type": "",
		"assignee_id":   "",
	}, testUserID)
	cleared := testutil.Decode[CrmCollabResponse](t, testHandler.UpdateCrmCollab,
		withURLParam(req, "collabId", collab.ID), http.StatusOK)
	if cleared.AssigneeType != nil || cleared.AssigneeID != nil {
		t.Fatalf("cleared assignee = %v/%v, want null/null", cleared.AssigneeType, cleared.AssigneeID)
	}

	// A row with no owner has no assignee: the backfill's "leave NULL" case, and
	// the state a settlement is in for as long as nobody takes it on.
	client := createWorkbenchClient(t, testUserID, "Ownerless client")
	brief := createWorkbenchBrief(t, client.ID, "Ownerless brief")
	creator := createWorkbenchCreator(t, testUserID, "Ownerless creator")
	ownerless := dbfx.Insert(t, "crm_collab", testutil.Cols{
		"workspace_id": testWorkspaceID,
		"brief_id":     brief.ID,
		"creator_id":   creator.ID,
	})
	t.Cleanup(func() { dbfx.Exec(t, `DELETE FROM crm_collab WHERE id = $1`, ownerless) })
	req = workbenchRequest(t, "GET", "/api/workbench/crm/collabs/"+ownerless, nil, testUserID)
	bare := testutil.Decode[CrmCollabResponse](t, testHandler.GetCrmCollab,
		withURLParam(req, "collabId", ownerless), http.StatusOK)
	if bare.OwnerMemberID != nil || bare.AssigneeType != nil || bare.AssigneeID != nil {
		t.Fatalf("ownerless row = owner %v assignee %v/%v, want null/null/null",
			bare.OwnerMemberID, bare.AssigneeType, bare.AssigneeID)
	}
	if bare.Revision != 1 {
		t.Fatalf("ownerless row revision = %d, want the column default 1", bare.Revision)
	}
}

// TestDeletingACollabAuditsTheSettlementsItTakes is the cascade's trail: deleting a
// collaboration archives its settlements, and each archived row leaves its own
// `crm_settlement.deleted` event carrying what the money was.
func TestDeletingACollabAuditsTheSettlementsItTakes(t *testing.T) {
	collab := collabFixture(t, "Cascade audit")
	req := workbenchRequest(t, "POST", "/api/workbench/crm/settlements", map[string]any{
		"collab_id": collab.ID,
		"kind":      "final",
		"amount":    4200,
	}, testUserID)
	settlement := testutil.Decode[CrmSettlementResponse](t, testHandler.CreateCrmSettlement,
		req, http.StatusCreated)
	t.Cleanup(func() { dbfx.Exec(t, `DELETE FROM crm_settlement WHERE id = $1`, settlement.ID) })
	cleanupWorkbenchAudit(t, subjectCrmSettlement, settlement.ID)

	req = workbenchRequest(t, "DELETE", "/api/workbench/crm/collabs/"+collab.ID, nil, testUserID)
	testutil.Call(t, testHandler.DeleteCrmCollab,
		withURLParam(req, "collabId", collab.ID)).Want(http.StatusNoContent)

	rows := workbenchAuditRows(t, subjectCrmSettlement, settlement.ID)
	if len(rows) != 2 || rows[1].Action != subjectCrmSettlement+".deleted" {
		t.Fatalf("cascade audit = %+v, want a crm_settlement.deleted after the create", rows)
	}
	before, after := auditDetails(t, rows[1].Details)
	if before["amount"] != float64(4200) || before["kind"] != "final" {
		t.Fatalf("cascade details.before = %v, want the settlement it archived", before)
	}
	if len(after) != 0 {
		t.Fatalf("cascade details.after = %v, want empty", after)
	}
}

// TestAgentWorkbenchWriteIsAuditedAsAgent covers §6's identity half: an agent's
// write carries the agent as the actor, the delegating member in
// `details.delegated_by`, and cannot touch the owner or delete a row.
func TestAgentWorkbenchWriteIsAuditedAsAgent(t *testing.T) {
	collab := collabFixture(t, "Agent actor")
	runtimeID := dbfx.Runtime(t, "Audit fixture runtime")
	agentID := dbfx.Agent(t, "Audit fixture agent", runtimeID)
	taskID := dbfx.Task(t, agentID, testutil.Cols{
		"issue_id":   dbfx.Issue(t, "agent audit fixture"),
		"runtime_id": runtimeID,
	})

	agentRequest := func(method, path string, body any) *http.Request {
		t.Helper()
		req := workbenchRequest(t, method, path, body, testUserID)
		req.Header.Set("X-Agent-ID", agentID)
		req.Header.Set("X-Task-ID", taskID)
		return req
	}

	req := agentRequest("PATCH", "/api/workbench/crm/collabs/"+collab.ID, map[string]any{
		"stage": "quoted",
	})
	updated := testutil.Decode[CrmCollabResponse](t, testHandler.UpdateCrmCollab,
		withURLParam(req, "collabId", collab.ID), http.StatusOK)
	if updated.LastActor == nil || updated.LastActor.Type != "agent" {
		t.Fatalf("last_actor after an agent write = %+v, want type agent", updated.LastActor)
	}
	if updated.LastActor.ID == nil || *updated.LastActor.ID != agentID {
		t.Fatalf("last_actor id = %v, want %s", updated.LastActor.ID, agentID)
	}

	rows := workbenchAuditRows(t, subjectCrmCollab, collab.ID)
	if len(rows) != 2 {
		t.Fatalf("audit rows = %d, want the create plus the agent's edit", len(rows))
	}
	edit := rows[1]
	if edit.ActorType != "agent" || edit.ActorID != agentID {
		t.Fatalf("agent audit actor = %s/%s, want agent/%s", edit.ActorType, edit.ActorID, agentID)
	}
	var envelope struct {
		DelegatedBy string `json:"delegated_by"`
	}
	if err := json.Unmarshal([]byte(edit.Details), &envelope); err != nil {
		t.Fatalf("decode agent details: %v", err)
	}
	if envelope.DelegatedBy != testUserID {
		t.Fatalf("details.delegated_by = %q, want the member %s", envelope.DelegatedBy, testUserID)
	}

	// An agent does not write owner (§6).
	req = agentRequest("PATCH", "/api/workbench/crm/collabs/"+collab.ID, map[string]any{
		"owner_member_id": workbenchTestMember(t),
	})
	testutil.Call(t, testHandler.UpdateCrmCollab,
		withURLParam(req, "collabId", collab.ID)).Want(http.StatusForbidden)

	// And it does not delete (§6: the whitelist has no delete).
	req = agentRequest("DELETE", "/api/workbench/crm/collabs/"+collab.ID, nil)
	testutil.Call(t, testHandler.DeleteCrmCollab,
		withURLParam(req, "collabId", collab.ID)).Want(http.StatusForbidden)
}

// TestBdQuoteStatusChangeIsAudited is the same contract on a second ledger: the
// status verb names the move, and a note-only edit is silent.
func TestBdQuoteStatusChangeIsAudited(t *testing.T) {
	creator := createWorkbenchCreator(t, testUserID, "Quote audit creator")
	req := workbenchRequest(t, "POST", "/api/workbench/bd/quotes", map[string]any{
		"creator_id": creator.ID,
		"status":     "sent",
		"fee_amount": 1500,
	}, testUserID)
	quote := testutil.Decode[BdQuoteResponse](t, testHandler.CreateBdQuote, req, http.StatusCreated)
	t.Cleanup(func() { dbfx.Exec(t, `DELETE FROM creator_quote WHERE id = $1`, quote.ID) })
	cleanupWorkbenchAudit(t, subjectCreatorQuote, quote.ID)

	if quote.Revision != 1 {
		t.Fatalf("new quote revision = %d, want 1", quote.Revision)
	}

	req = workbenchRequest(t, "PATCH", "/api/workbench/bd/quotes/"+quote.ID, map[string]any{
		"status":            "accepted",
		"expected_revision": 1,
	}, testUserID)
	accepted := testutil.Decode[BdQuoteResponse](t, testHandler.UpdateBdQuote,
		withURLParam(req, "quoteId", quote.ID), http.StatusOK)
	if accepted.Revision != 2 {
		t.Fatalf("quote revision after accept = %d, want 2", accepted.Revision)
	}
	rows := workbenchAuditRows(t, subjectCreatorQuote, quote.ID)
	if len(rows) != 2 || rows[1].Action != subjectCreatorQuote+".status_changed" {
		t.Fatalf("quote audit = %+v, want a creator_quote.status_changed", rows)
	}
	before, after := auditDetails(t, rows[1].Details)
	if before["status"] != "sent" || after["status"] != "accepted" {
		t.Fatalf("status details = %v -> %v, want sent -> accepted", before["status"], after["status"])
	}

	// Note-only: revision moves, trail does not.
	req = workbenchRequest(t, "PATCH", "/api/workbench/bd/quotes/"+quote.ID, map[string]any{
		"note": "call them back",
	}, testUserID)
	noted := testutil.Decode[BdQuoteResponse](t, testHandler.UpdateBdQuote,
		withURLParam(req, "quoteId", quote.ID), http.StatusOK)
	if noted.Revision != 3 {
		t.Fatalf("note-only quote revision = %d, want 3", noted.Revision)
	}
	if got := len(workbenchAuditRows(t, subjectCreatorQuote, quote.ID)); got != 2 {
		t.Fatalf("note-only quote PATCH left %d audit rows, want 2", got)
	}

	// A stale write is the same 409 on this ledger.
	req = workbenchRequest(t, "PATCH", "/api/workbench/bd/quotes/"+quote.ID, map[string]any{
		"status":            "rejected",
		"expected_revision": 1,
	}, testUserID)
	testutil.Call(t, testHandler.UpdateBdQuote,
		withURLParam(req, "quoteId", quote.ID)).Want(http.StatusConflict)
}

// TestFollowUpSummaryOnlyPatchLeavesNoAudit is the follow-up log's version of the
// note rule: `summary` is what was said, so rewriting it is not a business change.
func TestFollowUpSummaryOnlyPatchLeavesNoAudit(t *testing.T) {
	creator := createWorkbenchCreator(t, testUserID, "Follow-up audit creator")
	req := workbenchRequest(t, "POST", "/api/workbench/bd/activities", map[string]any{
		"creator_id":  creator.ID,
		"kind":        "dm",
		"happened_at": "2026-11-18T09:00:00Z",
		"summary":     "asked for the rate card",
	}, testUserID)
	activity := testutil.Decode[BdActivityResponse](t, testHandler.CreateBdActivity,
		req, http.StatusCreated)
	t.Cleanup(func() { dbfx.Exec(t, `DELETE FROM creator_activity WHERE id = $1`, activity.ID) })
	cleanupWorkbenchAudit(t, subjectCreatorActivity, activity.ID)

	req = workbenchRequest(t, "PATCH", "/api/workbench/bd/activities/"+activity.ID, map[string]any{
		"summary": "asked for the rate card and the deck",
	}, testUserID)
	rewritten := testutil.Decode[BdActivityResponse](t, testHandler.UpdateBdActivity,
		withURLParam(req, "activityId", activity.ID), http.StatusOK)
	if rewritten.Revision != 2 {
		t.Fatalf("summary-only revision = %d, want 2", rewritten.Revision)
	}
	if got := len(workbenchAuditRows(t, subjectCreatorActivity, activity.ID)); got != 1 {
		t.Fatalf("summary-only PATCH left %d audit rows, want the create's 1", got)
	}

	// A result is a business fact, and it is recorded with its before/after.
	req = workbenchRequest(t, "PATCH", "/api/workbench/bd/activities/"+activity.ID, map[string]any{
		"outcome": "replied",
	}, testUserID)
	testutil.Decode[BdActivityResponse](t, testHandler.UpdateBdActivity,
		withURLParam(req, "activityId", activity.ID), http.StatusOK)
	rows := workbenchAuditRows(t, subjectCreatorActivity, activity.ID)
	if len(rows) != 2 || rows[1].Action != subjectCreatorActivity+".updated" {
		t.Fatalf("outcome audit = %+v, want a creator_activity.updated", rows)
	}
	before, after := auditDetails(t, rows[1].Details)
	if _, ok := before["outcome"]; !ok || before["outcome"] != nil {
		t.Fatalf("outcome before = %v, want an explicit null", before["outcome"])
	}
	if after["outcome"] != "replied" {
		t.Fatalf("outcome after = %v, want replied", after["outcome"])
	}
	if _, ok := after["summary"]; ok {
		t.Fatalf("outcome change recorded the summary: %v", after)
	}
}
