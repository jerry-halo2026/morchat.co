package handler

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/jerry-halo2026/morchat.co/server/internal/auth"
	"github.com/jerry-halo2026/morchat.co/server/internal/logger"
	"github.com/jerry-halo2026/morchat.co/server/internal/util"
	db "github.com/jerry-halo2026/morchat.co/server/pkg/db/generated"
)

// Password management for an existing account:
//
//	POST /api/me/password         {current_password?, new_password}
//	POST /api/users/{id}/password {new_password}      owner/admin only
//
// Both write through the same SetUserPassword query, so password_updated_at and
// must_change_password move together. current_password is optional on the
// self-service path because accounts that only ever used an emailed code have
// no password to prove; once a hash exists, the caller must present it.

type ChangePasswordRequest struct {
	CurrentPassword string `json:"current_password"`
	NewPassword     string `json:"new_password"`
}

type ResetUserPasswordRequest struct {
	NewPassword string `json:"new_password"`
}

func weakPasswordMessage() string {
	return "password must be at least " + strconv.Itoa(PasswordMinLength) + " characters"
}

// ChangeMyPassword sets or replaces the signed-in user's password.
func (h *Handler) ChangeMyPassword(w http.ResponseWriter, r *http.Request) {
	userID, ok := requireUserID(w, r)
	if !ok {
		return
	}

	var req ChangePasswordRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErrorCode(w, http.StatusBadRequest, "invalid_request", "invalid request body")
		return
	}
	if code, ok := validateNewPassword(req.NewPassword); !ok {
		writeErrorCode(w, http.StatusBadRequest, code, weakPasswordMessage())
		return
	}

	user, err := h.Queries.GetUser(r.Context(), parseUUID(userID))
	if err != nil {
		if isNotFound(err) {
			writeErrorCode(w, http.StatusUnauthorized, "invalid_credentials", "user not found")
			return
		}
		slog.Warn("change password lookup failed", append(logger.RequestAttrs(r), "error", err)...)
		writeErrorCode(w, http.StatusInternalServerError, "internal_error", "failed to load user")
		return
	}

	hasPassword := user.PasswordHash.Valid && strings.TrimSpace(user.PasswordHash.String) != ""
	if hasPassword {
		if req.CurrentPassword == "" {
			writeErrorCode(w, http.StatusUnauthorized, "invalid_credentials", "current password is required")
			return
		}
		if err := auth.Verify(req.CurrentPassword, user.PasswordHash.String); err != nil {
			workspaceID := auditWorkspaceForUser(r.Context(), h.Queries, user.ID)
			h.recordAuthActivity(r.Context(), workspaceID, user.ID, "user_password_change_failed", map[string]any{
				"reason": "invalid_current_password",
				"ip":     h.clientIPForRateLimit(r),
			})
			writeErrorCode(w, http.StatusUnauthorized, "invalid_credentials", "current password is incorrect")
			return
		}
	}

	hash, err := auth.Hash(req.NewPassword)
	if err != nil {
		slog.Warn("password hash failed", append(logger.RequestAttrs(r), "error", err)...)
		writeErrorCode(w, http.StatusInternalServerError, "internal_error", "failed to store password")
		return
	}

	updated, err := h.Queries.SetUserPassword(r.Context(), db.SetUserPasswordParams{
		ID:                 user.ID,
		PasswordHash:       strToText(hash),
		MustChangePassword: false,
	})
	if err != nil {
		slog.Warn("password update failed", append(logger.RequestAttrs(r), "error", err)...)
		writeErrorCode(w, http.StatusInternalServerError, "internal_error", "failed to store password")
		return
	}

	workspaceID := auditWorkspaceForUser(r.Context(), h.Queries, updated.ID)
	h.recordAuthActivity(r.Context(), workspaceID, updated.ID, "user_password_changed", map[string]any{
		"email":               updated.Email,
		"ip":                  h.clientIPForRateLimit(r),
		"cleared_must_change": user.MustChangePassword,
	})

	writeJSON(w, http.StatusOK, map[string]any{
		"ok":                   true,
		"must_change_password": updated.MustChangePassword,
		"user":                 h.userToResponse(updated),
	})
}

// ResetUserPassword is the owner/admin path: hand a member a temporary
// password and require them to replace it on next use.
func (h *Handler) ResetUserPassword(w http.ResponseWriter, r *http.Request) {
	actorID, ok := requireUserID(w, r)
	if !ok {
		return
	}

	targetID, ok := parseUUIDOrBadRequest(w, chi.URLParam(r, "id"), "user id")
	if !ok {
		return
	}

	// Workspace context comes from X-Workspace-ID / slug headers through the
	// membership middleware, never from the body: the path names the target
	// user, not the workspace.
	workspaceID := ctxWorkspaceID(r.Context())
	if workspaceID == "" {
		writeErrorCode(w, http.StatusBadRequest, "missing_workspace", "workspace context is required")
		return
	}
	wsUUID, err := util.ParseUUID(workspaceID)
	if err != nil {
		writeErrorCode(w, http.StatusBadRequest, "missing_workspace", "workspace context is required")
		return
	}

	member, ok := h.workspaceMember(w, r, workspaceID)
	if !ok {
		return
	}
	if !roleAllowed(member.Role, "owner", "admin") {
		writeErrorCode(w, http.StatusForbidden, "insufficient_role", "only workspace owners and admins can reset a password")
		return
	}

	// The target must belong to the actor's workspace, otherwise an admin of
	// one workspace could reset anybody's credential.
	if _, err := h.Queries.GetMemberByUserAndWorkspace(r.Context(), db.GetMemberByUserAndWorkspaceParams{
		UserID:      targetID,
		WorkspaceID: wsUUID,
	}); err != nil {
		writeErrorCode(w, http.StatusNotFound, "user_not_found", "user is not a member of this workspace")
		return
	}

	var req ResetUserPasswordRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErrorCode(w, http.StatusBadRequest, "invalid_request", "invalid request body")
		return
	}
	if code, ok := validateNewPassword(req.NewPassword); !ok {
		writeErrorCode(w, http.StatusBadRequest, code, weakPasswordMessage())
		return
	}

	hash, err := auth.Hash(req.NewPassword)
	if err != nil {
		slog.Warn("password hash failed", append(logger.RequestAttrs(r), "error", err)...)
		writeErrorCode(w, http.StatusInternalServerError, "internal_error", "failed to store password")
		return
	}

	target, err := h.Queries.SetUserPassword(r.Context(), db.SetUserPasswordParams{
		ID:                 targetID,
		PasswordHash:       strToText(hash),
		MustChangePassword: true,
	})
	if err != nil {
		if isNotFound(err) {
			writeErrorCode(w, http.StatusNotFound, "user_not_found", "user not found")
			return
		}
		slog.Warn("password reset failed", append(logger.RequestAttrs(r), "error", err)...)
		writeErrorCode(w, http.StatusInternalServerError, "internal_error", "failed to store password")
		return
	}

	h.recordAuthActivity(r.Context(), wsUUID, parseUUID(actorID), "user_password_reset", map[string]any{
		"target_user_id": uuidToString(target.ID),
		"target_email":   target.Email,
		"actor_user_id":  actorID,
		"ip":             h.clientIPForRateLimit(r),
	})

	writeJSON(w, http.StatusOK, map[string]any{
		"ok":                   true,
		"must_change_password": target.MustChangePassword,
		"user":                 h.userToResponse(target),
	})
}
