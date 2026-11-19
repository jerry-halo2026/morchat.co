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
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"math"
	"net/http"
	"reflect"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

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
	// BD pipeline ledgers (§20), the debt §20.6 recorded until this batch: the
	// three tables below had no `:changed` event, so a second client's ledger
	// never refreshed until it refetched on its own.
	eventBdActivityChanged = "creator_activity:changed"
	eventBdQuoteChanged    = "creator_quote:changed"
	eventBdCampaignChanged = "creator_campaign:changed"
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
	// Capabilities caches one request's resolved capability set (§24.2). Nil until
	// the first lookup; a scope is per-request, so the cache never outlives the
	// membership it was resolved from.
	Capabilities capabilitySet
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

// workbenchAmountMax is the widest value NUMERIC(14,2) can hold: twelve integer
// digits and two decimals.
//
// The bound is checked in Go because PostgreSQL's answer to a value outside it is
// SQLSTATE 22003 ("numeric field overflow"), which the handlers can only report as
// a 500 — a response that tells the caller the ledger is broken instead of telling
// them which number does not fit. 1234567890123456 is exactly the shape a
// spreadsheet produces when a column loses its decimal point, so it is not a
// theoretical input.
const workbenchAmountMax = 99999999999.99

// workbenchAmountMessage is the one wording every amount rejection uses.
const workbenchAmountMessage = "must be between -99999999999.99 and 99999999999.99 (NUMERIC(14,2))"

// workbenchAmountFits reports whether PostgreSQL can store the value in a
// NUMERIC(14,2) column.
func workbenchAmountFits(v *float64) bool {
	if v == nil {
		return true
	}
	if math.IsNaN(*v) || math.IsInf(*v, 0) {
		return false
	}
	return math.Abs(*v) <= workbenchAmountMax
}

// workbenchMoneyValue resolves an optional display amount for a create body. A
// value the column cannot hold is a 400 naming the field, never a 500.
func workbenchMoneyValue(w http.ResponseWriter, raw *float64, fieldName string) (pgtype.Numeric, bool) {
	if !workbenchAmountFits(raw) {
		writeError(w, http.StatusBadRequest, fieldName+" "+workbenchAmountMessage)
		return pgtype.Numeric{}, false
	}
	return floatToNumeric(raw), true
}

// workbenchMoneyPatch is applyNumericPatch with the same bound: absent keeps the
// stored amount, and a value outside the column is refused before it reaches SQL.
func workbenchMoneyPatch(w http.ResponseWriter, raw *float64, fieldName string, current pgtype.Numeric) (pgtype.Numeric, bool) {
	if raw == nil {
		return current, true
	}
	if !workbenchAmountFits(raw) {
		writeError(w, http.StatusBadRequest, fieldName+" "+workbenchAmountMessage)
		return pgtype.Numeric{}, false
	}
	return floatToNumeric(raw), true
}

// workbenchNonNegativeAmount rejects the amounts whose columns carry a
// `CHECK (… >= 0)`: the CHECK is the backstop, the handler is the answer the
// caller can act on (the same split migration 805 spells out for `fee_amount`).
func workbenchNonNegativeAmount(w http.ResponseWriter, raw *float64, fieldName string) bool {
	if raw != nil && *raw < 0 {
		writeError(w, http.StatusBadRequest, fieldName+" must not be negative")
		return false
	}
	return true
}

// workbenchNameLimit is the rune cap for the identifying TEXT columns that carry a
// unique index (`creator_campaign.name`, `media_ip.name`).
//
// A btree index entry cannot exceed about 2.7 KB, so a pasted megabyte fails inside
// the index with SQLSTATE 54000 and surfaces as a 500 that blames the server for a
// bad input. 512 runes stays well under the limit even when every rune is four
// bytes, and is far more than a campaign or persona name needs.
const workbenchNameLimit = 512

// workbenchNameTooLong reports whether a name would overflow its unique index.
func workbenchNameTooLong(name string) bool {
	return utf8.RuneCountInString(name) > workbenchNameLimit
}

// workbenchNameValue validates a name that is written into a unique index.
func workbenchNameValue(w http.ResponseWriter, name, fieldName string) bool {
	if workbenchNameTooLong(name) {
		writeError(w, http.StatusBadRequest,
			fmt.Sprintf("%s must be at most %d characters", fieldName, workbenchNameLimit))
		return false
	}
	return true
}

// ---- free-text caps --------------------------------------------------------
//
// A TEXT column carries no length of its own, so a pasted megabyte is stored and
// then handed back by every list request that selects the row: `limit=200` turns
// one bad paste into hundreds of megabytes of JSON for the client's zod schema to
// parse. The caps below are the handler's answer, in the same shape as
// workbenchNameLimit but chosen per column class rather than per name.
const (
	// workbenchTitleLimit is a heading: a brief, a topic, a post, a job title.
	workbenchTitleLimit = 512
	// workbenchNoteLimit is a note or a body: a settlement note, a script body, a
	// follow-up summary. 20000 characters is one long document.
	workbenchNoteLimit = 20000
	// workbenchURLLimit is a link. Far under the ~2.7 KB a btree entry can hold,
	// which matters for `creator_post.url` — that column carries a unique index.
	workbenchURLLimit = 2048
	// workbenchInvoiceLimit is an invoice number: an identifier, not prose.
	workbenchInvoiceLimit = 128
	// workbenchColorLimit is a hex colour or a token name.
	workbenchColorLimit = 64
)

// workbenchTextLimits maps a request field name to the rune cap of the TEXT column
// it is written into.
//
// The name is the JSON spelling, so one table covers both decode shapes the
// workbench requests use: `*string` fields (checked in decodeWorkbenchBody) and
// the raw-JSON ones that follow §3.4's clearing rule (checked where they are
// parsed). Every column that holds one of these names is the same class of value —
// a `title` is a heading in the brief ledger, the topic board and the job board
// alike — so the table is keyed by name rather than by table.
var workbenchTextLimits = map[string]int{
	"title":          workbenchTitleLimit,
	"brand":          workbenchTitleLimit,
	"persona":        workbenchTitleLimit,
	"source_keyword": workbenchTitleLimit,
	"summary":        workbenchNoteLimit,
	"note":           workbenchNoteLimit,
	"body":           workbenchNoteLimit,
	"cta":            workbenchNoteLimit,
	"url":            workbenchURLLimit,
	"publish_url":    workbenchURLLimit,
	"invoice_no":     workbenchInvoiceLimit,
	"color":          workbenchColorLimit,
}

// workbenchTextLimit returns the cap for a field, or 0 when the field is not one
// of the capped columns.
func workbenchTextLimit(fieldName string) int {
	return workbenchTextLimits[fieldName]
}

// workbenchTextValue validates one free-text field against its column's cap.
//
// Like workbenchNameValue it answers the 400 itself and names the field and the
// limit, because "which box was too long" is the only part of the answer a client
// can act on.
func workbenchTextValue(w http.ResponseWriter, value, fieldName string) bool {
	limit := workbenchTextLimit(fieldName)
	if limit == 0 || utf8.RuneCountInString(value) <= limit {
		return true
	}
	writeError(w, http.StatusBadRequest,
		fmt.Sprintf("%s must be at most %d characters", fieldName, limit))
	return false
}

// workbenchTextFieldsValue applies workbenchTextValue to every capped field of a
// decoded request body.
//
// Capping here rather than at each call site is what keeps the rule from being
// re-derived per handler: `optionalTrimmedText` has no field name to look up, and a
// request struct is the last place both are known. Only `string` / `*string`
// fields are read — a `json.RawMessage` field is capped where it is parsed, in
// applyTextClearPatch / applyRequiredTextPatch.
func workbenchTextFieldsValue(w http.ResponseWriter, body any) bool {
	value := reflect.ValueOf(body)
	if value.Kind() != reflect.Pointer || value.IsNil() {
		return true
	}
	value = value.Elem()
	if value.Kind() != reflect.Struct {
		return true
	}
	typ := value.Type()
	for i := 0; i < typ.NumField(); i++ {
		field := typ.Field(i)
		if !field.IsExported() {
			continue
		}
		name, _, _ := strings.Cut(field.Tag.Get("json"), ",")
		if name == "" || name == "-" {
			continue
		}
		text, ok := workbenchRequestText(value.Field(i))
		if !ok {
			continue
		}
		if !workbenchTextValue(w, text, name) {
			return false
		}
	}
	return true
}

// workbenchRequestText reads the string behind a `string` / `*string` field.
func workbenchRequestText(field reflect.Value) (string, bool) {
	switch field.Kind() {
	case reflect.String:
		return field.String(), true
	case reflect.Pointer:
		if field.Type().Elem().Kind() == reflect.String && !field.IsNil() {
			return field.Elem().String(), true
		}
	}
	return "", false
}

// workbenchLikePattern escapes the metacharacters of a LIKE pattern.
//
// `?q=` is pasted into `ILIKE '%' || $1 || '%'`, so an unescaped `%` widens the
// search to the whole ledger and `_` matches any single character — a filter that
// silently answers a different question than the one asked. PostgreSQL's default
// LIKE escape character is the backslash, so escaping here is enough and needs no
// change in the query text.
func workbenchLikePattern(raw string) string {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return ""
	}
	return strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(trimmed)
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
//
// It also enforces the free-text caps of the decoded `string` / `*string` fields
// (workbenchTextLimits): every workbench write body passes through here, which is
// what makes one table enough.
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
	return workbenchTextFieldsValue(w, dest)
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

// ---- clearing nullable columns (§3.4) --------------------------------------
//
// A nullable column has three request states, and `*string` / `*float64` can only
// carry two of them: `json.Unmarshal` turns both "the key is absent" and "the key
// is null" into a nil pointer. That is why `{"paid_at": null}` used to be a silent
// no-op — the only way to clear a column was an empty string, a spelling no other
// JSON API uses.
//
// The fields below are therefore decoded as `json.RawMessage` and read here:
//
//	key absent        → keep the stored value
//	key is null       → clear the column (SQL NULL)
//	key is ""         → clear the column (older clients; kept for compatibility)
//	key is a value    → parse it exactly like the typed field it replaces
//
// New clients send `null`; `""` survives only so a client written before this
// section keeps working. Nothing below ever stores an empty string: "cleared" is
// NULL everywhere, which is what the reads and the aggregates test for.

// rawOptionalString renders an optional string argument as the raw JSON a request
// body carries, so a field the caller did not send stays absent instead of
// becoming an explicit `null` — the two mean different things to §3.4.
func rawOptionalString(value string) json.RawMessage {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return nil
	}
	encoded, err := json.Marshal(trimmed)
	if err != nil {
		return nil
	}
	return encoded
}

// patchSends reports whether a request body carried the field at all, `null`
// included. It answers "did the caller mention this", which is what the state
// readers above need; for the money gates see `patchTouches`.
func patchSends(raw json.RawMessage) bool {
	return len(bytes.TrimSpace(raw)) > 0
}

// patchIsNull reports whether the body carried an explicit JSON `null`.
func patchIsNull(raw json.RawMessage) bool {
	return string(bytes.TrimSpace(raw)) == "null"
}

// patchTouches reports whether a request wrote a nullable field at all: any value
// counts, and an explicit `null` counts only on a PATCH. On a create there is
// nothing to clear, so `null` is just "no value" — a generated form that sends every
// key must not turn a create into a money write (§26.1/§26.5).
func patchTouches(raw json.RawMessage, patch bool) bool {
	if !patchSends(raw) {
		return false
	}
	return !patchIsNull(raw) || patch
}

// applyTextClearPatch resolves a nullable TEXT column for a create or a PATCH.
func applyTextClearPatch(raw json.RawMessage, w http.ResponseWriter, fieldName string, current pgtype.Text) (pgtype.Text, bool) {
	trimmed := bytes.TrimSpace(raw)
	if len(trimmed) == 0 {
		return current, true
	}
	if string(trimmed) == "null" {
		return pgtype.Text{}, true
	}
	var value string
	if err := json.Unmarshal(trimmed, &value); err != nil {
		writeError(w, http.StatusBadRequest, fieldName+" must be a string or null")
		return pgtype.Text{}, false
	}
	if !workbenchTextValue(w, value, fieldName) {
		return pgtype.Text{}, false
	}
	// optionalTrimmedText already folds "" into NULL, which is the compatibility
	// spelling this batch keeps.
	return optionalTrimmedText(&value), true
}

// applyDateClearPatch is applyTextClearPatch for a nullable DATE column.
func applyDateClearPatch(raw json.RawMessage, w http.ResponseWriter, fieldName string, current pgtype.Date) (pgtype.Date, bool) {
	trimmed := bytes.TrimSpace(raw)
	if len(trimmed) == 0 {
		return current, true
	}
	if string(trimmed) == "null" {
		return pgtype.Date{}, true
	}
	var value string
	if err := json.Unmarshal(trimmed, &value); err != nil {
		writeError(w, http.StatusBadRequest, fieldName+" must be a date string or null")
		return pgtype.Date{}, false
	}
	return workbenchDateValue(w, &value, fieldName)
}

// applyTimestampClearPatch is applyTextClearPatch for a nullable TIMESTAMPTZ.
func applyTimestampClearPatch(raw json.RawMessage, w http.ResponseWriter, fieldName string, current pgtype.Timestamptz) (pgtype.Timestamptz, bool) {
	trimmed := bytes.TrimSpace(raw)
	if len(trimmed) == 0 {
		return current, true
	}
	if string(trimmed) == "null" {
		return pgtype.Timestamptz{}, true
	}
	var value string
	if err := json.Unmarshal(trimmed, &value); err != nil {
		writeError(w, http.StatusBadRequest, fieldName+" must be a timestamp or null")
		return pgtype.Timestamptz{}, false
	}
	return workbenchTimestampValue(w, &value, fieldName)
}

// applyNumericClearPatch is applyTextClearPatch for a nullable NUMERIC column. An
// amount is cleared with `null`; `""` is accepted because it was the only spelling
// that worked before this batch, but it is not a documented shape.
func applyNumericClearPatch(raw json.RawMessage, w http.ResponseWriter, fieldName string, current pgtype.Numeric) (pgtype.Numeric, bool) {
	trimmed := bytes.TrimSpace(raw)
	if len(trimmed) == 0 {
		return current, true
	}
	if string(trimmed) == "null" {
		return pgtype.Numeric{}, true
	}
	var value float64
	if err := json.Unmarshal(trimmed, &value); err != nil {
		var text string
		if textErr := json.Unmarshal(trimmed, &text); textErr == nil && strings.TrimSpace(text) == "" {
			return pgtype.Numeric{}, true
		}
		writeError(w, http.StatusBadRequest, fieldName+" must be a number or null")
		return pgtype.Numeric{}, false
	}
	if !workbenchAmountFits(&value) {
		writeError(w, http.StatusBadRequest, fieldName+" "+workbenchAmountMessage)
		return pgtype.Numeric{}, false
	}
	return floatToNumeric(&value), true
}

// applyEnumClearPatch is applyTextClearPatch for a nullable enum column: `null`
// and `""` clear it (the enum has no empty member), and any other value must be
// one of `allowed`.
func applyEnumClearPatch(raw json.RawMessage, w http.ResponseWriter, fieldName string, allowed map[string]bool, current pgtype.Text) (pgtype.Text, bool) {
	trimmed := bytes.TrimSpace(raw)
	if len(trimmed) == 0 {
		return current, true
	}
	if string(trimmed) == "null" {
		return pgtype.Text{}, true
	}
	var value string
	if err := json.Unmarshal(trimmed, &value); err != nil {
		writeError(w, http.StatusBadRequest, fieldName+" must be a string or null")
		return pgtype.Text{}, false
	}
	parsed := strings.TrimSpace(value)
	if parsed == "" {
		return pgtype.Text{}, true
	}
	if !allowed[parsed] {
		writeError(w, http.StatusBadRequest, "invalid "+fieldName)
		return pgtype.Text{}, false
	}
	return pgtype.Text{String: parsed, Valid: true}, true
}

// applyRequiredTextPatch is the NOT-NULL counterpart: the column cannot be
// cleared, so `null` and `""` answer 400 instead of quietly keeping the old
// value — a client that sends them believes it cleared something.
func applyRequiredTextPatch(raw json.RawMessage, w http.ResponseWriter, fieldName string, current string) (string, bool) {
	trimmed := bytes.TrimSpace(raw)
	if len(trimmed) == 0 {
		return current, true
	}
	if string(trimmed) == "null" {
		writeError(w, http.StatusBadRequest, fieldName+" is required")
		return current, false
	}
	var value string
	if err := json.Unmarshal(trimmed, &value); err != nil {
		writeError(w, http.StatusBadRequest, fieldName+" must be a string")
		return current, false
	}
	parsed := strings.TrimSpace(value)
	if parsed == "" {
		writeError(w, http.StatusBadRequest, fieldName+" is required")
		return current, false
	}
	if !workbenchTextValue(w, parsed, fieldName) {
		return current, false
	}
	return parsed, true
}

// applyRequiredTimestampPatch is the NOT NULL counterpart of
// applyTimestampClearPatch: a NOT NULL TIMESTAMPTZ has no "cleared" state, so
// `null` and `""` are a 400 that names the field instead of an UPDATE that fails
// on the constraint and surfaces as a 500 (`creator_activity.happened_at`,
// migration 802). Absent still keeps the stored instant.
func applyRequiredTimestampPatch(raw json.RawMessage, w http.ResponseWriter, fieldName string, current pgtype.Timestamptz) (pgtype.Timestamptz, bool) {
	trimmed := bytes.TrimSpace(raw)
	if len(trimmed) == 0 {
		return current, true
	}
	if string(trimmed) == "null" {
		writeError(w, http.StatusBadRequest, fieldName+" is required")
		return current, false
	}
	var value string
	if err := json.Unmarshal(trimmed, &value); err != nil {
		writeError(w, http.StatusBadRequest, fieldName+" must be a timestamp")
		return current, false
	}
	if strings.TrimSpace(value) == "" {
		writeError(w, http.StatusBadRequest, fieldName+" is required")
		return current, false
	}
	return workbenchTimestampValue(w, &value, fieldName)
}

// applyRequiredDatePatch is applyRequiredTimestampPatch for a NOT NULL DATE
// column (`media_shoot.shoot_date`): nothing can be cleared, so `null` and `""`
// answer 400 rather than keeping a day the caller believes it removed.
func applyRequiredDatePatch(raw json.RawMessage, w http.ResponseWriter, fieldName string, current pgtype.Date) (pgtype.Date, bool) {
	trimmed := bytes.TrimSpace(raw)
	if len(trimmed) == 0 {
		return current, true
	}
	if string(trimmed) == "null" {
		writeError(w, http.StatusBadRequest, fieldName+" is required")
		return current, false
	}
	var value string
	if err := json.Unmarshal(trimmed, &value); err != nil {
		writeError(w, http.StatusBadRequest, fieldName+" must be a date string")
		return current, false
	}
	if strings.TrimSpace(value) == "" {
		writeError(w, http.StatusBadRequest, fieldName+" is required")
		return current, false
	}
	return workbenchDateValue(w, &value, fieldName)
}

// applyRequiredNumericPatch is applyRequiredTimestampPatch for a NOT NULL
// NUMERIC column (`crm_settlement.amount`). An absent amount keeps the stored
// one, which is how a create answers 400 from its own "amount is required" check
// on the zero value; `null` and `""` are refused here, because a caller that
// sends them believes it emptied the field and a NOT NULL column cannot.
func applyRequiredNumericPatch(raw json.RawMessage, w http.ResponseWriter, fieldName string, current pgtype.Numeric) (pgtype.Numeric, bool) {
	trimmed := bytes.TrimSpace(raw)
	if len(trimmed) == 0 {
		return current, true
	}
	if string(trimmed) == "null" {
		writeError(w, http.StatusBadRequest, fieldName+" is required")
		return current, false
	}
	var value float64
	if err := json.Unmarshal(trimmed, &value); err != nil {
		var text string
		if textErr := json.Unmarshal(trimmed, &text); textErr == nil && strings.TrimSpace(text) == "" {
			writeError(w, http.StatusBadRequest, fieldName+" is required")
			return current, false
		}
		writeError(w, http.StatusBadRequest, fieldName+" must be a number")
		return current, false
	}
	if !workbenchAmountFits(&value) {
		writeError(w, http.StatusBadRequest, fieldName+" "+workbenchAmountMessage)
		return current, false
	}
	return floatToNumeric(&value), true
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
	// Content health from the creator's newest `creator_metric` row
	// (WORKBENCH-DATA-CONTRACT §2.2/§2.3). Only the list endpoint joins it, so a
	// single-creator response leaves these empty; on the list every one of them is
	// null for a creator nobody has sampled yet, which is not the same as 0.
	HitRate          *float64 `json:"hit_rate"`
	PostsLast30D     *int32   `json:"posts_last_30d"`
	VideosWithStats  *int32   `json:"videos_with_stats"`
	MetricCapturedOn *string  `json:"metric_captured_on"`
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
	// The script version this post was published from (733). Null on an unscripted
	// post — and on every row written before the content workbench existed, which
	// is why the field is additive rather than required.
	MediaScriptID *string `json:"media_script_id"`
	Platform      string  `json:"platform"`
	Title         *string `json:"title"`
	URL           string  `json:"url"`
	PublishedAt   string  `json:"published_at"`
	Source        string  `json:"source"`
	CreatedBy     *string `json:"created_by"`
	CreatedAt     string  `json:"created_at"`
	UpdatedAt     string  `json:"updated_at"`
}

func creatorPostToResponse(p db.CreatorPost) CreatorPostResponse {
	return CreatorPostResponse{
		ID:             uuidToString(p.ID),
		WorkspaceID:    uuidToString(p.WorkspaceID),
		CreatorID:      uuidToString(p.CreatorID),
		CollabID:       uuidToPtr(p.CollabID),
		ContentIssueID: uuidToPtr(p.ContentIssueID),
		MediaScriptID:  uuidToPtr(p.MediaScriptID),
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

// CreatorVideoResponse is one mirrored work (WORKBENCH-DATA-CONTRACT §2.1).
//
// Every counter is nullable: a work whose statistics were never collected has
// NULL, not 0, so the drawer can draw its dash instead of claiming a video got
// no likes.
type CreatorVideoResponse struct {
	ID               string   `json:"id"`
	WorkspaceID      string   `json:"workspace_id"`
	CreatorID        string   `json:"creator_id"`
	AwemeID          string   `json:"aweme_id"`
	DescText         *string  `json:"desc_text"`
	Topics           []string `json:"topics"`
	CreateTime       *string  `json:"create_time"`
	DurationMs       *int32   `json:"duration_ms"`
	DiggCount        *int32   `json:"digg_count"`
	CommentCount     *int32   `json:"comment_count"`
	ShareCount       *int32   `json:"share_count"`
	PlayCount        *int32   `json:"play_count"`
	CoverURL         *string  `json:"cover_url"`
	VideoURL         *string  `json:"video_url"`
	StatsCollectedAt *string  `json:"stats_collected_at"`
	SourceSystem     *string  `json:"source_system"`
	SourceID         *string  `json:"source_id"`
	CreatedAt        string   `json:"created_at"`
	UpdatedAt        string   `json:"updated_at"`
}

func creatorVideoToResponse(v db.CreatorVideo) CreatorVideoResponse {
	topics := v.Topics
	if topics == nil {
		topics = []string{}
	}
	return CreatorVideoResponse{
		ID:               uuidToString(v.ID),
		WorkspaceID:      uuidToString(v.WorkspaceID),
		CreatorID:        uuidToString(v.CreatorID),
		AwemeID:          v.AwemeID,
		DescText:         textToPtr(v.DescText),
		Topics:           topics,
		CreateTime:       timestampToPtr(v.CreateTime),
		DurationMs:       int4ToPtr(v.DurationMs),
		DiggCount:        int4ToPtr(v.DiggCount),
		CommentCount:     int4ToPtr(v.CommentCount),
		ShareCount:       int4ToPtr(v.ShareCount),
		PlayCount:        int4ToPtr(v.PlayCount),
		CoverURL:         textToPtr(v.CoverUrl),
		VideoURL:         textToPtr(v.VideoUrl),
		StatsCollectedAt: timestampToPtr(v.StatsCollectedAt),
		SourceSystem:     textToPtr(v.SourceSystem),
		SourceID:         textToPtr(v.SourceID),
		CreatedAt:        timestampToString(v.CreatedAt),
		UpdatedAt:        timestampToString(v.UpdatedAt),
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
	// Fulfilment (WORKBENCH-API §20.2, migration 810): the link to what went
	// live, and the calendar day the money was settled. Both nullable — a row
	// that has not been published or settled has neither, which is not "empty
	// string" and not "today".
	PublishURL *string `json:"publish_url"`
	SettledOn  *string `json:"settled_on"`
	// Collaboration identity (COLLAB-MODEL §1/§3, migration 821):
	// `assignee_*` is who is doing the work — an agent may hold it, unlike
	// `owner_member_id`; `revision` is the counter a PATCH compares against; and
	// `last_actor` is the newest audit event, folded (nil for a row whose trail
	// predates this batch).
	AssigneeType *string             `json:"assignee_type"`
	AssigneeID   *string             `json:"assignee_id"`
	Revision     int32               `json:"revision"`
	LastActor    *WorkbenchLastActor `json:"last_actor"`
	// Review is §26.1's gate as the row carries it: the state, and who decided.
	Review WorkbenchReview `json:"review"`
}

func crmCollabToResponse(c db.CrmCollab, last *WorkbenchLastActor) CrmCollabResponse {
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
		PublishURL:     textToPtr(c.PublishUrl),
		SettledOn:      dateToPtr(c.SettledOn),
		AssigneeType:   textToPtr(c.AssigneeType),
		AssigneeID:     uuidToPtr(c.AssigneeID),
		Revision:       c.Revision,
		LastActor:      last,
		Review:         reviewOf(c.ReviewState, c.ReviewedBy, c.ReviewedAt),
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
	// Same three fields as the collaboration (COLLAB-MODEL §1/§3): who is
	// chasing the money, the concurrency counter, and the newest audit event.
	// A settlement has no owner column of its own — its owner is the
	// collaboration's — so `assignee_*` is the only "whose is this" it carries.
	AssigneeType *string             `json:"assignee_type"`
	AssigneeID   *string             `json:"assignee_id"`
	Revision     int32               `json:"revision"`
	LastActor    *WorkbenchLastActor `json:"last_actor"`
	// Review is §26.1's gate as the row carries it.
	Review WorkbenchReview `json:"review"`
}

func crmSettlementToResponse(s db.CrmSettlement, last *WorkbenchLastActor) CrmSettlementResponse {
	return CrmSettlementResponse{
		ID:           uuidToString(s.ID),
		WorkspaceID:  uuidToString(s.WorkspaceID),
		CollabID:     uuidToString(s.CollabID),
		Kind:         s.Kind,
		Amount:       numericToFloat(s.Amount),
		Currency:     s.Currency,
		DueAt:        dateToPtr(s.DueAt),
		PaidAt:       dateToPtr(s.PaidAt),
		InvoiceNo:    textToPtr(s.InvoiceNo),
		Note:         textToPtr(s.Note),
		CreatedBy:    uuidToPtr(s.CreatedBy),
		CreatedAt:    timestampToString(s.CreatedAt),
		UpdatedAt:    timestampToString(s.UpdatedAt),
		AssigneeType: textToPtr(s.AssigneeType),
		AssigneeID:   uuidToPtr(s.AssigneeID),
		Revision:     s.Revision,
		LastActor:    last,
		Review:       reviewOf(s.ReviewState, s.ReviewedBy, s.ReviewedAt),
	}
}
