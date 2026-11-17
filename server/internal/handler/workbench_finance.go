package handler

// The workbench's money block: `GET /api/workbench/finance`
// (docs/engineering/WORKBENCH-API.md §3, docs/METRICS.md §2).
//
// Four figures plus one deliberate gap, all read-only aggregates over the rows
// the CRM ledgers already hold — no monthly table is written for them. The
// contract for each figure lives in the SQL's own comments
// (`server/pkg/db/queries/workbench_metrics.sql`, `OverviewCrmFinance`), the
// division lives here, and nothing is computed in the view layer
// (docs/METRICS.md §1 rule 2).
//
// Every figure answers in the same `{value, sample_count, empty}` shape the
// metric strip uses, so the two surfaces render a gap the same way: `value: null`
// means "not measurable from the rows that exist", which is a different statement
// from "0" (docs/METRICS.md §1 rule 3).

import (
	"net/http"

	db "github.com/jerry-halo2026/morchat.co/server/pkg/db/generated"
)

// WorkbenchFinanceBlock is one figure of the money block. It is the metric
// entry, not a look-alike: a client renders both through the same three-state
// rule, and a second struct with the same fields would only let the two drift.
type WorkbenchFinanceBlock = WorkbenchMetricValue

// WorkbenchFinanceWindow names the period the figures describe. The month is the
// server's calendar month (`YYYY-MM`), taken from the same `now()` the SQL window
// slices with, so the label and the numbers can never disagree about which month
// they are.
type WorkbenchFinanceWindow struct {
	Month string `json:"month"`
}

// WorkbenchFinanceResponse is `GET /api/workbench/finance`.
type WorkbenchFinanceResponse struct {
	Window WorkbenchFinanceWindow `json:"window"`
	// Signed: contract value confirmed this month (C10 — renewals included).
	Signed WorkbenchFinanceBlock `json:"signed"`
	// Collected: settlement money that actually cleared this month.
	Collected WorkbenchFinanceBlock `json:"collected"`
	// GrossMargin: (collected − settled cost) / collected, at the 0–1 storage
	// scale (C3); the client multiplies by 100 for display.
	GrossMargin WorkbenchFinanceBlock `json:"gross_margin"`
	// ReceivableDays: mean age of the settlements still unpaid.
	ReceivableDays WorkbenchFinanceBlock `json:"receivable_days"`
	// CashFloor is always `null` + `insufficient_data` today: the schema holds no
	// opening cash balance and no cost entry, and inventing either would be the
	// fabrication rule 3 exists to prevent. The client renders the gap card.
	CashFloor WorkbenchFinanceBlock `json:"cash_floor"`
}

// GetWorkbenchFinance — GET /api/workbench/finance?department_id=
func (h *Handler) GetWorkbenchFinance(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	department, ok := workbenchDepartmentFilter(w, r)
	if !ok {
		return
	}

	figure, err := h.Queries.OverviewCrmFinance(r.Context(), db.OverviewCrmFinanceParams{
		WorkspaceID:  scope.WorkspaceUUID,
		DepartmentID: department,
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to load finance figures", err)
		return
	}

	// The margin is the one division in this file; it goes through `ratioValue`
	// like every other rate so the 0–1 scale is applied in exactly one place.
	margin, marginOK := ratioValue(figure.CollectedAmount-figure.CostAmount, figure.CollectedAmount)
	// Money in with no settled collaboration behind it leaves the cost side at
	// zero, and (collected − 0) / collected would then print a 100 % margin the
	// ledger cannot support. Both sides have to exist for the ratio to mean
	// anything, so a month with no settled cost reports a gap instead.
	if figure.CostSamples == 0 {
		marginOK = false
	}

	writeJSON(w, http.StatusOK, WorkbenchFinanceResponse{
		Window: WorkbenchFinanceWindow{Month: figure.Month},
		// Signed and collected answer from an empty ledger with a real zero: "no
		// money moved" is a fact, not a missing measurement.
		Signed:         metricValue(figure.SignedAmount, true, figure.SignedSamples, metricEmptyZero),
		Collected:      metricValue(figure.CollectedAmount, true, figure.CollectedSamples, metricEmptyZero),
		GrossMargin:    metricValue(margin, marginOK, figure.CollectedSamples, metricEmptyInsufficientData),
		ReceivableDays: metricValue(figure.ReceivableDays, figure.ReceivableSamples > 0, figure.ReceivableSamples, metricEmptyInsufficientData),
		CashFloor:      metricValue(0, false, 0, metricEmptyInsufficientData),
	})
}
