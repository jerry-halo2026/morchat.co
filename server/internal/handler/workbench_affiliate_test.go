package handler

import (
	"math"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/jerry-halo2026/morchat.co/server/internal/testutil"
)

// Affiliate distribution tests (docs/engineering/WORKBENCH-API.md §11). The five
// properties this domain has to hold, each in one case below:
//
//   - a product is identified by (platform, platform_product_id), and a pick by
//     (product, creator): a duplicate is a 409, not a second row;
//   - a daily fact is an upsert on (pick, day), because a re-imported report must
//     replace the day instead of double-counting it;
//   - the write gate walks the row's owner (product, pick) or the pick's owner
//     (daily), and a member cannot edit someone else's rows;
//   - the summary answers a real zero for counts and `insufficient_data` for
//     money it has no report for (docs/METRICS.md §1 rule 3);
//   - teardown removes the four new tables (the manifest test covers the
//     classification; the case at the bottom covers the statement).

func createAffiliateProductFixture(t *testing.T, ownerUserID, clientID, platformProductID string) AffiliateProductResponse {
	t.Helper()
	body := map[string]any{
		"client_id":           clientID,
		"platform":            "douyin",
		"platform_product_id": platformProductID,
		"title":               "Affiliate fixture product " + platformProductID,
		"category":            "beauty",
		"price":               199.9,
		"commission_rate":     0.2,
		"activity":            "双十一",
	}
	if ownerUserID != "" {
		body["owner_member_id"] = ownerUserID
	}
	req := workbenchRequest(t, "POST", "/api/workbench/affiliate/products", body, ownerUserID)
	created := testutil.Decode[AffiliateProductResponse](t, testHandler.CreateAffiliateProduct, req, http.StatusCreated)
	t.Cleanup(func() { dbfx.Exec(t, `DELETE FROM affiliate_product WHERE id = $1`, created.ID) })
	return created
}

func createAffiliatePickFixture(t *testing.T, ownerUserID, productID, creatorID, boundAt string) AffiliatePickResponse {
	t.Helper()
	body := map[string]any{
		"product_id":      productID,
		"creator_id":      creatorID,
		"commission_rate": 0.25,
	}
	if boundAt != "" {
		body["bound_at"] = boundAt
	}
	if ownerUserID != "" {
		body["owner_member_id"] = ownerUserID
	}
	req := workbenchRequest(t, "POST", "/api/workbench/affiliate/picks", body, ownerUserID)
	created := testutil.Decode[AffiliatePickResponse](t, testHandler.CreateAffiliatePick, req, http.StatusCreated)
	// The daily facts hang off the pick with no foreign key, so they go first.
	t.Cleanup(func() { dbfx.Exec(t, `DELETE FROM affiliate_daily WHERE pick_id = $1`, created.ID) })
	t.Cleanup(func() { dbfx.Exec(t, `DELETE FROM affiliate_pick WHERE id = $1`, created.ID) })
	return created
}

func putAffiliateDaily(t *testing.T, pickID, statDate string, body map[string]any) AffiliateDailyResponse {
	t.Helper()
	payload := map[string]any{"pick_id": pickID, "stat_date": statDate}
	for key, value := range body {
		payload[key] = value
	}
	req := workbenchRequest(t, "PUT", "/api/workbench/affiliate/daily", payload, "")
	return testutil.Decode[AffiliateDailyResponse](t, testHandler.UpsertAffiliateDaily, req, http.StatusCreated)
}

func fetchAffiliateSummary(t *testing.T, query, userID string) AffiliateSummaryResponse {
	t.Helper()
	req := workbenchRequest(t, "GET", "/api/workbench/affiliate/summary"+query, nil, userID)
	return testutil.Decode[AffiliateSummaryResponse](t, testHandler.GetAffiliateSummary, req, http.StatusOK)
}

// TestAffiliateProductIdentityConflicts guards the partial unique index from 714:
// the same platform product twice is a 409 rather than a second row, and the
// same platform product id on another platform is a different product.
func TestAffiliateProductIdentityConflicts(t *testing.T) {
	client := createWorkbenchClient(t, testUserID, "Affiliate product client")
	product := createAffiliateProductFixture(t, testUserID, client.ID, "3712345678901")

	if product.Status != "on_shelf" {
		t.Fatalf("status = %q, want the on_shelf default", product.Status)
	}
	if product.CommissionRate == nil || *product.CommissionRate != 0.2 {
		t.Fatalf("commission_rate = %v, want 0.2", product.CommissionRate)
	}

	req := workbenchRequest(t, "POST", "/api/workbench/affiliate/products", map[string]any{
		"client_id":           client.ID,
		"platform":            "douyin",
		"platform_product_id": product.PlatformProductID,
		"title":               "Duplicate platform product",
	}, testUserID)
	testutil.Call(t, testHandler.CreateAffiliateProduct, req).Want(http.StatusConflict)

	// The identity is per platform: the same numeric id on another platform is a
	// different SKU and must be accepted.
	req = workbenchRequest(t, "POST", "/api/workbench/affiliate/products", map[string]any{
		"client_id":           client.ID,
		"platform":            "kuaishou",
		"platform_product_id": product.PlatformProductID,
		"title":               "Same id, another platform",
	}, testUserID)
	other := testutil.Decode[AffiliateProductResponse](t, testHandler.CreateAffiliateProduct, req, http.StatusCreated)
	t.Cleanup(func() { dbfx.Exec(t, `DELETE FROM affiliate_product WHERE id = $1`, other.ID) })

	// A commission rate is a 0–1 ratio (C3); 20 means 2000 %.
	req = workbenchRequest(t, "POST", "/api/workbench/affiliate/products", map[string]any{
		"client_id":           client.ID,
		"platform":            "douyin",
		"platform_product_id": "another-id",
		"title":               "Bad rate",
		"commission_rate":     20,
	}, testUserID)
	testutil.Call(t, testHandler.CreateAffiliateProduct, req).Want(http.StatusBadRequest)

	// A product must name a client of this workspace.
	req = workbenchRequest(t, "POST", "/api/workbench/affiliate/products", map[string]any{
		"client_id":           "00000000-0000-0000-0000-000000000000",
		"platform":            "douyin",
		"platform_product_id": "foreign-client",
		"title":               "Foreign client product",
	}, testUserID)
	testutil.Call(t, testHandler.CreateAffiliateProduct, req).Want(http.StatusBadRequest)
}

// TestAffiliatePickIdentityConflicts covers 717 and the create-side write gate: a
// creator cannot be put on the same product twice, and a member cannot bind a
// product it does not own.
func TestAffiliatePickIdentityConflicts(t *testing.T) {
	memberUserID := workbenchTestMember(t)
	client := createWorkbenchClient(t, testUserID, "Affiliate pick client")
	product := createAffiliateProductFixture(t, testUserID, client.ID, "pick-identity-sku")
	creator := createWorkbenchCreator(t, testUserID, "Affiliate pick creator")

	pick := createAffiliatePickFixture(t, testUserID, product.ID, creator.ID, "2026-11-05T02:00:00Z")
	if pick.Status != "active" {
		t.Fatalf("status = %q, want the active default", pick.Status)
	}
	if pick.CommissionRate == nil || *pick.CommissionRate != 0.25 {
		t.Fatalf("commission_rate = %v, want the pick's own 0.25", pick.CommissionRate)
	}

	req := workbenchRequest(t, "POST", "/api/workbench/affiliate/picks", map[string]any{
		"product_id": product.ID,
		"creator_id": creator.ID,
	}, testUserID)
	testutil.Call(t, testHandler.CreateAffiliatePick, req).Want(http.StatusConflict)

	// A member may create a pick for its own product, but not for one it does not
	// own: the pick is the row it would then be allowed to maintain.
	req = workbenchRequest(t, "POST", "/api/workbench/affiliate/picks", map[string]any{
		"product_id": product.ID,
		"creator_id": creator.ID,
	}, memberUserID)
	testutil.Call(t, testHandler.CreateAffiliatePick, req).Want(http.StatusForbidden)

	// The pick list honours product_id / creator_id / status.
	req = workbenchRequest(t, "GET",
		"/api/workbench/affiliate/picks?product_id="+product.ID+"&creator_id="+creator.ID+"&status=active", nil, memberUserID)
	var list struct {
		Picks []AffiliatePickResponse `json:"picks"`
		Total int                     `json:"total"`
	}
	testutil.Call(t, testHandler.ListAffiliatePicks, req).Want(http.StatusOK).JSON(&list)
	if list.Total != 1 || list.Picks[0].ID != pick.ID {
		t.Fatalf("filtered picks = %d rows (%+v), want the one pick %s", list.Total, list.Picks, pick.ID)
	}

	req = workbenchRequest(t, "GET", "/api/workbench/affiliate/picks?status=archived", nil, testUserID)
	testutil.Call(t, testHandler.ListAffiliatePicks, req).Want(http.StatusBadRequest)
}

// TestAffiliateDailyUpsertKeepsOneRowPerDay covers ③: two PUTs for the same
// (pick, day) leave one row carrying the second body, and the second write
// replaces every measure instead of merging into the first.
func TestAffiliateDailyUpsertKeepsOneRowPerDay(t *testing.T) {
	client := createWorkbenchClient(t, testUserID, "Affiliate daily client")
	product := createAffiliateProductFixture(t, testUserID, client.ID, "daily-upsert-sku")
	creator := createWorkbenchCreator(t, testUserID, "Affiliate daily creator")
	pick := createAffiliatePickFixture(t, testUserID, product.ID, creator.ID, "")

	first := putAffiliateDaily(t, pick.ID, "2026-11-10", map[string]any{
		"gmv_amount":     1000,
		"order_count":    10,
		"refund_amount":  100,
		"est_commission": 200,
	})
	if first.GMVAmount != 1000 || first.RefundAmount != 100 || first.OrderCount != 10 {
		t.Fatalf("first day = %+v, want the reported numbers", first)
	}

	// A corrected report for the same day: the refund is gone and the GMV moved.
	second := putAffiliateDaily(t, pick.ID, "2026-11-10", map[string]any{
		"gmv_amount":     1200,
		"order_count":    12,
		"est_commission": 240,
	})
	if second.ID != first.ID {
		t.Fatalf("second PUT created a new row (%s -> %s); (pick_id, stat_date) must upsert", first.ID, second.ID)
	}
	if second.GMVAmount != 1200 || second.OrderCount != 12 {
		t.Fatalf("upserted day = %+v, want the second body", second)
	}
	// The body replaced the day: an omitted measure is the report saying zero, not
	// the previous value surviving.
	if second.RefundAmount != 0 {
		t.Fatalf("refund_amount = %v after a PUT that omitted it, want 0 (PUT replaces the day)", second.RefundAmount)
	}

	req := workbenchRequest(t, "GET", "/api/workbench/affiliate/daily?pick_id="+pick.ID, nil, testUserID)
	var list struct {
		Daily []AffiliateDailyResponse `json:"daily"`
		Total int                      `json:"total"`
	}
	testutil.Call(t, testHandler.ListAffiliateDaily, req).Want(http.StatusOK).JSON(&list)
	if list.Total != 1 || len(list.Daily) != 1 {
		t.Fatalf("daily rows for the pick = %d, want 1 row for one reported day", list.Total)
	}

	// A daily fact inherits its pick's owner: a member cannot report on it.
	memberUserID := workbenchTestMember(t)
	req = workbenchRequest(t, "PUT", "/api/workbench/affiliate/daily", map[string]any{
		"pick_id":    pick.ID,
		"stat_date":  "2026-11-11",
		"gmv_amount": 10,
	}, memberUserID)
	testutil.Call(t, testHandler.UpsertAffiliateDaily, req).Want(http.StatusForbidden)

	// A pick id from nowhere is a broken relationship, not an empty day.
	req = workbenchRequest(t, "PUT", "/api/workbench/affiliate/daily", map[string]any{
		"pick_id":    "00000000-0000-0000-0000-000000000000",
		"stat_date":  "2026-11-11",
		"gmv_amount": 10,
	}, testUserID)
	testutil.Call(t, testHandler.UpsertAffiliateDaily, req).Want(http.StatusBadRequest)
}

// TestAffiliateSummaryEmptyMonthIsAGap covers ④: a month nothing has been
// imported for answers `insufficient_data` on every money block, and a true zero
// only on the two counts — rendering 0 GMV for "no report" is the confusion rule
// 3 exists to prevent.
func TestAffiliateSummaryEmptyMonthIsAGap(t *testing.T) {
	// A month no fixture can land in, so this holds on the shared test database
	// whatever the other cases left behind.
	summary := fetchAffiliateSummary(t, "?month=1990-01", testUserID)

	if summary.Window.Month != "1990-01" {
		t.Fatalf("window.month = %q, want the month the caller asked for", summary.Window.Month)
	}
	for _, block := range []struct {
		id    string
		entry WorkbenchMetricValue
	}{
		{"gmv", summary.GMV},
		{"commission_est", summary.CommissionEst},
		{"commission_settled", summary.CommissionSettled},
		{"refund_rate", summary.RefundRate},
		{"tech_fee", summary.TechFee},
	} {
		if block.entry.Value != nil || block.entry.Empty != metricEmptyInsufficientData {
			t.Fatalf("%s = %+v, want value null + insufficient_data on an empty month", block.id, block.entry)
		}
		if block.entry.SampleCount != 0 {
			t.Fatalf("%s sample_count = %d, want 0", block.id, block.entry.SampleCount)
		}
	}
	for _, block := range []struct {
		id    string
		entry WorkbenchMetricValue
	}{
		{"pick_count", summary.PickCount},
		{"active_creator_count", summary.ActiveCreatorCount},
	} {
		if block.entry.Value == nil || *block.entry.Value != 0 {
			t.Fatalf("%s = %+v, want a true zero", block.id, block.entry)
		}
		if block.entry.Empty != metricEmptyZero {
			t.Fatalf("%s empty = %q, want zero — no picks is a count, not a gap", block.id, block.entry.Empty)
		}
	}

	// A malformed month is a 400 rather than a silent "this month".
	req := workbenchRequest(t, "GET", "/api/workbench/affiliate/summary?month=2026-11-15", nil, testUserID)
	testutil.Call(t, testHandler.GetAffiliateSummary, req).Want(http.StatusBadRequest)
}

// TestAffiliateSummaryComputesRefundRateAndCommission covers ⑤: three reported
// days add up, and the refund rate is refund ÷ GMV at the 0–1 scale (C3).
func TestAffiliateSummaryComputesRefundRateAndCommission(t *testing.T) {
	client := createWorkbenchClient(t, testUserID, "Affiliate summary client")
	product := createAffiliateProductFixture(t, testUserID, client.ID, "summary-sku")
	creator := createWorkbenchCreator(t, testUserID, "Affiliate summary creator")
	pick := createAffiliatePickFixture(t, testUserID, product.ID, creator.ID, "2026-11-02T03:00:00Z")

	putAffiliateDaily(t, pick.ID, "2026-11-03", map[string]any{
		"gmv_amount": 1000, "refund_amount": 100, "est_commission": 200,
	})
	putAffiliateDaily(t, pick.ID, "2026-11-04", map[string]any{
		"gmv_amount": 500, "est_commission": 100, "settled_commission": 100,
	})
	putAffiliateDaily(t, pick.ID, "2026-11-05", map[string]any{
		"gmv_amount": 500, "est_commission": 100,
	})

	summary := fetchAffiliateSummary(t, "?month=2026-11", testUserID)

	// 2000 GMV over three reported days.
	if summary.GMV.Value == nil || math.Abs(*summary.GMV.Value-2000) > 0.01 {
		t.Fatalf("gmv = %v, want 2000", summary.GMV.Value)
	}
	if summary.GMV.SampleCount != 3 {
		t.Fatalf("gmv sample_count = %d, want the 3 reported days", summary.GMV.SampleCount)
	}
	if summary.GMV.Empty != metricEmptyZero {
		t.Fatalf("gmv empty = %q, want zero over a real value", summary.GMV.Empty)
	}

	// 200 + 100 + 100 estimated commission.
	if summary.CommissionEst.Value == nil || math.Abs(*summary.CommissionEst.Value-400) > 0.01 {
		t.Fatalf("commission_est = %v, want 400", summary.CommissionEst.Value)
	}
	// Only one day has cleared commission, and the sample count says so.
	if summary.CommissionSettled.Value == nil || math.Abs(*summary.CommissionSettled.Value-100) > 0.01 {
		t.Fatalf("commission_settled = %v, want 100", summary.CommissionSettled.Value)
	}
	if summary.CommissionSettled.SampleCount != 1 {
		t.Fatalf("commission_settled sample_count = %d, want 1 settled day", summary.CommissionSettled.SampleCount)
	}

	// 100 refunded of 2000 sold = 0.05, not 5.
	if summary.RefundRate.Value == nil || math.Abs(*summary.RefundRate.Value-0.05) > 1e-9 {
		t.Fatalf("refund_rate = %v, want 0.05 (0–1 scale, C3)", summary.RefundRate.Value)
	}
	if summary.RefundRate.SampleCount != 3 {
		t.Fatalf("refund_rate sample_count = %d, want the 3 days with GMV behind it", summary.RefundRate.SampleCount)
	}

	// The pick was bound this month, to exactly one creator.
	if summary.PickCount.Value == nil || *summary.PickCount.Value != 1 {
		t.Fatalf("pick_count = %v, want 1", summary.PickCount.Value)
	}
	if summary.ActiveCreatorCount.Value == nil || *summary.ActiveCreatorCount.Value != 1 {
		t.Fatalf("active_creator_count = %v, want 1", summary.ActiveCreatorCount.Value)
	}

	// A month with no report is a gap, not a zero, even when the ledger has rows.
	empty := fetchAffiliateSummary(t, "?month=2026-09", testUserID)
	if empty.GMV.Value != nil || empty.GMV.Empty != metricEmptyInsufficientData {
		t.Fatalf("gmv for an unreported month = %+v, want insufficient_data", empty.GMV)
	}
}

// TestAffiliateProductPermissions covers ⑥ and the rest of the gate: a member
// reads everything and writes only its own product, and the row-level gate holds
// for both PATCH and DELETE.
func TestAffiliateProductPermissions(t *testing.T) {
	memberUserID := workbenchTestMember(t)
	client := createWorkbenchClient(t, testUserID, "Affiliate permission client")
	product := createAffiliateProductFixture(t, testUserID, client.ID, "permission-sku")

	req := workbenchRequest(t, "GET", "/api/workbench/affiliate/products/"+product.ID, nil, memberUserID)
	req = withURLParam(req, "productId", product.ID)
	got := testutil.Decode[AffiliateProductResponse](t, testHandler.GetAffiliateProduct, req, http.StatusOK)
	if got.ID != product.ID {
		t.Fatalf("GetAffiliateProduct as member returned %s, want %s", got.ID, product.ID)
	}

	req = workbenchRequest(t, "PATCH", "/api/workbench/affiliate/products/"+product.ID, map[string]any{
		"title": "Renamed by a non-owner",
	}, memberUserID)
	req = withURLParam(req, "productId", product.ID)
	testutil.Call(t, testHandler.UpdateAffiliateProduct, req).Want(http.StatusForbidden)

	req = workbenchRequest(t, "DELETE", "/api/workbench/affiliate/products/"+product.ID, nil, memberUserID)
	req = withURLParam(req, "productId", product.ID)
	testutil.Call(t, testHandler.DeleteAffiliateProduct, req).Want(http.StatusForbidden)

	req = workbenchRequest(t, "PATCH", "/api/workbench/affiliate/products/"+product.ID, map[string]any{
		"title":           "Renamed by the owner",
		"commission_rate": 0.35,
	}, testUserID)
	req = withURLParam(req, "productId", product.ID)
	updated := testutil.Decode[AffiliateProductResponse](t, testHandler.UpdateAffiliateProduct, req, http.StatusOK)
	if updated.Title != "Renamed by the owner" {
		t.Fatalf("title = %q, want the patched value", updated.Title)
	}
	if updated.CommissionRate == nil || *updated.CommissionRate != 0.35 {
		t.Fatalf("commission_rate = %v, want 0.35", updated.CommissionRate)
	}
	// A PATCH that omits a field keeps it: the pick-default rate is not cleared by
	// renaming a product.
	if updated.Price == nil || *updated.Price != 199.9 {
		t.Fatalf("price = %v, want the stored 199.9", updated.Price)
	}

	req = workbenchRequest(t, "DELETE", "/api/workbench/affiliate/products/"+product.ID, nil, testUserID)
	req = withURLParam(req, "productId", product.ID)
	testutil.Call(t, testHandler.DeleteAffiliateProduct, req).Want(http.StatusNoContent)

	req = workbenchRequest(t, "GET", "/api/workbench/affiliate/products/"+product.ID, nil, testUserID)
	req = withURLParam(req, "productId", product.ID)
	testutil.Call(t, testHandler.GetAffiliateProduct, req).Want(http.StatusNotFound)

	// Archiving freed the platform id: the same SKU can be re-added (714 is a
	// partial index for exactly this repair).
	req = workbenchRequest(t, "POST", "/api/workbench/affiliate/products", map[string]any{
		"client_id":           client.ID,
		"platform":            "douyin",
		"platform_product_id": product.PlatformProductID,
		"title":               "Re-added after archiving",
	}, testUserID)
	readded := testutil.Decode[AffiliateProductResponse](t, testHandler.CreateAffiliateProduct, req, http.StatusCreated)
	t.Cleanup(func() { dbfx.Exec(t, `DELETE FROM affiliate_product WHERE id = $1`, readded.ID) })
}

// TestAffiliateSettlementIsRoleGatedAndNeverRecomputed covers the settlement
// rule: a member cannot record or correct a statement (it has no owner to hold it
// by), and `net_amount` is stored exactly as sent even when it disagrees with the
// three components.
func TestAffiliateSettlementIsRoleGatedAndNeverRecomputed(t *testing.T) {
	memberUserID := workbenchTestMember(t)

	req := workbenchRequest(t, "POST", "/api/workbench/affiliate/settlements", map[string]any{
		"period_start":     "2026-11-01",
		"period_end":       "2026-11-15",
		"gross_commission": 1000,
		"net_amount":       900,
	}, memberUserID)
	testutil.Call(t, testHandler.CreateAffiliateSettlement, req).Want(http.StatusForbidden)

	req = workbenchRequest(t, "POST", "/api/workbench/affiliate/settlements", map[string]any{
		"period_start":     "2026-11-01",
		"period_end":       "2026-11-15",
		"gross_commission": 1000,
		"tech_service_fee": 100,
		"refund_deduction": 0,
		// The platform rounded to 895, which the three components do not produce.
		// The server must keep 895 rather than "fix" it to 900.
		"net_amount":  895,
		"external_no": "SETTLE-2026-11-A",
	}, testUserID)
	created := testutil.Decode[AffiliateSettlementResponse](t, testHandler.CreateAffiliateSettlement, req, http.StatusCreated)
	t.Cleanup(func() { dbfx.Exec(t, `DELETE FROM affiliate_settlement WHERE id = $1`, created.ID) })
	if created.NetAmount != 895 {
		t.Fatalf("net_amount = %v, want the platform's 895", created.NetAmount)
	}
	if created.Status != "pending" {
		t.Fatalf("status = %q, want the pending default", created.Status)
	}

	// Marking it paid keeps the amount and records the day.
	req = workbenchRequest(t, "PATCH", "/api/workbench/affiliate/settlements/"+created.ID, map[string]any{
		"status":  "paid",
		"paid_at": "2026-11-16",
	}, testUserID)
	req = withURLParam(req, "settlementId", created.ID)
	paid := testutil.Decode[AffiliateSettlementResponse](t, testHandler.UpdateAffiliateSettlement, req, http.StatusOK)
	if paid.Status != "paid" || paid.PaidAt == nil || *paid.PaidAt != "2026-11-16" {
		t.Fatalf("paid settlement = %+v, want status paid + paid_at 2026-11-16", paid)
	}
	if paid.NetAmount != 895 {
		t.Fatalf("net_amount = %v after a status-only PATCH, want 895", paid.NetAmount)
	}

	req = workbenchRequest(t, "PATCH", "/api/workbench/affiliate/settlements/"+created.ID, map[string]any{
		"status": "paid",
	}, memberUserID)
	req = withURLParam(req, "settlementId", created.ID)
	testutil.Call(t, testHandler.UpdateAffiliateSettlement, req).Want(http.StatusForbidden)

	// A period that ends before it starts is refused before the CHECK sees it.
	req = workbenchRequest(t, "POST", "/api/workbench/affiliate/settlements", map[string]any{
		"period_start": "2026-11-15",
		"period_end":   "2026-11-01",
		"net_amount":   1,
	}, testUserID)
	testutil.Call(t, testHandler.CreateAffiliateSettlement, req).Want(http.StatusBadRequest)

	// `net_amount` cannot be derived and is not optional: a row that cannot name
	// its net is not a statement.
	req = workbenchRequest(t, "POST", "/api/workbench/affiliate/settlements", map[string]any{
		"period_start":     "2026-11-01",
		"period_end":       "2026-11-15",
		"gross_commission": 1000,
	}, testUserID)
	testutil.Call(t, testHandler.CreateAffiliateSettlement, req).Want(http.StatusBadRequest)
}

// TestWorkspaceTeardownCoversAffiliateTables covers ⑦ at the statement level. The
// manifest test proves the four tables are classified; this proves the teardown
// actually names them, which is the half a classification cannot check. It reads
// the query source instead of running the teardown, because
// DeleteWorkspaceWorkbenchLedger would wipe the shared fixture workspace.
func TestWorkspaceTeardownCoversAffiliateTables(t *testing.T) {
	path := filepath.Join("..", "..", "pkg", "db", "queries", "workspace_delete.sql")
	source, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read %s: %v", path, err)
	}
	statement := string(source)
	start := strings.Index(statement, "-- name: DeleteWorkspaceWorkbenchLedger")
	if start < 0 {
		t.Fatal("workspace_delete.sql no longer defines DeleteWorkspaceWorkbenchLedger")
	}
	statement = statement[start:]

	for _, table := range []string{
		"affiliate_daily",
		"affiliate_settlement",
		"affiliate_pick",
		"affiliate_product",
	} {
		if !strings.Contains(statement, "DELETE FROM "+table+" WHERE "+table+".workspace_id = $1") {
			t.Errorf("DeleteWorkspaceWorkbenchLedger does not delete %s by workspace", table)
		}
		if action, ok := workspaceDeletionManifest[table]; !ok || action != workspaceDelete {
			t.Errorf("%s is not classified as workspaceDelete in the teardown manifest", table)
		}
	}
}
