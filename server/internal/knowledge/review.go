package knowledge

// The review gate (W1-A): "this knowledge can be trusted" is a fact on the row,
// not a convention.
//
// Three things live here and nowhere else: the review state of one item, the
// single writer that turns a draft into an approved active item, and the three
// read-only audits that say what is still unreviewed, stale, or orphaned.
//
// The permission decision — who may approve — is NOT here. It needs the
// workspace role and the department lead, which belong to the HTTP layer's
// member model; this package exposes the facts it decides on
// (SpaceReviewers) and the write it performs (ApproveItem).

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

// ReviewStaleDays is how long one approval stays good for. After it, the item
// shows up in the stale audit and needs a fresh review — the knowledge may still
// be true, but nobody has said so recently.
const ReviewStaleDays = 180

// Review is the review state of one item. Every field is optional because
// "never reviewed" is the state of every row that predates the gate.
type Review struct {
	ReviewIssueID *string    `json:"review_issue_id"`
	ReviewedBy    *string    `json:"reviewed_by"`
	ReviewedAt    *time.Time `json:"reviewed_at"`
	StaleAfter    *time.Time `json:"stale_after"`
}

// Approved reports whether an approver is recorded on the row.
func (r Review) Approved() bool { return r.ReviewedAt != nil }

// The three review failures the HTTP layer maps onto its own error codes.
var (
	// ErrReviewRequired means the item is not ready to be approved: it has no
	// owner, no source, or no review issue to point at.
	ErrReviewRequired = errors.New("knowledge: review required")
	// ErrReviewForbidden means the caller may not approve this item.
	ErrReviewForbidden = errors.New("knowledge: review forbidden")
	// ErrReviewIssueInvalid means the named review issue is not a finished
	// issue of this workspace.
	ErrReviewIssueInvalid = errors.New("knowledge: review issue invalid")
)

// SpaceReviewers names the people and org facts that decide who may approve an
// item in one space: the space's owner, and the lead of the department the space
// is filed under. Empty strings mean "not set".
type SpaceReviewers struct {
	SpaceID      string
	SpaceName    string
	OwnerID      string
	DepartmentID string
	LeadUserID   string
}

// SpaceReviewers reads the approval context of one space of a workspace.
func (s *Store) SpaceReviewers(ctx context.Context, workspaceID, spaceID string) (SpaceReviewers, error) {
	if !isUUIDString(strings.TrimSpace(spaceID)) {
		return SpaceReviewers{}, ErrSpaceNotFound
	}
	var out SpaceReviewers
	err := s.db.QueryRow(ctx, `
		SELECT sp.id::text, sp.display_name,
		       coalesce(sp.owner_id::text, ''),
		       coalesce(sp.department_id::text, ''),
		       coalesce(d.lead_user_id::text, '')
		FROM knowledge_spaces sp
		LEFT JOIN department d
		       ON d.workspace_id = sp.workspace_id AND d.id = sp.department_id
		WHERE sp.workspace_id = $1 AND sp.id::text = $2`, workspaceID, spaceID).Scan(
		&out.SpaceID, &out.SpaceName, &out.OwnerID, &out.DepartmentID, &out.LeadUserID)
	if errors.Is(err, pgx.ErrNoRows) {
		return SpaceReviewers{}, ErrSpaceNotFound
	}
	if err != nil {
		return SpaceReviewers{}, fmt.Errorf("read knowledge space reviewers: %w", err)
	}
	return out, nil
}

// WorkspaceManager returns the first owner, else the first admin, of a workspace:
// the last resort assignee for a review issue whose space names nobody.
func (s *Store) WorkspaceManager(ctx context.Context, workspaceID string) (string, error) {
	var userID string
	err := s.db.QueryRow(ctx, `
		SELECT user_id::text
		FROM member
		WHERE workspace_id = $1 AND role IN ('owner', 'admin')
		ORDER BY CASE role WHEN 'owner' THEN 0 ELSE 1 END, created_at ASC
		LIMIT 1`, workspaceID).Scan(&userID)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", nil
	}
	if err != nil {
		return "", fmt.Errorf("read workspace manager: %w", err)
	}
	return userID, nil
}

// ReviewAssignee resolves who should review a proposal in this space: the space
// owner, then the department lead, then a workspace owner/admin. An empty
// answer means the workspace has nobody to assign — the caller still creates the
// issue, unassigned, rather than blocking the proposal.
func (s *Service) ReviewAssignee(ctx context.Context, workspaceID, spaceID string) (assignee string, reviewers SpaceReviewers, err error) {
	reviewers, err = s.store.SpaceReviewers(ctx, workspaceID, spaceID)
	if err != nil {
		return "", SpaceReviewers{}, err
	}
	for _, candidate := range []string{reviewers.OwnerID, reviewers.LeadUserID} {
		if strings.TrimSpace(candidate) != "" {
			return candidate, reviewers, nil
		}
	}
	manager, err := s.store.WorkspaceManager(ctx, workspaceID)
	if err != nil {
		return "", reviewers, err
	}
	return manager, reviewers, nil
}

const reviewColumns = `coalesce(review_issue_id::text, ''),
	coalesce(reviewed_by::text, ''),
	reviewed_at, stale_after`

func scanReview(row pgx.Row) (Review, error) {
	var issueID, reviewedBy string
	var reviewedAt, staleAfter *time.Time
	if err := row.Scan(&issueID, &reviewedBy, &reviewedAt, &staleAfter); err != nil {
		return Review{}, err
	}
	review := Review{ReviewedAt: reviewedAt, StaleAfter: staleAfter}
	if issueID != "" {
		review.ReviewIssueID = &issueID
	}
	if reviewedBy != "" {
		review.ReviewedBy = &reviewedBy
	}
	return review, nil
}

// GetReview reads the review state of one item inside its workspace.
func (s *Store) GetReview(ctx context.Context, workspaceID, itemID string) (Review, error) {
	if !isUUIDString(strings.TrimSpace(itemID)) {
		return Review{}, ErrItemNotFound
	}
	review, err := scanReview(s.db.QueryRow(ctx, `
		SELECT `+reviewColumns+`
		FROM knowledge_items
		WHERE workspace_id = $1 AND id::text = $2`, workspaceID, itemID))
	if errors.Is(err, pgx.ErrNoRows) {
		return Review{}, ErrItemNotFound
	}
	if err != nil {
		return Review{}, fmt.Errorf("read knowledge item review: %w", err)
	}
	return review, nil
}

// SetReviewIssue records which issue carries an item's review. It is what a
// proposal writes: the item stays a draft, and the issue is where the decision
// happens.
func (s *Store) SetReviewIssue(ctx context.Context, workspaceID, itemID, issueID string) (Review, error) {
	if !isUUIDString(strings.TrimSpace(itemID)) {
		return Review{}, ErrItemNotFound
	}
	if !isUUIDString(strings.TrimSpace(issueID)) {
		return Review{}, fmt.Errorf("%w: review_issue_id=%q is not a uuid", ErrInvalidField, issueID)
	}
	review, err := scanReview(s.db.QueryRow(ctx, `
		UPDATE knowledge_items
		SET review_issue_id = $3::uuid, updated_at = now()
		WHERE workspace_id = $1 AND id::text = $2
		RETURNING `+reviewColumns, workspaceID, itemID, issueID))
	if errors.Is(err, pgx.ErrNoRows) {
		return Review{}, ErrItemNotFound
	}
	if err != nil {
		return Review{}, fmt.Errorf("record knowledge review issue: %w", err)
	}
	return review, nil
}

// ApproveInput is one approval. Every field is required: an approval with no
// approver or no issue is not an approval.
type ApproveInput struct {
	WorkspaceID   string
	ItemID        string
	ReviewIssueID string
	ReviewedBy    string
}

// ApproveItem is the one write that turns a draft into a reviewed active item.
// It sets the lifecycle state and the review record together, so there is no
// window in which an item is active without its approver.
func (s *Store) ApproveItem(ctx context.Context, in ApproveInput) (Review, error) {
	if !isUUIDString(strings.TrimSpace(in.ItemID)) {
		return Review{}, ErrItemNotFound
	}
	if strings.TrimSpace(in.ReviewIssueID) == "" {
		return Review{}, fmt.Errorf("%w: review_issue_id is required", ErrReviewRequired)
	}
	if strings.TrimSpace(in.ReviewedBy) == "" {
		return Review{}, fmt.Errorf("%w: reviewed_by is required", ErrReviewRequired)
	}
	review, err := scanReview(s.db.QueryRow(ctx, `
		UPDATE knowledge_items
		SET status = $3,
		    review_issue_id = $4::uuid,
		    reviewed_by = $5::uuid,
		    reviewed_at = now(),
		    stale_after = now() + make_interval(days => $6),
		    updated_at = now()
		WHERE workspace_id = $1 AND id::text = $2
		RETURNING `+reviewColumns,
		in.WorkspaceID, in.ItemID, StatusActive, in.ReviewIssueID, in.ReviewedBy,
		ReviewStaleDays))
	if errors.Is(err, pgx.ErrNoRows) {
		return Review{}, ErrItemNotFound
	}
	if err != nil {
		return Review{}, fmt.Errorf("approve knowledge item: %w", err)
	}
	return review, nil
}

// ReviewAuditEntry is one item in one audit class. It carries the review record
// as well, so a reader can tell "never reviewed" from "reviewed, then expired".
type ReviewAuditEntry struct {
	ItemID        string     `json:"item_id"`
	Title         string     `json:"title"`
	SpaceID       string     `json:"space_id"`
	Status        string     `json:"status"`
	OwnerID       *string    `json:"owner_id"`
	ReviewIssueID *string    `json:"review_issue_id"`
	ReviewedAt    *time.Time `json:"reviewed_at"`
	StaleAfter    *time.Time `json:"stale_after"`
}

// ReviewAudit is the read-only answer of `multica knowledge audit`.
type ReviewAudit struct {
	// UnreviewedActive is active knowledge with no recorded approval. It is
	// every row that predates the gate, plus anything a migration or a manual
	// SQL edit made active without going through the reviewer.
	UnreviewedActive []ReviewAuditEntry `json:"unreviewed_active"`
	// Stale is knowledge whose approval has expired.
	Stale []ReviewAuditEntry `json:"stale"`
	// Orphaned is knowledge with no owner, or an owner who is no longer a
	// member of the workspace.
	Orphaned []ReviewAuditEntry `json:"orphaned"`
}

// reviewAuditLimit bounds each class so one command cannot stream a whole
// workspace into a terminal.
const reviewAuditLimit = 500

const reviewAuditColumns = `i.id::text, i.title, i.space_id::text, i.status,
	coalesce(i.owner_id::text, ''), coalesce(i.review_issue_id::text, ''),
	i.reviewed_at, i.stale_after`

// ReviewAudit lists the three classes of questionable knowledge in one
// workspace, as seen by viewerID (the same visibility predicate the listing and
// the retrieval index use). It writes nothing.
func (s *Store) ReviewAudit(ctx context.Context, workspaceID, viewerID string) (ReviewAudit, error) {
	if !isUUIDString(strings.TrimSpace(workspaceID)) {
		return ReviewAudit{}, fmt.Errorf("%w: workspace_id=%q is not a uuid", ErrInvalidField, workspaceID)
	}
	audit := ReviewAudit{}
	unreviewedActive, err := s.reviewAuditQuery(ctx, workspaceID, viewerID, `
		i.status = 'active'
		AND i.reviewed_at IS NULL
		AND coalesce(i.metadata->>'archived', 'false') <> 'true'`)
	if err != nil {
		return ReviewAudit{}, err
	}
	audit.UnreviewedActive = unreviewedActive

	stale, err := s.reviewAuditQuery(ctx, workspaceID, viewerID, `
		i.stale_after IS NOT NULL
		AND i.stale_after < now()
		AND i.status IN ('draft', 'active')
		AND coalesce(i.metadata->>'archived', 'false') <> 'true'`)
	if err != nil {
		return ReviewAudit{}, err
	}
	audit.Stale = stale

	orphaned, err := s.reviewAuditQuery(ctx, workspaceID, viewerID, `
		i.status IN ('draft', 'active')
		AND coalesce(i.metadata->>'archived', 'false') <> 'true'
		AND (i.owner_id IS NULL OR NOT EXISTS (
			SELECT 1 FROM member m
			WHERE m.workspace_id = i.workspace_id AND m.user_id = i.owner_id))`)
	if err != nil {
		return ReviewAudit{}, err
	}
	audit.Orphaned = orphaned
	return audit, nil
}

func (s *Store) reviewAuditQuery(ctx context.Context, workspaceID, viewerID, condition string) ([]ReviewAuditEntry, error) {
	rows, err := s.db.Query(ctx, fmt.Sprintf(`
		SELECT `+reviewAuditColumns+`
		FROM knowledge_items i
		WHERE i.workspace_id = $1 AND `+visCond+` AND %s
		ORDER BY i.updated_at DESC, i.id DESC
		LIMIT %d`, condition, reviewAuditLimit), workspaceID, viewerID)
	if err != nil {
		return nil, fmt.Errorf("read knowledge review audit: %w", err)
	}
	defer rows.Close()

	out := make([]ReviewAuditEntry, 0, 16)
	for rows.Next() {
		var entry ReviewAuditEntry
		var ownerID, issueID string
		if err := rows.Scan(&entry.ItemID, &entry.Title, &entry.SpaceID, &entry.Status,
			&ownerID, &issueID, &entry.ReviewedAt, &entry.StaleAfter); err != nil {
			return nil, fmt.Errorf("scan knowledge review audit row: %w", err)
		}
		if ownerID != "" {
			entry.OwnerID = &ownerID
		}
		if issueID != "" {
			entry.ReviewIssueID = &issueID
		}
		out = append(out, entry)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("read knowledge review audit: %w", err)
	}
	return out, nil
}
