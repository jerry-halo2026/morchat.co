package handler

import (
	"math"
	"net/http"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/jerry-halo2026/morchat.co/server/internal/testutil"
)

// Money-block tests (`GET /api/workbench/finance`). The three properties the
// endpoint has to keep, and the ones these cases pin:
//
//   - a figure with no rows behind it is a gap (`value: null` +
//     `insufficient_data`), never a zero — docs/METRICS.md §1 rule 3;
//   - signed / collected are real zeros on an empty ledger, and they move to the
//     ledger's numbers as soon as a collaboration and a settlement exist;
//   - the department filter narrows the aggregate and nothing else.

func fetchWorkbenchFinance(t *testing.T, query, userID string) WorkbenchFinanceResponse {
	t.Helper()
	req := workbenchRequest(t, "GET", "/api/workbench/finance"+query, nil, userID)
	return testutil.Decode[WorkbenchFinanceResponse](t, testHandler.GetWorkbenchFinance, req, http.StatusOK)
}

// financeDepartment inserts a department owned by nothing in particular. Every
// finance test runs against its own department so the figures are exact even
// though the suite shares one database with other packages' rows.
func financeDepartment(t *testing.T, label string) string {
	t.Helper()
	return dbfx.Insert(t, "department", testutil.Cols{
		"workspace_id": testWorkspaceID,
		"name":         "Finance " + label + " " + t.Name(),
	})
}

// seedFinanceLedger builds one department's worth of money rows through the
// handlers (so the stage milestones the SQL reads are stamped the way production
// stamps them) and returns the department that owns them:
//
//   - one collaboration settled this month: contract 10000, cost 1000;
//   - one settlement that cleared this month: 3000;
//   - one settlement still owed: 500.
//
// Every row is owned by a member of the department, which is the B0 fallback
// chain the aggregate attributes through (docs/METRICS.md §4).
func seedFinanceLedger(t *testing.T, label string) string {
	t.Helper()

	departmentID := financeDepartment(t, label)
	ownerUserID := workbenchTestMember(t)
	// The fixture's member is created without a department; give it this one so
	// every row created below is attributable to it.
	dbfx.Exec(t,
		`UPDATE member SET department_id = $1 WHERE workspace_id = $2 AND user_id = $3`,
		departmentID, testWorkspaceID, ownerUserID)

	client := createWorkbenchClient(t, ownerUserID, "Finance "+label+" client")
	brief := createWorkbenchBrief(t, client.ID, "Finance "+label+" brief")
	creator := createWorkbenchCreator(t, ownerUserID, "Finance "+label+" creator "+strings.ReplaceAll(t.Name(), "/", "-"))

	// One collaboration, confirmed this month and then settled: `confirmed_at` is
	// stamped on the way in and `accepted_at` on the way to `settled`, which is
	// what the signed window and the cost window each read. Going through the
	// transition rather than inserting a settled row keeps the milestones exactly
	// what production writes.
	payload := map[string]any{
		"stage":        "confirmed",
		"final_amount": 10000,
		"creator_fee":  1000,
		"sample_cost":  0,
		"platform_fee": 0,
	}
	req := workbenchRequest(t, "POST", "/api/workbench/crm/collabs", mergeCollabPayload(brief.ID, creator.ID, payload), ownerUserID)
	collab := testutil.Decode[CrmCollabResponse](t, testHandler.CreateCrmCollab, req, http.StatusCreated)
	t.Cleanup(func() { dbfx.Exec(t, `DELETE FROM crm_collab WHERE id = $1`, collab.ID) })

	req = workbenchRequest(t, "PATCH", "/api/workbench/crm/collabs/"+collab.ID, map[string]any{
		"stage": "settled",
	}, ownerUserID)
	req = withURLParam(req, "collabId", collab.ID)
	testutil.Call(t, testHandler.UpdateCrmCollab, req).Want(http.StatusOK)

	today := time.Now().Format("2006-01-02")
	req = workbenchRequest(t, "POST", "/api/workbench/crm/settlements", map[string]any{
		"collab_id": collab.ID,
		"kind":      "final",
		"amount":    3000,
		"paid_at":   today,
	}, ownerUserID)
	paid := testutil.Decode[CrmSettlementResponse](t, testHandler.CreateCrmSettlement, req, http.StatusCreated)
	t.Cleanup(func() { dbfx.Exec(t, `DELETE FROM crm_settlement WHERE id = $1`, paid.ID) })

	req = workbenchRequest(t, "POST", "/api/workbench/crm/settlements", map[string]any{
		"collab_id": collab.ID,
		"kind":      "prepay",
		"amount":    500,
	}, ownerUserID)
	owed := testutil.Decode[CrmSettlementResponse](t, testHandler.CreateCrmSettlement, req, http.StatusCreated)
	t.Cleanup(func() { dbfx.Exec(t, `DELETE FROM crm_settlement WHERE id = $1`, owed.ID) })

	return departmentID
}

func mergeCollabPayload(briefID, creatorID string, over map[string]any) map[string]any {
	payload := map[string]any{"brief_id": briefID, "creator_id": creatorID}
	for key, value := range over {
		payload[key] = value
	}
	return payload
}

func assertGap(t *testing.T, label string, block WorkbenchFinanceBlock) {
	t.Helper()
	if block.Value != nil {
		t.Fatalf("%s = %v, want null (a figure with no rows is a gap, not a zero)", label, *block.Value)
	}
	if block.Empty != metricEmptyInsufficientData {
		t.Fatalf("%s empty = %q, want %q", label, block.Empty, metricEmptyInsufficientData)
	}
}

// assertCostGap is `assertGap` for the two figures that carry a basis: the
// three-state entry is embedded, so the assertion reads it through the field.
func assertCostGap(t *testing.T, label string, block WorkbenchFinanceCostBlock) {
	t.Helper()
	assertGap(t, label, block.WorkbenchFinanceBlock)
}

// TestWorkbenchFinanceEmptyMonthReportsGaps is the three-state guard: in a
// department with no money rows, the three figures that need rows come back null
// and flagged, while signed and collected answer with a real zero.
func TestWorkbenchFinanceEmptyMonthReportsGaps(t *testing.T) {
	departmentID := financeDepartment(t, "empty")

	figure := fetchWorkbenchFinance(t, "?department_id="+departmentID, testUserID)

	// `YYYY-MM`, sliced by the same now() the SQL windows use.
	if len(figure.Window.Month) != 7 || figure.Window.Month[4] != '-' {
		t.Fatalf("window.month = %q, want YYYY-MM", figure.Window.Month)
	}

	assertCostGap(t, "gross_margin", figure.GrossMargin)
	assertGap(t, "receivable_days", figure.ReceivableDays)
	// No opening cash balance and no month entry exist, so this one is a gap until
	// the month is entered (707) — the client's copy names which input is missing,
	// which is why the basis travels with the figure.
	assertCostGap(t, "cash_floor", figure.CashFloor)

	// Neither cost set exists: no entry, and nothing settled this month.
	if figure.GrossMargin.Basis != financeBasisNone {
		t.Fatalf("gross_margin basis = %q, want %q", figure.GrossMargin.Basis, financeBasisNone)
	}
	if figure.CashFloor.Basis != financeBasisNone {
		t.Fatalf("cash_floor basis = %q, want %q", figure.CashFloor.Basis, financeBasisNone)
	}

	for label, block := range map[string]WorkbenchFinanceBlock{
		"signed":    figure.Signed,
		"collected": figure.Collected,
	} {
		if block.Value == nil || *block.Value != 0 {
			t.Fatalf("%s = %v in an empty department, want a real 0", label, block.Value)
		}
		if block.Empty != metricEmptyZero {
			t.Fatalf("%s empty = %q, want %q", label, block.Empty, metricEmptyZero)
		}
		if block.SampleCount != 0 {
			t.Fatalf("%s sample_count = %d, want 0", label, block.SampleCount)
		}
	}
}

// TestWorkbenchFinanceReadsTheLedgers is the definition of done for the block: a
// settled collaboration and a cleared settlement turn the gaps into the exact
// numbers the rows describe.
func TestWorkbenchFinanceReadsTheLedgers(t *testing.T) {
	departmentID := seedFinanceLedger(t, "ledger")

	figure := fetchWorkbenchFinance(t, "?department_id="+departmentID, testUserID)

	if figure.Signed.Value == nil || *figure.Signed.Value != 10000 {
		t.Fatalf("signed = %v, want 10000 (the settled collaboration's contract)", figure.Signed.Value)
	}
	if figure.Signed.SampleCount != 1 {
		t.Fatalf("signed sample_count = %d, want 1", figure.Signed.SampleCount)
	}

	// Only the settlement with a `paid_at` this month counts as money collected;
	// the one still owed is a receivable.
	if figure.Collected.Value == nil || *figure.Collected.Value != 3000 {
		t.Fatalf("collected = %v, want 3000", figure.Collected.Value)
	}
	if figure.Collected.SampleCount != 1 {
		t.Fatalf("collected sample_count = %d, want 1", figure.Collected.SampleCount)
	}

	// (3000 collected − 1000 settled cost) / 3000, at the 0–1 storage scale
	// (docs/METRICS.md C3).
	if figure.GrossMargin.Value == nil {
		t.Fatal("gross_margin = null, want a ratio: both sides of the division exist")
	}
	margin := *figure.GrossMargin.Value
	if margin < 0 || margin > 1 {
		t.Fatalf("gross_margin = %v, want a 0–1 ratio", margin)
	}
	if math.Abs(margin-(2.0/3.0)) > 1e-6 {
		t.Fatalf("gross_margin = %v, want 2/3 (3000 collected, 1000 cost)", margin)
	}
	// No month entry was made, so the cost side is the settled collaborations'
	// own fees — the fallback the basis names.
	if figure.GrossMargin.Basis != financeBasisSettledCollabs {
		t.Fatalf("gross_margin basis = %q, want %q", figure.GrossMargin.Basis, financeBasisSettledCollabs)
	}

	// One settlement is still owed: its age is measurable, and it is tiny because
	// the row was created by this test.
	if figure.ReceivableDays.Value == nil {
		t.Fatal("receivable_days = null, want the age of the one unpaid settlement")
	}
	if *figure.ReceivableDays.Value < 0 {
		t.Fatalf("receivable_days = %v, want a non-negative age", *figure.ReceivableDays.Value)
	}
	if figure.ReceivableDays.SampleCount != 1 {
		t.Fatalf("receivable_days sample_count = %d, want 1 unpaid settlement", figure.ReceivableDays.SampleCount)
	}

	assertCostGap(t, "cash_floor", figure.CashFloor)
}

// TestWorkbenchFinanceKeepsOneCurrencyPerWindow is the money-caliber guard: a
// collaboration billed in USD and one billed in CNY must not add up. The block
// follows `bd/performance` and answers in the window's dominant currency — the
// sum covers that currency's rows only, and `window.currency` names which one.
// Before this rule the same two rows reported `signed: 9000` with no unit at all.
func TestWorkbenchFinanceKeepsOneCurrencyPerWindow(t *testing.T) {
	departmentID := financeDepartment(t, "currency")
	ownerUserID := workbenchTestMember(t)
	dbfx.Exec(t,
		`UPDATE member SET department_id = $1 WHERE workspace_id = $2 AND user_id = $3`,
		departmentID, testWorkspaceID, ownerUserID)

	client := createWorkbenchClient(t, ownerUserID, "Finance currency client")
	brief := createWorkbenchBrief(t, client.ID, "Finance currency brief")
	creator := createWorkbenchCreator(t, ownerUserID, "Finance currency creator")

	createCollab := func(amount float64, currency string) CrmCollabResponse {
		t.Helper()
		req := workbenchRequest(t, "POST", "/api/workbench/crm/collabs", mergeCollabPayload(brief.ID, creator.ID, map[string]any{
			"stage":        "confirmed",
			"final_amount": amount,
			"currency":     currency,
			"creator_fee":  0,
			"sample_cost":  0,
			"platform_fee": 0,
		}), ownerUserID)
		collab := testutil.Decode[CrmCollabResponse](t, testHandler.CreateCrmCollab, req, http.StatusCreated)
		t.Cleanup(func() { dbfx.Exec(t, `DELETE FROM crm_collab WHERE id = $1`, collab.ID) })
		return collab
	}

	// CNY twice, USD once: the dominant currency is CNY, so the block answers
	// 4000 + 1000 and leaves the 7000 USD collaboration out of the total.
	cnyA := createCollab(4000, "CNY")
	cnyB := createCollab(1000, "CNY")
	createCollab(7000, "USD")

	today := time.Now().Format("2006-01-02")
	for _, collab := range []CrmCollabResponse{cnyA, cnyB} {
		req := workbenchRequest(t, "POST", "/api/workbench/crm/settlements", map[string]any{
			"collab_id": collab.ID,
			"kind":      "final",
			"amount":    100,
			"currency":  "CNY",
			"paid_at":   today,
		}, ownerUserID)
		paid := testutil.Decode[CrmSettlementResponse](t, testHandler.CreateCrmSettlement, req, http.StatusCreated)
		t.Cleanup(func() { dbfx.Exec(t, `DELETE FROM crm_settlement WHERE id = $1`, paid.ID) })
	}

	figure := fetchWorkbenchFinance(t, "?department_id="+departmentID, testUserID)

	if figure.Window.Currency != "CNY" {
		t.Fatalf("window.currency = %q, want CNY (the window's dominant currency)", figure.Window.Currency)
	}
	if figure.Signed.Value == nil {
		t.Fatal("signed = null, want the CNY collaborations' total")
	}
	if got := *figure.Signed.Value; got != 5000 {
		t.Fatalf("signed = %v, want 5000 (CNY rows only: 4000 + 1000)", got)
	}
	if figure.Signed.SampleCount != 2 {
		t.Fatalf("signed sample_count = %d, want 2 (the two CNY collaborations)", figure.Signed.SampleCount)
	}
	if figure.Collected.Value == nil {
		t.Fatal("collected = null, want the two CNY settlements' total")
	}
	if got := *figure.Collected.Value; got != 200 {
		t.Fatalf("collected = %v, want 200 (the two CNY settlements)", got)
	}
}

// TestWorkbenchFinanceDepartmentFilterIsolatesRows proves the filter narrows the
// aggregate: the same request against another department answers with zeros and
// gaps, so one department's money never shows up in another's block.
func TestWorkbenchFinanceDepartmentFilterIsolatesRows(t *testing.T) {
	funded := seedFinanceLedger(t, "funded department")
	other := financeDepartment(t, "other department")

	inFunded := fetchWorkbenchFinance(t, "?department_id="+funded, testUserID)
	if inFunded.Signed.Value == nil || *inFunded.Signed.Value != 10000 {
		t.Fatalf("signed for the funded department = %v, want 10000", inFunded.Signed.Value)
	}
	if inFunded.Collected.Value == nil || *inFunded.Collected.Value != 3000 {
		t.Fatalf("collected for the funded department = %v, want 3000", inFunded.Collected.Value)
	}

	inOther := fetchWorkbenchFinance(t, "?department_id="+other, testUserID)
	if inOther.Signed.Value == nil || *inOther.Signed.Value != 0 {
		t.Fatalf("signed for the other department = %v, want 0", inOther.Signed.Value)
	}
	if inOther.Collected.Value == nil || *inOther.Collected.Value != 0 {
		t.Fatalf("collected for the other department = %v, want 0", inOther.Collected.Value)
	}
	assertCostGap(t, "gross_margin in the other department", inOther.GrossMargin)
	assertGap(t, "receivable_days in the other department", inOther.ReceivableDays)

	// The workspace-wide request still sees the funded rows on top of whatever the
	// rest of the suite left behind, so it is a lower bound here rather than an
	// equality: this test runs in a shared database.
	all := fetchWorkbenchFinance(t, "", testUserID)
	if all.Signed.Value == nil || *all.Signed.Value < 10000 {
		t.Fatalf("workspace-wide signed = %v, want at least the funded 10000", all.Signed.Value)
	}
}

// TestWorkbenchFinanceRejectsMalformedDepartment guards the shared filter parser
// through this endpoint too: a malformed department id must be a 400, never a
// silent widening to the whole workspace.
func TestWorkbenchFinanceRejectsMalformedDepartment(t *testing.T) {
	req := workbenchRequest(t, "GET", "/api/workbench/finance?department_id=not-a-uuid", nil, testUserID)
	testutil.Call(t, testHandler.GetWorkbenchFinance, req).Want(http.StatusBadRequest)
}

// ---- the month entry that feeds the cost side (migration 707) ----------------
//
// The block used to have two permanent gaps because no table held the inputs:
// gross margin needed a cost side, and the cash floor needed an opening balance.
// These cases pin the entry's own REST surface and the two figures it lights up.

// currentFinanceMonthStart is the month key the block describes, taken from the
// block itself so the fixture and the SQL's own `now()` cannot disagree.
func currentFinanceMonthStart(t *testing.T) string {
	t.Helper()
	month := fetchWorkbenchFinance(t, "", testUserID).Window.Month
	if month == "" {
		t.Fatal("window.month is empty, cannot build a month key")
	}
	return month + "-01"
}

// clearFinanceMonth removes the workspace's entry for one month, before and after
// the test: the suite shares one database, and a leftover entry would hand every
// other finance case a cost side it does not expect.
func clearFinanceMonth(t *testing.T, month string) {
	t.Helper()
	drop := func() {
		dbfx.Exec(t, `DELETE FROM ops_finance_month WHERE workspace_id = $1 AND month = $2`, testWorkspaceID, month)
	}
	drop()
	t.Cleanup(drop)
}

func putFinanceMonth(t *testing.T, userID string, body map[string]any) WorkbenchFinanceMonthResponse {
	t.Helper()
	req := workbenchRequest(t, "PUT", "/api/workbench/finance/months", body, userID)
	return testutil.Decode[WorkbenchFinanceMonthResponse](t, testHandler.UpsertWorkbenchFinanceMonth, req, http.StatusOK)
}

func listFinanceMonths(t *testing.T, query, userID string) WorkbenchFinanceMonthListResponse {
	t.Helper()
	req := workbenchRequest(t, "GET", "/api/workbench/finance/months"+query, nil, userID)
	return testutil.Decode[WorkbenchFinanceMonthListResponse](t, testHandler.ListWorkbenchFinanceMonths, req, http.StatusOK)
}

// TestWorkbenchFinanceMonthUpsertRoundTrips is (1): what a PUT stores is what a
// GET reads back, and a second PUT edits that row instead of adding one — the
// partial unique index (708) is the key the upsert infers.
func TestWorkbenchFinanceMonthUpsertRoundTrips(t *testing.T) {
	month := currentFinanceMonthStart(t)
	clearFinanceMonth(t, month)

	created := putFinanceMonth(t, testUserID, map[string]any{
		"month":         month,
		"cash_open":     50000,
		"fixed_cost":    12000.5,
		"variable_cost": 3400,
		"note":          "rent + payroll",
	})
	if created.Month != month {
		t.Fatalf("stored month = %q, want %q", created.Month, month)
	}
	if created.CashOpen == nil || *created.CashOpen != 50000 {
		t.Fatalf("stored cash_open = %v, want 50000", created.CashOpen)
	}
	if created.FixedCost == nil || *created.FixedCost != 12000.5 {
		t.Fatalf("stored fixed_cost = %v, want 12000.5", created.FixedCost)
	}
	if created.Note == nil || *created.Note != "rent + payroll" {
		t.Fatalf("stored note = %v", created.Note)
	}

	// The lookup the entry dialog pre-fills from: `?month=YYYY-MM`.
	looked := listFinanceMonths(t, "?month="+month[:7], testUserID)
	if looked.Total != 1 || len(looked.Months) != 1 {
		t.Fatalf("?month=%s returned %d row(s), want 1", month[:7], looked.Total)
	}
	if looked.Months[0].ID != created.ID {
		t.Fatalf("lookup returned %s, want %s", looked.Months[0].ID, created.ID)
	}
	if looked.Months[0].VariableCost == nil || *looked.Months[0].VariableCost != 3400 {
		t.Fatalf("read-back variable_cost = %v, want 3400", looked.Months[0].VariableCost)
	}

	// Second PUT: same row, new amounts. PUT replaces the month, so an omitted
	// field is stored as NULL, not merged from the previous write.
	updated := putFinanceMonth(t, testUserID, map[string]any{
		"month":      month,
		"fixed_cost": 15000,
	})
	if updated.ID != created.ID {
		t.Fatalf("second PUT wrote %s, want the same row %s", updated.ID, created.ID)
	}
	if updated.FixedCost == nil || *updated.FixedCost != 15000 {
		t.Fatalf("updated fixed_cost = %v, want 15000", updated.FixedCost)
	}
	if updated.CashOpen != nil {
		t.Fatalf("updated cash_open = %v, want null (an omitted field is not recorded)", updated.CashOpen)
	}
	if updated.CreatedBy == nil {
		t.Fatal("created_by = null, want the member who first wrote the month")
	}

	history := listFinanceMonths(t, "", testUserID)
	if history.Total != 1 {
		t.Fatalf("history has %d row(s), want 1 (an upsert must not add a second)", history.Total)
	}
}

// TestWorkbenchFinanceMonthWriteIsAdminOnly is (2): the entry is workspace-wide
// bookkeeping with no owner column, so a plain member is refused outright while
// still reading the history.
func TestWorkbenchFinanceMonthWriteIsAdminOnly(t *testing.T) {
	month := currentFinanceMonthStart(t)
	clearFinanceMonth(t, month)

	memberUserID := workbenchTestMember(t)
	req := workbenchRequest(t, "PUT", "/api/workbench/finance/months", map[string]any{
		"month":      month,
		"fixed_cost": 1000,
	}, memberUserID)
	testutil.Call(t, testHandler.UpsertWorkbenchFinanceMonth, req).Want(http.StatusForbidden)

	if listed := listFinanceMonths(t, "", memberUserID); listed.Total != 0 {
		t.Fatalf("a rejected write left %d row(s) behind", listed.Total)
	}
}

// TestWorkbenchFinanceMonthRejectsBadInput keeps the stored key honest: it is a
// month start (C7), and an amount outside the column's range is a 400 rather than
// a constraint violation from PostgreSQL.
func TestWorkbenchFinanceMonthRejectsBadInput(t *testing.T) {
	month := currentFinanceMonthStart(t)
	clearFinanceMonth(t, month)

	cases := map[string]map[string]any{
		"mid-month key":    {"month": month[:8] + "15"},
		"bare month key":   {"month": month[:7]},
		"missing month":    {"fixed_cost": 100},
		"negative amount":  {"month": month, "fixed_cost": -1},
		"amount over 1e12": {"month": month, "variable_cost": 1e13},
		"note too long":    {"month": month, "note": strings.Repeat("x", 2001)},
	}
	for label, body := range cases {
		req := workbenchRequest(t, "PUT", "/api/workbench/finance/months", body, testUserID)
		t.Run(label, func(t *testing.T) {
			testutil.Call(t, testHandler.UpsertWorkbenchFinanceMonth, req).Want(http.StatusBadRequest)
		})
	}
}

// TestWorkbenchFinanceMarginUsesEnteredCost is (3): when the month has a cost
// bill, that is the cost side — the settled collaborations' fees are not
// consulted, and the basis says so.
func TestWorkbenchFinanceMarginUsesEnteredCost(t *testing.T) {
	departmentID := seedFinanceLedger(t, "entered cost")
	month := currentFinanceMonthStart(t)
	clearFinanceMonth(t, month)

	// 600 fixed + 400 variable against 3000 collected leaves 2000 / 3000. The
	// seeded collaboration's own 1000 cost is deliberately different, so a
	// fallback to it would show up as a different ratio.
	putFinanceMonth(t, testUserID, map[string]any{
		"month":         month,
		"fixed_cost":    600,
		"variable_cost": 400,
	})

	figure := fetchWorkbenchFinance(t, "?department_id="+departmentID, testUserID)
	if figure.GrossMargin.Basis != financeBasisEntered {
		t.Fatalf("gross_margin basis = %q, want %q", figure.GrossMargin.Basis, financeBasisEntered)
	}
	if figure.GrossMargin.Value == nil {
		t.Fatal("gross_margin = null, want a ratio: collected money and an entered cost both exist")
	}
	if got := *figure.GrossMargin.Value; math.Abs(got-(2.0/3.0)) > 1e-6 {
		t.Fatalf("gross_margin = %v, want 2/3 (3000 collected, 1000 entered cost)", got)
	}
	// A cost bill with no opening balance still leaves the cash floor a gap.
	assertCostGap(t, "cash_floor", figure.CashFloor)
}

// TestWorkbenchFinanceCashFloorNeedsOpeningCash is (5) plus the point of the whole
// block: an opening balance turns the cash floor into a number, and without one
// the figure stays a gap even when the month's costs are known.
func TestWorkbenchFinanceCashFloorNeedsOpeningCash(t *testing.T) {
	departmentID := seedFinanceLedger(t, "cash floor")
	month := currentFinanceMonthStart(t)
	clearFinanceMonth(t, month)

	// Costs but no balance: the floor is still unmeasurable.
	putFinanceMonth(t, testUserID, map[string]any{
		"month":      month,
		"fixed_cost": 1000,
	})
	withoutCash := fetchWorkbenchFinance(t, "?department_id="+departmentID, testUserID)
	assertCostGap(t, "cash_floor", withoutCash.CashFloor)
	if withoutCash.CashFloor.Basis != financeBasisNone {
		t.Fatalf("cash_floor basis = %q, want %q while the balance is missing", withoutCash.CashFloor.Basis, financeBasisNone)
	}

	// The same month with a balance: opening + collected − (fixed + variable).
	putFinanceMonth(t, testUserID, map[string]any{
		"month":         month,
		"cash_open":     20000,
		"fixed_cost":    1000,
		"variable_cost": 500,
	})
	withCash := fetchWorkbenchFinance(t, "?department_id="+departmentID, testUserID)
	if withCash.CashFloor.Value == nil {
		t.Fatal("cash_floor = null, want 20000 + 3000 collected − 1500 cost")
	}
	if got := *withCash.CashFloor.Value; math.Abs(got-21500) > 1e-6 {
		t.Fatalf("cash_floor = %v, want 21500", got)
	}
	if withCash.CashFloor.Basis != financeBasisEntered {
		t.Fatalf("cash_floor basis = %q, want %q", withCash.CashFloor.Basis, financeBasisEntered)
	}
	if withCash.CashFloor.Empty != metricEmptyZero {
		t.Fatalf("cash_floor empty = %q, want %q for a stated figure", withCash.CashFloor.Empty, metricEmptyZero)
	}
}

// TestWorkbenchFinanceReadsTheRequestedMonth covers `?month=` (§3.2): the same
// caliber, a different window. One department holds money in 2025-03 and nothing in
// the current month, so each read proves it sliced its own month and only that one.
func TestWorkbenchFinanceReadsTheRequestedMonth(t *testing.T) {
	departmentID := financeDepartment(t, "month-window")
	ownerUserID := workbenchTestMember(t)
	dbfx.Exec(t,
		`UPDATE member SET department_id = $1 WHERE workspace_id = $2 AND user_id = $3`,
		departmentID, testWorkspaceID, ownerUserID)

	client := createWorkbenchClient(t, ownerUserID, "Finance month client")
	brief := createWorkbenchBrief(t, client.ID, "Finance month brief")
	creator := createWorkbenchCreator(t, ownerUserID, "Finance month creator")

	// A collaboration whose signature and settlement are both dated 2025-03.
	req := workbenchRequest(t, "POST", "/api/workbench/crm/collabs", mergeCollabPayload(brief.ID, creator.ID, map[string]any{
		"stage":        "confirmed",
		"final_amount": 10000,
		"creator_fee":  1000,
	}), ownerUserID)
	collab := testutil.Decode[CrmCollabResponse](t, testHandler.CreateCrmCollab, req, http.StatusCreated)
	t.Cleanup(func() { dbfx.Exec(t, `DELETE FROM crm_collab WHERE id = $1`, collab.ID) })

	req = withURLParam(workbenchRequest(t, "PATCH", "/api/workbench/crm/collabs/"+collab.ID, map[string]any{
		"stage":        "settled",
		"confirmed_at": "2025-03-10T09:00:00Z",
		"accepted_at":  "2025-03-20T09:00:00Z",
	}, ownerUserID), "collabId", collab.ID)
	testutil.Call(t, testHandler.UpdateCrmCollab, req).Want(http.StatusOK)

	req = workbenchRequest(t, "POST", "/api/workbench/crm/settlements", map[string]any{
		"collab_id": collab.ID,
		"kind":      "final",
		"amount":    3000,
		"paid_at":   "2025-03-15",
	}, ownerUserID)
	paid := testutil.Decode[CrmSettlementResponse](t, testHandler.CreateCrmSettlement, req, http.StatusCreated)
	t.Cleanup(func() { dbfx.Exec(t, `DELETE FROM crm_settlement WHERE id = $1`, paid.ID) })

	// The historical month sees exactly these rows.
	past := fetchWorkbenchFinance(t, "?department_id="+departmentID+"&month=2025-03", testUserID)
	if past.Window.Month != "2025-03" {
		t.Fatalf("window.month = %q, want 2025-03", past.Window.Month)
	}
	if past.Signed.Value == nil || *past.Signed.Value != 10000 {
		t.Fatalf("2025-03 signed = %v, want 10000", past.Signed.Value)
	}
	if past.Collected.Value == nil || *past.Collected.Value != 3000 {
		t.Fatalf("2025-03 collected = %v, want 3000", past.Collected.Value)
	}
	// No month entry for 2025-03, so the cost side is the settled collaboration's fees.
	if past.GrossMargin.Basis != financeBasisSettledCollabs {
		t.Fatalf("2025-03 gross_margin basis = %q, want %q", past.GrossMargin.Basis, financeBasisSettledCollabs)
	}
	if past.GrossMargin.Value == nil || math.Abs(*past.GrossMargin.Value-2.0/3.0) > 1e-9 {
		t.Fatalf("2025-03 gross_margin = %v, want (3000-1000)/3000", past.GrossMargin.Value)
	}

	// This month holds nothing for that department: signed/collected are real zeros,
	// and the margin is a gap rather than a 100% claim with no cost side.
	current := fetchWorkbenchFinance(t, "?department_id="+departmentID, testUserID)
	if current.Signed.Value == nil || *current.Signed.Value != 0 {
		t.Fatalf("current-month signed = %v, want 0", current.Signed.Value)
	}
	if current.Collected.Value == nil || *current.Collected.Value != 0 {
		t.Fatalf("current-month collected = %v, want 0", current.Collected.Value)
	}
	assertCostGap(t, "current-month gross_margin", current.GrossMargin)

	// Omitting the parameter is the current month — the behaviour that predates it.
	implicit := fetchWorkbenchFinance(t, "?department_id="+departmentID, testUserID)
	if !reflect.DeepEqual(implicit, current) {
		t.Fatalf("implicit window = %+v, want the same read as the explicit current month", implicit.Window)
	}

	// A month with no rows at all is allowed: future months answer empty, not 400.
	future := fetchWorkbenchFinance(t, "?department_id="+departmentID+"&month=2099-01", testUserID)
	if future.Window.Month != "2099-01" {
		t.Fatalf("future window.month = %q, want 2099-01", future.Window.Month)
	}
	if future.Signed.Value == nil || *future.Signed.Value != 0 {
		t.Fatalf("future signed = %v, want 0", future.Signed.Value)
	}
	assertCostGap(t, "future gross_margin", future.GrossMargin)

	// A malformed month is a 400, not a silently defaulted current month.
	req = workbenchRequest(t, "GET", "/api/workbench/finance?month=2025-3", nil, testUserID)
	testutil.Call(t, testHandler.GetWorkbenchFinance, req).Want(http.StatusBadRequest)
}
