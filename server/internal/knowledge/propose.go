package knowledge

// Proposals: what an agent may do with the knowledge base.
//
// An agent cannot make knowledge trustworthy, so it does not get to say that it
// did. `knowledge.propose` writes a draft item and one review issue, and stops
// there: the item becomes active only when a human approves it through the gate
// (handler/knowledge_review.go).
//
// The issue is created by the caller, not here. Issue creation owns numbering,
// duplicate guards, broadcasts, labels and analytics, and a second insert path
// inside this package would be a second place for all of that to drift — so the
// HTTP layer wires its one issue service in as ReviewIssueCreator.

import (
	"context"
	"errors"
	"fmt"
	"strings"
)

// ReviewIssueInput is one review issue to create. Body and Title are already
// formatted; AssigneeID may be empty when the workspace has nobody to assign.
type ReviewIssueInput struct {
	WorkspaceID string
	// RequesterID is the human the proposing run acts for. It is the issue's
	// creator, so the review is attributed to a person rather than to a model.
	RequesterID string
	Title       string
	Body        string
	AssigneeID  string
	ItemID      string
	SpaceID     string
	SpaceName   string
	SourceRef   string
}

// ReviewIssueCreator creates the review issue for a proposal and returns its id.
type ReviewIssueCreator func(ctx context.Context, in ReviewIssueInput) (string, error)

// ErrProposeUnavailable is returned when no issue creator is wired. A deployment
// that cannot open issues cannot accept proposals: answering "written" there
// would strand a draft nobody can ever approve.
var ErrProposeUnavailable = errors.New("knowledge: propose is not wired to issue creation")

// WithReviewIssueCreator wires the issue service a proposal uses.
func WithReviewIssueCreator(create ReviewIssueCreator) Option {
	return func(s *Service) {
		if create != nil {
			s.reviewIssues = create
		}
	}
}

// ProposeRequest is one agent proposal.
type ProposeRequest struct {
	WorkspaceID string
	// OwnerID is the human the run acts for; the draft is theirs.
	OwnerID   string
	SpaceID   string
	Title     string
	Content   string
	SourceRef string
}

// ProposeResult names what a proposal produced. Status is always draft: a
// proposal that answered "active" would be the gate answering itself.
type ProposeResult struct {
	ItemID  string `json:"item_id"`
	IssueID string `json:"issue_id"`
	SpaceID string `json:"space_id"`
	Status  string `json:"status"`
}

// reviewBody renders the review issue body: where the knowledge came from, which
// space it would land in, what it says, and the item it is about.
func reviewBody(in ReviewIssueInput, content string) string {
	summary := strings.Join(strings.Fields(content), " ")
	if len(summary) > 400 {
		summary = summary[:400] + "…"
	}
	var b strings.Builder
	b.WriteString("一条知识提案等待入库审阅。通过审阅后条目才会变为 `active`。\n\n")
	b.WriteString("## 来源\n\n")
	if source := strings.TrimSpace(in.SourceRef); source != "" {
		b.WriteString(source)
	} else {
		b.WriteString("(未提供)")
	}
	b.WriteString("\n\n## 空间\n\n")
	b.WriteString(in.SpaceName)
	if in.SpaceID != "" {
		b.WriteString(" (`" + in.SpaceID + "`)")
	}
	b.WriteString("\n\n## 摘要\n\n")
	if summary == "" {
		summary = "(无正文)"
	}
	b.WriteString(summary)
	b.WriteString("\n\n## 条目\n\n")
	b.WriteString("knowledge_item_id: `" + in.ItemID + "`\n")
	return b.String()
}

// Propose stores a draft item and opens its review issue.
//
// The order is item first, issue second: the issue body has to name the item, so
// an issue cannot come first. A failure after the draft is written leaves a
// draft nobody is asked to review — visible in the listing and in the orphan
// audit, and the error names the item id so the caller can retry or archive it.
func (s *Service) Propose(ctx context.Context, in ProposeRequest) (ProposeResult, error) {
	if s.reviewIssues == nil {
		return ProposeResult{}, ErrProposeUnavailable
	}
	if strings.TrimSpace(in.Title) == "" {
		return ProposeResult{}, fmt.Errorf("%w: title is required", ErrInvalidField)
	}
	if strings.TrimSpace(in.Content) == "" {
		return ProposeResult{}, fmt.Errorf("%w: content is required", ErrInvalidField)
	}
	spaceID := strings.TrimSpace(in.SpaceID)
	if spaceID == "" {
		var err error
		if spaceID, err = s.EnsureDefaultSpace(ctx, in.WorkspaceID); err != nil {
			return ProposeResult{}, err
		}
	}

	ownerID := in.OwnerID
	item, _, err := s.CreateItem(ctx, NewItem{
		WorkspaceID: in.WorkspaceID,
		SpaceID:     spaceID,
		Title:       strings.TrimSpace(in.Title),
		Kind:        KindNote,
		SourceType:  SourceTypeUpload,
		SourceRef:   strings.TrimSpace(in.SourceRef),
		Status:      StatusDraft,
		OwnerID:     optionalString(ownerID),
	}, in.Content, "text/markdown")
	if err != nil {
		return ProposeResult{}, err
	}

	assignee, reviewers, err := s.ReviewAssignee(ctx, in.WorkspaceID, spaceID)
	if err != nil {
		return ProposeResult{ItemID: item.ID, SpaceID: spaceID, Status: item.Status}, err
	}

	issue := ReviewIssueInput{
		WorkspaceID: in.WorkspaceID,
		RequesterID: ownerID,
		Title:       "[知识入库] " + item.Title,
		AssigneeID:  assignee,
		ItemID:      item.ID,
		SpaceID:     spaceID,
		SpaceName:   reviewers.SpaceName,
		SourceRef:   in.SourceRef,
	}
	issue.Body = reviewBody(issue, in.Content)

	issueID, err := s.reviewIssues(ctx, issue)
	if err != nil {
		return ProposeResult{ItemID: item.ID, SpaceID: spaceID, Status: item.Status},
			fmt.Errorf("create review issue for knowledge item %s: %w", item.ID, err)
	}
	if _, err := s.store.SetReviewIssue(ctx, in.WorkspaceID, item.ID, issueID); err != nil {
		return ProposeResult{ItemID: item.ID, IssueID: issueID, SpaceID: spaceID, Status: item.Status}, err
	}

	return ProposeResult{
		ItemID:  item.ID,
		IssueID: issueID,
		SpaceID: spaceID,
		Status:  item.Status,
	}, nil
}
