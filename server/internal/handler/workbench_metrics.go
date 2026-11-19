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
	hrActive, err := h.Queries.OverviewHrActiveCandidates(ctx, db.OverviewHrActiveCandidatesParams{
		WorkspaceID:  scope.WorkspaceUUID,
		DepartmentID: department,
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to load active-candidate metric", err)
		return
	}
	hrTimeToHire, err := h.Queries.OverviewHrTimeToHire(ctx, db.OverviewHrTimeToHireParams{
		WorkspaceID:  scope.WorkspaceUUID,
		DepartmentID: department,
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to load time-to-hire metric", err)
		return
	}
	hrBacklog, err := h.Queries.OverviewHrScorecardBacklog(ctx, db.OverviewHrScorecardBacklogParams{
		WorkspaceID:  scope.WorkspaceUUID,
		DepartmentID: department,
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to load scorecard backlog metric", err)
		return
	}
	hrOnTime, err := h.Queries.OverviewHrInterviewOnTime(ctx, db.OverviewHrInterviewOnTimeParams{
		WorkspaceID:  scope.WorkspaceUUID,
		DepartmentID: department,
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to load interview on-time metric", err)
		return
	}

	onTimeRate, onTimeOK := ratioValue(float64(work.OnTimeHits), float64(work.OnTimeSamples))
	wipPerMember, wipOK := ratioValue(float64(work.OpenMemberAssigned), float64(work.ActiveMembers))
	crossRate, crossOK := ratioValue(float64(cross.CrossCount), float64(cross.ResolvedCount))
	failureRate, failureOK := ratioValue(float64(agentRuns.FailedRuns), float64(agentRuns.FinishedRuns))
	marginRate, marginOK := ratioValue(margin.Revenue-margin.Cost, margin.Revenue)
	roiValue, roiOK := ratioValue(roi.AttributedGmv, roi.Cost)
	repeatRate, repeatOK := ratioValue(float64(repeat.RepeatCreators), float64(repeat.ActiveCreators))
	hrOnTimeRate, hrOnTimeOK := ratioValue(float64(hrOnTime.OnTimeCount), float64(hrOnTime.ScheduledCount))

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

		// HR (docs/METRICS.md §2): the two counts answer from an empty ledger
		// (a real zero), the two ratios need rows before they mean anything.
		"hr.candidates.active": metricValue(float64(hrActive), true, hrActive, metricEmptyZero),
		"hr.time_to_hire.median": metricValue(hrTimeToHire.MedianDays, hrTimeToHire.SampleCount > 0,
			hrTimeToHire.SampleCount, metricEmptyInsufficientData),
		"hr.scorecard.backlog": metricValue(float64(hrBacklog), true, hrBacklog, metricEmptyZero),
		"hr.interview.on_time_rate": metricValue(hrOnTimeRate, hrOnTimeOK, hrOnTime.ScheduledCount,
			metricEmptyInsufficientData),
	}

	// Every catalog id answers, even one whose query failed to produce a row: a
	// missing key would render as an undefined metric rather than a gap.
	agentMetrics, err := h.workbenchAgentMetricSlices(ctx, scope)
	if err != nil {
		workbenchInternalError(w, r, "failed to load the agent verifiability metrics", err)
		return
	}
	response := WorkbenchOverviewResponse{
		Metrics:      make(map[string]WorkbenchMetricValue, len(workbenchMetricCatalog)),
		AgentMetrics: agentMetrics,
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

// GetWorkbenchCounts — GET /api/workbench/counts
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
