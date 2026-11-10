package handler

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/jerry-halo2026/morchat.co/server/internal/knowledge"
	"github.com/jerry-halo2026/morchat.co/server/internal/middleware"
	"github.com/jerry-halo2026/morchat.co/server/internal/storage"
)

// The knowledge HTTP surface: import pipeline, retrieval test, and the agent
// tool registry.
//
// Every route here is workspace-scoped through middleware.RequireWorkspaceMember
// (the workspace comes from X-Workspace-ID / X-Workspace-Slug / the query
// fallbacks the rest of the API uses), and the viewer is the authenticated
// actor from X-User-ID. The handlers never take a workspace from the body: the
// one identifier that decides which rows are visible must come from the
// membership check, not from the caller.
//
// Error mapping is centralised in writeKnowledgeError so every route answers the
// same codes for the same condition:
//
//	403 knowledge_forbidden         the retrieval ACL said no (fail-closed)
//	404 knowledge_not_found         item / document / chunk is not visible here
//	404 knowledge_import_not_found  unknown import task
//	404 knowledge_unknown_tool      not in the tool registry
//	400 knowledge_invalid_request   bad enum value, missing field, wrong shape
//	503 knowledge_upload_unavailable  deployment has no presigner configured

// knowledgeService builds the pipeline over this handler's database and storage.
//
// The service is constructed per request rather than stored on Handler: it is a
// thin value (a DB handle plus optional capabilities), and building it here keeps
// the knowledge wiring out of handler.go — one fewer field for the rest of the
// package to keep consistent.
func (h *Handler) knowledgeService() *knowledge.Service {
	opts := []knowledge.Option{}
	if h.Storage != nil {
		var store storage.Storage = h.Storage
		if src, ok := store.(knowledge.ObjectSource); ok {
			opts = append(opts, knowledge.WithObjectSource(src))
		}
		if signer, ok := store.(knowledge.UploadSigner); ok {
			opts = append(opts, knowledge.WithUploadSigner(signer))
		}
	}
	return knowledge.NewService(h.DB, opts...)
}

// knowledgeRequestScope resolves the workspace and viewer for one request.
func knowledgeRequestScope(r *http.Request) (workspaceID, viewerID string, ok bool) {
	workspaceID = middleware.WorkspaceIDFromContext(r.Context())
	viewerID = requestUserID(r)
	if strings.TrimSpace(workspaceID) == "" || strings.TrimSpace(viewerID) == "" {
		return "", "", false
	}
	return workspaceID, viewerID, true
}

// writeKnowledgeError maps a pipeline error onto the codes above.
func writeKnowledgeError(w http.ResponseWriter, op string, err error) {
	switch {
	case errors.Is(err, knowledge.ErrKnowledgeForbidden):
		writeErrorCode(w, http.StatusForbidden, "knowledge_forbidden", "knowledge item is not visible to this caller")
	case errors.Is(err, knowledge.ErrImportTaskNotFound):
		writeErrorCode(w, http.StatusNotFound, "knowledge_import_not_found", "import task not found")
	case errors.Is(err, knowledge.ErrItemNotFound):
		writeErrorCode(w, http.StatusNotFound, "knowledge_not_found", "knowledge item not found")
	case errors.Is(err, knowledge.ErrDocumentNotFound):
		writeErrorCode(w, http.StatusNotFound, "knowledge_not_found", "knowledge document not found")
	case errors.Is(err, knowledge.ErrChunkNotFound):
		writeErrorCode(w, http.StatusNotFound, "knowledge_not_found", "knowledge chunk not found")
	case errors.Is(err, knowledge.ErrUnknownTool):
		writeErrorCode(w, http.StatusNotFound, "knowledge_unknown_tool", "unknown knowledge tool")
	case errors.Is(err, knowledge.ErrUploadUnavailable):
		writeErrorCode(w, http.StatusServiceUnavailable, "knowledge_upload_unavailable",
			"object storage is not configured for presigned uploads")
	case errors.Is(err, knowledge.ErrInvalidField),
		errors.Is(err, knowledge.ErrUnsupportedMedia),
		errors.Is(err, knowledge.ErrSpaceNotFound):
		writeErrorCode(w, http.StatusBadRequest, "knowledge_invalid_request", err.Error())
	default:
		slog.Error("knowledge operation failed", "op", op, "error", err)
		writeErrorCode(w, http.StatusInternalServerError, "knowledge_internal_error",
			"knowledge "+op+" failed")
	}
}

// knowledgeChunkConfigBody is the request-side chunk config. It mirrors
// knowledge.ChunkConfig but is declared separately so the API can keep accepting
// omitted fields while the pipeline type stays a value with defaults applied.
type knowledgeChunkConfigBody struct {
	Mode         string  `json:"mode"`
	TargetTokens int     `json:"target_tokens"`
	OverlapRatio float64 `json:"overlap_ratio"`
	ParentTokens int     `json:"parent_tokens"`
}

func (b knowledgeChunkConfigBody) toConfig() knowledge.ChunkConfig {
	return knowledge.ChunkConfig{
		Mode:         b.Mode,
		TargetTokens: b.TargetTokens,
		OverlapRatio: b.OverlapRatio,
		ParentTokens: b.ParentTokens,
	}
}

// RequestKnowledgeUploadURL answers POST /api/knowledge/upload-url.
//
// The client PUTs the bytes to the returned URL and then names `key` as
// source_ref on POST /api/knowledge/import. The key is what binds the two calls:
// it is namespaced by workspace, so a key from another workspace cannot be
// replayed into this one's import (the pipeline reads it back through the same
// storage handle, which is scoped by configuration, not by the caller).
func (h *Handler) RequestKnowledgeUploadURL(w http.ResponseWriter, r *http.Request) {
	workspaceID, _, ok := knowledgeRequestScope(r)
	if !ok {
		writeErrorCode(w, http.StatusBadRequest, "workspace_required", "workspace context is required")
		return
	}
	var body struct {
		Filename    string `json:"filename"`
		ContentType string `json:"content_type"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		// An empty body is legal: it asks for a generically named ticket.
		if !errors.Is(err, io.EOF) {
			writeErrorCode(w, http.StatusBadRequest, "knowledge_invalid_request", "invalid JSON body")
			return
		}
	}
	ticket, err := h.knowledgeService().RequestUploadURL(r.Context(), workspaceID, body.Filename, body.ContentType)
	if err != nil {
		writeKnowledgeError(w, "upload-url", err)
		return
	}
	writeJSON(w, http.StatusOK, ticket)
}

// StartKnowledgeImport answers POST /api/knowledge/import with 202 and the
// freshly created task; the pipeline reports progress on
// GET /api/knowledge/import/{id} and its SSE twin.
func (h *Handler) StartKnowledgeImport(w http.ResponseWriter, r *http.Request) {
	workspaceID, viewerID, ok := knowledgeRequestScope(r)
	if !ok {
		writeErrorCode(w, http.StatusBadRequest, "workspace_required", "workspace context is required")
		return
	}
	var body struct {
		SpaceID     string                   `json:"space_id"`
		Title       string                   `json:"title"`
		SourceType  string                   `json:"source_type"`
		SourceRef   string                   `json:"source_ref"`
		MIME        string                   `json:"mime"`
		Content     string                   `json:"content"`
		ACLMode     string                   `json:"acl_mode"`
		ChunkConfig knowledgeChunkConfigBody `json:"chunk_config"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeErrorCode(w, http.StatusBadRequest, "knowledge_invalid_request", "invalid JSON body")
		return
	}
	task, err := h.knowledgeService().StartImport(r.Context(), knowledge.ImportRequest{
		WorkspaceID: workspaceID,
		SpaceID:     body.SpaceID,
		Title:       body.Title,
		SourceType:  body.SourceType,
		SourceRef:   body.SourceRef,
		MIME:        body.MIME,
		Content:     []byte(body.Content),
		Chunk:       body.ChunkConfig.toConfig(),
		ACLMode:     body.ACLMode,
		OwnerID:     viewerID,
	})
	if err != nil {
		writeKnowledgeError(w, "import", err)
		return
	}
	writeJSON(w, http.StatusAccepted, task)
}

// GetKnowledgeImportTask answers GET /api/knowledge/import/{taskId}. This is the
// polling fallback for clients that cannot hold an SSE connection, and the
// recovery path for one that lost it: same row, same progress integer.
func (h *Handler) GetKnowledgeImportTask(w http.ResponseWriter, r *http.Request) {
	workspaceID, _, ok := knowledgeRequestScope(r)
	if !ok {
		writeErrorCode(w, http.StatusBadRequest, "workspace_required", "workspace context is required")
		return
	}
	task, err := h.knowledgeService().GetImportTask(r.Context(), workspaceID, chi.URLParam(r, "taskId"))
	if err != nil {
		writeKnowledgeError(w, "import task", err)
		return
	}
	writeJSON(w, http.StatusOK, task)
}

// StreamKnowledgeImportEvents answers GET /api/knowledge/import/{taskId}/events
// as Server-Sent Events.
//
// The stream is a poll of the task row once per tick, not a subscription: the
// pipeline runs in another process often enough (more than one API replica) that
// an in-memory broker would silently miss progress, and the row is the thing both
// readers agree on. It ends with one terminal event so a client can close
// without guessing, and stops when the request context dies.
func (h *Handler) StreamKnowledgeImportEvents(w http.ResponseWriter, r *http.Request) {
	workspaceID, _, ok := knowledgeRequestScope(r)
	if !ok {
		writeErrorCode(w, http.StatusBadRequest, "workspace_required", "workspace context is required")
		return
	}
	flusher, ok := w.(http.Flusher)
	if !ok {
		writeErrorCode(w, http.StatusInternalServerError, "knowledge_internal_error",
			"streaming is not supported by this server")
		return
	}
	taskID := chi.URLParam(r, "taskId")
	service := h.knowledgeService()

	// Resolve once before switching protocols: a 404 is far more useful as an
	// HTTP status than as the first SSE frame.
	first, err := service.GetImportTask(r.Context(), workspaceID, taskID)
	if err != nil {
		writeKnowledgeError(w, "import events", err)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	// nginx buffers proxied responses by default, which would hold every frame
	// until the stream closed.
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)

	send := func(event string, payload any) bool {
		body, err := json.Marshal(payload)
		if err != nil {
			return false
		}
		if _, err := fmt.Fprintf(w, "event: %s\ndata: %s\n\n", event, body); err != nil {
			return false
		}
		flusher.Flush()
		return true
	}

	task := first
	if !send("progress", task) {
		return
	}
	if task.Terminal() {
		send("done", task)
		return
	}

	// A task nobody finishes (a crashed replica) must not pin a connection
	// forever: ten minutes is many times the pipeline's own timeout.
	deadline := time.NewTimer(10 * time.Minute)
	defer deadline.Stop()
	ticker := time.NewTicker(300 * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case <-r.Context().Done():
			return
		case <-deadline.C:
			send("timeout", task)
			return
		case <-ticker.C:
			next, err := service.GetImportTask(r.Context(), workspaceID, taskID)
			if err != nil {
				send("error", map[string]string{"code": "knowledge_internal_error", "message": err.Error()})
				return
			}
			if next.Status == task.Status && next.Progress == task.Progress {
				continue
			}
			task = next
			if !send("progress", task) {
				return
			}
			if task.Terminal() {
				send("done", task)
				return
			}
		}
	}
}

// PreviewKnowledgeChunks answers POST /api/knowledge/items/{itemId}/chunks/preview.
//
// It runs the same Split the import pipeline runs and writes nothing, which is
// what makes "preview the chunking before you import" honest: the answer is the
// drafts, not a description of them.
func (h *Handler) PreviewKnowledgeChunks(w http.ResponseWriter, r *http.Request) {
	workspaceID, viewerID, ok := knowledgeRequestScope(r)
	if !ok {
		writeErrorCode(w, http.StatusBadRequest, "workspace_required", "workspace context is required")
		return
	}
	var body struct {
		SourceRef   string                   `json:"source_ref"`
		MIME        string                   `json:"mime"`
		Content     string                   `json:"content"`
		ChunkConfig knowledgeChunkConfigBody `json:"chunk_config"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeErrorCode(w, http.StatusBadRequest, "knowledge_invalid_request", "invalid JSON body")
		return
	}
	service := h.knowledgeService()
	itemID := chi.URLParam(r, "itemId")
	// The path names an item, so the item's visibility gates the preview: a
	// private item's chunking is not a thing a non-owner may inspect.
	if _, err := service.GetItemForViewer(r.Context(), workspaceID, viewerID, itemID); err != nil {
		writeKnowledgeError(w, "preview", err)
		return
	}
	preview, err := service.PreviewChunks(r.Context(), knowledge.PreviewRequest{
		WorkspaceID: workspaceID,
		SourceRef:   body.SourceRef,
		MIME:        body.MIME,
		Content:     []byte(body.Content),
		Chunk:       body.ChunkConfig.toConfig(),
	})
	if err != nil {
		writeKnowledgeError(w, "preview", err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"item_id": itemID,
		"config":  preview.Config,
		"tokens":  preview.Tokens,
		"chunks":  preview.Chunks,
	})
}

// TestKnowledgeRetrieval answers POST /api/knowledge/retrieval-test.
//
// It runs the production pipeline — the same Retrieve the agent tool calls — and
// returns the hits plus the debug block (index layer, per-channel counts, whether
// the vector channel degraded). A test endpoint that reimplemented retrieval
// would be testing itself.
func (h *Handler) TestKnowledgeRetrieval(w http.ResponseWriter, r *http.Request) {
	workspaceID, viewerID, ok := knowledgeRequestScope(r)
	if !ok {
		writeErrorCode(w, http.StatusBadRequest, "workspace_required", "workspace context is required")
		return
	}
	var body struct {
		Query          string  `json:"query"`
		Mode           string  `json:"mode"`
		TopK           int     `json:"top_k"`
		ScoreThreshold float64 `json:"score_threshold"`
		Rerank         bool    `json:"rerank"`
		SpaceID        string  `json:"space_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeErrorCode(w, http.StatusBadRequest, "knowledge_invalid_request", "invalid JSON body")
		return
	}
	result, err := h.knowledgeService().Retrieve(r.Context(), knowledge.RetrieveInput{
		WorkspaceID:    workspaceID,
		ViewerID:       viewerID,
		Query:          body.Query,
		SpaceID:        body.SpaceID,
		Mode:           body.Mode,
		TopK:           body.TopK,
		ScoreThreshold: body.ScoreThreshold,
		Rerank:         body.Rerank,
	})
	if err != nil {
		writeKnowledgeError(w, "retrieval", err)
		return
	}
	writeJSON(w, http.StatusOK, result)
}

// ListKnowledgeTools answers GET /api/knowledge/tools: the agent tool surface,
// so a runtime can register knowledge.search / knowledge.get without hardcoding
// their schemas a second time.
func (h *Handler) ListKnowledgeTools(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"tools": h.knowledgeService().Tools(),
	})
}

// InvokeKnowledgeTool answers POST /api/knowledge/tools/{name}/invoke.
func (h *Handler) InvokeKnowledgeTool(w http.ResponseWriter, r *http.Request) {
	workspaceID, viewerID, ok := knowledgeRequestScope(r)
	if !ok {
		writeErrorCode(w, http.StatusBadRequest, "workspace_required", "workspace context is required")
		return
	}
	name := chi.URLParam(r, "name")
	var args json.RawMessage
	decoder := json.NewDecoder(r.Body)
	if err := decoder.Decode(&args); err != nil {
		writeErrorCode(w, http.StatusBadRequest, "knowledge_invalid_request", "invalid JSON body")
		return
	}
	result, err := h.knowledgeService().InvokeTool(r.Context(), knowledge.ToolInvocation{
		Name:        name,
		WorkspaceID: workspaceID,
		ViewerID:    viewerID,
		Args:        args,
	})
	if err != nil {
		writeKnowledgeError(w, "tool", err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"tool":   name,
		"result": result,
	})
}
