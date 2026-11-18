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
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
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
type CrmCollabRequest struct {
	BriefID        *string  `json:"brief_id"`
	CreatorID      *string  `json:"creator_id"`
	Stage          *string  `json:"stage"`
	QuoteAmount    *float64 `json:"quote_amount"`
	FinalAmount    *float64 `json:"final_amount"`
	Prob           *float64 `json:"prob"`
	CreatorFee     *float64 `json:"creator_fee"`
	SampleCost     *float64 `json:"sample_cost"`
	PlatformFee    *float64 `json:"platform_fee"`
	Currency       *string  `json:"currency"`
	SettlementMode *string  `json:"settlement_mode"`
	CommissionRate *float64 `json:"commission_rate"`
	SampleRequired *bool    `json:"sample_required"`
	ScriptRequired *bool    `json:"script_required"`
	ScheduledAt    *string  `json:"scheduled_at"`
	ConfirmedAt    *string  `json:"confirmed_at"`
	PublishedAt    *string  `json:"published_at"`
	AcceptedAt     *string  `json:"accepted_at"`
	IssueID        *string  `json:"issue_id"`
	OwnerMemberID  *string  `json:"owner_member_id"`
	// Fulfilment (WORKBENCH-API §20.2, migration 810): where the collaboration
	// went live, and the day it was settled. Both are plain optional fields —
	// sending `""` clears them, omitting them keeps the stored value.
	PublishURL *string `json:"publish_url"`
	SettledOn  *string `json:"settled_on"`
}

// CrmSettlementRequest is the create/PATCH body for one settlement row
// (结算流水).
type CrmSettlementRequest struct {
	CollabID  *string  `json:"collab_id"`
	Kind      *string  `json:"kind"`
	Amount    *float64 `json:"amount"`
	Currency  *string  `json:"currency"`
	DueAt     *string  `json:"due_at"`
	PaidAt    *string  `json:"paid_at"`
	InvoiceNo *string  `json:"invoice_no"`
	Note      *string  `json:"note"`
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
		Query:       strToText(strings.TrimSpace(r.URL.Query().Get("q"))),
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
	writeJSON(w, http.StatusOK, map[string]any{"clients": resp, "total": len(resp)})
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
	writeJSON(w, http.StatusOK, map[string]any{"briefs": resp, "total": len(resp)})
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

	brief, err := h.Queries.CreateCrmBrief(r.Context(), db.CreateCrmBriefParams{
		WorkspaceID:     scope.WorkspaceUUID,
		ClientID:        clientID,
		Title:           title,
		Category:        optionalTrimmedText(req.Category),
		BudgetMinAmount: floatToNumeric(req.BudgetMinAmount),
		BudgetMaxAmount: floatToNumeric(req.BudgetMaxAmount),
		TargetAudience:  optionalTrimmedText(req.TargetAudience),
		DeliverableType: optionalTrimmedText(req.DeliverableType),
		Platforms:       platforms,
		ScheduleFrom:    scheduleFrom,
		ScheduleTo:      scheduleTo,
		KpiPlay:         int8Value(req.KPIPlay),
		KpiGmvAmount:    floatToNumeric(req.KPIGMVAmount),
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

	updated, err := h.Queries.UpdateCrmBrief(r.Context(), db.UpdateCrmBriefParams{
		ID:              current.ID,
		WorkspaceID:     scope.WorkspaceUUID,
		ClientID:        clientID,
		Title:           title,
		Category:        applyTextPatch(req.Category, current.Category),
		BudgetMinAmount: applyNumericPatch(req.BudgetMinAmount, current.BudgetMinAmount),
		BudgetMaxAmount: applyNumericPatch(req.BudgetMaxAmount, current.BudgetMaxAmount),
		TargetAudience:  applyTextPatch(req.TargetAudience, current.TargetAudience),
		DeliverableType: deliverable,
		Platforms:       platforms,
		ScheduleFrom:    scheduleFrom,
		ScheduleTo:      scheduleTo,
		KpiPlay:         applyInt8Patch(req.KPIPlay, current.KpiPlay),
		KpiGmvAmount:    applyNumericPatch(req.KPIGMVAmount, current.KpiGmvAmount),
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
	rows, err := h.Queries.ListCrmCollabs(r.Context(), db.ListCrmCollabsParams{
		WorkspaceID: scope.WorkspaceUUID,
		Stage:       strToText(stage),
		BriefID:     briefID,
		CreatorID:   creatorID,
		CursorAt:    cursorAt,
		CursorID:    cursorID,
		Limit:       workbenchLimit(r),
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to list collabs", err)
		return
	}
	resp := make([]CrmCollabResponse, len(rows))
	for i, row := range rows {
		resp[i] = crmCollabToResponse(row)
	}
	writeJSON(w, http.StatusOK, map[string]any{"collabs": resp, "total": len(resp)})
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
	// Money and settlement are their own capabilities (搂24.1): "may edit a
	// collaboration" is not "may change what it pays". The check runs on the
	// fields the request actually touches, so a title rename stays crm.write.
	if req.QuoteAmount != nil || req.FinalAmount != nil || req.CreatorFee != nil ||
		req.SampleCost != nil || req.PlatformFee != nil || req.CommissionRate != nil {
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
	settledOn, ok := workbenchDateValue(w, req.SettledOn, "settled_on")
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

	confirmed, published, accepted := collabStageMilestones(stage, time.Now().UTC(), pgtype.Timestamptz{}, pgtype.Timestamptz{}, pgtype.Timestamptz{})

	collab, err := h.Queries.CreateCrmCollab(r.Context(), db.CreateCrmCollabParams{
		WorkspaceID:    scope.WorkspaceUUID,
		BriefID:        brief.ID,
		CreatorID:      creator.ID,
		Stage:          stage,
		QuoteAmount:    floatToNumeric(req.QuoteAmount),
		FinalAmount:    floatToNumeric(req.FinalAmount),
		Prob:           floatToNumeric(req.Prob),
		CreatorFee:     floatToNumeric(req.CreatorFee),
		SampleCost:     floatToNumeric(req.SampleCost),
		PlatformFee:    floatToNumeric(req.PlatformFee),
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
		PublishUrl:     optionalTrimmedText(req.PublishURL),
		SettledOn:      settledOn,
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to create collab", err)
		return
	}
	h.publishCRMChanged(eventCRMCollabChanged, scope.WorkspaceID, uuidToString(collab.ID), uuidToString(scope.Member.UserID))
	writeJSON(w, http.StatusCreated, crmCollabToResponse(collab))
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
	writeJSON(w, http.StatusOK, crmCollabToResponse(collab))
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
	// Money and settlement are their own capabilities (搂24.1): "may edit a
	// collaboration" is not "may change what it pays". The check runs on the
	// fields the request actually touches, so a title rename stays crm.write.
	if req.QuoteAmount != nil || req.FinalAmount != nil || req.CreatorFee != nil ||
		req.SampleCost != nil || req.PlatformFee != nil || req.CommissionRate != nil {
		if !h.requireWorkbenchCapability(w, r, scope, capCRMAmount) {
			return
		}
	}
	if req.Stage != nil && strings.TrimSpace(*req.Stage) == "settled" {
		if !h.requireWorkbenchCapability(w, r, scope, capCRMSettle) {
			return
		}
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
	settledOn, ok := applyDatePatch(req.SettledOn, w, "settled_on", current.SettledOn)
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
	owner, ok := h.workbenchOwnerForUpdate(w, r, scope, current.OwnerMemberID, requestedOwner)
	if !ok {
		return
	}

	updated, err := h.Queries.UpdateCrmCollab(r.Context(), db.UpdateCrmCollabParams{
		ID:             current.ID,
		WorkspaceID:    scope.WorkspaceUUID,
		BriefID:        briefID,
		CreatorID:      creatorID,
		Stage:          stage,
		QuoteAmount:    applyNumericPatch(req.QuoteAmount, current.QuoteAmount),
		FinalAmount:    applyNumericPatch(req.FinalAmount, current.FinalAmount),
		Prob:           applyNumericPatch(req.Prob, current.Prob),
		CreatorFee:     applyNumericPatch(req.CreatorFee, current.CreatorFee),
		SampleCost:     applyNumericPatch(req.SampleCost, current.SampleCost),
		PlatformFee:    applyNumericPatch(req.PlatformFee, current.PlatformFee),
		Currency:       currency,
		SettlementMode: applyTextPatch(req.SettlementMode, current.SettlementMode),
		CommissionRate: applyNumericPatch(req.CommissionRate, current.CommissionRate),
		SampleRequired: applyBoolPatch(req.SampleRequired, current.SampleRequired),
		ScriptRequired: applyBoolPatch(req.ScriptRequired, current.ScriptRequired),
		ScheduledAt:    scheduledAt,
		ConfirmedAt:    confirmed,
		PublishedAt:    published,
		AcceptedAt:     accepted,
		IssueID:        issueID,
		OwnerMemberID:  owner,
		PublishUrl:     applyTextPatch(req.PublishURL, current.PublishUrl),
		SettledOn:      settledOn,
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to update collab", err)
		return
	}

	actorID := uuidToString(scope.Member.UserID)
	if updated.Stage != current.Stage {
		h.publish(eventCRMCollabStageChange, scope.WorkspaceID, "member", actorID, map[string]any{
			"id":   uuidToString(updated.ID),
			"from": current.Stage,
			"to":   updated.Stage,
		})
	}
	h.publishCRMChanged(eventCRMCollabChanged, scope.WorkspaceID, uuidToString(updated.ID), actorID)
	writeJSON(w, http.StatusOK, crmCollabToResponse(updated))
}

// DeleteCrmCollab 鈥?DELETE /api/workbench/crm/collabs/{collabId} (soft delete)
//
// Archiving a collaboration archives the settlements that name it, in the same
// transaction (搂20.1). The alternative 鈥?archive the collab and leave its money 鈥?// produced two lies at once: `orders.paid_amount` and the receivable list kept
// counting settlements whose collaboration had left every screen, and the UI had to
// hide the delete affordance entirely because one click manufactured orphans. A
// collaboration is the vertex of that pair, so deleting it takes its money with it.
//
// Paid settlements are archived too, deliberately: `paid_at` records that money moved
// once, and archiving the row does not un-pay it 鈥?the row leaves the ledgers like
// every other workbench delete. Refusing with a 409 while anything has cleared was
// rejected because it makes a mis-created collaboration permanent: the operator's only
// repair would be editing rows the API does not let them edit. A reader who needs the
// money to stay visible should not delete the collaboration.
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

	// One transaction: a collab archived without its settlements (or the reverse)
	// is exactly the orphan this endpoint exists to avoid.
	tx, err := h.TxStarter.Begin(r.Context())
	if err != nil {
		workbenchInternalError(w, r, "failed to delete collab", err)
		return
	}
	defer tx.Rollback(r.Context())
	qtx := h.Queries.WithTx(tx)

	deleted, err := qtx.ArchiveCrmCollab(r.Context(), db.ArchiveCrmCollabParams{
		ID:          current.ID,
		WorkspaceID: scope.WorkspaceUUID,
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to delete collab", err)
		return
	}
	if deleted == 0 {
		writeError(w, http.StatusNotFound, "collab not found")
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
	if err := tx.Commit(r.Context()); err != nil {
		workbenchInternalError(w, r, "failed to delete collab", err)
		return
	}

	h.publishCRMChanged(eventCRMCollabChanged, scope.WorkspaceID, uuidToString(current.ID), uuidToString(scope.Member.UserID))
	// One event per archived settlement: another client's settlement list and the
	// cockpit's `paid_amount` both read these rows, and a collab-only event would
	// leave them showing money whose collaboration no longer exists.
	for _, settlementID := range settlementIDs {
		h.publishCRMChanged(eventCRMSettlementChanged, scope.WorkspaceID, uuidToString(settlementID), uuidToString(scope.Member.UserID))
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
	rows, err := h.Queries.ListCrmSettlements(r.Context(), db.ListCrmSettlementsParams{
		WorkspaceID: scope.WorkspaceUUID,
		CollabID:    collabID,
		Paid:        paid,
		CursorAt:    cursorAt,
		CursorID:    cursorID,
		Limit:       workbenchLimit(r),
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to list settlements", err)
		return
	}
	resp := make([]CrmSettlementResponse, len(rows))
	for i, row := range rows {
		resp[i] = crmSettlementToResponse(row)
	}
	writeJSON(w, http.StatusOK, map[string]any{"settlements": resp, "total": len(resp)})
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
	// Settlement money is its own capability (搂24.1): recording or withdrawing a
	// payment is not covered by "may edit the collaboration".
	if !h.requireWorkbenchCapability(w, r, scope, capCRMSettle) {
		return
	}
	var req CrmSettlementRequest
	if !decodeWorkbenchBody(w, r, &req) {
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
	if _, ok := h.loadCollabForSettlementWrite(w, r, scope, collabID); !ok {
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
	currency, ok := workbenchCurrency(w, req.Currency)
	if !ok {
		return
	}
	dueAt, ok := workbenchDateValue(w, req.DueAt, "due_at")
	if !ok {
		return
	}
	paidAt, ok := workbenchDateValue(w, req.PaidAt, "paid_at")
	if !ok {
		return
	}

	settlement, err := h.Queries.CreateCrmSettlement(r.Context(), db.CreateCrmSettlementParams{
		WorkspaceID: scope.WorkspaceUUID,
		CollabID:    collabID,
		Kind:        kind,
		Amount:      floatToNumeric(req.Amount),
		Currency:    currency,
		DueAt:       dueAt,
		PaidAt:      paidAt,
		InvoiceNo:   optionalTrimmedText(req.InvoiceNo),
		Note:        optionalTrimmedText(req.Note),
		CreatedBy:   scope.Member.UserID,
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to create settlement", err)
		return
	}
	h.publishCRMChanged(eventCRMSettlementChanged, scope.WorkspaceID, uuidToString(settlement.ID), uuidToString(scope.Member.UserID))
	writeJSON(w, http.StatusCreated, crmSettlementToResponse(settlement))
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
	// Settlement money is its own capability (搂24.1): recording or withdrawing a
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
	paidAt, ok := applyDatePatch(req.PaidAt, w, "paid_at", current.PaidAt)
	if !ok {
		return
	}

	updated, err := h.Queries.UpdateCrmSettlement(r.Context(), db.UpdateCrmSettlementParams{
		ID:          current.ID,
		WorkspaceID: scope.WorkspaceUUID,
		CollabID:    collabID,
		Kind:        kind,
		Amount:      applyNumericPatch(req.Amount, current.Amount),
		Currency:    currency,
		DueAt:       dueAt,
		PaidAt:      paidAt,
		InvoiceNo:   applyTextPatch(req.InvoiceNo, current.InvoiceNo),
		Note:        applyTextPatch(req.Note, current.Note),
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to update settlement", err)
		return
	}
	h.publishCRMChanged(eventCRMSettlementChanged, scope.WorkspaceID, uuidToString(updated.ID), uuidToString(scope.Member.UserID))
	writeJSON(w, http.StatusOK, crmSettlementToResponse(updated))
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
	// Settlement money is its own capability (搂24.1): recording or withdrawing a
	// payment is not covered by "may edit the collaboration".
	if !h.requireWorkbenchCapability(w, r, scope, capCRMSettle) {
		return
	}
	current, ok := h.loadCrmSettlementForWrite(w, r, scope)
	if !ok {
		return
	}
	deleted, err := h.Queries.ArchiveCrmSettlement(r.Context(), db.ArchiveCrmSettlementParams{
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
	h.publishCRMChanged(eventCRMSettlementChanged, scope.WorkspaceID, uuidToString(current.ID), uuidToString(scope.Member.UserID))
	w.WriteHeader(http.StatusNoContent)
}
