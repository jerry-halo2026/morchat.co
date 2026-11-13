package handler

// The knowledge review gate (W1-A): draft → active needs a person.
//
// Why this lives in the handler and not in the knowledge package: the decision
// needs the workspace member model (role owner/admin), the space row, and the
// department lead — three things the HTTP layer already assembles for its other
// permission checks. The knowledge package exposes the facts (SpaceReviewers)
// and the write (ApproveItem); this file decides whether to call it.
//
// The rule, in one place:
//
//	draft → active is allowed for the space owner, the lead of the space's
//	department, and any workspace owner/admin. An agent may never do it, and
//	neither may a plain member: proposals go through knowledge.propose, and a
//	person approves them here.
//
// What an approval requires is data, not etiquette: the item must name an owner,
// a source, and a review issue of this workspace that has reached a done-category
// status. The three failure codes below are separate because a client has to tell
// "you may not" (403, ask someone) from "not yet reviewable" (400, fix the item)
// from "that issue is not a review" (400, pick another).
//
//	400 knowledge_review_required      owner_id / source_ref / review_issue_id missing
//	403 knowledge_review_forbidden     the caller is an agent, or may not approve here
//	400 knowledge_review_issue_invalid the named issue is unknown, foreign, or unfinished

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/jerry-halo2026/morchat.co/server/internal/issuestatus"
	"github.com/jerry-halo2026/morchat.co/server/internal/knowledge"
	"github.com/jerry-halo2026/morchat.co/server/internal/service"
	"github.com/jerry-halo2026/morchat.co/server/internal/util"
	db "github.com/jerry-halo2026/morchat.co/server/pkg/db/generated"
)

// knowledgeReviewLabel marks the issues a proposal opens.
const knowledgeReviewLabel = "knowledge-review"

// knowledgeReviewLabelColor is the label's colour; the catalog requires one.
const knowledgeReviewLabelColor = "#64748b"

// knowledgeReviewRoles are the workspace roles that may approve anywhere in the
// workspace. The other two allowed reviewers are named by data: the space owner
// and the department lead.
var knowledgeReviewRoles = []string{"owner", "admin"}

// knowledgeReviewGate is one approval attempt.
type knowledgeReviewGate struct {
	WorkspaceID string
	ViewerID    string
	Member      db.Member
	Item        knowledge.Item
	// ReviewIssueID is the issue the caller wants to record. Empty means the
	// caller named none, which is a review_required failure, not an "already
	// reviewed" pass.
	ReviewIssueID string
}

// requireKnowledgeReview runs the gate, writes the failure itself, and returns
// the resolved review issue id.
func (h *Handler) requireKnowledgeReview(w http.ResponseWriter, r *http.Request, gate knowledgeReviewGate) (string, bool) {
	ctx := r.Context()

	// 1. Machine credentials never approve. X-Actor-Source is server-set by the
	//    auth middleware, so this cannot be forged by a client; resolveActor
	//    covers the in-process/header-pair path the rest of the package uses.
	if actorType, _ := h.resolveActor(r, gate.ViewerID, gate.WorkspaceID); actorType == "agent" ||
		isMachineCredentialActor(r) {
		writeErrorCode(w, http.StatusForbidden, "knowledge_review_forbidden",
			"an agent may propose knowledge but not approve it; a person has to review the item")
		return "", false
	}

	// 2. Who may approve here: workspace owner/admin, the space owner, or the
	//    lead of the space's department.
	reviewers, err := h.knowledgeService().Store().SpaceReviewers(ctx, gate.WorkspaceID, gate.Item.SpaceID)
	if err != nil {
		writeKnowledgeCRUDError(w, "review", err)
		return "", false
	}
	allowed := roleAllowed(gate.Member.Role, knowledgeReviewRoles...) ||
		(reviewers.OwnerID != "" && reviewers.OwnerID == gate.ViewerID) ||
		(reviewers.LeadUserID != "" && reviewers.LeadUserID == gate.ViewerID)
	if !allowed {
		writeErrorCode(w, http.StatusForbidden, "knowledge_review_forbidden",
			"only the space owner, its department lead, or a workspace owner/admin may approve knowledge")
		return "", false
	}

	// 3. The item has to be reviewable: an owner (someone stands behind it), a
	//    source (a reader can check it), and an issue (the decision has a home).
	if gate.Item.OwnerID == nil || strings.TrimSpace(*gate.Item.OwnerID) == "" {
		writeErrorCode(w, http.StatusBadRequest, "knowledge_review_required",
			"owner_id is required before an item can be reviewed")
		return "", false
	}
	if strings.TrimSpace(gate.Item.SourceRef) == "" {
		writeErrorCode(w, http.StatusBadRequest, "knowledge_review_required",
			"source_ref is required before an item can be reviewed")
		return "", false
	}
	issueID := strings.TrimSpace(gate.ReviewIssueID)
	if issueID == "" {
		writeErrorCode(w, http.StatusBadRequest, "knowledge_review_required",
			"review_issue_id is required: approval is recorded against the issue that reviewed it")
		return "", false
	}

	// 4. The issue must be a finished issue of THIS workspace. A cross-workspace
	//    id answers not-found rather than forbidden, so approval cannot be used
	//    to probe another tenant's issues.
	issueUUID, err := util.ParseUUID(issueID)
	if err != nil {
		writeErrorCode(w, http.StatusBadRequest, "knowledge_review_issue_invalid",
			"review_issue_id is not an issue id")
		return "", false
	}
	workspaceUUID, err := util.ParseUUID(gate.WorkspaceID)
	if err != nil {
		writeErrorCode(w, http.StatusBadRequest, "knowledge_review_issue_invalid",
			"workspace context is required")
		return "", false
	}
	issue, err := h.Queries.GetIssueInWorkspace(ctx, db.GetIssueInWorkspaceParams{
		ID: issueUUID, WorkspaceID: workspaceUUID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeErrorCode(w, http.StatusBadRequest, "knowledge_review_issue_invalid",
				"review_issue_id does not name an issue of this workspace")
			return "", false
		}
		writeErrorCode(w, http.StatusInternalServerError, "knowledge_review_issue_invalid",
			"failed to read the review issue")
		return "", false
	}
	// The category helper is the one place that knows a custom status can live
	// in the done lifecycle; enumerating statuses here would drift from it.
	if category := issuestatus.Category(ctx, h.Queries, workspaceUUID, issue.Status); category != issuestatus.CategoryDone {
		writeErrorCode(w, http.StatusBadRequest, "knowledge_review_issue_invalid",
			fmt.Sprintf("review issue is %q: only a done-category issue approves knowledge", issue.Status))
		return "", false
	}

	return uuidToString(issue.ID), true
}

// ApproveKnowledgeItem answers POST /api/knowledge/items/{itemId}/approve.
//
// It is the explicit form of the draft → active transition: the body names the
// issue that reviewed the item, the caller must be one of the three approving
// roles, and the response carries the item plus its review record.
func (h *Handler) ApproveKnowledgeItem(w http.ResponseWriter, r *http.Request) {
	workspaceID, viewerID, ok := h.knowledgeWriteScope(w, r)
	if !ok {
		return
	}
	var body struct {
		ReviewIssueID string `json:"review_issue_id"`
	}
	if err := decodeKnowledgeBody(r, &body, true); err != nil {
		writeErrorCode(w, http.StatusBadRequest, "invalid_request", "invalid JSON body")
		return
	}

	itemID := chi.URLParam(r, "itemId")
	knowledgeSvc := h.knowledgeService()
	item, err := knowledgeSvc.ReadItem(r.Context(), workspaceID, viewerID, itemID)
	if err != nil {
		writeKnowledgeCRUDError(w, "item", err)
		return
	}
	member, err := h.getWorkspaceMember(r.Context(), viewerID, workspaceID)
	if err != nil {
		writeErrorCode(w, http.StatusForbidden, "knowledge_review_forbidden",
			"this caller is not a member of the workspace")
		return
	}

	issueID, ok := h.requireKnowledgeReview(w, r, knowledgeReviewGate{
		WorkspaceID:   workspaceID,
		ViewerID:      viewerID,
		Member:        member,
		Item:          item,
		ReviewIssueID: body.ReviewIssueID,
	})
	if !ok {
		return
	}

	review, err := knowledgeSvc.Store().ApproveItem(r.Context(), knowledge.ApproveInput{
		WorkspaceID:   workspaceID,
		ItemID:        item.ID,
		ReviewIssueID: issueID,
		ReviewedBy:    viewerID,
	})
	if err != nil {
		writeKnowledgeCRUDError(w, "approve item", err)
		return
	}
	detail, err := knowledgeSvc.GetItemDetail(r.Context(), workspaceID, viewerID, item.ID, false)
	if err != nil {
		writeKnowledgeCRUDError(w, "approve item", err)
		return
	}
	writeJSON(w, http.StatusOK, knowledgeItemResponse{
		Item:       detail.Item,
		ChunkCount: len(detail.Chunks),
		Archived:   detail.Archived,
		Document:   detail.Document,
		Review:     &review,
	})
}

// AuditKnowledgeReview answers GET /api/knowledge/review-audit: the read-only
// three-way audit behind `multica knowledge audit`. It writes nothing.
func (h *Handler) AuditKnowledgeReview(w http.ResponseWriter, r *http.Request) {
	workspaceID, viewerID, ok := knowledgeRequestScope(r)
	if !ok {
		writeErrorCode(w, http.StatusBadRequest, "invalid_request", "workspace context is required")
		return
	}
	audit, err := h.knowledgeService().Store().ReviewAudit(r.Context(), workspaceID, viewerID)
	if err != nil {
		writeKnowledgeCRUDError(w, "review audit", err)
		return
	}
	writeJSON(w, http.StatusOK, audit)
}

// knowledgeIssueCreator adapts this handler's issue service to the knowledge
// package's proposal hook.
//
// It exists so knowledge.propose reuses the ONE create path — numbering,
// duplicate guard, workflow status, labels, broadcast, analytics — instead of
// inserting an issue row of its own. The knowledge package knows nothing about
// issues beyond "ask this function for one".
func (h *Handler) knowledgeIssueCreator() knowledge.ReviewIssueCreator {
	return func(ctx context.Context, in knowledge.ReviewIssueInput) (string, error) {
		workspaceUUID, err := util.ParseUUID(in.WorkspaceID)
		if err != nil {
			return "", fmt.Errorf("review issue: workspace_id is not a uuid")
		}
		creatorID, err := util.ParseUUID(in.RequesterID)
		if err != nil {
			return "", fmt.Errorf("review issue: requester is not a user id")
		}
		labelIDs, err := h.knowledgeReviewLabelIDs(ctx, in.WorkspaceID)
		if err != nil {
			return "", err
		}
		params := service.IssueCreateParams{
			WorkspaceID: workspaceUUID,
			Title:       in.Title,
			Description: pgtype.Text{String: in.Body, Valid: true},
			Status:      issuestatus.Todo,
			Priority:    "none",
			CreatorType: "member",
			CreatorID:   creatorID,
			LabelIDs:    labelIDs,
			// Each proposal gets its own review: two runs proposing the same
			// title are two decisions, not a duplicate to swallow.
			AllowDuplicate: true,
		}
		if strings.TrimSpace(in.AssigneeID) != "" {
			if assignee, err := util.ParseUUID(in.AssigneeID); err == nil {
				params.AssigneeType = pgtype.Text{String: "member", Valid: true}
				params.AssigneeID = assignee
			}
		}
		result, err := h.IssueService.Create(ctx, params, service.IssueCreateOpts{})
		if err != nil {
			return "", err
		}
		return uuidToString(result.Issue.ID), nil
	}
}

// knowledgeReviewLabelIDs returns the id of the workspace's knowledge-review
// label, creating it on first use. Labels are catalog rows, not free text on the
// issue, so the filter "everything waiting for a knowledge review" is one query.
func (h *Handler) knowledgeReviewLabelIDs(ctx context.Context, workspaceID string) ([]pgtype.UUID, error) {
	workspaceUUID, err := util.ParseUUID(workspaceID)
	if err != nil {
		return nil, fmt.Errorf("knowledge-review label: workspace_id is not a uuid")
	}
	find := func() (pgtype.UUID, bool, error) {
		labels, err := h.Queries.ListLabels(ctx, db.ListLabelsParams{
			WorkspaceID: workspaceUUID, ResourceType: "issue",
		})
		if err != nil {
			return pgtype.UUID{}, false, err
		}
		for _, label := range labels {
			if strings.EqualFold(label.Name, knowledgeReviewLabel) {
				return label.ID, true, nil
			}
		}
		return pgtype.UUID{}, false, nil
	}
	if id, ok, err := find(); err != nil {
		return nil, fmt.Errorf("knowledge-review label: %w", err)
	} else if ok {
		return []pgtype.UUID{id}, nil
	}
	created, err := h.Queries.CreateLabel(ctx, db.CreateLabelParams{
		WorkspaceID:  workspaceUUID,
		ResourceType: "issue",
		Name:         knowledgeReviewLabel,
		Description:  "知识入库审阅",
		Color:        knowledgeReviewLabelColor,
	})
	if err != nil {
		// Lost a race with another proposal: the unique index on
		// (workspace, resource_type, lower(name)) means the row exists now.
		if id, ok, findErr := find(); findErr == nil && ok {
			return []pgtype.UUID{id}, nil
		}
		return nil, fmt.Errorf("knowledge-review label: %w", err)
	}
	return []pgtype.UUID{created.ID}, nil
}
