package handler

// Tests for the agent write channel (workbench_agent_write.go,
// docs/engineering/COLLAB-MODEL.md §6).
//
// Three questions, in the order the contract asks them:
//
//  1. Does an agent's write land, and does the trail say an agent wrote it? The
//     actor must be the agent, `details.delegated_by` the human, the revision
//     bumped, and the list's `last_actor.type` "agent" — the four things a later
//     reviewer needs to tell an agent's work from a member's.
//  2. Can an agent write outside its delegator? No: without `agent.delegate` it
//     writes nothing at all, and a row that is neither assigned to it nor owned by
//     its delegator is refused before the ledger runs.
//  3. Can an agent touch money, ownership or end a row? No: the tool surface has no
//     such argument, the stage gate refuses `settled`/`cancelled`, and there is no
//     delete tool to call.
//
// The success cases drive the real MCP endpoint through the same membership
// middleware the router mounts, so the identity headers, `resolveActor`, the
// replay and the audit are exercised together rather than in pieces.

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/jerry-halo2026/morchat.co/server/internal/testutil"
	"github.com/jerry-halo2026/morchat.co/server/internal/util"
	db "github.com/jerry-halo2026/morchat.co/server/pkg/db/generated"
)

// agentWriteFixture is one agent with one bound task: the identity pair
// `resolveActor` accepts (handler.go), created in the suite's workspace.
func agentWriteFixture(t *testing.T) (agentID, taskID string) {
	t.Helper()
	runtimeID := dbfx.Runtime(t, "Agent write fixture runtime")
	agentID = dbfx.Agent(t, "Agent write fixture agent", runtimeID)
	taskID = dbfx.Task(t, agentID, testutil.Cols{
		"issue_id":   dbfx.Issue(t, "agent write fixture"),
		"runtime_id": runtimeID,
	})
	return agentID, taskID
}

// agentWriteCall is one tools/call that authenticates as the delegating member and
// names the agent through the two headers `resolveActor` trusts.
func agentWriteCall(t *testing.T, tool string, args map[string]any, delegatorUserID, agentID, taskID string) (int, mcpFrame) {
	t.Helper()
	return workbenchMCPPost(t, map[string]any{
		"jsonrpc": "2.0", "id": 21, "method": "tools/call",
		"params": map[string]any{"name": tool, "arguments": args},
	}, delegatorUserID, testWorkspaceID, "X-Agent-ID", agentID, "X-Task-ID", taskID)
}

// agentWriteAudit reads the trail of one row and insists its newest event is the
// agent's, with the delegator in `details.delegated_by`.
func agentWriteAudit(t *testing.T, subject, subjectID, agentID, delegatorID string) auditRow {
	t.Helper()
	rows := workbenchAuditRows(t, subject, subjectID)
	if len(rows) == 0 {
		t.Fatalf("%s %s has no audit rows", subject, subjectID)
	}
	last := rows[len(rows)-1]
	if last.ActorType != "agent" || last.ActorID != agentID {
		t.Fatalf("audit actor = %s/%s, want agent/%s", last.ActorType, last.ActorID, agentID)
	}
	var envelope struct {
		DelegatedBy string `json:"delegated_by"`
	}
	if err := json.Unmarshal([]byte(last.Details), &envelope); err != nil {
		t.Fatalf("decode audit details %q: %v", last.Details, err)
	}
	if envelope.DelegatedBy != delegatorID {
		t.Fatalf("details.delegated_by = %q, want the delegating member %s", envelope.DelegatedBy, delegatorID)
	}
	return last
}

// TestAgentCreatesAQuoteAndTheTrailSaysAgent is the first whitelisted write end to
// end: the row exists, it belongs to the delegating member, the audit names the
// agent as the actor, and the ledger's own list annotates the row with that actor.
func TestAgentCreatesAQuoteAndTheTrailSaysAgent(t *testing.T) {
	if testPool == nil {
		t.Skip("handler tests require a reachable DATABASE_URL")
	}

	creator := createWorkbenchCreator(t, testUserID, "Agent quote creator")
	agentID, taskID := agentWriteFixture(t)

	_, frame := agentWriteCall(t, workbenchToolCreateQuote, map[string]any{
		"creator_id":  creator.ID,
		"status":      "draft",
		"quoted_at":   "2026-11-18T09:00:00Z",
		"valid_until": "2026-12-02",
		"note":        "quoted by the sourcing agent",
	}, testUserID, agentID, taskID)

	var quote BdQuoteResponse
	workbenchMCPOK(t, frame, &quote)
	t.Cleanup(func() { dbfx.Exec(t, `DELETE FROM creator_quote WHERE id = $1`, quote.ID) })
	cleanupWorkbenchAudit(t, subjectCreatorQuote, quote.ID)

	if quote.ID == "" || quote.Status != "draft" || quote.ValidUntil == nil || *quote.ValidUntil != "2026-12-02" {
		t.Fatalf("created quote = %+v, want a draft valid until 2026-12-02", quote)
	}
	// The agent writes under the delegator's identity: the row is theirs.
	if quote.OwnerMemberID == nil || *quote.OwnerMemberID != testUserID {
		t.Fatalf("quote owner = %v, want the delegating member %s", quote.OwnerMemberID, testUserID)
	}
	if quote.Revision != 1 {
		t.Fatalf("new quote revision = %d, want 1", quote.Revision)
	}
	if quote.LastActor == nil || quote.LastActor.Type != "agent" || quote.LastActor.ID == nil || *quote.LastActor.ID != agentID {
		t.Fatalf("last_actor = %+v, want type agent with id %s", quote.LastActor, agentID)
	}

	row := agentWriteAudit(t, subjectCreatorQuote, quote.ID, agentID, testUserID)
	if row.Action != subjectCreatorQuote+".created" {
		t.Fatalf("audit action = %q, want %q", row.Action, subjectCreatorQuote+".created")
	}
	before, after := auditDetails(t, row.Details)
	if len(before) != 0 {
		t.Fatalf("create audit carried a before half: %v", before)
	}
	if after["status"] != "draft" || after["valid_until"] != "2026-12-02" {
		t.Fatalf("create audit after = %v, want the created row's status and valid_until", after)
	}

	// The ledger's list annotates the same row with the same actor: the page an
	// operator reads and the trail agree about who wrote it.
	_, listFrame := workbenchMCPCall(t, workbenchToolLedger, map[string]any{
		"domain": "quotes",
		"limit":  workbenchMCPMaxLimit,
	}, "", "")
	var page struct {
		Quotes []struct {
			ID        string              `json:"id"`
			LastActor *WorkbenchLastActor `json:"last_actor"`
		} `json:"quotes"`
	}
	workbenchMCPOK(t, listFrame, &page)
	found := false
	for _, row := range page.Quotes {
		if row.ID != quote.ID {
			continue
		}
		found = true
		if row.LastActor == nil || row.LastActor.Type != "agent" {
			t.Fatalf("ledger last_actor = %+v, want type agent", row.LastActor)
		}
	}
	if !found {
		t.Fatalf("the quote list did not return the agent's quote %s", quote.ID)
	}
}

// TestAgentLogsAFollowUpAndTheTrailSaysAgent is the second whitelisted write: a
// follow-up, with the same audit identity and the same ownership rule.
func TestAgentLogsAFollowUpAndTheTrailSaysAgent(t *testing.T) {
	if testPool == nil {
		t.Skip("handler tests require a reachable DATABASE_URL")
	}

	creator := createWorkbenchCreator(t, testUserID, "Agent follow-up creator")
	agentID, taskID := agentWriteFixture(t)

	_, frame := agentWriteCall(t, workbenchToolLogActivity, map[string]any{
		"creator_id":     creator.ID,
		"kind":           "dm",
		"happened_at":    "2026-11-18T09:30:00Z",
		"summary":        "asked for the rate card",
		"outcome":        "replied",
		"next_follow_at": "2026-11-22T09:00:00Z",
	}, testUserID, agentID, taskID)

	var activity BdActivityResponse
	workbenchMCPOK(t, frame, &activity)
	t.Cleanup(func() { dbfx.Exec(t, `DELETE FROM creator_activity WHERE id = $1`, activity.ID) })
	cleanupWorkbenchAudit(t, subjectCreatorActivity, activity.ID)

	if activity.ID == "" || activity.Kind != "dm" || activity.Outcome == nil || *activity.Outcome != "replied" {
		t.Fatalf("created follow-up = %+v, want a dm with outcome replied", activity)
	}
	if activity.Revision != 1 {
		t.Fatalf("new follow-up revision = %d, want 1", activity.Revision)
	}
	if activity.LastActor == nil || activity.LastActor.Type != "agent" {
		t.Fatalf("last_actor = %+v, want type agent", activity.LastActor)
	}
	row := agentWriteAudit(t, subjectCreatorActivity, activity.ID, agentID, testUserID)
	if row.Action != subjectCreatorActivity+".created" {
		t.Fatalf("audit action = %q, want %q", row.Action, subjectCreatorActivity+".created")
	}
}

// TestAgentAdvancesACollabStage is the third whitelisted write, plus the three
// stage moves the whitelist does not cover: backwards, settled and cancelled.
func TestAgentAdvancesACollabStage(t *testing.T) {
	if testPool == nil {
		t.Skip("handler tests require a reachable DATABASE_URL")
	}

	collab := collabFixture(t, "Agent advance")
	agentID, taskID := agentWriteFixture(t)

	_, frame := agentWriteCall(t, workbenchToolAdvanceStage, map[string]any{
		"collab_id":         collab.ID,
		"stage":             "quoted",
		"expected_revision": collab.Revision,
	}, testUserID, agentID, taskID)

	var advanced CrmCollabResponse
	workbenchMCPOK(t, frame, &advanced)
	if advanced.Stage != "quoted" {
		t.Fatalf("stage after the agent's advance = %q, want quoted", advanced.Stage)
	}
	if advanced.Revision != collab.Revision+1 {
		t.Fatalf("revision = %d, want %d (one bump)", advanced.Revision, collab.Revision+1)
	}
	if advanced.LastActor == nil || advanced.LastActor.Type != "agent" {
		t.Fatalf("last_actor = %+v, want type agent", advanced.LastActor)
	}

	row := agentWriteAudit(t, subjectCrmCollab, collab.ID, agentID, testUserID)
	if row.Action != subjectCrmCollab+".stage_changed" {
		t.Fatalf("audit action = %q, want %q", row.Action, subjectCrmCollab+".stage_changed")
	}
	before, after := auditDetails(t, row.Details)
	if before["stage"] != "inquiry" || after["stage"] != "quoted" {
		t.Fatalf("stage details = %v -> %v, want inquiry -> quoted", before["stage"], after["stage"])
	}

	// Backwards is not "advance".
	_, back := agentWriteCall(t, workbenchToolAdvanceStage, map[string]any{
		"collab_id": collab.ID, "stage": "inquiry",
	}, testUserID, agentID, taskID)
	workbenchMCPRejected(t, back, "only advance")

	// Settling records money; cancelling ends a deal. Both are the human's.
	_, settle := agentWriteCall(t, workbenchToolAdvanceStage, map[string]any{
		"collab_id": collab.ID, "stage": "settled",
	}, testUserID, agentID, taskID)
	workbenchMCPRejected(t, settle, "cannot settle")

	_, cancel := agentWriteCall(t, workbenchToolAdvanceStage, map[string]any{
		"collab_id": collab.ID, "stage": "cancelled",
	}, testUserID, agentID, taskID)
	workbenchMCPRejected(t, cancel, "cannot cancel")
}

// TestAgentWriteNeedsTheDelegatorsAgentDelegate is §6's hard edge: an agent is
// never wider than the member it runs for, and a delegator without `agent.delegate`
// gives it no write channel at all — not even a draft quote.
func TestAgentWriteNeedsTheDelegatorsAgentDelegate(t *testing.T) {
	if testPool == nil {
		t.Skip("handler tests require a reachable DATABASE_URL")
	}

	// A plain member: the seeded 商务 template grants crm.write but deliberately not
	// agent.delegate, which is exactly the case §6 refuses.
	delegator := workbenchTestMember(t)
	creator := createWorkbenchCreator(t, delegator, "No delegation creator")
	agentID, taskID := agentWriteFixture(t)

	_, frame := agentWriteCall(t, workbenchToolCreateQuote, map[string]any{
		"creator_id": creator.ID,
	}, delegator, agentID, taskID)
	workbenchMCPRejected(t, frame, "agent.delegate")

	// Nothing was written: the refusal happens before the ledger runs.
	var quotes int
	if err := testPool.QueryRow(t.Context(),
		`SELECT count(*) FROM creator_quote WHERE creator_id = $1`, creator.ID).Scan(&quotes); err != nil {
		t.Fatalf("count quotes: %v", err)
	}
	if quotes != 0 {
		t.Fatalf("a refused agent write created %d quotes", quotes)
	}
}

// TestAgentCannotAdvanceAnotherMembersRow is the row rule: a row that is neither
// assigned to the agent nor owned by its delegator is not the agent's to move —
// and once the row IS assigned to it, the same call goes through.
func TestAgentCannotAdvanceAnotherMembersRow(t *testing.T) {
	if testPool == nil {
		t.Skip("handler tests require a reachable DATABASE_URL")
	}

	collab := collabFixture(t, "Agent row gate")
	// An admin delegator: it holds agent.delegate, so the row rule is what refuses
	// this call rather than the capability rule.
	delegator := dbfx.User(t, "Agent row gate admin", "wb-agent-row-gate@multica.ai")
	dbfx.Member(t, testWorkspaceID, delegator, "admin")
	agentID, taskID := agentWriteFixture(t)

	_, refused := agentWriteCall(t, workbenchToolAdvanceStage, map[string]any{
		"collab_id": collab.ID, "stage": "quoted",
	}, delegator, agentID, taskID)
	workbenchMCPRejected(t, refused, "assigned to them or owned by")

	// Hand the work to the agent (a member's own write) and the same call is the
	// agent's to make.
	assign := workbenchRequest(t, "PATCH", "/api/workbench/crm/collabs/"+collab.ID, map[string]any{
		"assignee_type": "agent",
		"assignee_id":   agentID,
	}, testUserID)
	testutil.Call(t, testHandler.UpdateCrmCollab,
		withURLParam(assign, "collabId", collab.ID)).Want(http.StatusOK)

	_, allowed := agentWriteCall(t, workbenchToolAdvanceStage, map[string]any{
		"collab_id": collab.ID, "stage": "quoted",
	}, delegator, agentID, taskID)
	var advanced CrmCollabResponse
	workbenchMCPOK(t, allowed, &advanced)
	if advanced.Stage != "quoted" {
		t.Fatalf("stage = %q, want quoted once the row is the agent's", advanced.Stage)
	}
	agentWriteAudit(t, subjectCrmCollab, collab.ID, agentID, delegator)
}

// TestAgentWriteRefusesMoneyOwnershipAndSettlement is the whitelist's other half:
// the three tools have no money, ownership or settlement argument, and asking for
// one is answered with the rule that forbids it.
func TestAgentWriteRefusesMoneyOwnershipAndSettlement(t *testing.T) {
	if testPool == nil {
		t.Skip("handler tests require a reachable DATABASE_URL")
	}

	creator := createWorkbenchCreator(t, testUserID, "Agent refusal creator")
	collab := collabFixture(t, "Agent amount refusal")
	agentID, taskID := agentWriteFixture(t)

	cases := []struct {
		name string
		tool string
		args map[string]any
		want string
	}{
		{
			name: "slot fee",
			tool: workbenchToolCreateQuote,
			args: map[string]any{"creator_id": creator.ID, "fee_amount": 8000},
			want: "slot fee",
		},
		{
			name: "commission rate",
			tool: workbenchToolCreateQuote,
			args: map[string]any{"creator_id": creator.ID, "commission_rate": 0.2},
			want: "commission rate",
		},
		{
			name: "ownership",
			tool: workbenchToolCreateQuote,
			args: map[string]any{"creator_id": creator.ID, "owner_member_id": testUserID},
			want: "ownership",
		},
		{
			name: "assignee",
			tool: workbenchToolLogActivity,
			args: map[string]any{
				"creator_id": creator.ID, "kind": "dm",
				"happened_at": "2026-11-18T09:00:00Z", "summary": "x",
				"assignee_type": "member", "assignee_id": testUserID,
			},
			want: "assignee",
		},
		{
			name: "quoted amount",
			tool: workbenchToolAdvanceStage,
			args: map[string]any{"collab_id": collab.ID, "stage": "quoted", "quote_amount": 10000},
			want: "quoted amount",
		},
		{
			name: "settlement day",
			tool: workbenchToolAdvanceStage,
			args: map[string]any{"collab_id": collab.ID, "stage": "quoted", "settled_on": "2026-11-30"},
			want: "settlement day",
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, frame := agentWriteCall(t, tc.tool, tc.args, testUserID, agentID, taskID)
			reason := workbenchMCPRejected(t, frame, tc.want)
			if !strings.Contains(strings.ToLower(reason), "human") {
				t.Fatalf("refusal does not say whose write it is: %s", reason)
			}
		})
	}

	// None of the six attempts wrote anything.
	var quotes int
	if err := testPool.QueryRow(t.Context(),
		`SELECT count(*) FROM creator_quote WHERE creator_id = $1`, creator.ID).Scan(&quotes); err != nil {
		t.Fatalf("count quotes: %v", err)
	}
	if quotes != 0 {
		t.Fatalf("a refused amount write created %d quotes", quotes)
	}
	unchanged, err := testHandler.Queries.GetCrmCollab(t.Context(), db.GetCrmCollabParams{
		ID: mustUUID(t, collab.ID), WorkspaceID: testWorkspaceUUID(t),
	})
	if err != nil {
		t.Fatalf("read collab: %v", err)
	}
	if unchanged.Stage != "inquiry" {
		t.Fatalf("stage after the refused writes = %q, want inquiry", unchanged.Stage)
	}
}

// TestAgentWriteSurfaceHasNoDeleteTool is the "no delete" half of §6 at the surface
// level: no advertised name deletes anything, and the dispatcher refuses one.
func TestAgentWriteSurfaceHasNoDeleteTool(t *testing.T) {
	if testPool == nil {
		t.Skip("handler tests require a reachable DATABASE_URL")
	}

	for _, tool := range workbenchMCPTools() {
		if strings.Contains(tool.Name, "delete") || strings.Contains(tool.Name, "remove") {
			t.Fatalf("the workbench MCP surface advertises %q; §6 has no delete", tool.Name)
		}
		// No write tool claims a delete it does not have either.
		if isWriteTool(tool.Name) && strings.Contains(tool.Description, "delete a row") {
			t.Fatalf("%s claims a delete it does not have", tool.Name)
		}
	}

	// A name nobody declared is a protocol error, not a tool that quietly does
	// nothing: the model is told it asked for something that does not exist.
	_, frame := workbenchMCPCall(t, "workbench_delete_quote", map[string]any{"quote_id": "x"}, "", "")
	if frame.Error == nil {
		t.Fatalf("an undeclared write name was dispatched: %s", frame.Result)
	}
}

// TestAgentWriteGatesRefuseWithFourOhThree pins the decisions themselves, without a
// database: the same rule the REST surface answers 403 for must not become a silent
// skip just because it now runs inside a tool.
func TestAgentWriteGatesRefuseWithFourOhThree(t *testing.T) {
	agentID := mustUUID(t, "11111111-1111-1111-1111-111111111111")
	delegatorID := mustUUID(t, "22222222-2222-2222-2222-222222222222")
	otherID := mustUUID(t, "33333333-3333-3333-3333-333333333333")
	actor := workbenchActor{Type: "agent", ID: agentID}
	scope := workbenchScope{Member: db.Member{UserID: delegatorID}}

	cases := []struct {
		name       string
		err        error
		wantStatus int
		wantText   string
	}{
		{
			name:       "assignment is enough",
			err:        workbenchAgentRowGate(scope, actor, pgtype.Text{String: "agent", Valid: true}, agentID, otherID),
			wantStatus: 0,
		},
		{
			name:       "the delegator's own row is enough",
			err:        workbenchAgentRowGate(scope, actor, pgtype.Text{String: "member", Valid: true}, otherID, delegatorID),
			wantStatus: 0,
		},
		{
			name:       "someone else's row",
			err:        workbenchAgentRowGate(scope, actor, pgtype.Text{String: "member", Valid: true}, otherID, otherID),
			wantStatus: http.StatusForbidden,
			wantText:   "assigned to them or owned by",
		},
		{
			name:       "a member is not gated by the agent row rule",
			err:        workbenchAgentRowGate(scope, workbenchActor{Type: "member", ID: delegatorID}, pgtype.Text{String: "member", Valid: true}, otherID, otherID),
			wantStatus: 0,
		},
		{
			name:       "settled",
			err:        workbenchAgentStageGate("published", "settled"),
			wantStatus: http.StatusForbidden,
			wantText:   "cannot settle",
		},
		{
			name:       "cancelled",
			err:        workbenchAgentStageGate("published", "cancelled"),
			wantStatus: http.StatusForbidden,
			wantText:   "cannot cancel",
		},
		{
			name:       "backwards",
			err:        workbenchAgentStageGate("confirmed", "quoted"),
			wantStatus: http.StatusForbidden,
			wantText:   "only advance",
		},
		{
			name:       "same stage",
			err:        workbenchAgentStageGate("quoted", "quoted"),
			wantStatus: http.StatusForbidden,
			wantText:   "only advance",
		},
		{
			name:       "forward",
			err:        workbenchAgentStageGate("quoted", "confirmed"),
			wantStatus: 0,
		},
		{
			name:       "out of a cancelled row",
			err:        workbenchAgentStageGate("cancelled", "quoted"),
			wantStatus: http.StatusForbidden,
			wantText:   "may not move",
		},
		{
			name:       "unknown stage",
			err:        workbenchAgentStageGate("quoted", "invoiced"),
			wantStatus: http.StatusBadRequest,
			wantText:   "forward pipeline stages",
		},
		{
			name:       "empty stage",
			err:        workbenchAgentStageGate("quoted", "  "),
			wantStatus: http.StatusBadRequest,
			wantText:   "stage is required",
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if tc.err == nil {
				if tc.wantStatus != 0 {
					t.Fatalf("gate allowed the write, want a %d refusal", tc.wantStatus)
				}
				return
			}
			if got := workbenchAgentWriteStatus(tc.err); got != tc.wantStatus {
				t.Fatalf("status = %d, want %d (%v)", got, tc.wantStatus, tc.err)
			}
			if !strings.Contains(tc.err.Error(), tc.wantText) {
				t.Fatalf("reason = %q, want it to mention %q", tc.err.Error(), tc.wantText)
			}
		})
	}

	// The argument gate is the same shape of refusal, and it names the field.
	err := workbenchAgentArgumentGate(json.RawMessage(`{"fee_amount": 8000}`))
	if workbenchAgentWriteStatus(err) != http.StatusForbidden {
		t.Fatalf("argument gate status = %d, want 403 (%v)", workbenchAgentWriteStatus(err), err)
	}
	if !strings.Contains(err.Error(), "fee_amount") || !strings.Contains(err.Error(), "slot fee") {
		t.Fatalf("argument refusal does not name the field: %v", err)
	}
	// Everything else passes it: the gate speaks only about the fields it knows.
	if err := workbenchAgentArgumentGate(json.RawMessage(`{"creator_id": "x", "note": "y"}`)); err != nil {
		t.Fatalf("argument gate refused a whitelisted argument: %v", err)
	}
}

// isWriteTool reports whether name is one of §6's three writes.
func isWriteTool(name string) bool {
	switch name {
	case workbenchToolCreateQuote, workbenchToolLogActivity, workbenchToolAdvanceStage:
		return true
	}
	return false
}

// mustUUID parses a fixture id, failing the test rather than panicking.
func mustUUID(t *testing.T, raw string) pgtype.UUID {
	t.Helper()
	parsed, err := util.ParseUUID(raw)
	if err != nil {
		t.Fatalf("fixture uuid %q: %v", raw, err)
	}
	return parsed
}

// testWorkspaceUUID resolves the suite's workspace once per test that needs it as
// a UUID. It cannot be a package-level initializer: TestMain is what assigns
// testWorkspaceID.
func testWorkspaceUUID(t *testing.T) pgtype.UUID {
	t.Helper()
	return mustUUID(t, testWorkspaceID)
}
