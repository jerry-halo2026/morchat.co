package handler

// Employee file change stream: 异动留痕 (docs/engineering/WORKBENCH-API.md §16).
//
// The roster's 异动 tab was an empty "table pending" state because nothing
// recorded a change: probation confirmation, renewal, transfer, grade change and
// salary adjustment were all plain PATCHes of `hr_employee_profile`, so after a
// write nobody could say what the record said before. This file is both halves
// of the fix:
//
//	**The stream is written by the profile PATCH, in the same transaction.**
//
// `UpdateHrEmployee` compares the row it read with the row it is about to write
// and, when a *fact* moved (`department_id` / `job_title` / `grade` /
// `contract_end` / `regular_date`), records one `hr_employee_change` row in the
// same transaction. A change that only touches `ability` / `disc` leaves no row,
// and neither does a PATCH that sends the stored values back — the comparison is
// against the stored row, not against the request body, so "the front end posted
// the whole form again" is not a change.
//
//	**The stream itself is append-only.**
//
// There is no route that rewrites a fact: `POST` records a manual entry (a salary
// adjustment, or a hire predating this batch), `PATCH` accepts `note` and nothing
// else, `DELETE` is a soft delete. A wrong fact is corrected by recording another
// one, because a stream that can be rewritten cannot answer "what changed".
//
// Ownership follows the profile: appending to somebody's history is part of
// editing their file, so a `member` may record changes for a profile it owns and
// for the rows it owns, while `owner`/`admin` write everything. Reads are
// member-wide, like the rest of the workbench.

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"

	db "github.com/jerry-halo2026/morchat.co/server/pkg/db/generated"
)

var (
	// hrEmployeeChangeKinds is the vocabulary of the stream. It is a closed
	// enum because "what kinds of change happen here" is a question the page
	// groups by; the free text a person needs to add lives in `note`.
	hrEmployeeChangeKinds = map[string]bool{
		"hire": true, "regularize": true, "renew": true, "move": true,
		"promote": true, "grade": true, "salary": true, "leave": true,
		"other": true,
	}

	// hrEmployeeChangeKindOrder is the precedence a multi-field edit resolves
	// to. One PATCH can move a title and a grade at once, and the row can only
	// carry one `kind`; the rest of the fields are listed in `note`. The order
	// is lifecycle-first: the milestone that changes what stage of employment
	// somebody is in wins over the attribute that rides along with it.
	hrEmployeeChangeKindOrder = []string{"regularize", "renew", "move", "grade", "promote"}
)

// ---- request bodies --------------------------------------------------------

// HrEmployeeChangeRequest is the manual-entry body
// (`POST /hr/changes`). Every pair is optional: an entry about a salary says
// nothing about a department, and a NULL pair means "this change was not about
// that field" rather than "unchanged".
//
// `employee_id`, `kind` and `effective_on` are required. There is no
// `owner_member_id`: the row belongs to the employee profile's owner, so appending
// to a file somebody else owns is a 403 rather than a reassignment.
type HrEmployeeChangeRequest struct {
	EmployeeID       *string  `json:"employee_id"`
	Kind             *string  `json:"kind"`
	EffectiveOn      *string  `json:"effective_on"`
	FromDepartmentID *string  `json:"from_department_id"`
	ToDepartmentID   *string  `json:"to_department_id"`
	FromJobTitle     *string  `json:"from_job_title"`
	ToJobTitle       *string  `json:"to_job_title"`
	FromGrade        *string  `json:"from_grade"`
	ToGrade          *string  `json:"to_grade"`
	FromContractEnd  *string  `json:"from_contract_end"`
	ToContractEnd    *string  `json:"to_contract_end"`
	FromAmount       *float64 `json:"from_amount"`
	ToAmount         *float64 `json:"to_amount"`
	Currency         *string  `json:"currency"`
	Note             *string  `json:"note"`
}

// ---- responses -------------------------------------------------------------

// HrEmployeeChangeResponse is one event. `effective_on` is a calendar day
// (`YYYY-MM-DD`), the same wire form as every other HR date; amounts are JSON
// numbers (§3.1) so the client never has to parse a decimal string.
type HrEmployeeChangeResponse struct {
	ID               string   `json:"id"`
	WorkspaceID      string   `json:"workspace_id"`
	EmployeeID       string   `json:"employee_id"`
	Kind             string   `json:"kind"`
	EffectiveOn      string   `json:"effective_on"`
	FromDepartmentID *string  `json:"from_department_id"`
	ToDepartmentID   *string  `json:"to_department_id"`
	FromJobTitle     *string  `json:"from_job_title"`
	ToJobTitle       *string  `json:"to_job_title"`
	FromGrade        *string  `json:"from_grade"`
	ToGrade          *string  `json:"to_grade"`
	FromContractEnd  *string  `json:"from_contract_end"`
	ToContractEnd    *string  `json:"to_contract_end"`
	FromAmount       *float64 `json:"from_amount"`
	ToAmount         *float64 `json:"to_amount"`
	Currency         string   `json:"currency"`
	Note             *string  `json:"note"`
	OwnerMemberID    *string  `json:"owner_member_id"`
	CreatedBy        *string  `json:"created_by"`
	CreatedAt        string   `json:"created_at"`
	ArchivedAt       *string  `json:"archived_at"`
}

func hrEmployeeChangeToResponse(c db.HrEmployeeChange) HrEmployeeChangeResponse {
	return HrEmployeeChangeResponse{
		ID:               uuidToString(c.ID),
		WorkspaceID:      uuidToString(c.WorkspaceID),
		EmployeeID:       uuidToString(c.EmployeeID),
		Kind:             c.Kind,
		EffectiveOn:      dateToString(c.EffectiveOn),
		FromDepartmentID: uuidToPtr(c.FromDepartmentID),
		ToDepartmentID:   uuidToPtr(c.ToDepartmentID),
		FromJobTitle:     textToPtr(c.FromJobTitle),
		ToJobTitle:       textToPtr(c.ToJobTitle),
		FromGrade:        textToPtr(c.FromGrade),
		ToGrade:          textToPtr(c.ToGrade),
		FromContractEnd:  dateToPtr(c.FromContractEnd),
		ToContractEnd:    dateToPtr(c.ToContractEnd),
		FromAmount:       numericToFloatPtr(c.FromAmount),
		ToAmount:         numericToFloatPtr(c.ToAmount),
		Currency:         hrChangeCurrency(c.Currency),
		Note:             textToPtr(c.Note),
		OwnerMemberID:    uuidToPtr(c.OwnerMemberID),
		CreatedBy:        uuidToPtr(c.CreatedBy),
		CreatedAt:        timestampToString(c.CreatedAt),
		ArchivedAt:       hrChangeArchivedAt(c.ArchivedAt),
	}
}

// hrChangeCurrency renders the CHAR(3) code without the padding the type pads it
// with; an entry that is not about money has no currency and renders as "".
func hrChangeCurrency(code pgtype.Text) string {
	if !code.Valid {
		return ""
	}
	return strings.TrimSpace(code.String)
}

func hrChangeArchivedAt(at pgtype.Timestamptz) *string {
	if !at.Valid {
		return nil
	}
	out := timestampToString(at)
	return &out
}

// ---- the automatic hook ----------------------------------------------------

// hrProfileFieldChange is one field the PATCH moved: its wire name, the `kind` it
// would be on its own, and the two rendered values (for the note).
type hrProfileFieldChange struct {
	field string
	kind  string
	from  string
	to    string
}

// hrProfileChangeLabel is how a value appears in the generated note. A missing
// value is not empty text: on the profile NULL means "not set" (`contract_end`
// NULL is open-ended), so it renders as that rather than as a blank.
func hrProfileChangeLabel(value string) string {
	if value == "" {
		return "(none)"
	}
	return value
}

// hrEmployeeChangeFromProfile is the hook's whole decision, kept out of the HTTP
// handler so it can be reasoned about (and tested) as one function: compare the
// row the PATCH read with the row it is about to write, and either return the
// change row to insert or `false` when nothing a change stream is about moved.
//
// The comparison is field-by-field on the *columns*, after the request has been
// merged into them. That is what makes "the front end posted the stored values
// again" a no-op and "the request only touched `ability`" a no-op — correctly
// trimmed text compares equal, and an untouched column is the same value it
// already was.
func hrEmployeeChangeFromProfile(current, updated db.HrEmployeeProfile, effectiveOn pgtype.Date, owner, actor pgtype.UUID) (db.CreateHrEmployeeChangeParams, bool) {
	params := db.CreateHrEmployeeChangeParams{
		WorkspaceID:   current.WorkspaceID,
		EmployeeID:    current.ID,
		EffectiveOn:   effectiveOn,
		OwnerMemberID: owner,
		CreatedBy:     actor,
	}
	changes := make([]hrProfileFieldChange, 0, 5)

	if !uuidEqual(current.DepartmentID, updated.DepartmentID) {
		params.FromDepartmentID = current.DepartmentID
		params.ToDepartmentID = updated.DepartmentID
		changes = append(changes, hrProfileFieldChange{
			field: "department_id",
			kind:  "move",
			from:  hrProfileChangeLabel(uuidToString(current.DepartmentID)),
			to:    hrProfileChangeLabel(uuidToString(updated.DepartmentID)),
		})
	}
	if !textEqual(current.JobTitle, updated.JobTitle) {
		params.FromJobTitle = current.JobTitle
		params.ToJobTitle = updated.JobTitle
		changes = append(changes, hrProfileFieldChange{
			field: "job_title",
			kind:  "promote",
			from:  hrProfileChangeLabel(textToString(current.JobTitle)),
			to:    hrProfileChangeLabel(textToString(updated.JobTitle)),
		})
	}
	if !textEqual(current.Grade, updated.Grade) {
		params.FromGrade = current.Grade
		params.ToGrade = updated.Grade
		changes = append(changes, hrProfileFieldChange{
			field: "grade",
			kind:  "grade",
			from:  hrProfileChangeLabel(textToString(current.Grade)),
			to:    hrProfileChangeLabel(textToString(updated.Grade)),
		})
	}
	if !dateEqual(current.RegularDate, updated.RegularDate) {
		// The stream has no `regular_date` column pair: the kind *is* the fact
		// ("probation ended"), and the two dates go in `note`, which is what the
		// multi-field line is for. A pair here would be a third copy of a column
		// the profile already owns.
		// NULL → a date is the probation ending, which is what `regularize`
		// means. Any other move of this column (a corrected date, or clearing
		// it) is a repair of the record, not a milestone.
		kind := "other"
		if !current.RegularDate.Valid && updated.RegularDate.Valid {
			kind = "regularize"
		}
		changes = append(changes, hrProfileFieldChange{
			field: "regular_date",
			kind:  kind,
			from:  hrProfileChangeLabel(dateToString(current.RegularDate)),
			to:    hrProfileChangeLabel(dateToString(updated.RegularDate)),
		})
	}
	if !dateEqual(current.ContractEnd, updated.ContractEnd) {
		params.FromContractEnd = current.ContractEnd
		params.ToContractEnd = updated.ContractEnd
		changes = append(changes, hrProfileFieldChange{
			field: "contract_end",
			kind:  "renew",
			from:  hrProfileChangeLabel(dateToString(current.ContractEnd)),
			to:    hrProfileChangeLabel(dateToString(updated.ContractEnd)),
		})
	}
	if len(changes) == 0 {
		return db.CreateHrEmployeeChangeParams{}, false
	}

	params.Kind = hrProfileChangeKind(changes)
	params.Note = pgtype.Text{String: hrProfileChangeNote(changes), Valid: true}
	return params, true
}

// hrProfileChangeKind resolves a multi-field edit to the one `kind` the row can
// carry: the highest-priority field that moved. A change whose only moved field
// has no milestone of its own falls back to `other`.
func hrProfileChangeKind(changes []hrProfileFieldChange) string {
	for _, kind := range hrEmployeeChangeKindOrder {
		for _, change := range changes {
			if change.kind == kind {
				return kind
			}
		}
	}
	return "other"
}

// hrProfileChangeNote is the machine-written "what actually moved" line, e.g.
//
//	grade: P5 -> P6; contract_end: 2026-12-31 -> 2027-12-31
//
// It exists because `kind` can only name one of the fields: a PATCH that walks a
// person through two changes at once would otherwise look like only one of them
// happened.
func hrProfileChangeNote(changes []hrProfileFieldChange) string {
	parts := make([]string, len(changes))
	for i, change := range changes {
		parts[i] = change.field + ": " + change.from + " -> " + change.to
	}
	return strings.Join(parts, "; ")
}

// ---- value comparisons -----------------------------------------------------
//
// The three columns have three different equality stories, so each gets its own
// helper: a NULL pair is equal, a present pair compares by value. Using == on the
// structs would work for the scalar ones by accident but is wrong for a DATE
// (`Time` carries a location) and unreadable at the call site.

func uuidEqual(a, b pgtype.UUID) bool {
	if a.Valid != b.Valid {
		return false
	}
	return !a.Valid || a.Bytes == b.Bytes
}

func textEqual(a, b pgtype.Text) bool {
	if a.Valid != b.Valid {
		return false
	}
	return !a.Valid || a.String == b.String
}

func dateEqual(a, b pgtype.Date) bool {
	if a.Valid != b.Valid {
		return false
	}
	return !a.Valid || a.Time.Equal(b.Time)
}

// textToString is the comparison-facing read of a nullable text column: absent
// and empty are the same value on the wire (`optionalTrimmedText` stores NULL for
// both), so the change detector treats them the same too.
func textToString(t pgtype.Text) string {
	if !t.Valid {
		return ""
	}
	return t.String
}

// ---- loaders ---------------------------------------------------------------

// loadHrEmployeeChange resolves {changeId} inside the workspace.
func (h *Handler) loadHrEmployeeChange(w http.ResponseWriter, r *http.Request, scope workbenchScope) (db.HrEmployeeChange, bool) {
	changeID, ok := parseUUIDOrBadRequest(w, chi.URLParam(r, "changeId"), "change id")
	if !ok {
		return db.HrEmployeeChange{}, false
	}
	change, err := h.Queries.GetHrEmployeeChange(r.Context(), db.GetHrEmployeeChangeParams{
		ID:          changeID,
		WorkspaceID: scope.WorkspaceUUID,
	})
	if err != nil {
		writeError(w, http.StatusNotFound, "change not found")
		return db.HrEmployeeChange{}, false
	}
	return change, true
}

// loadHrEmployeeChangeForWrite resolves {changeId} and applies the write gate:
// a `member` may only touch the rows it owns.
func (h *Handler) loadHrEmployeeChangeForWrite(w http.ResponseWriter, r *http.Request, scope workbenchScope) (db.HrEmployeeChange, bool) {
	change, ok := h.loadHrEmployeeChange(w, r, scope)
	if !ok {
		return db.HrEmployeeChange{}, false
	}
	if !workbenchCanWrite(scope.Member, change.OwnerMemberID) {
		writeError(w, http.StatusForbidden, "you can only change rows you own")
		return db.HrEmployeeChange{}, false
	}
	return change, true
}

// hrEmployeeChangeKind validates a required kind against the enum.
func hrEmployeeChangeKind(w http.ResponseWriter, raw *string) (string, bool) {
	kind := strings.TrimSpace(valueOrEmpty(raw))
	if kind == "" {
		writeError(w, http.StatusBadRequest, "kind is required")
		return "", false
	}
	if !hrEmployeeChangeKinds[kind] {
		writeError(w, http.StatusBadRequest,
			"kind must be hire, regularize, renew, move, promote, grade, salary, leave or other")
		return "", false
	}
	return kind, true
}

// ---- CRUD ------------------------------------------------------------------

// ListHrEmployeeChanges — GET /api/workbench/hr/changes
//
// The 异动 tab: `?employee_id=` narrows to one person, `?kind=` to one kind, and
// `?from=` / `?to=` are an inclusive `effective_on` window. Ordering is
// `effective_on DESC` (the contract's read order), so "what happened most
// recently" is the top of the list even when the row was recorded later.
func (h *Handler) ListHrEmployeeChanges(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	if !h.requireWorkbenchCapability(w, r, scope, capCRMRead) {
		return
	}
	query := r.URL.Query()
	kind := strings.TrimSpace(query.Get("kind"))
	if kind != "" && !hrEmployeeChangeKinds[kind] {
		writeError(w, http.StatusBadRequest,
			"kind must be hire, regularize, renew, move, promote, grade, salary, leave or other")
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
	rows, err := h.Queries.ListHrEmployeeChanges(r.Context(), db.ListHrEmployeeChangesParams{
		WorkspaceID: scope.WorkspaceUUID,
		EmployeeID:  employeeID,
		Kind:        optionalTrimmedText(stringPtr(kind)),
		FromOn:      fromOn,
		ToOn:        toOn,
		Limit:       workbenchLimit(r),
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to list changes", err)
		return
	}
	resp := make([]HrEmployeeChangeResponse, len(rows))
	for i, row := range rows {
		resp[i] = hrEmployeeChangeToResponse(row)
	}
	writeJSON(w, http.StatusOK, map[string]any{"changes": resp, "total": len(resp)})
}

// CreateHrEmployeeChange — POST /api/workbench/hr/changes
//
// The manual entry: what the automatic hook cannot see. A salary adjustment has
// no column on the profile, and a hire that predates this batch has no PATCH to
// hang off. The row belongs to the employee profile's owner, so recording
// somebody else's history without owning their file is a 403.
func (h *Handler) CreateHrEmployeeChange(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	var req HrEmployeeChangeRequest
	if !decodeWorkbenchBody(w, r, &req) {
		return
	}
	employee, ok := h.requireHrEmployee(w, r, scope, req.EmployeeID)
	if !ok {
		return
	}
	if !workbenchCanWrite(scope.Member, employee.OwnerMemberID) {
		writeError(w, http.StatusForbidden,
			"you can only record changes on employee profiles you own")
		return
	}
	kind, ok := hrEmployeeChangeKind(w, req.Kind)
	if !ok {
		return
	}
	if req.EffectiveOn == nil || strings.TrimSpace(*req.EffectiveOn) == "" {
		writeError(w, http.StatusBadRequest, "effective_on is required")
		return
	}
	effectiveOn, ok := workbenchDateValue(w, req.EffectiveOn, "effective_on")
	if !ok {
		return
	}
	fromDepartmentID, ok := workbenchOptionalUUID(w, req.FromDepartmentID, "from_department_id")
	if !ok {
		return
	}
	toDepartmentID, ok := workbenchOptionalUUID(w, req.ToDepartmentID, "to_department_id")
	if !ok {
		return
	}
	fromContractEnd, ok := workbenchDateValue(w, req.FromContractEnd, "from_contract_end")
	if !ok {
		return
	}
	toContractEnd, ok := workbenchDateValue(w, req.ToContractEnd, "to_contract_end")
	if !ok {
		return
	}

	created, err := h.Queries.CreateHrEmployeeChange(r.Context(), db.CreateHrEmployeeChangeParams{
		WorkspaceID:      scope.WorkspaceUUID,
		EmployeeID:       employee.ID,
		Kind:             kind,
		EffectiveOn:      effectiveOn,
		FromDepartmentID: fromDepartmentID,
		ToDepartmentID:   toDepartmentID,
		FromJobTitle:     optionalTrimmedText(req.FromJobTitle),
		ToJobTitle:       optionalTrimmedText(req.ToJobTitle),
		FromGrade:        optionalTrimmedText(req.FromGrade),
		ToGrade:          optionalTrimmedText(req.ToGrade),
		FromContractEnd:  fromContractEnd,
		ToContractEnd:    toContractEnd,
		FromAmount:       floatToNumeric(req.FromAmount),
		ToAmount:         floatToNumeric(req.ToAmount),
		Currency:         optionalTrimmedText(req.Currency),
		Note:             optionalTrimmedText(req.Note),
		OwnerMemberID:    employee.OwnerMemberID,
		CreatedBy:        scope.Member.UserID,
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to record the change", err)
		return
	}
	h.publishHrChanged(eventHrEmployeeProfileChanged, scope.WorkspaceID, uuidToString(employee.ID), uuidToString(scope.Member.UserID))
	writeJSON(w, http.StatusCreated, hrEmployeeChangeToResponse(created))
}

// UpdateHrEmployeeChange — PATCH /api/workbench/hr/changes/{changeId}
//
// `note` and nothing else. The body is decoded as a key set rather than a struct
// on purpose: a struct with only `note` would silently ignore `{"kind": "move"}`
// and answer 200, and a client that believed it corrected an event would never
// learn that it did not. Any other key is a 400 naming the rule.
func (h *Handler) UpdateHrEmployeeChange(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	current, ok := h.loadHrEmployeeChangeForWrite(w, r, scope)
	if !ok {
		return
	}
	var body map[string]json.RawMessage
	if !decodeWorkbenchBody(w, r, &body) {
		return
	}
	for field := range body {
		if field != "note" {
			writeError(w, http.StatusBadRequest,
				"only note can be edited: the change stream is append-only")
			return
		}
	}
	note := current.Note
	if raw, sent := body["note"]; sent {
		var value *string
		if err := json.Unmarshal(raw, &value); err != nil {
			writeError(w, http.StatusBadRequest, "note must be a string or null")
			return
		}
		note = optionalTrimmedText(value)
	}
	updated, err := h.Queries.UpdateHrEmployeeChangeNote(r.Context(), db.UpdateHrEmployeeChangeNoteParams{
		Note:        note,
		ID:          current.ID,
		WorkspaceID: scope.WorkspaceUUID,
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to update the change", err)
		return
	}
	h.publishHrChanged(eventHrEmployeeProfileChanged, scope.WorkspaceID, uuidToString(updated.EmployeeID), uuidToString(scope.Member.UserID))
	writeJSON(w, http.StatusOK, hrEmployeeChangeToResponse(updated))
}

// DeleteHrEmployeeChange — DELETE /api/workbench/hr/changes/{changeId}
//
// Soft delete, and the only deletion there is: a row recorded by mistake stops
// being part of the answer, while the record of somebody having recorded it stays
// in the table. Facts are corrected by another row, never by editing this one out
// of existence.
func (h *Handler) DeleteHrEmployeeChange(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	current, ok := h.loadHrEmployeeChangeForWrite(w, r, scope)
	if !ok {
		return
	}
	archived, err := h.Queries.ArchiveHrEmployeeChange(r.Context(), db.ArchiveHrEmployeeChangeParams{
		ID:          current.ID,
		WorkspaceID: scope.WorkspaceUUID,
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to delete the change", err)
		return
	}
	if archived == 0 {
		writeError(w, http.StatusNotFound, "change not found")
		return
	}
	h.publishHrChanged(eventHrEmployeeProfileChanged, scope.WorkspaceID, uuidToString(current.EmployeeID), uuidToString(scope.Member.UserID))
	w.WriteHeader(http.StatusNoContent)
}
