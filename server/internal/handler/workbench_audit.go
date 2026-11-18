package handler

// The workbench's audit trail and its concurrency contract
// (docs/engineering/COLLAB-MODEL.md §1/§2/§3).
//
// Three things live here, once, so the four core ledgers cannot each invent
// them:
//
//	**Who acted.** `resolveActor` is the platform's one answer to "is this
//	request a member or an agent" (handler.go): an `X-Agent-ID` paired with a
//	bound `X-Task-ID` — or the server-stamped task-token header — names an
//	agent; everything else is the member the request authenticated as. The
//	workbench writes audit rows with that answer, so an agent's edit reads as an
//	agent's edit instead of as the human whose identity the tool ran under.
//
//	**A trail, not a diff service.** `activity_log` gains a polymorphic subject
//	(819/820) and every write that changes a *business* state appends one row to
//	it: create, amount / stage / date / assignee change, delete. A PATCH that only
//	touches a note field appends nothing — a trail where "someone edited the note"
//	sits next to "the money changed" is a trail nobody reads (§2). The row is
//	written in the same transaction as the write it describes, so a rolled-back
//	write cannot leave a ghost event behind.
//
//	**Revision, not a lock.** Every write bumps `revision`; a PATCH may name the
//	`expected_revision` it read, and a mismatch answers 409 `stale_write` with the
//	current row instead of overwriting it. Omitting the field skips the check, so
//	a client written before this batch keeps working (§3).

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/jerry-halo2026/morchat.co/server/internal/util"
	db "github.com/jerry-halo2026/morchat.co/server/pkg/db/generated"
)

// The business names a workbench audit row can carry. They match
// `issue.origin_type`'s widened enum (816) and COLLAB-MODEL §2's list, so an
// audit event and a discussion thread about the same ledger row say the same
// word.
const (
	subjectCrmCollab       = "crm_collab"
	subjectCreatorQuote    = "creator_quote"
	subjectCreatorActivity = "creator_activity"
	subjectCrmSettlement   = "crm_settlement"
)

// WorkbenchLastActor is the newest audit event about one ledger row, folded into
// the shape a GET echoes. It answers "who last touched this, and what did they
// do" without handing the client the whole trail.
type WorkbenchLastActor struct {
	Type   string  `json:"type"`
	ID     *string `json:"id"`
	Action string  `json:"action"`
	At     string  `json:"at"`
}

// ---- who acted -------------------------------------------------------------

// workbenchActor is one request's authorship: a member seat, an agent, or the
// system itself (a background job that writes without a request).
type workbenchActor struct {
	Type string
	ID   pgtype.UUID
}

func (a workbenchActor) isAgent() bool { return a.Type == "agent" }

func (a workbenchActor) idString() string { return uuidToString(a.ID) }

// workbenchActor resolves the caller of a request that already passed
// `workbenchReadScope`. The member is the fallback and the delegator: an agent
// writes under a human's identity, and `details.delegated_by` records which one.
func (h *Handler) workbenchActor(r *http.Request, scope workbenchScope) workbenchActor {
	memberID := uuidToString(scope.Member.UserID)
	actorType, actorID := h.resolveActor(r, memberID, scope.WorkspaceID)
	actor := workbenchActor{Type: actorType}
	if actorType == "member" {
		actor.ID = scope.Member.UserID
		return actor
	}
	if parsed, err := util.ParseUUID(actorID); err == nil {
		actor.ID = parsed
	}
	return actor
}

// delegatedBy is the human an agent wrote for; empty for a member's own write.
func (a workbenchActor) delegatedBy(scope workbenchScope) pgtype.UUID {
	if !a.isAgent() {
		return pgtype.UUID{}
	}
	return scope.Member.UserID
}

// agentOwnerGate refuses an explicit `owner_member_id` from an agent
// (COLLAB-MODEL §6: an agent does not write owner). An agent's own row is owned
// by the member it runs for, which the create path already defaults to.
func agentOwnerGate(w http.ResponseWriter, actor workbenchActor, requested *string) bool {
	if !actor.isAgent() || requested == nil {
		return true
	}
	if strings.TrimSpace(*requested) == "" {
		return true
	}
	writeError(w, http.StatusForbidden, "agents cannot reassign ownership")
	return false
}

// agentDeleteGate refuses a delete from an agent (§6: the agent write whitelist
// has no delete). A soft delete still ends the row's life in every ledger, and no
// tool is allowed to do that.
func agentDeleteGate(w http.ResponseWriter, actor workbenchActor) bool {
	if !actor.isAgent() {
		return true
	}
	writeError(w, http.StatusForbidden, "agents cannot delete workbench rows")
	return false
}

// ---- expected_revision -----------------------------------------------------

// workbenchExpectedRevision reads the optional `expected_revision` from a PATCH
// body. Absent means "do not check" — the old-client behaviour — and a value
// below 1 is a typo rather than a request to skip the check.
func workbenchExpectedRevision(w http.ResponseWriter, raw *int32) (pgtype.Int4, bool) {
	if raw == nil {
		return pgtype.Int4{}, true
	}
	if *raw < 1 {
		writeError(w, http.StatusBadRequest, "expected_revision must be a positive integer")
		return pgtype.Int4{}, false
	}
	return pgtype.Int4{Int32: *raw, Valid: true}, true
}

// writeStaleWrite is the 409 for a PATCH that named a revision the row has moved
// past. The current row travels with the error so the client can refresh from it
// instead of replaying its own body over somebody else's edit (COLLAB-MODEL §3).
func writeStaleWrite(w http.ResponseWriter, current any) {
	writeJSON(w, http.StatusConflict, map[string]any{
		"error":   "stale_write",
		"current": current,
	})
}

// ---- assignee --------------------------------------------------------------

// workbenchAssigneePatch resolves the `assignee_type`/`assignee_id` pair a
// create or PATCH leaves behind.
//
// The pair is one value: sending the type and not the id (or the reverse) is a
// 400, and sending an empty type clears both. `member` ids are validated against
// this workspace's membership and `agent` ids against its agents, because
// `assignee_id` has no foreign key — it points at `member.user_id` or `agent.id`
// depending on the type.
func (h *Handler) workbenchAssigneePatch(
	w http.ResponseWriter,
	r *http.Request,
	scope workbenchScope,
	currentType pgtype.Text,
	currentID pgtype.UUID,
	reqType *string,
	reqID *string,
) (pgtype.Text, pgtype.UUID, bool) {
	if reqType == nil && reqID == nil {
		return currentType, currentID, true
	}
	if reqType == nil || reqID == nil {
		writeError(w, http.StatusBadRequest,
			"assignee_type and assignee_id must be sent together (send an empty type to clear)")
		return pgtype.Text{}, pgtype.UUID{}, false
	}
	kind := strings.TrimSpace(*reqType)
	if kind == "" {
		if strings.TrimSpace(*reqID) != "" {
			writeError(w, http.StatusBadRequest,
				"assignee_type and assignee_id must be sent together (send an empty type to clear)")
			return pgtype.Text{}, pgtype.UUID{}, false
		}
		return pgtype.Text{}, pgtype.UUID{}, true
	}
	if kind != "member" && kind != "agent" {
		writeError(w, http.StatusBadRequest, "assignee_type must be member or agent")
		return pgtype.Text{}, pgtype.UUID{}, false
	}
	id, ok := parseUUIDOrBadRequest(w, strings.TrimSpace(*reqID), "assignee_id")
	if !ok {
		return pgtype.Text{}, pgtype.UUID{}, false
	}
	if kind == "member" {
		if _, err := h.getWorkspaceMember(r.Context(), uuidToString(id), scope.WorkspaceID); err != nil {
			writeError(w, http.StatusBadRequest, "assignee_id is not a member of this workspace")
			return pgtype.Text{}, pgtype.UUID{}, false
		}
	} else {
		agent, err := h.Queries.GetAgent(r.Context(), id)
		if err != nil || uuidToString(agent.WorkspaceID) != scope.WorkspaceID {
			writeError(w, http.StatusBadRequest, "assignee_id is not an agent in this workspace")
			return pgtype.Text{}, pgtype.UUID{}, false
		}
	}
	return pgtype.Text{String: kind, Valid: true}, id, true
}

// initialAssignee is what a new row's assignee pair starts as: the owner, unless
// the request named somebody else. It is migration 821's backfill rule applied
// forward — before this batch the owner *was* who did the work, so a row created
// today should not claim nobody is on it.
func initialAssignee(owner pgtype.UUID, requestedType, requestedID *string, resolvedType pgtype.Text, resolvedID pgtype.UUID) (pgtype.Text, pgtype.UUID) {
	if requestedType == nil && requestedID == nil && owner.Valid {
		return pgtype.Text{String: "member", Valid: true}, owner
	}
	return resolvedType, resolvedID
}

// ---- the diff --------------------------------------------------------------

// auditField is one business field a write moved: its wire name and the two
// rendered values. Only fields that actually changed are ever recorded, which is
// what keeps a re-sent form from reading as an edit.
type auditField struct {
	name   string
	before any
	after  any
}

type auditDiff struct{ fields []auditField }

func (d *auditDiff) uuid(name string, before, after pgtype.UUID) {
	if uuidEqual(before, after) {
		return
	}
	d.fields = append(d.fields, auditField{name, uuidToPtr(before), uuidToPtr(after)})
}

func (d *auditDiff) text(name string, before, after pgtype.Text) {
	if textEqual(before, after) {
		return
	}
	d.fields = append(d.fields, auditField{name, textToPtr(before), textToPtr(after)})
}

func (d *auditDiff) num(name string, before, after pgtype.Numeric) {
	if numericEqual(before, after) {
		return
	}
	d.fields = append(d.fields, auditField{name, numericToFloatPtr(before), numericToFloatPtr(after)})
}

func (d *auditDiff) timestamp(name string, before, after pgtype.Timestamptz) {
	if timestampEqual(before, after) {
		return
	}
	d.fields = append(d.fields, auditField{name, timestampToPtr(before), timestampToPtr(after)})
}

func (d *auditDiff) date(name string, before, after pgtype.Date) {
	if dateEqual(before, after) {
		return
	}
	d.fields = append(d.fields, auditField{name, dateToPtr(before), dateToPtr(after)})
}

func (d *auditDiff) boolean(name string, before, after bool) {
	if before == after {
		return
	}
	d.fields = append(d.fields, auditField{name, before, after})
}

func (d *auditDiff) str(name, before, after string) {
	if before == after {
		return
	}
	d.fields = append(d.fields, auditField{name, before, after})
}

// numericEqual compares two NUMERICs by value, not by Go identity: a column read
// back from PostgreSQL is canonicalised to the column's scale, so `1200.50` and
// `1200.5` arrive as the same digits and exponent.
func numericEqual(a, b pgtype.Numeric) bool {
	if a.Valid != b.Valid {
		return false
	}
	if !a.Valid {
		return true
	}
	if a.Exp != b.Exp {
		return false
	}
	if a.Int == nil || b.Int == nil {
		return a.Int == nil && b.Int == nil
	}
	return a.Int.Cmp(b.Int) == 0
}

func timestampEqual(a, b pgtype.Timestamptz) bool {
	if a.Valid != b.Valid {
		return false
	}
	return !a.Valid || a.Time.Equal(b.Time)
}

// collabChanges is the collaboration's business field set. The row has no note
// column at all, so every column that can move is a business field — including
// the stage milestones, which ride along with a stage move.
func collabChanges(before, after db.CrmCollab) []auditField {
	d := &auditDiff{}
	d.str("stage", before.Stage, after.Stage)
	d.uuid("brief_id", before.BriefID, after.BriefID)
	d.uuid("creator_id", before.CreatorID, after.CreatorID)
	d.num("quote_amount", before.QuoteAmount, after.QuoteAmount)
	d.num("final_amount", before.FinalAmount, after.FinalAmount)
	d.num("prob", before.Prob, after.Prob)
	d.num("creator_fee", before.CreatorFee, after.CreatorFee)
	d.num("sample_cost", before.SampleCost, after.SampleCost)
	d.num("platform_fee", before.PlatformFee, after.PlatformFee)
	d.str("currency", before.Currency, after.Currency)
	d.text("settlement_mode", before.SettlementMode, after.SettlementMode)
	d.num("commission_rate", before.CommissionRate, after.CommissionRate)
	d.boolean("sample_required", before.SampleRequired, after.SampleRequired)
	d.boolean("script_required", before.ScriptRequired, after.ScriptRequired)
	d.timestamp("scheduled_at", before.ScheduledAt, after.ScheduledAt)
	d.timestamp("confirmed_at", before.ConfirmedAt, after.ConfirmedAt)
	d.timestamp("published_at", before.PublishedAt, after.PublishedAt)
	d.timestamp("accepted_at", before.AcceptedAt, after.AcceptedAt)
	d.uuid("issue_id", before.IssueID, after.IssueID)
	d.uuid("owner_member_id", before.OwnerMemberID, after.OwnerMemberID)
	d.text("publish_url", before.PublishUrl, after.PublishUrl)
	d.date("settled_on", before.SettledOn, after.SettledOn)
	d.text("assignee_type", before.AssigneeType, after.AssigneeType)
	d.uuid("assignee_id", before.AssigneeID, after.AssigneeID)
	return d.fields
}

// quoteChanges: `note` is the one field a quote edit may touch without leaving a
// trail (§2 — a note is not a business state).
func quoteChanges(before, after db.CreatorQuote) []auditField {
	d := &auditDiff{}
	d.str("status", before.Status, after.Status)
	d.uuid("brief_id", before.BriefID, after.BriefID)
	d.timestamp("quoted_at", before.QuotedAt, after.QuotedAt)
	d.date("valid_until", before.ValidUntil, after.ValidUntil)
	d.num("fee_amount", before.FeeAmount, after.FeeAmount)
	d.num("commission_rate", before.CommissionRate, after.CommissionRate)
	d.str("currency", strings.TrimSpace(before.Currency), strings.TrimSpace(after.Currency))
	// `items` is JSONB; a byte comparison is exact enough and avoids re-decoding
	// a line-item breakdown just to compare it.
	if string(before.Items) != string(after.Items) {
		d.fields = append(d.fields, auditField{
			"items",
			json.RawMessage(before.Items),
			json.RawMessage(after.Items),
		})
	}
	d.uuid("owner_member_id", before.OwnerMemberID, after.OwnerMemberID)
	d.text("assignee_type", before.AssigneeType, after.AssigneeType)
	d.uuid("assignee_id", before.AssigneeID, after.AssigneeID)
	return d.fields
}

// activityChanges: `summary` is what was said — the note of a follow-up — so a
// PATCH that only rewrites it leaves no audit row. The pipeline facts (kind,
// when it happened, what came of it, when to call again) do.
func activityChanges(before, after db.CreatorActivity) []auditField {
	d := &auditDiff{}
	d.str("kind", before.Kind, after.Kind)
	d.timestamp("happened_at", before.HappenedAt, after.HappenedAt)
	d.text("outcome", before.Outcome, after.Outcome)
	d.timestamp("next_follow_at", before.NextFollowAt, after.NextFollowAt)
	d.uuid("owner_member_id", before.OwnerMemberID, after.OwnerMemberID)
	d.text("assignee_type", before.AssigneeType, after.AssigneeType)
	d.uuid("assignee_id", before.AssigneeID, after.AssigneeID)
	return d.fields
}

// settlementChanges: money, kind and the two dates are the business state;
// `note` and `invoice_no` are paperwork that rides along.
func settlementChanges(before, after db.CrmSettlement) []auditField {
	d := &auditDiff{}
	d.uuid("collab_id", before.CollabID, after.CollabID)
	d.str("kind", before.Kind, after.Kind)
	d.num("amount", before.Amount, after.Amount)
	d.str("currency", strings.TrimSpace(before.Currency), strings.TrimSpace(after.Currency))
	d.date("due_at", before.DueAt, after.DueAt)
	d.date("paid_at", before.PaidAt, after.PaidAt)
	d.text("assignee_type", before.AssigneeType, after.AssigneeType)
	d.uuid("assignee_id", before.AssigneeID, after.AssigneeID)
	return d.fields
}

// hasField reports whether the diff moved a named field.
func hasField(fields []auditField, name string) bool {
	for _, field := range fields {
		if field.name == name {
			return true
		}
	}
	return false
}

// ---- action vocabulary -----------------------------------------------------
//
// `<subject>.<event>`, lower-case and dot-separated (§2), with one verb per
// ledger for the move that ledger exists to make. The specific verb wins over
// `updated` because it is what a board, a notification or a report filters on:
// "the card moved" is not "somebody edited the row".

func collabAction(fields []auditField) string {
	if hasField(fields, "stage") {
		return subjectCrmCollab + ".stage_changed"
	}
	return subjectCrmCollab + ".updated"
}

func quoteAction(fields []auditField) string {
	if hasField(fields, "status") {
		return subjectCreatorQuote + ".status_changed"
	}
	return subjectCreatorQuote + ".updated"
}

func activityAction() string { return subjectCreatorActivity + ".updated" }

func settlementAction(fields []auditField) string {
	if hasField(fields, "paid_at") {
		return subjectCrmSettlement + ".paid"
	}
	return subjectCrmSettlement + ".updated"
}

// ---- writing the event -----------------------------------------------------

// auditDetailsMaxBytes is the contract's cap on `details` (§2). Only changed
// fields are recorded, so reaching it takes a long text field; when it happens the
// *names* survive and the values are dropped, because "stage moved" is the signal
// and the two stage names are the payload.
const auditDetailsMaxBytes = 4096

// workbenchAuditCascadeLimit is how many child rows one delete reads before it
// archives them, so their audit lines can carry what they were. 200 is the same
// ceiling every workbench list applies (`workbenchLimit`): a collaboration with
// more settlements than that is a data error, and rows past the window still get
// a delete event naming the id.
const workbenchAuditCascadeLimit = 200

type auditEnvelope struct {
	Before      map[string]any `json:"before,omitempty"`
	After       map[string]any `json:"after,omitempty"`
	DelegatedBy *string        `json:"delegated_by,omitempty"`
	Truncated   bool           `json:"truncated,omitempty"`
}

// auditKind says which half of the envelope a write fills: a create has nothing
// before it, a delete has nothing after it, and an update has both. Writing both
// halves for a create would fill the trail with `null`s that mean "the row did not
// exist", which is not the same statement as "the field was empty".
type auditKind int

const (
	auditUpdate auditKind = iota
	auditCreate
	auditDelete
)

func buildAuditDetails(fields []auditField, delegatedBy pgtype.UUID, kind auditKind) (string, error) {
	delegator := uuidToPtr(delegatedBy)
	envelope := auditEnvelope{DelegatedBy: delegator}
	if kind != auditCreate {
		envelope.Before = make(map[string]any, len(fields))
	}
	if kind != auditDelete {
		envelope.After = make(map[string]any, len(fields))
	}
	for _, field := range fields {
		if envelope.Before != nil {
			envelope.Before[field.name] = field.before
		}
		if envelope.After != nil {
			envelope.After[field.name] = field.after
		}
	}
	encoded, err := json.Marshal(envelope)
	if err != nil {
		return "", err
	}
	if len(encoded) <= auditDetailsMaxBytes {
		return string(encoded), nil
	}
	trimmed := auditEnvelope{DelegatedBy: delegator, Truncated: true}
	if envelope.Before != nil {
		trimmed.Before = make(map[string]any, len(fields))
	}
	if envelope.After != nil {
		trimmed.After = make(map[string]any, len(fields))
	}
	for _, field := range fields {
		if trimmed.Before != nil {
			trimmed.Before[field.name] = nil
		}
		if trimmed.After != nil {
			trimmed.After[field.name] = nil
		}
	}
	encoded, err = json.Marshal(trimmed)
	if err != nil {
		return "", err
	}
	return string(encoded), nil
}

// recordWorkbenchActivity appends one audit row and returns it. Callers pass the
// transaction's query handle, so the event and the write it describes commit
// together or not at all (§2: no ghost audit rows).
//
// The returned row is what the write's response folds into `last_actor`: the event
// was just written, so reading it back would be a second round trip for a row the
// caller already holds.
func recordWorkbenchActivity(
	ctx context.Context,
	q *db.Queries,
	scope workbenchScope,
	subject string,
	subjectID pgtype.UUID,
	action string,
	actor workbenchActor,
	delegatedBy pgtype.UUID,
	kind auditKind,
	fields []auditField,
) (db.ActivityLog, error) {
	details, err := buildAuditDetails(fields, delegatedBy, kind)
	if err != nil {
		return db.ActivityLog{}, err
	}
	return q.CreateWorkbenchActivity(ctx, db.CreateWorkbenchActivityParams{
		WorkspaceID: scope.WorkspaceUUID,
		SubjectType: subject,
		SubjectID:   subjectID,
		ActorType:   actor.Type,
		ActorID:     actor.ID,
		Action:      action,
		Details:     details,
	})
}

// ---- reading it back -------------------------------------------------------

func lastActorFromActivity(row db.ActivityLog) *WorkbenchLastActor {
	actorType := ""
	if row.ActorType.Valid {
		actorType = row.ActorType.String
	}
	return &WorkbenchLastActor{
		Type:   actorType,
		ID:     uuidToPtr(row.ActorID),
		Action: row.Action,
		At:     timestampToString(row.CreatedAt),
	}
}

// lastWorkbenchActor is the newest event about one row, or nil when the row has
// none yet (a row created before this batch has no trail).
func (h *Handler) lastWorkbenchActor(ctx context.Context, scope workbenchScope, subject string, subjectID pgtype.UUID) *WorkbenchLastActor {
	row, err := h.Queries.GetLastWorkbenchActivity(ctx, db.GetLastWorkbenchActivityParams{
		WorkspaceID: scope.WorkspaceUUID,
		SubjectType: subject,
		SubjectID:   subjectID,
	})
	if err != nil {
		return nil
	}
	return lastActorFromActivity(row)
}

// lastWorkbenchActors is the same answer for a whole page in one query: the list
// reads are the ones that would otherwise cost one round trip per row.
func (h *Handler) lastWorkbenchActors(ctx context.Context, scope workbenchScope, subject string, ids []pgtype.UUID) map[string]*WorkbenchLastActor {
	out := make(map[string]*WorkbenchLastActor, len(ids))
	if len(ids) == 0 {
		return out
	}
	rows, err := h.Queries.ListLastWorkbenchActivities(ctx, db.ListLastWorkbenchActivitiesParams{
		WorkspaceID: scope.WorkspaceUUID,
		SubjectType: subject,
		SubjectIds:  ids,
	})
	if err != nil {
		// The trail is an annotation on the row, not the row: a failed read leaves
		// the list intact with no `last_actor` rather than blanking the page.
		return out
	}
	for _, row := range rows {
		actorType := ""
		if row.ActorType.Valid {
			actorType = row.ActorType.String
		}
		out[uuidToString(row.SubjectID)] = &WorkbenchLastActor{
			Type:   actorType,
			ID:     uuidToPtr(row.ActorID),
			Action: row.Action,
			At:     timestampToString(row.CreatedAt),
		}
	}
	return out
}

// subjectIDs collects the ids a list is about to render, for the batched lookup.
func subjectIDs[T any](rows []T, id func(T) pgtype.UUID) []pgtype.UUID {
	out := make([]pgtype.UUID, 0, len(rows))
	for _, row := range rows {
		out = append(out, id(row))
	}
	return out
}
