package handler

import (
	"fmt"
	"net/http"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jerry-halo2026/morchat.co/server/internal/testutil"
)

// 千川投放接口的用例（WORKBENCH-API §25）。
//
// 两条线分开测：
//
//   - **口径不能相加**是**结构性质**，所以用纯函数测：五个 basis 各自只翻译出一个
//     列表达式，任何一条表达式里都不会出现第二个结算列。这一层不需要数据库，也不
//     需要 handler —— 如果哪天有人把「总花费」加回来，这里会先红。
//   - **三态与 NULL** 要真读一次 Postgres 才有意义（`sum()` 空集返回 NULL、
//     `count(col)` 区分「没数」和「0」），所以那几个用例建一个只属于自己的
//     workspace，再断言具体数字。

// TestAdsSettleExpressionIsOneWindow 是「跨 basis 求和不存在」的结构性证明。
//
// 五个窗口各自只映射到一个列表达式；把任何一个 basis 拼错都拿不到表达式，
// 因此 summary 的 SUM 里只可能有**一个**结算窗口的列。
func TestAdsSettleExpressionIsOneWindow(t *testing.T) {
	bases := []string{adsBasis1h, adsBasis7d, adsBasis14d, adsBasis30d, adsBasis90d}
	seen := map[string]bool{}
	for _, basis := range bases {
		expression, ok := adsSettleExpression(basis)
		if !ok {
			t.Fatalf("basis %s has no expression", basis)
		}
		if strings.TrimSpace(expression) == "" {
			t.Fatalf("basis %s maps to an empty expression", basis)
		}
		// The one rule: an expression names exactly one settlement window.
		windows := 0
		for _, suffix := range []string{"settle_amount_1h", "settle_amount_7d", "for_roi2_14d", "for_roi2_30d", "for_roi2_90d"} {
			if strings.Contains(expression, suffix) {
				windows++
			}
		}
		if windows != 1 {
			t.Fatalf("expression %q names %d settlement windows, want exactly 1", expression, windows)
		}
		if seen[expression] {
			t.Fatalf("expression %q is shared by two bases", expression)
		}
		seen[expression] = true
	}

	// Anything else — including the word "all" a page might invent — has no
	// expression at all, so there is nothing to sum it with.
	for _, bogus := range []string{"all", "settle_all", "total", "settle_7d,settle_1h", ""} {
		if _, ok := adsSettleExpression(bogus); ok {
			t.Fatalf("basis %q must not resolve to a column", bogus)
		}
	}
}

// TestAdsBasisDefaultsAndRejects covers the parameter side: 7d is the default, an
// unknown value is a 400 rather than a silent 7d.
func TestAdsBasisDefaultsAndRejects(t *testing.T) {
	recorder := httptestRecorder()
	basis, ok := adsParseBasis(recorder, "")
	if !ok || basis != adsBasisDefault {
		t.Fatalf("empty basis = %q, %v; want default %q", basis, ok, adsBasisDefault)
	}
	if recorder.Code != http.StatusOK {
		t.Fatalf("empty basis wrote status %d", recorder.Code)
	}

	recorder = httptestRecorder()
	if _, ok := adsParseBasis(recorder, "settle_all"); ok {
		t.Fatal("settle_all was accepted")
	}
	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("invalid basis wrote status %d, want 400", recorder.Code)
	}
}

// TestAdsThreeStatesAreDistinct pins the difference the screens depend on: an
// amount nobody summed is null + insufficient_data, a measured zero is 0 + zero,
// and a window with no rows is insufficient_data however few zeros it would print.
func TestAdsThreeStatesAreDistinct(t *testing.T) {
	unsampled := adsMoneyOf(nil, 0)
	if unsampled.Amount != nil || unsampled.Empty != "insufficient_data" {
		t.Fatalf("no samples = %+v, want null + insufficient_data", unsampled)
	}

	zero := 0.0
	measured := adsMoneyOf(&zero, 3)
	if measured.Amount == nil || *measured.Amount != 0 || measured.Empty != "zero" {
		t.Fatalf("three samples summing to zero = %+v, want 0 + zero", measured)
	}

	if state := adsWindowState(0); state != "insufficient_data" {
		t.Fatalf("empty window state = %q", state)
	}
	if state := adsWindowState(4); state != "zero" {
		t.Fatalf("non-empty window state = %q", state)
	}

	count := adsCountOf(0)
	if count.Value == nil || *count.Value != 0 || count.Empty != "zero" {
		t.Fatalf("count of zero = %+v, want a real 0", count)
	}
}

// TestAdsPreviousWindowIsTheSameLength guards the 环比 window: it must be as long as
// the current one and end the day before it starts, or the comparison is noise.
func TestAdsPreviousWindowIsTheSameLength(t *testing.T) {
	from := mustDate(t, "2026-11-01")
	to := mustDate(t, "2026-11-30")
	previous := adsPreviousWindow(from, to)
	if got := dateToString(previous); got != "2026-10-02" {
		t.Fatalf("previous from = %s, want 2026-10-02", got)
	}
	var span int
	if err := testPool.QueryRow(t.Context(),
		`SELECT $2::date - $1::date`, previous, from).Scan(&span); err == nil && span != 30 {
		t.Fatalf("previous window spans %d days, want 30", span)
	}
}

// TestAdsSummaryRejectsABasisItCannotSum is the endpoint-level half of the rule:
// `?basis=all` never reaches SQL.
func TestAdsSummaryRejectsABasisItCannotSum(t *testing.T) {
	if testHandler == nil || testPool == nil {
		t.Skip("handler suite has no database")
	}
	workspaceID, userID := adsScratchWorkspace(t, "千川口径")
	req := adsRequestIn(t, http.MethodGet, "/api/workbench/ads/summary?basis=all", workspaceID, userID)
	testutil.Call(t, testHandler.AdsSummary, req).Want(http.StatusBadRequest)
}

// TestAdsSummaryThreeStatesOverRealRows reads actual rows: a window with facts but
// no amounts must answer `amount: null` (not 0), a window with no facts must answer
// `insufficient_data`, and the settle figure follows the basis it was asked for.
func TestAdsSummaryThreeStatesOverRealRows(t *testing.T) {
	if testHandler == nil || testPool == nil {
		t.Skip("handler suite has no database")
	}
	workspaceID, userID := adsScratchWorkspace(t, "千川汇总")
	insertAdsDaily(t, workspaceID, "2026-11-02",
		ptrTo("100"), ptrTo("500"), ptrTo("1500"), ptrTo("50"), ptrTo("120"), ptrTo("600"))
	insertAdsDaily(t, workspaceID, "2026-11-03", nil, nil, nil, nil, nil, nil)

	// 7d is the default basis and its figure comes back under `settle`.
	body := testutil.Decode[adsSummaryResponse](t, testHandler.AdsSummary,
		adsRequestIn(t, http.MethodGet,
			"/api/workbench/ads/summary?from=2026-11-01&to=2026-11-30", workspaceID, userID),
		http.StatusOK)
	if body.Basis != adsBasis7d {
		t.Fatalf("basis = %q, want %q", body.Basis, adsBasis7d)
	}
	if body.Empty != "zero" {
		t.Fatalf("window with two rows answered empty=%q", body.Empty)
	}
	if body.Totals.Spend.Amount == nil || *body.Totals.Spend.Amount != 100 {
		t.Fatalf("spend = %+v, want 100 (the NULL row contributes no sample)", body.Totals.Spend)
	}
	if body.Totals.Spend.SampleCount != 1 {
		t.Fatalf("spend samples = %d, want 1 — the NULL row is not a zero", body.Totals.Spend.SampleCount)
	}
	if body.Totals.Settle.Amount == nil || *body.Totals.Settle.Amount != 600 {
		t.Fatalf("settle = %+v, want the 7d amount", body.Totals.Settle)
	}

	// A basis with no structured column reads its value out of metrics; here nothing
	// was captured for 14d, so it is missing rather than zero.
	fourteen := testutil.Decode[adsSummaryResponse](t, testHandler.AdsSummary,
		adsRequestIn(t, http.MethodGet,
			"/api/workbench/ads/summary?from=2026-11-01&to=2026-11-30&basis=settle_14d", workspaceID, userID),
		http.StatusOK)
	if fourteen.Basis != adsBasis14d {
		t.Fatalf("basis = %q", fourteen.Basis)
	}
	if fourteen.Totals.Settle.Amount != nil || fourteen.Totals.Settle.Empty != "insufficient_data" {
		t.Fatalf("settle_14d = %+v, want null + insufficient_data", fourteen.Totals.Settle)
	}

	// A window with no rows at all is the empty state, not a row of zeros.
	empty := testutil.Decode[adsSummaryResponse](t, testHandler.AdsSummary,
		adsRequestIn(t, http.MethodGet,
			"/api/workbench/ads/summary?from=2020-01-01&to=2020-01-31", workspaceID, userID),
		http.StatusOK)
	if empty.Empty != "insufficient_data" {
		t.Fatalf("empty window answered empty=%q", empty.Empty)
	}
	if empty.Totals.Spend.Amount != nil {
		t.Fatalf("empty window spend = %v, want null", *empty.Totals.Spend.Amount)
	}
}

// --- fixtures ---------------------------------------------------------------

// ptrTo is the one-line way to pass a nullable test value.
func ptrTo(value string) *string { return &value }

func adsRequestIn(t *testing.T, method, path, workspaceID, userID string) *http.Request {
	t.Helper()
	req := workbenchRequest(t, method, path, nil, userID)
	req.Header.Set("X-Workspace-ID", workspaceID)
	return req
}

func adsScratchWorkspace(t *testing.T, name string) (workspaceID, ownerUserID string) {
	t.Helper()
	slug := strings.NewReplacer("_", "-", "/", "-").Replace(strings.ToLower(t.Name()))
	workspaceID = dbfx.Workspace(t, name, slug)
	ownerUserID = dbfx.User(t, "Ads Owner", fmt.Sprintf("ads-owner-%s@multica.ai", slug))
	dbfx.Member(t, workspaceID, ownerUserID, "owner")
	return workspaceID, ownerUserID
}

// insertAdsDaily writes one daily_overall row. A nil amount is a NULL column, which
// is exactly what the three-state cases need.
func insertAdsDaily(
	t *testing.T,
	workspaceID, statDate string,
	spend, gmv, refund, orders, settle1h, settle7d *string,
) {
	t.Helper()
	dbfx.Exec(t, `
INSERT INTO qianchuan_daily_overall
    (workspace_id, stat_date, account_id, account_name, dim_kind, dim_id, dim_name,
     spend, gmv, refund_amount, order_count, settle_amount_1h, settle_amount_7d,
     metrics, source_version, captured_at)
VALUES ($1::uuid, $2::date, 'acct-1', 'acct', 'overall', 'plan-1', NULL,
        $3::numeric, $4::numeric, $5::numeric, $6::bigint, $7::numeric, $8::numeric,
        '{}'::jsonb, 'test', now())
ON CONFLICT (workspace_id, stat_date, account_id, dim_kind, dim_id) DO UPDATE
SET spend = excluded.spend, gmv = excluded.gmv, refund_amount = excluded.refund_amount,
    order_count = excluded.order_count, settle_amount_1h = excluded.settle_amount_1h,
    settle_amount_7d = excluded.settle_amount_7d, updated_at = now()`,
		workspaceID, statDate, spend, gmv, refund, orders, settle1h, settle7d)
}

// mustDate parses a day the test wrote itself; a typo is a broken test, not a case.
func mustDate(t *testing.T, day string) pgtype.Date {
	t.Helper()
	parsed, ok := workbenchDateValue(httptestRecorder(), &day, "day")
	if !ok {
		t.Fatalf("bad test date %q", day)
	}
	return parsed
}

// httptestRecorder is the minimal ResponseWriter the ads helpers need.
func httptestRecorder() *statusRecorder { return &statusRecorder{Code: http.StatusOK} }

// statusRecorder records the status a helper wrote without pulling httptest in.
type statusRecorder struct {
	Code int
	body strings.Builder
}

func (s *statusRecorder) Header() http.Header         { return http.Header{} }
func (s *statusRecorder) WriteHeader(status int)      { s.Code = status }
func (s *statusRecorder) Write(p []byte) (int, error) { return s.body.Write(p) }
