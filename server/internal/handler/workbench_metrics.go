package handler

// Aggregates for the workbench: `/overview` and `/counts`
// (docs/engineering/WORKBENCH-API.md §3, docs/METRICS.md §2).
//
// The server is the only place a ratio is computed. The response carries, per
// metric id, the value and the sample size behind it, plus the contract's empty
// rule — so the UI can render a gap card instead of a zero it invented. A
// `value: null` means "not computable from the rows that exist", which is a
// different statement from "0".

import (
	"context"
	"errors"
	"net/http"

	"golang.org/x/sync/errgroup"

	"github.com/jackc/pgx/v5/pgtype"

	db "github.com/jerry-halo2026/morchat.co/server/pkg/db/generated"
)

const (
	metricEmptyZero             = "zero"
	metricEmptyInsufficientData = "insufficient_data"
)

// workbenchReadConcurrency bounds how many reads of one response are in flight at
// once.
//
// The overview's two reads have no order to obey — the strip answers from its own
// ledgers and the verifiability slices from `activity_log`, and neither feeds the
// other — so awaiting them one by one would pay the round trip twice for nothing.
// Against the shared pooler a round trip is ~350 ms, which is what made the
// original twenty-one reads cost 7.7–8.5 s. Two independent reads is now the whole
// shape of the batch; the bound stays because the same helper is the one place
// that decides "how wide", and a burst of statements on a pooler whose connection
// budget is shared with every other workspace queues behind itself.
const workbenchReadConcurrency = 8

// workbenchRead is one independent read of a workbench response: the query, and
// the message the endpoint's 500 names when that query is the one that failed.
//
// `label` is the serial loop's own wording, kept verbatim so that a 500 means the
// same thing before and after this batch was made concurrent.
type workbenchRead struct {
	label string
	run   func(context.Context) error
}

// workbenchReadError attributes a batch failure to the read it came from.
type workbenchReadError struct {
	label string
	err   error
}

func (e *workbenchReadError) Error() string { return e.label + ": " + e.err.Error() }

func (e *workbenchReadError) Unwrap() error { return e.err }

// runWorkbenchReads waits for every read in `reads` and returns the first failure
// in *declaration* order, not the first to arrive.
//
// Declaration order is the serial loop's order, and that is what keeps a failure
// reportable: with two reads failing at once, "whichever finished first" would
// make the 500 message depend on scheduling. All reads share one `ctx`, so a
// client disconnect or a request timeout still ends every one of them.
//
// No read is skipped when one fails — the batch has already been dispatched — but
// nothing is written on failure either: the caller reports one error and the
// endpoint answers the same 500 shape it always has, never a partial success.
func runWorkbenchReads(ctx context.Context, reads []workbenchRead) error {
	return runWorkbenchReadsWithLimit(ctx, reads, workbenchReadConcurrency)
}

// runWorkbenchReadsWithLimit is the same batch at an explicit width. It exists so
// a benchmark can replay the pre-change serial loop (`limit` 1) through the exact
// code path the handler uses.
func runWorkbenchReadsWithLimit(ctx context.Context, reads []workbenchRead, limit int) error {
	if len(reads) == 0 {
		return nil
	}
	if limit < 1 {
		limit = 1
	}
	fails := make([]error, len(reads))
	var group errgroup.Group
	group.SetLimit(limit)
	for i := range reads {
		index := i
		// The group is used for its limiter, not its error channel: each read
		// reports into `fails` so the outcome does not depend on arrival order.
		group.Go(func() error {
			fails[index] = reads[index].run(ctx)
			return nil
		})
	}
	// Every goroutine returns nil, so the error is always nil; Wait is what orders
	// the writes above before this function reads them.
	_ = group.Wait()
	for i := range reads {
		if fails[i] != nil {
			return &workbenchReadError{label: reads[i].label, err: fails[i]}
		}
	}
	return nil
}

// workbenchReadFailure reports a failed batch: the read's own message when the
// failure is attributed, and a general one if it somehow is not.
func workbenchReadFailure(w http.ResponseWriter, r *http.Request, err error, fallback string) {
	var failure *workbenchReadError
	if errors.As(err, &failure) {
		workbenchInternalError(w, r, failure.label, failure.err)
		return
	}
	workbenchInternalError(w, r, fallback, err)
}

// WorkbenchMetricValue is one entry of the overview strip.
type WorkbenchMetricValue struct {
	// Value is nil when the metric cannot be computed yet — the UI renders the
	// gap card, never a zero.
	Value *float64 `json:"value"`
	// SampleCount is how many rows the value was computed from (for a ratio:
	// the denominator).
	SampleCount int64 `json:"sample_count"`
	// Empty is the metric's empty rule from
	// `packages/core/metrics/contracts.ts`, so the client renders the state the
	// contract names instead of guessing.
	Empty string `json:"empty"`
}

// WorkbenchOverviewResponse is `GET /api/workbench/overview`.
type WorkbenchOverviewResponse struct {
	Metrics map[string]WorkbenchMetricValue `json:"metrics"`
	// AgentMetrics carries the three verifiability rates per (agent, domain)
	// (§26.4). They are slices rather than entries in the flat map because a
	// single number per metric would be exactly the "one score" the contract
	// forbids.
	AgentMetrics []AgentMetricSlice `json:"agent_metrics"`
}

// WorkbenchCountsResponse is `GET /api/workbench/counts` (the sidebar counts).
//
// Every key is one ledger the left rail lists, and the shape is additive-only: a
// client that predates `media_scripts` simply never reads it, and a client that
// asks for a key the server has not shipped yet falls back to 0 through its own
// schema. Nothing here is ever renamed — a count is a badge, and a badge that
// disappears is a list that looks empty.
type WorkbenchCountsResponse struct {
	Creators           int64 `json:"creators"`
	Clients            int64 `json:"clients"`
	Briefs             int64 `json:"briefs"`
	CollabsOpen        int64 `json:"collabs_open"`
	SettlementsPending int64 `json:"settlements_pending"`
	Jobs               int64 `json:"jobs"`
	Candidates         int64 `json:"candidates"`
	Interviews         int64 `json:"interviews"`
	Employees          int64 `json:"employees"`
	// Content production and discovery (WORKBENCH-API §12 / §21).
	MediaScripts int64 `json:"media_scripts"`
	MediaShoots  int64 `json:"media_shoots"`
	Hot          int64 `json:"hot"`
	Bench        int64 `json:"bench"`
	// General manager ledgers (WORKBENCH-API §13).
	Goals   int64 `json:"goals"`
	Signals int64 `json:"signals"`
}

// workbenchMetricCatalog mirrors the metric ids and empty rules of
// `WORKBENCH_METRICS` (packages/core/metrics/contracts.ts). The server owns the
// values, the client owns the copy; the id list has to agree or the board shows
// a hole, so both are edited in the same change (docs/METRICS.md §1 rule 6).
var workbenchMetricCatalog = []struct {
	id        string
	emptyRule string
}{
	{"work.throughput.week", metricEmptyZero},
	{"work.cycle_time.median", metricEmptyInsufficientData},
	{"work.on_time.rate", metricEmptyInsufficientData},
	{"work.overdue.count", metricEmptyZero},
	{"work.stalled.count", metricEmptyZero},
	{"work.wip.count", metricEmptyZero},
	{"work.wip.per_member", metricEmptyInsufficientData},
	{"work.followup_due.count", metricEmptyZero},
	{"collab.cross_department.rate", metricEmptyInsufficientData},
	{"agent.cost.month", metricEmptyZero},
	{"agent.run.failure_rate", metricEmptyInsufficientData},
	{"knowledge.created.week", metricEmptyZero},
	{"crm.pipeline.weighted_amount", metricEmptyInsufficientData},
	{"crm.contract.signed_month", metricEmptyInsufficientData},
	{"crm.payment.collected_month", metricEmptyInsufficientData},
	{"crm.quote.margin_rate", metricEmptyInsufficientData},
	{"crm.collab.roi", metricEmptyInsufficientData},
	{"crm.creator.repeat_rate", metricEmptyInsufficientData},
	{"hr.candidates.active", metricEmptyZero},
	{"hr.time_to_hire.median", metricEmptyInsufficientData},
	{"hr.scorecard.backlog", metricEmptyZero},
	{"hr.interview.on_time_rate", metricEmptyInsufficientData},
	// Verifiability (WORKBENCH-API §26.4): three rates that only exist as
	// (agent, domain) slices. The flat map carries the ids so a client that looks
	// one up finds a state instead of a hole — always a gap, because there is no
	// such thing as this workspace's single overwrite rate (§26.4: no single
	// score). The slices ride in `agent_metrics`.
	{metricAgentOverwriteRate, metricEmptyInsufficientData},
	{metricAgentRejectRate, metricEmptyInsufficientData},
	{metricAgentRollbackRate, metricEmptyInsufficientData},
}

// metricValue builds one entry. `computable` is what decides null: a metric whose
// sample size is zero has no value, and saying so is the whole point of the
// three-state contract.
//
// `empty` reports the state the value is in, not the contract's rule verbatim:
// a metric that produced a number is never `insufficient_data`, even when its
// rule says an empty ledger would be. Sending the rule unconditionally made the
// client render a gap card over a real value (hr.interview.on_time_rate = 100 %
// came back as insufficient_data).
func metricValue(value float64, computable bool, sampleCount int64, emptyRule string) WorkbenchMetricValue {
	entry := WorkbenchMetricValue{SampleCount: sampleCount, Empty: emptyRule}
	if computable {
		entry.Value = &value
		if emptyRule == metricEmptyInsufficientData {
			entry.Empty = metricEmptyZero
		}
	}
	return entry
}

// ratioValue returns numerator/denominator as a plain ratio.
//
// Rates travel at the 0–1 storage scale, not 0–100: the contract fixes that
// scale (docs/METRICS.md C3) and the client multiplies by 100 for display. A
// server that shipped 0–100 rendered as 10,000%.
func ratioValue(numerator, denominator float64) (float64, bool) {
	if denominator == 0 {
		return 0, false
	}
	return numerator / denominator, true
}

// GetWorkbenchOverview — GET /api/workbench/overview
func (h *Handler) GetWorkbenchOverview(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	if !h.requireWorkbenchCapability(w, r, scope, capCRMRead) {
		return
	}
	department, ok := workbenchDepartmentFilter(w, r)
	if !ok {
		return
	}
	ctx := r.Context()

	// The strip's one aggregate statement and the verifiability read are
	// independent — neither feeds the other — so they are dispatched together and
	// awaited once. A failure is reported in declaration order, not arrival order:
	// `runWorkbenchReads` explains why.
	var rows workbenchOverviewRows
	if err := runWorkbenchReads(ctx, h.workbenchOverviewReads(scope, department, &rows)); err != nil {
		workbenchReadFailure(w, r, err, "failed to load the overview metrics")
		return
	}

	// The strip's sixteen aggregates arrived as one row; the ratios they carry as
	// two counts are divided here, once, so no client re-derives one.
	agg := rows.aggregates
	onTimeRate, onTimeOK := ratioValue(float64(agg.OnTimeHits), float64(agg.OnTimeSamples))
	wipPerMember, wipOK := ratioValue(float64(agg.OpenMemberAssigned), float64(agg.ActiveMembers))
	crossRate, crossOK := ratioValue(float64(agg.CrossCount), float64(agg.CrossResolvedCount))
	failureRate, failureOK := ratioValue(float64(agg.FailedRuns), float64(agg.FinishedRuns))
	marginRate, marginOK := ratioValue(agg.Revenue-agg.MarginCost, agg.Revenue)
	roiValue, roiOK := ratioValue(agg.AttributedGmv, agg.RoiCost)
	repeatRate, repeatOK := ratioValue(float64(agg.RepeatCreators), float64(agg.ActiveCreators))
	hrOnTimeRate, hrOnTimeOK := ratioValue(float64(agg.OnTimeCount), float64(agg.ScheduledCount))

	metrics := map[string]WorkbenchMetricValue{
		// Delivery behaviour: these read data the platform already writes, so the
		// strip is alive on day one (docs/METRICS.md §2).
		"work.throughput.week": metricValue(float64(agg.ThroughputWeek), true, agg.ThroughputWeek, metricEmptyZero),
		"work.cycle_time.median": metricValue(agg.CycleMedianDays, agg.CycleSampleCount > 0,
			agg.CycleSampleCount, metricEmptyInsufficientData),
		"work.on_time.rate": metricValue(onTimeRate, onTimeOK, agg.OnTimeSamples,
			metricEmptyInsufficientData),
		"work.overdue.count":      metricValue(float64(agg.OverdueCount), true, agg.OverdueCount, metricEmptyZero),
		"work.stalled.count":      metricValue(float64(agg.StalledCount), true, agg.StalledCount, metricEmptyZero),
		"work.wip.count":          metricValue(float64(agg.WipCount), true, agg.WipCount, metricEmptyZero),
		"work.wip.per_member":     metricValue(wipPerMember, wipOK, agg.ActiveMembers, metricEmptyInsufficientData),
		"work.followup_due.count": metricValue(float64(agg.FollowupDueCount), true, agg.FollowupDueCount, metricEmptyZero),
		"collab.cross_department.rate": metricValue(crossRate, crossOK, agg.CrossResolvedCount,
			metricEmptyInsufficientData),
		// Provider-reported cost is stored in 1e-10 USD ticks.
		"agent.cost.month":       metricValue(float64(agg.CostTicks)/1e10, true, agg.UsageRows, metricEmptyZero),
		"agent.run.failure_rate": metricValue(failureRate, failureOK, agg.FinishedRuns, metricEmptyInsufficientData),
		"knowledge.created.week": metricValue(float64(agg.CreatedWeek), true, agg.CreatedWeek, metricEmptyZero),

		// Creator commerce: `insufficient_data` until the ledger has rows.
		"crm.pipeline.weighted_amount": metricValue(agg.WeightedAmount, agg.PipelineSampleCount > 0,
			agg.PipelineSampleCount, metricEmptyInsufficientData),
		"crm.contract.signed_month": metricValue(agg.SignedAmount, agg.SignedSampleCount > 0,
			agg.SignedSampleCount, metricEmptyInsufficientData),
		"crm.payment.collected_month": metricValue(agg.CollectedAmount, agg.CollectedSampleCount > 0,
			agg.CollectedSampleCount, metricEmptyInsufficientData),
		"crm.quote.margin_rate": metricValue(marginRate, marginOK, agg.MarginSampleCount,
			metricEmptyInsufficientData),
		"crm.collab.roi": metricValue(roiValue, roiOK, agg.RoiSampleCount, metricEmptyInsufficientData),
		"crm.creator.repeat_rate": metricValue(repeatRate, repeatOK, agg.ActiveCreators,
			metricEmptyInsufficientData),

		// HR (docs/METRICS.md §2): the two counts answer from an empty ledger
		// (a real zero), the two ratios need rows before they mean anything.
		"hr.candidates.active": metricValue(float64(agg.ActiveCandidates), true, agg.ActiveCandidates, metricEmptyZero),
		"hr.time_to_hire.median": metricValue(agg.TimeToHireMedianDays, agg.TimeToHireSampleCount > 0,
			agg.TimeToHireSampleCount, metricEmptyInsufficientData),
		"hr.scorecard.backlog": metricValue(float64(agg.BacklogCount), true, agg.BacklogCount, metricEmptyZero),
		"hr.interview.on_time_rate": metricValue(hrOnTimeRate, hrOnTimeOK, agg.ScheduledCount,
			metricEmptyInsufficientData),
	}

	// Every catalog id answers, even one whose query produced no row: a missing key
	// would render as an undefined metric rather than a gap.
	response := WorkbenchOverviewResponse{
		Metrics:      make(map[string]WorkbenchMetricValue, len(workbenchMetricCatalog)),
		AgentMetrics: rows.agentMetrics,
	}
	for _, spec := range workbenchMetricCatalog {
		if value, present := metrics[spec.id]; present {
			response.Metrics[spec.id] = value
			continue
		}
		response.Metrics[spec.id] = WorkbenchMetricValue{Empty: spec.emptyRule}
	}
	writeJSON(w, http.StatusOK, response)
}

// workbenchOverviewRows is what the overview's reads produce: one row per read.
//
// It is a struct rather than a handful of locals because the reads are dispatched
// as one batch: each goroutine writes exactly one field and nothing reads a field
// until `runWorkbenchReads` has returned, so the batch needs no lock — but it does
// need a name for "the results", and a closure that writes a local would hide it.
type workbenchOverviewRows struct {
	// aggregates is the strip's sixteen aggregates, one statement's worth of raw
	// counts and sums. The state of each metric is decided below, in Go.
	aggregates db.OverviewAggregatesRow
	// agentMetrics is the verifiability list (§26.4), shaped here rather than in
	// SQL because it is a slice per (agent, domain), not one number.
	agentMetrics []AgentMetricSlice
}

// workbenchOverviewReads is the overview's query set: the strip in one statement,
// the verifiability slices in another read.
//
// The strip used to be sixteen reads of its own. Every one of them cost a round
// trip — ~350 ms on the shared pooler — so even at eight in flight the endpoint
// spent most of its time waiting to be told what it already had the answer to.
// `OverviewAggregates` answers all sixteen in one wave, and the price is the
// per-metric failure message: sixteen statements named the ledger that broke, one
// statement can only say the overview failed. The verifiability slices keep their
// own read (`activity_log` is the review domain's ledger, not the strip's), which
// is why a failure there is still reported apart from one in the strip.
func (h *Handler) workbenchOverviewReads(scope workbenchScope, department pgtype.UUID, rows *workbenchOverviewRows) []workbenchRead {
	return []workbenchRead{
		{"failed to load the overview metrics", func(ctx context.Context) error {
			row, err := h.Queries.OverviewAggregates(ctx, db.OverviewAggregatesParams{
				WorkspaceID:  scope.WorkspaceUUID,
				DepartmentID: department,
			})
			rows.aggregates = row
			return err
		}},
		// The three verifiability slices ride in the same batch: they take no input
		// the strip computes, and they are the last read the response needs. They
		// are three statements of their own, sequential inside the call, so
		// overlapping them with the strip is where their cost goes to zero.
		{"failed to load the agent verifiability metrics", func(ctx context.Context) error {
			slices, err := h.workbenchAgentMetricSlices(ctx, scope)
			rows.agentMetrics = slices
			return err
		}},
	}
}

// GetWorkbenchCounts — GET /api/workbench/counts
//
// One statement, so there is no batch to widen here: the fifteen counters are
// scalar subqueries of a single `WorkbenchCounts`, and splitting it into fifteen
// round trips is what would make it slow. The overview used to be the opposite
// case — sixteen aggregates of its own — and is now the same shape, one statement
// for the strip plus the verifiability read. The batch stays because those two are
// independent.
func (h *Handler) GetWorkbenchCounts(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	if !h.requireWorkbenchCapability(w, r, scope, capCRMRead) {
		return
	}
	department, ok := workbenchDepartmentFilter(w, r)
	if !ok {
		return
	}
	counts, err := h.Queries.WorkbenchCounts(r.Context(), db.WorkbenchCountsParams{
		WorkspaceID:  scope.WorkspaceUUID,
		DepartmentID: department,
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to load counts", err)
		return
	}
	writeJSON(w, http.StatusOK, WorkbenchCountsResponse{
		Creators:           counts.Creators,
		Clients:            counts.Clients,
		Briefs:             counts.Briefs,
		CollabsOpen:        counts.CollabsOpen,
		SettlementsPending: counts.SettlementsPending,
		Jobs:               counts.Jobs,
		Candidates:         counts.Candidates,
		Interviews:         counts.Interviews,
		Employees:          counts.Employees,
		MediaScripts:       counts.MediaScripts,
		MediaShoots:        counts.MediaShoots,
		Hot:                counts.Hot,
		Bench:              counts.Bench,
		Goals:              counts.Goals,
		Signals:            counts.Signals,
	})
}
