package handler

// Offboarding management: 发起离职 → 交接 → 离职文书/归档
// (docs/engineering/WORKBENCH-API.md §15).
//
// The page this replaces had no server side at all: the plan lived in component
// state, the handover checklist was an array literal in the template, and the
// paperwork was a Word template filled in the browser. So nothing here is a port
// of an existing query — the shape comes from what the page asked the operator to
// do, and the rules below are the ones that were previously enforced by nothing.
//
// The one rule that shapes every write path:
//
//	**The four segments are a state machine, not a status column.**
//
// `apply → handover → done`, plus `cancelled` as the way out. `advance` is the
// only way forward and `cancel` the only way out; PATCH cannot set `status`, and a
// create always starts in `apply`. Every move is conditional on the status the
// handler just read (`TransitionHrOffboarding … AND status = from_status`), so two
// operators — or one double-clicked button — cannot walk the machine twice, and a
// stale client gets 409 instead of silently skipping 交接.
//
// The second rule is the write-back:
//
//	**Reaching `done` writes `hr_employee_profile.leave_date`:**
//
// `last_day` (the plan) and `leave_date` (the fact) live on different rows, and
// the transition writes both in one transaction. `last_day` stays the single
// source: a wrong date is fixed by editing the offboarding, and the profile
// follows (see UpdateHrOffboarding), rather than by a second editable copy on the
// employee file.
//
// Ownership: a record is gated on its own `owner_member_id` — `owner`/`admin`
// write everything, a `member` writes only its own — while `advance` and `cancel`
// are `owner`/`admin` only. An exit is not something the person leaving (or a
// peer) gets to walk to `done` on their own: the two routes that close the record
// are the two that change what the roster believes about somebody's employment.

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	db "github.com/jerry-halo2026/morchat.co/server/pkg/db/generated"
)

const (
	eventHrOffboardingChanged = "hr_offboarding:changed"

	// hrOffboardingMaxHandover is the contract's ceiling on one checklist. It is a
	// product number, not a storage one: an exit handover with 60 items is a list
	// nobody finishes ticking, and the client renders the count against it.
	hrOffboardingMaxHandover = 40
)

var (
	hrOffboardingStatuses = map[string]bool{
		"apply": true, "handover": true, "done": true, "cancelled": true,
	}

	hrOffboardingKinds = map[string]bool{
		"voluntary": true, "involuntary": true, "contract_end": true, "other": true,
	}

	// hrOffboardingAdvances is the forward edge of the machine: exactly one
	// successor per status, and `done` has none — that is why "advance a done
	// record" is a 409 rather than a no-op.
	hrOffboardingAdvances = map[string]string{"apply": "handover", "handover": "done"}

	// hrOffboardingCancellable: an exit can be called off while it is still in
	// flight. A finished one cannot be un-finished — the leave date it wrote is
	// already on the employee file, and "actually they did not leave" is a data
	// repair, not a status a page can set.
	hrOffboardingCancellable = map[string]bool{"apply": true, "handover": true}

	// hrOffboardingChecklistOpen bounds the item routes. Once the record is done
	// or cancelled the checklist is a record of what was handed over, so it stops
	// accepting entries.
	hrOffboardingChecklistOpen = map[string]bool{"apply": true, "handover": true}
)

// ---- request bodies --------------------------------------------------------

// HrOffboardingRequest is both the create body and the PATCH body.
//
// `status` is not editable: a PATCH may echo the stored status back (clients
// resend the row they read) but anything else is a 400 pointing at
// `advance`/`cancel`, because the two routes that move the machine are also the
// two that carry side effects. `employee_id` is not movable either — re-pointing
// whose exit this is would rewrite a record someone already acted on.
//
// `handover` is replaced whole when sent; nil means "not sent", so a PATCH that
// carries no `handover` never wipes the checklist. The per-item routes exist for
// the common edit (tick one entry), and they rewrite the same array.
type HrOffboardingRequest struct {
	EmployeeID    *string          `json:"employee_id"`
	LastDay       *string          `json:"last_day"`
	Reason        *string          `json:"reason"`
	Kind          *string          `json:"kind"`
	Handover      []HrHandoverItem `json:"handover"`
	CertDone      *bool            `json:"cert_done"`
	Note          *string          `json:"note"`
	OwnerMemberID *string          `json:"owner_member_id"`
	Status        *string          `json:"status"`
}

// HrHandoverItem is one checklist entry: what has to change hands, whether it
// has, and what is left to say about it.
//
// `key` is the entry's stable name. It is optional on the wire — the server
// assigns `ho-<n>` when it is missing — and unique within the list, so a client
// can address an entry by name after a reorder. The item routes address by index
// (the list is rendered in order), which is why `key` is a label and not an id.
type HrHandoverItem struct {
	Key   string `json:"key"`
	Label string `json:"label"`
	Done  bool   `json:"done"`
	Note  string `json:"note"`
}

// HrHandoverItemPatchRequest is the tick: whether the entry is done, and the note
// taken while doing it. `label` is deliberately not editable — renaming an entry
// changes what the record says was handed over, while deleting it and adding the
// right one keeps the history honest.
type HrHandoverItemPatchRequest struct {
	Done *bool   `json:"done"`
	Note *string `json:"note"`
}

// ---- responses -------------------------------------------------------------

type HrOffboardingResponse struct {
	ID            string           `json:"id"`
	WorkspaceID   string           `json:"workspace_id"`
	EmployeeID    string           `json:"employee_id"`
	Status        string           `json:"status"`
	LastDay       string           `json:"last_day"`
	Reason        *string          `json:"reason"`
	Kind          string           `json:"kind"`
	Handover      []HrHandoverItem `json:"handover"`
	CertDone      bool             `json:"cert_done"`
	Note          *string          `json:"note"`
	OwnerMemberID *string          `json:"owner_member_id"`
	CreatedBy     *string          `json:"created_by"`
	CreatedAt     string           `json:"created_at"`
	UpdatedAt     string           `json:"updated_at"`
}

func hrOffboardingToResponse(o db.HrOffboarding) HrOffboardingResponse {
	return HrOffboardingResponse{
		ID:            uuidToString(o.ID),
		WorkspaceID:   uuidToString(o.WorkspaceID),
		EmployeeID:    uuidToString(o.EmployeeID),
		Status:        o.Status,
		LastDay:       dateToString(o.LastDay),
		Reason:        textToPtr(o.Reason),
		Kind:          o.Kind,
		Handover:      hrHandoverItemsFromColumn(o.Handover),
		CertDone:      o.CertDone,
		Note:          textToPtr(o.Note),
		OwnerMemberID: uuidToPtr(o.OwnerMemberID),
		CreatedBy:     uuidToPtr(o.CreatedBy),
		CreatedAt:     timestampToString(o.CreatedAt),
		UpdatedAt:     timestampToString(o.UpdatedAt),
	}
}

// HrOffboardingEmployeeResponse is the employee file as the `done` transition
// leaves it: the profile every other HR route already answers, plus the column
// this table owns (`leave_date`, 766). The embedded response keeps the two from
// drifting — a field added to the employee payload shows up here too — while
// `leave_date` stays a fact about offboarding rather than something
// `GET /employees` (which this batch does not touch) has to learn.
type HrOffboardingEmployeeResponse struct {
	HrEmployeeProfileResponse
	LeaveDate *string `json:"leave_date"`
}

func hrOffboardingEmployeeToResponse(p db.HrEmployeeProfile) HrOffboardingEmployeeResponse {
	return HrOffboardingEmployeeResponse{
		HrEmployeeProfileResponse: hrEmployeeProfileToResponse(p),
		LeaveDate:                 dateToPtr(p.LeaveDate),
	}
}

// HrOffboardingAdvanceResponse is what `POST …/advance` answers. `employee` is
// null until the record reaches `done`: the earlier steps do not touch the
// employee file, and a client that always received a profile would have to guess
// whether the leave date in it is stale.
type HrOffboardingAdvanceResponse struct {
	Offboarding HrOffboardingResponse          `json:"offboarding"`
	Employee    *HrOffboardingEmployeeResponse `json:"employee"`
}

// ---- checklist helpers -----------------------------------------------------

// hrHandoverItemsFromColumn reads the JSONB checklist. A drifted value — an
// object, a scalar, malformed JSON — degrades to an empty list rather than
// failing the read: a record whose checklist cannot be parsed is still an exit
// somebody owns, and an empty list is recoverable while a 500 is not.
func hrHandoverItemsFromColumn(raw []byte) []HrHandoverItem {
	items := []HrHandoverItem{}
	trimmed := strings.TrimSpace(string(raw))
	if trimmed == "" || trimmed == "null" {
		return items
	}
	if err := json.Unmarshal([]byte(trimmed), &items); err != nil || items == nil {
		return []HrHandoverItem{}
	}
	return items
}

// hrHandoverItemsColumn serializes a validated checklist for the column.
func hrHandoverItemsColumn(items []HrHandoverItem) []byte {
	if items == nil {
		return hrEmptyJSONArray
	}
	raw, err := json.Marshal(items)
	if err != nil {
		return hrEmptyJSONArray
	}
	return raw
}

// hrNormalizeHandoverItems trims the stored strings and enforces the checklist's
// contract: at most 40 entries, every entry labelled, keys unique.
//
// A missing `key` is filled in with the first `ho-<n>` that neither an earlier
// entry nor a later one already uses, so a client that only ever sends labels
// still gets addressable entries and the assignment cannot collide with a key the
// same request declared explicitly.
//
// The validation is here rather than in a CHECK constraint because the rules are
// about the *elements* of a JSONB array, which a column constraint cannot say; one
// function keeps the write paths (create, patch, append) in step.
func hrNormalizeHandoverItems(w http.ResponseWriter, items []HrHandoverItem) ([]HrHandoverItem, bool) {
	if len(items) > hrOffboardingMaxHandover {
		writeError(w, http.StatusBadRequest,
			fmt.Sprintf("a handover checklist holds at most %d items", hrOffboardingMaxHandover))
		return nil, false
	}
	cleaned := make([]HrHandoverItem, len(items))
	seen := make(map[string]bool, len(items))
	for i, item := range items {
		item.Key = strings.TrimSpace(item.Key)
		item.Label = strings.TrimSpace(item.Label)
		item.Note = strings.TrimSpace(item.Note)
		if item.Label == "" {
			writeError(w, http.StatusBadRequest, fmt.Sprintf("handover[%d].label is required", i))
			return nil, false
		}
		if item.Key == "" {
			cleaned[i] = item
			continue
		}
		if seen[item.Key] {
			writeError(w, http.StatusBadRequest,
				fmt.Sprintf("handover[%d].key duplicates an earlier entry", i))
			return nil, false
		}
		seen[item.Key] = true
		cleaned[i] = item
	}
	// Second pass: hand the entries that arrived without a key the smallest free
	// one. Splitting the passes is what lets look-ahead stay cheap — every
	// declared key is already in `seen`, so a generated key can never steal one.
	for i := range cleaned {
		if cleaned[i].Key != "" {
			continue
		}
		cleaned[i].Key = hrNextHandoverKey(seen)
		seen[cleaned[i].Key] = true
	}
	return cleaned, true
}

// hrNextHandoverKey returns the first `ho-<n>` not in `used`, starting at 1.
func hrNextHandoverKey(used map[string]bool) string {
	for n := 1; ; n++ {
		candidate := fmt.Sprintf("ho-%d", n)
		if !used[candidate] {
			return candidate
		}
	}
}

// ---- loaders and validators ------------------------------------------------

// loadHrOffboardingForWrite resolves {offboardingId} and checks the write gate,
// which for an exit record is its own owner.
func (h *Handler) loadHrOffboardingForWrite(w http.ResponseWriter, r *http.Request, scope workbenchScope) (db.HrOffboarding, bool) {
	offboarding, ok := h.loadHrOffboarding(w, r, scope)
	if !ok {
		return db.HrOffboarding{}, false
	}
	if !workbenchCanWrite(scope.Member, offboarding.OwnerMemberID) {
		writeError(w, http.StatusForbidden, "you can only change offboardings you own")
		return db.HrOffboarding{}, false
	}
	return offboarding, true
}

// loadHrOffboardingForTransition resolves {offboardingId} and applies the stricter
// gate `advance` and `cancel` need: owner/admin only, because closing an exit
// changes what the roster believes about somebody's employment.
func (h *Handler) loadHrOffboardingForTransition(w http.ResponseWriter, r *http.Request, scope workbenchScope) (db.HrOffboarding, bool) {
	offboarding, ok := h.loadHrOffboarding(w, r, scope)
	if !ok {
		return db.HrOffboarding{}, false
	}
	if !roleAllowed(scope.Member.Role, "owner", "admin") {
		writeError(w, http.StatusForbidden,
			"only an owner or admin can advance or cancel an offboarding")
		return db.HrOffboarding{}, false
	}
	return offboarding, true
}

// loadHrOffboarding is the shared "resolve {offboardingId} inside this workspace"
// half of both gates.
func (h *Handler) loadHrOffboarding(w http.ResponseWriter, r *http.Request, scope workbenchScope) (db.HrOffboarding, bool) {
	offboardingID, ok := parseUUIDOrBadRequest(w, chi.URLParam(r, "offboardingId"), "offboarding id")
	if !ok {
		return db.HrOffboarding{}, false
	}
	offboarding, err := h.Queries.GetHrOffboarding(r.Context(), db.GetHrOffboardingParams{
		ID:          offboardingID,
		WorkspaceID: scope.WorkspaceUUID,
	})
	if err != nil {
		writeError(w, http.StatusNotFound, "offboarding not found")
		return db.HrOffboarding{}, false
	}
	return offboarding, true
}

// requireHrEmployee resolves `employee_id` to a live employee profile in this
// workspace. An exit record without a person is a record nobody can act on, so a
// missing or foreign id is a 400 rather than a row that renders as a blank row.
func (h *Handler) requireHrEmployee(w http.ResponseWriter, r *http.Request, scope workbenchScope, raw *string) (db.HrEmployeeProfile, bool) {
	if raw == nil || strings.TrimSpace(*raw) == "" {
		writeError(w, http.StatusBadRequest, "employee_id is required")
		return db.HrEmployeeProfile{}, false
	}
	employeeID, ok := parseUUIDOrBadRequest(w, strings.TrimSpace(*raw), "employee_id")
	if !ok {
		return db.HrEmployeeProfile{}, false
	}
	employee, err := h.Queries.GetHrEmployeeProfile(r.Context(), db.GetHrEmployeeProfileParams{
		ID:          employeeID,
		WorkspaceID: scope.WorkspaceUUID,
	})
	if err != nil {
		writeError(w, http.StatusBadRequest, "employee_id is not an employee profile in this workspace")
		return db.HrEmployeeProfile{}, false
	}
	return employee, true
}

// hrOffboardingKind validates the optional departure kind against its enum,
// defaulting to `voluntary`: the page's common case, and a column that groups a
// report cannot be NULL.
func hrOffboardingKind(w http.ResponseWriter, raw *string) (string, bool) {
	kind := strings.TrimSpace(valueOrEmpty(raw))
	if kind == "" {
		return "voluntary", true
	}
	if !hrOffboardingKinds[kind] {
		writeError(w, http.StatusBadRequest,
			"kind must be voluntary, involuntary, contract_end or other")
		return "", false
	}
	return kind, true
}

// hrOffboardingStatusPatch accepts a `status` the PATCH body echoed back and
// rejects any other: the machine moves through advance/cancel, which carry the
// side effects (the leave-date write-back) a bare column update would skip.
func hrOffboardingStatusPatch(w http.ResponseWriter, raw *string, current string) bool {
	if raw == nil || strings.TrimSpace(*raw) == "" {
		return true
	}
	if status := strings.TrimSpace(*raw); status != current {
		writeError(w, http.StatusBadRequest,
			"status moves through advance or cancel, not through a PATCH")
		return false
	}
	return true
}

// hrOffboardingConflicts answers "one live record per employee" before the insert.
// The unique index behind it (768) is the race-safe backstop; this read exists so
// the common case answers 409 with a message instead of an unhandled violation.
// The predicate matches the index: archived and `cancelled` rows do not count.
func (h *Handler) hrOffboardingConflicts(ctx context.Context, w http.ResponseWriter, r *http.Request, scope workbenchScope, employeeID, excludeID pgtype.UUID) bool {
	conflicts, err := h.Queries.CountHrOffboardingConflicts(ctx, db.CountHrOffboardingConflictsParams{
		WorkspaceID: scope.WorkspaceUUID,
		EmployeeID:  employeeID,
		ExcludeID:   excludeID,
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to check the offboarding", err)
		return false
	}
	if conflicts > 0 {
		writeError(w, http.StatusConflict, "this employee already has an open offboarding")
		return false
	}
	return true
}

// ---- CRUD ------------------------------------------------------------------

// ListHrOffboardings — GET /api/workbench/hr/offboardings
func (h *Handler) ListHrOffboardings(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	status := strings.TrimSpace(r.URL.Query().Get("status"))
	if status != "" && !hrOffboardingStatuses[status] {
		writeError(w, http.StatusBadRequest, "status must be apply, handover, done or cancelled")
		return
	}
	employeeID, ok := workbenchOptionalUUID(w, stringPtr(strings.TrimSpace(r.URL.Query().Get("employee_id"))), "employee_id")
	if !ok {
		return
	}
	cursorAt, cursorID, ok := h.workbenchCursorKey(w, r, func(id pgtype.UUID) (pgtype.Timestamptz, error) {
		row, err := h.Queries.GetHrOffboarding(r.Context(), db.GetHrOffboardingParams{
			ID:          id,
			WorkspaceID: scope.WorkspaceUUID,
		})
		return row.CreatedAt, err
	})
	if !ok {
		return
	}
	rows, err := h.Queries.ListHrOffboardings(r.Context(), db.ListHrOffboardingsParams{
		WorkspaceID: scope.WorkspaceUUID,
		Status:      optionalTrimmedText(stringPtr(status)),
		EmployeeID:  employeeID,
		CursorAt:    cursorAt,
		CursorID:    cursorID,
		Limit:       workbenchLimit(r),
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to list offboardings", err)
		return
	}
	resp := make([]HrOffboardingResponse, len(rows))
	for i, row := range rows {
		resp[i] = hrOffboardingToResponse(row)
	}
	writeJSON(w, http.StatusOK, map[string]any{"offboardings": resp, "total": len(resp)})
}

// CreateHrOffboarding — POST /api/workbench/hr/offboardings
//
// The record starts in `apply` and nowhere else: the state machine has exactly
// two entrances (this insert and `cancel`), so a client cannot skip the handover
// by posting `status: "done"` — that is a 400, not a shortcut.
func (h *Handler) CreateHrOffboarding(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	var req HrOffboardingRequest
	if !decodeWorkbenchBody(w, r, &req) {
		return
	}
	if req.Status != nil && strings.TrimSpace(*req.Status) != "" && strings.TrimSpace(*req.Status) != "apply" {
		writeError(w, http.StatusBadRequest, "a new offboarding starts in apply")
		return
	}
	employee, ok := h.requireHrEmployee(w, r, scope, req.EmployeeID)
	if !ok {
		return
	}
	if req.LastDay == nil || strings.TrimSpace(*req.LastDay) == "" {
		writeError(w, http.StatusBadRequest, "last_day is required")
		return
	}
	lastDay, ok := workbenchDateValue(w, req.LastDay, "last_day")
	if !ok {
		return
	}
	kind, ok := hrOffboardingKind(w, req.Kind)
	if !ok {
		return
	}
	items, ok := hrNormalizeHandoverItems(w, req.Handover)
	if !ok {
		return
	}
	owner, ok := h.workbenchOwnerForCreate(w, r, scope, req.OwnerMemberID)
	if !ok {
		return
	}
	if !h.hrOffboardingConflicts(r.Context(), w, r, scope, employee.ID, hrZeroUUID) {
		return
	}

	created, err := h.Queries.CreateHrOffboarding(r.Context(), db.CreateHrOffboardingParams{
		WorkspaceID:   scope.WorkspaceUUID,
		EmployeeID:    employee.ID,
		Status:        "apply",
		LastDay:       lastDay,
		Reason:        optionalTrimmedText(req.Reason),
		Kind:          kind,
		Handover:      string(hrHandoverItemsColumn(items)),
		CertDone:      boolValue(req.CertDone),
		Note:          optionalTrimmedText(req.Note),
		OwnerMemberID: owner,
		CreatedBy:     scope.Member.UserID,
	})
	if err != nil {
		if isUniqueViolation(err) {
			writeError(w, http.StatusConflict, "this employee already has an open offboarding")
			return
		}
		workbenchInternalError(w, r, "failed to create offboarding", err)
		return
	}
	h.publishHrChanged(eventHrOffboardingChanged, scope.WorkspaceID, uuidToString(created.ID), uuidToString(scope.Member.UserID))
	writeJSON(w, http.StatusCreated, hrOffboardingToResponse(created))
}

// GetHrOffboarding — GET /api/workbench/hr/offboardings/{offboardingId}
func (h *Handler) GetHrOffboarding(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	offboarding, ok := h.loadHrOffboarding(w, r, scope)
	if !ok {
		return
	}
	writeJSON(w, http.StatusOK, hrOffboardingToResponse(offboarding))
}

// UpdateHrOffboarding — PATCH /api/workbench/hr/offboardings/{offboardingId}
//
// Edits the plan: the last day, why and how the employment ends, the checklist,
// whether the certificate went out, the note, and who owns the record. `status`
// and `employee_id` are not editable (see HrOffboardingRequest).
//
// One side effect, and only one: **editing `last_day` on a `done` record rewrites
// `hr_employee_profile.leave_date`** in the same transaction. That is the manual
// repair path — the profile column is not another editable copy of the date, it is
// this record's answer — and it keeps the roster from disagreeing with the exit
// file after a typo is fixed.
func (h *Handler) UpdateHrOffboarding(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	current, ok := h.loadHrOffboardingForWrite(w, r, scope)
	if !ok {
		return
	}
	var req HrOffboardingRequest
	if !decodeWorkbenchBody(w, r, &req) {
		return
	}
	if !hrOffboardingStatusPatch(w, req.Status, current.Status) {
		return
	}
	if req.EmployeeID != nil && strings.TrimSpace(*req.EmployeeID) != "" {
		employee, ok := h.requireHrEmployee(w, r, scope, req.EmployeeID)
		if !ok {
			return
		}
		if uuidToString(employee.ID) != uuidToString(current.EmployeeID) {
			writeError(w, http.StatusBadRequest, "employee_id cannot be changed")
			return
		}
	}
	lastDay, ok := applyDatePatch(req.LastDay, w, "last_day", current.LastDay)
	if !ok {
		return
	}
	kind := current.Kind
	if req.Kind != nil && strings.TrimSpace(*req.Kind) != "" {
		parsed, ok := hrOffboardingKind(w, req.Kind)
		if !ok {
			return
		}
		kind = parsed
	}
	items := hrHandoverItemsFromColumn(current.Handover)
	if req.Handover != nil {
		parsed, ok := hrNormalizeHandoverItems(w, req.Handover)
		if !ok {
			return
		}
		items = parsed
	}
	requestedOwner, ok := workbenchOptionalUUID(w, req.OwnerMemberID, "owner_member_id")
	if !ok {
		return
	}
	owner, ok := h.workbenchOwnerForUpdate(w, r, scope, current.OwnerMemberID, requestedOwner)
	if !ok {
		return
	}

	params := db.UpdateHrOffboardingParams{
		ID:            current.ID,
		WorkspaceID:   scope.WorkspaceUUID,
		LastDay:       lastDay,
		Reason:        applyTextPatch(req.Reason, current.Reason),
		Kind:          kind,
		Handover:      string(hrHandoverItemsColumn(items)),
		CertDone:      applyBoolPatch(req.CertDone, current.CertDone),
		Note:          applyTextPatch(req.Note, current.Note),
		OwnerMemberID: owner,
	}

	// A finished record: a proposed date has a second row to keep honest. Any
	// other edit of a done record (a note, the certificate flag) does not touch
	// the employee file, so it does not need the transaction — and must not bump
	// the profile's `updated_at` or wake the roster for nothing.
	if current.Status != "done" || req.LastDay == nil {
		updated, err := h.Queries.UpdateHrOffboarding(r.Context(), params)
		if err != nil {
			workbenchInternalError(w, r, "failed to update offboarding", err)
			return
		}
		h.publishHrChanged(eventHrOffboardingChanged, scope.WorkspaceID, uuidToString(updated.ID), uuidToString(scope.Member.UserID))
		writeJSON(w, http.StatusOK, hrOffboardingToResponse(updated))
		return
	}

	tx, err := h.TxStarter.Begin(r.Context())
	if err != nil {
		workbenchInternalError(w, r, "failed to update offboarding", err)
		return
	}
	defer tx.Rollback(r.Context())
	qtx := h.Queries.WithTx(tx)
	updated, err := qtx.UpdateHrOffboarding(r.Context(), params)
	if err != nil {
		workbenchInternalError(w, r, "failed to update offboarding", err)
		return
	}
	employee, err := h.hrOffboardingWritesLeaveDate(r.Context(), qtx, scope, updated)
	if err != nil {
		workbenchInternalError(w, r, "failed to update the employee leave date", err)
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		workbenchInternalError(w, r, "failed to update offboarding", err)
		return
	}
	h.publishHrChanged(eventHrOffboardingChanged, scope.WorkspaceID, uuidToString(updated.ID), uuidToString(scope.Member.UserID))
	h.publishHrChanged(eventHrEmployeeProfileChanged, scope.WorkspaceID, uuidToString(employee.ID), uuidToString(scope.Member.UserID))
	writeJSON(w, http.StatusOK, hrOffboardingToResponse(updated))
}

// DeleteHrOffboarding — DELETE /api/workbench/hr/offboardings/{offboardingId}
//
// Soft delete, and it does not un-do a `done` record's write-back: the employee's
// `leave_date` keeps the day they left, because deleting the paperwork does not
// put the person back on the roster.
func (h *Handler) DeleteHrOffboarding(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	current, ok := h.loadHrOffboardingForWrite(w, r, scope)
	if !ok {
		return
	}
	deleted, err := h.Queries.ArchiveHrOffboarding(r.Context(), db.ArchiveHrOffboardingParams{
		ID:          current.ID,
		WorkspaceID: scope.WorkspaceUUID,
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to delete offboarding", err)
		return
	}
	if deleted == 0 {
		writeError(w, http.StatusNotFound, "offboarding not found")
		return
	}
	h.publishHrChanged(eventHrOffboardingChanged, scope.WorkspaceID, uuidToString(current.ID), uuidToString(scope.Member.UserID))
	w.WriteHeader(http.StatusNoContent)
}

// ---- state machine ---------------------------------------------------------

// AdvanceHrOffboarding — POST /api/workbench/hr/offboardings/{offboardingId}/advance
//
// `apply → handover → done`, body ignored (the route carries no payload: what
// moves is the record's segment). Reaching `done` writes the employee's
// `leave_date` in the same transaction and answers `{offboarding, employee}`;
// the earlier step answers `{offboarding, employee: null}` because the employee
// file did not move.
//
// Illegal moves — advancing a `done` or `cancelled` record, or a stale client
// whose transition finds the row already moved — are 409, not a silent no-op.
func (h *Handler) AdvanceHrOffboarding(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	current, ok := h.loadHrOffboardingForTransition(w, r, scope)
	if !ok {
		return
	}
	next, ok := hrOffboardingAdvances[current.Status]
	if !ok {
		writeError(w, http.StatusConflict,
			fmt.Sprintf("an offboarding in %s cannot advance", current.Status))
		return
	}

	if next != "done" {
		updated, ok := h.hrOffboardingTransition(w, r, scope, current, next)
		if !ok {
			return
		}
		h.publishHrChanged(eventHrOffboardingChanged, scope.WorkspaceID, uuidToString(updated.ID), uuidToString(scope.Member.UserID))
		writeJSON(w, http.StatusOK, HrOffboardingAdvanceResponse{
			Offboarding: hrOffboardingToResponse(updated),
		})
		return
	}

	tx, err := h.TxStarter.Begin(r.Context())
	if err != nil {
		workbenchInternalError(w, r, "failed to advance offboarding", err)
		return
	}
	defer tx.Rollback(r.Context())
	qtx := h.Queries.WithTx(tx)
	updated, err := qtx.TransitionHrOffboarding(r.Context(), db.TransitionHrOffboardingParams{
		Status:      next,
		ID:          current.ID,
		WorkspaceID: scope.WorkspaceUUID,
		FromStatus:  current.Status,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusConflict, "this offboarding already moved")
			return
		}
		workbenchInternalError(w, r, "failed to advance offboarding", err)
		return
	}
	employee, err := h.hrOffboardingWritesLeaveDate(r.Context(), qtx, scope, updated)
	if err != nil {
		workbenchInternalError(w, r, "failed to record the leave date", err)
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		workbenchInternalError(w, r, "failed to advance offboarding", err)
		return
	}
	actorID := uuidToString(scope.Member.UserID)
	h.publishHrChanged(eventHrOffboardingChanged, scope.WorkspaceID, uuidToString(updated.ID), actorID)
	h.publishHrChanged(eventHrEmployeeProfileChanged, scope.WorkspaceID, uuidToString(employee.ID), actorID)
	employeeResponse := hrOffboardingEmployeeToResponse(employee)
	writeJSON(w, http.StatusOK, HrOffboardingAdvanceResponse{
		Offboarding: hrOffboardingToResponse(updated),
		Employee:    &employeeResponse,
	})
}

// CancelHrOffboarding — POST /api/workbench/hr/offboardings/{offboardingId}/cancel
//
// The way out, while the exit is still in flight. `cancelled` is a terminal
// segment, and it also frees the employee's slot in the partial unique index
// (768), so re-initiating the same person's exit is an ordinary create — the
// cancelled record stays as the history of the attempt that was called off.
func (h *Handler) CancelHrOffboarding(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	current, ok := h.loadHrOffboardingForTransition(w, r, scope)
	if !ok {
		return
	}
	if !hrOffboardingCancellable[current.Status] {
		writeError(w, http.StatusConflict,
			fmt.Sprintf("an offboarding in %s cannot be cancelled", current.Status))
		return
	}
	updated, ok := h.hrOffboardingTransition(w, r, scope, current, "cancelled")
	if !ok {
		return
	}
	h.publishHrChanged(eventHrOffboardingChanged, scope.WorkspaceID, uuidToString(updated.ID), uuidToString(scope.Member.UserID))
	writeJSON(w, http.StatusOK, hrOffboardingToResponse(updated))
}

// hrOffboardingTransition runs the guarded status move and turns "the row is no
// longer where the handler read it" into 409 — the second writer of a race, and
// the stale client, both land here.
func (h *Handler) hrOffboardingTransition(w http.ResponseWriter, r *http.Request, scope workbenchScope, current db.HrOffboarding, next string) (db.HrOffboarding, bool) {
	updated, err := h.Queries.TransitionHrOffboarding(r.Context(), db.TransitionHrOffboardingParams{
		Status:      next,
		ID:          current.ID,
		WorkspaceID: scope.WorkspaceUUID,
		FromStatus:  current.Status,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusConflict, "this offboarding already moved")
			return db.HrOffboarding{}, false
		}
		workbenchInternalError(w, r, "failed to move the offboarding", err)
		return db.HrOffboarding{}, false
	}
	return updated, true
}

// hrOffboardingWritesLeaveDate copies `last_day` onto the employee file. The
// caller owns the transaction: "the record is done" and "the person has left"
// must land together or not at all.
func (h *Handler) hrOffboardingWritesLeaveDate(ctx context.Context, q *db.Queries, scope workbenchScope, offboarding db.HrOffboarding) (db.HrEmployeeProfile, error) {
	return q.SetHrEmployeeLeaveDate(ctx, db.SetHrEmployeeLeaveDateParams{
		LeaveDate:   offboarding.LastDay,
		ID:          offboarding.EmployeeID,
		WorkspaceID: scope.WorkspaceUUID,
	})
}

// ---- checklist routes ------------------------------------------------------

// AppendHrOffboardingHandoverItem — POST /api/workbench/hr/offboardings/{offboardingId}/handover
//
// Answers the whole record rather than the new entry: the client renders the
// checklist from one payload, and the assigned `key` of the new entry is part of
// that payload.
func (h *Handler) AppendHrOffboardingHandoverItem(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	current, ok := h.loadHrOffboardingForWrite(w, r, scope)
	if !ok {
		return
	}
	if !hrOffboardingChecklistOpen[current.Status] {
		writeError(w, http.StatusConflict,
			fmt.Sprintf("an offboarding in %s keeps its handover checklist", current.Status))
		return
	}
	var item HrHandoverItem
	if !decodeWorkbenchBody(w, r, &item) {
		return
	}
	items := hrHandoverItemsFromColumn(current.Handover)
	if len(items) >= hrOffboardingMaxHandover {
		writeError(w, http.StatusBadRequest,
			fmt.Sprintf("a handover checklist holds at most %d items", hrOffboardingMaxHandover))
		return
	}
	normalized, ok := hrNormalizeHandoverItems(w, append(items, item))
	if !ok {
		return
	}
	h.saveHrOffboardingChecklist(w, r, scope, current, normalized, http.StatusCreated)
}

// UpdateHrOffboardingHandoverItem — PATCH /api/workbench/hr/offboardings/{offboardingId}/handover/{index}
//
// The tick the page's checklist is for: `done`, and the note taken while doing it.
func (h *Handler) UpdateHrOffboardingHandoverItem(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	current, ok := h.loadHrOffboardingForWrite(w, r, scope)
	if !ok {
		return
	}
	if !hrOffboardingChecklistOpen[current.Status] {
		writeError(w, http.StatusConflict,
			fmt.Sprintf("an offboarding in %s keeps its handover checklist", current.Status))
		return
	}
	items := hrHandoverItemsFromColumn(current.Handover)
	index, ok := hrHandoverItemIndex(w, chi.URLParam(r, "index"), len(items))
	if !ok {
		return
	}
	var req HrHandoverItemPatchRequest
	if !decodeWorkbenchBody(w, r, &req) {
		return
	}
	item := items[index]
	if req.Done != nil {
		item.Done = *req.Done
	}
	if req.Note != nil {
		item.Note = strings.TrimSpace(*req.Note)
	}
	items[index] = item
	h.saveHrOffboardingChecklist(w, r, scope, current, items, http.StatusOK)
}

// DeleteHrOffboardingHandoverItem — DELETE /api/workbench/hr/offboardings/{offboardingId}/handover/{index}
//
// Answers the whole record rather than 204: deleting entry 3 renumbers the rest,
// and a client that only learned "it worked" would have to guess the new order.
func (h *Handler) DeleteHrOffboardingHandoverItem(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	current, ok := h.loadHrOffboardingForWrite(w, r, scope)
	if !ok {
		return
	}
	if !hrOffboardingChecklistOpen[current.Status] {
		writeError(w, http.StatusConflict,
			fmt.Sprintf("an offboarding in %s keeps its handover checklist", current.Status))
		return
	}
	items := hrHandoverItemsFromColumn(current.Handover)
	index, ok := hrHandoverItemIndex(w, chi.URLParam(r, "index"), len(items))
	if !ok {
		return
	}
	items = append(items[:index], items[index+1:]...)
	h.saveHrOffboardingChecklist(w, r, scope, current, items, http.StatusOK)
}

// hrHandoverItemIndex reads `{index}` from the path and bounds it against the
// current checklist. An out-of-range index is a 404: the entry the client is
// ticking is not there any more, which is the same answer as a missing row.
func hrHandoverItemIndex(w http.ResponseWriter, raw string, count int) (int, bool) {
	index, err := strconv.Atoi(strings.TrimSpace(raw))
	if err != nil || index < 0 || index >= count {
		writeError(w, http.StatusNotFound, "handover item not found")
		return 0, false
	}
	return index, true
}

// saveHrOffboardingChecklist is the one statement that rewrites the checklist, so
// the three item routes cannot drift on the fields they do not touch.
func (h *Handler) saveHrOffboardingChecklist(w http.ResponseWriter, r *http.Request, scope workbenchScope, current db.HrOffboarding, items []HrHandoverItem, want int) {
	updated, err := h.Queries.UpdateHrOffboarding(r.Context(), db.UpdateHrOffboardingParams{
		ID:            current.ID,
		WorkspaceID:   scope.WorkspaceUUID,
		LastDay:       current.LastDay,
		Reason:        current.Reason,
		Kind:          current.Kind,
		Handover:      string(hrHandoverItemsColumn(items)),
		CertDone:      current.CertDone,
		Note:          current.Note,
		OwnerMemberID: current.OwnerMemberID,
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to update the handover checklist", err)
		return
	}
	h.publishHrChanged(eventHrOffboardingChanged, scope.WorkspaceID, uuidToString(updated.ID), uuidToString(scope.Member.UserID))
	writeJSON(w, want, hrOffboardingToResponse(updated))
}
