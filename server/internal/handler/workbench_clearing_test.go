package handler

import (
	"net/http"
	"strings"
	"testing"

	"github.com/jerry-halo2026/morchat.co/server/internal/testutil"
)

// PATCH clearing semantics (WORKBENCH-API §3.4, backlog #28).
//
// A nullable column has three request states and the request structs used to carry
// only two: `*string` / `*float64` decodes both "the key is absent" and "the key is
// null" into nil, so `{"paid_at": null}` silently kept the stored date and the only
// spelling that cleared a column was an empty string. These cases pin the contract
// down field by field:
//
//	key omitted  → the stored value survives
//	key is null  → the column becomes SQL NULL (an audit row records the clear)
//	key is ""    → the column becomes SQL NULL too (older clients keep working)
//
// Every "cleared" assertion reads the database, not the response: the bug is about
// what is stored. An empty string and NULL render the same on screen but answer
// differently to every reader — `paid_at IS NULL` drives the receivable list and the
// aggregates, `''` would look paid-but-blank to some of them and unpaid to others.
//
// The cases below come in two blocks. The first covers the columns that were fixed
// with `json.RawMessage` first (the fees, the links, the notes); the second covers
// the remaining pointer fields — `scheduled_at` and the stage milestones,
// `quoted_at`, `due_at`, `amount`, `happened_at`, the budget and window fields,
// `publish_at` and `shoot_date` — plus the NOT NULL columns those bodies carry,
// where the right answer is a 400 that names the field.

// columnIsNull reports whether one nullable column of one row holds SQL NULL. The
// table and column names come from the test itself (never from a request), so plain
// string assembly is safe here and keeps each case readable.
func columnIsNull(t *testing.T, table, column, id string) bool {
	t.Helper()
	query := "SELECT count(*) FROM " + table + " WHERE id = $1 AND " + column + " IS NULL"
	return dbfx.Count(t, query, id) == 1
}

// collabPatch is one PATCH against a collaboration, as the caller sees it.
func collabPatch(t *testing.T, id string, body map[string]any) CrmCollabResponse {
	t.Helper()
	req := withURLParam(workbenchRequest(t, "PATCH", "/api/workbench/crm/collabs/"+id, body, testUserID),
		"collabId", id)
	return testutil.Decode[CrmCollabResponse](t, testHandler.UpdateCrmCollab, req, http.StatusOK)
}

// TestCrmCollabPatchClearing covers the five clearable collaboration columns:
// `publish_url`, `settled_on` and the three costs (§3.4).
func TestCrmCollabPatchClearing(t *testing.T) {
	client := createWorkbenchClient(t, testUserID, "Clearing client")
	brief := createWorkbenchBrief(t, client.ID, "Clearing brief")
	creator := createWorkbenchCreator(t, testUserID, "Clearing creator")
	// The fixture seeds creator_fee 4000 / sample_cost 500 / platform_fee 500.
	collab := createWorkbenchCollab(t, brief.ID, creator.ID, map[string]any{
		"publish_url": "https://example.test/video/1",
		"settled_on":  "2026-11-18",
	})

	columns := []string{"publish_url", "settled_on", "creator_fee", "sample_cost", "platform_fee"}
	values := map[string]any{
		"publish_url":  "https://example.test/video/1",
		"settled_on":   "2026-11-18",
		"creator_fee":  4000,
		"sample_cost":  500,
		"platform_fee": 500,
	}

	// ① Omitted keeps every column: a PATCH that touches something else must not
	// be read as "clear everything I did not mention".
	kept := collabPatch(t, collab.ID, map[string]any{"prob": 0.5})
	if kept.PublishURL == nil || *kept.PublishURL != "https://example.test/video/1" {
		t.Fatalf("publish_url after an unrelated PATCH = %v, want the stored value", kept.PublishURL)
	}
	if kept.CreatorFee == nil || *kept.CreatorFee != 4000 {
		t.Fatalf("creator_fee after an unrelated PATCH = %v, want 4000", kept.CreatorFee)
	}
	for _, column := range columns {
		if columnIsNull(t, "crm_collab", column, collab.ID) {
			t.Fatalf("%s became NULL although the PATCH never mentioned it", column)
		}
	}

	// ② JSON null clears — the case that used to be a silent no-op.
	cleared := collabPatch(t, collab.ID, map[string]any{
		"publish_url":  nil,
		"settled_on":   nil,
		"creator_fee":  nil,
		"sample_cost":  nil,
		"platform_fee": nil,
	})
	if cleared.PublishURL != nil || cleared.SettledOn != nil ||
		cleared.CreatorFee != nil || cleared.SampleCost != nil || cleared.PlatformFee != nil {
		t.Fatalf("cleared collab = %+v, want every cleared field to come back null", cleared)
	}
	for _, column := range columns {
		if !columnIsNull(t, "crm_collab", column, collab.ID) {
			t.Fatalf("%s is not NULL after {\"field\": null}", column)
		}
	}
	if cleared.Revision <= collab.Revision {
		t.Fatalf("revision after a clearing PATCH = %d, want > %d", cleared.Revision, collab.Revision)
	}

	// The clear is a business change, so the §2 trail records both ends: the value
	// that was there and the NULL that replaced it.
	rows := workbenchAuditRows(t, subjectCrmCollab, collab.ID)
	if len(rows) == 0 {
		t.Fatalf("clearing left no audit row")
	}
	_, after := auditDetails(t, rows[len(rows)-1].Details)
	if value, present := after["platform_fee"]; !present || value != nil {
		t.Fatalf("audit details.after.platform_fee = %v (present=%v), want an explicit null", value, present)
	}

	// ③ "" clears too: the spelling a client written before §3.4 sends (the sales
	// page's `receiptPatch` is the live example).
	restored := collabPatch(t, collab.ID, values)
	if restored.CreatorFee == nil || *restored.CreatorFee != 4000 {
		t.Fatalf("restored creator_fee = %v, want 4000", restored.CreatorFee)
	}
	emptyStrings := map[string]any{}
	for _, column := range columns {
		emptyStrings[column] = ""
	}
	fromBlank := collabPatch(t, collab.ID, emptyStrings)
	for _, column := range columns {
		if !columnIsNull(t, "crm_collab", column, collab.ID) {
			t.Fatalf("%s is not NULL after {\"field\": \"\"}", column)
		}
	}
	if fromBlank.PublishURL != nil || fromBlank.SettledOn != nil || fromBlank.CreatorFee != nil {
		t.Fatalf("collab after \"\" clears = %+v, want nulls", fromBlank)
	}
}

// TestCrmCollabClearingNeedsTheMoneyCapability pins the gate half of the contract:
// a `null` is still a write to the field, so clearing money is not a way around
// `crm.amount` (§26.5) — the check reads "was the field sent", not "was it non-nil".
func TestCrmCollabClearingNeedsTheMoneyCapability(t *testing.T) {
	seedRoleTemplate(t, "只写商务", "{crm.read,crm.write}")
	memberUserID := capabilityMember(t, "clearing", "", "只写商务")
	client := createWorkbenchClient(t, memberUserID, "Clearing capability client")
	brief := createWorkbenchBrief(t, client.ID, "Clearing capability brief")
	creator := createWorkbenchCreator(t, memberUserID, "Clearing capability creator")
	collab := createWorkbenchCollab(t, brief.ID, creator.ID, map[string]any{"owner_member_id": memberUserID})

	req := withURLParam(workbenchRequest(t, "PATCH", "/api/workbench/crm/collabs/"+collab.ID,
		map[string]any{"creator_fee": nil}, memberUserID), "collabId", collab.ID)
	var body map[string]any
	testutil.Call(t, testHandler.UpdateCrmCollab, req).Want(http.StatusForbidden).JSON(&body)
	if body["capability"] != capCRMAmount {
		t.Fatalf("403 body = %v, want capability crm.amount", body)
	}
	if columnIsNull(t, "crm_collab", "creator_fee", collab.ID) {
		t.Fatalf("the refused write cleared creator_fee anyway")
	}
}

// TestCrmSettlementPatchClearing covers `paid_at`, `note` and `invoice_no` (§3.4).
// `paid_at` is the one that used to force the empty-string spelling: it decides
// whether a row counts as collected, so "kept" and "cleared" answering the same
// thing was a money bug, not a formatting one.
func TestCrmSettlementPatchClearing(t *testing.T) {
	client := createWorkbenchClient(t, testUserID, "Settlement clearing client")
	brief := createWorkbenchBrief(t, client.ID, "Settlement clearing brief")
	creator := createWorkbenchCreator(t, testUserID, "Settlement clearing creator")
	collab := createWorkbenchCollab(t, brief.ID, creator.ID, map[string]any{"stage": "accepted"})

	req := workbenchRequest(t, "POST", "/api/workbench/crm/settlements", map[string]any{
		"collab_id":  collab.ID,
		"kind":       "final",
		"amount":     7000,
		"paid_at":    "2026-11-16",
		"invoice_no": "INV-2026-11-16",
		"note":       "首笔尾款",
	}, testUserID)
	settlement := testutil.Decode[CrmSettlementResponse](t, testHandler.CreateCrmSettlement, req, http.StatusCreated)
	t.Cleanup(func() { dbfx.Exec(t, `DELETE FROM crm_settlement WHERE id = $1`, settlement.ID) })
	if settlement.PaidAt == nil || settlement.InvoiceNo == nil || settlement.Note == nil {
		t.Fatalf("created settlement = %+v, want paid_at / invoice_no / note set", settlement)
	}

	patch := func(body map[string]any) CrmSettlementResponse {
		t.Helper()
		req := withURLParam(workbenchRequest(t, "PATCH", "/api/workbench/crm/settlements/"+settlement.ID, body, testUserID),
			"settlementId", settlement.ID)
		return testutil.Decode[CrmSettlementResponse](t, testHandler.UpdateCrmSettlement, req, http.StatusOK)
	}
	columns := []string{"paid_at", "invoice_no", "note"}

	// ① Omitted keeps.
	kept := patch(map[string]any{"amount": 7001})
	if kept.PaidAt == nil || *kept.PaidAt != "2026-11-16" {
		t.Fatalf("paid_at after an amount-only PATCH = %v, want 2026-11-16", kept.PaidAt)
	}
	if kept.Note == nil || *kept.Note != "首笔尾款" {
		t.Fatalf("note after an amount-only PATCH = %v, want the stored note", kept.Note)
	}
	for _, column := range columns {
		if columnIsNull(t, "crm_settlement", column, settlement.ID) {
			t.Fatalf("%s became NULL although the PATCH never mentioned it", column)
		}
	}

	// ② null clears.
	cleared := patch(map[string]any{"paid_at": nil, "invoice_no": nil, "note": nil})
	if cleared.PaidAt != nil || cleared.InvoiceNo != nil || cleared.Note != nil {
		t.Fatalf("cleared settlement = %+v, want nulls", cleared)
	}
	for _, column := range columns {
		if !columnIsNull(t, "crm_settlement", column, settlement.ID) {
			t.Fatalf("%s is not NULL after {\"field\": null}", column)
		}
	}

	// ③ "" clears (the shape `receiptPatch` sends today).
	patch(map[string]any{"paid_at": "2026-11-17", "invoice_no": "INV-2", "note": "补记"})
	fromBlank := patch(map[string]any{"paid_at": "", "invoice_no": "", "note": ""})
	if fromBlank.PaidAt != nil || fromBlank.InvoiceNo != nil || fromBlank.Note != nil {
		t.Fatalf("settlement after \"\" clears = %+v, want nulls", fromBlank)
	}
	for _, column := range columns {
		if !columnIsNull(t, "crm_settlement", column, settlement.ID) {
			t.Fatalf("%s is not NULL after {\"field\": \"\"}", column)
		}
	}
}

// TestBdActivityPatchClearing covers `outcome` and `next_follow_at`, and pins the
// exception: `summary` is NOT NULL, so a clear request answers 400 instead of
// keeping the old text (which is what "omitted" means) or storing "" (which the
// column's own comment forbids).
func TestBdActivityPatchClearing(t *testing.T) {
	creator := createWorkbenchCreator(t, testUserID, "Follow-up clearing creator")
	activity := bdCreateActivity(t, "", testUserID, creator.ID, map[string]any{
		"outcome":        "replied",
		"next_follow_at": "2026-11-25T09:00:00Z",
	})

	patch := func(body map[string]any) BdActivityResponse {
		t.Helper()
		req := withURLParam(workbenchRequest(t, "PATCH", "/api/workbench/bd/activities/"+activity.ID, body, testUserID),
			"activityId", activity.ID)
		return testutil.Decode[BdActivityResponse](t, testHandler.UpdateBdActivity, req, http.StatusOK)
	}

	// ① Omitted keeps both nullable columns.
	kept := patch(map[string]any{"kind": "call"})
	if kept.Outcome == nil || *kept.Outcome != "replied" {
		t.Fatalf("outcome after a kind-only PATCH = %v, want replied", kept.Outcome)
	}
	if kept.NextFollowAt == nil {
		t.Fatalf("next_follow_at after a kind-only PATCH = nil, want the stored instant")
	}

	// ② null clears.
	cleared := patch(map[string]any{"outcome": nil, "next_follow_at": nil})
	if cleared.Outcome != nil || cleared.NextFollowAt != nil {
		t.Fatalf("cleared follow-up = %+v, want outcome and next_follow_at null", cleared)
	}
	for _, column := range []string{"outcome", "next_follow_at"} {
		if !columnIsNull(t, "creator_activity", column, activity.ID) {
			t.Fatalf("%s is not NULL after {\"field\": null}", column)
		}
	}
	if cleared.Summary == "" {
		t.Fatalf("clearing outcome/next_follow_at also emptied summary")
	}

	// ③ "" clears them as well.
	patch(map[string]any{"outcome": "advanced", "next_follow_at": "2026-11-26T09:00:00Z"})
	fromBlank := patch(map[string]any{"outcome": "", "next_follow_at": ""})
	if fromBlank.Outcome != nil || fromBlank.NextFollowAt != nil {
		t.Fatalf("follow-up after \"\" clears = %+v, want nulls", fromBlank)
	}

	// ④ The NOT NULL column refuses instead of pretending: neither null nor ""
	// may leave the stored summary in place while the client believes it cleared.
	for _, body := range []map[string]any{{"summary": nil}, {"summary": ""}, {"summary": "   "}} {
		req := withURLParam(workbenchRequest(t, "PATCH", "/api/workbench/bd/activities/"+activity.ID, body, testUserID),
			"activityId", activity.ID)
		testutil.Call(t, testHandler.UpdateBdActivity, req).Want(http.StatusBadRequest)
	}
	if dbfx.Count(t, `SELECT count(*) FROM creator_activity WHERE id = $1 AND summary = $2`,
		activity.ID, "第一次私信，问了报价区间") != 1 {
		t.Fatalf("a refused clear changed the stored summary")
	}
}

// TestBdQuoteItemsNullIsNotAClear is the regression guard for the agent write
// channel: a nil `json.RawMessage` is re-encoded as `null` when the tool replays its
// body, and that used to read as "the caller sent items" — which tripped the agent
// money gate (no agent could create a quote at all) and, on a PATCH, wiped the
// breakdown. `items` is NOT NULL with a `[]` default, so `[]` is how it empties;
// `null` means "not sent".
func TestBdQuoteItemsNullIsNotAClear(t *testing.T) {
	creator := createWorkbenchCreator(t, testUserID, "Quote items creator")
	quote := bdCreateQuote(t, "", testUserID, creator.ID, map[string]any{
		"items": []map[string]any{{"label": "坑位费", "amount": 3000}},
	})

	req := withURLParam(workbenchRequest(t, "PATCH", "/api/workbench/bd/quotes/"+quote.ID,
		map[string]any{"note": "只改备注"}, testUserID), "quoteId", quote.ID)
	testutil.Decode[BdQuoteResponse](t, testHandler.UpdateBdQuote, req, http.StatusOK)
	if dbfx.Count(t, `SELECT count(*) FROM creator_quote WHERE id = $1 AND items <> '[]'::jsonb`, quote.ID) != 1 {
		t.Fatalf("a note-only PATCH emptied the quote's items")
	}

	// An explicit null keeps it too: it is "not sent", not "clear".
	req = withURLParam(workbenchRequest(t, "PATCH", "/api/workbench/bd/quotes/"+quote.ID,
		map[string]any{"items": nil}, testUserID), "quoteId", quote.ID)
	keptItems := testutil.Decode[BdQuoteResponse](t, testHandler.UpdateBdQuote, req, http.StatusOK)
	if string(keptItems.Items) == "[]" {
		t.Fatalf("items after {\"items\": null} = %s, want the stored breakdown", keptItems.Items)
	}
}

// TestCrmCollabInstantClearing covers the four TIMESTAMPTZ columns the
// collaboration body carries. `scheduled_at` and the three stage milestones were
// still `*string` after the first §3.4 batch, so `{"scheduled_at": null}` kept the
// stored instant and answered 200 — the bug this case pins.
func TestCrmCollabInstantClearing(t *testing.T) {
	client := createWorkbenchClient(t, testUserID, "Collab instant client")
	brief := createWorkbenchBrief(t, client.ID, "Collab instant brief")
	creator := createWorkbenchCreator(t, testUserID, "Collab instant creator")
	// `accepted` stamps all three milestones on create (collabStageMilestones).
	collab := createWorkbenchCollab(t, brief.ID, creator.ID, map[string]any{
		"stage":        "accepted",
		"scheduled_at": "2026-11-20T09:00:00Z",
	})
	instants := map[string]any{
		"scheduled_at": "2026-11-20T09:00:00Z",
		"confirmed_at": "2026-11-19T09:00:00Z",
		"published_at": "2026-11-21T09:00:00Z",
		"accepted_at":  "2026-11-22T09:00:00Z",
	}
	columns := []string{"scheduled_at", "confirmed_at", "published_at", "accepted_at"}

	// ① Omitted keeps every instant: a PATCH about something else clears nothing.
	kept := collabPatch(t, collab.ID, map[string]any{"prob": 0.5})
	if kept.ScheduledAt == nil || kept.ConfirmedAt == nil || kept.PublishedAt == nil || kept.AcceptedAt == nil {
		t.Fatalf("instants after an unrelated PATCH = %+v, want all four stored", kept)
	}
	for _, column := range columns {
		if columnIsNull(t, "crm_collab", column, collab.ID) {
			t.Fatalf("%s became NULL although the PATCH never mentioned it", column)
		}
	}

	// ② null clears.
	cleared := collabPatch(t, collab.ID, map[string]any{
		"scheduled_at": nil, "confirmed_at": nil, "published_at": nil, "accepted_at": nil,
	})
	if cleared.ScheduledAt != nil || cleared.ConfirmedAt != nil ||
		cleared.PublishedAt != nil || cleared.AcceptedAt != nil {
		t.Fatalf("cleared collab = %+v, want every instant null", cleared)
	}
	for _, column := range columns {
		if !columnIsNull(t, "crm_collab", column, collab.ID) {
			t.Fatalf("%s is not NULL after {\"field\": null}", column)
		}
	}

	// ③ "" clears as well (the pre-§3.4 spelling).
	collabPatch(t, collab.ID, instants)
	fromBlank := collabPatch(t, collab.ID, map[string]any{
		"scheduled_at": "", "confirmed_at": "", "published_at": "", "accepted_at": "",
	})
	if fromBlank.ScheduledAt != nil || fromBlank.ConfirmedAt != nil ||
		fromBlank.PublishedAt != nil || fromBlank.AcceptedAt != nil {
		t.Fatalf("collab after \"\" clears = %+v, want nulls", fromBlank)
	}
	for _, column := range columns {
		if !columnIsNull(t, "crm_collab", column, collab.ID) {
			t.Fatalf("%s is not NULL after {\"field\": \"\"}", column)
		}
	}
}

// TestCrmBriefBudgetAndScheduleClearing covers the two budget bounds and the
// schedule window (§3.4), plus the NOT NULL `title` beside them: a brief with no
// title is a row nobody can identify, so `null` and `""` answer 400 that names the
// field.
func TestCrmBriefBudgetAndScheduleClearing(t *testing.T) {
	client := createWorkbenchClient(t, testUserID, "Brief clearing client")
	brief := createWorkbenchBrief(t, client.ID, "Brief clearing brief")

	patch := func(body map[string]any) CrmBriefResponse {
		t.Helper()
		req := withURLParam(workbenchRequest(t, "PATCH", "/api/workbench/crm/briefs/"+brief.ID, body, testUserID),
			"briefId", brief.ID)
		return testutil.Decode[CrmBriefResponse](t, testHandler.UpdateCrmBrief, req, http.StatusOK)
	}
	values := map[string]any{
		"budget_min_amount": 1000,
		"budget_max_amount": 5000,
		"schedule_from":     "2026-12-01",
		"schedule_to":       "2026-12-31",
	}
	patch(values)

	// ① Omitted keeps.
	kept := patch(map[string]any{"status": "open"})
	if kept.BudgetMinAmount == nil || *kept.BudgetMinAmount != 1000 ||
		kept.BudgetMaxAmount == nil || *kept.BudgetMaxAmount != 5000 {
		t.Fatalf("budgets after a status-only PATCH = %+v, want 1000 / 5000", kept)
	}
	if kept.ScheduleFrom == nil || *kept.ScheduleFrom != "2026-12-01" ||
		kept.ScheduleTo == nil || *kept.ScheduleTo != "2026-12-31" {
		t.Fatalf("schedule after a status-only PATCH = %+v, want the stored window", kept)
	}

	// ② null clears.
	cleared := patch(map[string]any{
		"budget_min_amount": nil, "budget_max_amount": nil,
		"schedule_from": nil, "schedule_to": nil,
	})
	if cleared.BudgetMinAmount != nil || cleared.BudgetMaxAmount != nil ||
		cleared.ScheduleFrom != nil || cleared.ScheduleTo != nil {
		t.Fatalf("cleared brief = %+v, want every field null", cleared)
	}
	for _, column := range []string{"budget_min_amount", "budget_max_amount", "schedule_from", "schedule_to"} {
		if !columnIsNull(t, "crm_brief", column, brief.ID) {
			t.Fatalf("%s is not NULL after {\"field\": null}", column)
		}
	}

	// ③ "" clears too.
	patch(values)
	fromBlank := patch(map[string]any{
		"budget_min_amount": "", "budget_max_amount": "",
		"schedule_from": "", "schedule_to": "",
	})
	if fromBlank.BudgetMinAmount != nil || fromBlank.BudgetMaxAmount != nil ||
		fromBlank.ScheduleFrom != nil || fromBlank.ScheduleTo != nil {
		t.Fatalf("brief after \"\" clears = %+v, want nulls", fromBlank)
	}

	// ④ title is NOT NULL: both spellings are a 400 that names the field, and the
	// stored title survives.
	for _, body := range []map[string]any{{"title": nil}, {"title": ""}} {
		req := withURLParam(workbenchRequest(t, "PATCH", "/api/workbench/crm/briefs/"+brief.ID, body, testUserID),
			"briefId", brief.ID)
		var out map[string]any
		testutil.Call(t, testHandler.UpdateCrmBrief, req).Want(http.StatusBadRequest).JSON(&out)
		if message, _ := out["error"].(string); !strings.Contains(message, "title") {
			t.Fatalf("400 body = %v, want it to name title", out)
		}
	}
	if dbfx.Count(t, `SELECT count(*) FROM crm_brief WHERE id = $1 AND title = $2`, brief.ID, "Brief clearing brief") != 1 {
		t.Fatalf("a refused clear changed the stored title")
	}
}

// TestCrmSettlementAmountAndDueClearing covers `due_at` (§3.4) and the NOT NULL
// `amount` beside it: a settlement with no amount is not a row, so `null` and `""`
// answer 400 and the stored number survives.
func TestCrmSettlementAmountAndDueClearing(t *testing.T) {
	client := createWorkbenchClient(t, testUserID, "Settlement amount client")
	brief := createWorkbenchBrief(t, client.ID, "Settlement amount brief")
	creator := createWorkbenchCreator(t, testUserID, "Settlement amount creator")
	collab := createWorkbenchCollab(t, brief.ID, creator.ID, map[string]any{"stage": "accepted"})

	req := workbenchRequest(t, "POST", "/api/workbench/crm/settlements", map[string]any{
		"collab_id": collab.ID,
		"kind":      "final",
		"amount":    7000,
		"due_at":    "2026-12-01",
	}, testUserID)
	settlement := testutil.Decode[CrmSettlementResponse](t, testHandler.CreateCrmSettlement, req, http.StatusCreated)
	t.Cleanup(func() { dbfx.Exec(t, `DELETE FROM crm_settlement WHERE id = $1`, settlement.ID) })

	patch := func(body map[string]any) CrmSettlementResponse {
		t.Helper()
		req := withURLParam(workbenchRequest(t, "PATCH", "/api/workbench/crm/settlements/"+settlement.ID, body, testUserID),
			"settlementId", settlement.ID)
		return testutil.Decode[CrmSettlementResponse](t, testHandler.UpdateCrmSettlement, req, http.StatusOK)
	}

	// ① Omitted keeps.
	kept := patch(map[string]any{"note": "只改备注"})
	if kept.DueAt == nil || *kept.DueAt != "2026-12-01" || kept.Amount != 7000 {
		t.Fatalf("settlement after a note-only PATCH = %+v, want the stored due_at and amount", kept)
	}

	// ② due_at: null clears.
	cleared := patch(map[string]any{"due_at": nil})
	if cleared.DueAt != nil {
		t.Fatalf("due_at after {\"due_at\": null} = %v, want null", cleared.DueAt)
	}
	if !columnIsNull(t, "crm_settlement", "due_at", settlement.ID) {
		t.Fatalf("due_at is not NULL after {\"due_at\": null}")
	}

	// ③ due_at: "" clears.
	patch(map[string]any{"due_at": "2026-12-02"})
	if fromBlank := patch(map[string]any{"due_at": ""}); fromBlank.DueAt != nil {
		t.Fatalf("due_at after \"\" = %v, want null", fromBlank.DueAt)
	}

	// ④ amount is NOT NULL: 400, and the stored amount does not move.
	for _, body := range []map[string]any{{"amount": nil}, {"amount": ""}} {
		req := withURLParam(workbenchRequest(t, "PATCH", "/api/workbench/crm/settlements/"+settlement.ID, body, testUserID),
			"settlementId", settlement.ID)
		var out map[string]any
		testutil.Call(t, testHandler.UpdateCrmSettlement, req).Want(http.StatusBadRequest).JSON(&out)
		if message, _ := out["error"].(string); !strings.Contains(message, "amount") {
			t.Fatalf("400 body = %v, want it to name amount", out)
		}
	}
	if dbfx.Count(t, `SELECT count(*) FROM crm_settlement WHERE id = $1 AND amount = 7000`, settlement.ID) != 1 {
		t.Fatalf("a refused clear changed the stored amount")
	}
}

// TestBdQuoteQuotedAtClearing covers `quoted_at`, the second date a quote carries
// beside `valid_until`: a draft quote has not been spoken yet, so the field has to
// be clearable, and "cleared" has to land on NULL because `valid_until` is checked
// against it on the next write.
func TestBdQuoteQuotedAtClearing(t *testing.T) {
	creator := createWorkbenchCreator(t, testUserID, "Quote instant creator")
	quote := bdCreateQuote(t, "", testUserID, creator.ID, map[string]any{
		"quoted_at": "2026-11-10T09:00:00Z",
	})

	patch := func(body map[string]any) BdQuoteResponse {
		t.Helper()
		req := withURLParam(workbenchRequest(t, "PATCH", "/api/workbench/bd/quotes/"+quote.ID, body, testUserID),
			"quoteId", quote.ID)
		return testutil.Decode[BdQuoteResponse](t, testHandler.UpdateBdQuote, req, http.StatusOK)
	}

	// ① Omitted keeps.
	kept := patch(map[string]any{"status": "accepted"})
	if kept.QuotedAt == nil {
		t.Fatalf("quoted_at after a status-only PATCH = nil, want the stored instant")
	}

	// ② null clears.
	cleared := patch(map[string]any{"quoted_at": nil})
	if cleared.QuotedAt != nil {
		t.Fatalf("quoted_at after {\"quoted_at\": null} = %v, want null", cleared.QuotedAt)
	}
	if !columnIsNull(t, "creator_quote", "quoted_at", quote.ID) {
		t.Fatalf("quoted_at is not NULL after {\"quoted_at\": null}")
	}

	// ③ "" clears too.
	patch(map[string]any{"quoted_at": "2026-11-11T09:00:00Z"})
	if fromBlank := patch(map[string]any{"quoted_at": ""}); fromBlank.QuotedAt != nil {
		t.Fatalf("quoted_at after \"\" = %v, want null", fromBlank.QuotedAt)
	}
	if !columnIsNull(t, "creator_quote", "quoted_at", quote.ID) {
		t.Fatalf("quoted_at is not NULL after {\"quoted_at\": \"\"}")
	}
}

// TestBdActivityHappenedAtRejectsClear covers the NOT NULL instant of a follow-up
// (`creator_activity.happened_at`): both spellings are a 400 that names the field,
// because a follow-up that did not happen cannot be stored.
func TestBdActivityHappenedAtRejectsClear(t *testing.T) {
	creator := createWorkbenchCreator(t, testUserID, "Follow-up instant creator")
	activity := bdCreateActivity(t, "", testUserID, creator.ID, nil)

	for _, body := range []map[string]any{{"happened_at": nil}, {"happened_at": ""}} {
		req := withURLParam(workbenchRequest(t, "PATCH", "/api/workbench/bd/activities/"+activity.ID, body, testUserID),
			"activityId", activity.ID)
		var out map[string]any
		testutil.Call(t, testHandler.UpdateBdActivity, req).Want(http.StatusBadRequest).JSON(&out)
		if message, _ := out["error"].(string); !strings.Contains(message, "happened_at") {
			t.Fatalf("400 body = %v, want it to name happened_at", out)
		}
	}
	if dbfx.Count(t, `SELECT count(*) FROM creator_activity WHERE id = $1 AND happened_at IS NOT NULL`, activity.ID) != 1 {
		t.Fatalf("a refused clear changed the stored happened_at")
	}
}

// TestBdCampaignFieldClearing covers the batch's budget and window (§3.4) and its
// NOT NULL `name` (`creator_campaign.name` backs unique index 809).
func TestBdCampaignFieldClearing(t *testing.T) {
	campaign := bdCreateCampaign(t, "", testUserID, map[string]any{"name": "Clearing batch"})

	patch := func(body map[string]any) BdCampaignResponse {
		t.Helper()
		req := withURLParam(workbenchRequest(t, "PATCH", "/api/workbench/bd/campaigns/"+campaign.ID, body, testUserID),
			"campaignId", campaign.ID)
		return testutil.Decode[BdCampaignResponse](t, testHandler.UpdateBdCampaign, req, http.StatusOK)
	}
	values := map[string]any{
		"budget_amount": 3000,
		"started_on":    "2026-12-01",
		"ended_on":      "2026-12-15",
	}
	patch(values)

	// ① Omitted keeps.
	kept := patch(map[string]any{"kind": "comment"})
	if kept.BudgetAmount == nil || *kept.BudgetAmount != 3000 ||
		kept.StartedOn == nil || *kept.StartedOn != "2026-12-01" ||
		kept.EndedOn == nil || *kept.EndedOn != "2026-12-15" {
		t.Fatalf("batch after a kind-only PATCH = %+v, want the stored budget and window", kept)
	}

	// ② null clears.
	cleared := patch(map[string]any{"budget_amount": nil, "started_on": nil, "ended_on": nil})
	if cleared.BudgetAmount != nil || cleared.StartedOn != nil || cleared.EndedOn != nil {
		t.Fatalf("cleared batch = %+v, want nulls", cleared)
	}
	for _, column := range []string{"budget_amount", "started_on", "ended_on"} {
		if !columnIsNull(t, "creator_campaign", column, campaign.ID) {
			t.Fatalf("%s is not NULL after {\"field\": null}", column)
		}
	}

	// ③ "" clears.
	patch(values)
	fromBlank := patch(map[string]any{"budget_amount": "", "started_on": "", "ended_on": ""})
	if fromBlank.BudgetAmount != nil || fromBlank.StartedOn != nil || fromBlank.EndedOn != nil {
		t.Fatalf("batch after \"\" clears = %+v, want nulls", fromBlank)
	}

	// ④ name is NOT NULL.
	for _, body := range []map[string]any{{"name": nil}, {"name": ""}} {
		req := withURLParam(workbenchRequest(t, "PATCH", "/api/workbench/bd/campaigns/"+campaign.ID, body, testUserID),
			"campaignId", campaign.ID)
		var out map[string]any
		testutil.Call(t, testHandler.UpdateBdCampaign, req).Want(http.StatusBadRequest).JSON(&out)
		if message, _ := out["error"].(string); !strings.Contains(message, "name") {
			t.Fatalf("400 body = %v, want it to name name", out)
		}
	}
	if dbfx.Count(t, `SELECT count(*) FROM creator_campaign WHERE id = $1 AND name = $2`, campaign.ID, "Clearing batch") != 1 {
		t.Fatalf("a refused clear changed the stored name")
	}
}

// TestMediaPublishAtClearing covers `media_script.publish_at` (§3.4): a script that
// came back to the writing board has no publish instant, and the clears have to
// land on NULL so the calendar queries stop counting it.
func TestMediaPublishAtClearing(t *testing.T) {
	ip := mediaIPFixture(t, testUserID, "Clearing publish IP")
	topic := mediaTopicFixture(t, testUserID, ip.ID, "Clearing publish topic")
	script := mediaScriptFixture(t, testUserID, topic.ID, "发布用文案")

	patch := func(body map[string]any) MediaScriptResponse {
		t.Helper()
		req := mediaURLParams(workbenchRequest(t, "PATCH", "/api/workbench/media/scripts/"+script.ID, body, testUserID),
			map[string]string{"scriptId": script.ID})
		return testutil.Decode[MediaScriptResponse](t, testHandler.UpdateMediaScript, req, http.StatusOK)
	}

	seeded := patch(map[string]any{"publish_at": "2026-12-01T10:00:00Z"})
	if seeded.PublishAt == nil {
		t.Fatalf("publish_at was not stored")
	}

	// ① Omitted keeps.
	kept := patch(map[string]any{"status": "approved"})
	if kept.PublishAt == nil {
		t.Fatalf("publish_at after a status-only PATCH = nil, want the stored instant")
	}

	// ② null clears.
	cleared := patch(map[string]any{"publish_at": nil})
	if cleared.PublishAt != nil {
		t.Fatalf("publish_at after {\"publish_at\": null} = %v, want null", cleared.PublishAt)
	}
	if !columnIsNull(t, "media_script", "publish_at", script.ID) {
		t.Fatalf("publish_at is not NULL after {\"publish_at\": null}")
	}

	// ③ "" clears.
	patch(map[string]any{"publish_at": "2026-12-02T10:00:00Z"})
	if fromBlank := patch(map[string]any{"publish_at": ""}); fromBlank.PublishAt != nil {
		t.Fatalf("publish_at after \"\" = %v, want null", fromBlank.PublishAt)
	}
}

// TestMediaShootDateRejectsClear covers `media_shoot.shoot_date`, which is NOT
// NULL: a shoot with no day is not schedulable, so both spellings answer 400 that
// names the field and the stored day survives.
func TestMediaShootDateRejectsClear(t *testing.T) {
	ip := mediaIPFixture(t, testUserID, "Clearing shoot IP")
	topic := mediaTopicFixture(t, testUserID, ip.ID, "Clearing shoot topic")
	script := mediaScriptFixture(t, testUserID, topic.ID, "拍摄用文案")
	shoot := mediaShootFixture(t, testUserID, script.ID, "2026-12-05")

	for _, body := range []map[string]any{{"shoot_date": nil}, {"shoot_date": ""}} {
		req := mediaURLParams(workbenchRequest(t, "PATCH", "/api/workbench/media/shoots/"+shoot.ID, body, testUserID),
			map[string]string{"shootId": shoot.ID})
		var out map[string]any
		testutil.Call(t, testHandler.UpdateMediaShoot, req).Want(http.StatusBadRequest).JSON(&out)
		if message, _ := out["error"].(string); !strings.Contains(message, "shoot_date") {
			t.Fatalf("400 body = %v, want it to name shoot_date", out)
		}
	}
	if dbfx.Count(t, `SELECT count(*) FROM media_shoot WHERE id = $1 AND shoot_date = $2`, shoot.ID, "2026-12-05") != 1 {
		t.Fatalf("a refused clear changed the stored shoot_date")
	}
}

// TestMediaNamesRejectClearing covers the two NOT NULL media names (`media_ip.name`
// and `media_topic.title`): both spellings are a 400 that names the field, and the
// stored text survives.
func TestMediaNamesRejectClearing(t *testing.T) {
	ip := mediaIPFixture(t, testUserID, "Clearing name IP")
	topic := mediaTopicFixture(t, testUserID, ip.ID, "Clearing name topic")

	for _, body := range []map[string]any{{"name": nil}, {"name": ""}} {
		req := mediaURLParams(workbenchRequest(t, "PATCH", "/api/workbench/media/ips/"+ip.ID, body, testUserID),
			map[string]string{"ipId": ip.ID})
		var out map[string]any
		testutil.Call(t, testHandler.UpdateMediaIP, req).Want(http.StatusBadRequest).JSON(&out)
		if message, _ := out["error"].(string); !strings.Contains(message, "name") {
			t.Fatalf("ip 400 body = %v, want it to name name", out)
		}
	}
	for _, body := range []map[string]any{{"title": nil}, {"title": ""}} {
		req := mediaURLParams(workbenchRequest(t, "PATCH", "/api/workbench/media/topics/"+topic.ID, body, testUserID),
			map[string]string{"topicId": topic.ID})
		var out map[string]any
		testutil.Call(t, testHandler.UpdateMediaTopic, req).Want(http.StatusBadRequest).JSON(&out)
		if message, _ := out["error"].(string); !strings.Contains(message, "title") {
			t.Fatalf("topic 400 body = %v, want it to name title", out)
		}
	}
	if dbfx.Count(t, `SELECT count(*) FROM media_ip WHERE id = $1 AND name = $2`, ip.ID, "Clearing name IP") != 1 {
		t.Fatalf("a refused clear changed the stored IP name")
	}
	if dbfx.Count(t, `SELECT count(*) FROM media_topic WHERE id = $1 AND title = $2`, topic.ID, "Clearing name topic") != 1 {
		t.Fatalf("a refused clear changed the stored topic title")
	}
}

// TestBdQuotePatchClearing covers `valid_until` and `note` (§3.4). `valid_until`
// is the column every "could this offer still be accepted" read takes at face
// value, which is why clearing it must land on NULL and not on an empty date.
func TestBdQuotePatchClearing(t *testing.T) {
	creator := createWorkbenchCreator(t, testUserID, "Quote clearing creator")
	quote := bdCreateQuote(t, "", testUserID, creator.ID, map[string]any{
		"valid_until": "2026-11-30",
		"note":        "含一条口播",
	})

	patch := func(body map[string]any) BdQuoteResponse {
		t.Helper()
		req := withURLParam(workbenchRequest(t, "PATCH", "/api/workbench/bd/quotes/"+quote.ID, body, testUserID),
			"quoteId", quote.ID)
		return testutil.Decode[BdQuoteResponse](t, testHandler.UpdateBdQuote, req, http.StatusOK)
	}

	// ① Omitted keeps.
	kept := patch(map[string]any{"status": "accepted"})
	if kept.ValidUntil == nil || *kept.ValidUntil != "2026-11-30" {
		t.Fatalf("valid_until after a status-only PATCH = %v, want 2026-11-30", kept.ValidUntil)
	}
	if kept.Note == nil || *kept.Note != "含一条口播" {
		t.Fatalf("note after a status-only PATCH = %v, want the stored note", kept.Note)
	}

	// ② null clears.
	cleared := patch(map[string]any{"valid_until": nil, "note": nil})
	if cleared.ValidUntil != nil || cleared.Note != nil {
		t.Fatalf("cleared quote = %+v, want valid_until and note null", cleared)
	}
	for _, column := range []string{"valid_until", "note"} {
		if !columnIsNull(t, "creator_quote", column, quote.ID) {
			t.Fatalf("%s is not NULL after {\"field\": null}", column)
		}
	}

	// ③ "" clears.
	patch(map[string]any{"valid_until": "2026-12-05", "note": "再谈"})
	fromBlank := patch(map[string]any{"valid_until": "", "note": ""})
	if fromBlank.ValidUntil != nil || fromBlank.Note != nil {
		t.Fatalf("quote after \"\" clears = %+v, want nulls", fromBlank)
	}
	for _, column := range []string{"valid_until", "note"} {
		if !columnIsNull(t, "creator_quote", column, quote.ID) {
			t.Fatalf("%s is not NULL after {\"field\": \"\"}", column)
		}
	}
}
