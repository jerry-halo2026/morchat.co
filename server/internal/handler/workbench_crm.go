package handler

// CRM ledger: clients, briefs, collaborations and settlements
// (docs/engineering/WORKBENCH-API.md §3).
//
// Ownership and the write gate match the creator domain: `owner_member_id` on
// the row decides, owner/admin write everything, a `member` writes only its own.
// A settlement has no owner column — it belongs to its collaboration, so the
// gate reads the collaboration's owner rather than inventing a second source of
// truth.
//
// Stage transitions write their milestones (`confirmed_at`, `published_at`,
// `accepted_at`) because the month KPIs read a timestamp, not a stage history
// they would have to reconstruct.

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	db "github.com/jerry-halo2026/morchat.co/server/pkg/db/generated"
)

var (
	crmBriefStatuses   = map[string]bool{"draft": true, "open": true, "matching": true, "closed": true}
	crmDeliverables    = map[string]bool{"short_video": true, "post": true, "live": true}
	crmSettlementModes = map[string]bool{"flat": true, "cps": true, "cpa": true, "barter": true}
	crmSettlementKinds = map[string]bool{"prepay": true, "final": true, "platform_fee": true, "tax": true}

	// collabStageRank orders the funnel so a transition can fill in every
	// milestone it has passed, including the ones it skipped over.
	collabStageRank = map[string]int{
		"inquiry":       0,
		"quoted":        1,
		"negotiating":   2,
		"confirmed":     3,
		"sampling":      4,
		"script_review": 5,
		"scheduled":     6,
		"published":     7,
		"accepted":      8,
		"settled":       9,
		"cancelled":     -1,
	}
)

// CrmClientRequest is the create/PATCH body for a client (甲方).
type CrmClientRequest struct {
	Name           *string `json:"name"`
	Brand          *string `json:"brand"`
	Industry       *string `json:"industry"`
	ContactName    *string `json:"contact_name"`
	ContactChannel *string `json:"contact_channel"`
	ContractEntity *string `json:"contract_entity"`
	PaymentTerms   *string `json:"payment_terms"`
	CreditNote     *string `json:"credit_note"`
	OwnerMemberID  *string `json:"owner_member_id"`
}

// CrmBriefRequest is the create/PATCH body for a brief (需求单).
type CrmBriefRequest struct {
	ClientID        *string   `json:"client_id"`
	Title           *string   `json:"title"`
	Category        *string   `json:"category"`
	BudgetMinAmount *float64  `json:"budget_min_amount"`
	BudgetMaxAmount *float64  `json:"budget_max_amount"`
	TargetAudience  *string   `json:"target_audience"`
	DeliverableType *string   `json:"deliverable_type"`
	Platforms       *[]string `json:"platforms"`
	ScheduleFrom    *string   `json:"schedule_from"`
	ScheduleTo      *string   `json:"schedule_to"`
	KPIPlay         *int64    `json:"kpi_play"`
	KPIGMVAmount    *float64  `json:"kpi_gmv_amount"`
	Status          *string   `json:"status"`
	OwnerMemberID   *string   `json:"owner_member_id"`
}

// CrmCollabRequest is the create/PATCH body for a collaboration (合作单).
//
// Seven of its nullable columns follow WORKBENCH-API §3.4's clearing rule (omitted
// keeps, `null` clears, `""` clears for older clients), so they are decoded raw:
// a `*string` / `*float64` cannot tell "not sent" from "sent as null". The two
// amounts are in that set because the sales drawer sends `null` for an emptied
// field (`collabFields`); leaving them as pointers would make those two the only
// two fields where emptying the box silently kept the old number.
//
// `omitempty` is load-bearing on those fields, not cosmetic: the agent write channel
// marshals this struct back into a body (`workbenchAgentWriteReplay`), and a nil
// `json.RawMessage` would otherwise be encoded as an explicit `null` — a clear the
// tool never asked for. Omitted means omitted.
type CrmCollabRequest struct {
	BriefID        *string         `json:"brief_id"`
	CreatorID      *string         `json:"creator_id"`
	Stage          *string         `json:"stage"`
	QuoteAmount    json.RawMessage `json:"quote_amount,omitempty"`
	FinalAmount    json.RawMessage `json:"final_amount,omitempty"`
	Prob           *float64        `json:"prob"`
	CreatorFee     json.RawMessage `json:"creator_fee,omitempty"`
	SampleCost     json.RawMessage `json:"sample_cost,omitempty"`
	PlatformFee    json.RawMessage `json:"platform_fee,omitempty"`
	Currency       *string         `json:"currency"`
	SettlementMode *string         `json:"settlement_mode"`
	CommissionRate *float64        `json:"commission_rate"`
	SampleRequired *bool           `json:"sample_required"`
	ScriptRequired *bool           `json:"script_required"`
	ScheduledAt    *string         `json:"scheduled_at"`
	ConfirmedAt    *string         `json:"confirmed_at"`
	PublishedAt    *string         `json:"published_at"`
	AcceptedAt     *string         `json:"accepted_at"`
	IssueID        *string         `json:"issue_id"`
	OwnerMemberID  *string         `json:"owner_member_id"`
	// Fulfilment (WORKBENCH-API §20.2, migration 810): where the collaboration
	// went live, and the day it was settled.
	PublishURL json.RawMessage `json:"publish_url,omitempty"`
	SettledOn  json.RawMessage `json:"settled_on,omitempty"`
	// Assignment and concurrency (COLLAB-MODEL §1/§3, migration 821):
	// `assignee_*` is who is doing the work (member or agent); `expected_revision`
	// is the revision this reader last saw — mismatched is a 409 `stale_write`,
	// omitted is no check at all (old clients).
	AssigneeType     *string `json:"assignee_type"`
	AssigneeID       *string `json:"assignee_id"`
	ExpectedRevision *int32  `json:"expected_revision"`
	// OverwriteReason is required when a human edits a row an agent last wrote
	// (WORKBENCH-API §26.3).
	OverwriteReason *string `json:"overwrite_reason"`
}

// CrmSettlementRequest is the create/PATCH body for one settlement row
// (结算流水). `paid_at`, `invoice_no` and `note` are clearable (§3.4) and are
// decoded raw for the same reason as the collaboration's nullable columns.
type CrmSettlementRequest struct {
	CollabID  *string         `json:"collab_id"`
	Kind      *string         `json:"kind"`
	Amount    *float64        `json:"amount"`
	Currency  *string         `json:"currency"`
	DueAt     *string         `json:"due_at"`
	PaidAt    json.RawMessage `json:"paid_at,omitempty"`
	InvoiceNo json.RawMessage `json:"invoice_no,omitempty"`
	Note      json.RawMessage `json:"note,omitempty"`
	// Assignment and concurrency, same contract as the collaboration.
	AssigneeType     *string `json:"assignee_type"`
	AssigneeID       *string `json:"assignee_id"`
	ExpectedRevision *int32  `json:"expected_revision"`
	// OverwriteReason is §26.3's vocabulary: required when a human edits a row an
	// agent last wrote, so the overwrite rate can tell a wrong answer from a
	// different preference.
	OverwriteReason *string `json:"overwrite_reason"`
}

// collabHighValue reports whether a collaboration write touches money, a
// settlement, the commission rate, or moves the stage to `settled` — the fields a
// human's write must send to review and an agent's write may never touch
// (WORKBENCH-API §26.1/§26.5). The names travel into the 403 so a caller learns
// which field the rule is about.
//
// `patch` is whether this body is a PATCH: clearing a field with `null` counts as
// touching it only there, because a create has nothing to clear and a form that
// sends every key as `null` must not turn into a money write.
func collabHighValue(req CrmCollabRequest, patch bool) (bool, []string) {
	fields := make([]string, 0, 8)
	if patchTouches(req.QuoteAmount, patch) {
		fields = append(fields, "quote_amount")
	}
	if patchTouches(req.FinalAmount, patch) {
		fields = append(fields, "final_amount")
	}
	if patchTouches(req.CreatorFee, patch) {
		fields = append(fields, "creator_fee")
	}
	if patchTouches(req.SampleCost, patch) {
		fields = append(fields, "sample_cost")
	}
	if patchTouches(req.PlatformFee, patch) {
		fields = append(fields, "platform_fee")
	}
	if req.CommissionRate != nil {
		fields = append(fields, "commission_rate")
	}
	if req.Currency != nil {
		fields = append(fields, "currency")
	}
	if req.SettlementMode != nil {
		fields = append(fields, "settlement_mode")
	}
	if patchTouches(req.SettledOn, patch) {
		fields = append(fields, "settled_on")
	}
	if req.Stage != nil && strings.TrimSpace(*req.Stage) == "settled" {
		fields = append(fields, "stage")
	}
	return len(fields) > 0, fields
}

// settlementHighValue: a settlement row is money by definition, so any write that
// touches what it pays — amount, currency, kind, the two days — needs review. A
// note or an invoice number does not. As above, `patch` decides whether a `null`
// counts: only a PATCH can clear.
func settlementHighValue(req CrmSettlementRequest, patch bool) (bool, []string) {
	fields := make([]string, 0, 5)
	if req.Amount != nil {
		fields = append(fields, "amount")
	}
	if req.Currency != nil {
		fields = append(fields, "currency")
	}
	if req.Kind != nil {
		fields = append(fields, "kind")
	}
	if req.DueAt != nil {
		fields = append(fields, "due_at")
	}
	if patchTouches(req.PaidAt, patch) {
		fields = append(fields, "paid_at")
	}
	return len(fields) > 0, fields
}

// collabStageMilestones returns the milestones a transition into stage leaves
// behind. Only empty milestones are filled: moving a collaboration back a stage
// must not erase the day it was actually confirmed.
func collabStageMilestones(stage string, now time.Time, confirmed, published, accepted pgtype.Timestamptz) (pgtype.Timestamptz, pgtype.Timestamptz, pgtype.Timestamptz) {
	rank, known := collabStageRank[stage]
	if !known || rank < 0 {
		return confirmed, published, accepted
	}
	stamp := pgtype.Timestamptz{Time: now, Valid: true}
	if rank >= collabStageRank["confirmed"] && !confirmed.Valid {
		confirmed = stamp
	}
	if rank >= collabStageRank["published"] && !published.Valid {
		published = stamp
	}
	if rank >= collabStageRank["accepted"] && !accepted.Valid {
		accepted = stamp
	}
	return confirmed, published, accepted
}

func (h *Handler) publishCRMChanged(eventType, workspaceID, id, actorID string) {
	h.publish(eventType, workspaceID, "member", actorID, map[string]any{"id": id})
}

// publishCRMActor is publishCRMChanged for a caller that resolved its actor: an
// agent's write must reach other clients as the agent's, not as the member whose
// identity the tool ran under (COLLAB-MODEL §2/§6).
func (h *Handler) publishCRMActor(eventType, workspaceID, id string, actor workbenchActor) {
	h.publish(eventType, workspaceID, actor.Type, actor.idString(), map[string]any{"id": id})
}

// workbenchCurrency normalises a CHAR(3) currency code, defaulting to CNY.
func workbenchCurrency(w http.ResponseWriter, raw *string) (string, bool) {
	if raw == nil || strings.TrimSpace(*raw) == "" {
		return "CNY", true
	}
	currency := strings.ToUpper(strings.TrimSpace(*raw))
	if len(currency) != 3 {
		writeError(w, http.StatusBadRequest, "currency must be a 3-letter code")
		return "", false
	}
	return currency, true
}

// workbenchProbability validates the 0-1 probability (docs/METRICS.md §3 C3:
// stored 0-1, displayed ×100).
func workbenchProbability(w http.ResponseWriter, raw *float64) bool {
	if raw == nil {
		return true
	}
	if *raw < 0 || *raw > 1 {
		writeError(w, http.StatusBadRequest, "prob must be between 0 and 1")
		return false
	}
	return true
}

// workbenchCommissionRate validates a collaboration's commission ratio. It is the
// same rule, and the same wording, as `bdCommissionRate` on the quote ledger:
// METRICS §3 C3 stores the ratio 0–1 and displays ×100, so 20 % is 0.2 and never
// 20. The column is NUMERIC(6,5), which cannot even represent 438.00 — without
// this check such a value reaches PostgreSQL as SQLSTATE 22003 and comes back as a
// 500 that names no field. Clamping was rejected for the same reason it is
// rejected on quotes: a quietly rewritten rate is a wrong number nobody can see.
func workbenchCommissionRate(w http.ResponseWriter, raw *float64) bool {
	if raw == nil {
		return true
	}
	if *raw < 0 || *raw > 1 {
		writeError(w, http.StatusBadRequest,
			"commission_rate must be between 0 and 1: send 0.2 for 20%, not 20")
		return false
	}
	return true
}

// ---- clients ---------------------------------------------------------------

// ListCrmClients — GET /api/workbench/crm/clients
func (h *Handler) ListCrmClients(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	if !h.requireWorkbenchCapability(w, r, scope, capCRMRead) {
		return
	}
	cursorAt, cursorID, ok := h.workbenchCursorKey(w, r, func(id pgtype.UUID) (pgtype.Timestamptz, error) {
		row, err := h.Queries.GetCrmClient(r.Context(), db.GetCrmClientParams{ID: id, WorkspaceID: scope.WorkspaceUUID})
		return row.CreatedAt, err
	})
	if !ok {
		return
	}
	rows, err := h.Queries.ListCrmClients(r.Context(), db.ListCrmClientsParams{
		WorkspaceID: scope.WorkspaceUUID,
		Query:       strToText(workbenchLikePattern(r.URL.Query().Get("q"))),
		CursorAt:    cursorAt,
		CursorID:    cursorID,
		Limit:       workbenchLimit(r),
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to list clients", err)
		return
	}
	resp := make([]CrmClientResponse, len(rows))
	for i, row := range rows {
		resp[i] = crmClientToResponse(row)
	}
	// Only a full page has a successor; see `workbenchPage` for the rule.
	writeJSON(w, http.StatusOK, workbenchPage(
		map[string]any{"clients": resp, "total": len(resp)},
		rows, workbenchLimit(r), func(row db.CrmClient) pgtype.UUID { return row.ID },
	))
}

// CreateCrmClient — POST /api/workbench/crm/clients
func (h *Handler) CreateCrmClient(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	if !h.requireWorkbenchCapability(w, r, scope, capCRMWrite) {
		return
	}
	var req CrmClientRequest
	if !decodeWorkbenchBody(w, r, &req) {
		return
	}
	name := strings.TrimSpace(valueOrEmpty(req.Name))
	if name == "" {
		writeError(w, http.StatusBadRequest, "name is required")
		return
	}
	owner, ok := h.workbenchOwnerForCreate(w, r, scope, req.OwnerMemberID)
	if !ok {
		return
	}
	client, err := h.Queries.CreateCrmClient(r.Context(), db.CreateCrmClientParams{
		WorkspaceID:    scope.WorkspaceUUID,
		Name:           name,
		Brand:          optionalTrimmedText(req.Brand),
		Industry:       optionalTrimmedText(req.Industry),
		ContactName:    optionalTrimmedText(req.ContactName),
		ContactChannel: optionalTrimmedText(req.ContactChannel),
		ContractEntity: optionalTrimmedText(req.ContractEntity),
		PaymentTerms:   optionalTrimmedText(req.PaymentTerms),
		CreditNote:     optionalTrimmedText(req.CreditNote),
		OwnerMemberID:  owner,
		CreatedBy:      scope.Member.UserID,
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to create client", err)
		return
	}
	h.publishCRMChanged(eventCRMClientChanged, scope.WorkspaceID, uuidToString(client.ID), uuidToString(scope.Member.UserID))
	writeJSON(w, http.StatusCreated, crmClientToResponse(client))
}

// loadCrmClientForWrite resolves {clientId} and checks the write gate.
func (h *Handler) loadCrmClientForWrite(w http.ResponseWriter, r *http.Request, scope workbenchScope) (db.CrmClient, bool) {
	id, ok := parseUUIDOrBadRequest(w, chi.URLParam(r, "clientId"), "client id")
	if !ok {
		return db.CrmClient{}, false
	}
	client, err := h.Queries.GetCrmClient(r.Context(), db.GetCrmClientParams{ID: id, WorkspaceID: scope.WorkspaceUUID})
	if err != nil {
		writeError(w, http.StatusNotFound, "client not found")
		return db.CrmClient{}, false
	}
	if !workbenchCanWrite(scope.Member, client.OwnerMemberID) {
		writeError(w, http.StatusForbidden, "you can only change clients you own")
		return db.CrmClient{}, false
	}
	return client, true
}

// GetCrmClient — GET /api/workbench/crm/clients/{clientId}
func (h *Handler) GetCrmClient(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	if !h.requireWorkbenchCapability(w, r, scope, capCRMRead) {
		return
	}
	id, ok := parseUUIDOrBadRequest(w, chi.URLParam(r, "clientId"), "client id")
	if !ok {
		return
	}
	client, err := h.Queries.GetCrmClient(r.Context(), db.GetCrmClientParams{ID: id, WorkspaceID: scope.WorkspaceUUID})
	if err != nil {
		writeError(w, http.StatusNotFound, "client not found")
		return
	}
	writeJSON(w, http.StatusOK, crmClientToResponse(client))
}

// UpdateCrmClient — PATCH /api/workbench/crm/clients/{clientId}
func (h *Handler) UpdateCrmClient(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	if !h.requireWorkbenchCapability(w, r, scope, capCRMWrite) {
		return
	}
	current, ok := h.loadCrmClientForWrite(w, r, scope)
	if !ok {
		return
	}
	var req CrmClientRequest
	if !decodeWorkbenchBody(w, r, &req) {
		return
	}
	name := current.Name
	if req.Name != nil {
		name = strings.TrimSpace(*req.Name)
		if name == "" {
			writeError(w, http.StatusBadRequest, "name is required")
			return
		}
	}
	requestedOwner, ok := workbenchOptionalUUID(w, req.OwnerMemberID, "owner_member_id")
	if !ok {
		return
	}
	owner, ok := h.workbenchOwnerForUpdate(w, r, scope, current.OwnerMemberID, requestedOwner)
	if !ok {
		return
	}
	updated, err := h.Queries.UpdateCrmClient(r.Context(), db.UpdateCrmClientParams{
		ID:             current.ID,
		WorkspaceID:    scope.WorkspaceUUID,
		Name:           name,
		Brand:          applyTextPatch(req.Brand, current.Brand),
		Industry:       applyTextPatch(req.Industry, current.Industry),
		ContactName:    applyTextPatch(req.ContactName, current.ContactName),
		ContactChannel: applyTextPatch(req.ContactChannel, current.ContactChannel),
		ContractEntity: applyTextPatch(req.ContractEntity, current.ContractEntity),
		PaymentTerms:   applyTextPatch(req.PaymentTerms, current.PaymentTerms),
		CreditNote:     applyTextPatch(req.CreditNote, current.CreditNote),
		OwnerMemberID:  owner,
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to update client", err)
		return
	}
	h.publishCRMChanged(eventCRMClientChanged, scope.WorkspaceID, uuidToString(updated.ID), uuidToString(scope.Member.UserID))
	writeJSON(w, http.StatusOK, crmClientToResponse(updated))
}

// DeleteCrmClient — DELETE /api/workbench/crm/clients/{clientId}
func (h *Handler) DeleteCrmClient(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	if !h.requireWorkbenchCapability(w, r, scope, capCRMWrite) {
		return
	}
	current, ok := h.loadCrmClientForWrite(w, r, scope)
	if !ok {
		return
	}
	deleted, err := h.Queries.ArchiveCrmClient(r.Context(), db.ArchiveCrmClientParams{
		ID:          current.ID,
		WorkspaceID: scope.WorkspaceUUID,
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to delete client", err)
		return
	}
	if deleted == 0 {
		writeError(w, http.StatusNotFound, "client not found")
		return
	}
	h.publishCRMChanged(eventCRMClientChanged, scope.WorkspaceID, uuidToString(current.ID), uuidToString(scope.Member.UserID))
	w.WriteHeader(http.StatusNoContent)
}

// ---- briefs ----------------------------------------------------------------

// ListCrmBriefs — GET /api/workbench/crm/briefs
func (h *Handler) ListCrmBriefs(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	if !h.requireWorkbenchCapability(w, r, scope, capCRMRead) {
		return
	}
	status := strings.TrimSpace(r.URL.Query().Get("status"))
	if status != "" && !crmBriefStatuses[status] {
		writeError(w, http.StatusBadRequest, "invalid status")
		return
	}
	clientID, ok := workbenchOptionalUUID(w, stringPtr(strings.TrimSpace(r.URL.Query().Get("client_id"))), "client_id")
	if !ok {
		return
	}
	cursorAt, cursorID, ok := h.workbenchCursorKey(w, r, func(id pgtype.UUID) (pgtype.Timestamptz, error) {
		row, err := h.Queries.GetCrmBrief(r.Context(), db.GetCrmBriefParams{ID: id, WorkspaceID: scope.WorkspaceUUID})
		return row.CreatedAt, err
	})
	if !ok {
		return
	}
	rows, err := h.Queries.ListCrmBriefs(r.Context(), db.ListCrmBriefsParams{
		WorkspaceID: scope.WorkspaceUUID,
		Status:      strToText(status),
		ClientID:    clientID,
		CursorAt:    cursorAt,
		CursorID:    cursorID,
		Limit:       workbenchLimit(r),
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to list briefs", err)
		return
	}
	resp := make([]CrmBriefResponse, len(rows))
	for i, row := range rows {
		resp[i] = crmBriefToResponse(row)
	}
	// Only a full page has a successor; see `workbenchPage` for the rule.
	writeJSON(w, http.StatusOK, workbenchPage(
		map[string]any{"briefs": resp, "total": len(resp)},
		rows, workbenchLimit(r), func(row db.CrmBrief) pgtype.UUID { return row.ID },
	))
}

// workbenchClientRef validates the brief's required client pointer.
func (h *Handler) workbenchClientRef(w http.ResponseWriter, r *http.Request, scope workbenchScope, raw *string) (pgtype.UUID, bool) {
	clientID, ok := workbenchOptionalUUID(w, raw, "client_id")
	if !ok {
		return pgtype.UUID{}, false
	}
	if !clientID.Valid {
		writeError(w, http.StatusBadRequest, "client_id is required")
		return pgtype.UUID{}, false
	}
	if _, err := h.Queries.GetCrmClient(r.Context(), db.GetCrmClientParams{
		ID:          clientID,
		WorkspaceID: scope.WorkspaceUUID,
	}); err != nil {
		writeError(w, http.StatusBadRequest, "client_id is not a client in this workspace")
		return pgtype.UUID{}, false
	}
	return clientID, true
}

// CreateCrmBrief — POST /api/workbench/crm/briefs
func (h *Handler) CreateCrmBrief(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	if !h.requireWorkbenchCapability(w, r, scope, capCRMWrite) {
		return
	}
	var req CrmBriefRequest
	if !decodeWorkbenchBody(w, r, &req) {
		return
	}
	clientID, ok := h.workbenchClientRef(w, r, scope, req.ClientID)
	if !ok {
		return
	}
	title := strings.TrimSpace(valueOrEmpty(req.Title))
	if title == "" {
		writeError(w, http.StatusBadRequest, "title is required")
		return
	}
	status := "draft"
	if req.Status != nil && strings.TrimSpace(*req.Status) != "" {
		status = strings.TrimSpace(*req.Status)
	}
	if !crmBriefStatuses[status] {
		writeError(w, http.StatusBadRequest, "invalid status")
		return
	}
	if req.DeliverableType != nil && strings.TrimSpace(*req.DeliverableType) != "" && !crmDeliverables[strings.TrimSpace(*req.DeliverableType)] {
		writeError(w, http.StatusBadRequest, "invalid deliverable_type")
		return
	}
	scheduleFrom, ok := workbenchDateValue(w, req.ScheduleFrom, "schedule_from")
	if !ok {
		return
	}
	scheduleTo, ok := workbenchDateValue(w, req.ScheduleTo, "schedule_to")
	if !ok {
		return
	}
	owner, ok := h.workbenchOwnerForCreate(w, r, scope, req.OwnerMemberID)
	if !ok {
		return
	}
	platforms := []string{}
	if req.Platforms != nil && *req.Platforms != nil {
		platforms = *req.Platforms
	}
	budgetMin, ok := workbenchMoneyValue(w, req.BudgetMinAmount, "budget_min_amount")
	if !ok {
		return
	}
	budgetMax, ok := workbenchMoneyValue(w, req.BudgetMaxAmount, "budget_max_amount")
	if !ok {
		return
	}
	kpiGMV, ok := workbenchMoneyValue(w, req.KPIGMVAmount, "kpi_gmv_amount")
	if !ok {
		return
	}

	brief, err := h.Queries.CreateCrmBrief(r.Context(), db.CreateCrmBriefParams{
		WorkspaceID:     scope.WorkspaceUUID,
		ClientID:        clientID,
		Title:           title,
		Category:        optionalTrimmedText(req.Category),
		BudgetMinAmount: budgetMin,
		BudgetMaxAmount: budgetMax,
		TargetAudience:  optionalTrimmedText(req.TargetAudience),
		DeliverableType: optionalTrimmedText(req.DeliverableType),
		Platforms:       platforms,
		ScheduleFrom:    scheduleFrom,
		ScheduleTo:      scheduleTo,
		KpiPlay:         int8Value(req.KPIPlay),
		KpiGmvAmount:    kpiGMV,
		Status:          status,
		OwnerMemberID:   owner,
		CreatedBy:       scope.Member.UserID,
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to create brief", err)
		return
	}
	h.publishCRMChanged(eventCRMBriefChanged, scope.WorkspaceID, uuidToString(brief.ID), uuidToString(scope.Member.UserID))
	writeJSON(w, http.StatusCreated, crmBriefToResponse(brief))
}

// loadCrmBriefForWrite resolves {briefId} and checks the write gate.
func (h *Handler) loadCrmBriefForWrite(w http.ResponseWriter, r *http.Request, scope workbenchScope) (db.CrmBrief, bool) {
	id, ok := parseUUIDOrBadRequest(w, chi.URLParam(r, "briefId"), "brief id")
	if !ok {
		return db.CrmBrief{}, false
	}
	brief, err := h.Queries.GetCrmBrief(r.Context(), db.GetCrmBriefParams{ID: id, WorkspaceID: scope.WorkspaceUUID})
	if err != nil {
		writeError(w, http.StatusNotFound, "brief not found")
		return db.CrmBrief{}, false
	}
	if !workbenchCanWrite(scope.Member, brief.OwnerMemberID) {
		writeError(w, http.StatusForbidden, "you can only change briefs you own")
		return db.CrmBrief{}, false
	}
	return brief, true
}

// GetCrmBrief — GET /api/workbench/crm/briefs/{briefId}
func (h *Handler) GetCrmBrief(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	if !h.requireWorkbenchCapability(w, r, scope, capCRMRead) {
		return
	}
	id, ok := parseUUIDOrBadRequest(w, chi.URLParam(r, "briefId"), "brief id")
	if !ok {
		return
	}
	brief, err := h.Queries.GetCrmBrief(r.Context(), db.GetCrmBriefParams{ID: id, WorkspaceID: scope.WorkspaceUUID})
	if err != nil {
		writeError(w, http.StatusNotFound, "brief not found")
		return
	}
	writeJSON(w, http.StatusOK, crmBriefToResponse(brief))
}

// UpdateCrmBrief — PATCH /api/workbench/crm/briefs/{briefId}
func (h *Handler) UpdateCrmBrief(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	if !h.requireWorkbenchCapability(w, r, scope, capCRMWrite) {
		return
	}
	current, ok := h.loadCrmBriefForWrite(w, r, scope)
	if !ok {
		return
	}
	var req CrmBriefRequest
	if !decodeWorkbenchBody(w, r, &req) {
		return
	}

	clientID := current.ClientID
	if req.ClientID != nil && strings.TrimSpace(*req.ClientID) != "" {
		parsed, ok := h.workbenchClientRef(w, r, scope, req.ClientID)
		if !ok {
			return
		}
		clientID = parsed
	}
	title := current.Title
	if req.Title != nil {
		title = strings.TrimSpace(*req.Title)
		if title == "" {
			writeError(w, http.StatusBadRequest, "title is required")
			return
		}
	}
	status := current.Status
	if req.Status != nil {
		status = strings.TrimSpace(*req.Status)
		if !crmBriefStatuses[status] {
			writeError(w, http.StatusBadRequest, "invalid status")
			return
		}
	}
	deliverable := current.DeliverableType
	if req.DeliverableType != nil {
		trimmed := strings.TrimSpace(*req.DeliverableType)
		if trimmed != "" && !crmDeliverables[trimmed] {
			writeError(w, http.StatusBadRequest, "invalid deliverable_type")
			return
		}
		deliverable = optionalTrimmedText(req.DeliverableType)
	}
	scheduleFrom, ok := applyDatePatch(req.ScheduleFrom, w, "schedule_from", current.ScheduleFrom)
	if !ok {
		return
	}
	scheduleTo, ok := applyDatePatch(req.ScheduleTo, w, "schedule_to", current.ScheduleTo)
	if !ok {
		return
	}
	requestedOwner, ok := workbenchOptionalUUID(w, req.OwnerMemberID, "owner_member_id")
	if !ok {
		return
	}
	owner, ok := h.workbenchOwnerForUpdate(w, r, scope, current.OwnerMemberID, requestedOwner)
	if !ok {
		return
	}
	platforms := current.Platforms
	if req.Platforms != nil && *req.Platforms != nil {
		platforms = *req.Platforms
	}
	budgetMin, ok := workbenchMoneyPatch(w, req.BudgetMinAmount, "budget_min_amount", current.BudgetMinAmount)
	if !ok {
		return
	}
	budgetMax, ok := workbenchMoneyPatch(w, req.BudgetMaxAmount, "budget_max_amount", current.BudgetMaxAmount)
	if !ok {
		return
	}
	kpiGMV, ok := workbenchMoneyPatch(w, req.KPIGMVAmount, "kpi_gmv_amount", current.KpiGmvAmount)
	if !ok {
		return
	}

	updated, err := h.Queries.UpdateCrmBrief(r.Context(), db.UpdateCrmBriefParams{
		ID:              current.ID,
		WorkspaceID:     scope.WorkspaceUUID,
		ClientID:        clientID,
		Title:           title,
		Category:        applyTextPatch(req.Category, current.Category),
		BudgetMinAmount: budgetMin,
		BudgetMaxAmount: budgetMax,
		TargetAudience:  applyTextPatch(req.TargetAudience, current.TargetAudience),
		DeliverableType: deliverable,
		Platforms:       platforms,
		ScheduleFrom:    scheduleFrom,
		ScheduleTo:      scheduleTo,
		KpiPlay:         applyInt8Patch(req.KPIPlay, current.KpiPlay),
		KpiGmvAmount:    kpiGMV,
		Status:          status,
		OwnerMemberID:   owner,
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to update brief", err)
		return
	}
	h.publishCRMChanged(eventCRMBriefChanged, scope.WorkspaceID, uuidToString(updated.ID), uuidToString(scope.Member.UserID))
	writeJSON(w, http.StatusOK, crmBriefToResponse(updated))
}

// DeleteCrmBrief — DELETE /api/workbench/crm/briefs/{briefId}
func (h *Handler) DeleteCrmBrief(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	if !h.requireWorkbenchCapability(w, r, scope, capCRMWrite) {
		return
	}
	current, ok := h.loadCrmBriefForWrite(w, r, scope)
	if !ok {
		return
	}
	deleted, err := h.Queries.ArchiveCrmBrief(r.Context(), db.ArchiveCrmBriefParams{
		ID:          current.ID,
		WorkspaceID: scope.WorkspaceUUID,
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to delete brief", err)
		return
	}
	if deleted == 0 {
		writeError(w, http.StatusNotFound, "brief not found")
		return
	}
	h.publishCRMChanged(eventCRMBriefChanged, scope.WorkspaceID, uuidToString(current.ID), uuidToString(scope.Member.UserID))
	w.WriteHeader(http.StatusNoContent)
}

// ---- collaborations --------------------------------------------------------

// ListCrmCollabs — GET /api/workbench/crm/collabs
func (h *Handler) ListCrmCollabs(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	if !h.requireWorkbenchCapability(w, r, scope, capCRMRead) {
		return
	}
	stage := strings.TrimSpace(r.URL.Query().Get("stage"))
	if stage != "" {
		if _, known := collabStageRank[stage]; !known {
			writeError(w, http.StatusBadRequest, "invalid stage")
			return
		}
	}
	briefID, ok := workbenchOptionalUUID(w, stringPtr(strings.TrimSpace(r.URL.Query().Get("brief_id"))), "brief_id")
	if !ok {
		return
	}
	creatorID, ok := workbenchOptionalUUID(w, stringPtr(strings.TrimSpace(r.URL.Query().Get("creator_id"))), "creator_id")
	if !ok {
		return
	}
	cursorAt, cursorID, ok := h.workbenchCursorKey(w, r, func(id pgtype.UUID) (pgtype.Timestamptz, error) {
		row, err := h.Queries.GetCrmCollab(r.Context(), db.GetCrmCollabParams{ID: id, WorkspaceID: scope.WorkspaceUUID})
		return row.CreatedAt, err
	})
	if !ok {
		return
	}
	assigneeType, assigneeID, ok := h.workbenchAssigneeFilter(w, r, scope)
	if !ok {
		return
	}
	reviewState, ok := workbenchReviewStateFilter(w, r)
	if !ok {
		return
	}
	// §24.4's read half (§24.6 recorded the list as the open gap): with
	// `workbench_visibility=department` the list returns only the rows whose owner is
	// in the caller's department, and a caller without a department sees none of them.
	departmentID, departmentScoped, visible := h.bdDepartmentFilter(r, scope)
	if !visible {
		writeWorkbenchEmptyPage(w, "collabs")
		return
	}
	rows, err := h.Queries.ListCrmCollabs(r.Context(), db.ListCrmCollabsParams{
		WorkspaceID:      scope.WorkspaceUUID,
		Stage:            strToText(stage),
		BriefID:          briefID,
		CreatorID:        creatorID,
		AssigneeType:     assigneeType,
		AssigneeID:       assigneeID,
		ReviewState:      reviewState,
		DepartmentScoped: departmentScoped,
		DepartmentID:     departmentID,
		CursorAt:         cursorAt,
		CursorID:         cursorID,
		Limit:            workbenchLimit(r),
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to list collabs", err)
		return
	}
	resp := make([]CrmCollabWithThread, len(rows))
	actors := h.lastWorkbenchActors(r.Context(), scope, subjectCrmCollab,
		subjectIDs(rows, func(row db.CrmCollab) pgtype.UUID { return row.ID }))
	threads := h.workbenchThreads(r.Context(), scope, collabIssueIDs(rows))
	for i, row := range rows {
		resp[i] = CrmCollabWithThread{
			CrmCollabResponse: crmCollabToResponse(row, actors[uuidToString(row.ID)]),
			Thread:            threads[uuidToString(row.IssueID)],
		}
	}
	writeJSON(w, http.StatusOK, workbenchPage(
		map[string]any{"collabs": resp, "total": len(resp)},
		rows, workbenchLimit(r), func(row db.CrmCollab) pgtype.UUID { return row.ID },
	))
}

// CreateCrmCollab — POST /api/workbench/crm/collabs
func (h *Handler) CreateCrmCollab(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	if !h.requireWorkbenchCapability(w, r, scope, capCRMWrite) {
		return
	}
	var req CrmCollabRequest
	if !decodeWorkbenchBody(w, r, &req) {
		return
	}
	actor := h.workbenchActor(r, scope)
	// A create cannot clear anything, so an explicit `null` here is just "no value".
	patch := false
	highValue, moneyFields := collabHighValue(req, patch)
	if !agentMoneyGate(w, actor, moneyFields) {
		return
	}
	// Money and settlement are their own capabilities (—4.1): "may edit a
	// collaboration" is not "may change what it pays". The check runs on the
	// fields the request actually touches, so a title rename stays crm.write.
	if patchTouches(req.QuoteAmount, patch) || patchTouches(req.FinalAmount, patch) || patchTouches(req.CreatorFee, patch) ||
		patchTouches(req.SampleCost, patch) || patchTouches(req.PlatformFee, patch) || req.CommissionRate != nil {
		if !h.requireWorkbenchCapability(w, r, scope, capCRMAmount) {
			return
		}
	}
	if req.Stage != nil && strings.TrimSpace(*req.Stage) == "settled" {
		if !h.requireWorkbenchCapability(w, r, scope, capCRMSettle) {
			return
		}
	}
	brief, ok := h.requireBriefInWorkspace(w, r, scope, req.BriefID)
	if !ok {
		return
	}
	creator, ok := h.requireCreatorInWorkspace(r.Context(), w, scope.WorkspaceID, req.CreatorID)
	if !ok {
		return
	}
	stage := "inquiry"
	if req.Stage != nil && strings.TrimSpace(*req.Stage) != "" {
		stage = strings.TrimSpace(*req.Stage)
	}
	if _, known := collabStageRank[stage]; !known {
		writeError(w, http.StatusBadRequest, "invalid stage")
		return
	}
	if !workbenchProbability(w, req.Prob) {
		return
	}
	if !workbenchCommissionRate(w, req.CommissionRate) {
		return
	}
	currency, ok := workbenchCurrency(w, req.Currency)
	if !ok {
		return
	}
	if req.SettlementMode != nil && strings.TrimSpace(*req.SettlementMode) != "" && !crmSettlementModes[strings.TrimSpace(*req.SettlementMode)] {
		writeError(w, http.StatusBadRequest, "invalid settlement_mode")
		return
	}
	scheduledAt, ok := workbenchTimestampValue(w, req.ScheduledAt, "scheduled_at")
	if !ok {
		return
	}
	settledOn, ok := applyDateClearPatch(req.SettledOn, w, "settled_on", pgtype.Date{})
	if !ok {
		return
	}
	publishURL, ok := applyTextClearPatch(req.PublishURL, w, "publish_url", pgtype.Text{})
	if !ok {
		return
	}
	quoteAmount, ok := applyNumericClearPatch(req.QuoteAmount, w, "quote_amount", pgtype.Numeric{})
	if !ok {
		return
	}
	finalAmount, ok := applyNumericClearPatch(req.FinalAmount, w, "final_amount", pgtype.Numeric{})
	if !ok {
		return
	}
	creatorFee, ok := applyNumericClearPatch(req.CreatorFee, w, "creator_fee", pgtype.Numeric{})
	if !ok {
		return
	}
	sampleCost, ok := applyNumericClearPatch(req.SampleCost, w, "sample_cost", pgtype.Numeric{})
	if !ok {
		return
	}
	platformFee, ok := applyNumericClearPatch(req.PlatformFee, w, "platform_fee", pgtype.Numeric{})
	if !ok {
		return
	}
	issueID, ok := workbenchOptionalUUID(w, req.IssueID, "issue_id")
	if !ok {
		return
	}
	if issueID.Valid {
		if _, err := h.Queries.GetIssueInWorkspace(r.Context(), db.GetIssueInWorkspaceParams{
			ID: issueID, WorkspaceID: scope.WorkspaceUUID,
		}); err != nil {
			writeError(w, http.StatusBadRequest, "issue_id is not an issue in this workspace")
			return
		}
	}
	owner, ok := h.workbenchOwnerForCreate(w, r, scope, req.OwnerMemberID)
	if !ok {
		return
	}
	if !agentOwnerGate(w, actor, req.OwnerMemberID) {
		return
	}
	assigneeType, assigneeID, ok := h.workbenchAssigneePatch(w, r, scope,
		pgtype.Text{}, pgtype.UUID{}, req.AssigneeType, req.AssigneeID)
	if !ok {
		return
	}
	assigneeType, assigneeID = initialAssignee(owner, req.AssigneeType, req.AssigneeID, assigneeType, assigneeID)

	confirmed, published, accepted := collabStageMilestones(stage, time.Now().UTC(), pgtype.Timestamptz{}, pgtype.Timestamptz{}, pgtype.Timestamptz{})

	// One transaction: the row and the audit event that says it exists
	// (COLLAB-MODEL §2 — a create with no trail is a row nobody can account for).
	tx, err := h.TxStarter.Begin(r.Context())
	if err != nil {
		workbenchInternalError(w, r, "failed to create collab", err)
		return
	}
	defer tx.Rollback(r.Context())
	qtx := h.Queries.WithTx(tx)

	collab, err := qtx.CreateCrmCollab(r.Context(), db.CreateCrmCollabParams{
		WorkspaceID:    scope.WorkspaceUUID,
		BriefID:        brief.ID,
		CreatorID:      creator.ID,
		Stage:          stage,
		QuoteAmount:    quoteAmount,
		FinalAmount:    finalAmount,
		Prob:           floatToNumeric(req.Prob),
		CreatorFee:     creatorFee,
		SampleCost:     sampleCost,
		PlatformFee:    platformFee,
		Currency:       currency,
		SettlementMode: optionalTrimmedText(req.SettlementMode),
		CommissionRate: floatToNumeric(req.CommissionRate),
		SampleRequired: boolValue(req.SampleRequired),
		ScriptRequired: boolValue(req.ScriptRequired),
		ScheduledAt:    scheduledAt,
		ConfirmedAt:    confirmed,
		PublishedAt:    published,
		AcceptedAt:     accepted,
		IssueID:        issueID,
		OwnerMemberID:  owner,
		CreatedBy:      scope.Member.UserID,
		PublishUrl:     publishURL,
		SettledOn:      settledOn,
		AssigneeType:   assigneeType,
		AssigneeID:     assigneeID,
		ReviewState:    reviewForWrite(actor, highValue, reviewDecision{}).State,
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to create collab", err)
		return
	}
	event, err := recordWorkbenchActivity(r.Context(), qtx, scope, subjectCrmCollab, collab.ID,
		subjectCrmCollab+".created", actor, actor.delegatedBy(scope), auditCreate,
		collabChanges(db.CrmCollab{}, collab))
	if err != nil {
		workbenchInternalError(w, r, "failed to record the collab's creation", err)
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		workbenchInternalError(w, r, "failed to create collab", err)
		return
	}
	h.publishCRMActor(eventCRMCollabChanged, scope.WorkspaceID, uuidToString(collab.ID), actor)
	writeJSON(w, http.StatusCreated, crmCollabToResponse(collab, lastActorFromActivity(event)))
}

// requireBriefInWorkspace validates a collaboration's required brief pointer.
func (h *Handler) requireBriefInWorkspace(w http.ResponseWriter, r *http.Request, scope workbenchScope, raw *string) (db.CrmBrief, bool) {
	briefID, ok := workbenchOptionalUUID(w, raw, "brief_id")
	if !ok {
		return db.CrmBrief{}, false
	}
	if !briefID.Valid {
		writeError(w, http.StatusBadRequest, "brief_id is required")
		return db.CrmBrief{}, false
	}
	brief, err := h.Queries.GetCrmBrief(r.Context(), db.GetCrmBriefParams{ID: briefID, WorkspaceID: scope.WorkspaceUUID})
	if err != nil {
		writeError(w, http.StatusBadRequest, "brief_id is not a brief in this workspace")
		return db.CrmBrief{}, false
	}
	return brief, true
}

// loadCrmCollabForWrite resolves {collabId} and checks the write gate.
func (h *Handler) loadCrmCollabForWrite(w http.ResponseWriter, r *http.Request, scope workbenchScope) (db.CrmCollab, bool) {
	id, ok := parseUUIDOrBadRequest(w, chi.URLParam(r, "collabId"), "collab id")
	if !ok {
		return db.CrmCollab{}, false
	}
	collab, err := h.Queries.GetCrmCollab(r.Context(), db.GetCrmCollabParams{ID: id, WorkspaceID: scope.WorkspaceUUID})
	if err != nil {
		writeError(w, http.StatusNotFound, "collab not found")
		return db.CrmCollab{}, false
	}
	if !workbenchCanWrite(scope.Member, collab.OwnerMemberID) {
		writeError(w, http.StatusForbidden, "you can only change collaborations you own")
		return db.CrmCollab{}, false
	}
	// §24.4 write half: with workbench_visibility=department, a row owned by
	// another department is not this member's to change.
	if !h.workbenchCrossDepartmentGate(w, r, scope, collab.OwnerMemberID) {
		return db.CrmCollab{}, false
	}
	return collab, true
}

// GetCrmCollab — GET /api/workbench/crm/collabs/{collabId}
func (h *Handler) GetCrmCollab(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	if !h.requireWorkbenchCapability(w, r, scope, capCRMRead) {
		return
	}
	id, ok := parseUUIDOrBadRequest(w, chi.URLParam(r, "collabId"), "collab id")
	if !ok {
		return
	}
	collab, err := h.Queries.GetCrmCollab(r.Context(), db.GetCrmCollabParams{ID: id, WorkspaceID: scope.WorkspaceUUID})
	if err != nil {
		writeError(w, http.StatusNotFound, "collab not found")
		return
	}
	// §24.4 read half: in department mode a by-id read of another department's
	// collaboration answers 403 instead of handing out the row the id names.
	if !h.workbenchCrossDepartmentGate(w, r, scope, collab.OwnerMemberID) {
		return
	}
	writeJSON(w, http.StatusOK, CrmCollabWithThread{
		CrmCollabResponse: crmCollabToResponse(collab,
			h.lastWorkbenchActor(r.Context(), scope, subjectCrmCollab, collab.ID)),
		Thread: h.workbenchThread(r.Context(), scope, collab.IssueID),
	})
}

// UpdateCrmCollab — PATCH /api/workbench/crm/collabs/{collabId}
//
// A stage change fills the milestones it just passed and emits the dedicated
// `crm_collab:stage_changed` event in addition to the generic one, because the
// board and the KPI strip react differently to "a card moved".
func (h *Handler) UpdateCrmCollab(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	if !h.requireWorkbenchCapability(w, r, scope, capCRMWrite) {
		return
	}
	current, ok := h.loadCrmCollabForWrite(w, r, scope)
	if !ok {
		return
	}
	var req CrmCollabRequest
	if !decodeWorkbenchBody(w, r, &req) {
		return
	}
	actor := h.workbenchActor(r, scope)
	// A PATCH can clear, so a `null` here counts as a write to the field.
	patch := true
	highValue, moneyFields := collabHighValue(req, patch)
	if !agentMoneyGate(w, actor, moneyFields) {
		return
	}
	// Money and settlement are their own capabilities (—4.1): "may edit a
	// collaboration" is not "may change what it pays". The check runs on the
	// fields the request actually touches, so a title rename stays crm.write.
	if patchTouches(req.QuoteAmount, patch) || patchTouches(req.FinalAmount, patch) || patchTouches(req.CreatorFee, patch) ||
		patchTouches(req.SampleCost, patch) || patchTouches(req.PlatformFee, patch) || req.CommissionRate != nil {
		if !h.requireWorkbenchCapability(w, r, scope, capCRMAmount) {
			return
		}
	}
	if req.Stage != nil && strings.TrimSpace(*req.Stage) == "settled" {
		if !h.requireWorkbenchCapability(w, r, scope, capCRMSettle) {
			return
		}
	}
	overwriteReason, ok := h.workbenchOverwriteReason(w, r, scope, actor, subjectCrmCollab, current.ID, req.OverwriteReason)
	if !ok {
		return
	}

	briefID := current.BriefID
	if req.BriefID != nil && strings.TrimSpace(*req.BriefID) != "" {
		brief, ok := h.requireBriefInWorkspace(w, r, scope, req.BriefID)
		if !ok {
			return
		}
		briefID = brief.ID
	}
	creatorID := current.CreatorID
	if req.CreatorID != nil && strings.TrimSpace(*req.CreatorID) != "" {
		creator, ok := h.requireCreatorInWorkspace(r.Context(), w, scope.WorkspaceID, req.CreatorID)
		if !ok {
			return
		}
		creatorID = creator.ID
	}
	stage := current.Stage
	if req.Stage != nil {
		stage = strings.TrimSpace(*req.Stage)
		if _, known := collabStageRank[stage]; !known {
			writeError(w, http.StatusBadRequest, "invalid stage")
			return
		}
	}
	if !workbenchProbability(w, req.Prob) {
		return
	}
	if !workbenchCommissionRate(w, req.CommissionRate) {
		return
	}
	currency := current.Currency
	if req.Currency != nil {
		parsed, ok := workbenchCurrency(w, req.Currency)
		if !ok {
			return
		}
		currency = parsed
	}
	if req.SettlementMode != nil {
		trimmed := strings.TrimSpace(*req.SettlementMode)
		if trimmed != "" && !crmSettlementModes[trimmed] {
			writeError(w, http.StatusBadRequest, "invalid settlement_mode")
			return
		}
	}
	scheduledAt, ok := applyTimestampPatch(req.ScheduledAt, w, "scheduled_at", current.ScheduledAt)
	if !ok {
		return
	}
	settledOn, ok := applyDateClearPatch(req.SettledOn, w, "settled_on", current.SettledOn)
	if !ok {
		return
	}
	confirmed, ok := applyTimestampPatch(req.ConfirmedAt, w, "confirmed_at", current.ConfirmedAt)
	if !ok {
		return
	}
	published, ok := applyTimestampPatch(req.PublishedAt, w, "published_at", current.PublishedAt)
	if !ok {
		return
	}
	accepted, ok := applyTimestampPatch(req.AcceptedAt, w, "accepted_at", current.AcceptedAt)
	if !ok {
		return
	}
	// §3.4: the two amounts, the fulfilment link, the settlement day and the three
	// costs are the fields a PATCH can clear, so they resolve through the tri-state
	// helpers.
	publishURL, ok := applyTextClearPatch(req.PublishURL, w, "publish_url", current.PublishUrl)
	if !ok {
		return
	}
	quoteAmount, ok := applyNumericClearPatch(req.QuoteAmount, w, "quote_amount", current.QuoteAmount)
	if !ok {
		return
	}
	finalAmount, ok := applyNumericClearPatch(req.FinalAmount, w, "final_amount", current.FinalAmount)
	if !ok {
		return
	}
	creatorFee, ok := applyNumericClearPatch(req.CreatorFee, w, "creator_fee", current.CreatorFee)
	if !ok {
		return
	}
	sampleCost, ok := applyNumericClearPatch(req.SampleCost, w, "sample_cost", current.SampleCost)
	if !ok {
		return
	}
	platformFee, ok := applyNumericClearPatch(req.PlatformFee, w, "platform_fee", current.PlatformFee)
	if !ok {
		return
	}
	// Milestones are stamped only when the stage actually moves: re-sending the
	// same stage must not backfill a timestamp the history never recorded, which
	// would move the month KPIs of a row nobody transitioned.
	if stage != current.Stage {
		confirmed, published, accepted = collabStageMilestones(stage, time.Now().UTC(), confirmed, published, accepted)
	}

	issueID := current.IssueID
	if req.IssueID != nil {
		parsed, ok := workbenchOptionalUUID(w, req.IssueID, "issue_id")
		if !ok {
			return
		}
		if parsed.Valid {
			if _, err := h.Queries.GetIssueInWorkspace(r.Context(), db.GetIssueInWorkspaceParams{
				ID: parsed, WorkspaceID: scope.WorkspaceUUID,
			}); err != nil {
				writeError(w, http.StatusBadRequest, "issue_id is not an issue in this workspace")
				return
			}
		}
		issueID = parsed
	}
	requestedOwner, ok := workbenchOptionalUUID(w, req.OwnerMemberID, "owner_member_id")
	if !ok {
		return
	}
	if !agentOwnerGate(w, actor, req.OwnerMemberID) {
		return
	}
	owner, ok := h.workbenchOwnerForUpdate(w, r, scope, current.OwnerMemberID, requestedOwner)
	if !ok {
		return
	}
	assigneeType, assigneeID, ok := h.workbenchAssigneePatch(w, r, scope,
		current.AssigneeType, current.AssigneeID, req.AssigneeType, req.AssigneeID)
	if !ok {
		return
	}
	expectedRevision, ok := workbenchExpectedRevision(w, req.ExpectedRevision)
	if !ok {
		return
	}

	// The write's review verdict (§26.1): an agent's edit or a human's high-value
	// edit goes back to the queue; anything else keeps the row's decision (and the
	// reviewer's name) as it was.
	decision := reviewForWrite(actor, highValue,
		currentReview(current.ReviewState, current.ReviewedBy, current.ReviewedAt))

	// One transaction, three statements: the write, the guarded revision check
	// inside it, and the audit row that says what moved (COLLAB-MODEL §2/§3).
	// A mismatch is zero rows rather than an error, which the branch below turns
	// into a 409 carrying the row the writer did not see.
	tx, err := h.TxStarter.Begin(r.Context())
	if err != nil {
		workbenchInternalError(w, r, "failed to update collab", err)
		return
	}
	defer tx.Rollback(r.Context())
	qtx := h.Queries.WithTx(tx)

	updated, err := qtx.UpdateCrmCollab(r.Context(), db.UpdateCrmCollabParams{
		ID:               current.ID,
		WorkspaceID:      scope.WorkspaceUUID,
		BriefID:          briefID,
		CreatorID:        creatorID,
		Stage:            stage,
		QuoteAmount:      quoteAmount,
		FinalAmount:      finalAmount,
		Prob:             applyNumericPatch(req.Prob, current.Prob),
		CreatorFee:       creatorFee,
		SampleCost:       sampleCost,
		PlatformFee:      platformFee,
		Currency:         currency,
		SettlementMode:   applyTextPatch(req.SettlementMode, current.SettlementMode),
		CommissionRate:   applyNumericPatch(req.CommissionRate, current.CommissionRate),
		SampleRequired:   applyBoolPatch(req.SampleRequired, current.SampleRequired),
		ScriptRequired:   applyBoolPatch(req.ScriptRequired, current.ScriptRequired),
		ScheduledAt:      scheduledAt,
		ConfirmedAt:      confirmed,
		PublishedAt:      published,
		AcceptedAt:       accepted,
		IssueID:          issueID,
		OwnerMemberID:    owner,
		PublishUrl:       publishURL,
		SettledOn:        settledOn,
		AssigneeType:     assigneeType,
		AssigneeID:       assigneeID,
		ReviewState:      decision.State,
		ReviewedBy:       decision.ReviewedBy,
		ReviewedAt:       decision.ReviewedAt,
		ExpectedRevision: expectedRevision,
	})
	if err != nil {
		if !errors.Is(err, pgx.ErrNoRows) {
			workbenchInternalError(w, r, "failed to update collab", err)
			return
		}
		// No row: either the revision moved under this writer or the row is gone.
		// The transaction is aborted, so roll it back before reading again.
		_ = tx.Rollback(r.Context())
		survivor, readErr := h.Queries.GetCrmCollab(r.Context(), db.GetCrmCollabParams{
			ID: current.ID, WorkspaceID: scope.WorkspaceUUID,
		})
		if readErr != nil {
			writeError(w, http.StatusNotFound, "collab not found")
			return
		}
		writeStaleWrite(w, crmCollabToResponse(survivor,
			h.lastWorkbenchActor(r.Context(), scope, subjectCrmCollab, survivor.ID)))
		return
	}

	fields := collabChanges(current, updated)
	var last *WorkbenchLastActor
	if len(fields) > 0 {
		event, err := recordWorkbenchActivityExtras(r.Context(), qtx, scope, subjectCrmCollab, updated.ID,
			collabAction(fields), actor, actor.delegatedBy(scope), auditUpdate, fields,
			auditExtras{OverwriteReason: overwriteReason})
		if err != nil {
			workbenchInternalError(w, r, "failed to record the collab's change", err)
			return
		}
		last = lastActorFromActivity(event)
	}
	if err := tx.Commit(r.Context()); err != nil {
		workbenchInternalError(w, r, "failed to update collab", err)
		return
	}

	if updated.Stage != current.Stage {
		h.publish(eventCRMCollabStageChange, scope.WorkspaceID, actor.Type, actor.idString(), map[string]any{
			"id":   uuidToString(updated.ID),
			"from": current.Stage,
			"to":   updated.Stage,
		})
	}
	h.publishCRMActor(eventCRMCollabChanged, scope.WorkspaceID, uuidToString(updated.ID), actor)
	writeJSON(w, http.StatusOK, crmCollabToResponse(updated, last))
}

// DeleteCrmCollab — DELETE /api/workbench/crm/collabs/{collabId} (soft delete)
//
// Archiving a collaboration archives the settlements that name it, in the same
// transaction (—0.1). The alternative — archive the collab and leave its money — // produced two lies at once: `orders.paid_amount` and the receivable list kept
// counting settlements whose collaboration had left every screen, and the UI had to
// hide the delete affordance entirely because one click manufactured orphans. A
// collaboration is the vertex of that pair, so deleting it takes its money with it.
//
// Paid settlements are archived too, deliberately: `paid_at` records that money moved
// once, and archiving the row does not un-pay it — the row leaves the ledgers like
// every other workbench delete. Refusing with a 409 while anything has cleared was
// rejected because it makes a mis-created collaboration permanent: the operator's only
// repair would be editing rows the API does not let them edit. A reader who needs the
// money to stay visible should not delete the collaboration.
//
// A delete is a §3 write like any PATCH: `?expected_revision=` names the revision
// the caller read, a mismatch answers 409 `stale_write` with the current row, and
// no parameter means no check (old clients). The guard lives in the archive's
// WHERE rather than in the read above it, so two connections that both read the
// same revision cannot both archive the row and both write their own `.deleted`
// audit line.
func (h *Handler) DeleteCrmCollab(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	if !h.requireWorkbenchCapability(w, r, scope, capCRMWrite) {
		return
	}
	current, ok := h.loadCrmCollabForWrite(w, r, scope)
	if !ok {
		return
	}
	actor := h.workbenchActor(r, scope)
	if !agentDeleteGate(w, actor) {
		return
	}
	expectedRevision, ok := workbenchQueryExpectedRevision(w, r)
	if !ok {
		return
	}

	// One transaction: a collab archived without its settlements (or the reverse)
	// is exactly the orphan this endpoint exists to avoid. The audit rows ride in
	// the same transaction — the collab's own, and one per settlement it took with
	// it, because those rows left the ledger too (COLLAB-MODEL §2).
	tx, err := h.TxStarter.Begin(r.Context())
	if err != nil {
		workbenchInternalError(w, r, "failed to delete collab", err)
		return
	}
	defer tx.Rollback(r.Context())
	qtx := h.Queries.WithTx(tx)

	deleted, err := qtx.ArchiveCrmCollab(r.Context(), db.ArchiveCrmCollabParams{
		ID:               current.ID,
		WorkspaceID:      scope.WorkspaceUUID,
		ExpectedRevision: expectedRevision,
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to delete collab", err)
		return
	}
	if deleted == 0 {
		// The guard missed, and the two reasons answer differently (§3): the row
		// moved past the revision this client read — 409 with the current row, the
		// same shape a PATCH sends — or it is already archived, in which case there
		// is no current row to hand back and the delete is simply of something that
		// is not there: 404. Reading after a rollback, because the failed statement
		// aborted the transaction.
		_ = tx.Rollback(r.Context())
		survivor, readErr := h.Queries.GetCrmCollab(r.Context(), db.GetCrmCollabParams{
			ID: current.ID, WorkspaceID: scope.WorkspaceUUID,
		})
		if readErr != nil {
			writeError(w, http.StatusNotFound, "collab not found")
			return
		}
		if expectedRevision.Valid && survivor.Revision != expectedRevision.Int32 {
			writeStaleWrite(w, crmCollabToResponse(survivor,
				h.lastWorkbenchActor(r.Context(), scope, subjectCrmCollab, survivor.ID)))
			return
		}
		writeError(w, http.StatusNotFound, "collab not found")
		return
	}
	if _, err := recordWorkbenchActivity(r.Context(), qtx, scope, subjectCrmCollab, current.ID,
		subjectCrmCollab+".deleted", actor, actor.delegatedBy(scope), auditDelete,
		collabChanges(current, db.CrmCollab{})); err != nil {
		workbenchInternalError(w, r, "failed to record the collab's deletion", err)
		return
	}
	// The settlements the delete takes with it, read *before* they are archived:
	// their audit line records what the money was, and a row that is already
	// archived is readable through no query that filters archived rows.
	doomed, err := qtx.ListCrmSettlements(r.Context(), db.ListCrmSettlementsParams{
		WorkspaceID: scope.WorkspaceUUID,
		CollabID:    current.ID,
		Limit:       workbenchAuditCascadeLimit,
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to read the collab's settlements", err)
		return
	}
	settlementIDs, err := qtx.ArchiveCrmSettlementsByCollab(r.Context(), db.ArchiveCrmSettlementsByCollabParams{
		WorkspaceID: scope.WorkspaceUUID,
		CollabID:    current.ID,
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to delete the collab's settlements", err)
		return
	}
	before := make(map[string]db.CrmSettlement, len(doomed))
	for _, row := range doomed {
		before[uuidToString(row.ID)] = row
	}
	for _, settlementID := range settlementIDs {
		key := uuidToString(settlementID)
		settlement := before[key]
		if settlement.ID == (pgtype.UUID{}) {
			// Beyond the cascade window: the delete still happened, so the trail
			// names the row without inventing values it did not read.
			settlement = db.CrmSettlement{ID: settlementID}
		}
		if _, err := recordWorkbenchActivity(r.Context(), qtx, scope, subjectCrmSettlement, settlementID,
			subjectCrmSettlement+".deleted", actor, actor.delegatedBy(scope), auditDelete,
			settlementChanges(settlement, db.CrmSettlement{})); err != nil {
			workbenchInternalError(w, r, "failed to record the settlement's deletion", err)
			return
		}
	}
	if err := tx.Commit(r.Context()); err != nil {
		workbenchInternalError(w, r, "failed to delete collab", err)
		return
	}

	h.publishCRMActor(eventCRMCollabChanged, scope.WorkspaceID, uuidToString(current.ID), actor)
	// One event per archived settlement: another client's settlement list and the
	// cockpit's `paid_amount` both read these rows, and a collab-only event would
	// leave them showing money whose collaboration no longer exists.
	for _, settlementID := range settlementIDs {
		h.publishCRMActor(eventCRMSettlementChanged, scope.WorkspaceID, uuidToString(settlementID), actor)
	}
	w.WriteHeader(http.StatusNoContent)
}

// ---- settlements -----------------------------------------------------------

// ListCrmSettlements — GET /api/workbench/crm/settlements
func (h *Handler) ListCrmSettlements(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	if !h.requireWorkbenchCapability(w, r, scope, capCRMRead) {
		return
	}
	collabID, ok := workbenchOptionalUUID(w, stringPtr(strings.TrimSpace(r.URL.Query().Get("collab_id"))), "collab_id")
	if !ok {
		return
	}
	paid := pgtype.Bool{}
	if raw := strings.TrimSpace(r.URL.Query().Get("paid")); raw != "" {
		switch raw {
		case "true":
			paid = pgtype.Bool{Bool: true, Valid: true}
		case "false":
			paid = pgtype.Bool{Bool: false, Valid: true}
		default:
			writeError(w, http.StatusBadRequest, "paid must be true or false")
			return
		}
	}
	cursorAt, cursorID, ok := h.workbenchCursorKey(w, r, func(id pgtype.UUID) (pgtype.Timestamptz, error) {
		row, err := h.Queries.GetCrmSettlement(r.Context(), db.GetCrmSettlementParams{ID: id, WorkspaceID: scope.WorkspaceUUID})
		return row.CreatedAt, err
	})
	if !ok {
		return
	}
	assigneeType, assigneeID, ok := h.workbenchAssigneeFilter(w, r, scope)
	if !ok {
		return
	}
	reviewState, ok := workbenchReviewStateFilter(w, r)
	if !ok {
		return
	}
	// A settlement has no owner of its own — its owner is the collaboration's — so the
	// predicate narrows through `collab_id` (§24.4/§24.6).
	departmentID, departmentScoped, visible := h.bdDepartmentFilter(r, scope)
	if !visible {
		writeWorkbenchEmptyPage(w, "settlements")
		return
	}
	rows, err := h.Queries.ListCrmSettlements(r.Context(), db.ListCrmSettlementsParams{
		WorkspaceID:      scope.WorkspaceUUID,
		CollabID:         collabID,
		Paid:             paid,
		AssigneeType:     assigneeType,
		AssigneeID:       assigneeID,
		ReviewState:      reviewState,
		DepartmentScoped: departmentScoped,
		DepartmentID:     departmentID,
		CursorAt:         cursorAt,
		CursorID:         cursorID,
		Limit:            workbenchLimit(r),
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to list settlements", err)
		return
	}
	resp := make([]CrmSettlementResponse, len(rows))
	actors := h.lastWorkbenchActors(r.Context(), scope, subjectCrmSettlement,
		subjectIDs(rows, func(row db.CrmSettlement) pgtype.UUID { return row.ID }))
	for i, row := range rows {
		resp[i] = crmSettlementToResponse(row, actors[uuidToString(row.ID)])
	}
	writeJSON(w, http.StatusOK, workbenchPage(
		map[string]any{"settlements": resp, "total": len(resp)},
		rows, workbenchLimit(r), func(row db.CrmSettlement) pgtype.UUID { return row.ID },
	))
}

// loadCollabForSettlementWrite resolves the collaboration a settlement belongs
// to and checks the write gate against that collaboration's owner.
func (h *Handler) loadCollabForSettlementWrite(w http.ResponseWriter, r *http.Request, scope workbenchScope, collabID pgtype.UUID) (db.CrmCollab, bool) {
	collab, err := h.Queries.GetCrmCollab(r.Context(), db.GetCrmCollabParams{
		ID:          collabID,
		WorkspaceID: scope.WorkspaceUUID,
	})
	if err != nil {
		writeError(w, http.StatusBadRequest, "collab_id is not a collaboration in this workspace")
		return db.CrmCollab{}, false
	}
	if !workbenchCanWrite(scope.Member, collab.OwnerMemberID) {
		writeError(w, http.StatusForbidden, "you can only change settlements of collaborations you own")
		return db.CrmCollab{}, false
	}
	return collab, true
}

// CreateCrmSettlement — POST /api/workbench/crm/settlements
func (h *Handler) CreateCrmSettlement(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	if !h.requireWorkbenchCapability(w, r, scope, capCRMWrite) {
		return
	}
	// Settlement money is its own capability (—4.1): recording or withdrawing a
	// payment is not covered by "may edit the collaboration".
	if !h.requireWorkbenchCapability(w, r, scope, capCRMSettle) {
		return
	}
	var req CrmSettlementRequest
	if !decodeWorkbenchBody(w, r, &req) {
		return
	}
	actor := h.workbenchActor(r, scope)
	// A create cannot clear anything, so an explicit `null` here is just "no value".
	highValue, moneyFields := settlementHighValue(req, false)
	if !agentMoneyGate(w, actor, moneyFields) {
		return
	}
	collabID, ok := workbenchOptionalUUID(w, req.CollabID, "collab_id")
	if !ok {
		return
	}
	if !collabID.Valid {
		writeError(w, http.StatusBadRequest, "collab_id is required")
		return
	}
	collab, ok := h.loadCollabForSettlementWrite(w, r, scope, collabID)
	if !ok {
		return
	}
	kind := strings.TrimSpace(valueOrEmpty(req.Kind))
	if !crmSettlementKinds[kind] {
		writeError(w, http.StatusBadRequest, "invalid kind")
		return
	}
	if req.Amount == nil {
		writeError(w, http.StatusBadRequest, "amount is required")
		return
	}
	if !workbenchAmountFits(req.Amount) {
		writeError(w, http.StatusBadRequest, "amount "+workbenchAmountMessage)
		return
	}
	currency, ok := workbenchCurrency(w, req.Currency)
	if !ok {
		return
	}
	dueAt, ok := workbenchDateValue(w, req.DueAt, "due_at")
	if !ok {
		return
	}
	paidAt, ok := applyDateClearPatch(req.PaidAt, w, "paid_at", pgtype.Date{})
	if !ok {
		return
	}
	invoiceNo, ok := applyTextClearPatch(req.InvoiceNo, w, "invoice_no", pgtype.Text{})
	if !ok {
		return
	}
	note, ok := applyTextClearPatch(req.Note, w, "note", pgtype.Text{})
	if !ok {
		return
	}
	assigneeType, assigneeID, ok := h.workbenchAssigneePatch(w, r, scope,
		pgtype.Text{}, pgtype.UUID{}, req.AssigneeType, req.AssigneeID)
	if !ok {
		return
	}
	// A settlement has no owner column of its own (§20.1): it starts assigned to
	// the collaboration's owner, the same rule 821 backfilled the other three
	// ledgers with.
	assigneeType, assigneeID = initialAssignee(collab.OwnerMemberID, req.AssigneeType, req.AssigneeID, assigneeType, assigneeID)

	tx, err := h.TxStarter.Begin(r.Context())
	if err != nil {
		workbenchInternalError(w, r, "failed to create settlement", err)
		return
	}
	defer tx.Rollback(r.Context())
	qtx := h.Queries.WithTx(tx)

	settlement, err := qtx.CreateCrmSettlement(r.Context(), db.CreateCrmSettlementParams{
		WorkspaceID:  scope.WorkspaceUUID,
		CollabID:     collabID,
		Kind:         kind,
		Amount:       floatToNumeric(req.Amount),
		Currency:     currency,
		DueAt:        dueAt,
		PaidAt:       paidAt,
		InvoiceNo:    invoiceNo,
		Note:         note,
		CreatedBy:    scope.Member.UserID,
		AssigneeType: assigneeType,
		AssigneeID:   assigneeID,
		ReviewState:  reviewForWrite(actor, highValue, reviewDecision{}).State,
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to create settlement", err)
		return
	}
	event, err := recordWorkbenchActivity(r.Context(), qtx, scope, subjectCrmSettlement, settlement.ID,
		subjectCrmSettlement+".created", actor, actor.delegatedBy(scope), auditCreate,
		settlementChanges(db.CrmSettlement{}, settlement))
	if err != nil {
		workbenchInternalError(w, r, "failed to record the settlement's creation", err)
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		workbenchInternalError(w, r, "failed to create settlement", err)
		return
	}
	h.publishCRMActor(eventCRMSettlementChanged, scope.WorkspaceID, uuidToString(settlement.ID), actor)
	writeJSON(w, http.StatusCreated, crmSettlementToResponse(settlement, lastActorFromActivity(event)))
}

// loadCrmSettlementForWrite resolves {settlementId} and checks the write gate
// through its collaboration.
func (h *Handler) loadCrmSettlementForWrite(w http.ResponseWriter, r *http.Request, scope workbenchScope) (db.CrmSettlement, bool) {
	id, ok := parseUUIDOrBadRequest(w, chi.URLParam(r, "settlementId"), "settlement id")
	if !ok {
		return db.CrmSettlement{}, false
	}
	settlement, err := h.Queries.GetCrmSettlement(r.Context(), db.GetCrmSettlementParams{
		ID:          id,
		WorkspaceID: scope.WorkspaceUUID,
	})
	if err != nil {
		writeError(w, http.StatusNotFound, "settlement not found")
		return db.CrmSettlement{}, false
	}
	if _, ok := h.loadCollabForSettlementWrite(w, r, scope, settlement.CollabID); !ok {
		return db.CrmSettlement{}, false
	}
	return settlement, true
}

// UpdateCrmSettlement — PATCH /api/workbench/crm/settlements/{settlementId}
func (h *Handler) UpdateCrmSettlement(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	if !h.requireWorkbenchCapability(w, r, scope, capCRMWrite) {
		return
	}
	// Settlement money is its own capability (—4.1): recording or withdrawing a
	// payment is not covered by "may edit the collaboration".
	if !h.requireWorkbenchCapability(w, r, scope, capCRMSettle) {
		return
	}
	current, ok := h.loadCrmSettlementForWrite(w, r, scope)
	if !ok {
		return
	}
	var req CrmSettlementRequest
	if !decodeWorkbenchBody(w, r, &req) {
		return
	}
	actor := h.workbenchActor(r, scope)
	// A PATCH can clear, so a `null` paid_at counts as a write to the money field.
	highValue, moneyFields := settlementHighValue(req, true)
	if !agentMoneyGate(w, actor, moneyFields) {
		return
	}
	overwriteReason, ok := h.workbenchOverwriteReason(w, r, scope, actor, subjectCrmSettlement, current.ID, req.OverwriteReason)
	if !ok {
		return
	}

	collabID := current.CollabID
	if req.CollabID != nil {
		parsed, ok := workbenchOptionalUUID(w, req.CollabID, "collab_id")
		if !ok {
			return
		}
		if !parsed.Valid {
			writeError(w, http.StatusBadRequest, "collab_id is required")
			return
		}
		if _, ok := h.loadCollabForSettlementWrite(w, r, scope, parsed); !ok {
			return
		}
		collabID = parsed
	}
	kind := current.Kind
	if req.Kind != nil {
		kind = strings.TrimSpace(*req.Kind)
		if !crmSettlementKinds[kind] {
			writeError(w, http.StatusBadRequest, "invalid kind")
			return
		}
	}
	currency := current.Currency
	if req.Currency != nil {
		parsed, ok := workbenchCurrency(w, req.Currency)
		if !ok {
			return
		}
		currency = parsed
	}
	dueAt, ok := applyDatePatch(req.DueAt, w, "due_at", current.DueAt)
	if !ok {
		return
	}
	paidAt, ok := applyDateClearPatch(req.PaidAt, w, "paid_at", current.PaidAt)
	if !ok {
		return
	}
	amount, ok := workbenchMoneyPatch(w, req.Amount, "amount", current.Amount)
	if !ok {
		return
	}
	invoiceNo, ok := applyTextClearPatch(req.InvoiceNo, w, "invoice_no", current.InvoiceNo)
	if !ok {
		return
	}
	note, ok := applyTextClearPatch(req.Note, w, "note", current.Note)
	if !ok {
		return
	}
	assigneeType, assigneeID, ok := h.workbenchAssigneePatch(w, r, scope,
		current.AssigneeType, current.AssigneeID, req.AssigneeType, req.AssigneeID)
	if !ok {
		return
	}
	expectedRevision, ok := workbenchExpectedRevision(w, req.ExpectedRevision)
	if !ok {
		return
	}
	decision := reviewForWrite(actor, highValue,
		currentReview(current.ReviewState, current.ReviewedBy, current.ReviewedAt))

	tx, err := h.TxStarter.Begin(r.Context())
	if err != nil {
		workbenchInternalError(w, r, "failed to update settlement", err)
		return
	}
	defer tx.Rollback(r.Context())
	qtx := h.Queries.WithTx(tx)

	updated, err := qtx.UpdateCrmSettlement(r.Context(), db.UpdateCrmSettlementParams{
		ID:               current.ID,
		WorkspaceID:      scope.WorkspaceUUID,
		CollabID:         collabID,
		Kind:             kind,
		Amount:           amount,
		Currency:         currency,
		DueAt:            dueAt,
		PaidAt:           paidAt,
		InvoiceNo:        invoiceNo,
		Note:             note,
		AssigneeType:     assigneeType,
		AssigneeID:       assigneeID,
		ReviewState:      decision.State,
		ReviewedBy:       decision.ReviewedBy,
		ReviewedAt:       decision.ReviewedAt,
		ExpectedRevision: expectedRevision,
	})
	if err != nil {
		if !errors.Is(err, pgx.ErrNoRows) {
			workbenchInternalError(w, r, "failed to update settlement", err)
			return
		}
		_ = tx.Rollback(r.Context())
		survivor, readErr := h.Queries.GetCrmSettlement(r.Context(), db.GetCrmSettlementParams{
			ID: current.ID, WorkspaceID: scope.WorkspaceUUID,
		})
		if readErr != nil {
			writeError(w, http.StatusNotFound, "settlement not found")
			return
		}
		writeStaleWrite(w, crmSettlementToResponse(survivor,
			h.lastWorkbenchActor(r.Context(), scope, subjectCrmSettlement, survivor.ID)))
		return
	}
	fields := settlementChanges(current, updated)
	var last *WorkbenchLastActor
	if len(fields) > 0 {
		event, err := recordWorkbenchActivityExtras(r.Context(), qtx, scope, subjectCrmSettlement, updated.ID,
			settlementAction(fields), actor, actor.delegatedBy(scope), auditUpdate, fields,
			auditExtras{OverwriteReason: overwriteReason})
		if err != nil {
			workbenchInternalError(w, r, "failed to record the settlement's change", err)
			return
		}
		last = lastActorFromActivity(event)
	}
	if err := tx.Commit(r.Context()); err != nil {
		workbenchInternalError(w, r, "failed to update settlement", err)
		return
	}
	h.publishCRMActor(eventCRMSettlementChanged, scope.WorkspaceID, uuidToString(updated.ID), actor)
	writeJSON(w, http.StatusOK, crmSettlementToResponse(updated, last))
}

// DeleteCrmSettlement — DELETE /api/workbench/crm/settlements/{settlementId}
func (h *Handler) DeleteCrmSettlement(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	if !h.requireWorkbenchCapability(w, r, scope, capCRMWrite) {
		return
	}
	// Settlement money is its own capability (—4.1): recording or withdrawing a
	// payment is not covered by "may edit the collaboration".
	if !h.requireWorkbenchCapability(w, r, scope, capCRMSettle) {
		return
	}
	current, ok := h.loadCrmSettlementForWrite(w, r, scope)
	if !ok {
		return
	}
	actor := h.workbenchActor(r, scope)
	if !agentDeleteGate(w, actor) {
		return
	}

	tx, err := h.TxStarter.Begin(r.Context())
	if err != nil {
		workbenchInternalError(w, r, "failed to delete settlement", err)
		return
	}
	defer tx.Rollback(r.Context())
	qtx := h.Queries.WithTx(tx)

	deleted, err := qtx.ArchiveCrmSettlement(r.Context(), db.ArchiveCrmSettlementParams{
		ID:          current.ID,
		WorkspaceID: scope.WorkspaceUUID,
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to delete settlement", err)
		return
	}
	if deleted == 0 {
		writeError(w, http.StatusNotFound, "settlement not found")
		return
	}
	if _, err := recordWorkbenchActivity(r.Context(), qtx, scope, subjectCrmSettlement, current.ID,
		subjectCrmSettlement+".deleted", actor, actor.delegatedBy(scope), auditDelete,
		settlementChanges(current, db.CrmSettlement{})); err != nil {
		workbenchInternalError(w, r, "failed to record the settlement's deletion", err)
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		workbenchInternalError(w, r, "failed to delete settlement", err)
		return
	}
	h.publishCRMActor(eventCRMSettlementChanged, scope.WorkspaceID, uuidToString(current.ID), actor)
	w.WriteHeader(http.StatusNoContent)
}
