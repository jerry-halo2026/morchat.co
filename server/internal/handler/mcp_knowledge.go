package handler

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/jerry-halo2026/morchat.co/server/internal/auth"
	"github.com/jerry-halo2026/morchat.co/server/internal/knowledge"
)

// The knowledge MCP endpoint.
//
// The knowledge tools declared in internal/knowledge/tools.go are spoken here as
// JSON-RPC 2.0 over a single POST, which is the transport the daemon's remote-MCP
// client (pkg/remotemcp) and multica-managed MCP clients speak:
// initialize -> tools/list -> tools/call, with the session header optional.
//
// Two things this file deliberately does NOT do:
//
//   - It does not declare the tools. tools/list is built from
//     knowledge.Service.Tools(), so the schema a model is shown and the code that
//     answers it cannot drift apart.
//   - It does not decide visibility. tools/call goes through
//     knowledge.Service.InvokeTool, which runs the package's canViewItem gate for
//     the token's own user. The MCP surface is a second protocol, never a second
//     door.
//
// Errors are JSON-RPC codes rather than HTTP statuses, because that is what a
// client can act on: HTTP stays 200 for every decoded request (the repo's apps
// gateway does the same) and only a body that is not JSON, or a missing
// credential, answers a non-200.

// MCP method names, as used by pkg/remotemcp's client.
const (
	mcpMethodInitialize   = "initialize"
	mcpMethodPing         = "ping"
	mcpMethodToolsList    = "tools/list"
	mcpMethodToolsCall    = "tools/call"
	mcpNotificationPrefix = "notifications/"
)

// JSON-RPC error codes. -32001/-32002 are this server's own; the rest are the
// specification's.
const (
	mcpErrParse          = -32700
	mcpErrInvalidRequest = -32600
	mcpErrInternal       = -32603
	mcpErrMethodNotFound = -32601
	mcpErrInvalidParams  = -32602
	mcpErrKnowledge      = -32001
	mcpErrTokenExpired   = -32002
)

const (
	// mcpServerName is what initialize advertises, and what a workspace MCP
	// server record should be named.
	mcpServerName = "morechat-knowledge"
	// mcpServerVersion is this endpoint's own contract version.
	mcpServerVersion = "0.1.2"
	// mcpDefaultProtocolVersion is negotiated when the client asks for a
	// revision this build does not speak.
	mcpDefaultProtocolVersion = "2025-03-26"
	// maxMCPBody bounds one request: tool results are the large direction.
	maxMCPBody = 1 << 20
)

// mcpProtocolVersions are the revisions this endpoint answers. A client asking
// for one of these gets it echoed back; anything else is answered with the
// default, which is how MCP requires a server to refuse an unknown revision
// without failing the handshake outright.
func mcpProtocolVersions() []string {
	return []string{"2025-06-18", "2025-03-26", "2024-11-05"}
}

type mcpRequest struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params,omitempty"`
}

type mcpError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

type mcpResponse struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id"`
	Result  any             `json:"result,omitempty"`
	Error   *mcpError       `json:"error,omitempty"`
}

// writeMCP answers one JSON-RPC frame. The id is echoed verbatim, and null when
// the request had none: JSON-RPC requires the member to be present.
func writeMCP(w http.ResponseWriter, id json.RawMessage, result any, failure *mcpError) {
	if len(id) == 0 {
		id = json.RawMessage("null")
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(mcpResponse{JSONRPC: "2.0", ID: id, Result: result, Error: failure})
}

// MCPTokenExpiryGate answers the one credential failure the MCP surface must
// report in its own vocabulary.
//
// The auth middleware answers an expired agent task token with a bare 401,
// which is correct for every REST route and useless for an MCP client: 401 tells
// it "these credentials are wrong", while the truth here is "these credentials
// were right and have aged out" — the run simply needs a freshly minted token.
// So this gate runs BEFORE middleware.Auth, looks only for that one state, and
// hands everything else straight through: it authenticates nothing and grants
// nothing.
func (h *Handler) MCPTokenExpiryGate(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		token := strings.TrimSpace(strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer "))
		if !strings.HasPrefix(token, "mat_") || h.DB == nil {
			next.ServeHTTP(w, r)
			return
		}
		var expiresAt time.Time
		err := h.DB.QueryRow(r.Context(),
			`SELECT expires_at FROM task_token WHERE token_hash = $1`,
			auth.HashToken(token),
		).Scan(&expiresAt)
		// No row at all is not this gate's business: the token is unknown or
		// revoked, and the middleware's 401 is the right answer.
		if err != nil || expiresAt.After(time.Now()) {
			next.ServeHTTP(w, r)
			return
		}
		writeMCP(w, nil, nil, &mcpError{
			Code:    mcpErrTokenExpired,
			Message: "mat_token_expired: the agent task token has expired; mint a new one for this run",
		})
	})
}

// KnowledgeMCP serves POST /api/mcp/knowledge.
//
// The workspace and the viewer come from the request the middleware already
// authorized: middleware.Auth resolved the bearer token (a mat_ task token is
// bound to its workspace and its user; a mul_ PAT to its user, with the
// workspace selected by the usual header/query), and
// middleware.RequireWorkspaceMember confirmed the caller belongs to it. A bare
// X-Workspace-ID with no token never reaches this handler.
func (h *Handler) KnowledgeMCP(w http.ResponseWriter, r *http.Request) {
	if _, _, ok := knowledgeRequestScope(r); !ok {
		// The middleware chain guarantees both; reaching this means the route
		// was mounted without it, so the endpoint cannot answer for anyone.
		writeMCP(w, nil, nil, &mcpError{Code: mcpErrInternal, Message: "knowledge MCP endpoint is not mounted behind workspace auth"})
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

	// A notification carries no id and expects no response: accept it and stop.
	// The client sends notifications/initialized right after initialize, and an
	// error frame there is protocol noise it would have to special-case.
	//
	// The endpoint keeps no session state, so it neither issues nor requires
	// Mcp-Session-Id: every request is authenticated on its own and the only
	// state a call needs is the one inside it. A client that sends the header
	// anyway is ignored, which is what the transport allows.
	if len(req.ID) == 0 || string(req.ID) == "null" {
		w.WriteHeader(http.StatusAccepted)
		return
	}

	switch req.Method {
	case mcpMethodInitialize:
		writeMCP(w, req.ID, map[string]any{
			"protocolVersion": mcpNegotiateProtocol(req.Params),
			"capabilities":    map[string]any{"tools": map[string]any{}},
			"serverInfo":      map[string]any{"name": mcpServerName, "version": mcpServerVersion},
		}, nil)

	case mcpMethodPing:
		writeMCP(w, req.ID, map[string]any{}, nil)

	case mcpMethodToolsList:
		writeMCP(w, req.ID, map[string]any{"tools": h.mcpKnowledgeTools()}, nil)

	case mcpMethodToolsCall:
		h.mcpKnowledgeCall(w, r, req)

	default:
		writeMCP(w, req.ID, nil, &mcpError{Code: mcpErrMethodNotFound, Message: "unknown method " + req.Method})
	}
}

// mcpKnowledgeTools lists the tool surface in MCP's spelling: same names, same
// descriptions and same input schemas as knowledge.Service.Tools(), with the
// underscore tool names the endpoint documents (knowledge_search,
// knowledge_get) and MCP's inputSchema key.
func (h *Handler) mcpKnowledgeTools() []map[string]any {
	tools := h.knowledgeService().Tools()
	out := make([]map[string]any, 0, len(tools))
	for _, tool := range tools {
		out = append(out, map[string]any{
			"name":        mcpToolName(tool.Name),
			"description": tool.Description,
			"inputSchema": tool.InputSchema,
		})
	}
	return out
}

// mcpKnowledgeCall runs one tools/call through the knowledge service.
func (h *Handler) mcpKnowledgeCall(w http.ResponseWriter, r *http.Request, req mcpRequest) {
	var params struct {
		Name      string          `json:"name"`
		Arguments json.RawMessage `json:"arguments"`
	}
	if err := json.Unmarshal(req.Params, &params); err != nil {
		writeMCP(w, req.ID, nil, &mcpError{Code: mcpErrInvalidParams, Message: "tools/call params must be an object"})
		return
	}
	if strings.TrimSpace(params.Name) == "" {
		writeMCP(w, req.ID, nil, &mcpError{Code: mcpErrInvalidParams, Message: "tools/call needs a tool name"})
		return
	}

	workspaceID, viewerID, _ := knowledgeRequestScope(r)
	result, err := h.knowledgeService().InvokeTool(r.Context(), knowledge.ToolInvocation{
		Name:        mcpToolInternalName(params.Name),
		WorkspaceID: workspaceID,
		ViewerID:    viewerID,
		Args:        params.Arguments,
	})
	if err != nil {
		writeMCP(w, req.ID, nil, mcpKnowledgeError(err))
		return
	}

	// MCP returns tool output as content blocks. The knowledge tools answer with
	// JSON, so one text block carrying the encoded result is the honest mapping —
	// a client with a JSON-aware model reads it directly.
	body, err := json.Marshal(result)
	if err != nil {
		writeMCP(w, req.ID, nil, &mcpError{Code: mcpErrInternal, Message: "knowledge tool result is not serialisable"})
		return
	}
	writeMCP(w, req.ID, map[string]any{
		"content": []map[string]any{{"type": "text", "text": string(body)}},
		"isError": false,
	}, nil)
}

// mcpNegotiateProtocol echoes the revision the client asked for when this build
// speaks it, and otherwise answers with this build's default — the client then
// decides whether it can continue.
func mcpNegotiateProtocol(params json.RawMessage) string {
	var body struct {
		ProtocolVersion string `json:"protocolVersion"`
	}
	if err := json.Unmarshal(params, &body); err == nil {
		for _, supported := range mcpProtocolVersions() {
			if body.ProtocolVersion == supported {
				return supported
			}
		}
	}
	return mcpDefaultProtocolVersion
}

// mcpToolName maps the internal registry name (knowledge.search) onto the MCP
// spelling (knowledge_search), which is what this endpoint documents.
func mcpToolName(internal string) string {
	return strings.ReplaceAll(internal, ".", "_")
}

// mcpToolInternalName accepts both spellings: the documented one, and the
// registry form, so a configuration written against the REST tool registry keeps
// working.
func mcpToolInternalName(name string) string {
	name = strings.TrimSpace(name)
	if strings.Contains(name, ".") {
		return name
	}
	return strings.Replace(name, "knowledge_", "knowledge.", 1)
}

// mcpKnowledgeError maps the pipeline's errors onto JSON-RPC codes.
//
// knowledge_forbidden is the one that matters: GetItemForViewer collapses
// "no such item here" and "not visible to you" into it on purpose, so an MCP
// caller cannot probe for the existence of another workspace's items. A bad
// argument shape stays a parameter error, and anything unexpected is internal —
// never a forbidden, which would misreport a bug as a permission decision.
func mcpKnowledgeError(err error) *mcpError {
	switch {
	case errors.Is(err, knowledge.ErrKnowledgeForbidden):
		return &mcpError{Code: mcpErrKnowledge, Message: "knowledge_forbidden: item is not visible to this caller"}
	case errors.Is(err, knowledge.ErrInvalidField):
		return &mcpError{Code: mcpErrInvalidParams, Message: err.Error()}
	case errors.Is(err, knowledge.ErrUnknownTool):
		return &mcpError{Code: mcpErrInvalidParams, Message: err.Error()}
	case errors.Is(err, knowledge.ErrUnsupportedMedia), errors.Is(err, knowledge.ErrSpaceNotFound):
		return &mcpError{Code: mcpErrInvalidParams, Message: err.Error()}
	case errors.Is(err, context.Canceled), errors.Is(err, context.DeadlineExceeded):
		return &mcpError{Code: mcpErrInternal, Message: "knowledge tool call was cancelled"}
	default:
		return &mcpError{Code: mcpErrInternal, Message: "knowledge tool call failed"}
	}
}
