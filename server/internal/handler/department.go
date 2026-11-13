package handler

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/jerry-halo2026/morchat.co/server/internal/logger"
	"github.com/jerry-halo2026/morchat.co/server/internal/util"
	db "github.com/jerry-halo2026/morchat.co/server/pkg/db/generated"
)

// Departments (docs/engineering/ORG-MODEL.md §3). A department is attribution —
// which unit a member belongs to, which unit a project or knowledge space is
// filed under — not an ACL. Nothing here filters a read by department_id, so
// these endpoints cannot make an existing issue, project or knowledge item
// disappear from anyone.
//
// Who may do what:
//
//   - read: any workspace member
//   - create/rename/delete: workspace owner/admin
//
// Deletion has no foreign key behind it (repository rule), so it detaches its
// projects and members inside the delete transaction and reports the counts.

type DepartmentResponse struct {
	ID          string  `json:"id"`
	WorkspaceID string  `json:"workspace_id"`
	Name        string  `json:"name"`
	LeadUserID  *string `json:"lead_user_id"`
	SystemKey   *string `json:"system_key"`
	CreatedAt   string  `json:"created_at"`
	UpdatedAt   string  `json:"updated_at"`
}

func departmentToResponse(d db.Department) DepartmentResponse {
	return DepartmentResponse{
		ID:          uuidToString(d.ID),
		WorkspaceID: uuidToString(d.WorkspaceID),
		Name:        d.Name,
		LeadUserID:  uuidToPtr(d.LeadUserID),
		SystemKey:   textToPtr(d.SystemKey),
		CreatedAt:   timestampToString(d.CreatedAt),
		UpdatedAt:   timestampToString(d.UpdatedAt),
	}
}

type CreateDepartmentRequest struct {
	Name string `json:"name"`
	// LeadUserID is the department head. It must be a current workspace member;
	// an empty or absent value leaves the department without a lead.
	LeadUserID *string `json:"lead_user_id"`
	// SystemKey marks a server-managed department (e.g. one backed by a
	// preset). Client-created departments normally leave it empty.
	SystemKey *string `json:"system_key"`
}

type UpdateDepartmentRequest struct {
	Name *string `json:"name"`
	// LeadUserID / SystemKey follow PATCH semantics: absent or null leaves the
	// stored value alone, and an empty string clears it.
	LeadUserID *string `json:"lead_user_id"`
	SystemKey  *string `json:"system_key"`
}

// DeleteDepartmentResponse reports what the delete detached. Existing clients
// ignore it; it exists so a caller can tell "removed an empty department" from
// "removed one that five projects were filed under".
type DeleteDepartmentResponse struct {
	DetachedProjects int64 `json:"detached_projects"`
	DetachedMembers  int64 `json:"detached_members"`
}

// requireDepartmentWriter gates department writes to workspace owner/admin. The
// not-found wording matches the rest of the workspace-scoped handlers: a
// non-member learns nothing about the workspace.
func (h *Handler) requireDepartmentWriter(w http.ResponseWriter, r *http.Request, workspaceID string) (db.Member, bool) {
	return h.requireWorkspaceRole(w, r, workspaceID, "workspace not found", "owner", "admin")
}

// departmentLead resolves an optional lead user id, rejecting anyone who is not
// a member of this workspace. An empty string means "no lead".
func (h *Handler) departmentLead(w http.ResponseWriter, r *http.Request, raw string, workspaceID string) (pgtype.UUID, bool) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return pgtype.UUID{}, true
	}
	lead, ok := parseUUIDOrBadRequest(w, trimmed, "lead_user_id")
	if !ok {
		return pgtype.UUID{}, false
	}
	if _, err := h.getWorkspaceMember(r.Context(), trimmed, workspaceID); err != nil {
		writeError(w, http.StatusBadRequest, "lead_user_id is not a member of this workspace")
		return pgtype.UUID{}, false
	}
	return lead, true
}

func optionalTextValue(raw *string) pgtype.Text {
	if raw == nil {
		return pgtype.Text{}
	}
	trimmed := strings.TrimSpace(*raw)
	if trimmed == "" {
		return pgtype.Text{}
	}
	return pgtype.Text{String: trimmed, Valid: true}
}

// ListDepartments — GET /api/departments
func (h *Handler) ListDepartments(w http.ResponseWriter, r *http.Request) {
	workspaceID := h.resolveWorkspaceID(r)
	if _, ok := h.requireWorkspaceMember(w, r, workspaceID, "workspace not found"); !ok {
		return
	}
	wsUUID, ok := parseUUIDOrBadRequest(w, workspaceID, "workspace id")
	if !ok {
		return
	}

	rows, err := h.Queries.ListDepartments(r.Context(), wsUUID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list departments")
		return
	}

	resp := make([]DepartmentResponse, len(rows))
	for i, row := range rows {
		resp[i] = departmentToResponse(row)
	}
	writeJSON(w, http.StatusOK, map[string]any{"departments": resp, "total": len(resp)})
}

// CreateDepartment — POST /api/departments
func (h *Handler) CreateDepartment(w http.ResponseWriter, r *http.Request) {
	workspaceID := h.resolveWorkspaceID(r)
	if _, ok := h.requireDepartmentWriter(w, r, workspaceID); !ok {
		return
	}
	wsUUID, ok := parseUUIDOrBadRequest(w, workspaceID, "workspace id")
	if !ok {
		return
	}

	var req CreateDepartmentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	name := strings.TrimSpace(req.Name)
	if name == "" {
		writeError(w, http.StatusBadRequest, "name is required")
		return
	}
	var leadID pgtype.UUID
	if req.LeadUserID != nil {
		id, ok := h.departmentLead(w, r, *req.LeadUserID, workspaceID)
		if !ok {
			return
		}
		leadID = id
	}

	department, err := h.Queries.CreateDepartment(r.Context(), db.CreateDepartmentParams{
		WorkspaceID: wsUUID,
		Name:        name,
		LeadUserID:  leadID,
		SystemKey:   optionalTextValue(req.SystemKey),
	})
	if err != nil {
		if isUniqueViolation(err) {
			writeError(w, http.StatusConflict, "a department with this name already exists")
			return
		}
		slog.Error("create department failed", append(logger.RequestAttrs(r), "error", err, "workspace_id", workspaceID)...)
		writeError(w, http.StatusInternalServerError, "failed to create department")
		return
	}

	writeJSON(w, http.StatusCreated, departmentToResponse(department))
}

// UpdateDepartment — PATCH /api/departments/{id}
func (h *Handler) UpdateDepartment(w http.ResponseWriter, r *http.Request) {
	workspaceID := h.resolveWorkspaceID(r)
	if _, ok := h.requireDepartmentWriter(w, r, workspaceID); !ok {
		return
	}
	wsUUID, ok := parseUUIDOrBadRequest(w, workspaceID, "workspace id")
	if !ok {
		return
	}
	id, ok := parseUUIDOrBadRequest(w, chi.URLParam(r, "id"), "department id")
	if !ok {
		return
	}

	current, err := h.Queries.GetDepartment(r.Context(), db.GetDepartmentParams{ID: id, WorkspaceID: wsUUID})
	if err != nil {
		writeError(w, http.StatusNotFound, "department not found")
		return
	}

	var req UpdateDepartmentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
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
	leadID := current.LeadUserID
	if req.LeadUserID != nil {
		id, ok := h.departmentLead(w, r, *req.LeadUserID, workspaceID)
		if !ok {
			return
		}
		leadID = id
	}
	systemKey := current.SystemKey
	if req.SystemKey != nil {
		systemKey = optionalTextValue(req.SystemKey)
	}

	updated, err := h.Queries.UpdateDepartment(r.Context(), db.UpdateDepartmentParams{
		ID:          id,
		WorkspaceID: wsUUID,
		Name:        name,
		LeadUserID:  leadID,
		SystemKey:   systemKey,
	})
	if err != nil {
		if isUniqueViolation(err) {
			writeError(w, http.StatusConflict, "a department with this name already exists")
			return
		}
		slog.Error("update department failed", append(logger.RequestAttrs(r), "error", err, "workspace_id", workspaceID)...)
		writeError(w, http.StatusInternalServerError, "failed to update department")
		return
	}

	writeJSON(w, http.StatusOK, departmentToResponse(updated))
}

// DeleteDepartment — DELETE /api/departments/{id}
func (h *Handler) DeleteDepartment(w http.ResponseWriter, r *http.Request) {
	workspaceID := h.resolveWorkspaceID(r)
	if _, ok := h.requireDepartmentWriter(w, r, workspaceID); !ok {
		return
	}
	wsUUID, ok := parseUUIDOrBadRequest(w, workspaceID, "workspace id")
	if !ok {
		return
	}
	id, ok := parseUUIDOrBadRequest(w, chi.URLParam(r, "id"), "department id")
	if !ok {
		return
	}

	tx, err := h.TxStarter.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to start transaction")
		return
	}
	defer tx.Rollback(r.Context())
	qtx := h.Queries.WithTx(tx)

	// Detach dependents before the row goes away: there is no foreign key to
	// null them out, and a dangling department_id would make "which department
	// owns this project" answer with a missing row.
	detachedProjects, err := qtx.ClearProjectDepartment(r.Context(), db.ClearProjectDepartmentParams{
		WorkspaceID:  wsUUID,
		DepartmentID: id,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to detach department projects")
		return
	}
	detachedMembers, err := qtx.ClearMemberDepartment(r.Context(), db.ClearMemberDepartmentParams{
		WorkspaceID:  wsUUID,
		DepartmentID: id,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to detach department members")
		return
	}
	deleted, err := qtx.DeleteDepartment(r.Context(), db.DeleteDepartmentParams{ID: id, WorkspaceID: wsUUID})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to delete department")
		return
	}
	if deleted == 0 {
		writeError(w, http.StatusNotFound, "department not found")
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to commit department delete")
		return
	}

	slog.Info("department deleted", append(logger.RequestAttrs(r),
		"department_id", uuidToString(id),
		"workspace_id", workspaceID,
		"detached_projects", detachedProjects,
		"detached_members", detachedMembers)...)

	writeJSON(w, http.StatusOK, DeleteDepartmentResponse{
		DetachedProjects: detachedProjects,
		DetachedMembers:  detachedMembers,
	})
}

// departmentIDOrZero converts an optional request-field department id. An
// absent value yields the zero UUID, which every filter treats as "no
// department" instead of matching the zero row (there is none).
func departmentIDOrZero(raw string) (pgtype.UUID, error) {
	if strings.TrimSpace(raw) == "" {
		return pgtype.UUID{}, nil
	}
	return util.ParseUUID(strings.TrimSpace(raw))
}
