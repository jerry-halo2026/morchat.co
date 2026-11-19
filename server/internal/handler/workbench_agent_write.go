package handler

// The workbench's agent write channel: three MCP tools, no more
// (docs/engineering/COLLAB-MODEL.md §6, docs/engineering/WORKBENCH-API.md §24).
//
// §6 says the HTTP surface never opens a write for an agent, and that an agent
// writes through MCP only. This file is that door, and it is deliberately narrow:
//
//	workbench_create_quote          a quote for one creator  (creator_quote)
//	workbench_log_activity          one follow-up            (creator_activity)
//	workbench_advance_collab_stage  move a collaboration forward (crm_collab.stage)
//
// What is NOT here, on purpose: no delete (a soft delete still ends the row in
// every ledger), no ownership write, no amount / currency / line-item / settlement
// field. `agentDeleteGate` and `agentOwnerGate` already refuse the first two at the
// business layer; the third is refused here by never declaring those arguments —
// `workbenchAgentArgumentGate` names them back to a caller that tries anyway, so the
// refusal reads as a rule instead of a typo. A stage may not move to `settled` or
// `cancelled` either: settling records money and cancelling ends a deal, and both
// are decisions §6 leaves with the human who delegated the work.
//
// # One write path
//
// A tool does not assemble its own INSERT. It synthesises the HTTP request the REST
// handler already accepts — same method, same path, same body struct, same route
// params — and runs that handler in-process, exactly the way the read tools replay
// their handlers. Everything the ledger does therefore happens once: the capability
// check, `workbenchCanWrite`, the department boundary, `expected_revision`, the
// revision bump, the audit row with `actor_type='agent'` and `details.delegated_by`,
// the realtime broadcast. A second SQL path here would be a second place for those
// three gates to be forgotten, which is the failure this batch exists to prevent.
//
// # Authorization: the agent is never wider than its delegator
//
// The request is authenticated as the delegating member (`X-Agent-ID` + a bound
// `X-Task-ID` make `resolveActor` answer "agent" — handler.go), so the ledger's own
// gates already run with the delegator's identity and capabilities. On top of that
// this file enforces the two rules §6 adds:
//
//   - **`agent.delegate` is required.** Without it an agent writes nothing at all,
//     whatever its delegator may do. Resolved by the same `workbenchCapabilities`
//     the REST surface uses (§24.2) — there is no second capability vocabulary.
//   - **The row has to be the agent's own.** For a row that already exists, the
//     write is only considered when the row is assigned to this agent or owned by
//     the member that delegated it. Assignment alone never opens somebody else's
//     row (§1: 被指派不等于有权改), and the ledger re-checks the owner afterwards —
//     this gate can only narrow, never widen.
//
// A member who calls these tools through the same endpoint is acting as themselves;
// the extra gates apply to agents only, and the ledger's own rules are unchanged.

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sort"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/jerry-halo2026/morchat.co/server/internal/util"
	db "github.com/jerry-halo2026/morchat.co/server/pkg/db/generated"
)

// The three write tools, as advertised by tools/list.
const (
	workbenchToolCreateQuote  = "workbench_create_quote"
	workbenchToolLogActivity  = "workbench_log_activity"
	workbenchToolAdvanceStage = "workbench_advance_collab_stage"
)

// The paths the three tools replay. They are the REST contract's own addresses, so
// a tool cannot drift into an endpoint that does not exist: a rename in router.go
// that misses this file shows up as a 404 the first time an agent writes.
const (
	workbenchPathBdQuotes   = "/api/workbench/bd/quotes"
	workbenchPathBdActivity = "/api/workbench/bd/activities"
	workbenchPathCrmCollab  = "/api/workbench/crm/collabs/"
)

// ---- refusals --------------------------------------------------------------

// workbenchAgentWriteError is a refusal that carries the HTTP status the same
// decision would have answered over REST, so the tool's sentence and the REST gate
// cannot drift apart: 403 for a rule, 400 for an argument, 404 for a row that is
// not here.
type workbenchAgentWriteError struct {
	Status int
	Reason string
}

func (e *workbenchAgentWriteError) Error() string { return e.Reason }

func agentWriteRefused(status int, reason string) error {
	return &workbenchAgentWriteError{Status: status, Reason: reason}
}

// workbenchAgentWriteStatus reports the HTTP status behind a tool refusal, for the
// tests that assert "this is the same 403 the REST surface answers".
func workbenchAgentWriteStatus(err error) int {
	if refused, ok := err.(*workbenchAgentWriteError); ok {
		return refused.Status
	}
	return 0
}

// workbenchAgentForbiddenArgument is one field an agent tool never accepts, and the
// noun the refusal uses. Keeping the rule in a table (not in the decoder's type) is
// what lets the dispatcher name the field the caller sent.
var workbenchAgentForbiddenArguments = []struct {
	key  string
	noun string
}{
	{"owner_member_id", "ownership"},
	{"assignee_type", "the assignee"},
	{"assignee_id", "the assignee"},
	{"fee_amount", "the slot fee"},
	{"commission_rate", "the commission rate"},
	{"currency", "the currency"},
	{"items", "the line-item breakdown"},
	{"quote_amount", "the quoted amount"},
	{"final_amount", "the final amount"},
	{"creator_fee", "the creator fee"},
	{"sample_cost", "the sample cost"},
	{"platform_fee", "the platform fee"},
	{"settlement_mode", "the settlement mode"},
	{"settled_on", "the settlement day"},
	{"amount", "a settlement amount"},
	{"due_at", "a settlement due day"},
	{"paid_at", "a settlement payment day"},
}

// workbenchAgentArgumentGate refuses a money, ownership or settlement argument
// before any handler runs.
//
// It runs for every caller, agent or not: these three tools have no such fields, so
// accepting one from a member would make the agent surface the wide one by
// accident. The message names the field AND the rule, because "unknown field" is a
// message a model retries, while "amounts are a human's write" is a message it
// stops on.
func workbenchAgentArgumentGate(raw json.RawMessage) error {
	trimmed := strings.TrimSpace(string(raw))
	if trimmed == "" || trimmed == "null" {
		return nil
	}
	var args map[string]json.RawMessage
	if err := json.Unmarshal([]byte(trimmed), &args); err != nil {
		// A malformed body is the argument decoder's problem to report; this gate
		// only speaks about fields it can see.
		return nil
	}
	keys := make([]string, 0, len(args))
	for key := range args {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	for _, key := range keys {
		for _, forbidden := range workbenchAgentForbiddenArguments {
			if key != forbidden.key {
				continue
			}
			return agentWriteRefused(http.StatusForbidden, fmt.Sprintf(
				"agents cannot write %s (%s): amounts, settlements and ownership are a human's write "+
					"(COLLAB-MODEL §6). These tools only create a quote, log a follow-up or advance a stage.",
				forbidden.noun, key))
		}
	}
	return nil
}

// ---- authorization ---------------------------------------------------------

// workbenchAgentWriteScope resolves the caller of a write tool and applies §6's
// delegation rules. The returned actor is what the audit will record.
//
// The scope resolution is the REST handlers' own (`workbenchReadScope`), run against
// a throwaway recorder so a membership failure becomes this tool's error text
// instead of a half-written response.
func (h *Handler) workbenchAgentWriteScope(r *http.Request, capability string) (workbenchScope, workbenchActor, error) {
	recorder := &workbenchMCPRecorder{}
	scope, ok := h.workbenchReadScope(recorder, r)
	if !ok {
		return workbenchScope{}, workbenchActor{}, recorder.failure()
	}
	actor := h.workbenchActor(r, scope)
	if !actor.isAgent() {
		// A member using this endpoint is writing as themselves; the ledger's own
		// owner/capability gates are the whole rule for them.
		return scope, actor, nil
	}
	if !actor.ID.Valid {
		return workbenchScope{}, workbenchActor{}, agentWriteRefused(http.StatusForbidden,
			"this request names an agent that is not a row in this workspace; an agent writes only under its own bound task")
	}

	// §6: an agent never exceeds its delegator, and without `agent.delegate` it
	// has no write channel at all. Resolved by the one capability function the
	// REST surface uses (§24.2) — no second vocabulary.
	capabilities := h.workbenchCapabilities(r.Context(), scope)
	if !capabilities.has(capAgentDelegate) {
		return workbenchScope{}, workbenchActor{}, agentWriteRefused(http.StatusForbidden,
			"the member who delegated this agent does not hold agent.delegate, so the agent may not write on their behalf")
	}
	if !capabilities.has(capability) {
		return workbenchScope{}, workbenchActor{}, agentWriteRefused(http.StatusForbidden,
			fmt.Sprintf("the member who delegated this agent does not hold %s, so the agent may not write it", capability))
	}
	return scope, actor, nil
}

// workbenchAgentRowGate is §6's row rule for a write that targets an existing row:
// it must be the agent's own work, or the delegator's row.
//
// Assignment is not permission on its own (§1: 被指派不等于有权改) — the second arm
// is the delegator's ownership, which the ledger re-checks after this gate. So this
// function can only refuse a write the ledger would have considered, never allow one
// the ledger would not.
func workbenchAgentRowGate(scope workbenchScope, actor workbenchActor, assigneeType pgtype.Text, assigneeID, ownerMemberID pgtype.UUID) error {
	if !actor.isAgent() {
		return nil
	}
	assignedToAgent := assigneeType.Valid && assigneeType.String == "agent" && uuidEqual(assigneeID, actor.ID)
	if assignedToAgent || uuidEqual(ownerMemberID, scope.Member.UserID) {
		return nil
	}
	return agentWriteRefused(http.StatusForbidden,
		"agents may only change a row assigned to them or owned by the member that delegated them; "+
			"this row is neither, and being assigned is not permission to change someone else's row")
}

// agentSettleableStages is the set of stages an agent may move a collaboration
// INTO: every forward stage up to `accepted`.
//
// `settled` and `cancelled` are absent although they are valid stages: settling
// records money and cancelling ends a deal, and §6's whitelist is "advance the
// stage", not "decide the outcome".
var agentSettleableStages = map[string]bool{
	"inquiry": true, "quoted": true, "negotiating": true, "confirmed": true,
	"sampling": true, "script_review": true, "scheduled": true, "published": true,
	"accepted": true,
}

// workbenchAgentStageGate refuses a stage move an agent may not make.
func workbenchAgentStageGate(current, next string) error {
	next = strings.TrimSpace(next)
	if next == "" {
		return agentWriteRefused(http.StatusBadRequest, "stage is required")
	}
	if !agentSettleableStages[next] {
		if next == "settled" {
			return agentWriteRefused(http.StatusForbidden,
				"agents cannot settle a collaboration: the stage records money, and a settlement is a human's write (COLLAB-MODEL §6/§7)")
		}
		if next == "cancelled" {
			return agentWriteRefused(http.StatusForbidden,
				"agents cannot cancel a collaboration: ending a deal is a human's decision (COLLAB-MODEL §6)")
		}
		return agentWriteRefused(http.StatusBadRequest,
			fmt.Sprintf("stage must be one of the forward pipeline stages (got %q)", next))
	}
	currentRank, currentKnown := collabStageRank[current]
	if !currentKnown || current == "cancelled" {
		return agentWriteRefused(http.StatusForbidden,
			fmt.Sprintf("this collaboration is in stage %q, which an agent may not move", current))
	}
	nextRank := collabStageRank[next]
	if nextRank <= currentRank {
		return agentWriteRefused(http.StatusForbidden,
			fmt.Sprintf("agents may only advance a stage: %s -> %s is not forward", current, next))
	}
	return nil
}

// ---- the three tools -------------------------------------------------------

// workbenchMCPCreateQuote answers workbench_create_quote.
func (h *Handler) workbenchMCPCreateQuote(r *http.Request, raw json.RawMessage) (json.RawMessage, error) {
	if err := workbenchAgentArgumentGate(raw); err != nil {
		return nil, err
	}
	var args struct {
		CreatorID  string `json:"creator_id"`
		BriefID    string `json:"brief_id"`
		Status     string `json:"status"`
		QuotedAt   string `json:"quoted_at"`
		ValidUntil string `json:"valid_until"`
		Note       string `json:"note"`
	}
	if err := workbenchMCPDecodeArgs(raw, &args); err != nil {
		return nil, err
	}
	if _, _, err := h.workbenchAgentWriteScope(r, capCRMWrite); err != nil {
		return nil, err
	}

	// The body is the ledger's own create request, built from the whitelisted
	// fields only: anything this struct does not carry cannot reach the row.
	body := BdQuoteRequest{
		CreatorID:  optionalString(args.CreatorID),
		BriefID:    optionalString(args.BriefID),
		Status:     optionalString(args.Status),
		QuotedAt:   optionalString(args.QuotedAt),
		ValidUntil: optionalString(args.ValidUntil),
		Note:       optionalString(args.Note),
	}
	return h.workbenchAgentWriteReplay(r, http.MethodPost, workbenchPathBdQuotes, nil, body, h.CreateBdQuote, http.StatusCreated)
}

// workbenchMCPLogActivity answers workbench_log_activity.
func (h *Handler) workbenchMCPLogActivity(r *http.Request, raw json.RawMessage) (json.RawMessage, error) {
	if err := workbenchAgentArgumentGate(raw); err != nil {
		return nil, err
	}
	var args struct {
		CreatorID    string `json:"creator_id"`
		Kind         string `json:"kind"`
		HappenedAt   string `json:"happened_at"`
		Summary      string `json:"summary"`
		Outcome      string `json:"outcome"`
		NextFollowAt string `json:"next_follow_at"`
	}
	if err := workbenchMCPDecodeArgs(raw, &args); err != nil {
		return nil, err
	}
	if _, _, err := h.workbenchAgentWriteScope(r, capCRMWrite); err != nil {
		return nil, err
	}

	body := BdActivityRequest{
		CreatorID:    optionalString(args.CreatorID),
		Kind:         optionalString(args.Kind),
		HappenedAt:   optionalString(args.HappenedAt),
		Summary:      optionalString(args.Summary),
		Outcome:      optionalString(args.Outcome),
		NextFollowAt: optionalString(args.NextFollowAt),
	}
	return h.workbenchAgentWriteReplay(r, http.MethodPost, workbenchPathBdActivity, nil, body, h.CreateBdActivity, http.StatusCreated)
}

// workbenchMCPAdvanceCollabStage answers workbench_advance_collab_stage.
//
// The row is read before the write for two reasons, both §6: the agent's own row
// rule needs the assignee and the owner, and "advance" needs the current stage to
// decide which direction the move is.
func (h *Handler) workbenchMCPAdvanceCollabStage(r *http.Request, raw json.RawMessage) (json.RawMessage, error) {
	if err := workbenchAgentArgumentGate(raw); err != nil {
		return nil, err
	}
	var args struct {
		CollabID         string `json:"collab_id"`
		Stage            string `json:"stage"`
		ExpectedRevision *int32 `json:"expected_revision"`
	}
	if err := workbenchMCPDecodeArgs(raw, &args); err != nil {
		return nil, err
	}
	scope, actor, err := h.workbenchAgentWriteScope(r, capCRMWrite)
	if err != nil {
		return nil, err
	}

	collabID := strings.TrimSpace(args.CollabID)
	if collabID == "" {
		return nil, agentWriteRefused(http.StatusBadRequest, "collab_id is required")
	}
	parsed, err := util.ParseUUID(collabID)
	if err != nil {
		return nil, agentWriteRefused(http.StatusBadRequest, "collab_id must be a uuid")
	}
	current, err := h.Queries.GetCrmCollab(r.Context(), db.GetCrmCollabParams{
		ID:          parsed,
		WorkspaceID: scope.WorkspaceUUID,
	})
	if err != nil {
		return nil, agentWriteRefused(http.StatusNotFound, "collab not found in this workspace")
	}
	if err := workbenchAgentRowGate(scope, actor, current.AssigneeType, current.AssigneeID, current.OwnerMemberID); err != nil {
		return nil, err
	}
	stage := strings.TrimSpace(args.Stage)
	if err := workbenchAgentStageGate(current.Stage, stage); err != nil {
		return nil, err
	}

	body := CrmCollabRequest{
		Stage:            &stage,
		ExpectedRevision: args.ExpectedRevision,
	}
	return h.workbenchAgentWriteReplay(r, http.MethodPatch, workbenchPathCrmCollab+collabID,
		map[string]string{"collabId": collabID}, body, h.UpdateCrmCollab, http.StatusOK)
}

// ---- replaying the write ----------------------------------------------------

// workbenchAgentWriteReplay runs one workbench write handler in-process and returns
// the document it wrote.
//
// This is the same contract as `workbenchMCPReplay`, for a request that carries a
// body and route params instead of a query string. The handler resolves the
// workspace and the actor from this same request — so the agent's identity, its
// delegator and the ledger's gates all see exactly what they would see over HTTP.
//
// `want` is the status the handler must answer: a create answers 201, a PATCH 200.
// Anything else is the handler's own refusal, and its `{"error": ...}` sentence
// becomes this tool's isError text.
func (h *Handler) workbenchAgentWriteReplay(
	r *http.Request,
	method, path string,
	params map[string]string,
	body any,
	write http.HandlerFunc,
	want int,
) (json.RawMessage, error) {
	payload, err := json.Marshal(body)
	if err != nil {
		return nil, fmt.Errorf("arguments: %v", err)
	}

	rctx := chi.NewRouteContext()
	for key, value := range params {
		rctx.URLParams.Add(key, value)
	}
	out := r.Clone(context.WithValue(r.Context(), chi.RouteCtxKey, rctx))
	out.Method = method
	clone := *r.URL
	clone.Path = path
	clone.RawPath = ""
	clone.RawQuery = ""
	out.URL = &clone
	out.Body = io.NopCloser(bytes.NewReader(payload))
	out.ContentLength = int64(len(payload))
	out.Header.Set("Content-Type", "application/json")

	recorder := &workbenchMCPRecorder{}
	write(recorder, out)
	if recorder.status != want {
		return nil, recorder.failure()
	}
	if recorder.body.Len() == 0 {
		return nil, fmt.Errorf("the workbench write answered nothing")
	}
	return json.RawMessage(recorder.body.Bytes()), nil
}
