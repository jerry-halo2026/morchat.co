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
	"net/http"

	db "github.com/jerry-halo2026/morchat.co/server/pkg/db/generated"
)

const (
	metricEmptyZero             = "zero"
	metricEmptyInsufficientData = "insufficient_data"
)

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
}

// WorkbenchCountsResponse is `GET /api/workbench/counts` (the sidebar counts).
type WorkbenchCountsResponse struct {
	Creators           int64 `json:"creators"`
	Clients            int64 `json:"clients"`
	Briefs             int64 `json:"briefs"`
	CollabsOpen        int64 `json:"collabs_open"`
	SettlementsPending int64 `json:"settlements_pending"`
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
}

// metricValue builds one entry. `computable` is what decides null: a metric whose
// sample size is zero has no value, and saying so is the whole point of the
// three-state contract.
func metricValue(value float64, computable bool, sampleCount int64, emptyRule string) WorkbenchMetricValue {
	entry := WorkbenchMetricValue{SampleCount: sampleCount, Empty: emptyRule}
	if computable {
		entry.Value = &value
	}
	return entry
}

// ratioPercent returns value/total as a 0-100 percentage, and whether it exists.
func ratioPercent(part, total int64) (float64, bool) {
	if total <= 0 {
		return 0, false
	}
	return float64(part) / float64(total) * 100, true
}

// ratioValue returns numerator/denominator as a plain ratio.
func ratioValue(numerator, denominator float64) (float64, bool) {
	if denominator == 0 {
		return 0, false
	}
	return numerator / denominator, true
}

// ratioPercentFloat is ratioValue expressed as a 0-100 percentage, for the
// metrics whose unit is `percent` but whose inputs are already money.
func ratioPercentFloat(part, total float64) (float64, bool) {
	if total == 0 {
		return 0, false
	}
	return part / total * 100, true
}

// GetWorkbenchOverview — GET /api/workbench/overview
func (h *Handler) GetWorkbenchOverview(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	department, ok := workbenchDepartmentFilter(w, r)
	if !ok {
		return
	}
	ctx := r.Context()

	work, err := h.Queries.OverviewWorkCounts(ctx, db.OverviewWorkCountsParams{
		WorkspaceID:  scope.WorkspaceUUID,
		DepartmentID: department,
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to load work metrics", err)
		return
	}
	cycle, err := h.Queries.OverviewCycleTime(ctx, db.OverviewCycleTimeParams{
		WorkspaceID:  scope.WorkspaceUUID,
		DepartmentID: department,
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to load cycle time metric", err)
		return
	}
	cross, err := h.Queries.OverviewCrossDepartment(ctx, scope.WorkspaceUUID)
	if err != nil {
		workbenchInternalError(w, r, "failed to load cross-department metric", err)
		return
	}
	agentCost, err := h.Queries.OverviewAgentCost(ctx, scope.WorkspaceUUID)
	if err != nil {
		workbenchInternalError(w, r, "failed to load agent cost metric", err)
		return
	}
	agentRuns, err := h.Queries.OverviewAgentRuns(ctx, scope.WorkspaceUUID)
	if err != nil {
		workbenchInternalError(w, r, "failed to load agent run metric", err)
		return
	}
	knowledge, err := h.Queries.OverviewKnowledgeWeek(ctx, db.OverviewKnowledgeWeekParams{
		WorkspaceID:  scope.WorkspaceUUID,
		DepartmentID: department,
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to load knowledge metric", err)
		return
	}
	pipeline, err := h.Queries.OverviewCrmPipeline(ctx, db.OverviewCrmPipelineParams{
		WorkspaceID:  scope.WorkspaceUUID,
		DepartmentID: department,
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to load pipeline metric", err)
		return
	}
	signed, err := h.Queries.OverviewCrmSignedMonth(ctx, db.OverviewCrmSignedMonthParams{
		WorkspaceID:  scope.WorkspaceUUID,
		DepartmentID: department,
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to load signed metric", err)
		return
	}
	collected, err := h.Queries.OverviewCrmCollectedMonth(ctx, db.OverviewCrmCollectedMonthParams{
		WorkspaceID:  scope.WorkspaceUUID,
		DepartmentID: department,
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to load collected metric", err)
		return
	}
	margin, err := h.Queries.OverviewCrmMargin(ctx, db.OverviewCrmMarginParams{
		WorkspaceID:  scope.WorkspaceUUID,
		DepartmentID: department,
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to load margin metric", err)
		return
	}
	roi, err := h.Queries.OverviewCrmRoi(ctx, db.OverviewCrmRoiParams{
		WorkspaceID:  scope.WorkspaceUUID,
		DepartmentID: department,
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to load roi metric", err)
		return
	}
	repeat, err := h.Queries.OverviewCrmRepeatRate(ctx, db.OverviewCrmRepeatRateParams{
		WorkspaceID:  scope.WorkspaceUUID,
		DepartmentID: department,
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to load repeat-rate metric", err)
		return
	}

	onTimeRate, onTimeOK := ratioPercent(work.OnTimeHits, work.OnTimeSamples)
	wipPerMember, wipOK := ratioValue(float64(work.OpenMemberAssigned), float64(work.ActiveMembers))
	crossRate, crossOK := ratioPercent(cross.CrossCount, cross.ResolvedCount)
	failureRate, failureOK := ratioPercent(agentRuns.FailedRuns, agentRuns.FinishedRuns)
	marginRate, marginOK := ratioPercentFloat(margin.Revenue-margin.Cost, margin.Revenue)
	roiValue, roiOK := ratioValue(roi.AttributedGmv, roi.Cost)
	repeatRate, repeatOK := ratioPercent(repeat.RepeatCreators, repeat.ActiveCreators)

	metrics := map[string]WorkbenchMetricValue{
		// Delivery behaviour: these read data the platform already writes, so the
		// strip is alive on day one (docs/METRICS.md §2).
		"work.throughput.week": metricValue(float64(work.ThroughputWeek), true, work.ThroughputWeek, metricEmptyZero),
		"work.cycle_time.median": metricValue(cycle.MedianDays, cycle.SampleCount > 0,
			cycle.SampleCount, metricEmptyInsufficientData),
		"work.on_time.rate": metricValue(onTimeRate, onTimeOK, work.OnTimeSamples,
			metricEmptyInsufficientData),
		"work.overdue.count":      metricValue(float64(work.OverdueCount), true, work.OverdueCount, metricEmptyZero),
		"work.stalled.count":      metricValue(float64(work.StalledCount), true, work.StalledCount, metricEmptyZero),
		"work.wip.count":          metricValue(float64(work.WipCount), true, work.WipCount, metricEmptyZero),
		"work.wip.per_member":     metricValue(wipPerMember, wipOK, work.ActiveMembers, metricEmptyInsufficientData),
		"work.followup_due.count": metricValue(float64(work.FollowupDueCount), true, work.FollowupDueCount, metricEmptyZero),
		"collab.cross_department.rate": metricValue(crossRate, crossOK, cross.ResolvedCount,
			metricEmptyInsufficientData),
		// Provider-reported cost is stored in 1e-10 USD ticks.
		"agent.cost.month":       metricValue(float64(agentCost.CostTicks)/1e10, true, agentCost.UsageRows, metricEmptyZero),
		"agent.run.failure_rate": metricValue(failureRate, failureOK, agentRuns.FinishedRuns, metricEmptyInsufficientData),
		"knowledge.created.week": metricValue(float64(knowledge), true, knowledge, metricEmptyZero),

		// Creator commerce: `insufficient_data` until the ledger has rows.
		"crm.pipeline.weighted_amount": metricValue(pipeline.WeightedAmount, pipeline.SampleCount > 0,
			pipeline.SampleCount, metricEmptyInsufficientData),
		"crm.contract.signed_month": metricValue(signed.SignedAmount, signed.SampleCount > 0,
			signed.SampleCount, metricEmptyInsufficientData),
		"crm.payment.collected_month": metricValue(collected.CollectedAmount, collected.SampleCount > 0,
			collected.SampleCount, metricEmptyInsufficientData),
		"crm.quote.margin_rate": metricValue(marginRate, marginOK, margin.SampleCount,
			metricEmptyInsufficientData),
		"crm.collab.roi": metricValue(roiValue, roiOK, roi.SampleCount, metricEmptyInsufficientData),
		"crm.creator.repeat_rate": metricValue(repeatRate, repeatOK, repeat.ActiveCreators,
			metricEmptyInsufficientData),
	}

	// Every catalog id answers, even one whose query failed to produce a row: a
	// missing key would render as an undefined metric rather than a gap.
	response := WorkbenchOverviewResponse{Metrics: make(map[string]WorkbenchMetricValue, len(workbenchMetricCatalog))}
	for _, spec := range workbenchMetricCatalog {
		if value, present := metrics[spec.id]; present {
			response.Metrics[spec.id] = value
			continue
		}
		response.Metrics[spec.id] = WorkbenchMetricValue{Empty: spec.emptyRule}
	}
	writeJSON(w, http.StatusOK, response)
}

// GetWorkbenchCounts — GET /api/workbench/counts
func (h *Handler) GetWorkbenchCounts(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
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
	})
}
