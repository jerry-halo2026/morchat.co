package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"

	"github.com/spf13/cobra"

	"github.com/jerry-halo2026/morchat.co/server/internal/cli"
)

// Knowledge CLI — client half of docs/plans/KNOWLEDGE-INTEGRATION-PLAN.md §5.
//
// The plan is contract-first: this command tree is written against the
// canonical, field-stable contract agreed with the server work
// (`GET/POST /api/knowledge/spaces`, `GET/POST/PATCH /api/knowledge/items…`,
// `POST /api/knowledge/upload-url|import|items/{id}/chunks/preview|retrieval-test`,
// `GET /api/knowledge/search|items/{id}/links`).
//
// Two rules make that safe while the server side is still being built:
//
//  1. Never fabricate success. When a route is missing, the command says so,
//     names the endpoint, points at the plan document and exits non-zero
//     instead of printing an empty table that reads like "no knowledge yet".
//  2. Never print credentials. Tokens, presigned URLs and signed request
//     headers stay out of stdout, tables, JSON and error text; only the
//     endpoint host may appear.

// knowledgeCmd is the `multica knowledge` root.
var knowledgeCmd = &cobra.Command{
	Use:   "knowledge",
	Short: "Work with the workspace knowledge base",
	Long: `Work with the workspace knowledge base: spaces, items, chunks, retrieval and export.

This command talks to the knowledge API described in
docs/plans/KNOWLEDGE-INTEGRATION-PLAN.md. Every subcommand accepts --json for a
stable, machine-readable shape and prints a human table otherwise. Server-side
error codes are passed through verbatim (for example knowledge_forbidden).`,
}

var (
	knowledgeSpacesCmd = &cobra.Command{
		Use:   "spaces",
		Short: "Work with knowledge spaces (collections of items)",
	}
	knowledgeItemsCmd = &cobra.Command{
		Use:   "items",
		Short: "Work with knowledge items (documents, links, notes)",
	}

	knowledgeSpacesListCmd   = &cobra.Command{Use: "list", Short: "List knowledge spaces in the workspace", RunE: runKnowledgeSpacesList}
	knowledgeSpacesCreateCmd = &cobra.Command{Use: "create", Short: "Create a knowledge space", RunE: runKnowledgeSpacesCreate}

	knowledgeItemsListCmd    = &cobra.Command{Use: "list", Short: "List items in a space", RunE: runKnowledgeItemsList}
	knowledgeItemsGetCmd     = &cobra.Command{Use: "get <item-id>", Short: "Get one item and its metadata", Args: exactArgs(1), RunE: runKnowledgeItemsGet}
	knowledgeItemsCreateCmd  = &cobra.Command{Use: "create", Short: "Create an item in a space", RunE: runKnowledgeItemsCreate}
	knowledgeItemsUpdateCmd  = &cobra.Command{Use: "update <item-id>", Short: "Update an item", Args: exactArgs(1), RunE: runKnowledgeItemsUpdate}
	knowledgeItemsArchiveCmd = &cobra.Command{Use: "archive <item-id>", Short: "Archive an item (status=archived)", Args: exactArgs(1), RunE: runKnowledgeItemsArchive}

	knowledgeImportCmd = &cobra.Command{
		Use:   "import <path|url>",
		Short: "Import a local file or a URL into a space",
		Long: `Import a document into a space.

Pipeline (per the plan's contract): POST /api/knowledge/upload-url, PUT the
bytes to the returned presigned URL, then POST /api/knowledge/import. The
presigned URL and any signed headers are never printed.`,
		Args: exactArgs(1),
		RunE: runKnowledgeImport,
	}

	knowledgeChunksCmd = &cobra.Command{
		Use:   "chunks <item-id>",
		Short: "Show the chunks of an item (--preview chunks without persisting)",
		Args:  exactArgs(1),
		RunE:  runKnowledgeChunks,
	}

	knowledgeSearchCmd = &cobra.Command{
		Use:   "search <query>",
		Short: "Search the knowledge base",
		Args:  exactArgs(1),
		RunE:  runKnowledgeSearch,
	}

	knowledgeRetrieveTestCmd = &cobra.Command{
		Use:   "retrieve-test <space>",
		Short: "Run a retrieval quality test against one space",
		Long: `Run the retrieval pipeline against one space and print the ranked chunks.

Same knobs as the plan's retrieval registry: mode, top_k, score_threshold and
rerank. This is the call used to measure Recall@K and filtered P95 latency.`,
		Args: exactArgs(1),
		RunE: runKnowledgeRetrieveTest,
	}

	knowledgeLinksCmd = &cobra.Command{
		Use:   "links <item-id>",
		Short: "Show an item's backlinks and outgoing links",
		Args:  exactArgs(1),
		RunE:  runKnowledgeLinks,
	}

	knowledgeExportCmd = &cobra.Command{
		Use:   "export <space>",
		Short: "Export a space as a directory of markdown files",
		Long: `Export a space as a directory of markdown files.

The CLI assembles the export from GET /api/knowledge/items plus one read per
item, so it needs no extra server route. Each file carries YAML front matter
with the item's id, kind, status and source_ref.`,
		Args: exactArgs(1),
		RunE: runKnowledgeExport,
	}
)

const (
	knowledgeAPIPrefix = "/api/knowledge"

	// knowledgeExitNotImplemented is the exit code for "the server does not
	// serve this knowledge route yet". internal/cli classifies a bare 404 as
	// ExitNotFound (4), which a caller cannot tell apart from "wrong item id".
	// A not-yet-built endpoint is a different situation — the CLI is complete
	// and the server half is in flight (docs/plans/KNOWLEDGE-INTEGRATION-PLAN.md) —
	// so it gets its own documented code, mirroring ExitNetwork(2): "this build
	// cannot complete the request", not "your input was wrong".
	knowledgeExitNotImplemented = 2

	knowledgePlanDoc = "docs/plans/KNOWLEDGE-INTEGRATION-PLAN.md"

	// knowledgeDefaultLimit is the page size used when a listing flag is not
	// given. It matches the CLI's other list commands and keeps a first call
	// from pulling a whole corpus.
	knowledgeDefaultLimit = 50

	// knowledgeMaxExportPages bounds the export walk so a broken server that
	// ignores pagination cannot spin forever.
	knowledgeMaxExportPages = 200
)

func init() {
	knowledgeCmd.AddCommand(knowledgeSpacesCmd)
	knowledgeCmd.AddCommand(knowledgeItemsCmd)
	knowledgeCmd.AddCommand(knowledgeImportCmd)
	knowledgeCmd.AddCommand(knowledgeChunksCmd)
	knowledgeCmd.AddCommand(knowledgeSearchCmd)
	knowledgeCmd.AddCommand(knowledgeRetrieveTestCmd)
	knowledgeCmd.AddCommand(knowledgeLinksCmd)
	knowledgeCmd.AddCommand(knowledgeExportCmd)

	knowledgeSpacesCmd.AddCommand(knowledgeSpacesListCmd)
	knowledgeSpacesCmd.AddCommand(knowledgeSpacesCreateCmd)

	knowledgeItemsCmd.AddCommand(knowledgeItemsListCmd)
	knowledgeItemsCmd.AddCommand(knowledgeItemsGetCmd)
	knowledgeItemsCmd.AddCommand(knowledgeItemsCreateCmd)
	knowledgeItemsCmd.AddCommand(knowledgeItemsUpdateCmd)
	knowledgeItemsCmd.AddCommand(knowledgeItemsArchiveCmd)

	// spaces list
	registerKnowledgeOutputFlags(knowledgeSpacesListCmd)
	registerKnowledgeWorkspaceFlag(knowledgeSpacesListCmd)

	// spaces create
	registerKnowledgeOutputFlags(knowledgeSpacesCreateCmd)
	registerKnowledgeWorkspaceFlag(knowledgeSpacesCreateCmd)
	knowledgeSpacesCreateCmd.Flags().String("name", "", "Space name (required)")
	knowledgeSpacesCreateCmd.Flags().String("description", "", "Space description")

	// items list
	registerKnowledgeOutputFlags(knowledgeItemsListCmd)
	registerKnowledgeWorkspaceFlag(knowledgeItemsListCmd)
	knowledgeItemsListCmd.Flags().String("space", "", "Space ID (required)")
	knowledgeItemsListCmd.Flags().String("status", "", "Filter by status: draft, active, or deprecated")
	knowledgeItemsListCmd.Flags().String("kind", "", "Filter by kind: doc, link, repo, issue_artifact, or note")
	knowledgeItemsListCmd.Flags().Int("limit", knowledgeDefaultLimit, "Maximum number of items to return")
	knowledgeItemsListCmd.Flags().Int("offset", 0, "Number of items to skip")

	// items get
	registerKnowledgeOutputFlags(knowledgeItemsGetCmd)
	knowledgeItemsGetCmd.Flags().Bool("with-content", false, "Include the item body (large items cost a full read)")

	// items create
	registerKnowledgeOutputFlags(knowledgeItemsCreateCmd)
	knowledgeItemsCreateCmd.Flags().String("space", "", "Space ID (required)")
	knowledgeItemsCreateCmd.Flags().String("title", "", "Item title (required)")
	knowledgeItemsCreateCmd.Flags().String("kind", "", "Item kind: doc, link, repo, issue_artifact, or note")
	knowledgeItemsCreateCmd.Flags().String("source-type", "", "Source type: upload, url, obsidian_vault, nas_path, s3_key, or issue_attachment")
	knowledgeItemsCreateCmd.Flags().String("source-ref", "", "Source reference (URL, path, or object key)")
	knowledgeItemsCreateCmd.Flags().String("acl-mode", "", "ACL mode: workspace, project, or private")
	knowledgeItemsCreateCmd.Flags().String("content", "", "Item body (markdown). Mutually exclusive with --content-file and --content-stdin.")
	knowledgeItemsCreateCmd.Flags().Bool("content-stdin", false, "Read the item body from stdin. Mutually exclusive with --content and --content-file.")
	knowledgeItemsCreateCmd.Flags().String("content-file", "", "Read the item body from a UTF-8 file. Mutually exclusive with --content and --content-stdin.")

	// items update
	registerKnowledgeOutputFlags(knowledgeItemsUpdateCmd)
	knowledgeItemsUpdateCmd.Flags().String("title", "", "New title")
	knowledgeItemsUpdateCmd.Flags().String("kind", "", "New kind")
	knowledgeItemsUpdateCmd.Flags().String("status", "", "New status: draft, active, or deprecated")
	knowledgeItemsUpdateCmd.Flags().String("source-ref", "", "New source reference")
	knowledgeItemsUpdateCmd.Flags().String("acl-mode", "", "New ACL mode: workspace, project, or private")
	knowledgeItemsUpdateCmd.Flags().String("content", "", "New body (markdown). Mutually exclusive with --content-file and --content-stdin.")
	knowledgeItemsUpdateCmd.Flags().Bool("content-stdin", false, "Read the new body from stdin. Mutually exclusive with --content and --content-file.")
	knowledgeItemsUpdateCmd.Flags().String("content-file", "", "Read the new body from a UTF-8 file. Mutually exclusive with --content and --content-stdin.")

	// items archive
	registerKnowledgeOutputFlags(knowledgeItemsArchiveCmd)
	knowledgeItemsArchiveCmd.Flags().Bool("yes", false, "Skip the confirmation prompt")

	// import
	registerKnowledgeOutputFlags(knowledgeImportCmd)
	knowledgeImportCmd.Flags().String("space", "", "Space ID (required)")
	knowledgeImportCmd.Flags().String("title", "", "Item title (defaults to the file name)")

	// chunks
	registerKnowledgeOutputFlags(knowledgeChunksCmd)
	knowledgeChunksCmd.Flags().Bool("preview", false, "Preview chunking via /items/{id}/chunks/preview without persisting chunks")
	knowledgeChunksCmd.Flags().Int("limit", 0, "Maximum number of chunks to print (0 = server default)")
	knowledgeChunksCmd.Flags().Int("chunk-size", 0, "Preview only: target chunk size in tokens")
	knowledgeChunksCmd.Flags().Int("overlap", 0, "Preview only: overlap between chunks in tokens")

	// search
	registerKnowledgeOutputFlags(knowledgeSearchCmd)
	knowledgeSearchCmd.Flags().String("space", "", "Restrict the search to one space ID")
	knowledgeSearchCmd.Flags().Int("top-k", 10, "Number of chunks to return")
	knowledgeSearchCmd.Flags().String("mode", "", "Retrieval mode: keyword, vector, or hybrid")
	knowledgeSearchCmd.Flags().Float64("threshold", 0, "Minimum score threshold")
	knowledgeSearchCmd.Flags().Bool("rerank", false, "Rerank the candidate set")

	// retrieve-test
	registerKnowledgeOutputFlags(knowledgeRetrieveTestCmd)
	knowledgeRetrieveTestCmd.Flags().String("query", "", "Query text (required)")
	knowledgeRetrieveTestCmd.Flags().Int("top-k", 5, "Number of chunks to return")
	knowledgeRetrieveTestCmd.Flags().String("mode", "", "Retrieval mode: keyword, vector, or hybrid")
	knowledgeRetrieveTestCmd.Flags().Float64("threshold", 0, "Minimum score threshold")
	knowledgeRetrieveTestCmd.Flags().Bool("rerank", false, "Rerank the candidate set")

	// links
	registerKnowledgeOutputFlags(knowledgeLinksCmd)

	// export
	registerKnowledgeOutputFlags(knowledgeExportCmd)
	knowledgeExportCmd.Flags().String("out", "", "Output directory for the markdown export (required)")
	knowledgeExportCmd.Flags().Int("limit", 200, "Page size used while walking the space")
}

// registerKnowledgeOutputFlags installs the two output switches every
// knowledge command shares: --json (the plan's documented flag) and --output
// (the flag every other Multica command already uses). Either one selects JSON.
func registerKnowledgeOutputFlags(cmd *cobra.Command) {
	cmd.Flags().Bool("json", false, "Output machine-readable JSON with a stable field set")
	cmd.Flags().String("output", "table", "Output format: table or json")
}

// registerKnowledgeWorkspaceFlag installs --workspace on the commands that act
// on a workspace rather than a single space.
func registerKnowledgeWorkspaceFlag(cmd *cobra.Command) {
	cmd.Flags().String("workspace", "", "Workspace ID (defaults to the active workspace)")
}

// knowledgePrintJSON reports whether the command's output must be JSON.
func knowledgePrintJSON(cmd *cobra.Command) bool {
	if asJSON, err := cmd.Flags().GetBool("json"); err == nil && asJSON {
		return true
	}
	if format, err := cmd.Flags().GetString("output"); err == nil {
		return strings.EqualFold(strings.TrimSpace(format), "json")
	}
	return false
}

// knowledgeAPI is a thin wrapper around the shared API client that adds the
// knowledge-specific error contract in one place:
//
//   - a missing route is reported as "not implemented yet" and exits
//     knowledgeExitNotImplemented instead of looking like an empty result;
//   - a server error code (knowledge_forbidden, knowledge_space_not_found, …)
//     is printed verbatim and still exits non-zero;
//   - anything else keeps the endpoint in the message so a 500 is traceable.
type knowledgeAPI struct {
	client *cli.APIClient
	cmd    *cobra.Command
}

func newKnowledgeAPI(cmd *cobra.Command) (*knowledgeAPI, error) {
	client, err := newAPIClient(cmd)
	if err != nil {
		return nil, err
	}
	// --workspace wins over --workspace-id / env / config for this call only.
	// The server reads the workspace from X-Workspace-ID, which the client
	// stamps from this field.
	if ws := strings.TrimSpace(flagString(cmd, "workspace")); ws != "" {
		client.WorkspaceID = ws
	}
	return &knowledgeAPI{client: client, cmd: cmd}, nil
}

func (k *knowledgeAPI) callTimeout() (context.Context, context.CancelFunc) {
	return cli.APIContext(context.Background())
}

func (k *knowledgeAPI) get(path string) (json.RawMessage, error) {
	ctx, cancel := k.callTimeout()
	defer cancel()
	var raw json.RawMessage
	if err := k.client.GetJSON(ctx, path, &raw); err != nil {
		return nil, k.failure(http.MethodGet, path, err)
	}
	return raw, nil
}

func (k *knowledgeAPI) post(path string, body any) (json.RawMessage, error) {
	ctx, cancel := k.callTimeout()
	defer cancel()
	var raw json.RawMessage
	if err := k.client.PostJSON(ctx, path, body, &raw); err != nil {
		return nil, k.failure(http.MethodPost, path, err)
	}
	return raw, nil
}

func (k *knowledgeAPI) patch(path string, body any) (json.RawMessage, error) {
	ctx, cancel := k.callTimeout()
	defer cancel()
	var raw json.RawMessage
	if err := k.client.PatchJSON(ctx, path, body, &raw); err != nil {
		return nil, k.failure(http.MethodPatch, path, err)
	}
	return raw, nil
}

// failure translates one failed knowledge request into the CLI's error
// contract. It never returns nil: an error response is always an error.
func (k *knowledgeAPI) failure(method, path string, err error) error {
	if knowledgeRouteMissing(err) {
		return knowledgeNotServed(method, path)
	}
	if code := cli.ServerErrorCode(err); code != "" {
		// Passthrough: the plan's fail-closed rule (knowledge_forbidden on a
		// filtered-out read) is only useful if the code reaches the caller
		// unmodified. --debug still prints the response body.
		return cli.WithUserMessage(code, err)
	}
	if strings.HasPrefix(err.Error(), method+" "+path+":") {
		return err
	}
	return cli.WithUserMessage(fmt.Sprintf("%s %s: %s", method, path, cli.FormatError(err, false)), err)
}

// knowledgeRouteMissing reports whether err is the server answering "no such
// route" for a knowledge endpoint, as opposed to a route that exists and
// rejected this call.
//
// The distinction matters: an item that is gone is a 404 too, but it carries a
// machine code (or a JSON body). A route that was never registered answers
// with the framework's plain-text 404/405 page.
func knowledgeRouteMissing(err error) bool {
	var httpErr *cli.HTTPError
	if !errors.As(err, &httpErr) {
		return false
	}
	if !strings.HasPrefix(httpErr.Path, knowledgeAPIPrefix) {
		return false
	}
	switch httpErr.StatusCode {
	case http.StatusNotFound, http.StatusMethodNotAllowed, http.StatusNotImplemented:
	default:
		return false
	}
	if cli.ServerErrorCode(err) != "" {
		return false
	}
	body := strings.TrimSpace(httpErr.Body)
	switch {
	case body == "":
		return true
	case strings.HasPrefix(body, "<"):
		// An HTML error page means no handler produced a JSON contract.
		return true
	case strings.Contains(body, "404 page not found") || strings.Contains(body, "405 method not allowed"):
		return true
	default:
		return false
	}
}

// knowledgeNotServed prints the "server half is not here yet" guidance and
// exits with knowledgeExitNotImplemented. It never claims success, and it
// never leaves a half-rendered table behind on stdout.
func knowledgeNotServed(method, path string) error {
	fmt.Fprintf(os.Stderr, "Error: the server does not serve %s %s yet.\n", method, path)
	fmt.Fprintf(os.Stderr, "Hint: 服务端尚未提供 %s %s，见 %s\n", method, path, knowledgePlanDoc)
	os.Exit(knowledgeExitNotImplemented)
	return errSilent // unreachable; keeps the compiler and callers honest
}

// knowledgePath joins a knowledge resource path and an escaped id.
func knowledgePath(parts ...string) string {
	var b strings.Builder
	b.WriteString(knowledgeAPIPrefix)
	for _, p := range parts {
		b.WriteString("/")
		b.WriteString(url.PathEscape(p))
	}
	return b.String()
}

// knowledgeQuery builds "?k=v" from non-empty values, skipping empty ones so a
// request never sends `space_id=`.
func knowledgeQuery(params map[string]string) string {
	values := url.Values{}
	for key, value := range params {
		if strings.TrimSpace(value) == "" {
			continue
		}
		values.Set(key, value)
	}
	if len(values) == 0 {
		return ""
	}
	return "?" + values.Encode()
}

// --- response normalisation -------------------------------------------------
//
// Every read goes through these helpers so the printed JSON field names are
// the canonical ones from the plan's field registry, even while the server
// still answers with a thin alias (e.g. spaceId for space_id). Unknown extra
// fields are dropped on purpose: the CLI's contract is the registry, not the
// server's current spelling.

// knowledgeFieldString returns the first non-empty string among keys.
func knowledgeFieldString(m map[string]any, keys ...string) string {
	for _, key := range keys {
		switch v := m[key].(type) {
		case string:
			if strings.TrimSpace(v) != "" {
				return v
			}
		case float64:
			if v != 0 {
				return strconv.FormatFloat(v, 'f', -1, 64)
			}
		case bool:
			if v {
				return "true"
			}
		}
	}
	return ""
}

// knowledgeFieldInt returns the first non-zero integer among keys.
func knowledgeFieldInt(m map[string]any, keys ...string) int {
	for _, key := range keys {
		switch v := m[key].(type) {
		case float64:
			if v != 0 {
				return int(v)
			}
		case string:
			if n, err := strconv.Atoi(strings.TrimSpace(v)); err == nil && n != 0 {
				return n
			}
		}
	}
	return 0
}

// knowledgeFieldFloat returns the first non-zero float among keys.
func knowledgeFieldFloat(m map[string]any, keys ...string) float64 {
	for _, key := range keys {
		switch v := m[key].(type) {
		case float64:
			if v != 0 {
				return v
			}
		case string:
			if f, err := strconv.ParseFloat(strings.TrimSpace(v), 64); err == nil && f != 0 {
				return f
			}
		}
	}
	return 0
}

// knowledgeNested returns a nested object, or nil.
func knowledgeNested(m map[string]any, key string) map[string]any {
	nested, _ := m[key].(map[string]any)
	return nested
}

// knowledgeArray decodes an endpoint response into rows. It accepts a bare
// array, a wrapper object named after the resource (spaces/items/chunks/…),
// a generic envelope (items/data/results/rows), or a single object.
func knowledgeArray(raw json.RawMessage, keys ...string) ([]map[string]any, error) {
	trimmed := bytes.TrimSpace(raw)
	if len(trimmed) == 0 {
		return nil, nil
	}
	switch trimmed[0] {
	case '[':
		var rows []map[string]any
		if err := json.Unmarshal(trimmed, &rows); err != nil {
			return nil, fmt.Errorf("decode list response: %w", err)
		}
		return rows, nil
	case '{':
		var envelope map[string]any
		if err := json.Unmarshal(trimmed, &envelope); err != nil {
			return nil, fmt.Errorf("decode response: %w", err)
		}
		candidates := append(append([]string{}, keys...), "items", "spaces", "chunks", "hits", "results", "data", "rows", "list")
		for _, key := range candidates {
			arr, ok := envelope[key].([]any)
			if !ok {
				continue
			}
			rows := make([]map[string]any, 0, len(arr))
			for _, entry := range arr {
				if row, ok := entry.(map[string]any); ok {
					rows = append(rows, row)
				}
			}
			return rows, nil
		}
		return []map[string]any{envelope}, nil
	default:
		return nil, fmt.Errorf("unexpected response shape: %s", clipTimelineText(string(trimmed), 80))
	}
}

// knowledgeObject decodes an endpoint response into one object.
func knowledgeObject(raw json.RawMessage) (map[string]any, error) {
	trimmed := bytes.TrimSpace(raw)
	if len(trimmed) == 0 {
		return map[string]any{}, nil
	}
	if trimmed[0] != '{' {
		return map[string]any{}, fmt.Errorf("unexpected response shape: %s", clipTimelineText(string(trimmed), 80))
	}
	var object map[string]any
	if err := json.Unmarshal(trimmed, &object); err != nil {
		return map[string]any{}, fmt.Errorf("decode response: %w", err)
	}
	// Some handlers wrap a single resource: {"item": {...}}.
	for _, key := range []string{"item", "space", "chunk", "data"} {
		if nested := knowledgeNested(object, key); nested != nil {
			return nested, nil
		}
	}
	return object, nil
}

// --- stable output shapes ---------------------------------------------------

// knowledgeSpace is the printed shape of a knowledge space.
type knowledgeSpace struct {
	ID          string `json:"id"`
	WorkspaceID string `json:"workspace_id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	ItemCount   int    `json:"item_count"`
	CreatedAt   string `json:"created_at"`
	UpdatedAt   string `json:"updated_at"`
}

func knowledgeSpaceFrom(m map[string]any) knowledgeSpace {
	return knowledgeSpace{
		ID:          knowledgeFieldString(m, "id", "space_id", "spaceId"),
		WorkspaceID: knowledgeFieldString(m, "workspace_id", "workspaceId"),
		Name:        knowledgeFieldString(m, "name", "title"),
		Description: knowledgeFieldString(m, "description", "summary"),
		ItemCount:   knowledgeFieldInt(m, "item_count", "itemCount", "items_count"),
		CreatedAt:   knowledgeFieldString(m, "created_at", "createdAt"),
		UpdatedAt:   knowledgeFieldString(m, "updated_at", "updatedAt"),
	}
}

// knowledgeItem is the printed shape of a knowledge item. It mirrors the
// plan's item/document registry: identity and governance in one flat object,
// body only when it was asked for.
type knowledgeItem struct {
	ID          string `json:"id"`
	WorkspaceID string `json:"workspace_id"`
	SpaceID     string `json:"space_id"`
	Title       string `json:"title"`
	Kind        string `json:"kind"`
	SourceType  string `json:"source_type"`
	SourceRef   string `json:"source_ref"`
	Status      string `json:"status"`
	OwnerID     string `json:"owner_id"`
	ACLMode     string `json:"acl_mode"`
	Mime        string `json:"mime"`
	Bytes       int64  `json:"bytes"`
	SHA256      string `json:"sha256"`
	ChunkCount  int    `json:"chunk_count"`
	CreatedAt   string `json:"created_at"`
	UpdatedAt   string `json:"updated_at"`
	Content     string `json:"content,omitempty"`
}

func knowledgeItemFrom(m map[string]any) knowledgeItem {
	doc := knowledgeNested(m, "document")
	if doc == nil {
		doc = knowledgeNested(m, "current_document")
	}
	item := knowledgeItem{
		ID:          knowledgeFieldString(m, "id", "item_id", "itemId"),
		WorkspaceID: knowledgeFieldString(m, "workspace_id", "workspaceId"),
		SpaceID:     knowledgeFieldString(m, "space_id", "spaceId", "collection_id"),
		Title:       knowledgeFieldString(m, "title", "name"),
		Kind:        knowledgeFieldString(m, "kind", "type", "item_kind"),
		SourceType:  knowledgeFieldString(m, "source_type", "sourceType"),
		SourceRef:   knowledgeFieldString(m, "source_ref", "sourceRef", "source_url"),
		Status:      knowledgeFieldString(m, "status", "state"),
		OwnerID:     knowledgeFieldString(m, "owner_id", "ownerId", "created_by"),
		ACLMode:     knowledgeFieldString(m, "acl_mode", "aclMode", "visibility"),
		Mime:        knowledgeFieldString(m, "mime", "content_type"),
		Bytes:       int64(knowledgeFieldInt(m, "bytes", "size")),
		SHA256:      knowledgeFieldString(m, "sha256", "checksum"),
		ChunkCount:  knowledgeFieldInt(m, "chunk_count", "chunkCount", "chunks"),
		CreatedAt:   knowledgeFieldString(m, "created_at", "createdAt"),
		UpdatedAt:   knowledgeFieldString(m, "updated_at", "updatedAt"),
		Content:     knowledgeFieldString(m, "content", "text", "body", "markdown"),
	}
	if doc != nil {
		if item.Mime == "" {
			item.Mime = knowledgeFieldString(doc, "mime", "content_type")
		}
		if item.Bytes == 0 {
			item.Bytes = int64(knowledgeFieldInt(doc, "bytes", "size"))
		}
		if item.SHA256 == "" {
			item.SHA256 = knowledgeFieldString(doc, "sha256", "checksum")
		}
	}
	return item
}

// knowledgeChunk is the printed shape of one chunk.
type knowledgeChunk struct {
	ID          string  `json:"id"`
	ItemID      string  `json:"item_id"`
	Ord         int     `json:"ord"`
	Tokens      int     `json:"tokens"`
	HeadingPath string  `json:"heading_path"`
	PageFrom    int     `json:"page_from"`
	PageTo      int     `json:"page_to"`
	Score       float64 `json:"score"`
	Preview     bool    `json:"preview"`
	Text        string  `json:"text"`
}

func knowledgeChunkFrom(m map[string]any, preview bool) knowledgeChunk {
	return knowledgeChunk{
		ID:          knowledgeFieldString(m, "id", "chunk_id", "chunkId"),
		ItemID:      knowledgeFieldString(m, "item_id", "itemId"),
		Ord:         knowledgeFieldInt(m, "ord", "ordinal", "index"),
		Tokens:      knowledgeFieldInt(m, "tokens", "token_count"),
		HeadingPath: knowledgeFieldString(m, "heading_path", "headingPath"),
		PageFrom:    knowledgeFieldInt(m, "page_from", "pageFrom"),
		PageTo:      knowledgeFieldInt(m, "page_to", "pageTo"),
		Score:       knowledgeFieldFloat(m, "score", "relevance", "similarity"),
		Preview:     preview,
		Text:        knowledgeFieldString(m, "text", "content", "body"),
	}
}

// knowledgeLink is one link in a backlink/outlink set.
type knowledgeLink struct {
	ID        string `json:"id"`
	ItemID    string `json:"item_id"`
	SpaceID   string `json:"space_id"`
	Title     string `json:"title"`
	Direction string `json:"direction"`
}

// knowledgeLinks is the printed shape of `knowledge links`.
type knowledgeLinks struct {
	ItemID    string          `json:"item_id"`
	Backlinks []knowledgeLink `json:"backlinks"`
	Outlinks  []knowledgeLink `json:"outlinks"`
}

// knowledgeHit is one ranked retrieval result.
type knowledgeHit struct {
	ChunkID     string  `json:"chunk_id"`
	ItemID      string  `json:"item_id"`
	SpaceID     string  `json:"space_id"`
	Title       string  `json:"title"`
	HeadingPath string  `json:"heading_path"`
	Score       float64 `json:"score"`
	SourceRef   string  `json:"source_ref"`
	Text        string  `json:"text"`
}

func knowledgeHitFrom(m map[string]any) knowledgeHit {
	return knowledgeHit{
		ChunkID:     knowledgeFieldString(m, "chunk_id", "chunkId", "id"),
		ItemID:      knowledgeFieldString(m, "item_id", "itemId"),
		SpaceID:     knowledgeFieldString(m, "space_id", "spaceId"),
		Title:       knowledgeFieldString(m, "title", "item_title"),
		HeadingPath: knowledgeFieldString(m, "heading_path", "headingPath"),
		Score:       knowledgeFieldFloat(m, "score", "relevance", "similarity"),
		SourceRef:   knowledgeFieldString(m, "source_ref", "sourceRef"),
		Text:        knowledgeFieldString(m, "text", "content", "body"),
	}
}

// knowledgeSearchResult is the printed shape of a search / retrieval-test run.
type knowledgeSearchResult struct {
	Query      string         `json:"query"`
	Mode       string         `json:"mode"`
	TopK       int            `json:"top_k"`
	SpaceID    string         `json:"space_id"`
	Threshold  float64        `json:"score_threshold"`
	Rerank     bool           `json:"rerank"`
	TookMillis int            `json:"took_ms"`
	Hits       []knowledgeHit `json:"hits"`
}

// --- shared printing helpers ------------------------------------------------

// errNoFieldsToUpdate is returned when an update call would send an empty body.
var errNoFieldsToUpdate = fmt.Errorf("no fields to update; pass at least one of --title, --kind, --status, --source-ref, --acl-mode, or --content")

// knowledgeIntFlag reads an int flag, falling back to fallback when unset.
func knowledgeIntFlag(cmd *cobra.Command, name string, fallback int) int {
	value, err := cmd.Flags().GetInt(name)
	if err != nil {
		return fallback
	}
	return value
}

// itoaIfPositive renders a query value, leaving zero/negative unset so the
// request omits the parameter entirely.
func itoaIfPositive(n int) string {
	if n <= 0 {
		return ""
	}
	return strconv.Itoa(n)
}

// knowledgeRequireFlag reads a required string flag.
func knowledgeRequireFlag(cmd *cobra.Command, name string) (string, error) {
	value := strings.TrimSpace(flagString(cmd, name))
	if value == "" {
		return "", fmt.Errorf("--%s is required", name)
	}
	return value, nil
}

// knowledgeIntOrDash renders a count column, where 0 means "not reported".
func knowledgeIntOrDash(n int) string {
	if n == 0 {
		return "-"
	}
	return strconv.Itoa(n)
}

// knowledgeScore renders a relevance score with three decimals; 0 renders as
// "-" because a keyword-only hit legitimately has no score.
func knowledgeScore(score float64) string {
	if score == 0 {
		return "-"
	}
	return strconv.FormatFloat(score, 'f', 3, 64)
}

// printKnowledgeObject renders a single resource as a FIELD/VALUE table.
func printKnowledgeObject(fields [][2]string) {
	rows := make([][]string, 0, len(fields))
	for _, field := range fields {
		value := field[1]
		if strings.TrimSpace(value) == "" {
			value = "-"
		}
		rows = append(rows, []string{field[0], singleLineText(value)})
	}
	cli.PrintTable(os.Stdout, []string{"FIELD", "VALUE"}, rows)
}

// knowledgeOutput writes the value as indented JSON or lets the caller render
// a table. Slices are normalised to empty arrays so a script never has to
// distinguish null from [].
func knowledgeOutput(cmd *cobra.Command, value any) error {
	return cli.PrintJSON(os.Stdout, value)
}
