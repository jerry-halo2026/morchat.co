package handler

import (
	"net/http"
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
