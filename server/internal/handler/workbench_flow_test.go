package handler

// The workbench queue and its discussion anchor (docs/engineering/COLLAB-MODEL.md
// §4/§5, batch B4-2 + B4-3).
//
// What is pinned here, in the order the two batches ship:
//
//   - `?assignee=me` is the *actor*, not the member: a request carrying
//     `X-Agent-ID`/`X-Task-ID` reads the agent's queue, and a bare uuid filters on
//     the id alone. A misspelled value is a 400, never a silently wider list.
//   - The due scan writes one notice per subject per day, to the assignee (member
//     or agent), and writes none for a row nobody was handed.
//   - `POST .../thread` is idempotent: the second call answers the first call's
//     issue, whether the ledger row carries the pointer (`crm_collab`) or only the
//     origin stamp (`creator_quote`), and a discussion whose issue was deleted is
//     reported as gone rather than 404ing the row.
//
// The suite's database is shared with every other package, so nothing here
// asserts on a count of rows the scan returned - only on the rows about *this
// test's* subjects (AGENTS.md, Testing).

import (
	"context"
	"net/http"
	"testing"

	"github.com/jerry-halo2026/morchat.co/server/internal/testutil"
)

// flowInboxRow is one notice about one ledger row.
type flowInboxRow struct {
	RecipientType string
	RecipientID   string
	Type          string
	Severity      string
	Section       string
	Title         string
	Details       string
}

func flowInboxForSubject(t *testing.T, subjectType, subjectID string) []flowInboxRow {
	t.Helper()
	rows, err := testPool.Query(context.Background(), `
		SELECT recipient_type, recipient_id::text, type, severity, coalesce(section, ''), title, details::text
		FROM inbox_item
		WHERE workspace_id = $1
		  AND details->>'subject_type' = $2
		  AND details->>'subject_id' = $3
		ORDER BY created_at DESC, id DESC`, testWorkspaceID, subjectType, subjectID)
	if err != nil {
		t.Fatalf("read inbox rows for %s/%s: %v", subjectType, subjectID, err)
	}
	defer rows.Close()
	out := []flowInboxRow{}
	for rows.Next() {
		var row flowInboxRow
		if err := rows.Scan(&row.RecipientType, &row.RecipientID, &row.Type, &row.Severity,
			&row.Section, &row.Title, &row.Details); err != nil {
			t.Fatalf("scan inbox row: %v", err)
		}
		out = append(out, row)
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("read inbox rows: %v", err)
	}
	return out
}

func cleanupFlowInbox(t *testing.T, subjectType, subjectID string) {
	t.Helper()
	t.Cleanup(func() {
		_, _ = testPool.Exec(context.Background(),
			`DELETE FROM inbox_item
			 WHERE details->>'subject_type' = $1 AND details->>'subject_id' = $2`,
			subjectType, subjectID)
	})
}

// flowSetAssignee patches one ledger row's assignee straight through SQL: the
// point of the queue tests is the read side, and the write side already has its
// own cases.
func flowSetAssignee(t *testing.T, table, id, assigneeType, assigneeID string) {
	t.Helper()
	if assigneeType == "" {
		dbfx.Exec(t, `UPDATE `+table+` SET assignee_type = NULL, assignee_id = NULL WHERE id = $1`, id)
		return
	}
	dbfx.Exec(t, `UPDATE `+table+` SET assignee_type = $2, assignee_id = $3 WHERE id = $1`,
		id, assigneeType, assigneeID)
}

// listIDs pulls the row ids out of a list response body, whatever the ledger.
func listIDs(t *testing.T, body map[string]any, key string) []string {
	t.Helper()
	raw, ok := body[key].([]any)
	if !ok {
		t.Fatalf("list body has no %q array: %v", key, body)
	}
	out := make([]string, 0, len(raw))
	for _, item := range raw {
		row, ok := item.(map[string]any)
		if !ok {
			t.Fatalf("%s entry is not an object: %v", key, item)
		}
		if id, ok := row["id"].(string); ok {
			out = append(out, id)
		}
	}
	return out
}

func containsID(ids []string, want string) bool {
	for _, id := range ids {
		if id == want {
			return true
		}
	}
	return false
}

// TestWorkbenchAssigneeFilterResolvesTheActor covers §4's queue parameter on all
// four ledgers, including the agent case B4-1 made possible.
func TestWorkbenchAssigneeFilterResolvesTheActor(t *testing.T) {
	owner := testUserID
	memberUserID := workbenchTestMember(t)
	runtimeID := dbfx.Runtime(t, "Queue fixture runtime")
	agentID := dbfx.Agent(t, "Queue fixture agent", runtimeID)
	taskID := dbfx.Task(t, agentID, testutil.Cols{
		"issue_id":   dbfx.Issue(t, "queue assignee fixture"),
		"runtime_id": runtimeID,
	})

	creator := createWorkbenchCreator(t, owner, "Queue assignee creator")
	client := createWorkbenchClient(t, owner, "Queue assignee client")
	brief := createWorkbenchBrief(t, client.ID, "Queue assignee brief")

	mine := createWorkbenchCollab(t, brief.ID, creator.ID, nil)
	theirs := createWorkbenchCollab(t, brief.ID, creator.ID, nil)
	agents := createWorkbenchCollab(t, brief.ID, creator.ID, nil)
	flowSetAssignee(t, "crm_collab", mine.ID, "member", owner)
	flowSetAssignee(t, "crm_collab", theirs.ID, "member", memberUserID)
	flowSetAssignee(t, "crm_collab", agents.ID, "agent", agentID)

	quote := bdCreateQuote(t, "", owner, creator.ID, nil)
	flowSetAssignee(t, "creator_quote", quote.ID, "member", memberUserID)

	activity := bdCreateActivity(t, "", owner, creator.ID, nil)
	flowSetAssignee(t, "creator_activity", activity.ID, "member", memberUserID)

	settlementReq := workbenchRequest(t, "POST", "/api/workbench/crm/settlements", map[string]any{
		"collab_id": mine.ID,
		"kind":      "final",
		"amount":    1200,
	}, owner)
	settlement := testutil.Decode[CrmSettlementResponse](t, testHandler.CreateCrmSettlement,
		settlementReq, http.StatusCreated)
	t.Cleanup(func() { dbfx.Exec(t, `DELETE FROM crm_settlement WHERE id = $1`, settlement.ID) })
	flowSetAssignee(t, "crm_settlement", settlement.ID, "member", memberUserID)

	// The owner's own queue: the row assigned to them, and not the two assigned to
	// somebody else.
	req := workbenchRequest(t, "GET", "/api/workbench/crm/collabs?assignee=me&limit=200", nil, owner)
	body := testutil.Call(t, testHandler.ListCrmCollabs, req).Want(http.StatusOK).Map()
	ownerQueue := listIDs(t, body, "collabs")
	if !containsID(ownerQueue, mine.ID) {
		t.Fatalf("owner queue = %v, want the row assigned to the owner", ownerQueue)
	}
	if containsID(ownerQueue, theirs.ID) || containsID(ownerQueue, agents.ID) {
		t.Fatalf("owner queue leaked rows assigned elsewhere: %v", ownerQueue)
	}

	// The same call as the agent: `me` is the agent, because that is who ran it.
	agentReq := workbenchRequest(t, "GET", "/api/workbench/crm/collabs?assignee=me&limit=200", nil, owner)
	agentReq.Header.Set("X-Agent-ID", agentID)
	agentReq.Header.Set("X-Task-ID", taskID)
	agentBody := testutil.Call(t, testHandler.ListCrmCollabs, agentReq).Want(http.StatusOK).Map()
	agentQueue := listIDs(t, agentBody, "collabs")
	if !containsID(agentQueue, agents.ID) {
		t.Fatalf("agent queue = %v, want the row assigned to the agent", agentQueue)
	}
	if containsID(agentQueue, mine.ID) || containsID(agentQueue, theirs.ID) {
		t.Fatalf("agent queue leaked a member's rows: %v", agentQueue)
	}

	// A bare uuid filters on the id alone.
	memberReq := workbenchRequest(t, "GET",
		"/api/workbench/crm/collabs?assignee="+memberUserID+"&limit=200", nil, owner)
	memberBody := testutil.Call(t, testHandler.ListCrmCollabs, memberReq).Want(http.StatusOK).Map()
	memberQueue := listIDs(t, memberBody, "collabs")
	if !containsID(memberQueue, theirs.ID) || containsID(memberQueue, mine.ID) {
		t.Fatalf("?assignee=<uuid> queue = %v, want only the member's row", memberQueue)
	}

	// The other three ledgers honour the same parameter.
	quoteReq := workbenchRequest(t, "GET", "/api/workbench/bd/quotes?assignee="+memberUserID, nil, owner)
	quoteBody := testutil.Call(t, testHandler.ListBdQuotes, quoteReq).Want(http.StatusOK).Map()
	quoteIDs := listIDs(t, quoteBody, "quotes")
	if !containsID(quoteIDs, quote.ID) {
		t.Fatalf("quote queue = %v, want the quote assigned to the member", quoteIDs)
	}

	activityReq := workbenchRequest(t, "GET", "/api/workbench/bd/activities?assignee=me", nil, memberUserID)
	activityBody := testutil.Call(t, testHandler.ListBdActivities, activityReq).Want(http.StatusOK).Map()
	activityIDs := listIDs(t, activityBody, "activities")
	if !containsID(activityIDs, activity.ID) {
		t.Fatalf("activity queue = %v, want the follow-up assigned to the member", activityIDs)
	}

	settlementListReq := workbenchRequest(t, "GET",
		"/api/workbench/crm/settlements?assignee="+memberUserID, nil, owner)
	settlementBody := testutil.Call(t, testHandler.ListCrmSettlements, settlementListReq).Want(http.StatusOK).Map()
	settlementIDs := listIDs(t, settlementBody, "settlements")
	if !containsID(settlementIDs, settlement.ID) {
		t.Fatalf("settlement queue = %v, want the settlement assigned to the member", settlementIDs)
	}

	// A value that is neither `me` nor a uuid is a 400: a queue that widens on a
	// typo is worse than one that refuses.
	badReq := workbenchRequest(t, "GET", "/api/workbench/crm/collabs?assignee=maybe", nil, owner)
	testutil.Call(t, testHandler.ListCrmCollabs, badReq).Want(http.StatusBadRequest)
}

// TestWorkbenchDueScanWritesOneNoticePerSubjectPerDay covers §4's scan: the
// recipient is the assignee, the day's second run inserts nothing, and a row
// nobody was handed gets no notice at all.
func TestWorkbenchDueScanWritesOneNoticePerSubjectPerDay(t *testing.T) {
	memberUserID := workbenchTestMember(t)
	runtimeID := dbfx.Runtime(t, "Due scan runtime")
	agentID := dbfx.Agent(t, "Due scan agent", runtimeID)

	creator := createWorkbenchCreator(t, testUserID, "Due scan creator")
	client := createWorkbenchClient(t, testUserID, "Due scan client")
	brief := createWorkbenchBrief(t, client.ID, "Due scan brief")

	dueActivity := bdCreateActivity(t, "", testUserID, creator.ID, map[string]any{
		"next_follow_at": "2026-11-01T09:00:00Z",
	})
	flowSetAssignee(t, "creator_activity", dueActivity.ID, "member", memberUserID)
	cleanupFlowInbox(t, subjectCreatorActivity, dueActivity.ID)

	unassigned := bdCreateActivity(t, "", testUserID, creator.ID, map[string]any{
		"next_follow_at": "2026-11-01T09:00:00Z",
	})
	flowSetAssignee(t, "creator_activity", unassigned.ID, "", "")
	cleanupFlowInbox(t, subjectCreatorActivity, unassigned.ID)

	expiring := bdCreateQuote(t, "", testUserID, creator.ID, map[string]any{
		"status":      "sent",
		"quoted_at":   "2026-11-10T09:00:00Z",
		"valid_until": "2026-11-22",
	})
	flowSetAssignee(t, "creator_quote", expiring.ID, "agent", agentID)
	cleanupFlowInbox(t, subjectCreatorQuote, expiring.ID)

	overdue := createWorkbenchCollab(t, brief.ID, creator.ID, map[string]any{
		"stage":        "confirmed",
		"settled_on":   "2026-11-01",
		"final_amount": 5000,
	})
	flowSetAssignee(t, "crm_collab", overdue.ID, "member", memberUserID)
	cleanupFlowInbox(t, subjectCrmCollab, overdue.ID)

	scheduler := NewWorkbenchDueScheduler(testHandler.Queries, DefaultWorkbenchDueInterval, nil)
	if _, err := scheduler.FlushNow(context.Background()); err != nil {
		t.Fatalf("first due scan: %v", err)
	}

	due := flowInboxForSubject(t, subjectCreatorActivity, dueActivity.ID)
	if len(due) != 1 {
		t.Fatalf("follow-up notices = %d, want 1", len(due))
	}
	if due[0].Type != "workbench.followup_due" || due[0].Section != "workbench" {
		t.Fatalf("follow-up notice = type %q section %q, want workbench.followup_due/workbench",
			due[0].Type, due[0].Section)
	}
	if due[0].Severity != "action_required" {
		t.Fatalf("follow-up severity = %q, want action_required", due[0].Severity)
	}
	if due[0].RecipientType != "member" || due[0].RecipientID != memberUserID {
		t.Fatalf("follow-up recipient = %s/%s, want member/%s",
			due[0].RecipientType, due[0].RecipientID, memberUserID)
	}

	quoteNotices := flowInboxForSubject(t, subjectCreatorQuote, expiring.ID)
	if len(quoteNotices) != 1 || quoteNotices[0].Type != "workbench.quote_expiring" {
		t.Fatalf("quote notices = %+v, want one workbench.quote_expiring", quoteNotices)
	}
	// The agent is a recipient like a person: the notice follows the assignee.
	if quoteNotices[0].RecipientType != "agent" || quoteNotices[0].RecipientID != agentID {
		t.Fatalf("quote recipient = %s/%s, want agent/%s",
			quoteNotices[0].RecipientType, quoteNotices[0].RecipientID, agentID)
	}

	settlementNotices := flowInboxForSubject(t, subjectCrmCollab, overdue.ID)
	if len(settlementNotices) != 1 || settlementNotices[0].Type != "workbench.settlement_overdue" {
		t.Fatalf("settlement notices = %+v, want one workbench.settlement_overdue", settlementNotices)
	}

	// A row with no assignee has no recipient, so it has no notice.
	if unassignedNotices := flowInboxForSubject(t, subjectCreatorActivity, unassigned.ID); len(unassignedNotices) != 0 {
		t.Fatalf("an unassigned follow-up produced %d notices, want none", len(unassignedNotices))
	}

	// The second scan of the same day inserts nothing: the key is
	// (subject_type, subject_id, type, today).
	if _, err := scheduler.FlushNow(context.Background()); err != nil {
		t.Fatalf("second due scan: %v", err)
	}
	for _, check := range []struct{ subjectType, subjectID string }{
		{subjectCreatorActivity, dueActivity.ID},
		{subjectCreatorQuote, expiring.ID},
		{subjectCrmCollab, overdue.ID},
	} {
		if rows := flowInboxForSubject(t, check.subjectType, check.subjectID); len(rows) != 1 {
			t.Fatalf("%s/%s has %d notices after two scans, want 1",
				check.subjectType, check.subjectID, len(rows))
		}
	}
}

// TestWorkbenchThreadIsIdempotentAndSurvivesDeletion covers §5: one issue per
// ledger row, the ledger row shows the discussion's size, and a deleted discussion
// reads as `gone` instead of taking the row down with it.
func TestWorkbenchThreadIsIdempotentAndSurvivesDeletion(t *testing.T) {
	memberUserID := workbenchTestMember(t)
	creator := createWorkbenchCreator(t, testUserID, "Thread fixture creator")
	client := createWorkbenchClient(t, testUserID, "Thread fixture client")
	brief := createWorkbenchBrief(t, client.ID, "Thread fixture brief")
	collab := createWorkbenchCollab(t, brief.ID, creator.ID, nil)

	req := workbenchRequest(t, "POST", "/api/workbench/crm/collabs/"+collab.ID+"/thread", nil, testUserID)
	first := testutil.Decode[WorkbenchThread](t, testHandler.CreateCrmCollabThread,
		withURLParam(req, "collabId", collab.ID), http.StatusCreated)
	t.Cleanup(func() {
		_, _ = testPool.Exec(context.Background(), `DELETE FROM issue WHERE id = $1`, first.IssueID)
	})
	if first.State != workbenchThreadLinked {
		t.Fatalf("new thread state = %q, want linked", first.State)
	}
	if first.CommentCount != 0 {
		t.Fatalf("new thread comment count = %d, want 0", first.CommentCount)
	}

	// The issue is stamped with the ledger's business name and the row's id, and
	// the ledger row points at it.
	if n := dbfx.Count(t,
		`SELECT count(*) FROM issue WHERE workspace_id = $1 AND origin_type = 'crm_collab' AND origin_id = $2`,
		testWorkspaceID, collab.ID); n != 1 {
		t.Fatalf("issues stamped for the collab = %d, want 1", n)
	}
	req = workbenchRequest(t, "GET", "/api/workbench/crm/collabs/"+collab.ID, nil, testUserID)
	withThread := testutil.Decode[CrmCollabWithThread](t, testHandler.GetCrmCollab,
		withURLParam(req, "collabId", collab.ID), http.StatusOK)
	if withThread.Thread == nil || withThread.Thread.IssueID != first.IssueID {
		t.Fatalf("collab thread = %+v, want the issue just opened", withThread.Thread)
	}

	// The second call answers the first call's issue and mints nothing.
	req = workbenchRequest(t, "POST", "/api/workbench/crm/collabs/"+collab.ID+"/thread", nil, testUserID)
	second := testutil.Decode[WorkbenchThread](t, testHandler.CreateCrmCollabThread,
		withURLParam(req, "collabId", collab.ID), http.StatusOK)
	if second.IssueID != first.IssueID {
		t.Fatalf("second thread open answered %s, want the same issue %s", second.IssueID, first.IssueID)
	}
	if n := dbfx.Count(t,
		`SELECT count(*) FROM issue WHERE workspace_id = $1 AND origin_type = 'crm_collab' AND origin_id = $2`,
		testWorkspaceID, collab.ID); n != 1 {
		t.Fatalf("issues stamped for the collab after two opens = %d, want 1", n)
	}

	// A comment on the issue is what the ledger row counts.
	dbfx.Comment(t, first.IssueID, "how is this settled?")
	req = workbenchRequest(t, "GET", "/api/workbench/crm/collabs/"+collab.ID, nil, testUserID)
	read := testutil.Decode[CrmCollabWithThread](t, testHandler.GetCrmCollab,
		withURLParam(req, "collabId", collab.ID), http.StatusOK)
	if read.Thread == nil || read.Thread.CommentCount != 1 {
		t.Fatalf("thread after one comment = %+v, want comment_count 1", read.Thread)
	}
	if read.Thread.LastCommentPreview == nil || *read.Thread.LastCommentPreview != "how is this settled?" {
		t.Fatalf("thread preview = %v, want the comment's text", read.Thread.LastCommentPreview)
	}

	// A member who cannot write the row cannot open its discussion.
	memberReq := workbenchRequest(t, "POST", "/api/workbench/crm/collabs/"+collab.ID+"/thread", nil, memberUserID)
	testutil.Call(t, testHandler.CreateCrmCollabThread,
		withURLParam(memberReq, "collabId", collab.ID)).Want(http.StatusForbidden)

	// The discussion is deleted; the collaboration is not. The row still reads, and
	// says the discussion is gone instead of failing.
	if _, err := testPool.Exec(context.Background(), `DELETE FROM issue WHERE id = $1`, first.IssueID); err != nil {
		t.Fatalf("delete the discussion issue: %v", err)
	}
	req = workbenchRequest(t, "GET", "/api/workbench/crm/collabs/"+collab.ID, nil, testUserID)
	after := testutil.Decode[CrmCollabWithThread](t, testHandler.GetCrmCollab,
		withURLParam(req, "collabId", collab.ID), http.StatusOK)
	if after.Thread == nil || after.Thread.State != workbenchThreadGone {
		t.Fatalf("thread after the issue was deleted = %+v, want state gone", after.Thread)
	}
	if after.ID != collab.ID {
		t.Fatalf("collab read after thread deletion = %s, want %s", after.ID, collab.ID)
	}
}

// TestWorkbenchQuoteThreadIsIdempotentByOrigin covers the ledger that carries no
// pointer column: idempotency is answered entirely by (origin_type, origin_id).
func TestWorkbenchQuoteThreadIsIdempotentByOrigin(t *testing.T) {
	creator := createWorkbenchCreator(t, testUserID, "Quote thread creator")
	quote := bdCreateQuote(t, "", testUserID, creator.ID, nil)

	req := workbenchRequest(t, "POST", "/api/workbench/bd/quotes/"+quote.ID+"/thread", nil, testUserID)
	first := testutil.Decode[WorkbenchThread](t, testHandler.CreateBdQuoteThread,
		withURLParam(req, "quoteId", quote.ID), http.StatusCreated)
	t.Cleanup(func() {
		_, _ = testPool.Exec(context.Background(), `DELETE FROM issue WHERE id = $1`, first.IssueID)
	})

	req = workbenchRequest(t, "POST", "/api/workbench/bd/quotes/"+quote.ID+"/thread", nil, testUserID)
	second := testutil.Decode[WorkbenchThread](t, testHandler.CreateBdQuoteThread,
		withURLParam(req, "quoteId", quote.ID), http.StatusOK)
	if second.IssueID != first.IssueID {
		t.Fatalf("second quote thread open answered %s, want %s", second.IssueID, first.IssueID)
	}
	if n := dbfx.Count(t,
		`SELECT count(*) FROM issue WHERE workspace_id = $1 AND origin_type = 'creator_quote' AND origin_id = $2`,
		testWorkspaceID, quote.ID); n != 1 {
		t.Fatalf("issues stamped for the quote = %d, want 1", n)
	}

	// The quote list finds the discussion by that stamp.
	req = workbenchRequest(t, "GET", "/api/workbench/bd/quotes", nil, testUserID)
	body := testutil.Call(t, testHandler.ListBdQuotes, req).Want(http.StatusOK).Map()
	raw, _ := body["quotes"].([]any)
	var found bool
	for _, item := range raw {
		row, ok := item.(map[string]any)
		if !ok || row["id"] != quote.ID {
			continue
		}
		found = true
		thread, ok := row["thread"].(map[string]any)
		if !ok || thread["issue_id"] != first.IssueID {
			t.Fatalf("quote row thread = %v, want issue %s", row["thread"], first.IssueID)
		}
	}
	if !found {
		t.Fatalf("the quote is missing from its own list")
	}
}
