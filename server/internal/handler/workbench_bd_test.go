package handler

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/jerry-halo2026/morchat.co/server/internal/testutil"
)

// BD pipeline tests (docs/engineering/WORKBENCH-API.md §20): the follow-up log,
// the quote ledger, collection campaigns and the cockpit aggregate.
//
// Two kinds of workspace appear below:
//
//   - the suite's shared workspace, for the cases that only need a row and a
//     permission answer (ordering, validation, the member write gate);
//   - a throwaway workspace for anything that counts rows. The aggregate cases
//     assert exact numbers, and the shared workspace already holds creators made
//     by other suites — a `total` read there would be a number nobody controls.
//
// Response compatibility matters as much as the writes: every field the client
// parses goes through a zod schema, and a renamed key would degrade silently
// there (`parseWithFallback`), so the assertions name the JSON keys the contract
// documents rather than the Go field names.

// bdRequestIn builds a request against a specific workspace. Empty workspaceID
// means "the shared one this suite is set up as".
func bdRequestIn(t *testing.T, method, path, workspaceID string, body any, userID string) *http.Request {
	t.Helper()
	req := workbenchRequest(t, method, path, body, userID)
	if workspaceID != "" {
		req.Header.Set("X-Workspace-ID", workspaceID)
	}
	return req
}

// bdScratchWorkspace creates a workspace with its own owner and nothing else in
// it, so an aggregate read has exactly the rows this test put there.
func bdScratchWorkspace(t *testing.T, name string) (workspaceID, ownerUserID string) {
	t.Helper()
	slug := strings.NewReplacer("_", "-", "/", "-").Replace(strings.ToLower(t.Name()))
	workspaceID = dbfx.Workspace(t, name, slug)
	ownerUserID = dbfx.User(t, "BD Owner", fmt.Sprintf("bd-owner-%s@multica.ai", slug))
	dbfx.Member(t, workspaceID, ownerUserID, "owner")
	return workspaceID, ownerUserID
}

// bdDBNow reads the database clock. Timestamps the tests are compared against are
// built from it rather than from the test process's clock, so a rounding
// difference between the two cannot move a row across a day boundary.
func bdDBNow(t *testing.T) time.Time {
	t.Helper()
	var now time.Time
	if err := testPool.QueryRow(context.Background(), `SELECT now()`).Scan(&now); err != nil {
		t.Fatalf("read database clock: %v", err)
	}
	return now
}

// bdCreateCreator creates a creator in workspaceID through the handler, so the
// row has whatever defaults the real write path applies.
func bdCreateCreator(t *testing.T, workspaceID, userID, displayName string) CreatorResponse {
	t.Helper()
	req := bdRequestIn(t, "POST", "/api/workbench/creators", workspaceID, map[string]any{
		"kind":         "external",
		"display_name": displayName,
		"platform":     "douyin",
		"handle":       strings.NewReplacer(" ", "-").Replace(strings.ToLower(displayName)),
	}, userID)
	created := testutil.Decode[CreatorResponse](t, testHandler.CreateCreator, req, http.StatusCreated)
	t.Cleanup(func() { dbfx.Exec(t, `DELETE FROM creator WHERE id = $1`, created.ID) })
	return created
}

// bdCreateActivity posts one follow-up. `body` overrides the defaults, which are
// a plain DM that happened last week.
func bdCreateActivity(t *testing.T, workspaceID, userID, creatorID string, body map[string]any) BdActivityResponse {
	t.Helper()
	payload := map[string]any{
		"creator_id":  creatorID,
		"kind":        "dm",
		"happened_at": "2026-11-10T09:00:00Z",
		"summary":     "第一次私信，问了报价区间",
	}
	for key, value := range body {
		payload[key] = value
	}
	req := bdRequestIn(t, "POST", "/api/workbench/bd/activities", workspaceID, payload, userID)
	created := testutil.Decode[BdActivityResponse](t, testHandler.CreateBdActivity, req, http.StatusCreated)
	t.Cleanup(func() { dbfx.Exec(t, `DELETE FROM creator_activity WHERE id = $1`, created.ID) })
	return created
}

// bdCreateQuote posts one offer.
func bdCreateQuote(t *testing.T, workspaceID, userID, creatorID string, body map[string]any) BdQuoteResponse {
	t.Helper()
	payload := map[string]any{
		"creator_id": creatorID,
		"status":     "sent",
		"quoted_at":  "2026-11-10T09:00:00Z",
	}
	for key, value := range body {
		payload[key] = value
	}
	req := bdRequestIn(t, "POST", "/api/workbench/bd/quotes", workspaceID, payload, userID)
	created := testutil.Decode[BdQuoteResponse](t, testHandler.CreateBdQuote, req, http.StatusCreated)
	t.Cleanup(func() { dbfx.Exec(t, `DELETE FROM creator_quote WHERE id = $1`, created.ID) })
	return created
}

// bdCreateCampaign posts one collection batch.
func bdCreateCampaign(t *testing.T, workspaceID, userID string, body map[string]any) BdCampaignResponse {
	t.Helper()
	payload := map[string]any{"name": "乌龙茶 11 月", "kind": "search"}
	for key, value := range body {
		payload[key] = value
	}
	req := bdRequestIn(t, "POST", "/api/workbench/bd/campaigns", workspaceID, payload, userID)
	created := testutil.Decode[BdCampaignResponse](t, testHandler.CreateBdCampaign, req, http.StatusCreated)
	t.Cleanup(func() { dbfx.Exec(t, `DELETE FROM creator_campaign WHERE id = $1`, created.ID) })
	return created
}

// bdScratchCollab builds the client → brief → collaboration chain a cockpit case
// needs. There is no `creator_order`: the collaboration is `crm_collab` (§20.1).
func bdScratchCollab(t *testing.T, workspaceID, userID, creatorID, stage string, finalAmount float64) CrmCollabResponse {
	t.Helper()
	clientReq := bdRequestIn(t, "POST", "/api/workbench/crm/clients", workspaceID,
		map[string]any{"name": "BD cockpit client"}, userID)
	client := testutil.Decode[CrmClientResponse](t, testHandler.CreateCrmClient, clientReq, http.StatusCreated)
	t.Cleanup(func() { dbfx.Exec(t, `DELETE FROM crm_client WHERE id = $1`, client.ID) })

	briefReq := bdRequestIn(t, "POST", "/api/workbench/crm/briefs", workspaceID,
		map[string]any{"client_id": client.ID, "title": "BD cockpit brief"}, userID)
	brief := testutil.Decode[CrmBriefResponse](t, testHandler.CreateCrmBrief, briefReq, http.StatusCreated)
	t.Cleanup(func() { dbfx.Exec(t, `DELETE FROM crm_brief WHERE id = $1`, brief.ID) })

	collabReq := bdRequestIn(t, "POST", "/api/workbench/crm/collabs", workspaceID, map[string]any{
		"brief_id":     brief.ID,
		"creator_id":   creatorID,
		"stage":        stage,
		"final_amount": finalAmount,
		"creator_fee":  4000,
	}, userID)
	collab := testutil.Decode[CrmCollabResponse](t, testHandler.CreateCrmCollab, collabReq, http.StatusCreated)
	t.Cleanup(func() { dbfx.Exec(t, `DELETE FROM crm_collab WHERE id = $1`, collab.ID) })
	return collab
}

// bdPipeline reads the cockpit for one workspace.
func bdPipeline(t *testing.T, workspaceID, userID string) BdPipelineResponse {
	t.Helper()
	req := bdRequestIn(t, "GET", "/api/workbench/bd/pipeline", workspaceID, nil, userID)
	return testutil.Decode[BdPipelineResponse](t, testHandler.GetBdPipeline, req, http.StatusOK)
}

// bdValue unwraps a counter, failing when the field came back empty: a counter
// has no "not computable" state, so a null there is a bug rather than a state.
func bdValue(t *testing.T, field string, entry WorkbenchMetricValue) float64 {
	t.Helper()
	if entry.Value == nil {
		t.Fatalf("%s = null (empty=%q), want a number", field, entry.Empty)
	}
	return *entry.Value
}

// ① The follow-up ledger reads `happened_at DESC`, not insertion order.
func TestBdActivitiesOrderByHappenedAt(t *testing.T) {
	memberUserID := workbenchTestMember(t)
	creator := createWorkbenchCreator(t, testUserID, "BD ordering creator")

	// Posted oldest-last, so a `created_at DESC` read would return them in the
	// opposite order and the assertion would catch it.
	newest := bdCreateActivity(t, "", testUserID, creator.ID, map[string]any{
		"happened_at": "2026-11-14T09:00:00Z", "summary": "第三次：确认了坑位费",
	})
	middle := bdCreateActivity(t, "", testUserID, creator.ID, map[string]any{
		"happened_at": "2026-11-12T09:00:00Z", "summary": "第二次：发了案例",
	})
	oldest := bdCreateActivity(t, "", testUserID, creator.ID, map[string]any{
		"happened_at": "2026-11-08T09:00:00Z", "summary": "第一次：打了招呼",
	})
	if newest.ID == middle.ID || middle.ID == oldest.ID {
		t.Fatal("fixture ids collided")
	}

	req := bdRequestIn(t, "GET", "/api/workbench/bd/activities?creator_id="+creator.ID, "", nil, memberUserID)
	var list struct {
		Activities []BdActivityResponse `json:"activities"`
		Total      int                  `json:"total"`
	}
	testutil.Call(t, testHandler.ListBdActivities, req).Want(http.StatusOK).JSON(&list)

	var got []string
	for _, row := range list.Activities {
		got = append(got, row.ID)
	}
	want := []string{newest.ID, middle.ID, oldest.ID}
	if len(got) != len(want) {
		t.Fatalf("follow-ups = %d rows (%v), want %d", len(got), got, len(want))
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("follow-up order = %v, want %v (happened_at DESC)", got, want)
		}
	}
	// A member reads another owner's follow-ups: the ledger is not an ACL.
	if list.Activities[0].OwnerMemberID == nil || *list.Activities[0].OwnerMemberID != testUserID {
		t.Fatalf("owner_member_id = %v, want %s", list.Activities[0].OwnerMemberID, testUserID)
	}
}

// ② `commission_rate` is a 0–1 ratio: 20 is not 20%, it is 2000%.
func TestBdQuoteRejectsPercentCommissionRate(t *testing.T) {
	creator := createWorkbenchCreator(t, testUserID, "BD commission creator")

	req := bdRequestIn(t, "POST", "/api/workbench/bd/quotes", "", map[string]any{
		"creator_id":      creator.ID,
		"status":          "sent",
		"quoted_at":       "2026-11-10T09:00:00Z",
		"commission_rate": 20,
	}, testUserID)
	testutil.Call(t, testHandler.CreateBdQuote, req).Want(http.StatusBadRequest)

	// The ratio form is accepted, and it round-trips at the storage scale.
	quote := bdCreateQuote(t, "", testUserID, creator.ID, map[string]any{
		"commission_rate": 0.2, "fee_amount": 3000,
	})
	if quote.CommissionRate == nil || *quote.CommissionRate != 0.2 {
		t.Fatalf("commission_rate = %v, want 0.2", quote.CommissionRate)
	}
	if quote.Currency != "CNY" {
		t.Fatalf("currency = %q, want the CNY default", quote.Currency)
	}
	if string(quote.Items) != "[]" {
		t.Fatalf("items = %s, want the empty array default", quote.Items)
	}
}

// ③ An offer that expired before it was made is a typo, not a business state.
//
// The case is settled as a 400 rather than "allowed, plus a warning field", and
// the reason lives with the rule (bdQuoteWindowOK): `valid_until` is the only
// column that answers "could this offer still be accepted on day X", and every
// reader takes it at face value. A warning would have to be re-echoed by every
// read that touches the quote, which is a second copy of the rule in every
// consumer — and until somebody reads the warning, the ledger answers a question
// about day X with a row nobody could have accepted.
func TestBdQuoteRejectsExpiryBeforeQuote(t *testing.T) {
	creator := createWorkbenchCreator(t, testUserID, "BD window creator")

	req := bdRequestIn(t, "POST", "/api/workbench/bd/quotes", "", map[string]any{
		"creator_id":  creator.ID,
		"status":      "sent",
		"quoted_at":   "2026-11-10T09:00:00Z",
		"valid_until": "2026-11-01",
	}, testUserID)
	testutil.Call(t, testHandler.CreateBdQuote, req).Want(http.StatusBadRequest)

	// The same day is fine: an offer made and expiring on the same date expired at
	// the end of that day, not before it was sent.
	quote := bdCreateQuote(t, "", testUserID, creator.ID, map[string]any{
		"quoted_at":   "2026-11-10T09:00:00Z",
		"valid_until": "2026-11-10",
	})
	if quote.ValidUntil == nil || *quote.ValidUntil != "2026-11-10" {
		t.Fatalf("valid_until = %v, want 2026-11-10", quote.ValidUntil)
	}

	// Moving `quoted_at` past a stored `valid_until` is the same typo, and it only
	// needs one field in the body: the check runs on the merged row.
	req = bdRequestIn(t, "PATCH", "/api/workbench/bd/quotes/"+quote.ID, "", map[string]any{
		"quoted_at": "2026-12-01T09:00:00Z",
	}, testUserID)
	req = withURLParam(req, "quoteId", quote.ID)
	testutil.Call(t, testHandler.UpdateBdQuote, req).Want(http.StatusBadRequest)
}

// ④ A campaign name is unique per workspace, case-insensitively.
func TestBdCampaignNameConflict(t *testing.T) {
	workspaceID, ownerUserID := bdScratchWorkspace(t, "BD campaign name workspace")

	created := bdCreateCampaign(t, workspaceID, ownerUserID, map[string]any{"name": "Nov Batch"})
	if created.Kind != "search" {
		t.Fatalf("kind = %q, want search", created.Kind)
	}
	if created.CreatorCount != 0 {
		t.Fatalf("creator_count = %d, want 0 for a fresh batch", created.CreatorCount)
	}

	req := bdRequestIn(t, "POST", "/api/workbench/bd/campaigns", workspaceID, map[string]any{
		"name": "nov batch", "kind": "manual",
	}, ownerUserID)
	testutil.Call(t, testHandler.CreateBdCampaign, req).Want(http.StatusConflict)

	// A rename onto an existing name is refused by the same rule.
	other := bdCreateCampaign(t, workspaceID, ownerUserID, map[string]any{"name": "Dec Batch"})
	req = bdRequestIn(t, "PATCH", "/api/workbench/bd/campaigns/"+other.ID, workspaceID,
		map[string]any{"name": "NOV BATCH"}, ownerUserID)
	req = withURLParam(req, "campaignId", other.ID)
	testutil.Call(t, testHandler.UpdateBdCampaign, req).Want(http.StatusConflict)

	// Renaming a batch to its own name (different capitalisation) is not a conflict.
	req = bdRequestIn(t, "PATCH", "/api/workbench/bd/campaigns/"+other.ID, workspaceID,
		map[string]any{"name": "dec batch", "budget_amount": 1200}, ownerUserID)
	req = withURLParam(req, "campaignId", other.ID)
	updated := testutil.Decode[BdCampaignResponse](t, testHandler.UpdateBdCampaign, req, http.StatusOK)
	if updated.Name != "dec batch" || updated.BudgetAmount == nil || *updated.BudgetAmount != 1200 {
		t.Fatalf("patched campaign = %+v, want the new name and budget", updated)
	}

	// Archiving frees the name: an archived batch must not hold it hostage.
	req = bdRequestIn(t, "DELETE", "/api/workbench/bd/campaigns/"+other.ID, workspaceID, nil, ownerUserID)
	req = withURLParam(req, "campaignId", other.ID)
	testutil.Call(t, testHandler.DeleteBdCampaign, req).Want(http.StatusNoContent)
	bdCreateCampaign(t, workspaceID, ownerUserID, map[string]any{"name": "dec batch"})
}

// ⑤ An empty workspace answers zeros for every counter and "not measurable" for
// every amount. This is the case that keeps the cockpit from drawing ￥0.00 over
// a ledger nobody has filled.
func TestBdPipelineOnEmptyWorkspace(t *testing.T) {
	workspaceID, ownerUserID := bdScratchWorkspace(t, "BD empty pipeline workspace")

	resp := bdPipeline(t, workspaceID, ownerUserID)

	for field, entry := range map[string]WorkbenchMetricValue{
		"creators.total":      resp.Creators.Total,
		"creators.contacted":  resp.Creators.Contacted,
		"creators.replied":    resp.Creators.Replied,
		"creators.quoted":     resp.Creators.Quoted,
		"creators.signed":     resp.Creators.Signed,
		"creators.deal":       resp.Creators.Deal,
		"quotes.open":         resp.Quotes.Open,
		"quotes.accepted":     resp.Quotes.Accepted,
		"quotes.rejected":     resp.Quotes.Rejected,
		"orders.open":         resp.Orders.Open,
		"orders.delivered":    resp.Orders.Delivered,
		"orders.settled":      resp.Orders.Settled,
		"followups.due_today": resp.Followups.DueToday,
		"followups.overdue":   resp.Followups.Overdue,
	} {
		if got := bdValue(t, field, entry); got != 0 {
			t.Fatalf("%s = %v on an empty ledger, want 0", field, got)
		}
		if entry.Empty != metricEmptyZero {
			t.Fatalf("%s.empty = %q, want %q (a count always answers)", field, entry.Empty, metricEmptyZero)
		}
	}

	for field, money := range map[string]BdPipelineMoney{
		"quotes.total_fee":    resp.Quotes.TotalFee,
		"orders.total_amount": resp.Orders.TotalAmount,
		"orders.paid_amount":  resp.Orders.PaidAmount,
	} {
		if money.Amount != nil {
			t.Fatalf("%s.amount = %v, want null: nothing was summed", field, *money.Amount)
		}
		if money.Empty != metricEmptyInsufficientData {
			t.Fatalf("%s.empty = %q, want %q", field, money.Empty, metricEmptyInsufficientData)
		}
		if money.SampleCount != 0 {
			t.Fatalf("%s.sample_count = %d, want 0", field, money.SampleCount)
		}
		if money.Currency != "CNY" {
			t.Fatalf("%s.currency = %q, want CNY even while empty", field, money.Currency)
		}
	}
}

// ⑥ The cockpit numbers, on a workspace this test owns end to end: 3 follow-ups,
// 2 quotes and 1 collaboration.
func TestBdPipelineCounts(t *testing.T) {
	workspaceID, ownerUserID := bdScratchWorkspace(t, "BD pipeline workspace")
	creator := bdCreateCreator(t, workspaceID, ownerUserID, "BD cockpit creator")
	now := bdDBNow(t)

	// Three follow-ups on one creator. The newest carries the next step; the two
	// before it are the conversation that led there.
	bdCreateActivity(t, workspaceID, ownerUserID, creator.ID, map[string]any{
		"happened_at":    now.Add(-5 * 24 * time.Hour).UTC().Format(time.RFC3339),
		"outcome":        "no_reply",
		"next_follow_at": now.Add(-4 * 24 * time.Hour).UTC().Format(time.RFC3339),
		"summary":        "第一次私信，没回",
	})
	bdCreateActivity(t, workspaceID, ownerUserID, creator.ID, map[string]any{
		"happened_at": now.Add(-3 * 24 * time.Hour).UTC().Format(time.RFC3339),
		"outcome":     "replied",
		"summary":     "回了，问了坑位费",
	})
	// `next_follow_at` is the database's own `now()`: it is in the past by the
	// time the aggregate query runs (a later request), and still inside today's
	// window unless the two clock reads straddle midnight.
	bdCreateActivity(t, workspaceID, ownerUserID, creator.ID, map[string]any{
		"happened_at":    now.Add(-24 * time.Hour).UTC().Format(time.RFC3339),
		"outcome":        "advanced",
		"next_follow_at": now.UTC().Format(time.RFC3339Nano),
		"summary":        "谈了条件，等报价确认",
	})

	// Two offers: one waiting for an answer, one accepted.
	bdCreateQuote(t, workspaceID, ownerUserID, creator.ID, map[string]any{
		"status": "sent", "quoted_at": now.Add(-48 * time.Hour).UTC().Format(time.RFC3339),
		"fee_amount": 3000, "commission_rate": 0.2,
	})
	bdCreateQuote(t, workspaceID, ownerUserID, creator.ID, map[string]any{
		"status": "accepted", "quoted_at": now.Add(-24 * time.Hour).UTC().Format(time.RFC3339),
		"fee_amount": 2000, "commission_rate": 0.15,
	})

	collab := bdScratchCollab(t, workspaceID, ownerUserID, creator.ID, "confirmed", 10000)
	if collab.Stage != "confirmed" {
		t.Fatalf("collab stage = %q, want confirmed", collab.Stage)
	}

	resp := bdPipeline(t, workspaceID, ownerUserID)

	if got := bdValue(t, "creators.total", resp.Creators.Total); got != 1 {
		t.Fatalf("creators.total = %v, want 1", got)
	}
	if got := bdValue(t, "creators.contacted", resp.Creators.Contacted); got != 1 {
		t.Fatalf("creators.contacted = %v, want 1", got)
	}
	if got := bdValue(t, "creators.replied", resp.Creators.Replied); got != 1 {
		t.Fatalf("creators.replied = %v, want 1", got)
	}
	if got := bdValue(t, "creators.quoted", resp.Creators.Quoted); got != 1 {
		t.Fatalf("creators.quoted = %v, want 1", got)
	}
	// `signed` / `deal` read `creator.cooperation_intent`, which nothing in this
	// test set — and a follow-up is not a signed deal.
	if got := bdValue(t, "creators.signed", resp.Creators.Signed); got != 0 {
		t.Fatalf("creators.signed = %v, want 0", got)
	}
	if got := bdValue(t, "creators.deal", resp.Creators.Deal); got != 0 {
		t.Fatalf("creators.deal = %v, want 0", got)
	}

	if got := bdValue(t, "quotes.open", resp.Quotes.Open); got != 1 {
		t.Fatalf("quotes.open = %v, want 1 (only the sent offer is waiting)", got)
	}
	if got := bdValue(t, "quotes.accepted", resp.Quotes.Accepted); got != 1 {
		t.Fatalf("quotes.accepted = %v, want 1", got)
	}
	if got := bdValue(t, "quotes.rejected", resp.Quotes.Rejected); got != 0 {
		t.Fatalf("quotes.rejected = %v, want 0", got)
	}
	if resp.Quotes.TotalFee.Amount == nil || *resp.Quotes.TotalFee.Amount != 5000 {
		t.Fatalf("quotes.total_fee = %v, want 5000", resp.Quotes.TotalFee.Amount)
	}
	if resp.Quotes.TotalFee.SampleCount != 2 {
		t.Fatalf("quotes.total_fee.sample_count = %d, want 2", resp.Quotes.TotalFee.SampleCount)
	}

	if got := bdValue(t, "orders.open", resp.Orders.Open); got != 1 {
		t.Fatalf("orders.open = %v, want 1 (confirmed is in flight)", got)
	}
	if got := bdValue(t, "orders.delivered", resp.Orders.Delivered); got != 0 {
		t.Fatalf("orders.delivered = %v, want 0", got)
	}
	if got := bdValue(t, "orders.settled", resp.Orders.Settled); got != 0 {
		t.Fatalf("orders.settled = %v, want 0", got)
	}
	if resp.Orders.TotalAmount.Amount == nil || *resp.Orders.TotalAmount.Amount != 10000 {
		t.Fatalf("orders.total_amount = %v, want 10000", resp.Orders.TotalAmount.Amount)
	}
	// Nothing has been paid: the amount is null, not 0.
	if resp.Orders.PaidAmount.Amount != nil {
		t.Fatalf("orders.paid_amount = %v, want null with no settlement row", *resp.Orders.PaidAmount.Amount)
	}

	if got := bdValue(t, "followups.due_today", resp.Followups.DueToday); got != 1 {
		t.Fatalf("followups.due_today = %v, want 1", got)
	}
	if got := bdValue(t, "followups.overdue", resp.Followups.Overdue); got != 1 {
		t.Fatalf("followups.overdue = %v, want 1", got)
	}

	// An older row's `next_follow_at` must not keep a creator overdue once a newer
	// follow-up has happened — the obligation moved on with the conversation.
	bdCreateActivity(t, workspaceID, ownerUserID, creator.ID, map[string]any{
		"happened_at":    now.Add(1 * time.Hour).UTC().Format(time.RFC3339),
		"outcome":        "replied",
		"next_follow_at": now.Add(7 * 24 * time.Hour).UTC().Format(time.RFC3339),
		"summary":        "回访：先放一放，下周再谈",
	})
	resp = bdPipeline(t, workspaceID, ownerUserID)
	if got := bdValue(t, "followups.overdue", resp.Followups.Overdue); got != 0 {
		t.Fatalf("followups.overdue = %v after a newer follow-up, want 0", got)
	}
	if got := bdValue(t, "followups.due_today", resp.Followups.DueToday); got != 0 {
		t.Fatalf("followups.due_today = %v after rescheduling, want 0", got)
	}
}

// ⑦ A member writes only its own rows; the owner of the row may edit it.
func TestBdMemberCannotEditOthersFollowup(t *testing.T) {
	memberUserID := workbenchTestMember(t)
	creator := createWorkbenchCreator(t, testUserID, "BD permission creator")
	activity := bdCreateActivity(t, "", testUserID, creator.ID, map[string]any{})

	// Read is member-wide.
	req := workbenchRequest(t, "GET", "/api/workbench/bd/activities/"+activity.ID, nil, memberUserID)
	req = withURLParam(req, "activityId", activity.ID)
	got := testutil.Decode[BdActivityResponse](t, testHandler.GetBdActivity, req, http.StatusOK)
	if got.ID != activity.ID {
		t.Fatalf("GetBdActivity as member returned %s, want %s", got.ID, activity.ID)
	}

	req = workbenchRequest(t, "PATCH", "/api/workbench/bd/activities/"+activity.ID, map[string]any{
		"summary": "不是我的跟进",
	}, memberUserID)
	req = withURLParam(req, "activityId", activity.ID)
	testutil.Call(t, testHandler.UpdateBdActivity, req).Want(http.StatusForbidden)

	req = workbenchRequest(t, "DELETE", "/api/workbench/bd/activities/"+activity.ID, nil, memberUserID)
	req = withURLParam(req, "activityId", activity.ID)
	testutil.Call(t, testHandler.DeleteBdActivity, req).Want(http.StatusForbidden)

	// The owner can, and `creator_id` is not part of what an edit may move.
	req = workbenchRequest(t, "PATCH", "/api/workbench/bd/activities/"+activity.ID, map[string]any{
		"creator_id": creator.ID,
	}, testUserID)
	req = withURLParam(req, "activityId", activity.ID)
	testutil.Call(t, testHandler.UpdateBdActivity, req).Want(http.StatusBadRequest)

	req = workbenchRequest(t, "PATCH", "/api/workbench/bd/activities/"+activity.ID, map[string]any{
		"summary": "改了说法：她说下周给答复",
		"outcome": "replied",
	}, testUserID)
	req = withURLParam(req, "activityId", activity.ID)
	updated := testutil.Decode[BdActivityResponse](t, testHandler.UpdateBdActivity, req, http.StatusOK)
	if updated.Summary != "改了说法：她说下周给答复" || updated.Outcome == nil || *updated.Outcome != "replied" {
		t.Fatalf("patched follow-up = %+v, want the new summary and outcome", updated)
	}

	// A member writing its own row is allowed: ownership, not the role, decides.
	own := bdCreateActivity(t, "", memberUserID, creator.ID, map[string]any{})
	req = workbenchRequest(t, "PATCH", "/api/workbench/bd/activities/"+own.ID, map[string]any{
		"next_follow_at": "2026-12-01T09:00:00Z",
	}, memberUserID)
	req = withURLParam(req, "activityId", own.ID)
	own2 := testutil.Decode[BdActivityResponse](t, testHandler.UpdateBdActivity, req, http.StatusOK)
	if own2.NextFollowAt == nil {
		t.Fatalf("a member could not schedule its own follow-up: %+v", own2)
	}
}

// ⑧ Teardown covers the three new tables. The manifest covers the classification
// (and fails the suite for any table in the schema that lacks one); this runs the
// statement itself, because no foreign key would remove these rows.
func TestBdTeardownCoversNewTables(t *testing.T) {
	tables := []string{"creator_activity", "creator_quote", "creator_campaign"}
	for _, table := range tables {
		if action, ok := workspaceDeletionManifest[table]; !ok || action != workspaceDelete {
			t.Fatalf("workspaceDeletionManifest[%s] = %q (present=%v), want delete", table, action, ok)
		}
	}

	workspaceID, ownerUserID := bdScratchWorkspace(t, "BD teardown workspace")
	creator := bdCreateCreator(t, workspaceID, ownerUserID, "BD teardown creator")
	bdCreateActivity(t, workspaceID, ownerUserID, creator.ID, map[string]any{})
	bdCreateQuote(t, workspaceID, ownerUserID, creator.ID, map[string]any{})
	bdCreateCampaign(t, workspaceID, ownerUserID, map[string]any{"name": "teardown batch"})

	for _, table := range tables {
		if got := dbfx.Count(t, `SELECT count(*) FROM `+table+` WHERE workspace_id = $1`, workspaceID); got != 1 {
			t.Fatalf("%s rows = %d before teardown, want 1", table, got)
		}
	}

	if err := testHandler.Queries.DeleteWorkspaceWorkbenchLedger(context.Background(), parseUUID(workspaceID)); err != nil {
		t.Fatalf("teardown: %v", err)
	}
	for _, table := range tables {
		if got := dbfx.Count(t, `SELECT count(*) FROM `+table+` WHERE workspace_id = $1`, workspaceID); got != 0 {
			t.Fatalf("after teardown %d %s rows remain, want 0", got, table)
		}
	}
	// The creators themselves are cleared by the same statement, before these
	// three: a workspace that is gone must not leave a creator behind either.
	if got := dbfx.Count(t, `SELECT count(*) FROM creator WHERE workspace_id = $1`, workspaceID); got != 0 {
		t.Fatalf("after teardown %d creator rows remain, want 0", got)
	}
}

// TestBdPerformanceWindow covers `GET /bd/performance` (§22): each fact buckets by
// its own date, the response states the window it used, and a window with no rows
// answers `insufficient_data` instead of a confident zero.
//
// Every number is asserted against a throwaway workspace, never the shared one: the
// report reads across six tables and "the total is 1 because I put one row there"
// only holds when nothing else can be in the workspace.
func TestBdPerformanceWindow(t *testing.T) {
	workspaceID, ownerUserID := bdScratchWorkspace(t, "BD performance workspace")
	creator := bdCreateCreator(t, workspaceID, ownerUserID, "Performance creator")

	// A collaboration that is confirmed and published (stage `published` fills both
	// milestones with "now", which is inside the window this test asks for).
	collab := bdScratchCollab(t, workspaceID, ownerUserID, creator.ID, "published", 42000)

	// A settlement that cleared inside the window: the money that actually moved.
	settlementReq := bdRequestIn(t, "POST", "/api/workbench/crm/settlements", workspaceID, map[string]any{
		"collab_id": collab.ID,
		"kind":      "final",
		"amount":    21000,
		"paid_at":   "2026-11-15",
	}, ownerUserID)
	settlement := testutil.Decode[CrmSettlementResponse](t, testHandler.CreateCrmSettlement, settlementReq, http.StatusCreated)
	t.Cleanup(func() { dbfx.Exec(t, `DELETE FROM crm_settlement WHERE id = $1`, settlement.ID) })

	// Two offers sent in the window, one of which was accepted → win rate 0.5.
	bdCreateQuote(t, workspaceID, ownerUserID, creator.ID, map[string]any{
		"status": "sent", "quoted_at": "2026-11-05T09:00:00Z", "fee_amount": 5000,
	})
	bdCreateQuote(t, workspaceID, ownerUserID, creator.ID, map[string]any{
		"status": "accepted", "quoted_at": "2026-11-06T09:00:00Z", "fee_amount": 4000,
	})

	// One follow-up inside the window (with a result) and one outside it.
	bdCreateActivity(t, workspaceID, ownerUserID, creator.ID, map[string]any{
		"happened_at": "2026-11-10T09:00:00Z", "outcome": "replied",
	})
	bdCreateActivity(t, workspaceID, ownerUserID, creator.ID, map[string]any{
		"happened_at": "2026-02-10T09:00:00Z", "summary": "去年的旧记录",
	})

	req := bdRequestIn(t, "GET", "/api/workbench/bd/performance?from=2026-11-01&to=2026-11-30",
		workspaceID, nil, ownerUserID)
	report := testutil.Decode[BdPerformanceResponse](t, testHandler.GetBdPerformance, req, http.StatusOK)

	if report.From != "2026-11-01" || report.To != "2026-11-30" {
		t.Fatalf("window = %s..%s, want the days that were sent", report.From, report.To)
	}
	if report.Currency != "CNY" {
		t.Fatalf("currency = %q, want CNY", report.Currency)
	}
	if report.Empty != metricEmptyZero {
		t.Fatalf("empty = %q, want zero for a window that holds rows", report.Empty)
	}
	if got := bdValue(t, "signed.count", report.Signed.Count); got != 1 {
		t.Fatalf("signed.count = %v, want 1", got)
	}
	if report.Signed.Amount.Amount == nil || *report.Signed.Amount.Amount != 42000 {
		t.Fatalf("signed.amount = %v, want 42000", report.Signed.Amount.Amount)
	}
	if got := bdValue(t, "delivered.count", report.Delivered.Count); got != 1 {
		t.Fatalf("delivered.count = %v, want 1", got)
	}
	if got := bdValue(t, "collected.count", report.Collected.Count); got != 1 {
		t.Fatalf("collected.count = %v, want 1", got)
	}
	if report.Collected.Amount.Amount == nil || *report.Collected.Amount.Amount != 21000 {
		t.Fatalf("collected.amount = %v, want 21000", report.Collected.Amount.Amount)
	}
	if got := bdValue(t, "quotes.sent", report.Quotes.Sent); got != 2 {
		t.Fatalf("quotes.sent = %v, want 2", got)
	}
	if got := bdValue(t, "quotes.accepted", report.Quotes.Accepted); got != 1 {
		t.Fatalf("quotes.accepted = %v, want 1", got)
	}
	if got := bdValue(t, "quotes.win_rate", report.Quotes.WinRate); got != 0.5 {
		t.Fatalf("quotes.win_rate = %v, want 0.5", got)
	}
	if report.Quotes.Amount.Amount == nil || *report.Quotes.Amount.Amount != 9000 {
		t.Fatalf("quotes.amount = %v, want the 9000 of both sent offers", report.Quotes.Amount.Amount)
	}
	if got := bdValue(t, "followups.count", report.Followups.Count); got != 1 {
		t.Fatalf("followups.count = %v, want 1 (the February row is outside the window)", got)
	}
	if got := bdValue(t, "followups.replied", report.Followups.Replied); got != 1 {
		t.Fatalf("followups.replied = %v, want 1", got)
	}
	if got := bdValue(t, "followups.meetings", report.Followups.Meetings); got != 0 {
		t.Fatalf("followups.meetings = %v, want 0", got)
	}
	// No affiliate statement in this workspace: the block answers a gap, not 0.00.
	if report.Affiliate.Agency.Amount != nil || report.Affiliate.Agency.Empty != metricEmptyInsufficientData {
		t.Fatalf("affiliate.agency = %+v, want an insufficient_data gap", report.Affiliate.Agency)
	}

	// by_member: one row for the workspace's only member, with the same numbers.
	if len(report.ByMember) != 1 {
		t.Fatalf("by_member = %+v, want one row", report.ByMember)
	}
	memberRow := report.ByMember[0]
	if memberRow.MemberID != ownerUserID {
		t.Fatalf("by_member[0].member_id = %q, want %q", memberRow.MemberID, ownerUserID)
	}
	if memberRow.Name == "" {
		t.Fatalf("by_member[0].name is empty, want the member's display name")
	}
	if memberRow.SignedCount != 1 || memberRow.SignedAmount == nil || *memberRow.SignedAmount != 42000 {
		t.Fatalf("by_member rows = %+v, want one signed row worth 42000", memberRow.BdPerformanceTotals)
	}
	if memberRow.CollectedAmount == nil || *memberRow.CollectedAmount != 21000 {
		t.Fatalf("by_member collected = %v, want 21000", memberRow.CollectedAmount)
	}
	if memberRow.WinRate == nil || *memberRow.WinRate != 0.5 {
		t.Fatalf("by_member win_rate = %v, want 0.5", memberRow.WinRate)
	}
	if memberRow.DeliveredCount != 1 || memberRow.Followups != 1 || memberRow.Replied != 1 {
		t.Fatalf("by_member counts = %+v, want one delivered / one follow-up / one reply", memberRow.BdPerformanceTotals)
	}

	// by_month: the same facts cut by month, oldest first.
	if len(report.ByMonth) != 1 || report.ByMonth[0].Month != "2026-11" {
		t.Fatalf("by_month = %+v, want one 2026-11 row", report.ByMonth)
	}
	if report.ByMonth[0].SignedCount != 1 || report.ByMonth[0].QuoteSent != 2 {
		t.Fatalf("by_month[0] = %+v, want the window's signed and quote counts", report.ByMonth[0])
	}

	// A window with nothing in it: counts are real zeros, money is a gap, and the
	// report says so once instead of making every card invent a 0.
	req = bdRequestIn(t, "GET", "/api/workbench/bd/performance?from=2020-01-01&to=2020-01-31",
		workspaceID, nil, ownerUserID)
	blank := testutil.Decode[BdPerformanceResponse](t, testHandler.GetBdPerformance, req, http.StatusOK)
	if blank.Empty != metricEmptyInsufficientData {
		t.Fatalf("empty = %q for a window with no rows, want insufficient_data", blank.Empty)
	}
	if got := bdValue(t, "signed.count", blank.Signed.Count); got != 0 {
		t.Fatalf("blank signed.count = %v, want 0", got)
	}
	if blank.Signed.Amount.Amount != nil || blank.Signed.Amount.Empty != metricEmptyInsufficientData {
		t.Fatalf("blank signed.amount = %+v, want a gap", blank.Signed.Amount)
	}
	if blank.Quotes.WinRate.Value != nil {
		t.Fatalf("blank quotes.win_rate = %v, want null: no offer was sent", *blank.Quotes.WinRate.Value)
	}
	if len(blank.ByMember) != 0 || len(blank.ByMonth) != 0 {
		t.Fatalf("blank report = %+v, want no rows", blank)
	}

	// Defaults: no parameters means "this month so far", and the response echoes the
	// window it actually used so the page can label the trend without recomputing it.
	req = bdRequestIn(t, "GET", "/api/workbench/bd/performance", workspaceID, nil, ownerUserID)
	implicit := testutil.Decode[BdPerformanceResponse](t, testHandler.GetBdPerformance, req, http.StatusOK)
	now := time.Now().UTC()
	wantFrom := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC).Format("2006-01-02")
	if implicit.From != wantFrom || implicit.To != now.Format("2006-01-02") {
		t.Fatalf("default window = %s..%s, want %s..%s", implicit.From, implicit.To,
			wantFrom, now.Format("2006-01-02"))
	}

	// An inverted range is a typo, not an empty report.
	req = bdRequestIn(t, "GET", "/api/workbench/bd/performance?from=2026-11-30&to=2026-11-01",
		workspaceID, nil, ownerUserID)
	testutil.Call(t, testHandler.GetBdPerformance, req).Want(http.StatusBadRequest)
}
