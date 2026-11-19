package handler

// Shared building blocks for the workbench ledgers
// (docs/engineering/WORKBENCH-API.md). Three domains hang off this file:
//
//   - creator commerce: creator / creator_post / creator_post_metric
//   - CRM: crm_client / crm_brief / crm_collab / crm_settlement
//   - aggregates: /overview and /counts
//
// The rules encoded here, once, so every handler applies them the same way:
//
//   - Reads: any workspace member. Writes: `owner`/`admin` may change any row; a
//     `member` may only change the rows it owns (`owner_member_id` = their user
//     id) and a row it creates is owned by itself.
//   - `department_id` is an aggregate filter and never an access boundary
//     (docs/engineering/ORG-MODEL.md), so no read path here filters by it.
//   - Amounts cross the wire as JSON numbers for display, but are read and
//     written as NUMERIC(14,2) — no float is ever the stored value.
//   - Every successful write publishes the domain's `:changed` event; the
//     patchers on the client invalidate the domain list plus overview/counts.

import (
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/jerry-halo2026/morchat.co/server/internal/logger"
	db "github.com/jerry-halo2026/morchat.co/server/pkg/db/generated"
)

// Workbench event types (docs/engineering/WORKBENCH-API.md §4). They stay local
// to this package rather than joining pkg/protocol's constant block, because
// the front end registers them in `packages/core/types/events.ts` and the two
// lists are already kept in step by the contract document; adding a second
// string constant next to an existing one is a rename hazard, not a safeguard.
const (
	eventCreatorChanged       = "creator:changed"
	eventCreatorPostChanged   = "creator_post:changed"
	eventCRMClientChanged     = "crm_client:changed"
	eventCRMBriefChanged      = "crm_brief:changed"
	eventCRMCollabChanged     = "crm_collab:changed"
	eventCRMCollabStageChange = "crm_collab:stage_changed"
	eventCRMSettlementChanged = "crm_settlement:changed"
)

// workbenchScope is one request's resolved workspace, caller and optional
// department filter.
type workbenchScope struct {
	WorkspaceID   string
	WorkspaceUUID pgtype.UUID
	Member        db.Member
	// Department is the aggregate filter from `?department_id=`; the zero value
	// means "every department".
	Department pgtype.UUID
}

// workbenchReadScope resolves the workspace and the caller's membership. It
// writes the response itself on failure, so callers only check the bool.
func (h *Handler) workbenchReadScope(w http.ResponseWriter, r *http.Request) (workbenchScope, bool) {
	workspaceID := h.resolveWorkspaceID(r)
	member, ok := h.requireWorkspaceMember(w, r, workspaceID, "workspace not found")
	if !ok {
		return workbenchScope{}, false
	}
	wsUUID, ok := parseUUIDOrBadRequest(w, workspaceID, "workspace id")
	if !ok {
		return workbenchScope{}, false
	}
	return workbenchScope{WorkspaceID: workspaceID, WorkspaceUUID: wsUUID, Member: member}, true
}

// workbenchDepartmentFilter parses `?department_id=`. An absent value means the
// whole workspace; a malformed one is a 400 rather than a silent "all
// departments", because a filter that quietly widens a number is worse than an
// error.
func workbenchDepartmentFilter(w http.ResponseWriter, r *http.Request) (pgtype.UUID, bool) {
	raw := strings.TrimSpace(r.URL.Query().Get("department_id"))
	if raw == "" {
		return pgtype.UUID{}, true
	}
	return parseUUIDOrBadRequest(w, raw, "department_id")
}

// workbenchCanWrite reports whether member may modify a row owned by owner.
// A `member` only owns the rows whose owner_member_id is their user id; an
// unowned row (NULL) belongs to the owners/admins, so a member cannot claim it
// by writing to it.
func workbenchCanWrite(member db.Member, owner pgtype.UUID) bool {
	if roleAllowed(member.Role, "owner", "admin") {
		return true
	}
	return owner.Valid && uuidToString(owner) == uuidToString(member.UserID)
}

// workbenchOwnerForCreate resolves who owns a row being created. A `member` may
// only own what it creates, so an explicit different owner is rejected instead
// of silently rewritten; owners and admins may name any current member, and an
// omitted owner means "me".
func (h *Handler) workbenchOwnerForCreate(w http.ResponseWriter, r *http.Request, scope workbenchScope, requested *string) (pgtype.UUID, bool) {
	self := scope.Member.UserID
	if requested == nil || strings.TrimSpace(*requested) == "" {
		return self, true
	}
	ownerID, ok := parseUUIDOrBadRequest(w, strings.TrimSpace(*requested), "owner_member_id")
	if !ok {
		return pgtype.UUID{}, false
	}
	if !roleAllowed(scope.Member.Role, "owner", "admin") {
		if uuidToString(ownerID) != uuidToString(self) {
			writeError(w, http.StatusForbidden, "members can only create rows they own")
			return pgtype.UUID{}, false
		}
		return ownerID, true
	}
	if _, err := h.getWorkspaceMember(r.Context(), uuidToString(ownerID), scope.WorkspaceID); err != nil {
		writeError(w, http.StatusBadRequest, "owner_member_id is not a member of this workspace")
		return pgtype.UUID{}, false
	}
	return ownerID, true
}

// workbenchOwnerForUpdate resolves the owner a PATCH leaves behind. Only an
// owner/admin may hand a row to someone else; a member must keep owning it.
func (h *Handler) workbenchOwnerForUpdate(w http.ResponseWriter, r *http.Request, scope workbenchScope, current, requested pgtype.UUID) (pgtype.UUID, bool) {
	if !requested.Valid {
		return current, true
	}
	if uuidToString(requested) == uuidToString(current) {
		return requested, true
	}
	if !roleAllowed(scope.Member.Role, "owner", "admin") {
		writeError(w, http.StatusForbidden, "members cannot reassign ownership")
		return pgtype.UUID{}, false
	}
	if _, err := h.getWorkspaceMember(r.Context(), uuidToString(requested), scope.WorkspaceID); err != nil {
		writeError(w, http.StatusBadRequest, "owner_member_id is not a member of this workspace")
		return pgtype.UUID{}, false
	}
	return requested, true
}

// workbenchLimit reads `?limit=`, defaulting to 50 and capping at 200 so a
// single request cannot pull an entire ledger.
func workbenchLimit(r *http.Request) int32 {
	const (
		defaultLimit = 50
		maxLimit     = 200
	)
	raw := strings.TrimSpace(r.URL.Query().Get("limit"))
	if raw == "" {
		return defaultLimit
	}
	parsed, err := strconv.Atoi(raw)
	if err != nil || parsed <= 0 {
		return defaultLimit
	}
	if parsed > maxLimit {
		return maxLimit
	}
	return int32(parsed)
}

// workbenchCursor reads `?cursor=` (the previous page's last row id).
func workbenchCursor(w http.ResponseWriter, r *http.Request) (pgtype.UUID, bool) {
	raw := strings.TrimSpace(r.URL.Query().Get("cursor"))
	if raw == "" {
		return pgtype.UUID{}, true
	}
	return parseUUIDOrBadRequest(w, raw, "cursor")
}

// workbenchCursorKey resolves `?cursor=` into the (sort timestamp, id) pair the
// keyset predicate compares against. The caller passes the loader for its own
// table, so a cursor from another workspace or a deleted row is a 400 here
// instead of a silently empty page from the SQL.
func (h *Handler) workbenchCursorKey(w http.ResponseWriter, r *http.Request, sortAt func(pgtype.UUID) (pgtype.Timestamptz, error)) (pgtype.Timestamptz, pgtype.UUID, bool) {
	cursorID, ok := workbenchCursor(w, r)
	if !ok {
		return pgtype.Timestamptz{}, pgtype.UUID{}, false
	}
	if !cursorID.Valid {
		return pgtype.Timestamptz{}, pgtype.UUID{}, true
	}
	at, err := sortAt(cursorID)
	if err != nil {
		writeError(w, http.StatusBadRequest, "cursor not found")
		return pgtype.Timestamptz{}, pgtype.UUID{}, false
	}
	return at, cursorID, true
}

// optionalTrimmedText turns an optional request string into a nullable column
// value: absent and empty both mean NULL, so a PATCH can clear a field by
// sending "".
func optionalTrimmedText(raw *string) pgtype.Text {
	if raw == nil {
		return pgtype.Text{}
	}
	trimmed := strings.TrimSpace(*raw)
	if trimmed == "" {
		return pgtype.Text{}
	}
	return pgtype.Text{String: trimmed, Valid: true}
}

// workbenchOptionalUUID parses an optional UUID field. Absent and empty both
// mean NULL.
func workbenchOptionalUUID(w http.ResponseWriter, raw *string, fieldName string) (pgtype.UUID, bool) {
	if raw == nil || strings.TrimSpace(*raw) == "" {
		return pgtype.UUID{}, true
	}
	return parseUUIDOrBadRequest(w, strings.TrimSpace(*raw), fieldName)
}

// floatToNumeric converts a display amount back into NUMERIC. It goes through
// the shortest decimal form of the value rather than binary scaling, so 1200.5
// arrives as "1200.5" and PostgreSQL rounds it once, to the column's scale.
func floatToNumeric(v *float64) pgtype.Numeric {
	if v == nil {
		return pgtype.Numeric{}
	}
	var n pgtype.Numeric
	if err := n.Scan(strconv.FormatFloat(*v, 'f', -1, 64)); err != nil {
		return pgtype.Numeric{}
	}
	return n
}

// numericToFloatPtr renders a stored NUMERIC for JSON. Amounts are display
// values on the way out; the stored value stays exact.
func numericToFloatPtr(n pgtype.Numeric) *float64 {
	if !n.Valid {
		return nil
	}
	f, err := n.Float64Value()
	if err != nil || !f.Valid {
		return nil
	}
	value := f.Float64
	return &value
}

func numericToFloat(n pgtype.Numeric) float64 {
	if v := numericToFloatPtr(n); v != nil {
		return *v
	}
	return 0
}

// int2ToPtr renders a nullable SMALLINT for JSON.
func int2ToPtr(v pgtype.Int2) *int32 {
	if !v.Valid {
		return nil
	}
	value := int32(v.Int16)
	return &value
}

// int2AsInt4 widens a stored SMALLINT (creator.score) to the INTEGER the update
// statement binds, so a PATCH can resend an unchanged score.
func int2AsInt4(v pgtype.Int2) pgtype.Int4 {
	if !v.Valid {
		return pgtype.Int4{}
	}
	return pgtype.Int4{Int32: int32(v.Int16), Valid: true}
}

// workbenchDateValue parses an optional DATE field. It accepts the wire form
// `YYYY-MM-DD` and a full RFC 3339 timestamp (truncated to its date), because
// browsers send the former and importers the latter.
func workbenchDateValue(w http.ResponseWriter, raw *string, fieldName string) (pgtype.Date, bool) {
	if raw == nil || strings.TrimSpace(*raw) == "" {
		return pgtype.Date{}, true
	}
	value := strings.TrimSpace(*raw)
	if parsed, err := time.Parse("2006-01-02", value); err == nil {
		return pgtype.Date{Time: parsed, Valid: true}, true
	}
	if parsed, err := time.Parse(time.RFC3339, value); err == nil {
		return pgtype.Date{Time: parsed, Valid: true}, true
	}
	writeError(w, http.StatusBadRequest, "invalid "+fieldName)
	return pgtype.Date{}, false
}

// workbenchTimestampValue parses an optional TIMESTAMPTZ field from RFC 3339
// (or a bare date, taken as that day at 00:00 in the request's own offset).
func workbenchTimestampValue(w http.ResponseWriter, raw *string, fieldName string) (pgtype.Timestamptz, bool) {
	if raw == nil || strings.TrimSpace(*raw) == "" {
		return pgtype.Timestamptz{}, true
	}
	value := strings.TrimSpace(*raw)
	if parsed, err := time.Parse(time.RFC3339, value); err == nil {
		return pgtype.Timestamptz{Time: parsed, Valid: true}, true
	}
	if parsed, err := time.Parse("2006-01-02", value); err == nil {
		return pgtype.Timestamptz{Time: parsed, Valid: true}, true
	}
	writeError(w, http.StatusBadRequest, "invalid "+fieldName)
	return pgtype.Timestamptz{}, false
}

// decodeWorkbenchBody decodes a JSON request body, rejecting a malformed one.
// An empty body is a valid empty object so a PATCH that only carries query
// parameters does not 400.
func decodeWorkbenchBody(w http.ResponseWriter, r *http.Request, dest any) bool {
	if r.Body == nil {
		return true
	}
	if err := json.NewDecoder(r.Body).Decode(dest); err != nil {
		if errors.Is(err, io.EOF) {
			return true
		}
		writeError(w, http.StatusBadRequest, "invalid request body")
		return false
	}
	return true
}

// workbenchInternalError logs the cause and answers with a stable message. The
// raw error never reaches the client: these tables carry contract values.
func workbenchInternalError(w http.ResponseWriter, r *http.Request, message string, err error) {
	slog.Error(message, append(logger.RequestAttrs(r), "error", err)...)
	writeError(w, http.StatusInternalServerError, message)
}

// dateToString renders a DATE column as `YYYY-MM-DD` (empty when NULL), which
// is what the wire form and every importer use.
func dateToString(d pgtype.Date) string {
	if out := dateToPtr(d); out != nil {
		return *out
	}
	return ""
}

// pgtypeDateToday is "today" for a DATE column that the caller did not send.
func pgtypeDateToday() pgtype.Date {
	now := time.Now().UTC()
	return pgtype.Date{Time: time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC), Valid: true}
}

// ---- request-value helpers -------------------------------------------------
//
// A PATCH body and a create body share one struct: nil means "not sent", so the
// create path needs a default and the update path needs to keep the stored
// value. These helpers keep that distinction in one place instead of repeating
// `if x != nil` at every call site.

func stringPtr(s string) *string { return &s }

func valueOrEmpty(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

func int64Value(v *int64) int64 {
	if v == nil {
		return 0
	}
	return *v
}

func int8Value(v *int64) pgtype.Int8 {
	if v == nil {
		return pgtype.Int8{}
	}
	return pgtype.Int8{Int64: *v, Valid: true}
}

func int4Value(v *int32) pgtype.Int4 {
	if v == nil {
		return pgtype.Int4{}
	}
	return pgtype.Int4{Int32: *v, Valid: true}
}

func boolValue(v *bool) bool {
	if v == nil {
		return false
	}
	return *v
}

func applyTextPatch(patched *string, current pgtype.Text) pgtype.Text {
	if patched == nil {
		return current
	}
	return optionalTrimmedText(patched)
}

func applyInt64Patch(patched *int64, current int64) int64 {
	if patched == nil {
		return current
	}
	return *patched
}

func applyInt4Patch(patched *int32, current pgtype.Int4) pgtype.Int4 {
	if patched == nil {
		return current
	}
	return pgtype.Int4{Int32: *patched, Valid: true}
}

func applyBoolPatch(patched *bool, current bool) bool {
	if patched == nil {
		return current
	}
	return *patched
}

func applyNumericPatch(patched *float64, current pgtype.Numeric) pgtype.Numeric {
	if patched == nil {
		return current
	}
	return floatToNumeric(patched)
}

func applyInt8Patch(patched *int64, current pgtype.Int8) pgtype.Int8 {
	if patched == nil {
		return current
	}
	return pgtype.Int8{Int64: *patched, Valid: true}
}

func applyDatePatch(patched *string, w http.ResponseWriter, fieldName string, current pgtype.Date) (pgtype.Date, bool) {
	if patched == nil {
		return current, true
	}
	return workbenchDateValue(w, patched, fieldName)
}

func applyTimestampPatch(patched *string, w http.ResponseWriter, fieldName string, current pgtype.Timestamptz) (pgtype.Timestamptz, bool) {
	if patched == nil {
		return current, true
	}
	return workbenchTimestampValue(w, patched, fieldName)
}

// ---- responses -------------------------------------------------------------

type CreatorResponse struct {
	ID               string   `json:"id"`
	WorkspaceID      string   `json:"workspace_id"`
	Kind             string   `json:"kind"`
	DisplayName      string   `json:"display_name"`
	Platform         string   `json:"platform"`
	Handle           string   `json:"handle"`
	URL              *string  `json:"url"`
	Fans             int64    `json:"fans"`
	FansD7           int64    `json:"fans_d7"`
	AvgPlay          int64    `json:"avg_play"`
	EngagementRate   *float64 `json:"engagement_rate"`
	Category         *string  `json:"category"`
	AudienceNote     *string  `json:"audience_note"`
	Region           *string  `json:"region"`
	PriceNote        *string  `json:"price_note"`
	Score            *int32   `json:"score"`
	RiskFlag         bool     `json:"risk_flag"`
	BlacklistReason  *string  `json:"blacklist_reason"`
	OwnerMemberID    *string  `json:"owner_member_id"`
	MediaIPProjectID *string  `json:"media_ip_project_id"`
	CreatedBy        *string  `json:"created_by"`
	CreatedAt        string   `json:"created_at"`
	UpdatedAt        string   `json:"updated_at"`
}

func creatorToResponse(c db.Creator) CreatorResponse {
	return CreatorResponse{
		ID:               uuidToString(c.ID),
		WorkspaceID:      uuidToString(c.WorkspaceID),
		Kind:             c.Kind,
		DisplayName:      c.DisplayName,
		Platform:         c.Platform,
		Handle:           c.Handle,
		URL:              textToPtr(c.Url),
		Fans:             c.Fans,
		FansD7:           c.FansD7,
		AvgPlay:          c.AvgPlay,
		EngagementRate:   numericToFloatPtr(c.EngagementRate),
		Category:         textToPtr(c.Category),
		AudienceNote:     textToPtr(c.AudienceNote),
		Region:           textToPtr(c.Region),
		PriceNote:        textToPtr(c.PriceNote),
		Score:            int2ToPtr(c.Score),
		RiskFlag:         c.RiskFlag,
		BlacklistReason:  textToPtr(c.BlacklistReason),
		OwnerMemberID:    uuidToPtr(c.OwnerMemberID),
		MediaIPProjectID: uuidToPtr(c.MediaIpProjectID),
		CreatedBy:        uuidToPtr(c.CreatedBy),
		CreatedAt:        timestampToString(c.CreatedAt),
		UpdatedAt:        timestampToString(c.UpdatedAt),
	}
}

type CreatorPostResponse struct {
	ID             string  `json:"id"`
	WorkspaceID    string  `json:"workspace_id"`
	CreatorID      string  `json:"creator_id"`
	CollabID       *string `json:"collab_id"`
	ContentIssueID *string `json:"content_issue_id"`
	Platform       string  `json:"platform"`
	Title          *string `json:"title"`
	URL            string  `json:"url"`
	PublishedAt    string  `json:"published_at"`
	Source         string  `json:"source"`
	CreatedBy      *string `json:"created_by"`
	CreatedAt      string  `json:"created_at"`
	UpdatedAt      string  `json:"updated_at"`
}

func creatorPostToResponse(p db.CreatorPost) CreatorPostResponse {
	return CreatorPostResponse{
		ID:             uuidToString(p.ID),
		WorkspaceID:    uuidToString(p.WorkspaceID),
		CreatorID:      uuidToString(p.CreatorID),
		CollabID:       uuidToPtr(p.CollabID),
		ContentIssueID: uuidToPtr(p.ContentIssueID),
		Platform:       p.Platform,
		Title:          textToPtr(p.Title),
		URL:            p.Url,
		PublishedAt:    timestampToString(p.PublishedAt),
		Source:         p.Source,
		CreatedBy:      uuidToPtr(p.CreatedBy),
		CreatedAt:      timestampToString(p.CreatedAt),
		UpdatedAt:      timestampToString(p.UpdatedAt),
	}
}

type CreatorPostMetricResponse struct {
	ID          string   `json:"id"`
	WorkspaceID string   `json:"workspace_id"`
	PostID      string   `json:"post_id"`
	CapturedOn  string   `json:"captured_on"`
	Play        *int64   `json:"play"`
	Likes       *int64   `json:"likes"`
	Comments    *int64   `json:"comments"`
	Shares      *int64   `json:"shares"`
	Clicks      *int64   `json:"clicks"`
	Converts    *int64   `json:"converts"`
	GMVAmount   *float64 `json:"gmv_amount"`
	Currency    string   `json:"currency"`
	Source      string   `json:"source"`
	CreatedAt   string   `json:"created_at"`
	UpdatedAt   string   `json:"updated_at"`
}

func creatorPostMetricToResponse(m db.CreatorPostMetric) CreatorPostMetricResponse {
	return CreatorPostMetricResponse{
		ID:          uuidToString(m.ID),
		WorkspaceID: uuidToString(m.WorkspaceID),
		PostID:      uuidToString(m.PostID),
		CapturedOn:  dateToString(m.CapturedOn),
		Play:        int8ToPtr(m.Play),
		Likes:       int8ToPtr(m.Likes),
		Comments:    int8ToPtr(m.Comments),
		Shares:      int8ToPtr(m.Shares),
		Clicks:      int8ToPtr(m.Clicks),
		Converts:    int8ToPtr(m.Converts),
		GMVAmount:   numericToFloatPtr(m.GmvAmount),
		Currency:    m.Currency,
		Source:      m.Source,
		CreatedAt:   timestampToString(m.CreatedAt),
		UpdatedAt:   timestampToString(m.UpdatedAt),
	}
}

type CrmClientResponse struct {
	ID             string  `json:"id"`
	WorkspaceID    string  `json:"workspace_id"`
	Name           string  `json:"name"`
	Brand          *string `json:"brand"`
	Industry       *string `json:"industry"`
	ContactName    *string `json:"contact_name"`
	ContactChannel *string `json:"contact_channel"`
	ContractEntity *string `json:"contract_entity"`
	PaymentTerms   *string `json:"payment_terms"`
	CreditNote     *string `json:"credit_note"`
	OwnerMemberID  *string `json:"owner_member_id"`
	CreatedBy      *string `json:"created_by"`
	CreatedAt      string  `json:"created_at"`
	UpdatedAt      string  `json:"updated_at"`
}

func crmClientToResponse(c db.CrmClient) CrmClientResponse {
	return CrmClientResponse{
		ID:             uuidToString(c.ID),
		WorkspaceID:    uuidToString(c.WorkspaceID),
		Name:           c.Name,
		Brand:          textToPtr(c.Brand),
		Industry:       textToPtr(c.Industry),
		ContactName:    textToPtr(c.ContactName),
		ContactChannel: textToPtr(c.ContactChannel),
		ContractEntity: textToPtr(c.ContractEntity),
		PaymentTerms:   textToPtr(c.PaymentTerms),
		CreditNote:     textToPtr(c.CreditNote),
		OwnerMemberID:  uuidToPtr(c.OwnerMemberID),
		CreatedBy:      uuidToPtr(c.CreatedBy),
		CreatedAt:      timestampToString(c.CreatedAt),
		UpdatedAt:      timestampToString(c.UpdatedAt),
	}
}

type CrmBriefResponse struct {
	ID              string   `json:"id"`
	WorkspaceID     string   `json:"workspace_id"`
	ClientID        string   `json:"client_id"`
	Title           string   `json:"title"`
	Category        *string  `json:"category"`
	BudgetMinAmount *float64 `json:"budget_min_amount"`
	BudgetMaxAmount *float64 `json:"budget_max_amount"`
	TargetAudience  *string  `json:"target_audience"`
	DeliverableType *string  `json:"deliverable_type"`
	Platforms       []string `json:"platforms"`
	ScheduleFrom    *string  `json:"schedule_from"`
	ScheduleTo      *string  `json:"schedule_to"`
	KPIPlay         *int64   `json:"kpi_play"`
	KPIGMVAmount    *float64 `json:"kpi_gmv_amount"`
	Status          string   `json:"status"`
	OwnerMemberID   *string  `json:"owner_member_id"`
	CreatedBy       *string  `json:"created_by"`
	CreatedAt       string   `json:"created_at"`
	UpdatedAt       string   `json:"updated_at"`
}

func crmBriefToResponse(b db.CrmBrief) CrmBriefResponse {
	platforms := b.Platforms
	if platforms == nil {
		platforms = []string{}
	}
	return CrmBriefResponse{
		ID:              uuidToString(b.ID),
		WorkspaceID:     uuidToString(b.WorkspaceID),
		ClientID:        uuidToString(b.ClientID),
		Title:           b.Title,
		Category:        textToPtr(b.Category),
		BudgetMinAmount: numericToFloatPtr(b.BudgetMinAmount),
		BudgetMaxAmount: numericToFloatPtr(b.BudgetMaxAmount),
		TargetAudience:  textToPtr(b.TargetAudience),
		DeliverableType: textToPtr(b.DeliverableType),
		Platforms:       platforms,
		ScheduleFrom:    dateToPtr(b.ScheduleFrom),
		ScheduleTo:      dateToPtr(b.ScheduleTo),
		KPIPlay:         int8ToPtr(b.KpiPlay),
		KPIGMVAmount:    numericToFloatPtr(b.KpiGmvAmount),
		Status:          b.Status,
		OwnerMemberID:   uuidToPtr(b.OwnerMemberID),
		CreatedBy:       uuidToPtr(b.CreatedBy),
		CreatedAt:       timestampToString(b.CreatedAt),
		UpdatedAt:       timestampToString(b.UpdatedAt),
	}
}

type CrmCollabResponse struct {
	ID             string   `json:"id"`
	WorkspaceID    string   `json:"workspace_id"`
	BriefID        string   `json:"brief_id"`
	CreatorID      string   `json:"creator_id"`
	Stage          string   `json:"stage"`
	QuoteAmount    *float64 `json:"quote_amount"`
	FinalAmount    *float64 `json:"final_amount"`
	Prob           *float64 `json:"prob"`
	CreatorFee     *float64 `json:"creator_fee"`
	SampleCost     *float64 `json:"sample_cost"`
	PlatformFee    *float64 `json:"platform_fee"`
	Currency       string   `json:"currency"`
	SettlementMode *string  `json:"settlement_mode"`
	CommissionRate *float64 `json:"commission_rate"`
	SampleRequired bool     `json:"sample_required"`
	ScriptRequired bool     `json:"script_required"`
	ScheduledAt    *string  `json:"scheduled_at"`
	ConfirmedAt    *string  `json:"confirmed_at"`
	PublishedAt    *string  `json:"published_at"`
	AcceptedAt     *string  `json:"accepted_at"`
	IssueID        *string  `json:"issue_id"`
	OwnerMemberID  *string  `json:"owner_member_id"`
	CreatedBy      *string  `json:"created_by"`
	CreatedAt      string   `json:"created_at"`
	UpdatedAt      string   `json:"updated_at"`
}

func crmCollabToResponse(c db.CrmCollab) CrmCollabResponse {
	return CrmCollabResponse{
		ID:             uuidToString(c.ID),
		WorkspaceID:    uuidToString(c.WorkspaceID),
		BriefID:        uuidToString(c.BriefID),
		CreatorID:      uuidToString(c.CreatorID),
		Stage:          c.Stage,
		QuoteAmount:    numericToFloatPtr(c.QuoteAmount),
		FinalAmount:    numericToFloatPtr(c.FinalAmount),
		Prob:           numericToFloatPtr(c.Prob),
		CreatorFee:     numericToFloatPtr(c.CreatorFee),
		SampleCost:     numericToFloatPtr(c.SampleCost),
		PlatformFee:    numericToFloatPtr(c.PlatformFee),
		Currency:       c.Currency,
		SettlementMode: textToPtr(c.SettlementMode),
		CommissionRate: numericToFloatPtr(c.CommissionRate),
		SampleRequired: c.SampleRequired,
		ScriptRequired: c.ScriptRequired,
		ScheduledAt:    timestampToPtr(c.ScheduledAt),
		ConfirmedAt:    timestampToPtr(c.ConfirmedAt),
		PublishedAt:    timestampToPtr(c.PublishedAt),
		AcceptedAt:     timestampToPtr(c.AcceptedAt),
		IssueID:        uuidToPtr(c.IssueID),
		OwnerMemberID:  uuidToPtr(c.OwnerMemberID),
		CreatedBy:      uuidToPtr(c.CreatedBy),
		CreatedAt:      timestampToString(c.CreatedAt),
		UpdatedAt:      timestampToString(c.UpdatedAt),
	}
}

type CrmSettlementResponse struct {
	ID          string  `json:"id"`
	WorkspaceID string  `json:"workspace_id"`
	CollabID    string  `json:"collab_id"`
	Kind        string  `json:"kind"`
	Amount      float64 `json:"amount"`
	Currency    string  `json:"currency"`
	DueAt       *string `json:"due_at"`
	PaidAt      *string `json:"paid_at"`
	InvoiceNo   *string `json:"invoice_no"`
	Note        *string `json:"note"`
	CreatedBy   *string `json:"created_by"`
	CreatedAt   string  `json:"created_at"`
	UpdatedAt   string  `json:"updated_at"`
}

func crmSettlementToResponse(s db.CrmSettlement) CrmSettlementResponse {
	return CrmSettlementResponse{
		ID:          uuidToString(s.ID),
		WorkspaceID: uuidToString(s.WorkspaceID),
		CollabID:    uuidToString(s.CollabID),
		Kind:        s.Kind,
		Amount:      numericToFloat(s.Amount),
		Currency:    s.Currency,
		DueAt:       dateToPtr(s.DueAt),
		PaidAt:      dateToPtr(s.PaidAt),
		InvoiceNo:   textToPtr(s.InvoiceNo),
		Note:        textToPtr(s.Note),
		CreatedBy:   uuidToPtr(s.CreatedBy),
		CreatedAt:   timestampToString(s.CreatedAt),
		UpdatedAt:   timestampToString(s.UpdatedAt),
	}
}
