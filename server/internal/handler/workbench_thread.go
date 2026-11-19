package handler

// The workbench's discussion anchor (docs/engineering/COLLAB-MODEL.md §5, batch
// B4-3).
//
// A ledger row's discussion, attachments and @agent all live on an issue; the
// ledger row only keeps a pointer. That pointer is what this file creates, and
// three rules shape it:
//
//	**One thread per row, forever.** `POST …/thread` is not "create a discussion",
//	it is "give me this row's discussion". The first call mints the issue, stamps
//	`origin_type` with the ledger's business name (816) and `origin_id` with the
//	row id; every later call answers with the same issue. Idempotency is answered
//	twice over: from the row's own pointer when it has one, and from
//	`(origin_type, origin_id)` when the pointer was lost or the ledger has no
//	pointer column at all (`creator_quote`).
//
//	**A deleted discussion is said, not 404'd.** Issues leave by being deleted,
//	and the row keeps the pointer. Reading the row then answers `state="gone"` so
//	the screen can say 讨论已归档 instead of failing: the ledger row did not go
//	anywhere, and its money and stage are still answers a reader needs.
//
//	**The thread is opened by whoever may edit the row.** The capability
//	(`crm.write`) and the row's owner are both checked, because a discussion on a
//	row you cannot touch is a comment on somebody else's work.

import (
	"context"
	"net/http"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/jerry-halo2026/morchat.co/server/internal/issuestatus"
	"github.com/jerry-halo2026/morchat.co/server/internal/service"
	db "github.com/jerry-halo2026/morchat.co/server/pkg/db/generated"
)

// Thread states a ledger row can report. `linked` is the normal one; `gone` means
// the row still points at an issue that no longer exists.
const (
	workbenchThreadLinked = "linked"
	workbenchThreadGone   = "gone"
)

// WorkbenchThread is what a ledger row says about its discussion: enough for a
// table cell to render 讨论 N · 最近一条 without opening the issue, and enough for
// the client to build its link.
type WorkbenchThread struct {
	IssueID            string  `json:"issue_id"`
	Number             int32   `json:"number"`
	Title              string  `json:"title"`
	Status             string  `json:"status"`
	State              string  `json:"state"`
	CommentCount       int32   `json:"comment_count"`
	LastCommentAt      *string `json:"last_comment_at"`
	LastCommentPreview *string `json:"last_comment_preview"`
}

// CrmCollabWithThread / BdQuoteWithThread add the thread to the row a list or a
// detail read already answers. They embed the plain response, so the wire shape is
// that response plus one field — an older client ignores it, a newer one renders
// the count.
type CrmCollabWithThread struct {
	CrmCollabResponse
	Thread *WorkbenchThread `json:"thread"`
}

type BdQuoteWithThread struct {
	BdQuoteResponse
	Thread *WorkbenchThread `json:"thread"`
}

// goneThread is the answer for a pointer that no longer resolves. It keeps the
// issue id so the client can still say which discussion it was, and reports zero
// comments rather than pretending the row never had one.
func goneThread(issueID pgtype.UUID) *WorkbenchThread {
	return &WorkbenchThread{
		IssueID:      uuidToString(issueID),
		Status:       "",
		State:        workbenchThreadGone,
		CommentCount: 0,
	}
}

// workbenchThreads resolves the discussion summaries for a page of issue ids in
// one statement. A row whose issue is gone gets a `gone` entry, so a list never
// renders a count for a discussion that is not there.
func (h *Handler) workbenchThreads(ctx context.Context, scope workbenchScope, issueIDs []pgtype.UUID) map[string]*WorkbenchThread {
	out := make(map[string]*WorkbenchThread, len(issueIDs))
	if len(issueIDs) == 0 {
		return out
	}
	rows, err := h.Queries.ListWorkbenchThreadSummaries(ctx, db.ListWorkbenchThreadSummariesParams{
		WorkspaceID: scope.WorkspaceUUID,
		IssueIds:    issueIDs,
	})
	if err != nil {
		// The thread is an annotation on the row, like `last_actor`: a failed read
		// leaves the ledger intact with no thread rather than blanking the page.
		return out
	}
	for _, row := range rows {
		out[uuidToString(row.IssueID)] = &WorkbenchThread{
			IssueID:            uuidToString(row.IssueID),
			Number:             row.Number,
			Title:              row.Title,
			Status:             row.Status,
			State:              workbenchThreadLinked,
			CommentCount:       row.CommentCount,
			LastCommentAt:      timestampToPtr(row.LastCommentAt),
			LastCommentPreview: textPtrOf(row.LastCommentPreview),
		}
	}
	for _, id := range issueIDs {
		if _, found := out[uuidToString(id)]; !found {
			out[uuidToString(id)] = goneThread(id)
		}
	}
	return out
}

// workbenchThreadsByOrigin is {@link workbenchThreads} for a ledger with no
// pointer column: the issue is found by `(origin_type, origin_id)` instead, in one
// query for the whole page, and the answer is keyed by the ledger row id.
func (h *Handler) workbenchThreadsByOrigin(ctx context.Context, scope workbenchScope, originType string, originIDs []pgtype.UUID) map[string]*WorkbenchThread {
	out := make(map[string]*WorkbenchThread, len(originIDs))
	if len(originIDs) == 0 {
		return out
	}
	issues, err := h.Queries.ListIssuesByOrigin(ctx, db.ListIssuesByOriginParams{
		WorkspaceID: scope.WorkspaceUUID,
		OriginType:  originType,
		OriginIds:   originIDs,
	})
	if err != nil {
		// Same rule as `workbenchThreads`: the thread annotates the row, it does not
		// own the page.
		return out
	}
	issueIDs := make([]pgtype.UUID, 0, len(issues))
	byOrigin := make(map[string]pgtype.UUID, len(issues))
	for _, issue := range issues {
		issueIDs = append(issueIDs, issue.ID)
		byOrigin[uuidToString(issue.OriginID)] = issue.ID
	}
	threads := h.workbenchThreads(ctx, scope, issueIDs)
	for originID, issueID := range byOrigin {
		out[originID] = threads[uuidToString(issueID)]
	}
	return out
}

// workbenchThread is the single-row form.
func (h *Handler) workbenchThread(ctx context.Context, scope workbenchScope, issueID pgtype.UUID) *WorkbenchThread {
	if !issueID.Valid {
		return nil
	}
	return h.workbenchThreads(ctx, scope, []pgtype.UUID{issueID})[uuidToString(issueID)]
}

// collabIssueIDs / quoteIssueIDs collect the pointers a page holds.
func collabIssueIDs(rows []db.CrmCollab) []pgtype.UUID {
	out := make([]pgtype.UUID, 0, len(rows))
	for _, row := range rows {
		if row.IssueID.Valid {
			out = append(out, row.IssueID)
		}
	}
	return out
}

// ---- opening a thread ------------------------------------------------------

// threadSubject is one ledger row a discussion can hang off. `IssueID` is the
// pointer the row already carries (zero when it has none).
type threadSubject struct {
	// OriginType is the ledger's business name, the same word `activity_log`'s
	// `subject_type` uses (COLLAB-MODEL §2) and the value 816 widened
	// `issue.origin_type` to accept.
	OriginType string
	RowID      pgtype.UUID
	IssueID    pgtype.UUID
	Title      string
	// Body is the issue description: the row's own facts, so the discussion opens
	// with the thing being discussed instead of an empty issue.
	Body         string
	OwnerMember  pgtype.UUID
	AssigneeType pgtype.Text
	AssigneeID   pgtype.UUID
}

// CreateCrmCollabThread — POST /api/workbench/crm/collabs/{collabId}/thread
func (h *Handler) CreateCrmCollabThread(w http.ResponseWriter, r *http.Request) {
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
	if !workbenchCanWrite(scope.Member, current.OwnerMemberID) {
		writeError(w, http.StatusForbidden, "you can only open a discussion on a collaboration you can edit")
		return
	}
	h.openWorkbenchThread(w, r, scope, threadSubject{
		OriginType:   subjectCrmCollab,
		RowID:        current.ID,
		IssueID:      current.IssueID,
		Title:        "Cooperation · " + current.Stage,
		Body:         collabThreadBody(current),
		OwnerMember:  current.OwnerMemberID,
		AssigneeType: current.AssigneeType,
		AssigneeID:   current.AssigneeID,
	})
}

// CreateBdQuoteThread — POST /api/workbench/bd/quotes/{quoteId}/thread
//
// `creator_quote` carries no pointer column, so its idempotency is answered
// entirely by `(origin_type, origin_id)`: the second call finds the issue the
// first one stamped, and nothing is minted twice.
func (h *Handler) CreateBdQuoteThread(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	if !h.requireWorkbenchCapability(w, r, scope, capCRMWrite) {
		return
	}
	current, ok := h.loadBdQuoteForWrite(w, r, scope)
	if !ok {
		return
	}
	if !workbenchCanWrite(scope.Member, current.OwnerMemberID) {
		writeError(w, http.StatusForbidden, "you can only open a discussion on a quote you can edit")
		return
	}
	h.openWorkbenchThread(w, r, scope, threadSubject{
		OriginType:   subjectCreatorQuote,
		RowID:        current.ID,
		Title:        "Quote · " + current.Status,
		Body:         quoteThreadBody(current),
		OwnerMember:  current.OwnerMemberID,
		AssigneeType: current.AssigneeType,
		AssigneeID:   current.AssigneeID,
	})
}

// openWorkbenchThread is the shared body of the two endpoints: resolve, create if
// needed, backfill the pointer, answer with the thread.
//
// The advisory lock is per ledger row and dies with the transaction. It makes the
// check-then-create below a critical section even though the issue itself is
// created through the issue service on its own connection: two concurrent clicks
// queue here, the second one finds the pointer the first wrote.
func (h *Handler) openWorkbenchThread(w http.ResponseWriter, r *http.Request, scope workbenchScope, subject threadSubject) {
	ctx := r.Context()

	// Fast path: the row already points at a live issue. No lock, no write.
	if thread := h.workbenchThread(ctx, scope, subject.IssueID); thread != nil && thread.State == workbenchThreadLinked {
		writeJSON(w, http.StatusOK, thread)
		return
	}
	// The id is stamped but the issue is gone (deleted): fall through and mint a
	// fresh discussion rather than answering with a pointer to nothing.

	tx, err := h.TxStarter.Begin(ctx)
	if err != nil {
		workbenchInternalError(w, r, "failed to open the discussion", err)
		return
	}
	defer tx.Rollback(ctx)
	qtx := h.Queries.WithTx(tx)

	lockKey := scope.WorkspaceID + ":" + subject.OriginType + ":" + uuidToString(subject.RowID)
	if _, err := tx.Exec(ctx, "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", lockKey); err != nil {
		workbenchInternalError(w, r, "failed to open the discussion", err)
		return
	}

	// Second chance: another request may have opened the thread while this one was
	// waiting for the lock. The origin pair is the authority, not the pointer.
	if existing, found := h.issueByOrigin(ctx, scope, subject); found {
		if err := h.backfillThreadPointer(ctx, qtx, scope, subject, existing.ID); err != nil {
			workbenchInternalError(w, r, "failed to open the discussion", err)
			return
		}
		if err := tx.Commit(ctx); err != nil {
			workbenchInternalError(w, r, "failed to open the discussion", err)
			return
		}
		writeJSON(w, http.StatusOK, h.workbenchThread(ctx, scope, existing.ID))
		return
	}

	actor := h.workbenchActor(r, scope)
	issue, err := h.createThreadIssue(ctx, scope, subject, actor)
	if err != nil {
		workbenchInternalError(w, r, "failed to create the discussion issue", err)
		return
	}
	if err := h.backfillThreadPointer(ctx, qtx, scope, subject, issue.ID); err != nil {
		workbenchInternalError(w, r, "failed to open the discussion", err)
		return
	}
	if err := tx.Commit(ctx); err != nil {
		workbenchInternalError(w, r, "failed to open the discussion", err)
		return
	}
	writeJSON(w, http.StatusCreated, h.workbenchThread(ctx, scope, issue.ID))
}

// issueByOrigin finds the issue stamped with this row's (origin_type, origin_id).
func (h *Handler) issueByOrigin(ctx context.Context, scope workbenchScope, subject threadSubject) (db.Issue, bool) {
	if strings.TrimSpace(subject.OriginType) == "" || !subject.RowID.Valid {
		return db.Issue{}, false
	}
	issue, err := h.Queries.GetIssueByOrigin(ctx, db.GetIssueByOriginParams{
		WorkspaceID: scope.WorkspaceUUID,
		OriginType:  pgtype.Text{String: subject.OriginType, Valid: true},
		OriginID:    subject.RowID,
	})
	if err != nil {
		return db.Issue{}, false
	}
	return issue, true
}

// backfillThreadPointer writes the issue id onto the ledger row and records why.
// A ledger without a pointer column (`creator_quote`) has nothing to write, and
// the origin pair already carries the link.
func (h *Handler) backfillThreadPointer(ctx context.Context, qtx *db.Queries, scope workbenchScope, subject threadSubject, issueID pgtype.UUID) error {
	if subject.OriginType != subjectCrmCollab {
		return nil
	}
	if subject.IssueID == issueID {
		return nil
	}
	rows, err := qtx.SetCrmCollabIssue(ctx, db.SetCrmCollabIssueParams{
		ID:          subject.RowID,
		WorkspaceID: scope.WorkspaceUUID,
		IssueID:     issueID,
	})
	if err != nil {
		return err
	}
	if rows == 0 {
		// The row moved on: either it was deleted, or another writer pointed it at a
		// different issue between the check and this update. Neither is this
		// request's to overwrite — the guarded UPDATE is what makes that true.
		return nil
	}
	actor := workbenchActor{Type: "system"}
	_, err = recordWorkbenchActivity(ctx, qtx, scope, subjectCrmCollab, subject.RowID,
		subjectCrmCollab+".thread_opened", actor, pgtype.UUID{}, auditUpdate,
		[]auditField{{name: "issue_id", before: uuidToPtr(subject.IssueID), after: uuidToPtr(issueID)}})
	return err
}

// createThreadIssue mints the issue through the issue service, so the thread is a
// first-class issue: numbered, indexed into search, watchable, assignable.
//
// The project is the department inbox (ORG-MODEL §3.4) when the workspace has the
// department scope switch on; otherwise the issue is workspace-visible, which is
// exactly what an issue created without a project has always been.
func (h *Handler) createThreadIssue(ctx context.Context, scope workbenchScope, subject threadSubject, actor workbenchActor) (db.Issue, error) {
	var projectID pgtype.UUID
	if project, ok, err := h.departmentInboxForIssue(ctx, scope.WorkspaceUUID, scope.Member.UserID); err == nil && ok {
		projectID = project.ID
	}

	creatorType := actor.Type
	creatorID := actor.ID
	if creatorType != "agent" || !creatorID.Valid {
		creatorType = "member"
		creatorID = scope.Member.UserID
	}

	assigneeType := pgtype.Text{}
	assigneeID := pgtype.UUID{}
	if subject.AssigneeType.Valid && subject.AssigneeID.Valid {
		if subject.AssigneeType.String == "member" || subject.AssigneeType.String == "agent" {
			assigneeType = subject.AssigneeType
			assigneeID = subject.AssigneeID
		}
	}

	result, err := h.IssueService.Create(ctx, service.IssueCreateParams{
		WorkspaceID:   scope.WorkspaceUUID,
		Title:         subject.Title,
		Description:   pgtype.Text{String: subject.Body, Valid: strings.TrimSpace(subject.Body) != ""},
		Status:        issuestatus.Todo,
		Priority:      "none",
		AssigneeType:  assigneeType,
		AssigneeID:    assigneeID,
		CreatorType:   creatorType,
		CreatorID:     creatorID,
		ProjectID:     projectID,
		OriginType:    pgtype.Text{String: subject.OriginType, Valid: true},
		OriginID:      subject.RowID,
		AllowDuplicate: true,
	}, service.IssueCreateOpts{ActorID: uuidToString(creatorID)})
	if err != nil {
		return db.Issue{}, err
	}
	return result.Issue, nil
}

// collabThreadBody / quoteThreadBody open the discussion with the row's own facts,
// so the first reader does not have to go back to the ledger to know what is being
// discussed. Money is printed with its currency and never summed (COLLAB-MODEL §8).
func collabThreadBody(c db.CrmCollab) string {
	var b strings.Builder
	b.WriteString("Cooperation in stage " + c.Stage + ".")
	if amount := numericToFloatPtr(c.FinalAmount); amount != nil {
		b.WriteString(" Final amount: " + strings.TrimSpace(c.Currency) + " " + formatAmount(*amount) + ".")
	} else if amount := numericToFloatPtr(c.QuoteAmount); amount != nil {
		b.WriteString(" Quoted: " + strings.TrimSpace(c.Currency) + " " + formatAmount(*amount) + ".")
	}
	if settled := dateToString(c.SettledOn); settled != "" {
		b.WriteString(" Settled on " + settled + ".")
	}
	return b.String()
}

func quoteThreadBody(q db.CreatorQuote) string {
	var b strings.Builder
	b.WriteString("Quote in status " + q.Status + ".")
	if amount := numericToFloatPtr(q.FeeAmount); amount != nil {
		b.WriteString(" Slot fee: " + strings.TrimSpace(q.Currency) + " " + formatAmount(*amount) + ".")
	}
	if valid := dateToString(q.ValidUntil); valid != "" {
		b.WriteString(" Valid until " + valid + ".")
	}
	return b.String()
}

// textPtrOf keeps an empty preview as nil so the client renders "no comment yet"
// rather than an empty line; the SQL already cuts the text at 140 runes.
func textPtrOf(value string) *string {
	if strings.TrimSpace(value) == "" {
		return nil
	}
	return &value
}

// formatAmount prints a money figure with two decimals and no thousands
// separators: the number is data, the client formats it for its locale.
func formatAmount(value float64) string {
	return strconv.FormatFloat(value, 'f', 2, 64)
}
