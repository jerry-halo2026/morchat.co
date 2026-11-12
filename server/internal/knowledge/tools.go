package knowledge

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
)

// The agent tool surface.
//
// knowledge.search and knowledge.get are the two entry points an agent gets: one
// to find passages, one to read the document a passage came from. They are
// declared here, next to the pipeline they call, rather than in the agent
// runtime, for the same reason the enums registry lives in this package — the
// schema a model is given and the code that answers it must not be able to drift
// apart.
//
// Both tools run through Retrieve / GetItemForViewer, so an agent is subject to
// exactly the permissions a member is: the tool surface adds no second door.

// Tool is one declared tool, in the shape an MCP client expects.
type Tool struct {
	Name        string          `json:"name"`
	Description string          `json:"description"`
	InputSchema json.RawMessage `json:"input_schema"`
}

// The registered tool names.
const (
	ToolKnowledgeSearch = "knowledge.search"
	ToolKnowledgeGet    = "knowledge.get"
	ToolKnowledgeWrite  = "knowledge.write"
)

var knowledgeSearchSchema = json.RawMessage(`{
  "type": "object",
  "properties": {
    "query":           {"type": "string", "description": "Natural-language or keyword query."},
    "top_k":           {"type": "integer", "minimum": 1, "maximum": 50, "description": "Maximum number of chunks to return (default 5)."},
    "mode":            {"type": "string", "enum": ["keyword", "vector", "hybrid"], "description": "Retrieval channel; hybrid fuses keyword and vector with RRF (default)."},
    "space_id":        {"type": "string", "description": "Optional knowledge space id to narrow the search."},
    "score_threshold": {"type": "number", "minimum": 0, "maximum": 1, "description": "Minimum channel score; full-text matches always pass."},
    "rerank":          {"type": "boolean", "description": "Apply the title-hit heuristic rerank."}
  },
  "required": ["query"],
  "additionalProperties": false
}`)

var knowledgeGetSchema = json.RawMessage(`{
  "type": "object",
  "properties": {
    "item_id":        {"type": "string", "description": "The knowledge item id a search hit named."},
    "document_id":    {"type": "string", "description": "Optional document id; defaults to the item's newest document."},
    "include_chunks": {"type": "boolean", "description": "Return the document's chunks as well (default true)."},
    "chunk_limit":    {"type": "integer", "minimum": 1, "maximum": 500, "description": "Maximum chunks to return (default 200)."}
  },
  "required": ["item_id"],
  "additionalProperties": false
}`)


var knowledgeWriteSchema = json.RawMessage(`{
  "type": "object",
  "properties": {
    "title":      {"type": "string", "description": "Document title. Becomes the item title."},
    "content":    {"type": "string", "description": "Markdown body to store."},
    "space_id":   {"type": "string", "description": "Target space. Omit to use the workspace's General space, created on first use."},
    "source_ref": {"type": "string", "description": "Where this came from, e.g. an issue URL. Shown as the item's source."}
  },
  "required": ["title", "content"],
  "additionalProperties": false
}`)


// Tools returns the declared tool surface with this database's capabilities
// folded in: when no embedder is wired, the hybrid/vector modes still exist as
// declared values but the call degrades to keyword, which the description says.
func (s *Service) Tools() []Tool {
	return []Tool{
		{
			Name: ToolKnowledgeSearch,
			Description: "Search the workspace knowledge base. Returns the best chunks with their source " +
				"item, document, heading path, fused RRF score and per-channel scores. Hybrid mode fuses " +
				"keyword and vector channels; when no embedding model is configured it degrades to keyword " +
				"and reports vector_degraded=true.",
			InputSchema: knowledgeSearchSchema,
		},
		{
			Name: ToolKnowledgeWrite,
			Description: "Store a document in the workspace knowledge base and return its item and document id. " +
				"Use this when a task produced something worth keeping: a conclusion, a runbook, a decision with " +
				"its reasons. The body goes through the same pipeline as an upload, so it is chunked and " +
				"searchable immediately. The note is owned by the caller.",
			InputSchema: knowledgeWriteSchema,
		},
		{
			Name: ToolKnowledgeGet,
			Description: "Read one knowledge item (and by default its document's chunks) by id. " +
				"Use the item_id from a knowledge.search hit to read the surrounding document. " +
				"An item outside the caller's workspace answers knowledge_forbidden.",
			InputSchema: knowledgeGetSchema,
		},
	}
}

// ToolInvocation is one tool call.
type ToolInvocation struct {
	Name        string
	WorkspaceID string
	ViewerID    string
	Args        json.RawMessage
}

// KnowledgeGetResult is knowledge.get's answer.
type KnowledgeGetResult struct {
	Item   Item    `json:"item"`
	Chunks []Chunk `json:"chunks,omitempty"`
}

// InvokeTool dispatches one call. An unknown tool is ErrUnknownTool, which the
// HTTP surface maps to 404 rather than 400: the tool surface is a registry, and
// asking for a name that is not in it is a routing miss.
func (s *Service) InvokeTool(ctx context.Context, inv ToolInvocation) (any, error) {
	switch inv.Name {
	case ToolKnowledgeSearch:
		return s.invokeSearch(ctx, inv)
	case ToolKnowledgeGet:
		return s.invokeGet(ctx, inv)
	case ToolKnowledgeWrite:
		return s.invokeWrite(ctx, inv)
	}
	return nil, fmt.Errorf("%w: %s", ErrUnknownTool, inv.Name)
}

// ErrUnknownTool is returned for a name that is not in Tools().
var ErrUnknownTool = errors.New("knowledge: unknown tool")

func (s *Service) invokeSearch(ctx context.Context, inv ToolInvocation) (RetrieveResult, error) {
	var args struct {
		Query          string  `json:"query"`
		TopK           int     `json:"top_k"`
		Mode           string  `json:"mode"`
		SpaceID        string  `json:"space_id"`
		ScoreThreshold float64 `json:"score_threshold"`
		Rerank         bool    `json:"rerank"`
	}
	if err := decodeToolArgs(inv.Args, &args); err != nil {
		return RetrieveResult{}, err
	}
	return s.Retrieve(ctx, RetrieveInput{
		WorkspaceID:    inv.WorkspaceID,
		ViewerID:       inv.ViewerID,
		Query:          args.Query,
		SpaceID:        args.SpaceID,
		Mode:           args.Mode,
		TopK:           args.TopK,
		ScoreThreshold: args.ScoreThreshold,
		Rerank:         args.Rerank,
	})
}

// invokeWrite stores one document and answers with what it became.
//
// The owner is the caller, so the note is theirs in the same sense a comment is:
// the ACL rules that decide who can read it need no special case for agent-authored
// content.
func (s *Service) invokeWrite(ctx context.Context, inv ToolInvocation) (WriteResult, error) {
	var args struct {
		Title     string `json:"title"`
		Content   string `json:"content"`
		SpaceID   string `json:"space_id"`
		SourceRef string `json:"source_ref"`
	}
	if err := decodeToolArgs(inv.Args, &args); err != nil {
		return WriteResult{}, err
	}
	if strings.TrimSpace(args.Title) == "" {
		return WriteResult{}, fmt.Errorf("%w: title is required", ErrInvalidField)
	}
	return s.WriteDocument(ctx, WriteRequest{
		WorkspaceID: inv.WorkspaceID,
		OwnerID:     inv.ViewerID,
		SpaceID:     args.SpaceID,
		Title:       args.Title,
		Content:     args.Content,
		SourceRef:   args.SourceRef,
	})
}

func (s *Service) invokeGet(ctx context.Context, inv ToolInvocation) (KnowledgeGetResult, error) {
	var args struct {
		ItemID        string `json:"item_id"`
		DocumentID    string `json:"document_id"`
		IncludeChunks *bool  `json:"include_chunks"`
		ChunkLimit    int    `json:"chunk_limit"`
	}
	if err := decodeToolArgs(inv.Args, &args); err != nil {
		return KnowledgeGetResult{}, err
	}
	if strings.TrimSpace(args.ItemID) == "" {
		return KnowledgeGetResult{}, fmt.Errorf("%w: item_id is required", ErrInvalidField)
	}
	item, err := s.GetItemForViewer(ctx, inv.WorkspaceID, inv.ViewerID, args.ItemID)
	if err != nil {
		return KnowledgeGetResult{}, err
	}
	result := KnowledgeGetResult{Item: item}
	includeChunks := args.IncludeChunks == nil || *args.IncludeChunks
	if !includeChunks {
		return result, nil
	}
	documentID := strings.TrimSpace(args.DocumentID)
	if documentID == "" {
		// The newest document of the item: the one an import just wrote.
		documentID, err = s.latestDocumentID(ctx, inv.WorkspaceID, item.ID)
		if err != nil {
			return KnowledgeGetResult{}, err
		}
		if documentID == "" {
			return result, nil
		}
	}
	chunks, err := s.ListChunks(ctx, inv.WorkspaceID, documentID, args.ChunkLimit)
	if err != nil {
		return KnowledgeGetResult{}, err
	}
	result.Chunks = chunks
	return result, nil
}

// latestDocumentID returns the highest-version document of item, or "" when the
// item has none (an item can exist before its first parse).
func (s *Service) latestDocumentID(ctx context.Context, workspaceID, itemID string) (string, error) {
	var id string
	err := s.db.QueryRow(ctx, `
		SELECT id::text
		FROM knowledge_documents
		WHERE workspace_id = $1 AND item_id::text = $2
		ORDER BY version DESC
		LIMIT 1`, workspaceID, itemID).Scan(&id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", nil
		}
		return "", fmt.Errorf("read latest knowledge document: %w", err)
	}
	return id, nil
}

// decodeToolArgs rejects an empty or malformed argument object loudly: a tool
// call with the wrong shape must not silently become a default query.
func decodeToolArgs(raw json.RawMessage, dst any) error {
	if len(raw) == 0 {
		return fmt.Errorf("%w: arguments are required", ErrInvalidField)
	}
	decoder := json.NewDecoder(strings.NewReader(string(raw)))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(dst); err != nil {
		return fmt.Errorf("%w: %v", ErrInvalidField, err)
	}
	return nil
}
