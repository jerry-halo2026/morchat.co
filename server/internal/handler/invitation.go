package handler

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jerry-halo2026/morchat.co/server/internal/analytics"
	"github.com/jerry-halo2026/morchat.co/server/internal/logger"
	obsmetrics "github.com/jerry-halo2026/morchat.co/server/internal/metrics"
	"github.com/jerry-halo2026/morchat.co/server/internal/seatcapacity"
	"github.com/jerry-halo2026/morchat.co/server/internal/supabaseauth"
	db "github.com/jerry-halo2026/morchat.co/server/pkg/db/generated"
	"github.com/jerry-halo2026/morchat.co/server/pkg/protocol"
)

// InvitationResponse is the JSON shape returned for a workspace invitation.
type InvitationResponse struct {
	ID            string  `json:"id"`
	WorkspaceID   string  `json:"workspace_id"`
	InviterID     string  `json:"inviter_id"`
	InviteeEmail  string  `json:"invitee_email"`
	InviteeUserID *string `json:"invitee_user_id"`
	Role          string  `json:"role"`
	Status        string  `json:"status"`
	CreatedAt     string  `json:"created_at"`
	UpdatedAt     string  `json:"updated_at"`
	ExpiresAt     string  `json:"expires_at"`
	// DepartmentID is the department the invitee will join, or null. Optional:
	// clients that predate departments never set it and read it as absent.
	DepartmentID *string `json:"department_id"`
	// Enriched fields (present in list responses).
	InviterName   string `json:"inviter_name,omitempty"`
	InviterEmail  string `json:"inviter_email,omitempty"`
	WorkspaceName string `json:"workspace_name,omitempty"`
	// ProvisionState reports what creating the invitee's Supabase account did:
	// disabled (no service key), created, already_exists, failed. Additive and
	// defaulted, so older clients ignore it.
	ProvisionState string  `json:"provision_state,omitempty"`
	ProvisionError *string `json:"provision_error,omitempty"`
	// InitialPassword is returned exactly once, in the response to the request
	// that created the provider account: the admin hands it to the invitee out
	// of band. It is never stored and never appears in list responses.
	InitialPassword *string `json:"initial_password,omitempty"`
}

func invitationToResponse(inv db.WorkspaceInvitation) InvitationResponse {
	return InvitationResponse{
		ID:             uuidToString(inv.ID),
		WorkspaceID:    uuidToString(inv.WorkspaceID),
		InviterID:      uuidToString(inv.InviterID),
		InviteeEmail:   inv.InviteeEmail,
		InviteeUserID:  uuidToPtr(inv.InviteeUserID),
		Role:           inv.Role,
		Status:         inv.Status,
		CreatedAt:      timestampToString(inv.CreatedAt),
		UpdatedAt:      timestampToString(inv.UpdatedAt),
		ExpiresAt:      timestampToString(inv.ExpiresAt),
		DepartmentID:   uuidToPtr(inv.DepartmentID),
		ProvisionState: inv.ProvisionState,
	}
}

// CreateInvitation replaces the old "instant-add" CreateMember flow.
// POST /api/workspaces/{id}/members  (same endpoint, new behaviour)

func (h *Handler) CreateInvitation(w http.ResponseWriter, r *http.Request) {
	workspaceID := workspaceIDFromURL(r, "id")
	requester, ok := h.workspaceMember(w, r, workspaceID)
	if !ok {
		return
	}

	var req CreateMemberRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	email := strings.ToLower(strings.TrimSpace(req.Email))
	if email == "" {
		writeError(w, http.StatusBadRequest, "email is required")
		return
	}

	role, valid := normalizeMemberRole(req.Role)
	if !valid {
		writeError(w, http.StatusBadRequest, "invalid member role")
		return
	}
	if role == "owner" {
		writeError(w, http.StatusBadRequest, "cannot invite as owner")
		return
	}
	// An explicit initial password has to clear the same floor the provider
	// enforces; anything shorter would provision nothing and read as a provider
	// failure instead of a bad request.
	if req.Password != nil {
		if trimmed := strings.TrimSpace(*req.Password); trimmed != "" && len(trimmed) < 8 {
			writeErrorCode(w, http.StatusBadRequest, "weak_password", "password must be at least 8 characters")
			return
		}
	}

	// Optional department: an absent or empty value keeps the pre-department
	// behaviour (join with no department). A value must name a department in
	// this workspace; otherwise the invite would silently land nowhere.
	var departmentID pgtype.UUID
	if strings.TrimSpace(req.DepartmentID) != "" {
		dept, ok := parseUUIDOrBadRequest(w, req.DepartmentID, "department_id")
		if !ok {
			return
		}
		if _, err := h.Queries.GetDepartment(r.Context(), db.GetDepartmentParams{
			ID:          dept,
			WorkspaceID: requester.WorkspaceID,
		}); err != nil {
			writeError(w, http.StatusBadRequest, "department not found in this workspace")
			return
		}
		departmentID = dept
	}

	// Check if the user is already a member.
	existingUser, err := h.Queries.GetUserByEmail(r.Context(), email)
	if err == nil {
		_, memberErr := h.Queries.GetMemberByUserAndWorkspace(r.Context(), db.GetMemberByUserAndWorkspaceParams{
			UserID:      existingUser.ID,
			WorkspaceID: requester.WorkspaceID,
		})
		if memberErr == nil {
			writeError(w, http.StatusConflict, "user is already a member")
			return
		}
	}

	// Drop any past-due pending invitations to 'expired' first. The partial unique
	// index idx_invitation_unique_pending only filters by status = 'pending', so a
	// stale row would otherwise block CreateInvitation below — see issue #2055.
	expiredInvitations, err := h.Queries.ExpireStalePendingInvitations(r.Context(), db.ExpireStalePendingInvitationsParams{
		WorkspaceID: requester.WorkspaceID, InviteeEmail: email,
	})
	if err != nil {
		slog.Warn("expire stale invitations failed", append(logger.RequestAttrs(r), "error", err, "workspace_id", workspaceID, "email", email)...)
		writeError(w, http.StatusInternalServerError, "failed to create invitation")
		return
	}
	if h.seatCapacityEnabled() {
		for _, expired := range expiredInvitations {
			if err := enqueueCapacityRelease(r.Context(), h.Queries, uuid.UUID(expired.WorkspaceID.Bytes), uuid.UUID(expired.ID.Bytes)); err != nil {
				writeError(w, http.StatusInternalServerError, "failed to release expired invitation capacity")
				return
			}
			h.compensateCapacityIntent(r.Context(), uuid.UUID(expired.ID.Bytes))
		}
	}

	// Check if there is still a live pending invitation.
	_, err = h.Queries.GetPendingInvitationByEmail(r.Context(), db.GetPendingInvitationByEmailParams{
		WorkspaceID:  requester.WorkspaceID,
		InviteeEmail: email,
	})
	if err == nil {
		writeError(w, http.StatusConflict, "invitation already pending for this email")
		return
	}

	// Resolve invitee_user_id if the user already exists.
	var inviteeUserID pgtype.UUID
	if existingUser.ID.Valid {
		inviteeUserID = existingUser.ID
	}
	admission, ok := h.checkInvitationAdmission(
		w,
		r,
		uuidToString(requester.UserID),
		uuidToString(requester.WorkspaceID),
		email,
	)
	if !ok {
		return
	}

	invitationID := uuid.New()
	expiresAt := time.Now().Add(7 * 24 * time.Hour)
	if err := h.reserveInvitationCapacity(r.Context(), uuid.UUID(requester.WorkspaceID.Bytes), invitationID, expiresAt); err != nil {
		if isPersistentSeatCapacityAdmissionRejection(err) {
			// Full and overcommitted workspaces cannot admit another member until
			// their durable capacity facts change. Charge repeated attempts to the
			// actor budget so this endpoint cannot hammer the capacity service,
			// while preserving workspace and recipient budgets for a later valid
			// invitation.
			h.consumeInvitationActorAdmission(r, admission)
		}
		writeSeatCapacityError(w, err)
		return
	}

	// The non-consuming abuse checks run before Cloud. Spend all budgets only
	// after Cloud has secured capacity. Persistent capacity rejections spend the
	// actor budget only in the branch above; transient failures spend none.
	h.consumeInvitationAdmission(r, admission)

	createParams := db.CreateInvitationParams{
		ID: uuidToPG(invitationID), WorkspaceID: requester.WorkspaceID, InviterID: requester.UserID,
		InviteeEmail: email, InviteeUserID: inviteeUserID, Role: role,
		ExpiresAt:    pgtype.Timestamptz{Time: expiresAt, Valid: true},
		DepartmentID: departmentID,
	}
	var inv db.WorkspaceInvitation
	if h.seatCapacityEnabled() {
		tx, txErr := h.TxStarter.Begin(r.Context())
		if txErr != nil {
			h.compensateCapacityIntent(r.Context(), invitationID)
			writeError(w, http.StatusInternalServerError, "failed to create invitation")
			return
		}
		defer tx.Rollback(r.Context())
		qtx := h.Queries.WithTx(tx)
		inv, err = qtx.CreateInvitation(r.Context(), createParams)
		if err == nil {
			err = qtx.DeleteSeatCapacityIntentForAction(r.Context(), db.DeleteSeatCapacityIntentForActionParams{
				OperationToken: uuidToPG(invitationID), Action: seatcapacity.ActionReserveInvitation,
			})
		}
		if err == nil {
			err = tx.Commit(r.Context())
		}
		if err != nil {
			// Release transaction locks before the out-of-transaction Cloud
			// compensation below reads and transitions the durable intent.
			_ = tx.Rollback(r.Context())
		}
	} else {
		inv, err = h.Queries.CreateInvitation(r.Context(), createParams)
	}
	if err != nil {
		h.compensateCapacityIntent(r.Context(), invitationID)
		if isUniqueViolation(err) {
			writeError(w, http.StatusConflict, "invitation already pending for this email")
			return
		}
		slog.Warn("create invitation failed", append(logger.RequestAttrs(r), "error", err, "workspace_id", workspaceID, "email", email)...)
		writeError(w, http.StatusInternalServerError, "failed to create invitation")
		return
	}

	slog.Info("invitation created", append(logger.RequestAttrs(r), "invitation_id", uuidToString(inv.ID), "workspace_id", workspaceID, "email", email, "role", role)...)

	resp := invitationToResponse(inv)

	// Notify the invitee in real time if they are a registered user.
	userID := requestUserID(r)
	eventPayload := map[string]any{"invitation": resp}
	var workspaceName string
	if ws, err := h.Queries.GetWorkspace(r.Context(), requester.WorkspaceID); err == nil {
		workspaceName = ws.Name
		eventPayload["workspace_name"] = ws.Name
	}
	h.publish(protocol.EventInvitationCreated, uuidToString(requester.WorkspaceID), "member", userID, eventPayload)

	obsmetrics.RecordEvent(h.Analytics, h.Metrics, analytics.TeamInviteSent(
		uuidToString(requester.UserID),
		uuidToString(requester.WorkspaceID),
		email,
		"email",
	))

	// Send invitation email (fire-and-forget).
	if h.EmailService != nil && workspaceName != "" {
		inviterName := email // fallback
		if inviter, err := h.Queries.GetUser(r.Context(), requester.UserID); err == nil {
			inviterName = inviter.Name
		}
		invID := uuidToString(inv.ID)
		go func() {
			if err := h.EmailService.SendInvitationEmail(email, inviterName, workspaceName, invID); err != nil {
				slog.Warn("failed to send invitation email", "email", email, "error", err)
			}
		}()
	}

	// With Supabase password sign-in configured, an invitation also creates the
	// provider account with a password, so the invitee can sign in immediately
	// with email + password and no mail is sent. A provider failure never fails
	// the invitation: the link still works, and the state lets an owner retry
	// (POST .../invitations/{id}/provision).
	if provisioned, state, initialPassword, detail := h.provisionInvitation(r.Context(), inv, req.Password); provisioned {
		resp.ProvisionState = state
		resp.ProvisionError = detail
		resp.InitialPassword = initialPassword
	}

	writeJSON(w, http.StatusCreated, resp)
}

// ProvisionInvitation retries the provider account creation for a pending
// invitation. POST /api/workspaces/{id}/invitations/{invitationId}/provision
func (h *Handler) ProvisionInvitation(w http.ResponseWriter, r *http.Request) {
	workspaceID := workspaceIDFromURL(r, "id")
	requester, ok := h.requireWorkspaceRole(w, r, workspaceID, "workspace not found", "owner", "admin")
	if !ok {
		return
	}
	if h.SupabaseProvisioner == nil {
		writeError(w, http.StatusConflict, "supabase account provisioning is not configured")
		return
	}
	invitationID, ok := parseUUIDOrBadRequest(w, chi.URLParam(r, "invitationId"), "invitation id")
	if !ok {
		return
	}
	inv, err := h.Queries.GetInvitation(r.Context(), invitationID)
	if err != nil || inv.WorkspaceID != requester.WorkspaceID {
		writeError(w, http.StatusNotFound, "invitation not found")
		return
	}
	if inv.Status != "pending" {
		writeError(w, http.StatusConflict, "invitation is not pending")
		return
	}

	_, state, initialPassword, detail := h.provisionInvitation(r.Context(), inv, nil)
	resp := invitationToResponse(inv)
	resp.ProvisionState = state
	resp.ProvisionError = detail
	resp.InitialPassword = initialPassword
	writeJSON(w, http.StatusOK, resp)
}

// provisionInvitation asks the provider to create the invitee's account with a
// password and records what happened on the invitation row. `provisioned=false`
// means this deployment has no service key, so the columns keep their 'disabled'
// default and no password is minted.
//
// `requested` is the admin's chosen password; empty means "generate one". The
// returned password is the only copy that ever exists: it is not stored, so a
// retry mints a new one.
//
// The write is a plain statement rather than a generated query: these three
// columns are bookkeeping no read path joins on, and adding them to sqlc would
// churn every generated invitation row for no benefit.
func (h *Handler) provisionInvitation(ctx context.Context, inv db.WorkspaceInvitation, requested *string) (provisioned bool, state string, initialPassword *string, detail *string) {
	if h.SupabaseProvisioner == nil {
		return false, "", nil, nil
	}

	password := ""
	if requested != nil {
		password = strings.TrimSpace(*requested)
	}
	if password == "" {
		generated, err := supabaseauth.GeneratePassword()
		if err != nil {
			// No password, no account: record it like any other provider failure.
			h.recordProvisioning(ctx, inv, "failed", err.Error(), "")
			return true, "failed", nil, ptrString(err.Error())
		}
		password = generated
	}

	// A retry on an invitation whose account this server already created is a
	// password reset: the first password was shown once and never stored, so
	// resetting is the only way back in.
	if subject := strings.TrimSpace(inv.ProvisionSubject.String); inv.ProvisionSubject.Valid && subject != "" {
		if err := h.SupabaseProvisioner.ResetPassword(ctx, subject, password); err != nil {
			h.recordProvisioning(ctx, inv, "failed", err.Error(), subject)
			return true, "failed", nil, ptrString(err.Error())
		}
		h.recordProvisioning(ctx, inv, "password_reset", "", subject)
		return true, "password_reset", &password, nil
	}

	res, err := h.SupabaseProvisioner.CreateAccount(ctx, inv.InviteeEmail, password)
	switch {
	case err != nil:
		h.recordProvisioning(ctx, inv, "failed", err.Error(), "")
		return true, "failed", nil, ptrString(err.Error())
	case res.AlreadyExists:
		// The address has an account we did not create (or cannot address), so
		// there is no password to hand over: the invitee uses their own.
		h.recordProvisioning(ctx, inv, "already_exists", "", "")
		return true, "already_exists", nil, nil
	default:
		h.recordProvisioning(ctx, inv, "created", "", res.Subject)
		return true, "created", &password, nil
	}
}

// recordProvisioning writes the outcome and logs it. A log line without the
// password, always.
func (h *Handler) recordProvisioning(ctx context.Context, inv db.WorkspaceInvitation, state, errText, subject string) {
	if _, execErr := h.DB.Exec(ctx,
		`UPDATE workspace_invitation
		    SET provision_state = $2,
		        provision_error = NULLIF($3, ''),
		        provision_subject = NULLIF($4, ''),
		        provisioned_at = now()
		  WHERE id = $1`,
		inv.ID, state, errText, subject); execErr != nil {
		slog.Warn("invitation provisioning: record state failed",
			"invitation_id", uuidToString(inv.ID), "state", state, "error", execErr)
		return
	}

	attrs := []any{"invitation_id", uuidToString(inv.ID), "email", inv.InviteeEmail, "state", state}
	if errText != "" {
		attrs = append(attrs, "error", errText)
		slog.Warn("invitation provisioning failed", attrs...)
		return
	}
	slog.Info("invitation provisioning recorded", attrs...)
}

func ptrString(value string) *string { return &value }

// ListWorkspaceInvitations — pending invitations for a workspace (admin view).
// GET /api/workspaces/{id}/invitations

func (h *Handler) ListWorkspaceInvitations(w http.ResponseWriter, r *http.Request) {
	workspaceID := workspaceIDFromURL(r, "id")
	workspaceUUID, ok := parseUUIDOrBadRequest(w, workspaceID, "workspace id")
	if !ok {
		return
	}

	rows, err := h.Queries.ListPendingInvitationsByWorkspace(r.Context(), workspaceUUID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list invitations")
		return
	}

	resp := make([]InvitationResponse, len(rows))
	for i, row := range rows {
		resp[i] = InvitationResponse{
			ID:            uuidToString(row.ID),
			WorkspaceID:   uuidToString(row.WorkspaceID),
			InviterID:     uuidToString(row.InviterID),
			InviteeEmail:  row.InviteeEmail,
			InviteeUserID: uuidToPtr(row.InviteeUserID),
			Role:          row.Role,
			Status:        row.Status,
			CreatedAt:     timestampToString(row.CreatedAt),
			UpdatedAt:     timestampToString(row.UpdatedAt),
			ExpiresAt:     timestampToString(row.ExpiresAt),
			InviterName:   row.InviterName,
			InviterEmail:  row.InviterEmail,
			DepartmentID:  uuidToPtr(row.DepartmentID),
		}
	}

	writeJSON(w, http.StatusOK, resp)
}

// RevokeInvitation — admin cancels a pending invitation.
// DELETE /api/workspaces/{id}/invitations/{invitationId}

func (h *Handler) RevokeInvitation(w http.ResponseWriter, r *http.Request) {
	workspaceID := workspaceIDFromURL(r, "id")
	invitationID := chi.URLParam(r, "invitationId")
	workspaceUUID, ok := parseUUIDOrBadRequest(w, workspaceID, "workspace id")
	if !ok {
		return
	}
	invitationUUID, ok := parseUUIDOrBadRequest(w, invitationID, "invitation id")
	if !ok {
		return
	}

	inv, err := h.Queries.GetInvitation(r.Context(), invitationUUID)
	if err != nil || uuidToString(inv.WorkspaceID) != uuidToString(workspaceUUID) || inv.Status != "pending" {
		writeError(w, http.StatusNotFound, "invitation not found")
		return
	}

	tx, err := h.TxStarter.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to revoke invitation")
		return
	}
	defer tx.Rollback(r.Context())
	qtx := h.Queries.WithTx(tx)
	rows, err := qtx.RevokeInvitation(r.Context(), inv.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to revoke invitation")
		return
	}
	if rows != 1 {
		writeError(w, http.StatusNotFound, "invitation not found")
		return
	}
	if h.seatCapacityEnabled() {
		if err := enqueueCapacityRelease(r.Context(), qtx, uuid.UUID(inv.WorkspaceID.Bytes), uuid.UUID(inv.ID.Bytes)); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to revoke invitation")
			return
		}
	}
	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to revoke invitation")
		return
	}
	if h.seatCapacityEnabled() {
		h.compensateCapacityIntent(r.Context(), uuid.UUID(inv.ID.Bytes))
	}

	slog.Info("invitation revoked", "invitation_id", invitationID, "workspace_id", workspaceID)

	userID := requestUserID(r)
	h.publish(protocol.EventInvitationRevoked, uuidToString(workspaceUUID), "member", userID, map[string]any{
		"invitation_id":   uuidToString(inv.ID),
		"invitee_email":   inv.InviteeEmail,
		"invitee_user_id": uuidToPtr(inv.InviteeUserID),
	})

	w.WriteHeader(http.StatusNoContent)
}

// GetMyInvitation — get a single invitation by ID (for the invite accept page).
// GET /api/invitations/{id}

func (h *Handler) GetMyInvitation(w http.ResponseWriter, r *http.Request) {
	userID, ok := requireUserID(w, r)
	if !ok {
		return
	}

	invitationID := chi.URLParam(r, "id")
	invitationUUID, ok := parseUUIDOrBadRequest(w, invitationID, "invitation id")
	if !ok {
		return
	}
	inv, err := h.Queries.GetInvitation(r.Context(), invitationUUID)
	if err != nil {
		writeError(w, http.StatusNotFound, "invitation not found")
		return
	}

	// Verify the invitation belongs to the current user.
	user, err := h.Queries.GetUser(r.Context(), parseUUID(userID))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load user")
		return
	}
	if strings.ToLower(user.Email) != inv.InviteeEmail && uuidToString(inv.InviteeUserID) != userID {
		writeError(w, http.StatusForbidden, "invitation does not belong to you")
		return
	}

	resp := invitationToResponse(inv)

	// Enrich with workspace name and inviter name.
	if ws, err := h.Queries.GetWorkspace(r.Context(), inv.WorkspaceID); err == nil {
		resp.WorkspaceName = ws.Name
	}
	if inviter, err := h.Queries.GetUser(r.Context(), inv.InviterID); err == nil {
		resp.InviterName = inviter.Name
		resp.InviterEmail = inviter.Email
	}

	writeJSON(w, http.StatusOK, resp)
}

// ListMyInvitations — current user's pending invitations across all workspaces.
// GET /api/invitations

func (h *Handler) ListMyInvitations(w http.ResponseWriter, r *http.Request) {
	userID, ok := requireUserID(w, r)
	if !ok {
		return
	}

	user, err := h.Queries.GetUser(r.Context(), parseUUID(userID))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load user")
		return
	}

	rows, err := h.Queries.ListPendingInvitationsForUser(r.Context(), db.ListPendingInvitationsForUserParams{
		InviteeUserID: user.ID,
		InviteeEmail:  user.Email,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list invitations")
		return
	}

	resp := make([]InvitationResponse, len(rows))
	for i, row := range rows {
		resp[i] = InvitationResponse{
			ID:            uuidToString(row.ID),
			WorkspaceID:   uuidToString(row.WorkspaceID),
			InviterID:     uuidToString(row.InviterID),
			InviteeEmail:  row.InviteeEmail,
			InviteeUserID: uuidToPtr(row.InviteeUserID),
			Role:          row.Role,
			Status:        row.Status,
			CreatedAt:     timestampToString(row.CreatedAt),
			UpdatedAt:     timestampToString(row.UpdatedAt),
			ExpiresAt:     timestampToString(row.ExpiresAt),
			WorkspaceName: row.WorkspaceName,
			InviterName:   row.InviterName,
			InviterEmail:  row.InviterEmail,
			DepartmentID:  uuidToPtr(row.DepartmentID),
		}
	}

	writeJSON(w, http.StatusOK, resp)
}

// AcceptInvitation — user accepts a pending invitation.
// POST /api/invitations/{id}/accept

func (h *Handler) AcceptInvitation(w http.ResponseWriter, r *http.Request) {
	userID, ok := requireUserID(w, r)
	if !ok {
		return
	}

	invitationID := chi.URLParam(r, "id")
	invitationUUID, ok := parseUUIDOrBadRequest(w, invitationID, "invitation id")
	if !ok {
		return
	}
	inv, err := h.Queries.GetInvitation(r.Context(), invitationUUID)
	if err != nil {
		writeError(w, http.StatusNotFound, "invitation not found")
		return
	}

	// Verify the invitation belongs to the current user.
	user, err := h.Queries.GetUser(r.Context(), parseUUID(userID))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load user")
		return
	}
	if strings.ToLower(user.Email) != inv.InviteeEmail && uuidToString(inv.InviteeUserID) != userID {
		writeError(w, http.StatusForbidden, "invitation does not belong to you")
		return
	}

	if inv.Status != "pending" {
		// Installed clients can hold a stale pending-invitation row for an
		// invitation that was already concluded from another surface (the
		// web invite page, another device). A 400 here leaves that row
		// stuck: the sidebar swallows the error and keeps showing the row
		// until restart. Re-accepting is idempotent while the membership
		// from the first accept still exists — return it so the client's
		// refetch drops the row. A membership that no longer exists (the
		// user left the workspace afterwards) still fails: leaving was
		// explicit and must not be undone by a stale client retry.
		if inv.Status == "accepted" {
			member, memberErr := h.Queries.GetMemberByUserAndWorkspace(r.Context(), db.GetMemberByUserAndWorkspaceParams{
				UserID:      user.ID,
				WorkspaceID: inv.WorkspaceID,
			})
			switch {
			case memberErr == nil:
				writeJSON(w, http.StatusOK, h.memberWithUserResponse(member, user))
				return
			case errors.Is(memberErr, pgx.ErrNoRows):
				// The membership from the first accept is gone; fall through
				// to the 400 below.
			default:
				// A transient read failure must surface as 500, not collapse
				// into the business 400 that clients swallow silently.
				writeError(w, http.StatusInternalServerError, "failed to load membership")
				return
			}
		}
		writeError(w, http.StatusBadRequest, "invitation is not pending")
		return
	}

	// Check expiry.
	if inv.ExpiresAt.Valid && inv.ExpiresAt.Time.Before(time.Now()) {
		writeError(w, http.StatusGone, "invitation has expired")
		return
	}
	capacityActive, err := h.beginCapacityConsume(r.Context(), uuid.UUID(inv.WorkspaceID.Bytes), uuid.UUID(inv.ID.Bytes), uuid.UUID(inv.ID.Bytes), uuid.UUID(user.ID.Bytes))
	if err != nil {
		writeSeatCapacityError(w, err)
		return
	}

	// Use a transaction: mark accepted + create member atomically.
	tx, err := h.TxStarter.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to accept invitation")
		return
	}
	defer tx.Rollback(r.Context())

	qtx := h.Queries.WithTx(tx)

	accepted, err := qtx.AcceptInvitation(r.Context(), inv.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to accept invitation")
		return
	}

	member, err := qtx.CreateMember(r.Context(), db.CreateMemberParams{
		WorkspaceID: accepted.WorkspaceID,
		UserID:      user.ID,
		Role:        accepted.Role,
	})
	if err != nil {
		if isUniqueViolation(err) {
			writeError(w, http.StatusConflict, "you are already a member of this workspace")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to create membership")
		return
	}

	// An invitation that named a department files the new member under it, in
	// the same transaction as the membership. A missing department is not an
	// error here: the invitation row is authoritative, and the department may
	// have been deleted between invite and accept (deletion clears the
	// reference on the invitation's members, not on pending invitations).
	if accepted.DepartmentID.Valid {
		if err := qtx.UpdateMemberDepartment(r.Context(), db.UpdateMemberDepartmentParams{
			ID:           member.ID,
			DepartmentID: accepted.DepartmentID,
		}); err != nil {
			slog.Warn("accept invitation: attach department failed", append(logger.RequestAttrs(r), "error", err, "workspace_id", uuidToString(accepted.WorkspaceID))...)
			writeError(w, http.StatusInternalServerError, "failed to attach department")
			return
		}
		member.DepartmentID = accepted.DepartmentID
	}

	// Accepting an invite marks the invitee as onboarded. The web /
	// desktop workspace layout has a hard onboarded_at gate; without
	// this mark, an invitee landing on their first workspace would be
	// redirected back to /onboarding to fill out a questionnaire for a
	// workspace someone else already set up. Atomic with CreateMember so
	// `member` and `onboarded_at` can never disagree. COALESCE in
	// MarkUserOnboarded keeps the call idempotent for users joining
	// additional workspaces after their first.
	firstOnboardingCompletion := !user.OnboardedAt.Valid
	onboardedUser, err := qtx.MarkUserOnboarded(r.Context(), user.ID)
	if err != nil {
		slog.Warn("accept invitation: mark user onboarded failed", append(logger.RequestAttrs(r), "error", err, "workspace_id", uuidToString(accepted.WorkspaceID))...)
		writeError(w, http.StatusInternalServerError, "failed to mark user onboarded")
		return
	}
	if capacityActive {
		if err := transitionCapacityIntentToConfirm(r.Context(), qtx, uuid.UUID(inv.ID.Bytes), uuid.UUID(member.ID.Bytes), seatcapacity.ActionConsumeInvitation); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to accept invitation")
			return
		}
	}

	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to accept invitation")
		return
	}
	if capacityActive {
		h.confirmCapacityIntent(r.Context(), uuid.UUID(accepted.WorkspaceID.Bytes), uuid.UUID(accepted.ID.Bytes), uuid.UUID(member.ID.Bytes))
	}

	slog.Info("invitation accepted", "invitation_id", invitationID, "user_id", userID, "workspace_id", uuidToString(accepted.WorkspaceID))

	wsID := uuidToString(accepted.WorkspaceID)
	memberResp := h.memberWithUserResponse(member, user)

	// Broadcast member:added so existing clients update their member lists.
	eventPayload := map[string]any{"member": memberResp}
	if ws, err := h.Queries.GetWorkspace(r.Context(), accepted.WorkspaceID); err == nil {
		eventPayload["workspace_name"] = ws.Name
	}
	h.publish(protocol.EventMemberAdded, wsID, "member", userID, eventPayload)

	// Notify the workspace about the acceptance.
	h.publish(protocol.EventInvitationAccepted, wsID, "member", userID, map[string]any{
		"invitation_id": uuidToString(accepted.ID),
		"member":        memberResp,
	})
	h.notifyDaemonWorkspacesChanged(userID)

	// days_since_invite rounds down to whole days so the funnel segments
	// "accepted same day" cleanly from "accepted later". inv.CreatedAt is
	// the invitation row's insertion time so this is safe to compute here.
	var daysSinceInvite int64
	if inv.CreatedAt.Valid {
		daysSinceInvite = int64(time.Since(inv.CreatedAt.Time).Hours() / 24)
	}
	obsmetrics.RecordEvent(h.Analytics, h.Metrics, analytics.TeamInviteAccepted(
		userID,
		wsID,
		daysSinceInvite,
	))
	if firstOnboardingCompletion {
		onboardedAt := ""
		if onboardedUser.OnboardedAt.Valid {
			onboardedAt = onboardedUser.OnboardedAt.Time.UTC().Format("2006-01-02T15:04:05Z07:00")
		}
		obsmetrics.RecordEvent(h.Analytics, h.Metrics, analytics.OnboardingCompleted(
			userID,
			wsID,
			analytics.OnboardingPathInviteAccept,
			onboardedAt,
			onboardedUser.CloudWaitlistEmail.Valid,
		))
	}

	writeJSON(w, http.StatusOK, memberResp)
}

// DeclineInvitation — user declines a pending invitation.
// POST /api/invitations/{id}/decline

func (h *Handler) DeclineInvitation(w http.ResponseWriter, r *http.Request) {
	userID, ok := requireUserID(w, r)
	if !ok {
		return
	}

	invitationID := chi.URLParam(r, "id")
	invitationUUID, ok := parseUUIDOrBadRequest(w, invitationID, "invitation id")
	if !ok {
		return
	}
	inv, err := h.Queries.GetInvitation(r.Context(), invitationUUID)
	if err != nil {
		writeError(w, http.StatusNotFound, "invitation not found")
		return
	}

	// Verify the invitation belongs to the current user.
	user, err := h.Queries.GetUser(r.Context(), parseUUID(userID))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load user")
		return
	}
	if strings.ToLower(user.Email) != inv.InviteeEmail && uuidToString(inv.InviteeUserID) != userID {
		writeError(w, http.StatusForbidden, "invitation does not belong to you")
		return
	}

	if inv.Status != "pending" {
		// Declining a concluded invitation is a no-op: it was already
		// accepted, declined, revoked or expired from another surface, and
		// this invitation is over either way. A stale client holding the
		// pending row only needs its refetch to drop it, so acknowledge
		// with 204 instead of a 400 it would swallow silently.
		w.WriteHeader(http.StatusNoContent)
		return
	}

	tx, err := h.TxStarter.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to decline invitation")
		return
	}
	defer tx.Rollback(r.Context())
	qtx := h.Queries.WithTx(tx)
	declined, err := qtx.DeclineInvitation(r.Context(), inv.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to decline invitation")
		return
	}
	if h.seatCapacityEnabled() {
		if err := enqueueCapacityRelease(r.Context(), qtx, uuid.UUID(inv.WorkspaceID.Bytes), uuid.UUID(inv.ID.Bytes)); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to decline invitation")
			return
		}
	}
	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to decline invitation")
		return
	}
	if h.seatCapacityEnabled() {
		h.compensateCapacityIntent(r.Context(), uuid.UUID(inv.ID.Bytes))
	}

	slog.Info("invitation declined", "invitation_id", invitationID, "user_id", userID)

	wsID := uuidToString(declined.WorkspaceID)
	h.publish(protocol.EventInvitationDeclined, wsID, "member", userID, map[string]any{
		"invitation_id": uuidToString(declined.ID),
		"invitee_email": declined.InviteeEmail,
	})

	w.WriteHeader(http.StatusNoContent)
}
