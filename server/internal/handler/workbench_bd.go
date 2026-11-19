package handler

// BD pipeline: follow-ups, quotes, campaigns and the cockpit aggregate
// (docs/engineering/WORKBENCH-API.md 搂20,
// docs/engineering/WORKBENCH-DATA-CONTRACT.md 搂3).
//
// **Three ledgers, not four.** The contract originally listed a `creator_order`
// table beside these three. A collaboration is already `crm_collab` 鈥?one creator
// 脳 one brief, carrying `stage` / `quote_amount` / `final_amount` / `creator_fee`
// / `commission_rate` / `issue_id` 鈥?so a second row type for the same fact would
// give the project two answers to "what did this creator cost us", which is the
// failure mode it has already had once (two definition of gross margin). The two
// facts `crm_collab` was missing are columns on it: `publish_url` (810) and
// `settled_on` (810). Settlement money keeps living in `crm_settlement`.
//
// What this file owns, then, is the three things that genuinely had no storage:
//
//	creator_activity 鈥?who talked to this creator, when, what came of it, and
//	                   when to talk again
//	creator_quote    鈥?what we offered (鍧戜綅璐?+ 浣ｉ噾鐜? and whether they took it
//	creator_campaign 鈥?where this batch of creators came from and what it cost
//
// Permissions are the workbench's usual split: any member reads, `owner`/`admin`
// write everything, a `member` writes only the rows it owns. Ownership is read off
// the row (`owner_member_id`), never off the creator it points at: a follow-up is
// a personal note, and handing it to whoever owns the creator would let a member's
// account notes be edited by somebody else's reassignment.
//
// No `:changed` event: this batch ships the data layer only, and the event
// vocabulary lives in `packages/core/types/events.ts`, which is outside it. The
// debt is recorded in WORKBENCH-API 搂20.6 rather than silently half-wired.

import (
	"encoding/json"
	"errors"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	db "github.com/jerry-halo2026/morchat.co/server/pkg/db/generated"
)

var (
	// bdActivityKinds is the channel a follow-up happened on. A closed enum
	// because the ledger groups by it; the free text belongs in `summary`.
	bdActivityKinds = map[string]bool{
		"dm": true, "call": true, "meeting": true, "email": true, "note": true,
	}

	// bdActivityOutcomes is what came of it. `outcome` is nullable on the row:
	// a note with no result is not `no_reply`.
	bdActivityOutcomes = map[string]bool{
		"no_reply": true, "replied": true, "declined": true, "advanced": true,
	}

	// bdQuoteStatuses is the offer's lifecycle. Only a quote that left `draft`
	// counts as "quoted" in the cockpit (搂20.3).
	bdQuoteStatuses = map[string]bool{
		"draft": true, "sent": true, "accepted": true, "rejected": true, "expired": true,
	}

	// bdCampaignKinds is how a batch was collected.
	bdCampaignKinds = map[string]bool{"search": true, "comment": true, "manual": true}
)

// ---- request bodies --------------------------------------------------------

// BdActivityRequest is the create/PATCH body for a follow-up.
//
// `creator_id` is create-only: `PATCH` answers 400 for it, because a follow-up
// that stops being about the same person is a different record, and moving it
// would rewrite two creators' histories at once.
type BdActivityRequest struct {
	CreatorID     *string `json:"creator_id"`
	Kind          *string `json:"kind"`
	HappenedAt    *string `json:"happened_at"`
	Summary       *string `json:"summary"`
	Outcome       *string `json:"outcome"`
	NextFollowAt  *string `json:"next_follow_at"`
	OwnerMemberID *string `json:"owner_member_id"`
	// Who follows it up, and the revision this reader last saw
	// (COLLAB-MODEL §1/§3): mismatched is a 409 `stale_write`.
	AssigneeType     *string `json:"assignee_type"`
	AssigneeID       *string `json:"assignee_id"`
	ExpectedRevision *int32  `json:"expected_revision"`
	// OverwriteReason is required when a human edits a row an agent last wrote
	// (WORKBENCH-API §26.3).
	OverwriteReason *string `json:"overwrite_reason"`
}

// BdQuoteRequest is the create/PATCH body for an offer.
//
// `commission_rate` is a ratio: 20% is 0.2 (contract 搂0 rule 1). `items` is the
// line-item breakdown as a JSON array; absent keeps the stored array on a PATCH
// and means "no breakdown yet" on a create.
type BdQuoteRequest struct {
	CreatorID      *string         `json:"creator_id"`
	BriefID        *string         `json:"brief_id"`
	Status         *string         `json:"status"`
	QuotedAt       *string         `json:"quoted_at"`
	ValidUntil     *string         `json:"valid_until"`
	FeeAmount      *float64        `json:"fee_amount"`
	CommissionRate *float64        `json:"commission_rate"`
	Currency       *string         `json:"currency"`
	Items          json.RawMessage `json:"items"`
	Note           *string         `json:"note"`
	OwnerMemberID  *string         `json:"owner_member_id"`
	// Who is working the offer, and the revision this reader last saw
	// (COLLAB-MODEL §1/§3): mismatched is a 409 `stale_write`.
	AssigneeType     *string `json:"assignee_type"`
	AssigneeID       *string `json:"assignee_id"`
	ExpectedRevision *int32  `json:"expected_revision"`
	// OverwriteReason is required when a human edits a row an agent last wrote
	// (WORKBENCH-API §26.3).
	OverwriteReason *string `json:"overwrite_reason"`
}

// BdCampaignRequest is the create/PATCH body for a collection batch.
type BdCampaignRequest struct {
	Name          *string  `json:"name"`
	Kind          *string  `json:"kind"`
	BudgetAmount  *float64 `json:"budget_amount"`
	Currency      *string  `json:"currency"`
	StartedOn     *string  `json:"started_on"`
	EndedOn       *string  `json:"ended_on"`
	SourceKeyword *string  `json:"source_keyword"`
	CreatorCount  *int32   `json:"creator_count"`
	Note          *string  `json:"note"`
	OwnerMemberID *string  `json:"owner_member_id"`
}

// ---- responses -------------------------------------------------------------

// BdActivityResponse is one follow-up. `outcome` and `next_follow_at` are
// pointers because NULL is a real state for both (a note has no result and
// schedules nothing).
type BdActivityResponse struct {
	ID            string  `json:"id"`
	WorkspaceID   string  `json:"workspace_id"`
	CreatorID     string  `json:"creator_id"`
	Kind          string  `json:"kind"`
	HappenedAt    string  `json:"happened_at"`
	Summary       string  `json:"summary"`
	Outcome       *string `json:"outcome"`
	NextFollowAt  *string `json:"next_follow_at"`
	OwnerMemberID *string `json:"owner_member_id"`
	CreatedBy     *string `json:"created_by"`
	CreatedAt     string  `json:"created_at"`
	UpdatedAt     string  `json:"updated_at"`
	// Who follows this up, the concurrency counter, and the newest audit event
	// (COLLAB-MODEL §1/§2/§3).
	AssigneeType *string             `json:"assignee_type"`
	AssigneeID   *string             `json:"assignee_id"`
	Revision     int32               `json:"revision"`
	LastActor    *WorkbenchLastActor `json:"last_actor"`
	// Review is §26.1's gate as the row carries it.
	Review WorkbenchReview `json:"review"`
}

func bdActivityToResponse(a db.CreatorActivity, last *WorkbenchLastActor) BdActivityResponse {
	return BdActivityResponse{
		ID:            uuidToString(a.ID),
		WorkspaceID:   uuidToString(a.WorkspaceID),
		CreatorID:     uuidToString(a.CreatorID),
		Kind:          a.Kind,
		HappenedAt:    timestampToString(a.HappenedAt),
		Summary:       a.Summary,
		Outcome:       textToPtr(a.Outcome),
		NextFollowAt:  timestampToPtr(a.NextFollowAt),
		OwnerMemberID: uuidToPtr(a.OwnerMemberID),
		CreatedBy:     uuidToPtr(a.CreatedBy),
		CreatedAt:     timestampToString(a.CreatedAt),
		UpdatedAt:     timestampToString(a.UpdatedAt),
		AssigneeType:  textToPtr(a.AssigneeType),
		AssigneeID:    uuidToPtr(a.AssigneeID),
		Revision:      a.Revision,
		LastActor:     last,
		Review:        reviewOf(a.ReviewState, a.ReviewedBy, a.ReviewedAt),
	}
}

// BdQuoteResponse is one offer. `items` travels as the JSON array the row stores,
// so the client reads a breakdown without a second request; `[]` means "no
// breakdown yet", never null.
type BdQuoteResponse struct {
	ID             string          `json:"id"`
	WorkspaceID    string          `json:"workspace_id"`
	CreatorID      string          `json:"creator_id"`
	BriefID        *string         `json:"brief_id"`
	Status         string          `json:"status"`
	QuotedAt       *string         `json:"quoted_at"`
	ValidUntil     *string         `json:"valid_until"`
	FeeAmount      *float64        `json:"fee_amount"`
	CommissionRate *float64        `json:"commission_rate"`
	Currency       string          `json:"currency"`
	Items          json.RawMessage `json:"items"`
	Note           *string         `json:"note"`
	OwnerMemberID  *string         `json:"owner_member_id"`
	CreatedBy      *string         `json:"created_by"`
	CreatedAt      string          `json:"created_at"`
	UpdatedAt      string          `json:"updated_at"`
	// Who is working the offer, the concurrency counter, and the newest audit
	// event (COLLAB-MODEL §1/§2/§3).
	AssigneeType *string             `json:"assignee_type"`
	AssigneeID   *string             `json:"assignee_id"`
	Revision     int32               `json:"revision"`
	LastActor    *WorkbenchLastActor `json:"last_actor"`
	// Review is §26.1's gate as the row carries it.
	Review WorkbenchReview `json:"review"`
}

func bdQuoteToResponse(q db.CreatorQuote, last *WorkbenchLastActor) BdQuoteResponse {
	return BdQuoteResponse{
		ID:             uuidToString(q.ID),
		WorkspaceID:    uuidToString(q.WorkspaceID),
		CreatorID:      uuidToString(q.CreatorID),
		BriefID:        uuidToPtr(q.BriefID),
		Status:         q.Status,
		QuotedAt:       timestampToPtr(q.QuotedAt),
		ValidUntil:     dateToPtr(q.ValidUntil),
		FeeAmount:      numericToFloatPtr(q.FeeAmount),
		CommissionRate: numericToFloatPtr(q.CommissionRate),
		Currency:       strings.TrimSpace(q.Currency),
		Items:          bdQuoteItemsResponse(q.Items),
		Note:           textToPtr(q.Note),
		OwnerMemberID:  uuidToPtr(q.OwnerMemberID),
		CreatedBy:      uuidToPtr(q.CreatedBy),
		CreatedAt:      timestampToString(q.CreatedAt),
		UpdatedAt:      timestampToString(q.UpdatedAt),
		AssigneeType:   textToPtr(q.AssigneeType),
		AssigneeID:     uuidToPtr(q.AssigneeID),
		Revision:       q.Revision,
		LastActor:      last,
		Review:         reviewOf(q.ReviewState, q.ReviewedBy, q.ReviewedAt),
	}
}

// bdQuoteItemsResponse passes the stored JSONB through. A NULL or non-array value
// (only reachable by writing the table by hand) renders as an empty array: the
// column is NOT NULL DEFAULT '[]', so there is no state in which "no breakdown"
// should reach the client as anything but a list.
func bdQuoteItemsResponse(raw []byte) json.RawMessage {
	trimmed := strings.TrimSpace(string(raw))
	if trimmed == "" || trimmed == "null" || !strings.HasPrefix(trimmed, "[") {
		return json.RawMessage("[]")
	}
	return json.RawMessage(trimmed)
}

// BdCampaignResponse is one collection batch. `creator_count` is the cached size
// of the batch, `0` for a batch nobody has attached creators to yet.
type BdCampaignResponse struct {
	ID            string   `json:"id"`
	WorkspaceID   string   `json:"workspace_id"`
	Name          string   `json:"name"`
	Kind          string   `json:"kind"`
	BudgetAmount  *float64 `json:"budget_amount"`
	Currency      string   `json:"currency"`
	StartedOn     *string  `json:"started_on"`
	EndedOn       *string  `json:"ended_on"`
	SourceKeyword *string  `json:"source_keyword"`
	CreatorCount  int32    `json:"creator_count"`
	Note          *string  `json:"note"`
	OwnerMemberID *string  `json:"owner_member_id"`
	CreatedBy     *string  `json:"created_by"`
	CreatedAt     string   `json:"created_at"`
	UpdatedAt     string   `json:"updated_at"`
}

func bdCampaignToResponse(c db.CreatorCampaign) BdCampaignResponse {
	return BdCampaignResponse{
		ID:            uuidToString(c.ID),
		WorkspaceID:   uuidToString(c.WorkspaceID),
		Name:          c.Name,
		Kind:          c.Kind,
		BudgetAmount:  numericToFloatPtr(c.BudgetAmount),
		Currency:      strings.TrimSpace(c.Currency),
		StartedOn:     dateToPtr(c.StartedOn),
		EndedOn:       dateToPtr(c.EndedOn),
		SourceKeyword: textToPtr(c.SourceKeyword),
		CreatorCount:  c.CreatorCount,
		Note:          textToPtr(c.Note),
		OwnerMemberID: uuidToPtr(c.OwnerMemberID),
		CreatedBy:     uuidToPtr(c.CreatedBy),
		CreatedAt:     timestampToString(c.CreatedAt),
		UpdatedAt:     timestampToString(c.UpdatedAt),
	}
}

// ---- cockpit ---------------------------------------------------------------

// BdPipelineMoney is an amount plus the currency it is in, in the same three
// states the overview strip uses: `amount: null` with
// `empty: "insufficient_data"` means "no rows to sum", which is a different
// statement from a settled zero. `currency` is always present so a client can
// label the figure even while it is empty.
type BdPipelineMoney struct {
	Amount      *float64 `json:"amount"`
	Currency    string   `json:"currency"`
	SampleCount int64    `json:"sample_count"`
	Empty       string   `json:"empty"`
}

// BdPipelineCreatorsBlock is the funnel's creator side. Every counter is a real
// count, so `empty` is `zero`: an empty ledger answers 0 rather than "unknown".
type BdPipelineCreatorsBlock struct {
	Total     WorkbenchMetricValue `json:"total"`
	Contacted WorkbenchMetricValue `json:"contacted"`
	Replied   WorkbenchMetricValue `json:"replied"`
	Quoted    WorkbenchMetricValue `json:"quoted"`
	Signed    WorkbenchMetricValue `json:"signed"`
	Deal      WorkbenchMetricValue `json:"deal"`
}

// BdPipelineQuotesBlock is the offer side.
type BdPipelineQuotesBlock struct {
	Open     WorkbenchMetricValue `json:"open"`
	Accepted WorkbenchMetricValue `json:"accepted"`
	Rejected WorkbenchMetricValue `json:"rejected"`
	TotalFee BdPipelineMoney      `json:"total_fee"`
}

// BdPipelineOrdersBlock is the fulfilment side, read off `crm_collab` and
// `crm_settlement` (搂20.3 for the stage definitions).
type BdPipelineOrdersBlock struct {
	Open        WorkbenchMetricValue `json:"open"`
	Delivered   WorkbenchMetricValue `json:"delivered"`
	Settled     WorkbenchMetricValue `json:"settled"`
	TotalAmount BdPipelineMoney      `json:"total_amount"`
	PaidAmount  BdPipelineMoney      `json:"paid_amount"`
}

// BdPipelineFollowupsBlock is who to chase today.
type BdPipelineFollowupsBlock struct {
	DueToday WorkbenchMetricValue `json:"due_today"`
	Overdue  WorkbenchMetricValue `json:"overdue"`
}

// BdPipelineResponse is `GET /api/workbench/bd/pipeline`: the four blocks the BD
// cockpit draws, in one round trip.
type BdPipelineResponse struct {
	Creators  BdPipelineCreatorsBlock  `json:"creators"`
	Quotes    BdPipelineQuotesBlock    `json:"quotes"`
	Orders    BdPipelineOrdersBlock    `json:"orders"`
	Followups BdPipelineFollowupsBlock `json:"followups"`
}

// bdCount renders a counter. A count is always computable 鈥?zero rows really are
// zero 鈥?so it never answers `null`; `metricValue` keeps the three-state shape
// identical to `/overview`.
func bdCount(n int64) WorkbenchMetricValue {
	return metricValue(float64(n), true, n, metricEmptyZero)
}

// bdMoney renders a summed amount. No rows 鈫?no amount: the empty rule is
// `insufficient_data` and `sample_count` says how many rows were behind it, so
// the client draws a gap card instead of a confident 0.00.
func bdMoney(amount float64, currency string, sampleCount int64) BdPipelineMoney {
	entry := BdPipelineMoney{
		Currency:    strings.TrimSpace(currency),
		SampleCount: sampleCount,
		Empty:       metricEmptyInsufficientData,
	}
	if entry.Currency == "" {
		entry.Currency = "CNY"
	}
	if sampleCount > 0 {
		value := amount
		entry.Amount = &value
		entry.Empty = metricEmptyZero
	}
	return entry
}

// GetBdPipeline 鈥?GET /api/workbench/bd/pipeline
//
// One request, four blocks, four statements. They are separate because each one
// aggregates a different grain (creators, quotes, collaborations, follow-ups) and
// folding them into one statement would make every filter condition shared with
// three unrelated tables.
func (h *Handler) GetBdPipeline(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	if !h.requireWorkbenchCapability(w, r, scope, capCRMRead) {
		return
	}
	ctx := r.Context()

	creators, err := h.Queries.BdPipelineCreators(ctx, scope.WorkspaceUUID)
	if err != nil {
		workbenchInternalError(w, r, "failed to count creators", err)
		return
	}
	quotes, err := h.Queries.BdPipelineQuotes(ctx, scope.WorkspaceUUID)
	if err != nil {
		workbenchInternalError(w, r, "failed to aggregate quotes", err)
		return
	}
	orders, err := h.Queries.BdPipelineOrders(ctx, scope.WorkspaceUUID)
	if err != nil {
		workbenchInternalError(w, r, "failed to aggregate collaborations", err)
		return
	}
	followups, err := h.Queries.BdPipelineFollowups(ctx, scope.WorkspaceUUID)
	if err != nil {
		workbenchInternalError(w, r, "failed to aggregate follow-ups", err)
		return
	}

	writeJSON(w, http.StatusOK, BdPipelineResponse{
		Creators: BdPipelineCreatorsBlock{
			Total:     bdCount(creators.Total),
			Contacted: bdCount(creators.Contacted),
			Replied:   bdCount(creators.Replied),
			Quoted:    bdCount(creators.Quoted),
			Signed:    bdCount(creators.SignedCount),
			Deal:      bdCount(creators.DealCount),
		},
		Quotes: BdPipelineQuotesBlock{
			Open:     bdCount(quotes.OpenCount),
			Accepted: bdCount(quotes.AcceptedCount),
			Rejected: bdCount(quotes.RejectedCount),
			TotalFee: bdMoney(quotes.TotalFee, quotes.Currency, quotes.FeeSampleCount),
		},
		Orders: BdPipelineOrdersBlock{
			Open:        bdCount(orders.OpenCount),
			Delivered:   bdCount(orders.DeliveredCount),
			Settled:     bdCount(orders.SettledCount),
			TotalAmount: bdMoney(orders.TotalAmount, orders.Currency, orders.TotalSampleCount),
			PaidAmount:  bdMoney(orders.PaidAmount, orders.Currency, orders.PaidSampleCount),
		},
		Followups: BdPipelineFollowupsBlock{
			DueToday: bdCount(followups.DueToday),
			Overdue:  bdCount(followups.Overdue),
		},
	})
}

// ---- performance over a range ----------------------------------------------

// BdPerformanceTotals is the fact set one bucket (a member, a month, the whole
// window) carries. Counts are always numbers 鈥?a bucket with no rows really is
// zero. Amounts are pointers: `null` means "no rows to sum in the report's
// currency", which is not the same statement as a settled 0.00 (搂22).
//
// `quote_amount` is the 鍧戜綅璐?of the offers that were *sent* in that bucket, not of
// the accepted ones: the accepted subset's money is what `signed` reports once the
// collaboration exists, and counting it twice under two names would make the
// page's columns add up to more than the business.
type BdPerformanceTotals struct {
	SignedCount     int64    `json:"signed_count"`
	SignedAmount    *float64 `json:"signed_amount"`
	DeliveredCount  int64    `json:"delivered_count"`
	CollectedCount  int64    `json:"collected_count"`
	CollectedAmount *float64 `json:"collected_amount"`
	QuoteSent       int64    `json:"quote_sent"`
	QuoteAccepted   int64    `json:"quote_accepted"`
	QuoteAmount     *float64 `json:"quote_amount"`
	Followups       int64    `json:"followups"`
	Replied         int64    `json:"replied"`
	Meetings        int64    `json:"meetings"`
}

// BdPerformanceMemberRow is one person's contribution inside the window.
type BdPerformanceMemberRow struct {
	MemberID string `json:"member_id"`
	// Name falls back to the empty string when the member row is gone; the id is
	// the identity, the name is a convenience for the table.
	Name string `json:"name"`
	// WinRate is accepted / sent over this member's offers in the window, on the
	// 0鈥? storage scale. Null when the member sent no offer.
	WinRate *float64 `json:"win_rate"`
	BdPerformanceTotals
}

// BdPerformanceMonthRow is the same fact set cut by calendar month, so the page can
// draw a trend from one response.
type BdPerformanceMonthRow struct {
	// `YYYY-MM`, in the session's time zone (UTC in production).
	Month   string   `json:"month"`
	WinRate *float64 `json:"win_rate"`
	BdPerformanceTotals
}

// BdPerformanceSignedBlock is 绛剧害: collaborations confirmed in the window.
type BdPerformanceSignedBlock struct {
	Count  WorkbenchMetricValue `json:"count"`
	Amount BdPipelineMoney      `json:"amount"`
}

// BdPerformanceVolumeBlock is a count + amount pair (浜や粯 / 鍥炴).
type BdPerformanceVolumeBlock struct {
	Count  WorkbenchMetricValue `json:"count"`
	Amount BdPipelineMoney      `json:"amount"`
}

// BdPerformanceQuotesBlock is the offer side of the window.
type BdPerformanceQuotesBlock struct {
	Sent     WorkbenchMetricValue `json:"sent"`
	Accepted WorkbenchMetricValue `json:"accepted"`
	// WinRate is accepted / sent (0鈥?). It answers null 鈥?`insufficient_data` 鈥?when
	// the window holds no sent offer at all, rather than a confident 0 %.
	WinRate WorkbenchMetricValue `json:"win_rate"`
	Amount  BdPipelineMoney      `json:"amount"`
}

// BdPerformanceFollowupsBlock is what the team did, not what closed.
type BdPerformanceFollowupsBlock struct {
	Count    WorkbenchMetricValue `json:"count"`
	Replied  WorkbenchMetricValue `json:"replied"`
	Meetings WorkbenchMetricValue `json:"meetings"`
}

// BdPerformanceAffiliateBlock is the 绮鹃€夎仈鐩?commission the window is responsible
// for, split by who received it (see `BdPerformanceAffiliate` in
// workbench_bd.sql for the two windows involved).
type BdPerformanceAffiliateBlock struct {
	Agency  BdPipelineMoney `json:"agency"`
	Creator BdPipelineMoney `json:"creator"`
	Settled BdPipelineMoney `json:"settled"`
}

// BdPerformanceResponse is `GET /api/workbench/bd/performance` (搂22).
type BdPerformanceResponse struct {
	// From/To are the window that was actually used, after defaults 鈥?a client that
	// sent neither can label the report without recomputing "this month".
	From string `json:"from"`
	To   string `json:"to"`
	// Currency is the one currency every amount in the response is in: the window's
	// dominant one. Rows in another currency are excluded from the counts too, so a
	// count and the money beside it always describe the same rows.
	Currency string `json:"currency"`
	// Empty is the window's own state: `zero` when it contains at least one fact,
	// `insufficient_data` when it contains none (the page then draws the
	// no-data state rather than a flat zero trend).
	Empty     string                      `json:"empty"`
	Signed    BdPerformanceSignedBlock    `json:"signed"`
	Delivered BdPerformanceVolumeBlock    `json:"delivered"`
	Collected BdPerformanceVolumeBlock    `json:"collected"`
	Quotes    BdPerformanceQuotesBlock    `json:"quotes"`
	Followups BdPerformanceFollowupsBlock `json:"followups"`
	Affiliate BdPerformanceAffiliateBlock `json:"affiliate"`
	ByMember  []BdPerformanceMemberRow    `json:"by_member"`
	ByMonth   []BdPerformanceMonthRow     `json:"by_month"`
}

// bdPerformanceBucket is one pivot cell: a (metric, month, member) row's counts and
// money, or the answer for "this cell has no rows".
type bdPerformanceBucket struct {
	count   int64
	amount  float64
	samples int64
}

func (b *bdPerformanceBucket) add(count int64, amount float64, samples int64) {
	b.count += count
	b.amount += amount
	b.samples += samples
}

// bdPerformanceMoney renders a summed amount with the window's currency. Same
// three states as the cockpit: no contributing row 鈫?`amount: null`,
// `empty: insufficient_data`.
func bdPerformanceMoney(bucket bdPerformanceBucket, currency string) BdPipelineMoney {
	return bdMoney(bucket.amount, currency, bucket.samples)
}

// bdPerformanceWinRate is accepted / sent over the window, on the 0鈥? scale. With
// no sent offer the rate is not computable and answers `value: null` +
// `insufficient_data` 鈥?never a confident 0 %, which would read as "we lost every
// offer we never made".
func bdPerformanceWinRate(sent, accepted bdPerformanceBucket) WorkbenchMetricValue {
	if sent.count == 0 {
		return metricValue(0, false, 0, metricEmptyInsufficientData)
	}
	rate, ok := ratioValue(float64(accepted.count), float64(sent.count))
	return metricValue(rate, ok, sent.count, metricEmptyInsufficientData)
}

// GetBdPerformance 鈥?GET /api/workbench/bd/performance?from=&to=
//
// One window, one currency, every fact bucketed by its own date (搂22). The
// statement returns (month, member) cells; this handler pivots them three ways 鈥?// the blocks, `by_member`, `by_month` 鈥?so each number has exactly one definition
// in SQL and the sub-totals cannot drift from the totals.
func (h *Handler) GetBdPerformance(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	if !h.requireWorkbenchCapability(w, r, scope, capCRMRead) {
		return
	}
	from, to, ok := workbenchPerformanceWindow(w, r)
	if !ok {
		return
	}
	ctx := r.Context()

	currency, err := h.Queries.BdPerformanceCurrency(ctx, db.BdPerformanceCurrencyParams{
		FromDay:     from,
		ToDay:       to,
		WorkspaceID: scope.WorkspaceUUID,
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to resolve the report currency", err)
		return
	}
	rows, err := h.Queries.BdPerformanceBuckets(ctx, db.BdPerformanceBucketsParams{
		FromDay:     from,
		ToDay:       to,
		WorkspaceID: scope.WorkspaceUUID,
		Currency:    currency,
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to aggregate the performance window", err)
		return
	}
	affiliate, err := h.Queries.BdPerformanceAffiliate(ctx, db.BdPerformanceAffiliateParams{
		FromDay:     from,
		ToDay:       to,
		WorkspaceID: scope.WorkspaceUUID,
		Currency:    currency,
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to aggregate affiliate commission", err)
		return
	}
	members, err := h.Queries.ListMembersWithUser(ctx, scope.WorkspaceUUID)
	if err != nil {
		workbenchInternalError(w, r, "failed to load member names", err)
		return
	}
	memberNames := make(map[string]string, len(members))
	for _, member := range members {
		memberNames[uuidToString(member.UserID)] = member.UserName
	}

	// Three pivots over the same cells. `totals` is the whole window; the other two
	// key by member and by month. A cell whose metric is unknown (a future addition
	// this handler predates) is ignored rather than half-counted.
	const (
		metricSigned          = "signed"
		metricDelivered       = "delivered"
		metricCollected       = "collected"
		metricQuoteSent       = "quote_sent"
		metricQuoteAccepted   = "quote_accepted"
		metricFollowup        = "followup"
		metricFollowupReplied = "followup_replied"
		metricFollowupMeeting = "followup_meeting"
	)
	totals := map[string]*bdPerformanceBucket{}
	byMember := map[string]map[string]*bdPerformanceBucket{}
	byMonth := map[string]map[string]*bdPerformanceBucket{}
	facts := int64(0)

	cell := func(target map[string]*bdPerformanceBucket, metric string) *bdPerformanceBucket {
		if bucket, present := target[metric]; present {
			return bucket
		}
		bucket := &bdPerformanceBucket{}
		target[metric] = bucket
		return bucket
	}

	for _, row := range rows {
		switch row.Metric {
		case metricSigned, metricDelivered, metricCollected, metricQuoteSent,
			metricQuoteAccepted, metricFollowup, metricFollowupReplied, metricFollowupMeeting:
		default:
			continue
		}
		facts += row.RowCount
		cell(totals, row.Metric).add(row.RowCount, row.Amount, row.AmountSamples)

		monthKey := row.Month
		if _, present := byMonth[monthKey]; !present {
			byMonth[monthKey] = map[string]*bdPerformanceBucket{}
		}
		cell(byMonth[monthKey], row.Metric).add(row.RowCount, row.Amount, row.AmountSamples)

		if row.MemberID.Valid {
			memberKey := uuidToString(row.MemberID)
			if _, present := byMember[memberKey]; !present {
				byMember[memberKey] = map[string]*bdPerformanceBucket{}
			}
			cell(byMember[memberKey], row.Metric).add(row.RowCount, row.Amount, row.AmountSamples)
		}
	}

	empty := metricEmptyInsufficientData
	if facts > 0 {
		empty = metricEmptyZero
	}

	response := BdPerformanceResponse{
		From:     dateToString(from),
		To:       dateToString(to),
		Currency: strings.TrimSpace(currency),
		Empty:    empty,
		ByMember: make([]BdPerformanceMemberRow, 0, len(byMember)),
		ByMonth:  make([]BdPerformanceMonthRow, 0, len(byMonth)),
		Signed: BdPerformanceSignedBlock{
			Count:  bdCount(totals[metricSigned].countOrZero()),
			Amount: bdPerformanceMoney(bucketOrZero(totals, metricSigned), responseCurrency(currency)),
		},
		Delivered: BdPerformanceVolumeBlock{
			Count:  bdCount(totals[metricDelivered].countOrZero()),
			Amount: bdPerformanceMoney(bucketOrZero(totals, metricDelivered), responseCurrency(currency)),
		},
		Collected: BdPerformanceVolumeBlock{
			Count:  bdCount(totals[metricCollected].countOrZero()),
			Amount: bdPerformanceMoney(bucketOrZero(totals, metricCollected), responseCurrency(currency)),
		},
		Quotes: BdPerformanceQuotesBlock{
			Sent:     bdCount(totals[metricQuoteSent].countOrZero()),
			Accepted: bdCount(totals[metricQuoteAccepted].countOrZero()),
			WinRate:  bdPerformanceWinRate(bucketOrZero(totals, metricQuoteSent), bucketOrZero(totals, metricQuoteAccepted)),
			Amount:   bdPerformanceMoney(bucketOrZero(totals, metricQuoteSent), responseCurrency(currency)),
		},
		Followups: BdPerformanceFollowupsBlock{
			Count:    bdCount(totals[metricFollowup].countOrZero()),
			Replied:  bdCount(totals[metricFollowupReplied].countOrZero()),
			Meetings: bdCount(totals[metricFollowupMeeting].countOrZero()),
		},
		Affiliate: BdPerformanceAffiliateBlock{
			Agency:  bdMoney(affiliate.AgencyAmount, responseCurrency(currency), affiliate.AgencySamples),
			Creator: bdMoney(affiliate.CreatorAmount, responseCurrency(currency), affiliate.CreatorSamples),
			Settled: bdMoney(affiliate.SettledAmount, responseCurrency(currency), affiliate.SettledSamples),
		},
	}

	for memberID, metrics := range byMember {
		response.ByMember = append(response.ByMember, BdPerformanceMemberRow{
			MemberID:            memberID,
			Name:                memberNames[memberID],
			WinRate:             bdPerformanceRowWinRate(metrics),
			BdPerformanceTotals: bdPerformanceTotalsOf(metrics),
		})
	}
	for month, metrics := range byMonth {
		response.ByMonth = append(response.ByMonth, BdPerformanceMonthRow{
			Month:               month,
			WinRate:             bdPerformanceRowWinRate(metrics),
			BdPerformanceTotals: bdPerformanceTotalsOf(metrics),
		})
	}
	sort.Slice(response.ByMember, func(i, j int) bool {
		if response.ByMember[i].SignedCount != response.ByMember[j].SignedCount {
			return response.ByMember[i].SignedCount > response.ByMember[j].SignedCount
		}
		return response.ByMember[i].MemberID < response.ByMember[j].MemberID
	})
	sort.Slice(response.ByMonth, func(i, j int) bool {
		return response.ByMonth[i].Month < response.ByMonth[j].Month
	})

	writeJSON(w, http.StatusOK, response)
}

// responseCurrency normalises the report's currency label for the money blocks.
func responseCurrency(currency string) string {
	trimmed := strings.TrimSpace(currency)
	if trimmed == "" {
		return "CNY"
	}
	return trimmed
}

// bucketOrZero reads a metric's totals, answering the empty bucket for a metric the
// window has no row for.
func bucketOrZero(buckets map[string]*bdPerformanceBucket, metric string) bdPerformanceBucket {
	if bucket, present := buckets[metric]; present {
		return *bucket
	}
	return bdPerformanceBucket{}
}

// countOrZero renders one metric's row count, with nil-safe access to the map.
func (b *bdPerformanceBucket) countOrZero() int64 {
	if b == nil {
		return 0
	}
	return b.count
}

// bdPerformanceRowWinRate is one row's accepted / sent, on the 0鈥? scale, or nil
// when the bucket holds no sent offer.
func bdPerformanceRowWinRate(metrics map[string]*bdPerformanceBucket) *float64 {
	sent := bucketOrZero(metrics, "quote_sent").count
	if sent == 0 {
		return nil
	}
	accepted := float64(bucketOrZero(metrics, "quote_accepted").count)
	rate, ok := ratioValue(accepted, float64(sent))
	if !ok {
		return nil
	}
	return &rate
}

// bdPerformanceTotalsOf flattens one bucket's metric map into the wire row. An
// amount with no contributing row stays nil 鈥?never 0 鈥?for the same reason the
// blocks do: the row's currency is the response's `currency`.
func bdPerformanceTotalsOf(metrics map[string]*bdPerformanceBucket) BdPerformanceTotals {
	amountOf := func(metric string) *float64 {
		bucket := bucketOrZero(metrics, metric)
		if bucket.samples == 0 {
			return nil
		}
		value := bucket.amount
		return &value
	}
	return BdPerformanceTotals{
		SignedCount:     bucketOrZero(metrics, "signed").count,
		SignedAmount:    amountOf("signed"),
		DeliveredCount:  bucketOrZero(metrics, "delivered").count,
		CollectedCount:  bucketOrZero(metrics, "collected").count,
		CollectedAmount: amountOf("collected"),
		QuoteSent:       bucketOrZero(metrics, "quote_sent").count,
		QuoteAccepted:   bucketOrZero(metrics, "quote_accepted").count,
		QuoteAmount:     amountOf("quote_sent"),
		Followups:       bucketOrZero(metrics, "followup").count,
		Replied:         bucketOrZero(metrics, "followup_replied").count,
		Meetings:        bucketOrZero(metrics, "followup_meeting").count,
	}
}

// workbenchPerformanceWindow resolves `?from=&to=`. Days are inclusive; both are
// optional and default to "this month so far", because that is the window the 涓氱哗
// page opens on. A range that ends before it starts is a 400 鈥?the same rule the
// shoot calendar applies, and for the same reason: an inverted window is a typo,
// not an empty report.
func workbenchPerformanceWindow(w http.ResponseWriter, r *http.Request) (pgtype.Date, pgtype.Date, bool) {
	from, ok := workbenchDateValue(w, stringPtr(strings.TrimSpace(r.URL.Query().Get("from"))), "from")
	if !ok {
		return pgtype.Date{}, pgtype.Date{}, false
	}
	to, ok := workbenchDateValue(w, stringPtr(strings.TrimSpace(r.URL.Query().Get("to"))), "to")
	if !ok {
		return pgtype.Date{}, pgtype.Date{}, false
	}
	today := pgtypeDateToday()
	if !to.Valid {
		to = today
	}
	if !from.Valid {
		from = pgtype.Date{Time: time.Date(to.Time.Year(), to.Time.Month(), 1, 0, 0, 0, 0, time.UTC), Valid: true}
	}
	if to.Time.Before(from.Time) {
		writeError(w, http.StatusBadRequest, "to must not be before from")
		return pgtype.Date{}, pgtype.Date{}, false
	}
	return from, to, true
}

// ---- validation helpers ----------------------------------------------------

// bdEnum validates an optional enum field and reports the trimmed value (`""`
// when absent). An empty string counts as absent, so `{"kind": ""}` is not a
// silent third state: the caller decides what an absent value means 鈥?a default
// on the create path, "keep the stored one" on a PATCH.
func bdEnum(w http.ResponseWriter, raw *string, allowed map[string]bool, field string) (string, bool) {
	if raw == nil || strings.TrimSpace(*raw) == "" {
		return "", true
	}
	value := strings.TrimSpace(*raw)
	if !allowed[value] {
		writeError(w, http.StatusBadRequest, "invalid "+field)
		return "", false
	}
	return value, true
}

// bdCommissionRate validates the 0鈥? commission ratio (contract 搂0 rule 1).
//
// The message names the unit because this is the field people get wrong: 20 means
// 2000%, and the contract's whole "percentages live in the display layer" rule
// exists because that mistake has already shipped once (affiliate SKU 438).
func bdCommissionRate(w http.ResponseWriter, raw *float64) bool {
	if raw == nil {
		return true
	}
	if *raw < 0 || *raw > 1 {
		writeError(w, http.StatusBadRequest,
			"commission_rate must be between 0 and 1: send 0.2 for 20%, not 20")
		return false
	}
	return true
}

// bdQuoteWindowOK rejects an offer that expired before it was made (搂20.4).
//
// Why a 400 and not a stored-but-flagged row: `valid_until` is the only column
// that answers "could this offer still be accepted on day X", and every reader
// (the quote ledger, the cockpit's `open` counter, any future expiry sweep) takes
// it at face value. A row with `valid_until < quoted_at` is not a business state
// that a warning can make usable 鈥?it is a typo, and the moment it is stored the
// answer to "what was open on the 12th" silently changes. A warning field would
// also have to be echoed by every read that touches the quote, which is a second
// copy of the same rule in every consumer.
func bdQuoteWindowOK(w http.ResponseWriter, quotedAt pgtype.Timestamptz, validUntil pgtype.Date) bool {
	if !quotedAt.Valid || !validUntil.Valid {
		return true
	}
	quotedDay := quotedAt.Time.UTC()
	quotedDate := time.Date(quotedDay.Year(), quotedDay.Month(), quotedDay.Day(), 0, 0, 0, 0, time.UTC)
	if validUntil.Time.Before(quotedDate) {
		writeError(w, http.StatusBadRequest, "valid_until must not be before quoted_at")
		return false
	}
	return true
}

// bdCampaignWindowOK rejects a batch that ended before it started. The column has
// the same CHECK (808); the handler answers first so the caller learns which field
// is wrong instead of reading a 500.
func bdCampaignWindowOK(w http.ResponseWriter, startedOn, endedOn pgtype.Date) bool {
	if !startedOn.Valid || !endedOn.Valid {
		return true
	}
	if endedOn.Time.Before(startedOn.Time) {
		writeError(w, http.StatusBadRequest, "ended_on must not be before started_on")
		return false
	}
	return true
}

// bdQuoteItems parses the line-item breakdown into the JSONB value the column
// stores. Absent means "no breakdown yet" on create and "unchanged" on PATCH 鈥?// which is `[]` here, because the column's default is an empty array.
func bdQuoteItems(w http.ResponseWriter, raw json.RawMessage) ([]byte, bool) {
	if len(raw) == 0 {
		return []byte("[]"), true
	}
	var items []json.RawMessage
	if err := json.Unmarshal(raw, &items); err != nil {
		writeError(w, http.StatusBadRequest, "items must be a JSON array")
		return nil, false
	}
	if items == nil {
		items = []json.RawMessage{}
	}
	encoded, err := json.Marshal(items)
	if err != nil {
		writeError(w, http.StatusBadRequest, "items must be a JSON array")
		return nil, false
	}
	return encoded, true
}

// ---- follow-ups ------------------------------------------------------------

// ListBdActivities 鈥?GET /api/workbench/bd/activities
func (h *Handler) ListBdActivities(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	if !h.requireWorkbenchCapability(w, r, scope, capCRMRead) {
		return
	}
	query := r.URL.Query()
	kind, ok := bdEnum(w, optionalString(query.Get("kind")), bdActivityKinds, "kind")
	if !ok {
		return
	}
	creatorID, ok := workbenchOptionalUUID(w, optionalString(query.Get("creator_id")), "creator_id")
	if !ok {
		return
	}
	fromAt, ok := workbenchTimestampValue(w, optionalString(query.Get("from")), "from")
	if !ok {
		return
	}
	toAt, ok := workbenchTimestampValue(w, optionalString(query.Get("to")), "to")
	if !ok {
		return
	}
	if fromAt.Valid && toAt.Valid && toAt.Time.Before(fromAt.Time) {
		writeError(w, http.StatusBadRequest, "to must not be before from")
		return
	}
	assigneeType, assigneeID, ok := h.workbenchAssigneeFilter(w, r, scope)
	if !ok {
		return
	}
	reviewState, ok := workbenchReviewStateFilter(w, r)
	if !ok {
		return
	}
	rows, err := h.Queries.ListCreatorActivities(r.Context(), db.ListCreatorActivitiesParams{
		WorkspaceID:  scope.WorkspaceUUID,
		CreatorID:    creatorID,
		Kind:         optionalTrimmedText(optionalString(kind)),
		FromAt:       fromAt,
		ToAt:         toAt,
		AssigneeType: assigneeType,
		AssigneeID:   assigneeID,
		ReviewState:  reviewState,
		Limit:        workbenchLimit(r),
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to list follow-ups", err)
		return
	}
	resp := make([]BdActivityResponse, len(rows))
	actors := h.lastWorkbenchActors(r.Context(), scope, subjectCreatorActivity,
		subjectIDs(rows, func(row db.CreatorActivity) pgtype.UUID { return row.ID }))
	for i, row := range rows {
		resp[i] = bdActivityToResponse(row, actors[uuidToString(row.ID)])
	}
	writeJSON(w, http.StatusOK, map[string]any{"activities": resp, "total": len(resp)})
}

// optionalString turns a query value into the pointer shape the validators take.
// An absent parameter and an empty one are the same thing on the wire, and both
// mean "no filter".
func optionalString(raw string) *string {
	if strings.TrimSpace(raw) == "" {
		return nil
	}
	value := strings.TrimSpace(raw)
	return &value
}

// quoteHighValue reports whether an offer write touches money: the slot fee, the
// commission rate, the line-item breakdown (which carries prices) or the currency
// (WORKBENCH-API §26.1/§26.5). A status change or a note is not high value.
func quoteHighValue(req BdQuoteRequest) (bool, []string) {
	fields := make([]string, 0, 4)
	if req.FeeAmount != nil {
		fields = append(fields, "fee_amount")
	}
	if req.CommissionRate != nil {
		fields = append(fields, "commission_rate")
	}
	if len(req.Items) > 0 {
		fields = append(fields, "items")
	}
	if req.Currency != nil {
		fields = append(fields, "currency")
	}
	return len(fields) > 0, fields
}

// CreateBdActivity 鈥?POST /api/workbench/bd/activities
func (h *Handler) CreateBdActivity(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	if !h.requireWorkbenchCapability(w, r, scope, capCRMWrite) {
		return
	}
	var req BdActivityRequest
	if !decodeWorkbenchBody(w, r, &req) {
		return
	}
	// A follow-up carries no money field, so the only thing that can send it to
	// review is the actor being an agent (§26.1).
	actor := h.workbenchActor(r, scope)
	creator, ok := h.requireCreatorInWorkspace(r.Context(), w, scope.WorkspaceID, req.CreatorID)
	if !ok {
		return
	}
	kind, ok := bdEnum(w, req.Kind, bdActivityKinds, "kind")
	if !ok {
		return
	}
	if kind == "" {
		writeError(w, http.StatusBadRequest, "kind is required")
		return
	}
	outcome, ok := bdEnum(w, req.Outcome, bdActivityOutcomes, "outcome")
	if !ok {
		return
	}
	if req.HappenedAt == nil || strings.TrimSpace(*req.HappenedAt) == "" {
		writeError(w, http.StatusBadRequest, "happened_at is required")
		return
	}
	happenedAt, ok := workbenchTimestampValue(w, req.HappenedAt, "happened_at")
	if !ok {
		return
	}
	summary := strings.TrimSpace(valueOrEmpty(req.Summary))
	if summary == "" {
		writeError(w, http.StatusBadRequest, "summary is required")
		return
	}
	nextFollowAt, ok := workbenchTimestampValue(w, req.NextFollowAt, "next_follow_at")
	if !ok {
		return
	}
	owner, ok := h.workbenchOwnerForCreate(w, r, scope, req.OwnerMemberID)
	if !ok {
		return
	}
	if !agentOwnerGate(w, actor, req.OwnerMemberID) {
		return
	}
	assigneeType, assigneeID, ok := h.workbenchAssigneePatch(w, r, scope,
		pgtype.Text{}, pgtype.UUID{}, req.AssigneeType, req.AssigneeID)
	if !ok {
		return
	}
	assigneeType, assigneeID = initialAssignee(owner, req.AssigneeType, req.AssigneeID, assigneeType, assigneeID)

	// The row and its audit event commit together (COLLAB-MODEL §2).
	tx, err := h.TxStarter.Begin(r.Context())
	if err != nil {
		workbenchInternalError(w, r, "failed to record the follow-up", err)
		return
	}
	defer tx.Rollback(r.Context())
	qtx := h.Queries.WithTx(tx)

	created, err := qtx.CreateCreatorActivity(r.Context(), db.CreateCreatorActivityParams{
		WorkspaceID:   scope.WorkspaceUUID,
		CreatorID:     creator.ID,
		Kind:          kind,
		HappenedAt:    happenedAt,
		Summary:       summary,
		Outcome:       optionalTrimmedText(optionalString(outcome)),
		NextFollowAt:  nextFollowAt,
		OwnerMemberID: owner,
		CreatedBy:     scope.Member.UserID,
		AssigneeType:  assigneeType,
		AssigneeID:    assigneeID,
		ReviewState:   reviewForWrite(actor, false, reviewDecision{}).State,
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to record the follow-up", err)
		return
	}
	event, err := recordWorkbenchActivity(r.Context(), qtx, scope, subjectCreatorActivity, created.ID,
		subjectCreatorActivity+".created", actor, actor.delegatedBy(scope), auditCreate,
		activityChanges(db.CreatorActivity{}, created))
	if err != nil {
		workbenchInternalError(w, r, "failed to record the follow-up's creation", err)
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		workbenchInternalError(w, r, "failed to record the follow-up", err)
		return
	}
	writeJSON(w, http.StatusCreated, bdActivityToResponse(created, lastActorFromActivity(event)))
}

// loadBdActivityForWrite resolves {activityId} and applies the write gate.
func (h *Handler) loadBdActivityForWrite(w http.ResponseWriter, r *http.Request, scope workbenchScope) (db.CreatorActivity, bool) {
	id, ok := parseUUIDOrBadRequest(w, chi.URLParam(r, "activityId"), "activity id")
	if !ok {
		return db.CreatorActivity{}, false
	}
	activity, err := h.Queries.GetCreatorActivity(r.Context(), db.GetCreatorActivityParams{
		ID:          id,
		WorkspaceID: scope.WorkspaceUUID,
	})
	if err != nil {
		writeError(w, http.StatusNotFound, "follow-up not found")
		return db.CreatorActivity{}, false
	}
	if !workbenchCanWrite(scope.Member, activity.OwnerMemberID) {
		writeError(w, http.StatusForbidden, "you can only change follow-ups you own")
		return db.CreatorActivity{}, false
	}
	return activity, true
}

// GetBdActivity 鈥?GET /api/workbench/bd/activities/{activityId}
func (h *Handler) GetBdActivity(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	if !h.requireWorkbenchCapability(w, r, scope, capCRMRead) {
		return
	}
	id, ok := parseUUIDOrBadRequest(w, chi.URLParam(r, "activityId"), "activity id")
	if !ok {
		return
	}
	activity, err := h.Queries.GetCreatorActivity(r.Context(), db.GetCreatorActivityParams{
		ID:          id,
		WorkspaceID: scope.WorkspaceUUID,
	})
	if err != nil {
		writeError(w, http.StatusNotFound, "follow-up not found")
		return
	}
	writeJSON(w, http.StatusOK, bdActivityToResponse(activity,
		h.lastWorkbenchActor(r.Context(), scope, subjectCreatorActivity, activity.ID)))
}

// UpdateBdActivity 鈥?PATCH /api/workbench/bd/activities/{activityId}
func (h *Handler) UpdateBdActivity(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	if !h.requireWorkbenchCapability(w, r, scope, capCRMWrite) {
		return
	}
	current, ok := h.loadBdActivityForWrite(w, r, scope)
	if !ok {
		return
	}
	var req BdActivityRequest
	if !decodeWorkbenchBody(w, r, &req) {
		return
	}
	actor := h.workbenchActor(r, scope)
	overwriteReason, ok := h.workbenchOverwriteReason(w, r, scope, actor, subjectCreatorActivity, current.ID, req.OverwriteReason)
	if !ok {
		return
	}
	// `creator_id` is not editable: the row is one person's history, and moving
	// it would rewrite two of them.
	if req.CreatorID != nil && strings.TrimSpace(*req.CreatorID) != "" {
		writeError(w, http.StatusBadRequest,
			"creator_id cannot be changed: record a new follow-up instead")
		return
	}

	kind := current.Kind
	if parsed, ok := bdEnum(w, req.Kind, bdActivityKinds, "kind"); !ok {
		return
	} else if parsed != "" {
		kind = parsed
	}
	happenedAt, ok := applyTimestampPatch(req.HappenedAt, w, "happened_at", current.HappenedAt)
	if !ok {
		return
	}
	summary := current.Summary
	if req.Summary != nil {
		summary = strings.TrimSpace(*req.Summary)
		if summary == "" {
			writeError(w, http.StatusBadRequest, "summary is required")
			return
		}
	}
	outcome := current.Outcome
	if req.Outcome != nil {
		parsed, ok := bdEnum(w, req.Outcome, bdActivityOutcomes, "outcome")
		if !ok {
			return
		}
		outcome = optionalTrimmedText(optionalString(parsed))
	}
	nextFollowAt, ok := applyTimestampPatch(req.NextFollowAt, w, "next_follow_at", current.NextFollowAt)
	if !ok {
		return
	}
	requestedOwner, ok := workbenchOptionalUUID(w, req.OwnerMemberID, "owner_member_id")
	if !ok {
		return
	}
	if !agentOwnerGate(w, actor, req.OwnerMemberID) {
		return
	}
	owner, ok := h.workbenchOwnerForUpdate(w, r, scope, current.OwnerMemberID, requestedOwner)
	if !ok {
		return
	}
	assigneeType, assigneeID, ok := h.workbenchAssigneePatch(w, r, scope,
		current.AssigneeType, current.AssigneeID, req.AssigneeType, req.AssigneeID)
	if !ok {
		return
	}
	expectedRevision, ok := workbenchExpectedRevision(w, req.ExpectedRevision)
	if !ok {
		return
	}
	decision := reviewForWrite(actor, false,
		currentReview(current.ReviewState, current.ReviewedBy, current.ReviewedAt))

	tx, err := h.TxStarter.Begin(r.Context())
	if err != nil {
		workbenchInternalError(w, r, "failed to update the follow-up", err)
		return
	}
	defer tx.Rollback(r.Context())
	qtx := h.Queries.WithTx(tx)

	updated, err := qtx.UpdateCreatorActivity(r.Context(), db.UpdateCreatorActivityParams{
		Kind:             kind,
		HappenedAt:       happenedAt,
		Summary:          summary,
		Outcome:          outcome,
		NextFollowAt:     nextFollowAt,
		OwnerMemberID:    owner,
		AssigneeType:     assigneeType,
		AssigneeID:       assigneeID,
		ReviewState:      decision.State,
		ReviewedBy:       decision.ReviewedBy,
		ReviewedAt:       decision.ReviewedAt,
		ID:               current.ID,
		WorkspaceID:      scope.WorkspaceUUID,
		ExpectedRevision: expectedRevision,
	})
	if err != nil {
		if !errors.Is(err, pgx.ErrNoRows) {
			workbenchInternalError(w, r, "failed to update the follow-up", err)
			return
		}
		_ = tx.Rollback(r.Context())
		survivor, readErr := h.Queries.GetCreatorActivity(r.Context(), db.GetCreatorActivityParams{
			ID: current.ID, WorkspaceID: scope.WorkspaceUUID,
		})
		if readErr != nil {
			writeError(w, http.StatusNotFound, "follow-up not found")
			return
		}
		writeStaleWrite(w, bdActivityToResponse(survivor,
			h.lastWorkbenchActor(r.Context(), scope, subjectCreatorActivity, survivor.ID)))
		return
	}
	// `summary` is the note of a follow-up: a PATCH that only rewrites it moves
	// no business field and therefore leaves no audit row (COLLAB-MODEL §2).
	var last *WorkbenchLastActor
	if fields := activityChanges(current, updated); len(fields) > 0 {
		event, err := recordWorkbenchActivityExtras(r.Context(), qtx, scope, subjectCreatorActivity, updated.ID,
			activityAction(), actor, actor.delegatedBy(scope), auditUpdate, fields,
			auditExtras{OverwriteReason: overwriteReason})
		if err != nil {
			workbenchInternalError(w, r, "failed to record the follow-up's change", err)
			return
		}
		last = lastActorFromActivity(event)
	}
	if err := tx.Commit(r.Context()); err != nil {
		workbenchInternalError(w, r, "failed to update the follow-up", err)
		return
	}
	writeJSON(w, http.StatusOK, bdActivityToResponse(updated, last))
}

// DeleteBdActivity 鈥?DELETE /api/workbench/bd/activities/{activityId}
func (h *Handler) DeleteBdActivity(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	if !h.requireWorkbenchCapability(w, r, scope, capCRMWrite) {
		return
	}
	current, ok := h.loadBdActivityForWrite(w, r, scope)
	if !ok {
		return
	}
	actor := h.workbenchActor(r, scope)
	if !agentDeleteGate(w, actor) {
		return
	}

	tx, err := h.TxStarter.Begin(r.Context())
	if err != nil {
		workbenchInternalError(w, r, "failed to delete the follow-up", err)
		return
	}
	defer tx.Rollback(r.Context())
	qtx := h.Queries.WithTx(tx)

	archived, err := qtx.ArchiveCreatorActivity(r.Context(), db.ArchiveCreatorActivityParams{
		ID:          current.ID,
		WorkspaceID: scope.WorkspaceUUID,
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to delete the follow-up", err)
		return
	}
	if archived == 0 {
		writeError(w, http.StatusNotFound, "follow-up not found")
		return
	}
	if _, err := recordWorkbenchActivity(r.Context(), qtx, scope, subjectCreatorActivity, current.ID,
		subjectCreatorActivity+".deleted", actor, actor.delegatedBy(scope), auditDelete,
		activityChanges(current, db.CreatorActivity{})); err != nil {
		workbenchInternalError(w, r, "failed to record the follow-up's deletion", err)
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		workbenchInternalError(w, r, "failed to delete the follow-up", err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ---- quotes ----------------------------------------------------------------

// ListBdQuotes 鈥?GET /api/workbench/bd/quotes
func (h *Handler) ListBdQuotes(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	if !h.requireWorkbenchCapability(w, r, scope, capCRMRead) {
		return
	}
	query := r.URL.Query()
	status, ok := bdEnum(w, optionalString(query.Get("status")), bdQuoteStatuses, "status")
	if !ok {
		return
	}
	creatorID, ok := workbenchOptionalUUID(w, optionalString(query.Get("creator_id")), "creator_id")
	if !ok {
		return
	}
	assigneeType, assigneeID, ok := h.workbenchAssigneeFilter(w, r, scope)
	if !ok {
		return
	}
	reviewState, ok := workbenchReviewStateFilter(w, r)
	if !ok {
		return
	}
	rows, err := h.Queries.ListCreatorQuotes(r.Context(), db.ListCreatorQuotesParams{
		WorkspaceID:  scope.WorkspaceUUID,
		CreatorID:    creatorID,
		Status:       optionalTrimmedText(optionalString(status)),
		AssigneeType: assigneeType,
		AssigneeID:   assigneeID,
		ReviewState:  reviewState,
		Limit:        workbenchLimit(r),
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to list quotes", err)
		return
	}
	resp := make([]BdQuoteWithThread, len(rows))
	actors := h.lastWorkbenchActors(r.Context(), scope, subjectCreatorQuote,
		subjectIDs(rows, func(row db.CreatorQuote) pgtype.UUID { return row.ID }))
	// A quote carries no `issue_id` column (COLLAB-MODEL §5), so its discussions are
	// found by the origin pair the thread stamped on the issue — one lookup for the
	// whole page, keyed by quote id.
	threads := h.workbenchThreadsByOrigin(r.Context(), scope, subjectCreatorQuote,
		subjectIDs(rows, func(row db.CreatorQuote) pgtype.UUID { return row.ID }))
	for i, row := range rows {
		resp[i] = BdQuoteWithThread{
			BdQuoteResponse: bdQuoteToResponse(row, actors[uuidToString(row.ID)]),
			Thread:          threads[uuidToString(row.ID)],
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"quotes": resp, "total": len(resp)})
}

// bdQuoteBriefRef validates the optional `brief_id` pointer against this
// workspace. No foreign key sits behind it (repository rule), and a foreign brief
// would make the quote's `creator 脳 brief` credential point at another tenant.
func (h *Handler) bdQuoteBriefRef(w http.ResponseWriter, r *http.Request, scope workbenchScope, raw *string) (pgtype.UUID, bool) {
	briefID, ok := workbenchOptionalUUID(w, raw, "brief_id")
	if !ok {
		return pgtype.UUID{}, false
	}
	if !briefID.Valid {
		return briefID, true
	}
	if _, err := h.Queries.GetCrmBrief(r.Context(), db.GetCrmBriefParams{
		ID:          briefID,
		WorkspaceID: scope.WorkspaceUUID,
	}); err != nil {
		writeError(w, http.StatusBadRequest, "brief_id is not a brief in this workspace")
		return pgtype.UUID{}, false
	}
	return briefID, true
}

// CreateBdQuote 鈥?POST /api/workbench/bd/quotes
func (h *Handler) CreateBdQuote(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	if !h.requireWorkbenchCapability(w, r, scope, capCRMWrite) {
		return
	}
	var req BdQuoteRequest
	if !decodeWorkbenchBody(w, r, &req) {
		return
	}
	actor := h.workbenchActor(r, scope)
	highValue, moneyFields := quoteHighValue(req)
	if !agentMoneyGate(w, actor, moneyFields) {
		return
	}
	if req.FeeAmount != nil || req.CommissionRate != nil {
		if !h.requireWorkbenchCapability(w, r, scope, capCRMAmount) {
			return
		}
	}
	creator, ok := h.requireCreatorInWorkspace(r.Context(), w, scope.WorkspaceID, req.CreatorID)
	if !ok {
		return
	}
	briefID, ok := h.bdQuoteBriefRef(w, r, scope, req.BriefID)
	if !ok {
		return
	}
	status := "draft"
	if parsed, ok := bdEnum(w, req.Status, bdQuoteStatuses, "status"); !ok {
		return
	} else if parsed != "" {
		status = parsed
	}
	if !bdCommissionRate(w, req.CommissionRate) {
		return
	}
	currency, ok := workbenchCurrency(w, req.Currency)
	if !ok {
		return
	}
	quotedAt, ok := workbenchTimestampValue(w, req.QuotedAt, "quoted_at")
	if !ok {
		return
	}
	validUntil, ok := workbenchDateValue(w, req.ValidUntil, "valid_until")
	if !ok {
		return
	}
	if !bdQuoteWindowOK(w, quotedAt, validUntil) {
		return
	}
	items, ok := bdQuoteItems(w, req.Items)
	if !ok {
		return
	}
	owner, ok := h.workbenchOwnerForCreate(w, r, scope, req.OwnerMemberID)
	if !ok {
		return
	}
	if !agentOwnerGate(w, actor, req.OwnerMemberID) {
		return
	}
	assigneeType, assigneeID, ok := h.workbenchAssigneePatch(w, r, scope,
		pgtype.Text{}, pgtype.UUID{}, req.AssigneeType, req.AssigneeID)
	if !ok {
		return
	}
	assigneeType, assigneeID = initialAssignee(owner, req.AssigneeType, req.AssigneeID, assigneeType, assigneeID)

	tx, err := h.TxStarter.Begin(r.Context())
	if err != nil {
		workbenchInternalError(w, r, "failed to record the quote", err)
		return
	}
	defer tx.Rollback(r.Context())
	qtx := h.Queries.WithTx(tx)

	created, err := qtx.CreateCreatorQuote(r.Context(), db.CreateCreatorQuoteParams{
		WorkspaceID:    scope.WorkspaceUUID,
		CreatorID:      creator.ID,
		BriefID:        briefID,
		Status:         status,
		QuotedAt:       quotedAt,
		ValidUntil:     validUntil,
		FeeAmount:      floatToNumeric(req.FeeAmount),
		CommissionRate: floatToNumeric(req.CommissionRate),
		Currency:       currency,
		Items:          string(items),
		Note:           optionalTrimmedText(req.Note),
		OwnerMemberID:  owner,
		CreatedBy:      scope.Member.UserID,
		AssigneeType:   assigneeType,
		AssigneeID:     assigneeID,
		ReviewState:    reviewForWrite(actor, highValue, reviewDecision{}).State,
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to record the quote", err)
		return
	}
	event, err := recordWorkbenchActivity(r.Context(), qtx, scope, subjectCreatorQuote, created.ID,
		subjectCreatorQuote+".created", actor, actor.delegatedBy(scope), auditCreate,
		quoteChanges(db.CreatorQuote{}, created))
	if err != nil {
		workbenchInternalError(w, r, "failed to record the quote's creation", err)
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		workbenchInternalError(w, r, "failed to record the quote", err)
		return
	}
	writeJSON(w, http.StatusCreated, bdQuoteToResponse(created, lastActorFromActivity(event)))
}

// loadBdQuoteForWrite resolves {quoteId} and applies the write gate.
func (h *Handler) loadBdQuoteForWrite(w http.ResponseWriter, r *http.Request, scope workbenchScope) (db.CreatorQuote, bool) {
	id, ok := parseUUIDOrBadRequest(w, chi.URLParam(r, "quoteId"), "quote id")
	if !ok {
		return db.CreatorQuote{}, false
	}
	quote, err := h.Queries.GetCreatorQuote(r.Context(), db.GetCreatorQuoteParams{
		ID:          id,
		WorkspaceID: scope.WorkspaceUUID,
	})
	if err != nil {
		writeError(w, http.StatusNotFound, "quote not found")
		return db.CreatorQuote{}, false
	}
	if !workbenchCanWrite(scope.Member, quote.OwnerMemberID) {
		writeError(w, http.StatusForbidden, "you can only change quotes you own")
		return db.CreatorQuote{}, false
	}
	return quote, true
}

// GetBdQuote 鈥?GET /api/workbench/bd/quotes/{quoteId}
func (h *Handler) GetBdQuote(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	if !h.requireWorkbenchCapability(w, r, scope, capCRMRead) {
		return
	}
	id, ok := parseUUIDOrBadRequest(w, chi.URLParam(r, "quoteId"), "quote id")
	if !ok {
		return
	}
	quote, err := h.Queries.GetCreatorQuote(r.Context(), db.GetCreatorQuoteParams{
		ID:          id,
		WorkspaceID: scope.WorkspaceUUID,
	})
	if err != nil {
		writeError(w, http.StatusNotFound, "quote not found")
		return
	}
	writerResponse := BdQuoteWithThread{
		BdQuoteResponse: bdQuoteToResponse(quote,
			h.lastWorkbenchActor(r.Context(), scope, subjectCreatorQuote, quote.ID)),
		Thread: h.workbenchThreadsByOrigin(r.Context(), scope, subjectCreatorQuote,
			[]pgtype.UUID{quote.ID})[uuidToString(quote.ID)],
	}
	writeJSON(w, http.StatusOK, writerResponse)
}

// UpdateBdQuote 鈥?PATCH /api/workbench/bd/quotes/{quoteId}
//
// The window check re-runs against the merged row, not the request body: moving
// `quoted_at` past an existing `valid_until` is the same typo as sending both at
// once, and only one of the two fields has to arrive for it to happen.
func (h *Handler) UpdateBdQuote(w http.ResponseWriter, r *http.Request) {
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
	var req BdQuoteRequest
	if !decodeWorkbenchBody(w, r, &req) {
		return
	}
	actor := h.workbenchActor(r, scope)
	highValue, moneyFields := quoteHighValue(req)
	if !agentMoneyGate(w, actor, moneyFields) {
		return
	}
	if req.FeeAmount != nil || req.CommissionRate != nil {
		if !h.requireWorkbenchCapability(w, r, scope, capCRMAmount) {
			return
		}
	}
	overwriteReason, ok := h.workbenchOverwriteReason(w, r, scope, actor, subjectCreatorQuote, current.ID, req.OverwriteReason)
	if !ok {
		return
	}
	if req.CreatorID != nil && strings.TrimSpace(*req.CreatorID) != "" {
		writeError(w, http.StatusBadRequest,
			"creator_id cannot be changed: record a new quote instead")
		return
	}

	briefID := current.BriefID
	if req.BriefID != nil {
		parsed, ok := h.bdQuoteBriefRef(w, r, scope, req.BriefID)
		if !ok {
			return
		}
		briefID = parsed
	}
	status := current.Status
	if parsed, ok := bdEnum(w, req.Status, bdQuoteStatuses, "status"); !ok {
		return
	} else if parsed != "" {
		status = parsed
	}
	if !bdCommissionRate(w, req.CommissionRate) {
		return
	}
	currency := strings.TrimSpace(current.Currency)
	if req.Currency != nil {
		parsed, ok := workbenchCurrency(w, req.Currency)
		if !ok {
			return
		}
		currency = parsed
	}
	quotedAt, ok := applyTimestampPatch(req.QuotedAt, w, "quoted_at", current.QuotedAt)
	if !ok {
		return
	}
	validUntil, ok := applyDatePatch(req.ValidUntil, w, "valid_until", current.ValidUntil)
	if !ok {
		return
	}
	if !bdQuoteWindowOK(w, quotedAt, validUntil) {
		return
	}
	items := current.Items
	if len(req.Items) > 0 {
		parsed, ok := bdQuoteItems(w, req.Items)
		if !ok {
			return
		}
		items = parsed
	}
	requestedOwner, ok := workbenchOptionalUUID(w, req.OwnerMemberID, "owner_member_id")
	if !ok {
		return
	}
	if !agentOwnerGate(w, actor, req.OwnerMemberID) {
		return
	}
	owner, ok := h.workbenchOwnerForUpdate(w, r, scope, current.OwnerMemberID, requestedOwner)
	if !ok {
		return
	}
	assigneeType, assigneeID, ok := h.workbenchAssigneePatch(w, r, scope,
		current.AssigneeType, current.AssigneeID, req.AssigneeType, req.AssigneeID)
	if !ok {
		return
	}
	expectedRevision, ok := workbenchExpectedRevision(w, req.ExpectedRevision)
	if !ok {
		return
	}

	decision := reviewForWrite(actor, highValue,
		currentReview(current.ReviewState, current.ReviewedBy, current.ReviewedAt))

	tx, err := h.TxStarter.Begin(r.Context())
	if err != nil {
		workbenchInternalError(w, r, "failed to update the quote", err)
		return
	}
	defer tx.Rollback(r.Context())
	qtx := h.Queries.WithTx(tx)

	updated, err := qtx.UpdateCreatorQuote(r.Context(), db.UpdateCreatorQuoteParams{
		BriefID:          briefID,
		Status:           status,
		QuotedAt:         quotedAt,
		ValidUntil:       validUntil,
		FeeAmount:        applyNumericPatch(req.FeeAmount, current.FeeAmount),
		CommissionRate:   applyNumericPatch(req.CommissionRate, current.CommissionRate),
		Currency:         currency,
		Items:            string(items),
		Note:             applyTextPatch(req.Note, current.Note),
		OwnerMemberID:    owner,
		AssigneeType:     assigneeType,
		AssigneeID:       assigneeID,
		ReviewState:      decision.State,
		ReviewedBy:       decision.ReviewedBy,
		ReviewedAt:       decision.ReviewedAt,
		ID:               current.ID,
		WorkspaceID:      scope.WorkspaceUUID,
		ExpectedRevision: expectedRevision,
	})
	if err != nil {
		if !errors.Is(err, pgx.ErrNoRows) {
			workbenchInternalError(w, r, "failed to update the quote", err)
			return
		}
		_ = tx.Rollback(r.Context())
		survivor, readErr := h.Queries.GetCreatorQuote(r.Context(), db.GetCreatorQuoteParams{
			ID: current.ID, WorkspaceID: scope.WorkspaceUUID,
		})
		if readErr != nil {
			writeError(w, http.StatusNotFound, "quote not found")
			return
		}
		writeStaleWrite(w, bdQuoteToResponse(survivor,
			h.lastWorkbenchActor(r.Context(), scope, subjectCreatorQuote, survivor.ID)))
		return
	}
	// `note` is excluded from the diff: a note-only PATCH bumps the revision and
	// leaves the trail alone (COLLAB-MODEL §2).
	var last *WorkbenchLastActor
	if fields := quoteChanges(current, updated); len(fields) > 0 {
		event, err := recordWorkbenchActivityExtras(r.Context(), qtx, scope, subjectCreatorQuote, updated.ID,
			quoteAction(fields), actor, actor.delegatedBy(scope), auditUpdate, fields,
			auditExtras{OverwriteReason: overwriteReason})
		if err != nil {
			workbenchInternalError(w, r, "failed to record the quote's change", err)
			return
		}
		last = lastActorFromActivity(event)
	}
	if err := tx.Commit(r.Context()); err != nil {
		workbenchInternalError(w, r, "failed to update the quote", err)
		return
	}
	writeJSON(w, http.StatusOK, bdQuoteToResponse(updated, last))
}

// DeleteBdQuote 鈥?DELETE /api/workbench/bd/quotes/{quoteId}
func (h *Handler) DeleteBdQuote(w http.ResponseWriter, r *http.Request) {
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
	actor := h.workbenchActor(r, scope)
	if !agentDeleteGate(w, actor) {
		return
	}

	tx, err := h.TxStarter.Begin(r.Context())
	if err != nil {
		workbenchInternalError(w, r, "failed to delete the quote", err)
		return
	}
	defer tx.Rollback(r.Context())
	qtx := h.Queries.WithTx(tx)

	archived, err := qtx.ArchiveCreatorQuote(r.Context(), db.ArchiveCreatorQuoteParams{
		ID:          current.ID,
		WorkspaceID: scope.WorkspaceUUID,
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to delete the quote", err)
		return
	}
	if archived == 0 {
		writeError(w, http.StatusNotFound, "quote not found")
		return
	}
	if _, err := recordWorkbenchActivity(r.Context(), qtx, scope, subjectCreatorQuote, current.ID,
		subjectCreatorQuote+".deleted", actor, actor.delegatedBy(scope), auditDelete,
		quoteChanges(current, db.CreatorQuote{})); err != nil {
		workbenchInternalError(w, r, "failed to record the quote's deletion", err)
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		workbenchInternalError(w, r, "failed to delete the quote", err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ---- campaigns -------------------------------------------------------------

// ListBdCampaigns 鈥?GET /api/workbench/bd/campaigns
func (h *Handler) ListBdCampaigns(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	if !h.requireWorkbenchCapability(w, r, scope, capCRMRead) {
		return
	}
	kind, ok := bdEnum(w, optionalString(r.URL.Query().Get("kind")), bdCampaignKinds, "kind")
	if !ok {
		return
	}
	rows, err := h.Queries.ListCreatorCampaigns(r.Context(), db.ListCreatorCampaignsParams{
		WorkspaceID: scope.WorkspaceUUID,
		Kind:        optionalTrimmedText(optionalString(kind)),
		Limit:       workbenchLimit(r),
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to list campaigns", err)
		return
	}
	resp := make([]BdCampaignResponse, len(rows))
	for i, row := range rows {
		resp[i] = bdCampaignToResponse(row)
	}
	writeJSON(w, http.StatusOK, map[string]any{"campaigns": resp, "total": len(resp)})
}

// bdCampaignConflicts answers "this name is taken" before the insert or update.
// The partial unique index (809) is the race-safe backstop; this read exists so
// the common case answers 409 with a message instead of a constraint error.
func (h *Handler) bdCampaignConflicts(w http.ResponseWriter, r *http.Request, scope workbenchScope, name string, excludeID pgtype.UUID) bool {
	conflicts, err := h.Queries.CountCreatorCampaignNameConflicts(r.Context(), db.CountCreatorCampaignNameConflictsParams{
		WorkspaceID: scope.WorkspaceUUID,
		Name:        name,
		ExcludeID:   excludeID,
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to check the campaign name", err)
		return false
	}
	if conflicts > 0 {
		writeError(w, http.StatusConflict, "a campaign with this name already exists")
		return false
	}
	return true
}

// CreateBdCampaign 鈥?POST /api/workbench/bd/campaigns
func (h *Handler) CreateBdCampaign(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	if !h.requireWorkbenchCapability(w, r, scope, capCRMWrite) {
		return
	}
	var req BdCampaignRequest
	if !decodeWorkbenchBody(w, r, &req) {
		return
	}
	name := strings.TrimSpace(valueOrEmpty(req.Name))
	if name == "" {
		writeError(w, http.StatusBadRequest, "name is required")
		return
	}
	kind := "manual"
	if parsed, ok := bdEnum(w, req.Kind, bdCampaignKinds, "kind"); !ok {
		return
	} else if parsed != "" {
		kind = parsed
	}
	currency, ok := workbenchCurrency(w, req.Currency)
	if !ok {
		return
	}
	startedOn, ok := workbenchDateValue(w, req.StartedOn, "started_on")
	if !ok {
		return
	}
	endedOn, ok := workbenchDateValue(w, req.EndedOn, "ended_on")
	if !ok {
		return
	}
	if !bdCampaignWindowOK(w, startedOn, endedOn) {
		return
	}
	creatorCount := int32(0)
	if req.CreatorCount != nil {
		if *req.CreatorCount < 0 {
			writeError(w, http.StatusBadRequest, "creator_count must not be negative")
			return
		}
		creatorCount = *req.CreatorCount
	}
	owner, ok := h.workbenchOwnerForCreate(w, r, scope, req.OwnerMemberID)
	if !ok {
		return
	}
	if !h.bdCampaignConflicts(w, r, scope, name, pgtype.UUID{}) {
		return
	}

	created, err := h.Queries.CreateCreatorCampaign(r.Context(), db.CreateCreatorCampaignParams{
		WorkspaceID:   scope.WorkspaceUUID,
		Name:          name,
		Kind:          kind,
		BudgetAmount:  floatToNumeric(req.BudgetAmount),
		Currency:      currency,
		StartedOn:     startedOn,
		EndedOn:       endedOn,
		SourceKeyword: optionalTrimmedText(req.SourceKeyword),
		CreatorCount:  creatorCount,
		Note:          optionalTrimmedText(req.Note),
		OwnerMemberID: owner,
		CreatedBy:     scope.Member.UserID,
	})
	if err != nil {
		// The pre-check above loses to a concurrent insert; the unique index (809)
		// is what actually makes the name unique, so its violation is the same 409.
		if isUniqueViolation(err) {
			writeError(w, http.StatusConflict, "a campaign with this name already exists")
			return
		}
		workbenchInternalError(w, r, "failed to create the campaign", err)
		return
	}
	writeJSON(w, http.StatusCreated, bdCampaignToResponse(created))
}

// loadBdCampaignForWrite resolves {campaignId} and applies the write gate.
func (h *Handler) loadBdCampaignForWrite(w http.ResponseWriter, r *http.Request, scope workbenchScope) (db.CreatorCampaign, bool) {
	id, ok := parseUUIDOrBadRequest(w, chi.URLParam(r, "campaignId"), "campaign id")
	if !ok {
		return db.CreatorCampaign{}, false
	}
	campaign, err := h.Queries.GetCreatorCampaign(r.Context(), db.GetCreatorCampaignParams{
		ID:          id,
		WorkspaceID: scope.WorkspaceUUID,
	})
	if err != nil {
		writeError(w, http.StatusNotFound, "campaign not found")
		return db.CreatorCampaign{}, false
	}
	if !workbenchCanWrite(scope.Member, campaign.OwnerMemberID) {
		writeError(w, http.StatusForbidden, "you can only change campaigns you own")
		return db.CreatorCampaign{}, false
	}
	return campaign, true
}

// GetBdCampaign 鈥?GET /api/workbench/bd/campaigns/{campaignId}
func (h *Handler) GetBdCampaign(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	if !h.requireWorkbenchCapability(w, r, scope, capCRMRead) {
		return
	}
	id, ok := parseUUIDOrBadRequest(w, chi.URLParam(r, "campaignId"), "campaign id")
	if !ok {
		return
	}
	campaign, err := h.Queries.GetCreatorCampaign(r.Context(), db.GetCreatorCampaignParams{
		ID:          id,
		WorkspaceID: scope.WorkspaceUUID,
	})
	if err != nil {
		writeError(w, http.StatusNotFound, "campaign not found")
		return
	}
	writeJSON(w, http.StatusOK, bdCampaignToResponse(campaign))
}

// UpdateBdCampaign 鈥?PATCH /api/workbench/bd/campaigns/{campaignId}
func (h *Handler) UpdateBdCampaign(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	if !h.requireWorkbenchCapability(w, r, scope, capCRMWrite) {
		return
	}
	current, ok := h.loadBdCampaignForWrite(w, r, scope)
	if !ok {
		return
	}
	var req BdCampaignRequest
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
	kind := current.Kind
	if parsed, ok := bdEnum(w, req.Kind, bdCampaignKinds, "kind"); !ok {
		return
	} else if parsed != "" {
		kind = parsed
	}
	currency := strings.TrimSpace(current.Currency)
	if req.Currency != nil {
		parsed, ok := workbenchCurrency(w, req.Currency)
		if !ok {
			return
		}
		currency = parsed
	}
	startedOn, ok := applyDatePatch(req.StartedOn, w, "started_on", current.StartedOn)
	if !ok {
		return
	}
	endedOn, ok := applyDatePatch(req.EndedOn, w, "ended_on", current.EndedOn)
	if !ok {
		return
	}
	if !bdCampaignWindowOK(w, startedOn, endedOn) {
		return
	}
	creatorCount := current.CreatorCount
	if req.CreatorCount != nil {
		if *req.CreatorCount < 0 {
			writeError(w, http.StatusBadRequest, "creator_count must not be negative")
			return
		}
		creatorCount = *req.CreatorCount
	}
	requestedOwner, ok := workbenchOptionalUUID(w, req.OwnerMemberID, "owner_member_id")
	if !ok {
		return
	}
	owner, ok := h.workbenchOwnerForUpdate(w, r, scope, current.OwnerMemberID, requestedOwner)
	if !ok {
		return
	}
	if !h.bdCampaignConflicts(w, r, scope, name, current.ID) {
		return
	}

	updated, err := h.Queries.UpdateCreatorCampaign(r.Context(), db.UpdateCreatorCampaignParams{
		Name:          name,
		Kind:          kind,
		BudgetAmount:  applyNumericPatch(req.BudgetAmount, current.BudgetAmount),
		Currency:      currency,
		StartedOn:     startedOn,
		EndedOn:       endedOn,
		SourceKeyword: applyTextPatch(req.SourceKeyword, current.SourceKeyword),
		CreatorCount:  creatorCount,
		Note:          applyTextPatch(req.Note, current.Note),
		OwnerMemberID: owner,
		ID:            current.ID,
		WorkspaceID:   scope.WorkspaceUUID,
	})
	if err != nil {
		if isUniqueViolation(err) {
			writeError(w, http.StatusConflict, "a campaign with this name already exists")
			return
		}
		workbenchInternalError(w, r, "failed to update the campaign", err)
		return
	}
	writeJSON(w, http.StatusOK, bdCampaignToResponse(updated))
}

// DeleteBdCampaign 鈥?DELETE /api/workbench/bd/campaigns/{campaignId}
func (h *Handler) DeleteBdCampaign(w http.ResponseWriter, r *http.Request) {
	scope, ok := h.workbenchReadScope(w, r)
	if !ok {
		return
	}
	if !h.requireWorkbenchCapability(w, r, scope, capCRMWrite) {
		return
	}
	current, ok := h.loadBdCampaignForWrite(w, r, scope)
	if !ok {
		return
	}
	archived, err := h.Queries.ArchiveCreatorCampaign(r.Context(), db.ArchiveCreatorCampaignParams{
		ID:          current.ID,
		WorkspaceID: scope.WorkspaceUUID,
	})
	if err != nil {
		workbenchInternalError(w, r, "failed to delete the campaign", err)
		return
	}
	if archived == 0 {
		writeError(w, http.StatusNotFound, "campaign not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
