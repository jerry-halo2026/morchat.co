package handler

// Tests for the workbench MCP endpoint (mcp_workbench.go).
//
// They run against the migrated dev database the rest of the handler suite uses,
// behind the same membership middleware the router mounts, and assert what an
// MCP client actually sees: JSON-RPC frames, tool documents, and the isError a
// rejected argument produces.
//
// The endpoint's design claim is that a tool answers the *same document* the
// REST read answers, so several cases compare the two directly instead of
// re-asserting field names — a second set of expectations would pass even if the
// two surfaces had drifted apart.

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/jerry-halo2026/morchat.co/server/internal/middleware"
	"github.com/jerry-halo2026/morchat.co/server/internal/testutil"
)

// workbenchMCPPost drives the endpoint through the membership middleware exactly
// as the router does, with the caller's identity in the headers that middleware
// reads. A caller who is not a member of workspaceID never reaches the handler,
// which is what the cross-workspace case asserts.
func workbenchMCPPost(t *testing.T, body any, userID, workspaceID string) (int, mcpFrame) {
	t.Helper()
	if userID == "" {
		userID = testUserID
	}
	if workspaceID == "" {
		workspaceID = testWorkspaceID
	}
	req := testutil.WithHeaders(testutil.JSONRequest(http.MethodPost, "/api/mcp/workbench", body),
		"X-User-ID", userID, "X-Workspace-ID", workspaceID)
	rec := httptest.NewRecorder()
	middleware.RequireWorkspaceMember(testHandler.Queries)(http.HandlerFunc(testHandler.WorkbenchMCP)).ServeHTTP(rec, req)

	var frame mcpFrame
	if rec.Body.Len() > 0 {
		var members map[string]json.RawMessage
		if err := json.Unmarshal(rec.Body.Bytes(), &members); err != nil {
			t.Fatalf("decode MCP body %q: %v", rec.Body.String(), err)
		}
		// A refusal from the middleware (401/403/404) is a plain HTTP error
		// body, not a JSON-RPC frame; the status is the assertion there.
		if _, isFrame := members["jsonrpc"]; isFrame {
			if err := json.Unmarshal(rec.Body.Bytes(), &frame); err != nil {
				t.Fatalf("decode MCP frame %q: %v", rec.Body.String(), err)
			}
		}
	}
	return rec.Code, frame
}

// workbenchMCPCall is one tools/call frame.
func workbenchMCPCall(t *testing.T, name string, arguments map[string]any, userID, workspaceID string) (int, mcpFrame) {
	t.Helper()
	return workbenchMCPPost(t, map[string]any{
		"jsonrpc": "2.0", "id": 11, "method": "tools/call",
		"params": map[string]any{"name": name, "arguments": arguments},
	}, userID, workspaceID)
}

// workbenchMCPResult reads the single text block of a tools/call result and its
// isError flag. A rejected argument is reported here — as a result with
// isError — so this helper deliberately does not insist the call succeeded.
func workbenchMCPResult(t *testing.T, frame mcpFrame) (string, bool) {
	t.Helper()
	if frame.Error != nil {
		t.Fatalf("tools/call drew a protocol error: %d %s", frame.Error.Code, frame.Error.Message)
	}
	var result struct {
		Content []struct {
			Type string `json:"type"`
			Text string `json:"text"`
		} `json:"content"`
		IsError bool `json:"isError"`
	}
	if err := json.Unmarshal(frame.Result, &result); err != nil {
		t.Fatalf("decode tools/call result %s: %v", frame.Result, err)
	}
	if len(result.Content) == 0 || result.Content[0].Type != "text" {
		t.Fatalf("tools/call result carries no text content block: %s", frame.Result)
	}
	return result.Content[0].Text, result.IsError
}

// workbenchMCPOK is workbenchMCPResult for the calls that must succeed, decoded
// into dest.
func workbenchMCPOK(t *testing.T, frame mcpFrame, dest any) {
	t.Helper()
	text, isError := workbenchMCPResult(t, frame)
	if isError {
		t.Fatalf("tools/call reported isError: %s", text)
	}
	if dest == nil {
		return
	}
	if err := json.Unmarshal([]byte(text), dest); err != nil {
		t.Fatalf("decode tool text %q: %v", text, err)
	}
}

// workbenchMCPRejected asserts a tool answered isError with a reason that names
// the problem.
func workbenchMCPRejected(t *testing.T, frame mcpFrame, want string) string {
	t.Helper()
	text, isError := workbenchMCPResult(t, frame)
	if !isError {
		t.Fatalf("tools/call = %q, want isError", text)
	}
	if want != "" && !strings.Contains(strings.ToLower(text), strings.ToLower(want)) {
		t.Fatalf("isError reason = %q, want it to mention %q", text, want)
	}
	return text
}

// workbenchMCPRestRequest is a GET the REST read handlers accept: the same
// identity headers the MCP helper sends, on a path the caller names.
func workbenchMCPRestRequest(t *testing.T, path, userID, workspaceID string) *http.Request {
	t.Helper()
	req := newRequest(http.MethodGet, path, nil)
	req.Header.Set("X-User-ID", userID)
	req.Header.Set("X-Workspace-ID", workspaceID)
	return req
}

// TestWorkbenchMCPToolsList pins the surface a model is shown: the four tool
// names, a description that says the surface is read-only, and the schemas that
// go with them.
func TestWorkbenchMCPToolsList(t *testing.T) {
	if testPool == nil {
		t.Skip("handler tests require a reachable DATABASE_URL")
	}

	_, frame := workbenchMCPPost(t, map[string]any{"jsonrpc": "2.0", "id": 1, "method": "tools/list"}, "", "")
	if frame.Error != nil {
		t.Fatalf("tools/list error: %d %s", frame.Error.Code, frame.Error.Message)
	}

	var result struct {
		Tools []struct {
			Name        string          `json:"name"`
			Description string          `json:"description"`
			InputSchema json.RawMessage `json:"inputSchema"`
		} `json:"tools"`
	}
	if err := json.Unmarshal(frame.Result, &result); err != nil {
		t.Fatalf("decode tools/list result %s: %v", frame.Result, err)
	}

	want := []string{
		workbenchToolOverview,
		workbenchToolCounts,
		workbenchToolLedger,
		workbenchToolFinance,
	}
	if len(result.Tools) != len(want) {
		t.Fatalf("tools = %d, want %d: %s", len(result.Tools), len(want), frame.Result)
	}

	type schema struct {
		Properties map[string]json.RawMessage `json:"properties"`
		Required   []string                   `json:"required"`
	}
	declared := map[string]schema{}
	for _, tool := range result.Tools {
		if strings.TrimSpace(tool.Description) == "" {
			t.Fatalf("tool %q has no description", tool.Name)
		}
		// The one property every agent must be told: this surface cannot write.
		if !strings.Contains(strings.ToLower(tool.Description), "read-only") {
			t.Fatalf("tool %q description does not say it is read-only: %s", tool.Name, tool.Description)
		}
		var parsed schema
		if err := json.Unmarshal(tool.InputSchema, &parsed); err != nil {
			t.Fatalf("tool %q inputSchema is not an object: %v", tool.Name, err)
		}
		if parsed.Properties == nil {
			t.Fatalf("tool %q inputSchema has no properties: %s", tool.Name, tool.InputSchema)
		}
		declared[tool.Name] = parsed
	}
	for _, name := range want {
		if _, ok := declared[name]; !ok {
			t.Fatalf("tools/list is missing %q: %v", name, declared)
		}
	}

	// overview / counts: only the optional department filter, nothing required.
	for _, name := range []string{workbenchToolOverview, workbenchToolCounts} {
		tool := declared[name]
		if _, ok := tool.Properties["department_id"]; !ok {
			t.Fatalf("%s schema lacks department_id: %v", name, tool.Properties)
		}
		if len(tool.Required) != 0 {
			t.Fatalf("%s required = %v, want none", name, tool.Required)
		}
	}

	// finance: the month assertion plus the department filter.
	finance := declared[workbenchToolFinance]
	for _, property := range []string{"month", "department_id"} {
		if _, ok := finance.Properties[property]; !ok {
			t.Fatalf("%s schema lacks %q: %v", workbenchToolFinance, property, finance.Properties)
		}
	}

	// ledger: domain is required and its enum is the fifteen ledgers the
	// dispatcher answers; limit is bounded at the same 100 the handler enforces.
	ledger := declared[workbenchToolLedger]
	if len(ledger.Required) != 1 || ledger.Required[0] != "domain" {
		t.Fatalf("%s required = %v, want [domain]", workbenchToolLedger, ledger.Required)
	}
	var domain struct {
		Type string   `json:"type"`
		Enum []string `json:"enum"`
	}
	if err := json.Unmarshal(ledger.Properties["domain"], &domain); err != nil {
		t.Fatalf("decode domain schema: %v", err)
	}
	if !reflect.DeepEqual(domain.Enum, workbenchMCPLedgerDomainNames) {
		t.Fatalf("domain enum = %v, want %v", domain.Enum, workbenchMCPLedgerDomainNames)
	}
	var limit struct {
		Minimum *int `json:"minimum"`
		Maximum *int `json:"maximum"`
	}
	if err := json.Unmarshal(ledger.Properties["limit"], &limit); err != nil {
		t.Fatalf("decode limit schema: %v", err)
	}
	if limit.Maximum == nil || *limit.Maximum != workbenchMCPMaxLimit {
		t.Fatalf("limit maximum = %v, want %d", limit.Maximum, workbenchMCPMaxLimit)
	}

	// Every advertised name is answerable: asking for each one is never a
	// "unknown tool", whatever the tool then decides about its arguments.
	for _, name := range want {
		_, call := workbenchMCPCall(t, name, map[string]any{}, "", "")
		if call.Error != nil {
			t.Fatalf("%s is advertised but not dispatchable: %d %s", name, call.Error.Code, call.Error.Message)
		}
	}
}

// TestWorkbenchMCPOverviewInEmptyWorkspace is the three-state contract on the MCP
// surface: a fresh workspace answers all 22 metric ids, and every metric whose
// rows do not exist reports `insufficient_data` rather than 0.
func TestWorkbenchMCPOverviewInEmptyWorkspace(t *testing.T) {
	if testPool == nil {
		t.Skip("handler tests require a reachable DATABASE_URL")
	}

	emptyWorkspaceID := dbfx.Workspace(t, "Workbench MCP empty workspace", "wb-mcp-empty-ws")
	dbfx.Member(t, emptyWorkspaceID, testUserID, "owner")

	_, frame := workbenchMCPCall(t, workbenchToolOverview, nil, "", emptyWorkspaceID)
	var overview WorkbenchOverviewResponse
	workbenchMCPOK(t, frame, &overview)

	if len(overview.Metrics) != len(workbenchMetricCatalog) {
		t.Fatalf("overview returned %d metrics, want %d", len(overview.Metrics), len(workbenchMetricCatalog))
	}
	for _, spec := range workbenchMetricCatalog {
		entry, present := overview.Metrics[spec.id]
		if !present {
			t.Fatalf("overview is missing contract metric %s", spec.id)
		}
		if entry.Empty != metricEmptyZero && entry.Empty != metricEmptyInsufficientData {
			t.Fatalf("%s: empty = %q, want zero or insufficient_data", spec.id, entry.Empty)
		}
		// `empty` reports the state the value is in, not the contract's rule
		// (metricValue): a gap is always a null value, and a real answer is never
		// labelled a gap.
		if entry.Value == nil && entry.Empty != metricEmptyInsufficientData {
			t.Fatalf("%s: value is null but empty = %q, want insufficient_data", spec.id, entry.Empty)
		}
		if entry.Empty == metricEmptyZero && entry.Value == nil {
			t.Fatalf("%s: empty = zero but the value is null", spec.id)
		}
	}

	// The commerce figures have no rows at all in a fresh workspace, so every one
	// of them is a gap rather than a zero — the case that used to render "¥0".
	for _, id := range []string{
		"crm.pipeline.weighted_amount",
		"crm.contract.signed_month",
		"crm.payment.collected_month",
		"crm.quote.margin_rate",
		"crm.collab.roi",
		"crm.creator.repeat_rate",
	} {
		entry, present := overview.Metrics[id]
		if !present {
			t.Fatalf("overview is missing contract metric %s", id)
		}
		if entry.Value != nil {
			t.Fatalf("%s = %v with an empty ledger, want null", id, *entry.Value)
		}
		if entry.Empty != metricEmptyInsufficientData {
			t.Fatalf("%s empty = %q with an empty ledger, want insufficient_data", id, entry.Empty)
		}
	}

	// One metric is computable from the workspace's member list alone: a
	// workspace of one member with nothing assigned really does have 0 WIP per
	// member, and saying so is correct — the gap rule does not apply once a
	// denominator exists.
	if perMember := overview.Metrics["work.wip.per_member"]; perMember.SampleCount > 0 && perMember.Value == nil {
		t.Fatalf("work.wip.per_member has samples but no value: %+v", perMember)
	}

	// A count-typed metric keeps the zero rule: an empty workspace really has 0
	// issues finished this week, and that is a fact, not a missing measurement.
	if throughput := overview.Metrics["work.throughput.week"]; throughput.Value == nil || *throughput.Value != 0 ||
		throughput.Empty != metricEmptyZero {
		t.Fatalf("work.throughput.week = %+v, want 0 with the zero rule", throughput)
	}

	// Same document as the REST read, byte for byte: the tool replays that
	// handler, and this is where a divergence would show up.
	rest := testutil.Call(t, testHandler.GetWorkbenchOverview,
		workbenchMCPRestRequest(t, "/api/workbench/overview", testUserID, emptyWorkspaceID)).Want(http.StatusOK)

	text, isError := workbenchMCPResult(t, frame)
	if isError {
		t.Fatalf("overview answered isError: %s", text)
	}
	var fromTool, fromRest any
	if err := json.Unmarshal([]byte(text), &fromTool); err != nil {
		t.Fatalf("decode tool overview: %v", err)
	}
	if err := json.Unmarshal(rest.Body.Bytes(), &fromRest); err != nil {
		t.Fatalf("decode REST overview: %v", err)
	}
	if !reflect.DeepEqual(fromTool, fromRest) {
		t.Fatalf("workbench_overview differs from GET /api/workbench/overview\n tool: %s\n rest: %s",
			text, rest.Body.String())
	}

	// The counts answer too, and an empty ledger really does have none.
	_, countFrame := workbenchMCPCall(t, workbenchToolCounts, nil, "", emptyWorkspaceID)
	var counts WorkbenchCountsResponse
	workbenchMCPOK(t, countFrame, &counts)
	if counts.Creators != 0 || counts.Jobs != 0 || counts.Employees != 0 {
		t.Fatalf("counts in an empty workspace = %+v, want zeros", counts)
	}
}

// TestWorkbenchMCPLedgerRejectsBadArguments covers the argument failures a client
// can cause. Each one answers isError with a reason instead of a protocol error
// or a panic, and none of them widens the query.
func TestWorkbenchMCPLedgerRejectsBadArguments(t *testing.T) {
	if testPool == nil {
		t.Skip("handler tests require a reachable DATABASE_URL")
	}

	t.Run("unknown domain", func(t *testing.T) {
		_, frame := workbenchMCPCall(t, workbenchToolLedger, map[string]any{"domain": "invoices"}, "", "")
		reason := workbenchMCPRejected(t, frame, "domain must be one of")
		if !strings.Contains(reason, "creators") || !strings.Contains(reason, "employees") {
			t.Fatalf("reason does not list the ledger vocabulary: %s", reason)
		}
	})

	t.Run("missing domain", func(t *testing.T) {
		_, frame := workbenchMCPCall(t, workbenchToolLedger, nil, "", "")
		workbenchMCPRejected(t, frame, "domain is required")
	})

	t.Run("limit over the cap is refused, not clamped", func(t *testing.T) {
		_, frame := workbenchMCPCall(t, workbenchToolLedger, map[string]any{
			"domain": "jobs",
			"limit":  workbenchMCPMaxLimit + 1,
		}, "", "")
		workbenchMCPRejected(t, frame, "limit must be between 1 and 100")
	})

	t.Run("malformed department id", func(t *testing.T) {
		_, frame := workbenchMCPCall(t, workbenchToolLedger, map[string]any{
			"domain":        "jobs",
			"department_id": "not-a-uuid",
		}, "", "")
		workbenchMCPRejected(t, frame, "department_id")
	})

	t.Run("department filter on a domain without attribution", func(t *testing.T) {
		departmentID := dbfx.Insert(t, "department", testutil.Cols{
			"workspace_id": testWorkspaceID,
			"name":         "Workbench MCP attribution " + t.Name(),
		})
		_, frame := workbenchMCPCall(t, workbenchToolLedger, map[string]any{
			"domain":        "creators",
			"department_id": departmentID,
		}, "", "")
		workbenchMCPRejected(t, frame, "only jobs, employees accept department_id")
	})

	t.Run("unknown argument", func(t *testing.T) {
		_, frame := workbenchMCPCall(t, workbenchToolLedger, map[string]any{
			"domain":     "jobs",
			"department": "a typo the schema does not declare",
		}, "", "")
		workbenchMCPRejected(t, frame, "arguments")
	})
}

// TestWorkbenchMCPFinanceOnlyServesTheCurrentMonth documents the one figure the
// money block cannot answer on request: the aggregate slices on the database's
// now(), so a month other than this one is refused rather than mislabelled.
func TestWorkbenchMCPFinanceOnlyServesTheCurrentMonth(t *testing.T) {
	if testPool == nil {
		t.Skip("handler tests require a reachable DATABASE_URL")
	}

	emptyWorkspaceID := dbfx.Workspace(t, "Workbench MCP finance workspace", "wb-mcp-finance-ws")
	dbfx.Member(t, emptyWorkspaceID, testUserID, "owner")

	_, frame := workbenchMCPCall(t, workbenchToolFinance, nil, "", emptyWorkspaceID)
	var finance WorkbenchFinanceResponse
	workbenchMCPOK(t, frame, &finance)
	if finance.Window.Month == "" {
		t.Fatalf("finance answered no window: %+v", finance)
	}
	// No cost entry and no settled collaboration: the margin is a gap, not 100 %.
	if finance.GrossMargin.Value != nil || finance.GrossMargin.Empty != metricEmptyInsufficientData {
		t.Fatalf("gross_margin = %+v, want a gap in an empty workspace", finance.GrossMargin)
	}
	if finance.GrossMargin.Basis != financeBasisNone {
		t.Fatalf("gross_margin basis = %q, want %q", finance.GrossMargin.Basis, financeBasisNone)
	}

	_, current := workbenchMCPCall(t, workbenchToolFinance,
		map[string]any{"month": finance.Window.Month}, "", emptyWorkspaceID)
	workbenchMCPOK(t, current, nil)

	_, past := workbenchMCPCall(t, workbenchToolFinance,
		map[string]any{"month": "2020-01"}, "", emptyWorkspaceID)
	workbenchMCPRejected(t, past, "not the current calendar month")

	_, malformed := workbenchMCPCall(t, workbenchToolFinance,
		map[string]any{"month": "2026-13-01"}, "", emptyWorkspaceID)
	workbenchMCPRejected(t, malformed, "month must be YYYY-MM")
}

// TestWorkbenchMCPLedgerReadsJobs is the read path end to end: a real row, read
// back through the tool, field for field the same object the REST list answers.
func TestWorkbenchMCPLedgerReadsJobs(t *testing.T) {
	if testPool == nil {
		t.Skip("handler tests require a reachable DATABASE_URL")
	}

	job := createHrJobFixture(t, testUserID, "MCP ledger fixture job")

	_, frame := workbenchMCPCall(t, workbenchToolLedger, map[string]any{
		"domain": "jobs",
		"limit":  workbenchMCPMaxLimit,
	}, "", "")

	text, isError := workbenchMCPResult(t, frame)
	if isError {
		t.Fatalf("workbench_ledger(jobs) answered isError: %s", text)
	}
	var page struct {
		Jobs  []map[string]any `json:"jobs"`
		Total int              `json:"total"`
	}
	if err := json.Unmarshal([]byte(text), &page); err != nil {
		t.Fatalf("decode ledger page %q: %v", text, err)
	}
	if page.Total != len(page.Jobs) {
		t.Fatalf("total = %d, want the page length %d", page.Total, len(page.Jobs))
	}

	rest := testutil.Call(t, testHandler.ListHrJobs,
		workbenchMCPRestRequest(t, "/api/workbench/hr/jobs?limit=100", testUserID, testWorkspaceID)).
		Want(http.StatusOK)
	var restPage struct {
		Jobs  []map[string]any `json:"jobs"`
		Total int              `json:"total"`
	}
	rest.JSON(&restPage)

	fromRest := map[string]map[string]any{}
	for _, row := range restPage.Jobs {
		id, _ := row["id"].(string)
		fromRest[id] = row
	}
	fromTool := map[string]map[string]any{}
	for _, row := range page.Jobs {
		id, _ := row["id"].(string)
		fromTool[id] = row
	}

	read, present := fromTool[job.ID]
	if !present {
		t.Fatalf("workbench_ledger(jobs) did not return the fixture job %s: %s", job.ID, text)
	}
	expected, present := fromRest[job.ID]
	if !present {
		t.Fatalf("the REST list did not return the fixture job %s", job.ID)
	}
	if !reflect.DeepEqual(read, expected) {
		t.Fatalf("job %s differs between the tool and the REST list\n tool: %v\n rest: %v",
			job.ID, read, expected)
	}

	// A cursor from this page pages past it: the second call must not repeat the
	// first row (the REST list is keyset-ordered newest first).
	if len(page.Jobs) > 0 {
		_, nextFrame := workbenchMCPCall(t, workbenchToolLedger, map[string]any{
			"domain": "jobs",
			"cursor": job.ID,
		}, "", "")
		var next struct {
			Jobs []map[string]any `json:"jobs"`
		}
		workbenchMCPOK(t, nextFrame, &next)
		for _, row := range next.Jobs {
			if id, _ := row["id"].(string); id == job.ID {
				t.Fatalf("the page after cursor %s repeated that row", job.ID)
			}
		}
	}
}

// TestWorkbenchMCPIsWorkspaceScoped is the boundary case: the tools hold no
// workspace of their own, so a caller from another workspace cannot read this
// one, and a member reading their own workspace never sees another's rows.
func TestWorkbenchMCPIsWorkspaceScoped(t *testing.T) {
	if testPool == nil {
		t.Skip("handler tests require a reachable DATABASE_URL")
	}

	job := createHrJobFixture(t, testUserID, "MCP scoped fixture job")

	otherWorkspaceID := dbfx.Workspace(t, "Workbench MCP other workspace", "wb-mcp-other-ws")
	outsiderUserID := dbfx.User(t, "Workbench MCP outsider", "wb-mcp-outsider@multica.ai")
	dbfx.Member(t, otherWorkspaceID, outsiderUserID, "owner")

	t.Run("a foreign identity cannot read this workspace", func(t *testing.T) {
		status, frame := workbenchMCPPost(t, map[string]any{
			"jsonrpc": "2.0", "id": 12, "method": "tools/list",
		}, outsiderUserID, testWorkspaceID)
		if status == http.StatusOK {
			t.Fatalf("a non-member reached the workbench tools: %s", frame.Result)
		}
		if len(frame.Result) != 0 {
			t.Fatalf("a non-member drew a tool document: %s", frame.Result)
		}

		// The same refusal on a read, not just on discovery.
		status, frame = workbenchMCPCall(t, workbenchToolLedger,
			map[string]any{"domain": "jobs"}, outsiderUserID, testWorkspaceID)
		if status == http.StatusOK {
			t.Fatalf("a non-member read the jobs ledger: %s", frame.Result)
		}
	})

	t.Run("the ledgers follow the workspace, not the caller", func(t *testing.T) {
		_, frame := workbenchMCPCall(t, workbenchToolLedger,
			map[string]any{"domain": "jobs", "limit": workbenchMCPMaxLimit}, outsiderUserID, otherWorkspaceID)
		var page struct {
			Jobs  []map[string]any `json:"jobs"`
			Total int              `json:"total"`
		}
		workbenchMCPOK(t, frame, &page)
		for _, row := range page.Jobs {
			if id, _ := row["id"].(string); id == job.ID {
				t.Fatalf("a job from another workspace appeared in this workspace's ledger: %v", row)
			}
		}
		if page.Total != len(page.Jobs) {
			t.Fatalf("total = %d, want the page length %d", page.Total, len(page.Jobs))
		}

		// And the counts of the other workspace do not include this one's rows.
		_, countFrame := workbenchMCPCall(t, workbenchToolCounts, nil, outsiderUserID, otherWorkspaceID)
		var counts WorkbenchCountsResponse
		workbenchMCPOK(t, countFrame, &counts)
		if counts.Jobs != int64(len(page.Jobs)) {
			t.Fatalf("counts.jobs = %d, want %d (this workspace's rows only)", counts.Jobs, len(page.Jobs))
		}
	})
}

// TestWorkbenchMCPLedgerDomains is the guard that keeps the ledger tool's
// vocabulary and its dispatcher one list.
//
// It answers three questions, all without a database:
//
//   - Every advertised domain has a read behind it, and no read is reachable
//     without being advertised. A name in the enum that the map does not know
//     is a tool that can only ever answer "unknown ledger"; a map entry the enum
//     omits is a ledger no agent can ask for.
//   - The vocabulary is the fifteen ledgers this batch covers, spelled once. The
//     count is asserted rather than derived so adding a sixteenth is a deliberate
//     edit to this test, not a side effect.
//   - Every domain's table exists in the migrations. A domain whose table no
//     migration creates answers an error forever, and "the page works but the
//     tool does not" is exactly the drift the coverage list is for.
func TestWorkbenchMCPLedgerDomains(t *testing.T) {
	h := &Handler{}

	if len(workbenchMCPLedgerDomainNames) != 15 {
		t.Fatalf("domain vocabulary has %d names, want 15: %v",
			len(workbenchMCPLedgerDomainNames), workbenchMCPLedgerDomainNames)
	}

	seen := make(map[string]bool, len(workbenchMCPLedgerDomainNames))
	for _, name := range workbenchMCPLedgerDomainNames {
		if seen[name] {
			t.Fatalf("domain %q is declared twice", name)
		}
		seen[name] = true
	}

	domains := h.workbenchMCPLedgerDomains()
	for _, name := range workbenchMCPLedgerDomainNames {
		domain, ok := domains[name]
		if !ok {
			t.Errorf("domain %q is advertised but has no read", name)
			continue
		}
		if domain.read == nil {
			t.Errorf("domain %q maps to a nil read", name)
		}
	}
	for name := range domains {
		if !seen[name] {
			t.Errorf("domain %q has a read but is not advertised", name)
		}
	}

	// The four channel origins and nine of the original ledgers are in the
	// list; these six are what this batch added.
	for _, name := range []string{"quotes", "activities", "campaigns", "goals", "topics", "hot"} {
		if !seen[name] {
			t.Errorf("domain %q is missing from the vocabulary", name)
		}
	}

	if len(workbenchMCPLedgerTables) != len(workbenchMCPLedgerDomainNames) {
		t.Fatalf("table map has %d entries, vocabulary has %d",
			len(workbenchMCPLedgerTables), len(workbenchMCPLedgerDomainNames))
	}

	migrations, err := filepath.Glob(filepath.Join("..", "..", "migrations", "*.up.sql"))
	if err != nil {
		t.Fatalf("list migrations: %v", err)
	}
	if len(migrations) == 0 {
		t.Fatalf("no migrations found; the coverage check would pass vacuously")
	}
	var schema strings.Builder
	for _, path := range migrations {
		body, err := os.ReadFile(path)
		if err != nil {
			t.Fatalf("read %s: %v", path, err)
		}
		schema.Write(body)
		schema.WriteByte('\n')
	}
	ddl := schema.String()

	for name, table := range workbenchMCPLedgerTables {
		if !seen[name] {
			t.Errorf("table map names domain %q, which is not advertised", name)
		}
		// Both spellings are in use: the platform's migrations say
		// `CREATE TABLE IF NOT EXISTS`, the product ones say `CREATE TABLE`.
		if !strings.Contains(ddl, "CREATE TABLE IF NOT EXISTS "+table) &&
			!strings.Contains(ddl, "CREATE TABLE "+table) {
			t.Errorf("domain %q pages table %q, which no migration creates", name, table)
		}
	}
}
