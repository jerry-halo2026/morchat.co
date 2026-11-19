package handler

// The review gate's API and the three verifiability metrics
// (docs/engineering/WORKBENCH-API.md §26, docs/engineering/COLLAB-MODEL.md §7).
//
// §26 answers one question — "how would I know the agent got it wrong?" — with
// three parts that only work together:
//
//	review_state   a row an agent wrote (or a human wrote a high-value field on)
//	               arrives `pending` and waits in this queue.
//	overwrite      when a human changes a row an agent last wrote, they say WHY
//	               (wrong_fact|wrong_judgement|stale|taste). Without that, "a human
//	               changed it" cannot be told from "a human prefers it differently".
//	slices         the three rates below, per (agent, domain), never one score.
//
// The rates are computed from `activity_log` rather than from the ledgers because
// the trail is where "an agent wrote this, then a human changed it and said why"
// actually lives. Each one ships its numerator and denominator separately: a
// 1-of-2 cell and a 50-of-100 cell are not the same evidence.
//
// Nothing here decides who may review beyond `review.accept` (§26.1): the
// capability system already answers that, and an agent is refused outright — a
// machine reviewing its own writes is the one thing this queue exists to prevent.

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"sort"
	"strings"
	"unicode/utf8"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	db "github.com/jerry-halo2026/morchat.co/server/pkg/db/generated"
)

// The four domains the queue covers, in the order the endpoint documents them.
const (
	reviewDomainCollabs     = "collabs"
	reviewDomainQuotes      = "quotes"
	reviewDomainActivities  = "activities"
	reviewDomainSettlements = "settlements"

	// reviewRejectReasonMaxRunes bounds a rejection's reason (§26.1: at most 500
	// characters).
	reviewRejectReasonMaxRunes = 500

	// reviewRejectMinSamples is §26.4's floor for `agent.review.reject_rate`: under
	// five decisions a ratio is an anecdote, so the metric answers
	// `insufficient_data` rather than a percentage.
	reviewRejectMinSamples = 5
)

// The metric ids, spelled once: the catalog in workbench_metrics.go and the
// slices below must agree, or the board shows an id nobody computes.
const (
	metricAgentOverwriteRate = "agent.write.overwrite_rate"
	metricAgentRejectRate    = "agent.review.reject_rate"
	metricAgentRollbackRate  = "agent.action.rollback_rate"
)

// WorkbenchReview is the review block a ledger row carries: its state, and who
// decided it. `state` is always one of the three values — a row that was never
// reviewed reads `accepted`, which is what the column defaults to.
type WorkbenchReview struct {
	State      string  `json:"state"`
	ReviewedBy *string `json:"reviewed_by"`
	ReviewedAt *string `json:"reviewed_at"`
}

func reviewOf(state string, reviewedBy pgtype.UUID, reviewedAt pgtype.Timestamptz) WorkbenchReview {
	if strings.TrimSpace(state) == "" {
		state = reviewAccepted
	}
	return WorkbenchReview{
		State:      state,
		ReviewedBy: uuidToPtr(reviewedBy),
		ReviewedAt: timestampToPtr(reviewedAt),
	}
}

// WorkbenchReviewItem is one row in the queue. `label` is the creator's name and
// `detail` the ledger's own status word (a collab's stage, a quote's status, a
// follow-up's kind), so the queue is readable without opening every row.
type WorkbenchReviewItem struct {
	Domain       string  `json:"domain"`
	ID           string  `json:"id"`
	Label        string  `json:"label"`
	Detail       string  `json:"detail"`
	ReviewState  string  `json:"review_state"`
	UpdatedAt    string  `json:"updated_at"`
	Revision     int32   `json:"revision"`
	AssigneeType *string `json:"assignee_type"`
	AssigneeID   *string `json:"assignee_id"`
}

// WorkbenchReviewQueueResponse is `GET /api/workbench/review`. `total` is the
// number of rows on this page (contract §3.1), not the queue's size.
type WorkbenchReviewQueueResponse struct {
	Items []WorkbenchReviewItem `json:"items"`
	Total int                   `json:"total"`
}

// WorkbenchReviewDecisionRequest is the reject body (§26.2): a reason is
// mandatory, because "rejected" with no sentence teaches nobody anything.
type WorkbenchReviewDecisionRequest struct {
	Reason *string `json:"reason"`
}

// AgentMetricSlice is one `(agent, domain)` cell of the three verifiability
// metrics. It is a slice and not a score on purpose (§26.4): "this agent is 82 %
// right" is not a fact, while "on quotes this agent's writes were changed within a
// week 4 times out of 5" is.
type AgentMetricSlice struct {
	Metric  string `json:"metric"`
	AgentID string `json:"agent_id"`
	Domain  string `json:"domain"`
	WorkbenchMetricValue
}

// reviewDomain ties the wire name to the audit subject the trail uses.
type reviewDomain struct {
	wire    string
	subject string
}

func workbenchReviewDomains() []reviewDomain {
	return []reviewDomain{
		{reviewDomainCollabs, subjectCrmCollab},
		{reviewDomainQuotes, subjectCreatorQuote},
		{reviewDomainActivities, subjectCreatorActivity},
		{reviewDomainSettlements, subjectCrmSettlement},
	}
}

func workbenchReviewDomain(raw string) (reviewDomain, bool) {
	wire := strings.TrimSpace(raw)
	for _, domain := range workbenchReviewDomains() {
		if domain.wire == wire {
			return domain, true
		}
	}
	return reviewDomain{}, false
}

// reviewDomainNames is the vocabulary a caller is told about, spelled once.
func reviewDomainNames() []string {
	domains := workbenchReviewDomains()
	names := make([]string, 0, len(domains))
	for _, domain := range domains {
		names = append(names, domain.wire)
	}
	return names
}

// ---- the queue -------------------------------------------------------------

// GetWorkbenchReviewQueue — GET /api/workbench/review?domain=&limit=
//
// `domain` omitted means "every ledger", which is the screen a reviewer actually
// wants: the four queues merged newest-first. Each domain's page is read with the
// same limit and the merge is cut to it, so one busy ledger cannot crowd the others
// out entirely within the page.
func (h *Handler) GetWorkbenchReviewQueue(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	if !h.requireWorkbenchCapability(w, r, scope, capReviewAccept) {
		return
	}
	domains := workbenchReviewDomains()
	if raw := strings.TrimSpace(r.URL.Query().Get("domain")); raw != "" {
		domain, known := workbenchReviewDomain(raw)
		if !known {
			writeError(w, http.StatusBadRequest,
				"domain must be one of: "+strings.Join(reviewDomainNames(), ", "))
			return
		}
		domains = []reviewDomain{domain}
	}
	limit := workbenchLimit(r)

	items := make([]WorkbenchReviewItem, 0, limit)
	for _, domain := range domains {
		page, err := h.pendingReviewItems(r.Context(), scope, domain, limit)
		if err != nil {
			workbenchInternalError(w, r, "failed to read the review queue", err)
			return
		}
		items = append(items, page...)
	}
	sort.SliceStable(items, func(i, j int) bool {
		if items[i].UpdatedAt != items[j].UpdatedAt {
			return items[i].UpdatedAt > items[j].UpdatedAt
		}
		return items[i].ID < items[j].ID
	})
	if int32(len(items)) > limit {
		items = items[:limit]
	}
	writeJSON(w, http.StatusOK, WorkbenchReviewQueueResponse{Items: items, Total: len(items)})
}

// pendingReviewItems reads one domain's pending page.
func (h *Handler) pendingReviewItems(ctx context.Context, scope workbenchScope, domain reviewDomain, limit int32) ([]WorkbenchReviewItem, error) {
	items := make([]WorkbenchReviewItem, 0, limit)
	switch domain.wire {
	case reviewDomainCollabs:
		rows, err := h.Queries.ListPendingCrmCollabs(ctx, db.ListPendingCrmCollabsParams{
			WorkspaceID: scope.WorkspaceUUID, Limit: limit,
		})
		if err != nil {
			return nil, err
		}
		for _, row := range rows {
			items = append(items, reviewItemOf(domain, row.ID, row.Label, row.Detail, row.ReviewState,
				row.UpdatedAt, row.Revision, row.AssigneeType, row.AssigneeID))
		}
	case reviewDomainQuotes:
		rows, err := h.Queries.ListPendingCreatorQuotes(ctx, db.ListPendingCreatorQuotesParams{
			WorkspaceID: scope.WorkspaceUUID, Limit: limit,
		})
		if err != nil {
			return nil, err
		}
		for _, row := range rows {
			items = append(items, reviewItemOf(domain, row.ID, row.Label, row.Detail, row.ReviewState,
				row.UpdatedAt, row.Revision, row.AssigneeType, row.AssigneeID))
		}
	case reviewDomainActivities:
		rows, err := h.Queries.ListPendingCreatorActivities(ctx, db.ListPendingCreatorActivitiesParams{
			WorkspaceID: scope.WorkspaceUUID, Limit: limit,
		})
		if err != nil {
			return nil, err
		}
		for _, row := range rows {
			items = append(items, reviewItemOf(domain, row.ID, row.Label, row.Detail, row.ReviewState,
				row.UpdatedAt, row.Revision, row.AssigneeType, row.AssigneeID))
		}
	case reviewDomainSettlements:
		rows, err := h.Queries.ListPendingCrmSettlements(ctx, db.ListPendingCrmSettlementsParams{
			WorkspaceID: scope.WorkspaceUUID, Limit: limit,
		})
		if err != nil {
			return nil, err
		}
		for _, row := range rows {
			items = append(items, reviewItemOf(domain, row.ID, row.Label, row.Detail, row.ReviewState,
				row.UpdatedAt, row.Revision, row.AssigneeType, row.AssigneeID))
		}
	default:
		return nil, fmt.Errorf("unknown review domain %q", domain.wire)
	}
	return items, nil
}

func reviewItemOf(
	domain reviewDomain,
	id pgtype.UUID,
	label, detail, state string,
	updatedAt pgtype.Timestamptz,
	revision int32,
	assigneeType pgtype.Text,
	assigneeID pgtype.UUID,
) WorkbenchReviewItem {
	return WorkbenchReviewItem{
		Domain:       domain.wire,
		ID:           uuidToString(id),
		Label:        label,
		Detail:       detail,
		ReviewState:  state,
		UpdatedAt:    timestampToString(updatedAt),
		Revision:     revision,
		AssigneeType: textToPtr(assigneeType),
		AssigneeID:   uuidToPtr(assigneeID),
	}
}

// ---- decisions -------------------------------------------------------------

// AcceptWorkbenchReview — POST /api/workbench/review/{domain}/{id}/accept
func (h *Handler) AcceptWorkbenchReview(w http.ResponseWriter, r *http.Request) {
	h.decideWorkbenchReview(w, r, reviewAccepted)
}

// RejectWorkbenchReview — POST /api/workbench/review/{domain}/{id}/reject
func (h *Handler) RejectWorkbenchReview(w http.ResponseWriter, r *http.Request) {
	h.decideWorkbenchReview(w, r, reviewRejected)
}

// decideWorkbenchReview is one decision, shared by both verbs.
//
// Three things it deliberately does:
//
//   - **A human decides.** An agent holding `review.accept` through its delegator
//     is refused: a machine accepting a machine's write is the failure this queue
//     exists to catch (§7.2).
//   - **Only a pending row moves.** The decision statement filters
//     `review_state = 'pending'`, so a second accept is a 409 rather than a second
//     audit line claiming the same decision twice.
//   - **The trail says what was judged.** `details.subject_agent_id` records the
//     agent whose write was reviewed, which is what lets
//     `agent.review.reject_rate` be sliced per agent without re-walking history.
func (h *Handler) decideWorkbenchReview(w http.ResponseWriter, r *http.Request, target string) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	if !h.requireWorkbenchCapability(w, r, scope, capReviewAccept) {
		return
	}
	actor := h.workbenchActor(r, scope)
	if actor.isAgent() {
		writeError(w, http.StatusForbidden,
			"a review must be decided by a person: an agent may not approve its own writes")
		return
	}

	domain, known := workbenchReviewDomain(chi.URLParam(r, "domain"))
	if !known {
		writeError(w, http.StatusBadRequest,
			"domain must be one of: "+strings.Join(reviewDomainNames(), ", "))
		return
	}
	id, ok := parseUUIDOrBadRequest(w, chi.URLParam(r, "id"), "review id")
	if !ok {
		return
	}

	reason := ""
	if target == reviewRejected {
		var req WorkbenchReviewDecisionRequest
		if !decodeWorkbenchBody(w, r, &req) {
			return
		}
		if req.Reason == nil || strings.TrimSpace(*req.Reason) == "" {
			writeError(w, http.StatusBadRequest, "a rejection needs a reason")
			return
		}
		reason = strings.TrimSpace(*req.Reason)
		if utf8.RuneCountInString(reason) > reviewRejectReasonMaxRunes {
			writeError(w, http.StatusBadRequest,
				fmt.Sprintf("reason must be at most %d characters", reviewRejectReasonMaxRunes))
			return
		}
	}

	// What the queue is judging: the agent that wrote the row, if the newest event
	// is an agent's. Read before the update, because the update's own audit line
	// becomes the newest event.
	last := h.lastWorkbenchActor(r.Context(), scope, domain.subject, id)
	subjectAgent := ""
	if last != nil && last.Type == "agent" && last.ID != nil {
		subjectAgent = *last.ID
	}

	tx, err := h.TxStarter.Begin(r.Context())
	if err != nil {
		workbenchInternalError(w, r, "failed to record the review", err)
		return
	}
	defer tx.Rollback(r.Context())
	qtx := h.Queries.WithTx(tx)

	found, err := h.setReviewState(r.Context(), qtx, scope, domain, id, target)
	if err != nil {
		workbenchInternalError(w, r, "failed to record the review", err)
		return
	}
	if !found {
		// Either the row is not here, or somebody already decided it.
		_ = tx.Rollback(r.Context())
		if h.reviewRowExists(r.Context(), scope, domain, id) {
			writeError(w, http.StatusConflict, "this row is not pending: it was already reviewed")
			return
		}
		writeError(w, http.StatusNotFound, "review row not found")
		return
	}

	extras := auditExtras{Reason: reason}
	if subjectAgent != "" {
		agent := subjectAgent
		extras.SubjectAgentID = &agent
	}
	reviewer := workbenchActor{Type: "member", ID: scope.Member.UserID}
	action := domain.subject + ".review_accepted"
	if target == reviewRejected {
		action = domain.subject + ".review_rejected"
	}
	if _, err := recordWorkbenchActivityExtras(r.Context(), qtx, scope, domain.subject, id,
		action, reviewer, pgtype.UUID{}, auditUpdate, nil, extras); err != nil {
		workbenchInternalError(w, r, "failed to record the review's audit line", err)
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		workbenchInternalError(w, r, "failed to record the review", err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// setReviewState applies one decision. `found=false` means no pending row carried
// that id (already decided, or not here); the caller tells 409 from 404.
func (h *Handler) setReviewState(ctx context.Context, q *db.Queries, scope workbenchScope, domain reviewDomain, id pgtype.UUID, state string) (bool, error) {
	var err error
	switch domain.wire {
	case reviewDomainCollabs:
		_, err = q.SetCrmCollabReview(ctx, db.SetCrmCollabReviewParams{
			ReviewState: state, ReviewedBy: scope.Member.UserID, ID: id, WorkspaceID: scope.WorkspaceUUID,
		})
	case reviewDomainQuotes:
		_, err = q.SetCreatorQuoteReview(ctx, db.SetCreatorQuoteReviewParams{
			ReviewState: state, ReviewedBy: scope.Member.UserID, ID: id, WorkspaceID: scope.WorkspaceUUID,
		})
	case reviewDomainActivities:
		_, err = q.SetCreatorActivityReview(ctx, db.SetCreatorActivityReviewParams{
			ReviewState: state, ReviewedBy: scope.Member.UserID, ID: id, WorkspaceID: scope.WorkspaceUUID,
		})
	case reviewDomainSettlements:
		_, err = q.SetCrmSettlementReview(ctx, db.SetCrmSettlementReviewParams{
			ReviewState: state, ReviewedBy: scope.Member.UserID, ID: id, WorkspaceID: scope.WorkspaceUUID,
		})
	default:
		return false, fmt.Errorf("unknown review domain %q", domain.wire)
	}
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	return err == nil, err
}

// reviewRowExists answers 404 vs 409 after a decision found nothing to update.
func (h *Handler) reviewRowExists(ctx context.Context, scope workbenchScope, domain reviewDomain, id pgtype.UUID) bool {
	var err error
	switch domain.wire {
	case reviewDomainCollabs:
		_, err = h.Queries.GetCrmCollab(ctx, db.GetCrmCollabParams{ID: id, WorkspaceID: scope.WorkspaceUUID})
	case reviewDomainQuotes:
		_, err = h.Queries.GetCreatorQuote(ctx, db.GetCreatorQuoteParams{ID: id, WorkspaceID: scope.WorkspaceUUID})
	case reviewDomainActivities:
		_, err = h.Queries.GetCreatorActivity(ctx, db.GetCreatorActivityParams{ID: id, WorkspaceID: scope.WorkspaceUUID})
	case reviewDomainSettlements:
		_, err = h.Queries.GetCrmSettlement(ctx, db.GetCrmSettlementParams{ID: id, WorkspaceID: scope.WorkspaceUUID})
	default:
		return false
	}
	return err == nil
}

// ---- the three slices (§26.4) ----------------------------------------------

// workbenchAgentMetricSlices computes all three from the audit trail.
//
// Formulas (§26.4), each over the last 30 days:
//
//	agent.write.overwrite_rate  = rows an agent wrote and a human changed within
//	                              7 days *with* an overwrite_reason / rows the agent wrote
//	agent.review.reject_rate    = review_rejected / (review_accepted + review_rejected),
//	                              sliced by the agent whose row was judged; needs 5+ decisions
//	agent.action.rollback_rate  = rows an agent wrote and a human put *back* (every field
//	                              they wrote carries the value the agent had replaced)
//	                              / rows the agent wrote
//
// The two denominators are the same and come from one pass; a workspace with no
// agent writes answers no slices at all rather than a row of zeros, which is what
// the three-state rule asks for.
func (h *Handler) workbenchAgentMetricSlices(ctx context.Context, scope workbenchScope) ([]AgentMetricSlice, error) {
	slices := make([]AgentMetricSlice, 0, 8)

	overwrite, err := h.Queries.OverviewAgentOverwriteRate(ctx, scope.WorkspaceUUID)
	if err != nil {
		return nil, err
	}
	for _, row := range overwrite {
		value, computable := ratioValue(float64(row.Hits), float64(row.Samples))
		slices = append(slices, agentMetricSlice(metricAgentOverwriteRate, uuidToString(row.AgentID),
			row.Domain.String, value, computable, row.Samples))
	}

	rejects, err := h.Queries.OverviewAgentRejectRate(ctx, scope.WorkspaceUUID)
	if err != nil {
		return nil, err
	}
	for _, row := range rejects {
		value, computable := ratioValue(float64(row.Rejected), float64(row.Decided))
		if computable && row.Decided < reviewRejectMinSamples {
			// A ratio over four decisions is an anecdote; the contract says so
			// (§26.4: fewer than 5 samples is insufficient_data).
			computable = false
		}
		slices = append(slices, agentMetricSlice(metricAgentRejectRate, row.AgentID,
			row.Domain.String, value, computable, row.Decided))
	}

	rollbacks, err := h.Queries.OverviewAgentRollbackRate(ctx, scope.WorkspaceUUID)
	if err != nil {
		return nil, err
	}
	for _, row := range rollbacks {
		value, computable := ratioValue(float64(row.Hits), float64(row.Samples))
		slices = append(slices, agentMetricSlice(metricAgentRollbackRate, uuidToString(row.AgentID),
			row.Domain.String, value, computable, row.Samples))
	}

	// Deterministic order: a response that reshuffles between requests makes the
	// board flicker and the tests flaky.
	sort.SliceStable(slices, func(i, j int) bool {
		if slices[i].Metric != slices[j].Metric {
			return slices[i].Metric < slices[j].Metric
		}
		if slices[i].Domain != slices[j].Domain {
			return slices[i].Domain < slices[j].Domain
		}
		return slices[i].AgentID < slices[j].AgentID
	})
	return slices, nil
}

func agentMetricSlice(metric, agentID, domain string, value float64, computable bool, samples int64) AgentMetricSlice {
	return AgentMetricSlice{
		Metric:               metric,
		AgentID:              agentID,
		Domain:               domain,
		WorkbenchMetricValue: metricValue(value, computable, samples, metricEmptyInsufficientData),
	}
}
