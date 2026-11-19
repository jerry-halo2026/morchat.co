package handler

// The workbench MCP endpoint: POST /api/mcp/workbench.
//
// The workbench data an agent needs to be useful — the metric strip, the sidebar
// counts, the money block, the nine ledgers — is already reachable over REST
// (docs/engineering/WORKBENCH-API.md §3). An agent's read channel, though, is a
// tool surface, not HTTP: a run holds an MCP client and nothing else. So this
// file speaks the four reads as MCP tools over the same JSON-RPC 2.0 transport
// the knowledge endpoint uses (mcp_knowledge.go): initialize -> tools/list ->
// tools/call, one POST, no session state.
//
// Three rules shape the implementation:
//
//   - Read-only. Every tool answers a document and none of them writes: the
//     dispatcher can only reach read handlers, and there is no PATCH/POST path
//     behind any of the four names.
//
//   - One document, not a look-alike. A tool does not re-assemble its payload;
//     it replays the request into the REST handler that already owns that read
//     and returns the bytes it wrote. `workbench_overview` answers exactly what
//     `GET /api/workbench/overview` answers — same metric ids, same three-state
//     entries, same key names — because it IS that handler. A second struct with
//     the same fields would be the drift this repo keeps paying for.
//
//   - The same door. The replayed request carries the caller's own identity, so
//     the REST handler's own `workbenchReadScope` runs: workspace resolution from
//     the authorized request (a mat_ task token decides the workspace, MUL-2600),
//     the membership check, and the department parse. This endpoint decides no
//     visibility of its own and holds no workspace of its own.
//
// Failure shapes follow MCP's vocabulary: a protocol problem (unparsable frame,
// unknown method, no tool name) is a JSON-RPC error, while anything a tool call
// produced — a bad argument, a membership refusal, a size over the cap — is a
// normal result with `isError: true` and a sentence a model can act on. That
// split is deliberate: a model reading "isError" changes its call, and a client
// reading -32602 knows it spoke the protocol wrong.

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const (
	// workbenchMCPServerName is what initialize advertises, and what a workspace
	// MCP server record for this endpoint is named. The knowledge endpoint's
	// convention, one server per read surface.
	workbenchMCPServerName = "morechat-workbench"
	// workbenchMCPServerVersion is this endpoint's own contract version.
	workbenchMCPServerVersion = "0.1.0"

	// workbenchMCPMaxResult bounds one tool answer. A ledger page can carry
	// résumé bodies and JSONB panels, so the ceiling is enforced on the encoded
	// document rather than trusted to the row count: a page that would exceed it
	// answers isError and asks for a smaller limit instead of shipping a
	// half-decoded document or a truncated one.
	workbenchMCPMaxResult = 256 << 10

	// workbenchMCPDefaultLimit / workbenchMCPMaxLimit are the ledger page
	// bounds. They are tighter than the REST list's (50/200) because a tool
	// result is read into a model's context, not rendered in a table.
	workbenchMCPDefaultLimit = 20
	workbenchMCPMaxLimit     = 100
)

// The tool names, as advertised by tools/list.
const (
	workbenchToolOverview = "workbench_overview"
	workbenchToolCounts   = "workbench_counts"
	workbenchToolLedger   = "workbench_ledger"
	workbenchToolFinance  = "workbench_finance"
)

// workbenchMCPLedgerDomainNames is the ledger vocabulary, in the order the tool
// documents them. The schema's enum is generated from this list, so a domain
// added here is immediately callable and a name that is not here cannot be
// asked for.
var workbenchMCPLedgerDomainNames = []string{
	"creators",
	"clients",
	"briefs",
	"collabs",
	"settlements",
	"jobs",
	"candidates",
	"interviews",
	"employees",
}

// workbenchMCPTool is one declared tool, in the shape an MCP client expects.
type workbenchMCPTool struct {
	Name        string
	Description string
	InputSchema json.RawMessage
}

// workbenchMCPTools is the declared surface. It lives next to the dispatcher
// that answers it — one file, one `switch` keyed by these names — because a
// declaration in one place and an implementation in another is how a tool
// surface starts advertising a name nobody answers.
func workbenchMCPTools() []workbenchMCPTool {
	return []workbenchMCPTool{
		{
			Name: workbenchToolOverview,
			Description: "Read the workbench metric strip: every metric id of the workspace with " +
				"its value, the sample size behind it, and what an empty answer means. " +
				"Read-only. Each entry is {value, sample_count, empty}: `empty: insufficient_data` " +
				"with `value: null` means there are no samples yet — it is NOT zero, and reporting " +
				"it as 0 invents a number. `empty: zero` means 0 is a real answer. Rates travel at " +
				"the 0-1 scale (multiply by 100 for display); amounts are JSON numbers in the " +
				"currency the metric's own block uses (agent.cost.month is USD, CRM figures are CNY). " +
				"`department_id` filters by attribution — the department a row belongs to — and is " +
				"never a permission boundary: it neither widens nor narrows what a member may read, " +
				"it only changes which rows a number is computed over.",
			InputSchema: json.RawMessage(`{
  "type": "object",
  "properties": {
    "department_id": {"type": "string", "description": "Optional department uuid. Narrows the aggregate to rows attributed to that department; the whole workspace when omitted."}
  },
  "additionalProperties": false
}`),
		},
		{
			Name: workbenchToolCounts,
			Description: "Read the workbench sidebar counts: creators, clients, briefs, collabs_open, " +
				"settlements_pending, jobs, candidates, interviews, employees. Read-only. These are " +
				"the workspace's authoritative totals — unlike a ledger page's `total`, which is only " +
				"the number of rows on that page. A count answers 0 with `zero` semantics: an empty " +
				"ledger really does have none. `department_id` filters by attribution, never by " +
				"permission.",
			InputSchema: json.RawMessage(`{
  "type": "object",
  "properties": {
    "department_id": {"type": "string", "description": "Optional department uuid; the whole workspace when omitted."}
  },
  "additionalProperties": false
}`),
		},
		{
			Name: workbenchToolLedger,
			Description: "Page through one workbench ledger. Read-only: there is no tool here that " +
				"creates, edits or deletes a row. `domain` picks the ledger and the answer is " +
				"`{<domain>: [...], total}` — the same rows, the same field names and the same page " +
				"envelope the REST list answers, because the tool replays that list. `total` is the " +
				"number of rows on THIS page, not the ledger's size; use workbench_counts for totals. " +
				"`limit` defaults to 20 and caps at 100 — a larger value is refused, never truncated, " +
				"and an answer that would exceed this endpoint's size cap asks for a smaller page. " +
				"`cursor` is the previous page's last row id (the creators page also reports " +
				"`next_cursor`). Amounts are JSON numbers with the row's own `currency` (CNY/USD). " +
				"`department_id` is honoured by the domains that attribute rows to a department " +
				"(`jobs`, `employees`); on the others it answers an error rather than silently " +
				"returning every department's rows. A department is attribution, not permission.",
			InputSchema: workbenchMCPLedgerSchema(),
		},
		{
			Name: workbenchToolFinance,
			Description: "Read the money block for the current calendar month: signed, collected, " +
				"gross_margin, receivable_days and cash_floor, each as {value, sample_count, empty} " +
				"plus a `basis` on the two cost-derived figures saying which cost set produced them " +
				"(entered / settled_collabs / none). `value: null` with `empty: insufficient_data` " +
				"means the rows behind that figure do not exist yet — a missing cost entry or no " +
				"opening cash balance — and is not a zero. Read-only. Amounts are JSON numbers in CNY; " +
				"rates are at the 0-1 scale. The aggregate is over the server's current month (the " +
				"SQL slices on now()), so `month` can only assert which month you expect: the current " +
				"one is accepted, any other answers an error instead of another month's numbers. " +
				"`department_id` filters by attribution, never by permission.",
			InputSchema: json.RawMessage(`{
  "type": "object",
  "properties": {
    "month":         {"type": "string", "description": "Calendar month to assert, YYYY-MM. Only the server's current month is served; any other value answers isError."},
    "department_id": {"type": "string", "description": "Optional department uuid; the whole workspace when omitted."}
  },
  "additionalProperties": false
}`),
		},
	}
}

// workbenchMCPLedgerSchema builds workbench_ledger's input schema. The domain
// enum is generated from workbenchMCPLedgerDomainNames so the list a model is
// shown and the list the dispatcher answers cannot disagree.
func workbenchMCPLedgerSchema() json.RawMessage {
	enum, err := json.Marshal(workbenchMCPLedgerDomainNames)
	if err != nil {
		// The list is package data made of literals; a failure here is a build
		// bug, and an empty enum keeps the tool honest rather than panicking at
		// request time.
		enum = []byte(`[]`)
	}
	return json.RawMessage(`{
  "type": "object",
  "properties": {
    "domain":        {"type": "string", "enum": ` + string(enum) + `, "description": "Which ledger to read."},
    "limit":         {"type": "integer", "minimum": 1, "maximum": 100, "description": "Rows per page (default 20, max 100). A larger value is refused, not truncated."},
    "cursor":        {"type": "string", "description": "The previous page's last row id. A cursor from another page, another ledger or another workspace answers an error."},
    "department_id": {"type": "string", "description": "Optional department uuid; honoured by jobs and employees."}
  },
  "required": ["domain"],
  "additionalProperties": false
}`)
}

// workbenchMCPToolsPayload renders the surface in MCP's spelling.
func workbenchMCPToolsPayload() []map[string]any {
	tools := workbenchMCPTools()
	out := make([]map[string]any, 0, len(tools))
	for _, tool := range tools {
		out = append(out, map[string]any{
			"name":        tool.Name,
			"description": tool.Description,
			"inputSchema": tool.InputSchema,
		})
	}
	return out
}

// WorkbenchMCP serves POST /api/mcp/workbench.
//
// It is mounted in the same middleware group as the knowledge endpoint
// (router.go): MCPTokenExpiryGate -> Auth -> RequireWorkspaceMember. The
// workspace and the caller therefore come from the authorized request, never
// from a tool argument — a tool cannot name a workspace, so it cannot reach one
// the caller is not a member of.
func (h *Handler) WorkbenchMCP(w http.ResponseWriter, r *http.Request) {
	if strings.TrimSpace(h.resolveWorkspaceID(r)) == "" {
		// The middleware chain guarantees a workspace; reaching this means the
		// route was mounted without it, so the endpoint cannot answer for anyone.
		writeMCP(w, nil, nil, &mcpError{Code: mcpErrInternal, Message: "workbench MCP endpoint is not mounted behind workspace auth"})
		return
	}

	var req mcpRequest
	decoder := json.NewDecoder(io.LimitReader(r.Body, maxMCPBody+1))
	if err := decoder.Decode(&req); err != nil {
		writeMCP(w, nil, nil, &mcpError{Code: mcpErrParse, Message: "request body is not a JSON-RPC frame"})
		return
	}
	if req.JSONRPC != "" && req.JSONRPC != "2.0" {
		writeMCP(w, req.ID, nil, &mcpError{Code: mcpErrInvalidRequest, Message: `jsonrpc must be "2.0"`})
		return
	}

	// A notification carries no id and expects no response: accept it and stop,
	// so notifications/initialized does not draw a protocol error frame.
	if len(req.ID) == 0 || string(req.ID) == "null" {
		w.WriteHeader(http.StatusAccepted)
		return
	}

	switch req.Method {
	case mcpMethodInitialize:
		writeMCP(w, req.ID, map[string]any{
			"protocolVersion": mcpNegotiateProtocol(req.Params),
			"capabilities":    map[string]any{"tools": map[string]any{}},
			"serverInfo":      map[string]any{"name": workbenchMCPServerName, "version": workbenchMCPServerVersion},
		}, nil)

	case mcpMethodPing:
		writeMCP(w, req.ID, map[string]any{}, nil)

	case mcpMethodToolsList:
		writeMCP(w, req.ID, map[string]any{"tools": workbenchMCPToolsPayload()}, nil)

	case mcpMethodToolsCall:
		h.workbenchMCPCall(w, r, req)

	default:
		writeMCP(w, req.ID, nil, &mcpError{Code: mcpErrMethodNotFound, Message: "unknown method " + req.Method})
	}
}

// workbenchMCPCall runs one tools/call.
//
// Protocol problems stay JSON-RPC errors (no name, an unknown name). Everything
// a tool answers — including a rejected argument — is a result with isError, so
// a model gets a sentence it can act on instead of a transport-level failure it
// has to guess about.
func (h *Handler) workbenchMCPCall(w http.ResponseWriter, r *http.Request, req mcpRequest) {
	var params struct {
		Name      string          `json:"name"`
		Arguments json.RawMessage `json:"arguments"`
	}
	if err := json.Unmarshal(req.Params, &params); err != nil {
		writeMCP(w, req.ID, nil, &mcpError{Code: mcpErrInvalidParams, Message: "tools/call params must be an object"})
		return
	}
	name := strings.TrimSpace(params.Name)
	if name == "" {
		writeMCP(w, req.ID, nil, &mcpError{Code: mcpErrInvalidParams, Message: "tools/call needs a tool name"})
		return
	}

	var (
		document json.RawMessage
		err      error
	)
	switch name {
	case workbenchToolOverview:
		document, err = h.workbenchMCPOverview(r, params.Arguments)
	case workbenchToolCounts:
		document, err = h.workbenchMCPCounts(r, params.Arguments)
	case workbenchToolLedger:
		document, err = h.workbenchMCPLedger(r, params.Arguments)
	case workbenchToolFinance:
		document, err = h.workbenchMCPFinance(r, params.Arguments)
	default:
		writeMCP(w, req.ID, nil, &mcpError{Code: mcpErrInvalidParams, Message: "unknown tool " + name})
		return
	}
	if err != nil {
		writeMCP(w, req.ID, workbenchMCPErrorResult(err), nil)
		return
	}

	if len(document) > workbenchMCPMaxResult {
		writeMCP(w, req.ID, workbenchMCPErrorResult(fmt.Errorf(
			"result is %d bytes, over this endpoint's %d-byte cap; call again with a smaller limit and page with cursor",
			len(document), workbenchMCPMaxResult)), nil)
		return
	}

	// MCP returns tool output as content blocks. Every tool answers JSON, so one
	// text block carrying the document is the honest mapping — a model reads it
	// directly.
	writeMCP(w, req.ID, map[string]any{
		"content": []map[string]any{{"type": "text", "text": string(document)}},
		"isError": false,
	}, nil)
}

// workbenchMCPErrorResult is one tool answer that reports a failure the caller
// can act on: a rejected argument, a membership refusal, a page over the cap.
// The text is the whole message, so a model does not have to parse a wrapper.
func workbenchMCPErrorResult(err error) map[string]any {
	return map[string]any{
		"content": []map[string]any{{"type": "text", "text": err.Error()}},
		"isError": true,
	}
}

// ---- the four tools --------------------------------------------------------

// workbenchMCPOverview answers workbench_overview.
func (h *Handler) workbenchMCPOverview(r *http.Request, raw json.RawMessage) (json.RawMessage, error) {
	var args struct {
		DepartmentID string `json:"department_id"`
	}
	if err := workbenchMCPDecodeArgs(raw, &args); err != nil {
		return nil, err
	}
	values := workbenchMCPDepartmentValues(args.DepartmentID)
	return h.workbenchMCPReplay(r, values, h.GetWorkbenchOverview)
}

// workbenchMCPCounts answers workbench_counts.
func (h *Handler) workbenchMCPCounts(r *http.Request, raw json.RawMessage) (json.RawMessage, error) {
	var args struct {
		DepartmentID string `json:"department_id"`
	}
	if err := workbenchMCPDecodeArgs(raw, &args); err != nil {
		return nil, err
	}
	values := workbenchMCPDepartmentValues(args.DepartmentID)
	return h.workbenchMCPReplay(r, values, h.GetWorkbenchCounts)
}

// workbenchMCPFinance answers workbench_finance.
//
// The money block is a single month's aggregate and the query behind it slices
// on the database's own now(); no read in this build takes a month argument. So
// `month` is an assertion rather than a selector: the current month is accepted
// (and echoed back in `window.month`), anything else is refused, because
// answering this month's numbers under another month's label would be the one
// thing this endpoint must never do.
func (h *Handler) workbenchMCPFinance(r *http.Request, raw json.RawMessage) (json.RawMessage, error) {
	var args struct {
		Month        string `json:"month"`
		DepartmentID string `json:"department_id"`
	}
	if err := workbenchMCPDecodeArgs(raw, &args); err != nil {
		return nil, err
	}
	if month := strings.TrimSpace(args.Month); month != "" {
		if _, err := time.Parse("2006-01", month); err != nil {
			return nil, fmt.Errorf("month must be YYYY-MM, got %q", month)
		}
		if month != workbenchMCPCurrentMonth() {
			return nil, fmt.Errorf(
				"month %s is not the current calendar month (%s): the money block aggregates the month of now(), so no other month can be read yet",
				month, workbenchMCPCurrentMonth())
		}
	}
	values := workbenchMCPDepartmentValues(args.DepartmentID)
	return h.workbenchMCPReplay(r, values, h.GetWorkbenchFinance)
}

// workbenchMCPCurrentMonth is the month the finance aggregate describes, as the
// label the endpoint compares a caller's `month` against. UTC is the database's
// own clock; the local month is accepted too, because a caller formatting "this
// month" from its own offset is not making a mistake near a month boundary.
func workbenchMCPCurrentMonth() string {
	return time.Now().UTC().Format("2006-01")
}

// workbenchMCPLedgerDomain is one ledger page: the REST list handler that owns
// the read, plus whether that list filters by department.
type workbenchMCPLedgerDomain struct {
	read http.HandlerFunc
	// department reports whether the REST list this domain replays reads
	// `?department_id=`. The domains without a department column answer an
	// error when one is asked for: a filter that silently widens the answer to
	// every department is worse than a refusal.
	department bool
}

// workbenchMCPLedgerDomains maps a domain name onto its read.
func (h *Handler) workbenchMCPLedgerDomains() map[string]workbenchMCPLedgerDomain {
	return map[string]workbenchMCPLedgerDomain{
		"creators":    {read: h.ListCreators, department: false},
		"clients":     {read: h.ListCrmClients, department: false},
		"briefs":      {read: h.ListCrmBriefs, department: false},
		"collabs":     {read: h.ListCrmCollabs, department: false},
		"settlements": {read: h.ListCrmSettlements, department: false},
		"jobs":        {read: h.ListHrJobs, department: true},
		"candidates":  {read: h.ListHrCandidates, department: false},
		"interviews":  {read: h.ListHrInterviews, department: false},
		"employees":   {read: h.ListHrEmployees, department: true},
	}
}

// workbenchMCPLedger answers workbench_ledger.
func (h *Handler) workbenchMCPLedger(r *http.Request, raw json.RawMessage) (json.RawMessage, error) {
	var args struct {
		Domain       string `json:"domain"`
		Limit        int32  `json:"limit"`
		Cursor       string `json:"cursor"`
		DepartmentID string `json:"department_id"`
	}
	if err := workbenchMCPDecodeArgs(raw, &args); err != nil {
		return nil, err
	}

	domain := strings.TrimSpace(args.Domain)
	if domain == "" {
		return nil, fmt.Errorf("domain is required and must be one of: %s",
			strings.Join(workbenchMCPLedgerDomainNames, ", "))
	}
	ledger, ok := h.workbenchMCPLedgerDomains()[domain]
	if !ok {
		return nil, fmt.Errorf("domain must be one of: %s (got %q)",
			strings.Join(workbenchMCPLedgerDomainNames, ", "), domain)
	}

	// The page bounds are checked here rather than clamped: a caller asking for
	// 101 rows is asking for something this surface does not offer, and silently
	// answering 100 would hide the mismatch.
	limit := args.Limit
	if limit <= 0 {
		limit = workbenchMCPDefaultLimit
	}
	if limit > workbenchMCPMaxLimit {
		return nil, fmt.Errorf("limit must be between 1 and %d, got %d", workbenchMCPMaxLimit, limit)
	}

	values := workbenchMCPDepartmentValues(args.DepartmentID)
	if values.Has("department_id") && !ledger.department {
		supported := make([]string, 0, len(workbenchMCPLedgerDomainNames))
		for _, name := range workbenchMCPLedgerDomainNames {
			if candidate, ok := h.workbenchMCPLedgerDomains()[name]; ok && candidate.department {
				supported = append(supported, name)
			}
		}
		return nil, fmt.Errorf(
			"%s has no department attribution, so department_id cannot filter it; only %s accept department_id",
			domain, strings.Join(supported, ", "))
	}
	values.Set("limit", fmt.Sprintf("%d", limit))
	if cursor := strings.TrimSpace(args.Cursor); cursor != "" {
		values.Set("cursor", cursor)
	}

	return h.workbenchMCPReplay(r, values, ledger.read)
}

// ---- argument plumbing -----------------------------------------------------

// workbenchMCPDecodeArgs decodes one tool's arguments. Unknown keys are
// rejected: a call that misspells `department_id` must not quietly become a
// workspace-wide answer.
func workbenchMCPDecodeArgs(raw json.RawMessage, dst any) error {
	trimmed := strings.TrimSpace(string(raw))
	if trimmed == "" || trimmed == "null" {
		// No arguments is a valid call for every tool here: each one's fields
		// are optional.
		return nil
	}
	decoder := json.NewDecoder(strings.NewReader(trimmed))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(dst); err != nil {
		return fmt.Errorf("arguments: %v", err)
	}
	return nil
}

// workbenchMCPDepartmentValues turns the optional department argument into the
// query the REST handler parses. The value is not validated here on purpose: the
// REST parser is the one place that decides what a malformed department id is,
// and its refusal becomes this tool's isError reason.
func workbenchMCPDepartmentValues(raw string) url.Values {
	values := url.Values{}
	if trimmed := strings.TrimSpace(raw); trimmed != "" {
		values.Set("department_id", trimmed)
	}
	return values
}

// ---- replay ----------------------------------------------------------------

// workbenchMCPReplay runs one workbench read handler in-process and returns the
// document it wrote.
//
// This is what keeps the tool surface and the REST surface one contract: the
// handler resolves the workspace and the membership from this same request,
// applies its own filters, and serialises its own struct. A non-200 answer is
// the handler's own refusal, turned into this tool's error text.
func (h *Handler) workbenchMCPReplay(r *http.Request, values url.Values, read http.HandlerFunc) (json.RawMessage, error) {
	recorder := &workbenchMCPRecorder{}
	read(recorder, workbenchMCPReadRequest(r, values))
	if recorder.status != 0 && recorder.status != http.StatusOK {
		return nil, recorder.failure()
	}
	if recorder.body.Len() == 0 {
		return nil, fmt.Errorf("the workbench read answered nothing")
	}
	return json.RawMessage(recorder.body.Bytes()), nil
}

// workbenchMCPReadRequest builds the GET the REST handler expects: the caller's
// own identity and context, and the tool's arguments folded into the query
// string it already parses. No tool argument can reach a path segment, so no
// tool argument can address a row.
func workbenchMCPReadRequest(r *http.Request, values url.Values) *http.Request {
	out := r.Clone(r.Context())
	out.Method = http.MethodGet
	out.Body = http.NoBody
	out.ContentLength = 0
	clone := *r.URL
	clone.RawQuery = values.Encode()
	out.URL = &clone
	return out
}

// workbenchMCPRecorder captures one in-process answer. The workbench reads only
// write a status and a JSON body, which is all this holds.
type workbenchMCPRecorder struct {
	header http.Header
	status int
	body   bytes.Buffer
}

func (rec *workbenchMCPRecorder) Header() http.Header {
	if rec.header == nil {
		rec.header = http.Header{}
	}
	return rec.header
}

func (rec *workbenchMCPRecorder) WriteHeader(status int) {
	if rec.status == 0 {
		rec.status = status
	}
}

func (rec *workbenchMCPRecorder) Write(p []byte) (int, error) {
	if rec.status == 0 {
		rec.status = http.StatusOK
	}
	return rec.body.Write(p)
}

// failure renders the handler's refusal. writeError answers `{"error": "..."}`,
// and that sentence is exactly what the caller needs to see.
func (rec *workbenchMCPRecorder) failure() error {
	var body struct {
		Error string `json:"error"`
	}
	if err := json.Unmarshal(rec.body.Bytes(), &body); err == nil && strings.TrimSpace(body.Error) != "" {
		return fmt.Errorf("%s", body.Error)
	}
	text := strings.TrimSpace(rec.body.String())
	if text == "" {
		return fmt.Errorf("the workbench read answered status %d", rec.status)
	}
	return fmt.Errorf("%s", text)
}
