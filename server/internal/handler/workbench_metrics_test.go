package handler

import (
	"net/http"
	"testing"
	"time"

	"github.com/jerry-halo2026/morchat.co/server/internal/testutil"
)

// A metric that produced a number is never `insufficient_data`, even when its
// contract rule is. Sending the rule verbatim made the client draw a gap card
// over a real value: hr.interview.on_time_rate = 100% with one sample came back
// as empty=insufficient_data and rendered as "not enough data yet".
func TestMetricValueReportsStateNotRule(t *testing.T) {
	computed := metricValue(100, true, 1, metricEmptyInsufficientData)
	if computed.Value == nil || *computed.Value != 100 {
		t.Fatalf("value = %v, want 100", computed.Value)
	}
	if computed.Empty != metricEmptyZero {
		t.Fatalf("empty = %q, want %q for a computed metric", computed.Empty, metricEmptyZero)
	}

	missing := metricValue(0, false, 0, metricEmptyInsufficientData)
	if missing.Value != nil {
		t.Fatalf("value = %v, want nil", *missing.Value)
	}
	if missing.Empty != metricEmptyInsufficientData {
		t.Fatalf("empty = %q, want %q for a metric with no data", missing.Empty, metricEmptyInsufficientData)
	}
}

// Overview / counts tests. The point of these is the three-state contract
// (docs/METRICS.md §1 rule 3): a metric with no rows behind it must come back as
// `value: null` + `empty: insufficient_data`, never as a zero the UI would render
// as a real number.

func fetchWorkbenchOverview(t *testing.T, query, userID string) map[string]WorkbenchMetricValue {
	t.Helper()
	req := workbenchRequest(t, "GET", "/api/workbench/overview"+query, nil, userID)
	var response WorkbenchOverviewResponse
	testutil.Call(t, testHandler.GetWorkbenchOverview, req).Want(http.StatusOK).JSON(&response)
	if response.Metrics == nil {
		t.Fatal("overview response has no metrics map")
	}
	return response.Metrics
}

func fetchWorkbenchCounts(t *testing.T, query, userID string) WorkbenchCountsResponse {
	t.Helper()
	req := workbenchRequest(t, "GET", "/api/workbench/counts"+query, nil, userID)
	return testutil.Decode[WorkbenchCountsResponse](t, testHandler.GetWorkbenchCounts, req, http.StatusOK)
}

// TestWorkbenchOverviewAnswersEveryContractMetric is the shape guard: every id in
// packages/core/metrics/contracts.ts is present, and each one names an empty rule
// the client knows how to render.
func TestWorkbenchOverviewAnswersEveryContractMetric(t *testing.T) {
	metrics := fetchWorkbenchOverview(t, "", testUserID)
	if len(metrics) != len(workbenchMetricCatalog) {
		t.Fatalf("overview returned %d metrics, want %d", len(metrics), len(workbenchMetricCatalog))
	}
	for _, spec := range workbenchMetricCatalog {
		entry, present := metrics[spec.id]
		if !present {
			t.Fatalf("overview is missing contract metric %s", spec.id)
		}
		if entry.Empty != metricEmptyZero && entry.Empty != metricEmptyInsufficientData {
			t.Fatalf("%s: empty = %q, want zero or insufficient_data", spec.id, entry.Empty)
		}
		if entry.Empty == metricEmptyZero && entry.Value == nil {
			t.Fatalf("%s has empty rule zero but a null value", spec.id)
		}
		if entry.SampleCount < 0 {
			t.Fatalf("%s: sample_count = %d, want >= 0", spec.id, entry.SampleCount)
		}
	}
}

// TestWorkbenchOverviewCrmMetricsLightUp checks that the six commerce KPIs move
// from `insufficient_data` to a value once the ledger has rows — the definition of
// done for a domain in the contract (§7).
func TestWorkbenchOverviewCrmMetricsLightUp(t *testing.T) {
	client := createWorkbenchClient(t, testUserID, "Metrics fixture client")
	brief := createWorkbenchBrief(t, client.ID, "Metrics fixture brief")
	creator := createWorkbenchCreator(t, testUserID, "Metrics fixture creator")
	collab := createWorkbenchCollab(t, brief.ID, creator.ID, map[string]any{
		"stage":        "confirmed",
		"final_amount": 10000,
		"creator_fee":  4000,
		"sample_cost":  500,
		"platform_fee": 500,
		"currency":     "CNY",
		"issue_id":     nil,
	})

	// Attribution: a post snapshot attached to the collab, captured today.
	post := createWorkbenchPost(t, creator.ID, "https://example.test/post/metrics")
	postBody := map[string]any{
		"collab_id":    collab.ID,
		"platform":     "douyin",
		"url":          "https://example.test/post/metrics",
		"published_at": time.Now().UTC().Format(time.RFC3339),
	}
	// The post was created above without a collab; PATCH it onto the collab so
	// the ROI numerator has something to walk.
	req := workbenchRequest(t, "PATCH", "/api/workbench/creator-posts/"+post.ID, postBody, testUserID)
	req = withURLParam(req, "postId", post.ID)
	testutil.Call(t, testHandler.UpdateCreatorPost, req).Want(http.StatusOK)

	today := time.Now().Format("2006-01-02")
	req = workbenchRequest(t, "POST", "/api/workbench/creator-posts/"+post.ID+"/metrics", map[string]any{
		"captured_on": today,
		"play":        50000,
		"gmv_amount":  5000,
	}, testUserID)
	req = withURLParam(req, "postId", post.ID)
	metric := testutil.Decode[CreatorPostMetricResponse](t, testHandler.UpsertCreatorPostMetric, req, http.StatusCreated)
	t.Cleanup(func() { dbfx.Exec(t, `DELETE FROM creator_post_metric WHERE id = $1`, metric.ID) })

	// A settlement that cleared today feeds the collected KPI.
	req = workbenchRequest(t, "POST", "/api/workbench/crm/settlements", map[string]any{
		"collab_id": collab.ID,
		"kind":      "prepay",
		"amount":    3000,
		"paid_at":   today,
	}, testUserID)
	settlement := testutil.Decode[CrmSettlementResponse](t, testHandler.CreateCrmSettlement, req, http.StatusCreated)
	t.Cleanup(func() { dbfx.Exec(t, `DELETE FROM crm_settlement WHERE id = $1`, settlement.ID) })

	metrics := fetchWorkbenchOverview(t, "", testUserID)

	pipeline := metrics["crm.pipeline.weighted_amount"]
	if pipeline.Value == nil || *pipeline.Value <= 0 {
		t.Fatalf("pipeline weighted amount = %v, want the confirmed collab's weighted value", *pipeline.Value)
	}
	if pipeline.SampleCount < 1 {
		t.Fatalf("pipeline sample_count = %d, want at least the one open collab", pipeline.SampleCount)
	}

	signed := metrics["crm.contract.signed_month"]
	if signed.Value == nil || *signed.Value != 10000 {
		t.Fatalf("contract signed this month = %v, want 10000", *signed.Value)
	}

	collected := metrics["crm.payment.collected_month"]
	if collected.Value == nil || *collected.Value != 3000 {
		t.Fatalf("collected this month = %v, want 3000", *collected.Value)
	}

	margin := metrics["crm.quote.margin_rate"]
	if margin.Value == nil || *margin.Value != 50 {
		t.Fatalf("margin rate = %v, want 50 (10000 revenue, 5000 cost)", *margin.Value)
	}

	roi := metrics["crm.collab.roi"]
	if roi.Value == nil || *roi.Value != 1 {
		t.Fatalf("collab roi = %v, want 1 (5000 attributed GMV over 5000 cost)", *roi.Value)
	}

	// Repeat rate needs settled collaborations: one settled collab for this
	// creator is enough for a 100% rate over a single active creator.
	createWorkbenchCollab(t, brief.ID, creator.ID, map[string]any{
		"stage":        "settled",
		"final_amount": 2000,
	})
	metrics = fetchWorkbenchOverview(t, "", testUserID)
	repeat := metrics["crm.creator.repeat_rate"]
	if repeat.Value == nil || *repeat.Value != 0 {
		// One settled collab, one active creator: the rate is 0%, not null.
		t.Fatalf("repeat rate = %v, want 0 with a single settled collaboration", *repeat.Value)
	}
	if repeat.SampleCount != 1 {
		t.Fatalf("repeat rate sample_count = %d, want 1 active creator", repeat.SampleCount)
	}
}

// TestWorkbenchOverviewDepartmentFilterIsolation proves the department filter is a
// filter and not an access boundary: a plain member may ask for any department,
// and a department with no ledger rows reports gaps rather than inventing zeros.
func TestWorkbenchOverviewDepartmentFilterIsolation(t *testing.T) {
	memberUserID := workbenchTestMember(t)
	departmentID := dbfx.Insert(t, "department", testutil.Cols{
		"workspace_id": testWorkspaceID,
		"name":         "Workbench empty department " + t.Name(),
	})

	metrics := fetchWorkbenchOverview(t, "?department_id="+departmentID, memberUserID)

	for _, id := range []string{
		"crm.pipeline.weighted_amount",
		"crm.contract.signed_month",
		"crm.payment.collected_month",
		"crm.quote.margin_rate",
		"crm.collab.roi",
		"crm.creator.repeat_rate",
	} {
		entry := metrics[id]
		if entry.Value != nil {
			t.Fatalf("%s = %v in an empty department, want null", id, *entry.Value)
		}
		if entry.Empty != metricEmptyInsufficientData {
			t.Fatalf("%s empty = %q, want insufficient_data", id, entry.Empty)
		}
	}

	// Count-typed metrics keep the zero rule: 0 is a real answer there.
	throughput := metrics["work.throughput.week"]
	if throughput.Empty != metricEmptyZero {
		t.Fatalf("work.throughput.week empty = %q, want zero", throughput.Empty)
	}
	if throughput.Value == nil || *throughput.Value != 0 {
		t.Fatalf("work.throughput.week = %v in an empty department, want 0", throughput.Value)
	}

	counts := fetchWorkbenchCounts(t, "?department_id="+departmentID, memberUserID)
	if counts.Creators != 0 || counts.Clients != 0 || counts.CollabsOpen != 0 {
		t.Fatalf("counts for an empty department = %+v, want zeros", counts)
	}
}

// TestWorkbenchCountsTrackLedgerRows checks the sidebar counts against exact
// deltas, so a new row is reflected once and an archived one stops counting.
func TestWorkbenchCountsTrackLedgerRows(t *testing.T) {
	before := fetchWorkbenchCounts(t, "", testUserID)

	client := createWorkbenchClient(t, testUserID, "Counts fixture client")
	brief := createWorkbenchBrief(t, client.ID, "Counts fixture brief")
	creator := createWorkbenchCreator(t, testUserID, "Counts fixture creator")
	collab := createWorkbenchCollab(t, brief.ID, creator.ID, map[string]any{"stage": "negotiating"})

	req := workbenchRequest(t, "POST", "/api/workbench/crm/settlements", map[string]any{
		"collab_id": collab.ID,
		"kind":      "final",
		"amount":    1200,
	}, testUserID)
	settlement := testutil.Decode[CrmSettlementResponse](t, testHandler.CreateCrmSettlement, req, http.StatusCreated)
	t.Cleanup(func() { dbfx.Exec(t, `DELETE FROM crm_settlement WHERE id = $1`, settlement.ID) })

	after := fetchWorkbenchCounts(t, "", testUserID)
	if after.Creators != before.Creators+1 {
		t.Fatalf("creators = %d, want %d", after.Creators, before.Creators+1)
	}
	if after.Clients != before.Clients+1 {
		t.Fatalf("clients = %d, want %d", after.Clients, before.Clients+1)
	}
	if after.Briefs != before.Briefs+1 {
		t.Fatalf("briefs = %d, want %d", after.Briefs, before.Briefs+1)
	}
	if after.CollabsOpen != before.CollabsOpen+1 {
		t.Fatalf("collabs_open = %d, want %d", after.CollabsOpen, before.CollabsOpen+1)
	}
	if after.SettlementsPending != before.SettlementsPending+1 {
		t.Fatalf("settlements_pending = %d, want %d", after.SettlementsPending, before.SettlementsPending+1)
	}

	// Closing the collaboration takes it out of "open".
	req = workbenchRequest(t, "PATCH", "/api/workbench/crm/collabs/"+collab.ID, map[string]any{
		"stage": "settled",
	}, testUserID)
	req = withURLParam(req, "collabId", collab.ID)
	testutil.Call(t, testHandler.UpdateCrmCollab, req).Want(http.StatusOK)

	final := fetchWorkbenchCounts(t, "", testUserID)
	if final.CollabsOpen != after.CollabsOpen-1 {
		t.Fatalf("collabs_open = %d after settling, want %d", final.CollabsOpen, after.CollabsOpen-1)
	}
}

// TestWorkbenchOverviewRejectsMalformedDepartment guards the filter parser: a
// malformed department id must not silently widen the number to the whole
// workspace.
func TestWorkbenchOverviewRejectsMalformedDepartment(t *testing.T) {
	req := workbenchRequest(t, "GET", "/api/workbench/overview?department_id=not-a-uuid", nil, testUserID)
	testutil.Call(t, testHandler.GetWorkbenchOverview, req).Want(http.StatusBadRequest)

	req = workbenchRequest(t, "GET", "/api/workbench/counts?department_id=not-a-uuid", nil, testUserID)
	testutil.Call(t, testHandler.GetWorkbenchCounts, req).Want(http.StatusBadRequest)
}
