package handler

// Employee rewards and disciplines: 奖惩 (docs/engineering/WORKBENCH-API.md §17).
//
// The roster's 奖惩 tab was the last empty "table pending" state in HR. Nothing
// stored a 奖励 or a 处分, so "who was recognised, who was reprimanded, when and
// why" lived in chat history. This file is the record:
//
//	hr_employee_profile (the person)
//	      ↓ POST /hr/rewards        (月度之星 +500 / 迟到 -0 — a fact with a reason)
//	hr_employee_reward[] (one row per decision, read decided_on DESC)
//
// Three rules the handlers encode:
//
//   - **`amount` is stored positive; `kind` carries the direction.** A fine is a
//     `discipline` row of 500, never -500, and a negative amount is a 400. A sign
//     convention that only the reader remembers is a bug waiting to be summed the
//     wrong way, and this table is never summed anyway (it feeds no aggregate).
//   - **`employee_id` and `kind` are not editable.** A row that stops describing
//     the same person, or turns a fine into a bonus, is a different record: the
//     PATCH answers 400 and the client deletes and re-adds. Everything a person
//     can get wrong while typing (`category` / `reason` / `amount` / `currency` /
//     `decided_on` / `note`) is editable.
//   - **Ownership follows the employee profile.** Writing somebody's reward is
//     part of editing their file, so a `member` writes only for profiles it owns
//     and only to rows it owns; `owner`/`admin` write everything. Reads are
//     member-wide, like the rest of the workbench.

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"

	db "github.com/jerry-halo2026/morchat.co/server/pkg/db/generated"
)

var (
	// hrEmployeeRewardKinds is the tab's two segments. A closed enum because
	// "reward or discipline" is what the page splits the list by; the free text a
	// person needs is `category` and `reason`.
	hrEmployeeRewardKinds = map[string]bool{"reward": true, "discipline": true}

	// hrEmployeeRewardEditable is the PATCH allow-list. `employee_id` and `kind`
	// are absent on purpose — they are a 400, not a silent no-op (see the header).
	hrEmployeeRewardEditable = map[string]bool{
		"category": true, "reason": true, "amount": true,
		"currency": true, "decided_on": true, "note": true,
	}
)

// ---- request bodies --------------------------------------------------------

// HrEmployeeRewardRequest is the create body. `employee_id`, `kind`, `reason` and
// `decided_on` are required; `category` / `amount` / `currency` / `note` are not,
// because a 通报表扬 has no money and a quick entry has no label yet.
//
// There is no `owner_member_id`: the row belongs to the employee profile's owner,
// so recording somebody else's reward without owning their file is a 403 rather
// than a reassignment.
type HrEmployeeRewardRequest struct {
	EmployeeID *string  `json:"employee_id"`
	Kind       *string  `json:"kind"`
	Category   *string  `json:"category"`
	Reason     *string  `json:"reason"`
	Amount     *float64 `json:"amount"`
	Currency   *string  `json:"currency"`
	DecidedOn  *string  `json:"decided_on"`
	Note       *string  `json:"note"`
}

// ---- responses -------------------------------------------------------------

// HrEmployeeRewardResponse is one row. `decided_on` is a calendar day
// (`YYYY-MM-DD`), the same wire form as every other HR date; `amount` is a JSON
// number (§3.1) or null, and is always >= 0 — `kind` says which direction.
type HrEmployeeRewardResponse struct {
	ID            string   `json:"id"`
	WorkspaceID   string   `json:"workspace_id"`
	EmployeeID    string   `json:"employee_id"`
	Kind          string   `json:"kind"`
	Category      *string  `json:"category"`
	Reason        string   `json:"reason"`
	Amount        *float64 `json:"amount"`
	Currency      string   `json:"currency"`
	DecidedOn     string   `json:"decided_on"`
	Note          *string  `json:"note"`
	OwnerMemberID *string  `json:"owner_member_id"`
	CreatedBy     *string  `json:"created_by"`
	CreatedAt     string   `json:"created_at"`
	UpdatedAt     string   `json:"updated_at"`
	ArchivedAt    *string  `json:"archived_at"`
}

func hrEmployeeRewardToResponse(r db.HrEmployeeReward) HrEmployeeRewardResponse {
	return HrEmployeeRewardResponse{
		ID:            uuidToString(r.ID),
		WorkspaceID:   uuidToString(r.WorkspaceID),
		EmployeeID:    uuidToString(r.EmployeeID),
		Kind:          r.Kind,
		Category:      textToPtr(r.Category),
		Reason:        r.Reason,
		Amount:        numericToFloatPtr(r.Amount),
		Currency:      strings.TrimSpace(r.Currency),
		DecidedOn:     dateToString(r.DecidedOn),
		Note:          textToPtr(r.Note),
		OwnerMemberID: uuidToPtr(r.OwnerMemberID),
		CreatedBy:     uuidToPtr(r.CreatedBy),
		CreatedAt:     timestampToString(r.CreatedAt),
		UpdatedAt:     timestampToString(r.UpdatedAt),
		ArchivedAt:    timestampToPtr(r.ArchivedAt),
	}
}

// ---- field validation ------------------------------------------------------

// hrEmployeeRewardKind validates a required kind against the enum.
func hrEmployeeRewardKind(w http.ResponseWriter, raw *string) (string, bool) {
	kind := strings.TrimSpace(valueOrEmpty(raw))
	if kind == "" {
		writeError(w, http.StatusBadRequest, "kind is required")
		return "", false
	}
	if !hrEmployeeRewardKinds[kind] {
		writeError(w, http.StatusBadRequest, "kind must be reward or discipline")
		return "", false
	}
	return kind, true
}

// hrEmployeeRewardReason validates the required free text: what happened. A blank
// reason is the one thing this row cannot be missing — it is the only answer the
// tab exists to give.
func hrEmployeeRewardReason(w http.ResponseWriter, raw *string) (string, bool) {
	reason := strings.TrimSpace(valueOrEmpty(raw))
	if reason == "" {
		writeError(w, http.StatusBadRequest, "reason is required")
		return "", false
	}
	return reason, true
}

// hrEmployeeRewardDecidedOn validates the required decision date.
func hrEmployeeRewardDecidedOn(w http.ResponseWriter, raw *string) (pgtype.Date, bool) {
	if raw == nil || strings.TrimSpace(*raw) == "" {
		writeError(w, http.StatusBadRequest, "decided_on is required")
		return pgtype.Date{}, false
	}
	return workbenchDateValue(w, raw, "decided_on")
}

// hrEmployeeRewardAmount validates a money field. The stored number is always
// >= 0 and `kind` says bonus or fine, so a negative amount is rejected rather
// than interpreted: `{"kind":"discipline","amount":-500}` reads like a refund and
// would sort below every other row for the same reason.
func hrEmployeeRewardAmount(w http.ResponseWriter, raw *float64) (pgtype.Numeric, bool) {
	if raw == nil {
		return pgtype.Numeric{}, true
	}
	if *raw < 0 {
		writeError(w, http.StatusBadRequest,
			"amount must not be negative: store the sum as a positive number and use kind to say whether it is a reward or a discipline")
		return pgtype.Numeric{}, false
	}
	return floatToNumeric(raw), true
}

// hrEmployeeRewardCurrency validates the CHAR(3) code. It matters more than it
// looks: the column pads to three characters, so a two-letter value would come
// back with a trailing space. Empty means the fallback — `CNY` on create, the
// stored code on PATCH, because the column is NOT NULL.
func hrEmployeeRewardCurrency(w http.ResponseWriter, raw *string, fallback string) (string, bool) {
	code := strings.ToUpper(strings.TrimSpace(valueOrEmpty(raw)))
	if code == "" {
		return fallback, true
	}
	if len(code) != 3 {
		writeError(w, http.StatusBadRequest, "currency must be a three-letter code")
		return "", false
	}
	return code, true
}

// ---- patch body helpers ----------------------------------------------------
//
// A PATCH decodes the body as a key set, not as a struct, for the reason §16.3
// gives: a struct cannot tell `{"amount": null}` (clear the money) from an absent
// field, and it silently ignores `{"kind": "reward"}`. These helpers read one
// field at a time so presence and null stay distinguishable.

// hrRewardPatchText decodes a nullable text field: `null` and `""` both clear it.
func hrRewardPatchText(w http.ResponseWriter, raw json.RawMessage, field string) (pgtype.Text, bool) {
	var value *string
	if err := json.Unmarshal(raw, &value); err != nil {
		writeError(w, http.StatusBadRequest, field+" must be a string or null")
		return pgtype.Text{}, false
	}
	return optionalTrimmedText(value), true
}

// hrRewardPatchAmount decodes a nullable money field: `null` clears it, a number
// is validated by `hrEmployeeRewardAmount`'s rule.
func hrRewardPatchAmount(w http.ResponseWriter, raw json.RawMessage) (pgtype.Numeric, bool) {
	var value *float64
	if err := json.Unmarshal(raw, &value); err != nil {
		writeError(w, http.StatusBadRequest, "amount must be a number or null")
		return pgtype.Numeric{}, false
	}
	return hrEmployeeRewardAmount(w, value)
}

// ---- loaders ---------------------------------------------------------------

// loadHrEmployeeReward resolves {rewardId} inside the workspace.
func (h *Handler) loadHrEmployeeReward(w http.ResponseWriter, r *http.Request, scope workbenchScope) (db.HrEmployeeReward, bool) {
	rewardID, ok := parseUUIDOrBadRequest(w, chi.URLParam(r, "rewardId"), "reward id")
	if !ok {
		return db.HrEmployeeReward{}, false
	}
	reward, err := h.Queries.GetHrEmployeeReward(r.Context(), db.GetHrEmployeeRewardParams{
		ID:          rewardID,
		WorkspaceID: scope.WorkspaceUUID,
	})
	if err != nil {
		writeError(w, http.StatusNotFound, "reward not found")
		return db.HrEmployeeReward{}, false
	}
	return reward, true
}

// loadHrEmployeeRewardForWrite resolves {rewardId} and applies the write gate:
// a `member` may only touch the rows it owns.
func (h *Handler) loadHrEmployeeRewardForWrite(w http.ResponseWriter, r *http.Request, scope workbenchScope) (db.HrEmployeeReward, bool) {
	reward, ok := h.loadHrEmployeeReward(w, r, scope)
	if !ok {
		return db.HrEmployeeReward{}, false
	}
	if !workbenchCanWrite(scope.Member, reward.OwnerMemberID) {
		writeError(w, http.StatusForbidden, "you can only change rows you own")
		return db.HrEmployeeReward{}, false
	}
	return reward, true
}

// ---- CRUD ------------------------------------------------------------------

// ListHrEmployeeRewards — GET /api/workbench/hr/rewards
//
// The 奖惩 tab: `?employee_id=` narrows to one person, `?kind=` to rewards or
// disciplines, and `?from=` / `?to=` are an inclusive `decided_on` window.
// Ordering is `decided_on DESC, created_at DESC` — the day the call was made, not
// the day it was typed.
func (h *Handler) ListHrEmployeeRewards(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	if !h.requireWorkbenchCapability(w, r, scope, capHRRead) {
		return
	}
	query := r.URL.Query()
	kind := strings.TrimSpace(query.Get("kind"))
	if kind != "" && !hrEmployeeRewardKinds[kind] {
		writeError(w, http.StatusBadRequest, "kind must be reward or discipline")
		return
	}
	employeeID, ok := workbenchOptionalUUID(w, stringPtr(strings.TrimSpace(query.Get("employee_id"))), "employee_id")
	if !ok {
		return
	}
	fromOn, ok := workbenchDateValue(w, stringPtr(strings.TrimSpace(query.Get("from"))), "from")
	if !ok {
		return
	}
	toOn, ok := workbenchDateValue(w, stringPtr(strings.TrimSpace(query.Get("to"))), "to")
	if !ok {
		return
	}
	if fromOn.Valid && toOn.Valid && toOn.Time.Before(fromOn.Time) {
		writeError(w, http.StatusBadRequest, "to must not be before from")
		return
	}
	rows, err := h.Queries.ListHrEmployeeRewards(r.Context(), db.ListHrEmployeeRewardsParams{
		WorkspaceID: scope.WorkspaceUUID,
		EmployeeID:  employeeID,
		Kind:        optionalTrimmedText(stringPtr(kind)),
		FromOn:      fromOn,
		ToOn:        toOn,
		Limit:       workbenchLimit(r),
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to list rewards", err)
		return
	}
	resp := make([]HrEmployeeRewardResponse, len(rows))
	for i, row := range rows {
		resp[i] = hrEmployeeRewardToResponse(row)
	}
	writeJSON(w, http.StatusOK, map[string]any{"rewards": resp, "total": len(resp)})
}

// CreateHrEmployeeReward — POST /api/workbench/hr/rewards
//
// The row belongs to the employee profile's owner: recording somebody's reward or
// discipline is part of editing their file, so a `member` may only do it for a
// profile it owns.
func (h *Handler) CreateHrEmployeeReward(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	if !h.requireWorkbenchCapability(w, r, scope, capHRWrite) {
		return
	}
	var req HrEmployeeRewardRequest
	if !decodeWorkbenchBody(w, r, &req) {
		return
	}
	employee, ok := h.requireHrEmployee(w, r, scope, req.EmployeeID)
	if !ok {
		return
	}
	if !workbenchCanWrite(scope.Member, employee.OwnerMemberID) {
		writeError(w, http.StatusForbidden,
			"you can only record rewards and disciplines on employee profiles you own")
		return
	}
	kind, ok := hrEmployeeRewardKind(w, req.Kind)
	if !ok {
		return
	}
	reason, ok := hrEmployeeRewardReason(w, req.Reason)
	if !ok {
		return
	}
	decidedOn, ok := hrEmployeeRewardDecidedOn(w, req.DecidedOn)
	if !ok {
		return
	}
	amount, ok := hrEmployeeRewardAmount(w, req.Amount)
	if !ok {
		return
	}
	currency, ok := hrEmployeeRewardCurrency(w, req.Currency, "CNY")
	if !ok {
		return
	}

	created, err := h.Queries.CreateHrEmployeeReward(r.Context(), db.CreateHrEmployeeRewardParams{
		WorkspaceID:   scope.WorkspaceUUID,
		EmployeeID:    employee.ID,
		Kind:          kind,
		Category:      optionalTrimmedText(req.Category),
		Reason:        reason,
		Amount:        amount,
		Currency:      currency,
		DecidedOn:     decidedOn,
		Note:          optionalTrimmedText(req.Note),
		OwnerMemberID: employee.OwnerMemberID,
		CreatedBy:     scope.Member.UserID,
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to record the reward", err)
		return
	}
	h.publishHrChanged(eventHrEmployeeProfileChanged, scope.WorkspaceID, uuidToString(employee.ID), uuidToString(scope.Member.UserID))
	writeJSON(w, http.StatusCreated, hrEmployeeRewardToResponse(created))
}

// UpdateHrEmployeeReward — PATCH /api/workbench/hr/rewards/{rewardId}
//
// The six editable columns, and `employee_id` / `kind` as a 400 naming the rule.
// The body is decoded as a key set (see the helpers above), so a client that sent
// `{"kind":"reward"}` learns it did not change anything instead of being told 200.
//
// `amount: null` clears the money; `currency` cannot be cleared (NOT NULL, and a
// row always has a unit), so `null` / `""` keeps the stored code.
func (h *Handler) UpdateHrEmployeeReward(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	if !h.requireWorkbenchCapability(w, r, scope, capHRWrite) {
		return
	}
	current, ok := h.loadHrEmployeeRewardForWrite(w, r, scope)
	if !ok {
		return
	}
	var body map[string]json.RawMessage
	if !decodeWorkbenchBody(w, r, &body) {
		return
	}
	for field := range body {
		if field == "employee_id" || field == "kind" {
			writeError(w, http.StatusBadRequest,
				"employee_id and kind cannot be edited: delete the row and record a new one")
			return
		}
		if !hrEmployeeRewardEditable[field] {
			writeError(w, http.StatusBadRequest, "unknown field "+field)
			return
		}
	}

	category, reason, amount := current.Category, current.Reason, current.Amount
	currency, decidedOn, note := current.Currency, current.DecidedOn, current.Note

	if raw, sent := body["category"]; sent {
		if category, ok = hrRewardPatchText(w, raw, "category"); !ok {
			return
		}
	}
	if raw, sent := body["reason"]; sent {
		var value *string
		if err := json.Unmarshal(raw, &value); err != nil {
			writeError(w, http.StatusBadRequest, "reason must be a string")
			return
		}
		if reason, ok = hrEmployeeRewardReason(w, value); !ok {
			return
		}
	}
	if raw, sent := body["amount"]; sent {
		if amount, ok = hrRewardPatchAmount(w, raw); !ok {
			return
		}
	}
	if raw, sent := body["currency"]; sent {
		var value *string
		if err := json.Unmarshal(raw, &value); err != nil {
			writeError(w, http.StatusBadRequest, "currency must be a string or null")
			return
		}
		if currency, ok = hrEmployeeRewardCurrency(w, value, strings.TrimSpace(current.Currency)); !ok {
			return
		}
	}
	if raw, sent := body["decided_on"]; sent {
		var value *string
		if err := json.Unmarshal(raw, &value); err != nil {
			writeError(w, http.StatusBadRequest, "decided_on must be a string")
			return
		}
		if decidedOn, ok = hrEmployeeRewardDecidedOn(w, value); !ok {
			return
		}
	}
	if raw, sent := body["note"]; sent {
		if note, ok = hrRewardPatchText(w, raw, "note"); !ok {
			return
		}
	}

	updated, err := h.Queries.UpdateHrEmployeeReward(r.Context(), db.UpdateHrEmployeeRewardParams{
		Category:    category,
		Reason:      reason,
		Amount:      amount,
		Currency:    currency,
		DecidedOn:   decidedOn,
		Note:        note,
		ID:          current.ID,
		WorkspaceID: scope.WorkspaceUUID,
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to update the reward", err)
		return
	}
	h.publishHrChanged(eventHrEmployeeProfileChanged, scope.WorkspaceID, uuidToString(updated.EmployeeID), uuidToString(scope.Member.UserID))
	writeJSON(w, http.StatusOK, hrEmployeeRewardToResponse(updated))
}

// DeleteHrEmployeeReward — DELETE /api/workbench/hr/rewards/{rewardId}
//
// Soft delete: a row recorded by mistake stops being part of the answer while the
// record that somebody recorded it stays in the table (the same rule as every
// other workbench ledger).
func (h *Handler) DeleteHrEmployeeReward(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	if !h.requireWorkbenchCapability(w, r, scope, capHRWrite) {
		return
	}
	current, ok := h.loadHrEmployeeRewardForWrite(w, r, scope)
	if !ok {
		return
	}
	archived, err := h.Queries.ArchiveHrEmployeeReward(r.Context(), db.ArchiveHrEmployeeRewardParams{
		ID:          current.ID,
		WorkspaceID: scope.WorkspaceUUID,
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to delete the reward", err)
		return
	}
	if archived == 0 {
		writeError(w, http.StatusNotFound, "reward not found")
		return
	}
	h.publishHrChanged(eventHrEmployeeProfileChanged, scope.WorkspaceID, uuidToString(current.EmployeeID), uuidToString(scope.Member.UserID))
	w.WriteHeader(http.StatusNoContent)
}
