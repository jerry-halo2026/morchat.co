package knowledge

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// Store is the minimal persistence layer for the P0 knowledge domain: create and
// read an item, a document, and a chunk. Retrieval, ACL filtering and the
// distillation scheduler land in later phases (plan §8) on the same tables.
//
// The store applies the registry defaults itself instead of relying on the
// column DEFAULTs, so what a caller gets back from Create is what it would get
// from a later Get on a different connection — and so the defaults are visible
// in Go rather than buried in DDL.
type Store struct {
	db querier
}

// querier is the slice of pgx a Store needs; *pgxpool.Pool and pgx.Tx both
// satisfy it, which keeps the write→read contract test able to run inside one
// transaction.
type querier interface {
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

// NewStore returns a Store over db.
func NewStore(db querier) *Store {
	return &Store{db: db}
}

// ErrItemNotFound is returned when the item id is unknown inside the workspace.
// It is deliberately workspace-scoped: an item that exists in another workspace
// is indistinguishable from one that does not exist.
var ErrItemNotFound = errors.New("knowledge: item not found")

// ErrInvalidField wraps a value outside its registry enum, or an empty
// required field.
var ErrInvalidField = errors.New("knowledge: invalid field")

// ErrSpaceNotFound is returned when an item names a space that does not exist
// inside the item's workspace. Like ErrItemNotFound it is workspace-scoped: a
// space of another workspace is indistinguishable from one that does not exist,
// which is also what the (workspace_id, space_id) foreign key enforces in the
// DDL — the store just reports it before the write instead of after.
var ErrSpaceNotFound = errors.New("knowledge: space not found")

// NewItem is the create payload. SpaceID is required — an item belongs to
// exactly one space of its workspace (migration 621); PageID is optional. Empty
// enum fields take the registry default; ProjectID / OwnerID / PageID stay nil
// when the caller omits them.
type NewItem struct {
	WorkspaceID string
	SpaceID     string
	PageID      *string
	Title       string
	Kind        string
	SourceType  string
	SourceRef   string
	Status      string
	ACLMode     string
	ProjectID   *string
	OwnerID     *string
}

// withDefaults fills the registry defaults and validates the closed sets.
func (in NewItem) withDefaults() (NewItem, error) {
	if strings.TrimSpace(in.WorkspaceID) == "" {
		return in, fmt.Errorf("%w: workspace_id is required", ErrInvalidField)
	}
	if strings.TrimSpace(in.SpaceID) == "" {
		return in, fmt.Errorf("%w: space_id is required", ErrInvalidField)
	}
	if strings.TrimSpace(in.Title) == "" {
		return in, fmt.Errorf("%w: title is required", ErrInvalidField)
	}
	for _, field := range []struct {
		enum  *Enum
		value *string
	}{
		{&Kind, &in.Kind},
		{&SourceType, &in.SourceType},
		{&Status, &in.Status},
		{&ACLMode, &in.ACLMode},
	} {
		if *field.value == "" {
			*field.value = field.enum.Default
			continue
		}
		if !field.enum.Has(*field.value) {
			return in, fmt.Errorf("%w: %s=%q not in %v",
				ErrInvalidField, field.enum.Field, *field.value, field.enum.Values)
		}
	}
	return in, nil
}

const itemColumns = `id, workspace_id, space_id, page_id, project_id, title, kind,
	source_type, source_ref, status, owner_id, acl_mode, created_at, updated_at`

// CreateItem inserts one item and returns the row as stored, including every
// default the database or the registry filled in.
//
// space_id is validated here as well as by the DDL: the composite foreign key
// (workspace_id, space_id) is the guarantee, and this read makes the failure an
// ErrSpaceNotFound instead of a constraint violation the caller cannot classify.
func (s *Store) CreateItem(ctx context.Context, in NewItem) (Item, error) {
	in, err := in.withDefaults()
	if err != nil {
		return Item{}, err
	}
	if err := s.assertSpaceInWorkspace(ctx, in.WorkspaceID, in.SpaceID); err != nil {
		return Item{}, err
	}
	row := s.db.QueryRow(ctx, `
		INSERT INTO knowledge_items
			(workspace_id, space_id, page_id, project_id, title, kind, source_type,
			 source_ref, status, owner_id, acl_mode)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
		RETURNING `+itemColumns,
		in.WorkspaceID, in.SpaceID, in.PageID, in.ProjectID, in.Title, in.Kind,
		in.SourceType, in.SourceRef, in.Status, in.OwnerID, in.ACLMode)
	item, err := scanItem(row)
	if err != nil {
		return Item{}, fmt.Errorf("create knowledge item: %w", err)
	}
	return item, nil
}

// assertSpaceInWorkspace reports ErrSpaceNotFound unless spaceID names a space
// of workspaceID. id is compared as text so a malformed identifier is "not
// found" rather than a uuid-syntax error leaking out of the driver.
func (s *Store) assertSpaceInWorkspace(ctx context.Context, workspaceID, spaceID string) error {
	var exists bool
	if err := s.db.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM knowledge_spaces
			WHERE workspace_id = $1 AND id::text = $2
		)`, workspaceID, spaceID).Scan(&exists); err != nil {
		return fmt.Errorf("check knowledge space %s: %w", spaceID, err)
	}
	if !exists {
		return fmt.Errorf("%w: space_id=%s is not a space of workspace %s",
			ErrSpaceNotFound, spaceID, workspaceID)
	}
	return nil
}

// GetItem reads one item by id inside workspaceID.
func (s *Store) GetItem(ctx context.Context, workspaceID, itemID string) (Item, error) {
	row := s.db.QueryRow(ctx, `
		SELECT `+itemColumns+`
		FROM knowledge_items
		WHERE workspace_id = $1 AND id = $2`, workspaceID, itemID)
	item, err := scanItem(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return Item{}, ErrItemNotFound
	}
	if err != nil {
		return Item{}, fmt.Errorf("get knowledge item: %w", err)
	}
	return item, nil
}

func scanItem(row pgx.Row) (Item, error) {
	var it Item
	err := row.Scan(&it.ID, &it.WorkspaceID, &it.SpaceID, &it.PageID, &it.ProjectID,
		&it.Title, &it.Kind, &it.SourceType, &it.SourceRef, &it.Status, &it.OwnerID,
		&it.ACLMode, &it.CreatedAt, &it.UpdatedAt)
	return it, err
}

// NewDocument is the create payload for one document version of an item.
type NewDocument struct {
	WorkspaceID string
	ItemID      string
	Version     int
	Mime        string
	Bytes       int64
	SHA256      string
	StorageKey  *string
	ParseEngine string
}

const documentColumns = `id, workspace_id, item_id, version, mime, bytes, sha256, storage_key,
	parsed_at, parse_engine, generation, active_generation, created_at, updated_at`

// CreateDocument inserts one document version. Version <= 0 means "next version
// of this item", resolved in SQL so two writers cannot pick the same number.
func (s *Store) CreateDocument(ctx context.Context, in NewDocument) (Document, error) {
	if strings.TrimSpace(in.WorkspaceID) == "" || strings.TrimSpace(in.ItemID) == "" {
		return Document{}, fmt.Errorf("%w: workspace_id and item_id are required", ErrInvalidField)
	}
	if in.ParseEngine == "" {
		in.ParseEngine = ParseEngine.Default
	} else if !ParseEngine.Has(in.ParseEngine) {
		return Document{}, fmt.Errorf("%w: parse_engine=%q not in %v",
			ErrInvalidField, in.ParseEngine, ParseEngine.Values)
	}
	if in.Mime == "" {
		in.Mime = "text/markdown"
	}
	row := s.db.QueryRow(ctx, `
		INSERT INTO knowledge_documents
			(workspace_id, item_id, version, mime, bytes, sha256, storage_key, parse_engine)
		VALUES ($1, $2,
			CASE WHEN $3 > 0 THEN $3 ELSE
				COALESCE((SELECT max(version) FROM knowledge_documents WHERE item_id = $2), 0) + 1
			END,
			$4, $5, $6, $7, $8)
		RETURNING `+documentColumns,
		in.WorkspaceID, in.ItemID, in.Version, in.Mime, in.Bytes, in.SHA256,
		in.StorageKey, in.ParseEngine)
	var doc Document
	if err := row.Scan(&doc.ID, &doc.WorkspaceID, &doc.ItemID, &doc.Version, &doc.Mime,
		&doc.Bytes, &doc.SHA256, &doc.StorageKey, &doc.ParsedAt, &doc.ParseEngine,
		&doc.Generation, &doc.ActiveGeneration, &doc.CreatedAt, &doc.UpdatedAt); err != nil {
		return Document{}, fmt.Errorf("create knowledge document: %w", err)
	}
	return doc, nil
}

// GetDocument reads one document by id inside workspaceID.
func (s *Store) GetDocument(ctx context.Context, workspaceID, documentID string) (Document, error) {
	var doc Document
	err := s.db.QueryRow(ctx, `
		SELECT `+documentColumns+`
		FROM knowledge_documents
		WHERE workspace_id = $1 AND id = $2`, workspaceID, documentID).Scan(
		&doc.ID, &doc.WorkspaceID, &doc.ItemID, &doc.Version, &doc.Mime, &doc.Bytes,
		&doc.SHA256, &doc.StorageKey, &doc.ParsedAt, &doc.ParseEngine, &doc.Generation,
		&doc.ActiveGeneration, &doc.CreatedAt, &doc.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return Document{}, ErrDocumentNotFound
	}
	if err != nil {
		return Document{}, fmt.Errorf("get knowledge document: %w", err)
	}
	return doc, nil
}

// ErrDocumentNotFound is the document counterpart of ErrItemNotFound.
var ErrDocumentNotFound = errors.New("knowledge: document not found")

// NewChunk is the create payload for one chunk of a document generation.
type NewChunk struct {
	WorkspaceID string
	DocumentID  string
	Generation  int
	Ord         int
	Content     string
	Tokens      int
	HeadingPath *string
	PageFrom    *int
	PageTo      *int
	ACLTags     []string
}

const chunkColumns = `id, workspace_id, document_id, generation, ord, content, tokens,
	heading_path, page_from, page_to, acl_tags, created_at`

// CreateChunk inserts one chunk. Generation <= 0 means generation 1; ACLTags nil
// becomes the empty array, never SQL NULL.
func (s *Store) CreateChunk(ctx context.Context, in NewChunk) (Chunk, error) {
	if strings.TrimSpace(in.WorkspaceID) == "" || strings.TrimSpace(in.DocumentID) == "" {
		return Chunk{}, fmt.Errorf("%w: workspace_id and document_id are required", ErrInvalidField)
	}
	if in.Generation <= 0 {
		in.Generation = 1
	}
	if in.ACLTags == nil {
		in.ACLTags = []string{}
	}
	var chunk Chunk
	err := s.db.QueryRow(ctx, `
		INSERT INTO knowledge_chunks
			(workspace_id, document_id, generation, ord, content, tokens, heading_path, page_from, page_to, acl_tags)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		RETURNING `+chunkColumns,
		in.WorkspaceID, in.DocumentID, in.Generation, in.Ord, in.Content, in.Tokens,
		in.HeadingPath, in.PageFrom, in.PageTo, in.ACLTags).Scan(
		&chunk.ID, &chunk.WorkspaceID, &chunk.DocumentID, &chunk.Generation, &chunk.Ord,
		&chunk.Content, &chunk.Tokens, &chunk.HeadingPath, &chunk.PageFrom,
		&chunk.PageTo, &chunk.ACLTags, &chunk.CreatedAt)
	if err != nil {
		return Chunk{}, fmt.Errorf("create knowledge chunk: %w", err)
	}
	return chunk, nil
}

// GetChunk reads one chunk by id inside workspaceID.
func (s *Store) GetChunk(ctx context.Context, workspaceID, chunkID string) (Chunk, error) {
	var chunk Chunk
	err := s.db.QueryRow(ctx, `
		SELECT `+chunkColumns+`
		FROM knowledge_chunks
		WHERE workspace_id = $1 AND id = $2`, workspaceID, chunkID).Scan(
		&chunk.ID, &chunk.WorkspaceID, &chunk.DocumentID, &chunk.Generation,
		&chunk.Ord, &chunk.Content, &chunk.Tokens, &chunk.HeadingPath,
		&chunk.PageFrom, &chunk.PageTo, &chunk.ACLTags, &chunk.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return Chunk{}, ErrChunkNotFound
	}
	if err != nil {
		return Chunk{}, fmt.Errorf("get knowledge chunk: %w", err)
	}
	return chunk, nil
}

// ErrChunkNotFound is the chunk counterpart of ErrItemNotFound.
var ErrChunkNotFound = errors.New("knowledge: chunk not found")

// Revision is one recorded edit of a wiki page (knowledge_page_revisions). Like
// an item it carries its own space_id, and since migration 623 that space is
// pinned to the space of PageID: the foreign key is
// (workspace_id, space_id, page_id) -> knowledge_pages, so a revision cannot
// record a page belonging to another space of the same workspace. PageID stays
// nullable for the revisions that describe a path rather than a live row.
type Revision struct {
	ID          string
	WorkspaceID string
	SpaceID     string
	PageID      *string
	OperationID *string
	Path        string
	ContentHash string
	Summary     *string
	CreatedAt   time.Time
}

// NewRevision is the create payload for one revision.
type NewRevision struct {
	WorkspaceID string
	SpaceID     string
	PageID      *string
	OperationID *string
	Path        string
	ContentHash string
	Summary     *string
}

const revisionColumns = `id, workspace_id, space_id, page_id, operation_id, path,
	content_hash, summary, created_at`

// CreateRevision inserts one revision and returns the row as stored.
//
// SpaceID is not pre-validated in Go on purpose: the composite foreign key is
// the single guarantee that the revision's space is the page's space, and a
// caller that gets it wrong must see PostgreSQL's SQLSTATE 23503 naming
// knowledge_page_revisions_page_fkey rather than a second, weaker check that
// could drift from the DDL. The same holds for CreateBacklink.
func (s *Store) CreateRevision(ctx context.Context, in NewRevision) (Revision, error) {
	if strings.TrimSpace(in.WorkspaceID) == "" || strings.TrimSpace(in.SpaceID) == "" {
		return Revision{}, fmt.Errorf("%w: workspace_id and space_id are required", ErrInvalidField)
	}
	if strings.TrimSpace(in.Path) == "" || strings.TrimSpace(in.ContentHash) == "" {
		return Revision{}, fmt.Errorf("%w: path and content_hash are required", ErrInvalidField)
	}
	var rev Revision
	err := s.db.QueryRow(ctx, `
		INSERT INTO knowledge_page_revisions
			(workspace_id, space_id, page_id, operation_id, path, content_hash, summary)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING `+revisionColumns,
		in.WorkspaceID, in.SpaceID, in.PageID, in.OperationID, in.Path,
		in.ContentHash, in.Summary).Scan(
		&rev.ID, &rev.WorkspaceID, &rev.SpaceID, &rev.PageID, &rev.OperationID,
		&rev.Path, &rev.ContentHash, &rev.Summary, &rev.CreatedAt)
	if err != nil {
		return Revision{}, fmt.Errorf("create knowledge page revision: %w", err)
	}
	return rev, nil
}

// Backlink is one materialised "page links to path" edge
// (knowledge_page_backlinks). SourcePageID is mandatory and must live in the
// backlink's own space (migration 623); TargetPageID is nil for a red link — a
// link to a path no page answers for yet — which is why TargetPath is stored
// even when the target resolves.
type Backlink struct {
	ID           string
	WorkspaceID  string
	SpaceID      string
	SourcePageID string
	TargetPageID *string
	TargetPath   string
	Anchor       *string
	CreatedAt    time.Time
}

// NewBacklink is the create payload for one backlink edge.
type NewBacklink struct {
	WorkspaceID  string
	SpaceID      string
	SourcePageID string
	TargetPageID *string
	TargetPath   string
	Anchor       *string
}

const backlinkColumns = `id, workspace_id, space_id, source_page_id, target_page_id,
	target_path, anchor, created_at`

// CreateBacklink inserts one backlink edge. Both page ids are checked against
// the composite (workspace_id, space_id, page_id) keys, so an edge that crosses
// spaces is refused by the DDL with SQLSTATE 23503 — see CreateRevision for why
// the store does not repeat that check in Go.
func (s *Store) CreateBacklink(ctx context.Context, in NewBacklink) (Backlink, error) {
	if strings.TrimSpace(in.WorkspaceID) == "" || strings.TrimSpace(in.SpaceID) == "" ||
		strings.TrimSpace(in.SourcePageID) == "" {
		return Backlink{}, fmt.Errorf("%w: workspace_id, space_id and source_page_id are required", ErrInvalidField)
	}
	if strings.TrimSpace(in.TargetPath) == "" {
		return Backlink{}, fmt.Errorf("%w: target_path is required", ErrInvalidField)
	}
	var link Backlink
	err := s.db.QueryRow(ctx, `
		INSERT INTO knowledge_page_backlinks
			(workspace_id, space_id, source_page_id, target_page_id, target_path, anchor)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING `+backlinkColumns,
		in.WorkspaceID, in.SpaceID, in.SourcePageID, in.TargetPageID,
		in.TargetPath, in.Anchor).Scan(
		&link.ID, &link.WorkspaceID, &link.SpaceID, &link.SourcePageID,
		&link.TargetPageID, &link.TargetPath, &link.Anchor, &link.CreatedAt)
	if err != nil {
		return Backlink{}, fmt.Errorf("create knowledge page backlink: %w", err)
	}
	return link, nil
}
