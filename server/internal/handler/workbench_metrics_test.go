package handler

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgtype"

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

	// Rates travel at the 0–1 storage scale and are multiplied by 100 only for
	// display (docs/METRICS.md C3). 10000 revenue over 5000 cost is half.
	margin := metrics["crm.quote.margin_rate"]
	if margin.Value == nil || *margin.Value != 0.5 {
		t.Fatalf("margin rate = %v, want 0.5 (10000 revenue, 5000 cost)", *margin.Value)
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

// ---- the concurrent overview batch -----------------------------------------
//
// The overview's reads were awaited one after another, which on the shared pooler
// (a ~350 ms round trip) meant 7.7–8.5 s of waiting for sixteen aggregates that
// have no order to obey. They are now dispatched as one limited batch. Two
// properties are what make that a refactor rather than a rewrite, and they are
// what these cases pin:
//
//   - a failure is reported as the read it came from, chosen by declaration order
//     rather than by whichever query lost the race, so a 500 says the same thing
//     it said before;
//   - the batch is bounded, because the pooler's connections are shared with every
//     other request this server is answering.

// TestRunWorkbenchReadsReportsFirstFailureInDeclarationOrder holds the error shape
// still: three reads, two failing, the *second* declared one failing slowest so a
// scheduler-dependent report would name the third.
func TestRunWorkbenchReadsReportsFirstFailureInDeclarationOrder(t *testing.T) {
	slowErr := errors.New("second read failed")
	fastErr := errors.New("third read failed")

	reads := []workbenchRead{
		{"failed to load the first metric", func(context.Context) error {
			// Succeeds, and slowly: it must not be mistaken for the failure.
			time.Sleep(20 * time.Millisecond)
			return nil
		}},
		{"failed to load the second metric", func(context.Context) error {
			time.Sleep(10 * time.Millisecond)
			return slowErr
		}},
		{"failed to load the third metric", func(context.Context) error { return fastErr }},
	}

	err := runWorkbenchReads(context.Background(), reads)
	if err == nil {
		t.Fatal("the batch returned no error for two failing reads")
	}
	var failure *workbenchReadError
	if !errors.As(err, &failure) {
		t.Fatalf("error %v is not a workbenchReadError", err)
	}
	if failure.label != "failed to load the second metric" {
		t.Fatalf("reported %q, want the second read (declaration order, not arrival)", failure.label)
	}
	// The original error survives, so the 500's log line still carries it.
	if !errors.Is(err, slowErr) {
		t.Fatalf("error %v does not wrap the failing read's error", err)
	}
}

// TestRunWorkbenchReadsKeepsTheWidthItIsGiven is the limiter guard: twelve reads
// never put more than `limit` statements in flight, and every one of them still
// runs.
func TestRunWorkbenchReadsKeepsTheWidthItIsGiven(t *testing.T) {
	const (
		limit = 3
		total = 12
	)
	var (
		mu        sync.Mutex
		inFlight  int
		highWater int
		started   atomic.Int64
	)

	reads := make([]workbenchRead, total)
	for i := range reads {
		reads[i] = workbenchRead{fmt.Sprintf("read %d", i), func(context.Context) error {
			started.Add(1)
			mu.Lock()
			inFlight++
			if inFlight > highWater {
				highWater = inFlight
			}
			mu.Unlock()

			time.Sleep(2 * time.Millisecond)

			mu.Lock()
			inFlight--
			mu.Unlock()
			return nil
		}}
	}

	if err := runWorkbenchReadsWithLimit(context.Background(), reads, limit); err != nil {
		t.Fatalf("batch failed: %v", err)
	}
	if got := started.Load(); got != total {
		t.Fatalf("%d reads ran, want all %d", got, total)
	}
	// Every read reaches the barrier below, so the observed width is the real one
	// as long as the batch never exceeds the limit.
	if highWater > limit {
		t.Fatalf("%d reads were in flight at once, want at most %d", highWater, limit)
	}
	if highWater < 2 {
		t.Fatalf("%d reads were ever in flight, want the batch to actually overlap", highWater)
	}
}

// BenchmarkWorkbenchOverviewReads prices the change against the real database: the
// same query set at the shipped width and at width 1, which is the serial loop the
// handler used to run. Run it with
//
//	go test ./internal/handler -run '^$' -bench BenchmarkWorkbenchOverviewReads -benchtime 3x
//
// against the shared pooler to see the round trips become waves.
func BenchmarkWorkbenchOverviewReads(b *testing.B) {
	scope := workbenchScope{WorkspaceID: testWorkspaceID, WorkspaceUUID: parseUUID(testWorkspaceID)}
	ctx := context.Background()

	for _, width := range []struct {
		name  string
		limit int
	}{
		{"serial", 1},
		{"concurrent", workbenchReadConcurrency},
	} {
		b.Run(width.name, func(b *testing.B) {
			b.ResetTimer()
			for i := 0; i < b.N; i++ {
				var rows workbenchOverviewRows
				reads := testHandler.workbenchOverviewReads(scope, pgtype.UUID{}, &rows)
				if err := runWorkbenchReadsWithLimit(ctx, reads, width.limit); err != nil {
					b.Fatalf("batch failed: %v", err)
				}
			}
		})
	}
}

// TestWorkbenchCountsTrackContentAndGoalLedgers covers the six counters §21 added
// to the sidebar (media_scripts / media_shoots / hot / bench / goals / signals).
// They are asserted as deltas against the shared workspace: the keys must exist and
// move once per row, and the pre-existing keys must not shift because of it.
func TestWorkbenchCountsTrackContentAndGoalLedgers(t *testing.T) {
	before := fetchWorkbenchCounts(t, "", testUserID)

	ip := mediaIPFixture(t, testUserID, "Counts content fixture IP")
	topic := mediaTopicFixture(t, testUserID, ip.ID, "Counts content fixture topic")
	script := mediaScriptFixture(t, testUserID, topic.ID, "Counts content fixture body")
	mediaShootFixture(t, testUserID, script.ID, "2026-11-18")
	mediaHotFixture(t, testUserID, "Counts hotspot fixture")
	mediaBenchFixture(t, testUserID, ip.ID, "Counts benchmark fixture")

	goalID := dbfx.Insert(t, "goal_okr", testutil.Cols{
		"workspace_id":    testWorkspaceID,
		"cycle":           "2026-Q4",
		"title":           "Counts fixture goal " + t.Name(),
		"owner_member_id": testUserID,
	})
	t.Cleanup(func() { dbfx.Exec(t, `DELETE FROM goal_okr WHERE id = $1`, goalID) })
	signalID := dbfx.Insert(t, "market_signal", testutil.Cols{
		"workspace_id": testWorkspaceID,
		"title":        "Counts fixture signal " + t.Name(),
	})
	t.Cleanup(func() { dbfx.Exec(t, `DELETE FROM market_signal WHERE id = $1`, signalID) })

	after := fetchWorkbenchCounts(t, "", testUserID)

	for _, pair := range []struct {
		name string
		got  int64
		want int64
	}{
		{"media_scripts", after.MediaScripts, before.MediaScripts + 1},
		{"media_shoots", after.MediaShoots, before.MediaShoots + 1},
		{"hot", after.Hot, before.Hot + 1},
		{"bench", after.Bench, before.Bench + 1},
		{"goals", after.Goals, before.Goals + 1},
		{"signals", after.Signals, before.Signals + 1},
	} {
		if pair.got != pair.want {
			t.Fatalf("%s = %d, want %d", pair.name, pair.got, pair.want)
		}
	}

	// The pre-existing keys are untouched by content rows: additive, never repurposed.
	if after.Creators != before.Creators || after.Clients != before.Clients ||
		after.Briefs != before.Briefs || after.CollabsOpen != before.CollabsOpen {
		t.Fatalf("content rows moved a commerce counter: before=%+v after=%+v", before, after)
	}

	// Archiving takes a row back out of its counter: the count is a live-row count,
	// not a "rows ever written" count.
	archived := mediaHotFixture(t, testUserID, "Counts hotspot archived")
	withArchived := fetchWorkbenchCounts(t, "", testUserID)
	if withArchived.Hot != after.Hot+1 {
		t.Fatalf("hot = %d with one more live row, want %d", withArchived.Hot, after.Hot+1)
	}
	req := withURLParam(workbenchRequest(t, "DELETE", "/api/workbench/media/hot/"+archived.ID, nil, testUserID), "hotId", archived.ID)
	testutil.Call(t, testHandler.DeleteMediaHot, req).Want(http.StatusNoContent)
	final := fetchWorkbenchCounts(t, "", testUserID)
	if final.Hot != after.Hot {
		t.Fatalf("hot = %d after archiving, want %d", final.Hot, after.Hot)
	}
}
