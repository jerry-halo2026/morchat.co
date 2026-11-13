package handler

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/jerry-halo2026/morchat.co/server/internal/featureflags"
	"github.com/jerry-halo2026/morchat.co/server/internal/projectaccess"
	db "github.com/jerry-halo2026/morchat.co/server/pkg/db/generated"
	"github.com/jerry-halo2026/morchat.co/server/pkg/dbid"
	"github.com/jerry-halo2026/morchat.co/server/pkg/protocol"
)

const (
	// departmentInboxSystemKey marks the one project the server manages per
	// department: the landing place for issues created without a project
	// (docs/engineering/ORG-MODEL.md §3.4).
	departmentInboxSystemKey = "department-inbox"
	// departmentTransferActivity is the activity_log action recorded for a
	// department change, so "who moved this person, and what moved with them"
	// is answerable after the fact (ORG-MODEL §5 gap 5).
	departmentTransferActivity = "member_department_changed"
)

// departmentScope is a department's default scope: the roster it covers and
// the person leading it. It is not an ACL — the only mechanism behind it is a
// private project plus its project_member rows, so a bug here can hide a
// project from the wrong people but cannot widen anyone's read access.
type departmentScope struct {
	department db.Department
	memberIDs  []pgtype.UUID
	leadID     pgtype.UUID
}

// departmentScopeForUser answers "which department does this member belong to,
// who else is in it, and who leads it". ok=false means the member has no
// department in this workspace, which keeps the caller on its old behavior.
func (h *Handler) departmentScopeForUser(ctx context.Context, workspaceID, userID pgtype.UUID) (departmentScope, bool, error) {
	department, err := h.Queries.GetDepartmentForMember(ctx, db.GetDepartmentForMemberParams{
		WorkspaceID: workspaceID,
		UserID:      userID,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return departmentScope{}, false, nil
	}
	if err != nil {
		return departmentScope{}, false, err
	}
	memberIDs, err := h.Queries.ListDepartmentMemberUserIDs(ctx, db.ListDepartmentMemberUserIDsParams{
		WorkspaceID:  workspaceID,
		DepartmentID: department.ID,
	})
	if err != nil {
		return departmentScope{}, false, err
	}
	// A department without a head falls back to whoever is creating, so the
	// default project always has a human lead who can manage its access
	// (ORG-MODEL §5 gap 6).
	leadID := department.LeadUserID
	if !leadID.Valid {
		leadID = userID
	}
	return departmentScope{department: department, memberIDs: memberIDs, leadID: leadID}, true, nil
}

// uniqueUUIDs keeps the first occurrence of each id. The project_member insert
// tolerates duplicates, but the caller compares the number of inserted rows
// with the number requested, so a duplicate would read as a missing member.
func uniqueUUIDs(ids ...[]pgtype.UUID) []pgtype.UUID {
	seen := make(map[pgtype.UUID]struct{}, len(ids))
	out := make([]pgtype.UUID, 0, len(ids))
	for _, group := range ids {
		for _, id := range group {
			if !id.Valid {
				continue
			}
			if _, dup := seen[id]; dup {
				continue
			}
			seen[id] = struct{}{}
			out = append(out, id)
		}
	}
	return out
}

// departmentInboxForIssue resolves (creating on first use) the inbox project an
// issue created without a project should land in. ok=false keeps today's
// behavior: no project, workspace-visible, exactly as before the flag existed.
//
// A sub-issue is not routed here — it follows its parent, and moving it into
// the creator's department project would separate it from the parent it
// belongs to.
func (h *Handler) departmentInboxForIssue(ctx context.Context, workspaceID, creatorID pgtype.UUID) (db.Project, bool, error) {
	if !featureflags.DepartmentDefaultScopeEnabled(ctx, h.FeatureFlags) || !creatorID.Valid {
		return db.Project{}, false, nil
	}
	scope, ok, err := h.departmentScopeForUser(ctx, workspaceID, creatorID)
	if err != nil || !ok {
		return db.Project{}, false, err
	}
	project, err := h.ensureDepartmentInboxProject(ctx, scope, creatorID)
	if err != nil {
		return db.Project{}, false, err
	}
	return project, true, nil
}

// ensureDepartmentInboxProject returns the department's inbox project, creating
// it private to the department in one transaction when this department has none
// yet. The caller re-checks visibility afterwards, so nothing here grants the
// creator access to a project they could not otherwise see — it only makes sure
// the project they are filing into is one they belong to.
func (h *Handler) ensureDepartmentInboxProject(ctx context.Context, scope departmentScope, creatorID pgtype.UUID) (db.Project, error) {
	tx, err := h.TxStarter.Begin(ctx)
	if err != nil {
		return db.Project{}, err
	}
	defer tx.Rollback(ctx)
	qtx := h.Queries.WithTx(tx)

	// Two concurrent first-issues must not produce two inbox projects. The lock
	// is per department and dies with the transaction.
	lockKey := uuidToString(scope.department.WorkspaceID) + ":" + uuidToString(scope.department.ID) + ":" + departmentInboxSystemKey
	if _, err := tx.Exec(ctx, "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", lockKey); err != nil {
		return db.Project{}, err
	}

	project, err := qtx.GetProjectBySystemKey(ctx, db.GetProjectBySystemKeyParams{
		WorkspaceID:  scope.department.WorkspaceID,
		DepartmentID: scope.department.ID,
		SystemKey:    pgtype.Text{String: departmentInboxSystemKey, Valid: true},
	})
	switch {
	case errors.Is(err, pgx.ErrNoRows):
		project, err = h.createDepartmentInboxProject(ctx, qtx, scope, creatorID)
		if err != nil {
			return db.Project{}, err
		}
	case err != nil:
		return db.Project{}, err
	}

	// The creator may have joined the department after the inbox was created, so
	// the roster is not enough on its own: add them before filing into it.
	if _, err := qtx.AddProjectMembers(ctx, db.AddProjectMembersParams{
		ProjectID:   project.ID,
		WorkspaceID: project.WorkspaceID,
		UserIds:     []pgtype.UUID{creatorID},
		AddedBy:     creatorID,
	}); err != nil {
		return db.Project{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return db.Project{}, err
	}
	return project, nil
}

func (h *Handler) createDepartmentInboxProject(ctx context.Context, q *db.Queries, scope departmentScope, creatorID pgtype.UUID) (db.Project, error) {
	project, err := q.CreateProject(ctx, db.CreateProjectParams{
		WorkspaceID:  scope.department.WorkspaceID,
		Title:        departmentInboxTitle(scope.department.Name),
		Status:       "planned",
		Priority:     "none",
		LeadType:     pgtype.Text{String: "member", Valid: true},
		LeadID:       scope.leadID,
		CreatorType:  pgtype.Text{String: "member", Valid: true},
		CreatorID:    creatorID,
		DepartmentID: scope.department.ID,
		SystemKey:    pgtype.Text{String: departmentInboxSystemKey, Valid: true},
	})
	if err != nil {
		return db.Project{}, err
	}
	// The creator is always added: a department head who is not in the roster
	// (or a creator whose department row changed mid-flight) still has to see
	// the project they are filing into.
	if _, err := q.AddProjectMembers(ctx, db.AddProjectMembersParams{
		ProjectID:   project.ID,
		WorkspaceID: project.WorkspaceID,
		UserIds:     uniqueUUIDs(scope.memberIDs, []pgtype.UUID{creatorID, scope.leadID}),
		AddedBy:     creatorID,
	}); err != nil {
		return db.Project{}, err
	}
	return q.UpdateProjectVisibility(ctx, db.UpdateProjectVisibilityParams{
		ID:          project.ID,
		WorkspaceID: project.WorkspaceID,
		Visibility:  projectaccess.VisibilityPrivate,
	})
}

// departmentInboxTitle names the inbox project after its department. The title
// is stored data, not UI copy: the client renders it as it renders every other
// project title, so no locale key is involved.
func departmentInboxTitle(departmentName string) string {
	return strings.TrimSpace(departmentName) + " 收件箱"
}

// ---- moving a member between departments (ORG-MODEL §5 gap 5) --------------

// UpdateMemberDepartmentRequest moves a member to another department. A null or
// empty department_id clears the attribution: the member leaves the old
// department's private projects and joins none.
type UpdateMemberDepartmentRequest struct {
	DepartmentID *string `json:"department_id"`
}

// UpdateMemberDepartmentResponse reports what the move changed, so an operator
// can tell "moved between two empty departments" from "moved out of three
// projects".
type UpdateMemberDepartmentResponse struct {
	DepartmentID    *string  `json:"department_id"`
	AddedProjects   []string `json:"added_projects"`
	RemovedProjects []string `json:"removed_projects"`
}

// UpdateMemberDepartment — PATCH /api/workspaces/{id}/members/{memberId}/department
//
// One transaction: member.department_id, the project_member rows of the old and
// new department's private projects, the local-search re-announcement for every
// affected project, and the audit row. A rejected department leaves all four
// untouched.
func (h *Handler) UpdateMemberDepartment(w http.ResponseWriter, r *http.Request) {
	workspaceID := workspaceIDFromURL(r, "id")
	requester, ok := h.requireWorkspaceRole(w, r, workspaceID, "workspace not found", "owner", "admin")
	if !ok {
		return
	}
	wsUUID, ok := parseUUIDOrBadRequest(w, workspaceID, "workspace id")
	if !ok {
		return
	}
	memberUUID, ok := parseUUIDOrBadRequest(w, chi.URLParam(r, "memberId"), "member id")
	if !ok {
		return
	}
	target, err := h.Queries.GetMember(r.Context(), memberUUID)
	if err != nil || target.WorkspaceID != wsUUID {
		writeError(w, http.StatusNotFound, "member not found")
		return
	}

	var req UpdateMemberDepartmentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	var targetDepartmentID pgtype.UUID
	if req.DepartmentID != nil && strings.TrimSpace(*req.DepartmentID) != "" {
		id, ok := parseUUIDOrBadRequest(w, strings.TrimSpace(*req.DepartmentID), "department_id")
		if !ok {
			return
		}
		// A department from another workspace would be stored as a dangling id
		// and its projects would never be found (there is no foreign key).
		if _, err := h.Queries.GetDepartment(r.Context(), db.GetDepartmentParams{ID: id, WorkspaceID: wsUUID}); err != nil {
			writeError(w, http.StatusBadRequest, "department not found in this workspace")
			return
		}
		targetDepartmentID = id
	}

	added, removed, ok := h.transferMemberDepartment(w, r, requester, target, targetDepartmentID)
	if !ok {
		return
	}

	resp := UpdateMemberDepartmentResponse{
		DepartmentID:    uuidToPtr(targetDepartmentID),
		AddedProjects:   uuidListToStrings(added),
		RemovedProjects: uuidListToStrings(removed),
	}
	writeJSON(w, http.StatusOK, resp)
}

// transferMemberDepartment performs the move and its audit trail. It writes its
// own HTTP errors and returns ok=false on failure.
func (h *Handler) transferMemberDepartment(w http.ResponseWriter, r *http.Request, requester, target db.Member, targetDepartmentID pgtype.UUID) (added, removed []pgtype.UUID, ok bool) {
	ctx := r.Context()
	// Moving a member to the department they are already in is not a change: no
	// rows, no audit noise.
	if target.DepartmentID == targetDepartmentID {
		return nil, nil, true
	}

	tx, err := h.TxStarter.Begin(ctx)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to start transaction")
		return nil, nil, false
	}
	defer tx.Rollback(ctx)
	qtx := h.Queries.WithTx(tx)

	if target.DepartmentID.Valid {
		removed, err = qtx.RemoveDepartmentProjectMember(ctx, db.RemoveDepartmentProjectMemberParams{
			WorkspaceID:  target.WorkspaceID,
			UserID:       target.UserID,
			DepartmentID: target.DepartmentID,
		})
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to remove department project memberships")
			return nil, nil, false
		}
	}
	if targetDepartmentID.Valid {
		added, err = qtx.AddDepartmentProjectMembers(ctx, db.AddDepartmentProjectMembersParams{
			WorkspaceID:  target.WorkspaceID,
			UserID:       target.UserID,
			DepartmentID: targetDepartmentID,
			AddedBy:      requester.UserID,
		})
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to add department project memberships")
			return nil, nil, false
		}
	}
	if err := qtx.UpdateMemberDepartment(ctx, db.UpdateMemberDepartmentParams{
		ID:           target.ID,
		DepartmentID: targetDepartmentID,
	}); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update member department")
		return nil, nil, false
	}

	// Access changed for every project in both lists: re-announce them to local
	// search sync so the moved member's clients drop what they lost and pick up
	// what they gained (same contract as AddProjectMembers / RemoveProjectMember).
	for _, projectID := range append(append([]pgtype.UUID{}, added...), removed...) {
		if err := touchProjectSearchIndex(r, qtx, db.Project{ID: projectID, WorkspaceID: target.WorkspaceID}); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to update search index")
			return nil, nil, false
		}
	}

	details, _ := json.Marshal(map[string]any{
		"member_id":          uuidToString(target.ID),
		"user_id":            uuidToString(target.UserID),
		"from_department_id": uuidToPtr(target.DepartmentID),
		"to_department_id":   uuidToPtr(targetDepartmentID),
		"added_projects":     uuidListToStrings(added),
		"removed_projects":   uuidListToStrings(removed),
	})
	if _, err := qtx.CreateActivity(ctx, db.CreateActivityParams{
		ID:          dbid.NewV7(),
		WorkspaceID: target.WorkspaceID,
		IssueID:     pgtype.UUID{},
		ActorType:   pgtype.Text{String: "member", Valid: true},
		ActorID:     requester.UserID,
		Action:      departmentTransferActivity,
		Details:     details,
	}); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to record department change")
		return nil, nil, false
	}
	if err := tx.Commit(ctx); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to commit department change")
		return nil, nil, false
	}

	// Re-announce the member so the org chart and member lists refresh, and the
	// moved member's own client refetches its project list.
	updated, err := h.Queries.GetMember(ctx, target.ID)
	if err != nil {
		return added, removed, true
	}
	if user, err := h.Queries.GetUser(ctx, updated.UserID); err == nil {
		h.publish(protocol.EventMemberUpdated, uuidToString(updated.WorkspaceID), "member", requestUserID(r), map[string]any{
			"member": h.memberWithUserResponse(updated, user),
		})
	}
	for _, projectID := range append(append([]pgtype.UUID{}, added...), removed...) {
		// Only the id and workspace are read by the payload builder.
		h.publishProjectMembersChanged(db.Project{ID: projectID, WorkspaceID: target.WorkspaceID}, requester.UserID)
	}
	return added, removed, true
}

func uuidListToStrings(ids []pgtype.UUID) []string {
	out := make([]string, 0, len(ids))
	for _, id := range ids {
		out = append(out, uuidToString(id))
	}
	return out
}
