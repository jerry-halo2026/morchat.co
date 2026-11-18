package handler

// The workbench's money block: `GET /api/workbench/finance` and the month entry
// that feeds it (`GET` / `PUT /api/workbench/finance/months`).
// docs/engineering/WORKBENCH-API.md §3, docs/METRICS.md §2.
//
// Four figures are read-only aggregates over the rows the CRM ledgers already
// hold. The fifth (margin) and sixth (cash floor) need a cost side, and the
// ledgers cannot supply one for a month in which nothing was settled, nor any
// cash balance at all. Migration 707 adds `ops_finance_month` for exactly those
// two inputs — cash at the start of the month and the month's own fixed /
// variable cost — and this file folds an entry into the figures when one exists.
//
// Which cost set a figure used is part of the answer, not a footnote: the
// response names it in `basis` (entered / settled_collabs / none) so the client
// can say "entered cost" or "no cost entry" instead of describing a number that
// came from somewhere else.
//
// Every figure answers in the same `{value, sample_count, empty}` shape the
// metric strip uses, so the two surfaces render a gap the same way: `value: null`
// means "not measurable from the rows that exist", which is a different statement
// from "0" (docs/METRICS.md §1 rule 3).

import (
	"errors"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	db "github.com/jerry-halo2026/morchat.co/server/pkg/db/generated"
)

// Which cost side a money figure was computed against.
const (
	// financeBasisEntered — the month's own entry (707) carries the cost.
	financeBasisEntered = "entered"
	// financeBasisSettledCollabs — no entry, so the cost of the collaborations
	// that reached `settled` this month is the only cost there is.
	financeBasisSettledCollabs = "settled_collabs"
	// financeBasisNone — neither exists, so there is no cost side at all.
	financeBasisNone = "none"
)

// financeAmountMax caps a single amount: 1e12 yuan is far past any real monthly
// bill, and NUMERIC(14,2) cannot hold more than 1e12 anyway.
const financeAmountMax = 1e12

// financeNoteMaxLen is the note's ceiling, counted in characters because the
// note is Chinese far more often than not.
const financeNoteMaxLen = 2000

// WorkbenchFinanceBlock is one figure of the money block. It is the metric
// entry, not a look-alike: a client renders both through the same three-state
// rule, and a second struct with the same fields would only let the two drift.
type WorkbenchFinanceBlock = WorkbenchMetricValue

// WorkbenchFinanceCostBlock is a figure that has a cost side, so its answer also
// says which cost set produced it. Embedding keeps the metric entry's own shape
// (the client parses both through one schema) and adds the one field the two
// cost-based figures need.
type WorkbenchFinanceCostBlock struct {
	WorkbenchFinanceBlock
	Basis string `json:"basis"`
}

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
	// GrossMargin: (collected − cost) / collected, at the 0–1 storage scale
	// (C3); the client multiplies by 100 for display. `basis` says where the
	// cost came from.
	GrossMargin WorkbenchFinanceCostBlock `json:"gross_margin"`
	// ReceivableDays: mean age of the settlements still unpaid.
	ReceivableDays WorkbenchFinanceBlock `json:"receivable_days"`
	// CashFloor: opening cash + collected − the month's cost. Null until the
	// month has an opening balance (a gap card with copy that says so), because
	// no balance can be derived from the ledgers.
	CashFloor WorkbenchFinanceCostBlock `json:"cash_floor"`
}

// WorkbenchFinanceMonthResponse is one month's entry (707). A null amount is
// "not recorded", never a zero.
type WorkbenchFinanceMonthResponse struct {
	ID           string   `json:"id"`
	WorkspaceID  string   `json:"workspace_id"`
	Month        string   `json:"month"`
	CashOpen     *float64 `json:"cash_open"`
	FixedCost    *float64 `json:"fixed_cost"`
	VariableCost *float64 `json:"variable_cost"`
	Note         *string  `json:"note"`
	CreatedBy    *string  `json:"created_by"`
	CreatedAt    string   `json:"created_at"`
	UpdatedAt    string   `json:"updated_at"`
}

// WorkbenchFinanceMonthListResponse is `GET /api/workbench/finance/months`:
// every month the workspace has entered, newest first, narrowed to one month
// when `?month=` is given.
type WorkbenchFinanceMonthListResponse struct {
	Months []WorkbenchFinanceMonthResponse `json:"months"`
	Total  int                             `json:"total"`
}

// UpsertWorkbenchFinanceMonthRequest is the body of
// `PUT /api/workbench/finance/months`. PUT replaces the month: an omitted amount
// is stored as NULL ("not recorded"), not as the previous value and not as 0.
type UpsertWorkbenchFinanceMonthRequest struct {
	Month        *string  `json:"month"`
	CashOpen     *float64 `json:"cash_open"`
	FixedCost    *float64 `json:"fixed_cost"`
	VariableCost *float64 `json:"variable_cost"`
	Note         *string  `json:"note"`
}

// GetWorkbenchFinance — GET /api/workbench/finance?month=YYYY-MM&department_id=
//
// `?month=` selects the calendar month the figures describe. Omitting it reads the
// server's current month, which is what this endpoint answered before the parameter
// existed — the caliber of every figure is untouched, only the window moves, so a
// historical month is the same read with a different `month_start`. A malformed
// month is a 400; a month with no rows answers `insufficient_data` (or a real zero
// for the two counters), exactly like a current month with nothing in it.
func (h *Handler) GetWorkbenchFinance(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	department, ok := workbenchDepartmentFilter(w, r)
	if !ok {
		return
	}
	monthStart, ok := workbenchMonthValue(w, stringPtr(strings.TrimSpace(r.URL.Query().Get("month"))), "month", true)
	if !ok {
		return
	}

	figure, err := h.Queries.OverviewCrmFinance(r.Context(), db.OverviewCrmFinanceParams{
		WorkspaceID:  scope.WorkspaceUUID,
		DepartmentID: department,
		MonthStart:   monthStart,
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to load finance figures", err)
		return
	}

	// The month entry is read for the same month the aggregate describes (the
	// SQL's own `now()`), so a figure and its cost side can never come from
	// different months. A missing row is the normal case, not an error.
	entry, err := h.financeMonthForFigure(r, scope, figure.Month)
	if err != nil {
		workbenchInternalError(w, r, "failed to load monthly cost entry", err)
		return
	}

	enteredCost, hasEnteredCost := financeEnteredCost(entry)
	cost, marginBasis := 0.0, financeBasisNone
	switch {
	case hasEnteredCost:
		cost, marginBasis = enteredCost, financeBasisEntered
	case figure.CostSamples > 0:
		// Nothing entered, but collaborations were settled this month: their
		// creator + sample + platform fees are the only cost the ledger knows.
		cost, marginBasis = figure.CostAmount, financeBasisSettledCollabs
	}

	// The margin is the one division in this file; it goes through `ratioValue`
	// like every other rate so the 0–1 scale is applied in exactly one place.
	margin, marginOK := ratioValue(figure.CollectedAmount-cost, figure.CollectedAmount)
	// With no cost side, (collected − 0) / collected would print a 100 % margin
	// no ledger can support, so a month with no cost at all reports a gap. A
	// month with no collected money has no denominator either, which `ratioValue`
	// already answers.
	if marginBasis == financeBasisNone {
		marginOK = false
	}

	// The cash floor needs an opening balance; without one there is nothing to
	// add the month's flow to, and inventing 0 would be the fabrication rule 3
	// exists to prevent. With a balance, the cost side is the entry's — a settled
	// collaboration's fees are not the same kind of outflow.
	cashFloor, cashOK, cashBasis := 0.0, false, financeBasisNone
	if entry != nil && entry.CashOpen.Valid {
		cashOK = true
		cashFloor = numericToFloat(entry.CashOpen) + figure.CollectedAmount - enteredCost
		if hasEnteredCost {
			cashBasis = financeBasisEntered
		}
	}

	writeJSON(w, http.StatusOK, WorkbenchFinanceResponse{
		Window: WorkbenchFinanceWindow{Month: figure.Month},
		// Signed and collected answer from an empty ledger with a real zero: "no
		// money moved" is a fact, not a missing measurement.
		Signed:         metricValue(figure.SignedAmount, true, figure.SignedSamples, metricEmptyZero),
		Collected:      metricValue(figure.CollectedAmount, true, figure.CollectedSamples, metricEmptyZero),
		GrossMargin:    financeCostBlock(margin, marginOK, figure.CollectedSamples, metricEmptyInsufficientData, marginBasis),
		ReceivableDays: metricValue(figure.ReceivableDays, figure.ReceivableSamples > 0, figure.ReceivableSamples, metricEmptyInsufficientData),
		CashFloor:      financeCostBlock(cashFloor, cashOK, financeSampleCount(cashOK), metricEmptyInsufficientData, cashBasis),
	})
}

// ListWorkbenchFinanceMonths — GET /api/workbench/finance/months?month=YYYY-MM
//
// The whole history, newest month first. `?month=` narrows it to one month; the
// entry dialog uses it to pre-fill this month's row. Reads are member-wide, like
// every other workbench read.
func (h *Handler) ListWorkbenchFinanceMonths(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	month, ok := workbenchMonthValue(w, stringPtr(strings.TrimSpace(r.URL.Query().Get("month"))), "month", true)
	if !ok {
		return
	}

	rows, err := h.Queries.ListOpsFinanceMonths(r.Context(), db.ListOpsFinanceMonthsParams{
		WorkspaceID: scope.WorkspaceUUID,
		Month:       month,
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to list monthly finance entries", err)
		return
	}
	resp := make([]WorkbenchFinanceMonthResponse, len(rows))
	for i, row := range rows {
		resp[i] = financeMonthToResponse(row)
	}
	writeJSON(w, http.StatusOK, WorkbenchFinanceMonthListResponse{Months: resp, Total: len(resp)})
}

// UpsertWorkbenchFinanceMonth — PUT /api/workbench/finance/months
//
// One row per (workspace_id, month) among live rows (708), so a second PUT is an
// edit. The month is the only required field: an entry that names no amount is
// still a statement ("this month has no recorded cost"), and it is the row the
// dialog writes back when a reader clears a number.
func (h *Handler) UpsertWorkbenchFinanceMonth(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	// The entry is workspace-wide bookkeeping — it has no owner column a member
	// could hold it by — so the write gate is the role, not the row.
	if !roleAllowed(scope.Member.Role, "owner", "admin") {
		writeError(w, http.StatusForbidden, "only workspace owners and admins can record monthly finance entries")
		return
	}

	var req UpsertWorkbenchFinanceMonthRequest
	if !decodeWorkbenchBody(w, r, &req) {
		return
	}
	if req.Month == nil || strings.TrimSpace(*req.Month) == "" {
		writeError(w, http.StatusBadRequest, "month is required (YYYY-MM-DD, the first day of the month)")
		return
	}
	month, ok := workbenchMonthValue(w, req.Month, "month", false)
	if !ok {
		return
	}
	cashOpen, ok := financeAmount(w, req.CashOpen, "cash_open")
	if !ok {
		return
	}
	fixedCost, ok := financeAmount(w, req.FixedCost, "fixed_cost")
	if !ok {
		return
	}
	variableCost, ok := financeAmount(w, req.VariableCost, "variable_cost")
	if !ok {
		return
	}
	note := optionalTrimmedText(req.Note)
	if note.Valid && utf8.RuneCountInString(note.String) > financeNoteMaxLen {
		writeError(w, http.StatusBadRequest, "note is limited to 2000 characters")
		return
	}

	row, err := h.Queries.UpsertOpsFinanceMonth(r.Context(), db.UpsertOpsFinanceMonthParams{
		WorkspaceID:  scope.WorkspaceUUID,
		Month:        month,
		CashOpen:     cashOpen,
		FixedCost:    fixedCost,
		VariableCost: variableCost,
		Note:         note,
		CreatedBy:    scope.Member.UserID,
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to save the monthly finance entry", err)
		return
	}
	writeJSON(w, http.StatusOK, financeMonthToResponse(row))
}

// financeMonthForFigure reads the entry the aggregate's month describes. No row
// is `(nil, nil)`: the month was simply never entered.
func (h *Handler) financeMonthForFigure(r *http.Request, scope workbenchScope, month string) (*db.OpsFinanceMonth, error) {
	parsed, err := time.Parse("2006-01", month)
	if err != nil {
		// The month label comes from the SQL, so an unparsable one is a bug there.
		return nil, err
	}
	row, err := h.Queries.GetOpsFinanceMonth(r.Context(), db.GetOpsFinanceMonthParams{
		WorkspaceID: scope.WorkspaceUUID,
		Month:       pgtype.Date{Time: parsed, Valid: true},
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return &row, nil
}

// financeEnteredCost is the month's own cost bill: fixed + variable, with a null
// amount counting as "not recorded". `ok` is false when neither amount was
// entered — an entry that only records cash does not claim a cost side of zero.
func financeEnteredCost(entry *db.OpsFinanceMonth) (float64, bool) {
	if entry == nil {
		return 0, false
	}
	if !entry.FixedCost.Valid && !entry.VariableCost.Valid {
		return 0, false
	}
	return numericToFloat(entry.FixedCost) + numericToFloat(entry.VariableCost), true
}

// financeCostBlock builds a figure that carries the basis its cost side came
// from. `metricValue` decides the three-state shape; this only adds the label.
func financeCostBlock(value float64, computable bool, sampleCount int64, emptyRule, basis string) WorkbenchFinanceCostBlock {
	return WorkbenchFinanceCostBlock{
		WorkbenchFinanceBlock: metricValue(value, computable, sampleCount, emptyRule),
		Basis:                 basis,
	}
}

// financeSampleCount is 1 for a stated cash floor: it is computed from one
// month's entry plus the month's collections, and `0` would read as "no rows".
func financeSampleCount(stated bool) int64 {
	if stated {
		return 1
	}
	return 0
}

func financeMonthToResponse(m db.OpsFinanceMonth) WorkbenchFinanceMonthResponse {
	return WorkbenchFinanceMonthResponse{
		ID:           uuidToString(m.ID),
		WorkspaceID:  uuidToString(m.WorkspaceID),
		Month:        dateToString(m.Month),
		CashOpen:     numericToFloatPtr(m.CashOpen),
		FixedCost:    numericToFloatPtr(m.FixedCost),
		VariableCost: numericToFloatPtr(m.VariableCost),
		Note:         textToPtr(m.Note),
		CreatedBy:    uuidToPtr(m.CreatedBy),
		CreatedAt:    timestampToString(m.CreatedAt),
		UpdatedAt:    timestampToString(m.UpdatedAt),
	}
}

// workbenchMonthValue parses a month key. The canonical wire form is
// `YYYY-MM-DD` (C7 stores a date, not a label) and it must be the first day of
// its month; a bare `YYYY-MM` is accepted only where the caller allows it — the
// list's `?month=` lookup, whose label is what the money block prints. An
// absent value is "not given", which is not an error.
func workbenchMonthValue(w http.ResponseWriter, raw *string, fieldName string, bareMonth bool) (pgtype.Date, bool) {
	if raw == nil || strings.TrimSpace(*raw) == "" {
		return pgtype.Date{}, true
	}
	value := strings.TrimSpace(*raw)
	if bareMonth {
		if parsed, err := time.Parse("2006-01", value); err == nil {
			return pgtype.Date{Time: parsed, Valid: true}, true
		}
	}
	parsed, err := time.Parse("2006-01-02", value)
	if err != nil || parsed.Day() != 1 {
		writeError(w, http.StatusBadRequest, fieldName+" must be the first day of a month (YYYY-MM-DD)")
		return pgtype.Date{}, false
	}
	return pgtype.Date{Time: parsed, Valid: true}, true
}

// financeAmount validates one optional amount and converts it to NUMERIC. The
// bounds are the column's, checked here so the reader gets a message instead of
// a constraint violation.
func financeAmount(w http.ResponseWriter, raw *float64, fieldName string) (pgtype.Numeric, bool) {
	if raw == nil {
		return pgtype.Numeric{}, true
	}
	if *raw < 0 || *raw > financeAmountMax {
		writeError(w, http.StatusBadRequest, fieldName+" must be between 0 and 1e12")
		return pgtype.Numeric{}, false
	}
	return floatToNumeric(raw), true
}
