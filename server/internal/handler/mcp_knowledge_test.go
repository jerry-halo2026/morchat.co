package handler

// Tests for the knowledge MCP endpoint (mcp_knowledge.go).
//
// They run against the migrated dev database the rest of the handler suite uses,
// behind the same membership middleware the router mounts, and assert what an
// MCP client actually sees: JSON-RPC frames, result shapes, and error codes.
//
// What is deliberately NOT asserted here is the permission rule itself —
// internal/knowledge owns canViewItem and tests it. These cases only prove that
// the MCP surface inherits that decision instead of re-deriving it.

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/jerry-halo2026/morchat.co/server/internal/auth"
	"github.com/jerry-halo2026/morchat.co/server/internal/middleware"
	"github.com/jerry-halo2026/morchat.co/server/internal/testutil"
)

// mcpFrame is one decoded JSON-RPC response.
type mcpFrame struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id"`
	Result  json.RawMessage `json:"result"`
	Error   *struct {
		Code    int    `json:"code"`
		Message string `json:"message"`
	} `json:"error"`
}

// mcpPost drives the endpoint through the membership middleware exactly as the
// router does, with the caller's identity in the headers that middleware reads.
func mcpPost(t *testing.T, body any, userID, workspaceID string) (int, mcpFrame) {
	t.Helper()
	if userID == "" {
		userID = testUserID
	}
	if workspaceID == "" {
		workspaceID = testWorkspaceID
	}
	req := testutil.WithHeaders(testutil.JSONRequest(http.MethodPost, "/api/mcp/knowledge", body),
		"X-User-ID", userID, "X-Workspace-ID", workspaceID)
	rec := httptest.NewRecorder()
	middleware.RequireWorkspaceMember(testHandler.Queries)(http.HandlerFunc(testHandler.KnowledgeMCP)).ServeHTTP(rec, req)

	var frame mcpFrame
	if rec.Body.Len() > 0 {
		if err := json.Unmarshal(rec.Body.Bytes(), &frame); err != nil {
			t.Fatalf("decode MCP frame %q: %v", rec.Body.String(), err)
		}
	}
	return rec.Code, frame
}

// mcpToolCall is the tools/call frame shape.
func mcpToolCall(t *testing.T, name string, arguments map[string]any) (int, mcpFrame) {
	t.Helper()
	return mcpPost(t, map[string]any{
		"jsonrpc": "2.0", "id": 7, "method": "tools/call",
		"params": map[string]any{"name": name, "arguments": arguments},
	}, "", "")
}

// mcpText returns the single text content block of a successful tools/call.
func mcpText(t *testing.T, frame mcpFrame) string {
	t.Helper()
	if frame.Error != nil {
		t.Fatalf("tools/call failed: %d %s", frame.Error.Code, frame.Error.Message)
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
	if result.IsError {
		t.Fatalf("tools/call reported isError: %s", frame.Result)
	}
	if len(result.Content) == 0 || result.Content[0].Type != "text" {
		t.Fatalf("tools/call result carries no text content block: %s", frame.Result)
	}
	return result.Content[0].Text
}

// TestKnowledgeMCPInitialize pins the handshake a client uses to decide whether
// to talk to this server at all: the negotiated revision, the tools capability,
// and the server identity a workspace MCP record names.
func TestKnowledgeMCPInitialize(t *testing.T) {
	if testPool == nil {
		t.Skip("handler tests require a reachable DATABASE_URL")
	}

	status, frame := mcpPost(t, map[string]any{
		"jsonrpc": "2.0", "id": 1, "method": "initialize",
		"params": map[string]any{
			"protocolVersion": "2025-03-26",
			"capabilities":    map[string]any{},
			"clientInfo":      map[string]any{"name": "agent-test", "version": "1"},
		},
	}, "", "")
	if status != http.StatusOK {
		t.Fatalf("initialize: status = %d, want 200", status)
	}
	if frame.Error != nil {
		t.Fatalf("initialize error: %d %s", frame.Error.Code, frame.Error.Message)
	}

	var result struct {
		ProtocolVersion string `json:"protocolVersion"`
		Capabilities    struct {
			Tools *json.RawMessage `json:"tools"`
		} `json:"capabilities"`
		ServerInfo struct {
			Name    string `json:"name"`
			Version string `json:"version"`
		} `json:"serverInfo"`
	}
	if err := json.Unmarshal(frame.Result, &result); err != nil {
		t.Fatalf("decode initialize result %s: %v", frame.Result, err)
	}
	if result.ProtocolVersion != "2025-03-26" {
		t.Fatalf("protocolVersion = %q, want the requested 2025-03-26", result.ProtocolVersion)
	}
	if result.Capabilities.Tools == nil {
		t.Fatalf("capabilities.tools missing: %s", frame.Result)
	}
	if result.ServerInfo.Name != "morechat-knowledge" || result.ServerInfo.Version != "0.1.2" {
		t.Fatalf("serverInfo = %+v, want morechat-knowledge/0.1.2", result.ServerInfo)
	}
}

// TestKnowledgeMCPInitializeFallsBackOnUnknownRevision covers the negotiation
// rule: a revision this build does not speak is answered with the default rather
// than echoed back, so the client can decide whether to continue.
func TestKnowledgeMCPInitializeFallsBackOnUnknownRevision(t *testing.T) {
	if testPool == nil {
		t.Skip("handler tests require a reachable DATABASE_URL")
	}

	_, frame := mcpPost(t, map[string]any{
		"jsonrpc": "2.0", "id": 2, "method": "initialize",
		"params": map[string]any{"protocolVersion": "1999-01-01"},
	}, "", "")
	if frame.Error != nil {
		t.Fatalf("initialize error: %d %s", frame.Error.Code, frame.Error.Message)
	}
	var result struct {
		ProtocolVersion string `json:"protocolVersion"`
	}
	if err := json.Unmarshal(frame.Result, &result); err != nil {
		t.Fatalf("decode initialize result: %v", err)
	}
	if result.ProtocolVersion != mcpDefaultProtocolVersion {
		t.Fatalf("protocolVersion = %q, want default %q", result.ProtocolVersion, mcpDefaultProtocolVersion)
	}
}

// TestKnowledgeMCPToolsList checks the surface a model is shown: the two
// documented underscore tool names, and schemas that came from the knowledge
// package rather than being retyped here.
func TestKnowledgeMCPToolsList(t *testing.T) {
	if testPool == nil {
		t.Skip("handler tests require a reachable DATABASE_URL")
	}

	_, frame := mcpPost(t, map[string]any{"jsonrpc": "2.0", "id": 3, "method": "tools/list"}, "", "")
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
	if len(result.Tools) != 3 {
		t.Fatalf("tools = %d, want 3: %s", len(result.Tools), frame.Result)
	}

	byName := map[string]struct {
		required []string
		props    map[string]json.RawMessage
	}{}
	for _, tool := range result.Tools {
		var schema struct {
			Properties map[string]json.RawMessage `json:"properties"`
			Required   []string                   `json:"required"`
		}
		if err := json.Unmarshal(tool.InputSchema, &schema); err != nil {
			t.Fatalf("tool %q inputSchema is not an object: %v", tool.Name, err)
		}
		if tool.Description == "" {
			t.Fatalf("tool %q has no description", tool.Name)
		}
		byName[tool.Name] = struct {
			required []string
			props    map[string]json.RawMessage
		}{schema.Required, schema.Properties}
	}

	search, ok := byName["knowledge_search"]
	if !ok {
		t.Fatalf("knowledge_search missing from %v", byName)
	}
	for _, property := range []string{"query", "space_id", "top_k"} {
		if _, ok := search.props[property]; !ok {
			t.Fatalf("knowledge_search schema lacks %q: %v", property, search.props)
		}
	}
	if len(search.required) != 1 || search.required[0] != "query" {
		t.Fatalf("knowledge_search required = %v, want [query]", search.required)
	}

	get, ok := byName["knowledge_get"]
	if !ok {
		t.Fatalf("knowledge_get missing from %v", byName)
	}
	if _, ok := get.props["item_id"]; !ok {
		t.Fatalf("knowledge_get schema lacks item_id: %v", get.props)
	}
	if len(get.required) != 1 || get.required[0] != "item_id" {
		t.Fatalf("knowledge_get required = %v, want [item_id]", get.required)
	}
}

// TestKnowledgeMCPToolsCallGet runs the read path end to end: a real item, read
// back through the MCP wire format.
func TestKnowledgeMCPToolsCallGet(t *testing.T) {
	if testPool == nil {
		t.Skip("handler tests require a reachable DATABASE_URL")
	}

	spaceID := knowledgeCreateSpace(t, "MCP get", "", "")
	itemID := knowledgeCreateItem(t, spaceID, "MCP read target", "", "", map[string]any{
		"content": "# MCP\n\nThe knowledge tools are exposed over JSON-RPC.\n",
	})

	status, frame := mcpToolCall(t, "knowledge_get", map[string]any{"item_id": itemID, "include_chunks": false})
	if status != http.StatusOK {
		t.Fatalf("tools/call: status = %d, want 200", status)
	}
	var got struct {
		Item struct {
			ID    string `json:"id"`
			Title string `json:"title"`
		} `json:"item"`
	}
	if err := json.Unmarshal([]byte(mcpText(t, frame)), &got); err != nil {
		t.Fatalf("decode knowledge_get text: %v", err)
	}
	if got.Item.ID != itemID {
		t.Fatalf("knowledge_get returned item %q, want %q", got.Item.ID, itemID)
	}
	if got.Item.Title != "MCP read target" {
		t.Fatalf("knowledge_get title = %q", got.Item.Title)
	}

	// The registry spelling works too, so a configuration written against
	// /api/knowledge/tools does not have to be rewritten.
	_, dotted := mcpToolCall(t, "knowledge.get", map[string]any{"item_id": itemID})
	var alsoGot struct {
		Item struct {
			ID string `json:"id"`
		} `json:"item"`
	}
	if err := json.Unmarshal([]byte(mcpText(t, dotted)), &alsoGot); err != nil {
		t.Fatalf("decode dotted-name result: %v", err)
	}
	if alsoGot.Item.ID != itemID {
		t.Fatalf("knowledge.get returned %q, want %q", alsoGot.Item.ID, itemID)
	}
}

// TestKnowledgeMCPToolsCallSearch runs the retrieval path, which is the call that
// carries the retrieval ACL.
func TestKnowledgeMCPToolsCallSearch(t *testing.T) {
	if testPool == nil {
		t.Skip("handler tests require a reachable DATABASE_URL")
	}

	spaceID := knowledgeCreateSpace(t, "MCP search", "", "")
	knowledgeCreateItem(t, spaceID, "Retrieval channels", "", "", map[string]any{
		"content": "# Retrieval\n\nThe keyword channel and the vector channel are fused with RRF.\n",
	})

	_, frame := mcpToolCall(t, "knowledge_search", map[string]any{"query": "keyword channel", "top_k": 3})
	var result struct {
		Hits  []json.RawMessage `json:"hits"`
		Debug struct {
			Mode string `json:"mode"`
		} `json:"debug"`
	}
	text := mcpText(t, frame)
	if err := json.Unmarshal([]byte(text), &result); err != nil {
		t.Fatalf("decode knowledge_search text %q: %v", text, err)
	}
	if result.Debug.Mode == "" {
		t.Fatalf("knowledge_search answer has no retrieval mode: %s", text)
	}
}

// TestKnowledgeMCPUnknownMethod covers the routing miss: a method this endpoint
// does not implement is -32601, not a 404.
func TestKnowledgeMCPUnknownMethod(t *testing.T) {
	if testPool == nil {
		t.Skip("handler tests require a reachable DATABASE_URL")
	}

	status, frame := mcpPost(t, map[string]any{"jsonrpc": "2.0", "id": 4, "method": "resources/list"}, "", "")
	if status != http.StatusOK {
		t.Fatalf("unknown method: status = %d, want 200", status)
	}
	if frame.Error == nil || frame.Error.Code != -32601 {
		t.Fatalf("unknown method: %+v, want code -32601", frame.Error)
	}
	if string(frame.ID) != "4" {
		t.Fatalf("unknown method echoed id %s, want 4", frame.ID)
	}
}

// TestKnowledgeMCPInvalidParams covers the two argument failures a client can
// actually cause: no tool name, and arguments the tool rejects.
func TestKnowledgeMCPInvalidParams(t *testing.T) {
	if testPool == nil {
		t.Skip("handler tests require a reachable DATABASE_URL")
	}

	t.Run("missing tool name", func(t *testing.T) {
		_, frame := mcpPost(t, map[string]any{
			"jsonrpc": "2.0", "id": 5, "method": "tools/call", "params": map[string]any{},
		}, "", "")
		if frame.Error == nil || frame.Error.Code != -32602 {
			t.Fatalf("missing name: %+v, want -32602", frame.Error)
		}
	})

	t.Run("unknown tool", func(t *testing.T) {
		_, frame := mcpToolCall(t, "knowledge_delete", map[string]any{"item_id": "x"})
		if frame.Error == nil || frame.Error.Code != -32602 {
			t.Fatalf("unknown tool: %+v, want -32602", frame.Error)
		}
	})

	t.Run("missing required argument", func(t *testing.T) {
		_, frame := mcpToolCall(t, "knowledge_search", map[string]any{"top_k": 1})
		if frame.Error == nil || frame.Error.Code != -32602 {
			t.Fatalf("missing query: %+v, want -32602", frame.Error)
		}
	})
}

// TestKnowledgeMCPForbiddenForForeignWorkspaceItem is the越权 case: a token bound
// to workspace B may not read an item that lives in workspace A. The
// knowledge package collapses "not here" and "not yours" into one answer, and
// the MCP surface must pass that -32001 through unchanged.
func TestKnowledgeMCPForbiddenForForeignWorkspaceItem(t *testing.T) {
	if testPool == nil {
		t.Skip("handler tests require a reachable DATABASE_URL")
	}

	spaceID := knowledgeCreateSpace(t, "MCP forbidden", "", "")
	itemID := knowledgeCreateItem(t, spaceID, "Private to workspace A", "", "", map[string]any{
		"content": "only workspace A may read this",
	})

	// A second workspace the same user belongs to: membership is real, the item
	// is not reachable from there.
	otherWorkspaceID := dbfx.Workspace(t, "MCP forbidden workspace", "mcp-forbidden-ws")
	dbfx.Member(t, otherWorkspaceID, testUserID, "owner")

	status, frame := mcpPost(t, map[string]any{
		"jsonrpc": "2.0", "id": 6, "method": "tools/call",
		"params": map[string]any{
			"name":      "knowledge_get",
			"arguments": map[string]any{"item_id": itemID},
		},
	}, "", otherWorkspaceID)
	if status != http.StatusOK {
		t.Fatalf("forbidden call: status = %d, want 200 with a protocol error", status)
	}
	if frame.Error == nil || frame.Error.Code != -32001 {
		t.Fatalf("cross-workspace knowledge_get: %+v, want -32001 knowledge_forbidden", frame.Error)
	}
}

// TestKnowledgeMCPExpiredTaskToken covers the one credential state that needs its
// own code: the gate in front of the auth middleware answers -32002, which tells
// a run to mint a fresh token instead of treating it as a wrong credential.
func TestKnowledgeMCPExpiredTaskToken(t *testing.T) {
	if testPool == nil {
		t.Skip("handler tests require a reachable DATABASE_URL")
	}

	agentID := createHandlerTestAgent(t, "MCP expired token agent", nil)
	taskID := createHandlerTestTaskForAgent(t, agentID)
	rawToken, err := auth.GenerateAgentTaskToken()
	if err != nil {
		t.Fatalf("generate task token: %v", err)
	}
	dbfx.Insert(t, "task_token", testutil.Cols{
		"token_hash":   auth.HashToken(rawToken),
		"task_id":      taskID,
		"agent_id":     agentID,
		"workspace_id": testWorkspaceID,
		"user_id":      testUserID,
		"expires_at":   testutil.Raw("now() - interval '1 minute'"),
	})

	req := testutil.JSONRequest(http.MethodPost, "/api/mcp/knowledge", map[string]any{
		"jsonrpc": "2.0", "id": 8, "method": "initialize",
		"params": map[string]any{"protocolVersion": "2025-03-26"},
	})
	req.Header.Set("Authorization", "Bearer "+rawToken)
	// The gate answers before Auth and before the membership middleware, so no
	// identity headers are present — which is exactly the state an expired token
	// leaves a client in.
	rec := httptest.NewRecorder()
	testHandler.MCPTokenExpiryGate(http.HandlerFunc(testHandler.KnowledgeMCP)).ServeHTTP(rec, req)

	var frame mcpFrame
	if err := json.Unmarshal(rec.Body.Bytes(), &frame); err != nil {
		t.Fatalf("decode expired-token frame %q: %v", rec.Body.String(), err)
	}
	if frame.Error == nil || frame.Error.Code != -32002 {
		t.Fatalf("expired token: %+v, want -32002 mat_token_expired", frame.Error)
	}
}

// TestKnowledgeMCPTokenGateIgnoresLiveAndUnknownTokens keeps the gate honest: it
// must not answer for a live task token, and must not turn an unknown token into
// a code the middleware would otherwise have rejected as 401.
func TestKnowledgeMCPTokenGateIgnoresLiveAndUnknownTokens(t *testing.T) {
	if testPool == nil {
		t.Skip("handler tests require a reachable DATABASE_URL")
	}

	agentID := createHandlerTestAgent(t, "MCP live token agent", nil)
	taskID := createHandlerTestTaskForAgent(t, agentID)
	liveToken, err := auth.GenerateAgentTaskToken()
	if err != nil {
		t.Fatalf("generate task token: %v", err)
	}
	dbfx.Insert(t, "task_token", testutil.Cols{
		"token_hash":   auth.HashToken(liveToken),
		"task_id":      taskID,
		"agent_id":     agentID,
		"workspace_id": testWorkspaceID,
		"user_id":      testUserID,
		"expires_at":   testutil.Raw("now() + interval '1 hour'"),
	})

	reached := 0
	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		reached++
		w.WriteHeader(http.StatusOK)
	})
	gate := testHandler.MCPTokenExpiryGate(inner)

	for _, token := range []string{liveToken, "mat_0000000000000000000000000000000000000000", "mul_not_a_task_token"} {
		reached = 0
		req := httptest.NewRequest(http.MethodPost, "/api/mcp/knowledge", nil)
		req.Header.Set("Authorization", "Bearer "+token)
		gate.ServeHTTP(httptest.NewRecorder(), req)
		if reached != 1 {
			t.Fatalf("gate blocked a token it does not own: %q", token)
		}
	}
}

// TestKnowledgeMCPNotificationAccepted covers notifications/initialized, which
// the remote-MCP client sends after initialize and which must not draw an error
// frame.
func TestKnowledgeMCPNotificationAccepted(t *testing.T) {
	if testPool == nil {
		t.Skip("handler tests require a reachable DATABASE_URL")
	}

	status, frame := mcpPost(t, map[string]any{
		"jsonrpc": "2.0", "method": "notifications/initialized", "params": map[string]any{},
	}, "", "")
	if status != http.StatusAccepted {
		t.Fatalf("notification: status = %d, want 202", status)
	}
	if frame.Error != nil {
		t.Fatalf("notification drew an error frame: %+v", frame.Error)
	}
}

// TestKnowledgeMCPParseError covers a body that is not JSON at all: -32700, still
// at HTTP 200 so a client can report the protocol error it actually got.
func TestKnowledgeMCPParseError(t *testing.T) {
	if testPool == nil {
		t.Skip("handler tests require a reachable DATABASE_URL")
	}

	req := testutil.WithHeaders(httptest.NewRequest(http.MethodPost, "/api/mcp/knowledge",
		strings.NewReader(`{"jsonrpc":`)), "X-User-ID", testUserID, "X-Workspace-ID", testWorkspaceID)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	middleware.RequireWorkspaceMember(testHandler.Queries)(http.HandlerFunc(testHandler.KnowledgeMCP)).ServeHTTP(rec, req)

	var frame mcpFrame
	if err := json.Unmarshal(rec.Body.Bytes(), &frame); err != nil {
		t.Fatalf("decode parse-error frame %q: %v", rec.Body.String(), err)
	}
	if frame.Error == nil || frame.Error.Code != -32700 {
		t.Fatalf("parse error: %+v, want -32700", frame.Error)
	}
}
