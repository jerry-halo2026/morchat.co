package knowledge

// The P1 read/write surface: spaces, item listing and updates, item chunks,
// links, and the wiki pages. Everything here builds on store.go's querier and
// reuses the two permission primitives that already exist — visCond/canViewItem
// for reads (search.go) and the workspace scope the HTTP layer asserts for
// writes — so no route can grow a second, weaker copy of the ACL.
//
// Two conventions are worth stating once:
//
//   - Identifiers coming from a URL are compared as text (`id::text = $n`) or
//     rejected by isUUIDString before the query, so a malformed id is a 404 and
//     never a driver-level uuid syntax error that would surface as a 500.
//   - "archived" is not a lifecycle value in the registry (draft / active /
//     deprecated). It is the API's *verb*: it maps onto `deprecated` — the state
//     the registry already defines as "leaves the index, stays readable" — and is
//     recorded in `metadata.archived` so an archived item stays distinguishable
//     from one the distillation pipeline deprecated on its own.

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

// DefaultWikiID is the wiki instance every workspace gets on first write. The
// DDL defaults it, but a space insert must name it to satisfy the
// (workspace_id, wiki_id) foreign key.
const DefaultWikiID = "default"

// StatusArchived is the archive verb as the API accepts it. It is deliberately
// not part of the Status enum: the stored column stays inside the registry's
// closed set (see itemStatus).
const StatusArchived = "archived"

// ErrPageNotFound is the wiki-page counterpart of ErrItemNotFound.
var ErrPageNotFound = errors.New("knowledge: page not found")

// isUUIDString reports whether s looks like a canonical UUID. It exists so a
// path parameter that is not one answers 404 instead of a pgx syntax error.
func isUUIDString(s string) bool {
	if len(s) != 36 {
		return false
	}
	for i, r := range s {
		switch i {
		case 8, 13, 18, 23:
			if r != '-' {
				return false
			}
		default:
			isHex := (r >= '0' && r <= '9') || (r >= 'a' && r <= 'f') || (r >= 'A' && r <= 'F')
			if !isHex {
				return false
			}
		}
	}
	return true
}

// slugify turns a display name into the space slug the DDL requires. The slug is
// an internal identifier (the API addresses spaces by uuid); it only has to be
// stable, unique per wiki, and readable in logs.
func slugify(name string) string {
	var b strings.Builder
	lastDash := false
	for _, r := range strings.ToLower(strings.TrimSpace(name)) {
		switch {
		case (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9'):
			b.WriteRune(r)
			lastDash = false
		case r == '_' || r == '/' || r == ' ' || r == '-' || r == '.':
			if !lastDash && b.Len() > 0 {
				b.WriteByte('-')
				lastDash = true
			}
		}
	}
	slug := strings.Trim(b.String(), "-")
	if slug == "" {
		slug = "space"
	}
	if len(slug) > 60 {
		slug = strings.Trim(slug[:60], "-")
	}
	return slug
}

// itemStatus maps the API's status value onto the stored lifecycle. "archived"
// is accepted as the verb for a soft delete and stored as the metadata flag
// alone, returning an empty status: the registry's `deprecated` is a different
// state (retired by the distillation pipeline, not readable through the index),
// and reusing it for "the user archived this" would make an archived item
// unreadable instead of merely out of the way.
func itemStatus(input string) (status string, archived bool, err error) {
	value := strings.TrimSpace(input)
	if value == StatusArchived {
		return "", true, nil
	}
	if !Status.Has(value) {
		return "", false, fmt.Errorf("%w: status=%q not in %v (or %q)",
			ErrInvalidField, input, Status.Values, StatusArchived)
	}
	return value, false, nil
}

// ---------------------------------------------------------------------------
// Spaces
// ---------------------------------------------------------------------------

// Space is one knowledge space (a collection of items) as the API returns it.
// The DDL calls the name column display_name and keeps free-form settings; the
// wire shape is the plan's `name` / `description` pair on top of those.
type Space struct {
	ID          string    `json:"id"`
	WorkspaceID string    `json:"workspace_id"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	ItemCount   int       `json:"item_count"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

const spaceColumns = `sp.id::text, sp.workspace_id::text, sp.display_name,
	coalesce(sp.settings->>'description', ''),
	(SELECT count(*) FROM knowledge_items i
	  WHERE i.workspace_id = sp.workspace_id AND i.space_id = sp.id),
	sp.created_at, sp.updated_at`

func scanSpace(row pgx.Row) (Space, error) {
	var sp Space
	err := row.Scan(&sp.ID, &sp.WorkspaceID, &sp.Name, &sp.Description,
		&sp.ItemCount, &sp.CreatedAt, &sp.UpdatedAt)
	return sp, err
}

// CreateSpace inserts one space and returns it as stored. A second space with
// the same name gets a numeric slug suffix rather than failing: the name is user
// data, the slug is bookkeeping.
func (s *Store) CreateSpace(ctx context.Context, workspaceID, name, description string, ownerID *string) (Space, error) {
	workspaceID = strings.TrimSpace(workspaceID)
	name = strings.TrimSpace(name)
	if !isUUIDString(workspaceID) {
		return Space{}, fmt.Errorf("%w: workspace_id=%q is not a uuid", ErrInvalidField, workspaceID)
	}
	if name == "" {
		return Space{}, fmt.Errorf("%w: name is required", ErrInvalidField)
	}
	if _, err := s.db.Exec(ctx, `
		INSERT INTO knowledge_instances (workspace_id, wiki_id)
		VALUES ($1, $2)
		ON CONFLICT (workspace_id, wiki_id) DO NOTHING`, workspaceID, DefaultWikiID); err != nil {
		return Space{}, fmt.Errorf("ensure knowledge instance: %w", err)
	}

	base := slugify(name)
	var spaceID string
	var err error
	for attempt := 0; attempt < 32; attempt++ {
		slug := base
		if attempt > 0 {
			slug = fmt.Sprintf("%s-%d", base, attempt+1)
		}
		err = s.db.QueryRow(ctx, `
			INSERT INTO knowledge_spaces
				(workspace_id, wiki_id, slug, display_name, owner_id, settings)
			VALUES ($1, $2, $3, $4, $5, jsonb_build_object('description', $6::text))
			ON CONFLICT (workspace_id, wiki_id, slug) DO NOTHING
			RETURNING id::text`,
			workspaceID, DefaultWikiID, slug, name, ownerID, description).Scan(&spaceID)
		if err == nil {
			break
		}
		if !errors.Is(err, pgx.ErrNoRows) {
			return Space{}, fmt.Errorf("create knowledge space: %w", err)
		}
	}
	if spaceID == "" {
		return Space{}, fmt.Errorf("create knowledge space: no free slug for %q", name)
	}
	return s.GetSpace(ctx, workspaceID, spaceID)
}

// ListSpaces returns every space of the workspace, oldest first, each with its
// item count.
func (s *Store) ListSpaces(ctx context.Context, workspaceID string) ([]Space, error) {
	rows, err := s.db.Query(ctx, `
		SELECT `+spaceColumns+`
		FROM knowledge_spaces sp
		WHERE sp.workspace_id = $1
		ORDER BY sp.created_at, sp.id`, workspaceID)
	if err != nil {
		return nil, fmt.Errorf("list knowledge spaces: %w", err)
	}
	defer rows.Close()
	out := make([]Space, 0, 4)
	for rows.Next() {
		sp, err := scanSpace(rows)
		if err != nil {
			return nil, fmt.Errorf("scan knowledge space: %w", err)
		}
		out = append(out, sp)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("list knowledge spaces: %w", err)
	}
	return out, nil
}

// GetSpace reads one space inside the workspace.
func (s *Store) GetSpace(ctx context.Context, workspaceID, spaceID string) (Space, error) {
	if !isUUIDString(spaceID) {
		return Space{}, ErrSpaceNotFound
	}
	row := s.db.QueryRow(ctx, `
		SELECT `+spaceColumns+`
		FROM knowledge_spaces sp
		WHERE sp.workspace_id = $1 AND sp.id = $2`, workspaceID, spaceID)
	sp, err := scanSpace(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return Space{}, ErrSpaceNotFound
	}
	if err != nil {
		return Space{}, fmt.Errorf("get knowledge space: %w", err)
	}
	return sp, nil
}

// ---------------------------------------------------------------------------
// Item listing and updates
// ---------------------------------------------------------------------------

// ListItemsInput is one item listing request. Zero values mean "not filtered".
type ListItemsInput struct {
	WorkspaceID string
	ViewerID    string
	SpaceID     string
	ProjectID   string
	Status      string
	Kind        string
	Query       string
	Limit       int
	Cursor      string
}

// ItemList is one page of items plus the cursor that continues it.
type ItemList struct {
	Items      []Item `json:"items"`
	NextCursor string `json:"next_cursor,omitempty"`
}

// itemColumnsAliased is itemColumns with the `i.` alias the listing query needs.
const itemColumnsAliased = `i.id, i.workspace_id, i.space_id, i.page_id, i.project_id,
	i.title, i.kind, i.source_type, i.source_ref, i.status, i.owner_id, i.acl_mode,
	i.created_at, i.updated_at`

// ListItems lists the items of one workspace that the viewer may see.
//
// Visibility is visCond — the same predicate the retrieval index layer uses — so
// a listing cannot show a private item the search would hide. The default view is
// the registry's indexable set (draft + active) minus archived rows; an explicit
// status asks for exactly that lifecycle state instead, and `archived` names the
// archive flag.
func (s *Store) ListItems(ctx context.Context, in ListItemsInput) (ItemList, error) {
	if !isUUIDString(strings.TrimSpace(in.WorkspaceID)) {
		return ItemList{}, fmt.Errorf("%w: workspace_id=%q is not a uuid", ErrInvalidField, in.WorkspaceID)
	}
	limit := in.Limit
	if limit <= 0 {
		limit = 50
	}
	if limit > 200 {
		limit = 200
	}

	args := []any{in.WorkspaceID, in.ViewerID}
	where := []string{"i.workspace_id = $1", visCond}

	status := strings.TrimSpace(in.Status)
	switch status {
	case "":
		where = append(where,
			"i.status IN ('draft', 'active')",
			"coalesce(i.metadata->>'archived', 'false') <> 'true'")
	case StatusArchived:
		where = append(where, "i.metadata->>'archived' = 'true'")
	default:
		value, _, err := itemStatus(status)
		if err != nil {
			return ItemList{}, err
		}
		args = append(args, value)
		where = append(where,
			fmt.Sprintf("i.status = $%d", len(args)),
			"coalesce(i.metadata->>'archived', 'false') <> 'true'")
	}

	if kind := strings.TrimSpace(in.Kind); kind != "" {
		if !Kind.Has(kind) {
			return ItemList{}, fmt.Errorf("%w: kind=%q not in %v", ErrInvalidField, kind, Kind.Values)
		}
		args = append(args, kind)
		where = append(where, fmt.Sprintf("i.kind = $%d", len(args)))
	}
	if spaceID := strings.TrimSpace(in.SpaceID); spaceID != "" {
		if !isUUIDString(spaceID) {
			return ItemList{}, fmt.Errorf("%w: space_id=%q is not a uuid", ErrInvalidField, spaceID)
		}
		args = append(args, spaceID)
		where = append(where, fmt.Sprintf("i.space_id::text = $%d", len(args)))
	}
	if projectID := strings.TrimSpace(in.ProjectID); projectID != "" {
		if !isUUIDString(projectID) {
			return ItemList{}, fmt.Errorf("%w: project_id=%q is not a uuid", ErrInvalidField, projectID)
		}
		args = append(args, projectID)
		where = append(where, fmt.Sprintf("i.project_id::text = $%d", len(args)))
	}
	if q := strings.TrimSpace(in.Query); q != "" {
		args = append(args, "%"+q+"%")
		where = append(where, fmt.Sprintf("(i.title ILIKE $%d OR i.source_ref ILIKE $%d)", len(args), len(args)))
	}
	if cursor := strings.TrimSpace(in.Cursor); cursor != "" {
		ts, id, err := decodeItemCursor(cursor)
		if err != nil {
			return ItemList{}, fmt.Errorf("%w: cursor=%q", ErrInvalidField, cursor)
		}
		args = append(args, ts, id)
		where = append(where,
			fmt.Sprintf("(i.updated_at, i.id) < ($%d, $%d::uuid)", len(args)-1, len(args)))
	}
	args = append(args, limit+1)

	rows, err := s.db.Query(ctx, fmt.Sprintf(`
		SELECT `+itemColumnsAliased+`
		FROM knowledge_items i
		WHERE %s
		ORDER BY i.updated_at DESC, i.id DESC
		LIMIT $%d`, strings.Join(where, " AND "), len(args)), args...)
	if err != nil {
		return ItemList{}, fmt.Errorf("list knowledge items: %w", err)
	}
	defer rows.Close()

	out := ItemList{Items: make([]Item, 0, limit)}
	for rows.Next() {
		item, err := scanItem(rows)
		if err != nil {
			return ItemList{}, fmt.Errorf("scan knowledge item: %w", err)
		}
		out.Items = append(out.Items, item)
	}
	if err := rows.Err(); err != nil {
		return ItemList{}, fmt.Errorf("list knowledge items: %w", err)
	}
	if len(out.Items) > limit {
		last := out.Items[limit-1]
		out.Items = out.Items[:limit]
		out.NextCursor = encodeItemCursor(last.UpdatedAt, last.ID)
	}
	return out, nil
}

// encodeItemCursor / decodeItemCursor keep the keyset position opaque to callers
// while staying readable in a log: updated_at and id, base64url encoded. The pair
// is what the ORDER BY sorts on, so a page boundary can never skip or repeat a row
// that was updated between two requests.
func encodeItemCursor(updatedAt time.Time, id string) string {
	raw := updatedAt.UTC().Format(time.RFC3339Nano) + "|" + id
	return base64.RawURLEncoding.EncodeToString([]byte(raw))
}

func decodeItemCursor(cursor string) (time.Time, string, error) {
	decoded, err := base64.RawURLEncoding.DecodeString(cursor)
	if err != nil {
		return time.Time{}, "", err
	}
	parts := strings.SplitN(string(decoded), "|", 2)
	if len(parts) != 2 || !isUUIDString(parts[1]) {
		return time.Time{}, "", fmt.Errorf("malformed cursor")
	}
	ts, err := time.Parse(time.RFC3339Nano, parts[0])
	if err != nil {
		return time.Time{}, "", err
	}
	return ts, parts[1], nil
}

// UpdateItemInput is a partial update: nil means "leave as stored". ProjectID ""
// clears the column, which is why the field is a pointer to a pointer — an
// omitted project_id and an explicitly empty one are different requests.
type UpdateItemInput struct {
	WorkspaceID string
	ItemID      string
	Title       *string
	Status      *string
	ACLMode     *string
	SourceRef   *string
	ProjectID   **string
}

// UpdateItem applies a partial update and returns the row as stored.
func (s *Store) UpdateItem(ctx context.Context, in UpdateItemInput) (Item, error) {
	if !isUUIDString(strings.TrimSpace(in.ItemID)) {
		return Item{}, ErrItemNotFound
	}
	args := []any{in.WorkspaceID, in.ItemID}
	sets := []string{}
	add := func(clause string, value any) {
		args = append(args, value)
		sets = append(sets, fmt.Sprintf(clause, len(args)))
	}
	if in.Title != nil {
		title := strings.TrimSpace(*in.Title)
		if title == "" {
			return Item{}, fmt.Errorf("%w: title cannot be empty", ErrInvalidField)
		}
		add("title = $%d", title)
	}
	if in.Status != nil {
		status, archived, err := itemStatus(*in.Status)
		if err != nil {
			return Item{}, err
		}
		if status != "" {
			add("status = $%d", status)
		}
		add("metadata = jsonb_set(metadata, '{archived}', to_jsonb($%d::boolean), true)", archived)
	}
	if in.ACLMode != nil {
		mode := strings.TrimSpace(*in.ACLMode)
		if !ACLMode.Has(mode) {
			return Item{}, fmt.Errorf("%w: acl_mode=%q not in %v", ErrInvalidField, mode, ACLMode.Values)
		}
		add("acl_mode = $%d", mode)
	}
	if in.SourceRef != nil {
		add("source_ref = $%d", strings.TrimSpace(*in.SourceRef))
	}
	if in.ProjectID != nil {
		projectID := strings.TrimSpace(**in.ProjectID)
		if projectID == "" {
			sets = append(sets, "project_id = NULL")
		} else {
			if !isUUIDString(projectID) {
				return Item{}, fmt.Errorf("%w: project_id=%q is not a uuid", ErrInvalidField, projectID)
			}
			add("project_id = $%d::uuid", projectID)
		}
	}
	if len(sets) == 0 {
		return Item{}, fmt.Errorf("%w: no fields to update", ErrInvalidField)
	}
	sets = append(sets, "updated_at = now()")

	row := s.db.QueryRow(ctx, fmt.Sprintf(`
		UPDATE knowledge_items
		SET %s
		WHERE workspace_id = $1 AND id::text = $2
		RETURNING `+itemColumns, strings.Join(sets, ", ")), args...)
	item, err := scanItem(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return Item{}, ErrItemNotFound
	}
	if err != nil {
		return Item{}, fmt.Errorf("update knowledge item: %w", err)
	}
	return item, nil
}

// GetItemByID is GetItem with a defensive identifier check: a malformed id is
// "not found" rather than a uuid-syntax error out of the driver, which would
// otherwise reach the client as a 500 for what is a bad URL.
func (s *Store) GetItemByID(ctx context.Context, workspaceID, itemID string) (Item, error) {
	if !isUUIDString(strings.TrimSpace(itemID)) {
		return Item{}, ErrItemNotFound
	}
	return s.GetItem(ctx, workspaceID, itemID)
}

// ReadItem reads one item and applies the visibility rule retrieval uses.
//
// The two failures stay distinct on purpose: an id that names no row of this
// workspace is ErrItemNotFound (404), while a row the viewer may not see is
// ErrKnowledgeForbidden (403). GetItemForViewer collapses both into 403 because
// a retrieval caller must not learn whether an invisible id exists; a CRUD read
// addressed by id has no such ambiguity to protect.
func (s *Service) ReadItem(ctx context.Context, workspaceID, viewerID, itemID string) (Item, error) {
	item, err := s.store.GetItemByID(ctx, workspaceID, itemID)
	if err != nil {
		return Item{}, err
	}
	view := viewableItem{
		ID:          item.ID,
		WorkspaceID: item.WorkspaceID,
		SpaceID:     item.SpaceID,
		Title:       item.Title,
		Kind:        item.Kind,
		ACLMode:     item.ACLMode,
		Status:      item.Status,
	}
	if item.OwnerID != nil {
		view.OwnerID = *item.OwnerID
	}
	if !canViewItem(view, workspaceID, viewerID) {
		return Item{}, fmt.Errorf("%w: item %s", ErrKnowledgeForbidden, itemID)
	}
	return item, nil
}

// CreateItem is the HTTP create path: one item, owned by its creator, with an
// optional inline body stored through the same parser and chunker as an import.
func (s *Service) CreateItem(ctx context.Context, in NewItem, content, mime string) (Item, int, error) {
	item, err := s.store.CreateItem(ctx, in)
	if err != nil {
		return Item{}, 0, err
	}
	if strings.TrimSpace(content) == "" {
		return item, 0, nil
	}
	if mime == "" {
		mime = "text/markdown"
	}
	_, chunks, err := s.IngestInline(ctx, in.WorkspaceID, item, content, mime)
	if err != nil {
		return item, 0, err
	}
	return item, chunks, nil
}

// ---------------------------------------------------------------------------
// Item detail: chunks, content, links
// ---------------------------------------------------------------------------

// ItemDetail is one item with its active document, its persisted chunks, and the
// body a reader would show. Chunks are the stored rows, not a re-chunking of
// anything: what preview promises, this returns.
type ItemDetail struct {
	Item     Item
	Document *Document
	Chunks   []Chunk
	Content  string
	Archived bool
}

// GetItemDetail reads one item, its active document generation and that
// generation's chunks. An item with no document yet is not an error: it has an
// empty body and no chunks.
func (s *Service) GetItemDetail(ctx context.Context, workspaceID, viewerID, itemID string, withContent bool) (ItemDetail, error) {
	item, err := s.ReadItem(ctx, workspaceID, viewerID, itemID)
	if err != nil {
		return ItemDetail{}, err
	}
	detail := ItemDetail{Item: item, Chunks: []Chunk{}}
	archived, err := s.store.ItemArchived(ctx, workspaceID, item.ID)
	if err != nil {
		return ItemDetail{}, err
	}
	detail.Archived = archived
	doc, err := s.activeDocument(ctx, workspaceID, item.ID)
	if errors.Is(err, ErrDocumentNotFound) {
		return detail, nil
	}
	if err != nil {
		return ItemDetail{}, err
	}
	detail.Document = &doc
	chunks, err := s.documentChunks(ctx, workspaceID, doc.ID, doc.ActiveGeneration, 0)
	if err != nil {
		return ItemDetail{}, err
	}
	detail.Chunks = chunks
	if withContent {
		parts := make([]string, 0, len(chunks))
		for _, chunk := range chunks {
			if text := strings.TrimSpace(chunk.Content); text != "" {
				parts = append(parts, text)
			}
		}
		detail.Content = strings.Join(parts, "\n\n")
	}
	return detail, nil
}

// ItemArchived reports the archive flag of one item. It is read separately from
// the Item row because `archived` is not a field of the item's wire type: the
// flag lives in `metadata`, and the canonical item shape is pinned to the view
// types by enums_test.go.
func (s *Store) ItemArchived(ctx context.Context, workspaceID, itemID string) (bool, error) {
	if !isUUIDString(strings.TrimSpace(itemID)) {
		return false, ErrItemNotFound
	}
	var archived bool
	err := s.db.QueryRow(ctx, `
		SELECT coalesce(metadata->>'archived', 'false') = 'true'
		FROM knowledge_items
		WHERE workspace_id = $1 AND id = $2`, workspaceID, itemID).Scan(&archived)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, ErrItemNotFound
	}
	if err != nil {
		return false, fmt.Errorf("read knowledge item archive flag: %w", err)
	}
	return archived, nil
}

// activeDocument returns the document generation currently serving the item.
func (s *Service) activeDocument(ctx context.Context, workspaceID, itemID string) (Document, error) {
	if !isUUIDString(itemID) {
		return Document{}, ErrDocumentNotFound
	}
	var doc Document
	err := s.db.QueryRow(ctx, `
		SELECT `+documentColumns+`
		FROM knowledge_documents
		WHERE workspace_id = $1 AND item_id::text = $2 AND generation = active_generation
		ORDER BY version DESC
		LIMIT 1`, workspaceID, itemID).Scan(
		&doc.ID, &doc.WorkspaceID, &doc.ItemID, &doc.Version, &doc.Mime, &doc.Bytes,
		&doc.SHA256, &doc.StorageKey, &doc.ParsedAt, &doc.ParseEngine, &doc.Generation,
		&doc.ActiveGeneration, &doc.CreatedAt, &doc.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return Document{}, ErrDocumentNotFound
	}
	if err != nil {
		return Document{}, fmt.Errorf("get active knowledge document: %w", err)
	}
	return doc, nil
}

// documentChunks reads one document generation's chunks in reading order.
func (s *Service) documentChunks(ctx context.Context, workspaceID, documentID string, generation, limit int) ([]Chunk, error) {
	if limit <= 0 {
		limit = 500
	}
	rows, err := s.db.Query(ctx, `
		SELECT `+chunkColumns+`
		FROM knowledge_chunks
		WHERE workspace_id = $1 AND document_id::text = $2 AND generation = $3
		ORDER BY ord
		LIMIT $4`, workspaceID, documentID, generation, limit)
	if err != nil {
		return nil, fmt.Errorf("list knowledge chunks: %w", err)
	}
	defer rows.Close()
	out := make([]Chunk, 0, 8)
	for rows.Next() {
		var chunk Chunk
		if err := rows.Scan(&chunk.ID, &chunk.WorkspaceID, &chunk.DocumentID,
			&chunk.Generation, &chunk.Ord, &chunk.Content, &chunk.Tokens,
			&chunk.HeadingPath, &chunk.PageFrom, &chunk.PageTo, &chunk.ACLTags,
			&chunk.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan knowledge chunk: %w", err)
		}
		out = append(out, chunk)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("list knowledge chunks: %w", err)
	}
	return out, nil
}

// ChunkGenerations maps chunk id -> document generation for the given ids, which
// is what lets a search hit carry the revision it came from.
func (s *Service) ChunkGenerations(ctx context.Context, workspaceID string, chunkIDs []string) (map[string]int, error) {
	out := map[string]int{}
	if len(chunkIDs) == 0 {
		return out, nil
	}
	rows, err := s.db.Query(ctx, `
		SELECT id::text, generation
		FROM knowledge_chunks
		WHERE workspace_id = $1 AND id::text = ANY($2::text[])`, workspaceID, chunkIDs)
	if err != nil {
		return nil, fmt.Errorf("read chunk generations: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var id string
		var generation int
		if err := rows.Scan(&id, &generation); err != nil {
			return nil, fmt.Errorf("scan chunk generation: %w", err)
		}
		out[id] = generation
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("read chunk generations: %w", err)
	}
	return out, nil
}

// ItemLink is one wiki link edge seen from an item.
type ItemLink struct {
	ID        string  `json:"id"`
	Direction string  `json:"direction"`
	SpaceID   string  `json:"space_id"`
	PageID    *string `json:"page_id"`
	Path      string  `json:"path"`
	Title     string  `json:"title"`
}

// ItemLinks is the backlink/outlink pair of one item. An item that is not bound
// to a wiki page has no links: the edges live on pages, and inventing them from
// titles would be a guess, not a link.
type ItemLinks struct {
	ItemID    string     `json:"item_id"`
	PageID    *string    `json:"page_id"`
	Backlinks []ItemLink `json:"backlinks"`
	Outlinks  []ItemLink `json:"outlinks"`
}

// ListItemLinks reads the wiki edges of the page an item was distilled from.
func (s *Service) ListItemLinks(ctx context.Context, workspaceID, viewerID, itemID string) (ItemLinks, error) {
	item, err := s.ReadItem(ctx, workspaceID, viewerID, itemID)
	if err != nil {
		return ItemLinks{}, err
	}
	out := ItemLinks{ItemID: item.ID, PageID: item.PageID, Backlinks: []ItemLink{}, Outlinks: []ItemLink{}}
	if item.PageID == nil {
		return out, nil
	}

	outlinks, err := s.db.Query(ctx, `
		SELECT b.id::text, b.space_id::text, b.target_page_id::text, b.target_path,
		       coalesce(p.title, '')
		FROM knowledge_page_backlinks b
		LEFT JOIN knowledge_pages p
		  ON p.workspace_id = b.workspace_id AND p.id = b.target_page_id
		WHERE b.workspace_id = $1 AND b.source_page_id::text = $2
		ORDER BY b.created_at, b.id`, workspaceID, *item.PageID)
	if err != nil {
		return ItemLinks{}, fmt.Errorf("list knowledge outlinks: %w", err)
	}
	defer outlinks.Close()
	for outlinks.Next() {
		var link ItemLink
		link.Direction = "out"
		if err := outlinks.Scan(&link.ID, &link.SpaceID, &link.PageID, &link.Path, &link.Title); err != nil {
			return ItemLinks{}, fmt.Errorf("scan knowledge outlink: %w", err)
		}
		out.Outlinks = append(out.Outlinks, link)
	}
	if err := outlinks.Err(); err != nil {
		return ItemLinks{}, fmt.Errorf("list knowledge outlinks: %w", err)
	}

	backlinks, err := s.db.Query(ctx, `
		SELECT b.id::text, b.space_id::text, b.source_page_id::text,
		       coalesce(p.path, ''), coalesce(p.title, '')
		FROM knowledge_page_backlinks b
		LEFT JOIN knowledge_pages p
		  ON p.workspace_id = b.workspace_id AND p.id = b.source_page_id
		WHERE b.workspace_id = $1 AND b.target_page_id::text = $2
		ORDER BY b.created_at, b.id`, workspaceID, *item.PageID)
	if err != nil {
		return ItemLinks{}, fmt.Errorf("list knowledge backlinks: %w", err)
	}
	defer backlinks.Close()
	for backlinks.Next() {
		var link ItemLink
		link.Direction = "in"
		if err := backlinks.Scan(&link.ID, &link.SpaceID, &link.PageID, &link.Path, &link.Title); err != nil {
			return ItemLinks{}, fmt.Errorf("scan knowledge backlink: %w", err)
		}
		out.Backlinks = append(out.Backlinks, link)
	}
	if err := backlinks.Err(); err != nil {
		return ItemLinks{}, fmt.Errorf("list knowledge backlinks: %w", err)
	}
	return out, nil
}

// ---------------------------------------------------------------------------
// Inline content on an item
// ---------------------------------------------------------------------------

// IngestInline stores an item's body that arrived as a JSON string rather than
// through upload-url + import: same parser, same chunker, same tables, so a
// document created here is retrievable exactly like an imported one. It returns
// the new document and the chunk count.
func (s *Service) IngestInline(ctx context.Context, workspaceID string, item Item, content, mime string) (Document, int, error) {
	if strings.TrimSpace(content) == "" {
		return Document{}, 0, fmt.Errorf("%w: content is empty", ErrInvalidField)
	}
	parsed, err := ParseDocument(item.Title, mime, []byte(content))
	if err != nil {
		return Document{}, 0, err
	}
	cfg, err := ChunkConfig{}.WithDefaults()
	if err != nil {
		return Document{}, 0, err
	}
	drafts, err := Split(parsed.Text, cfg)
	if err != nil {
		return Document{}, 0, err
	}
	if len(drafts) == 0 {
		return Document{}, 0, fmt.Errorf("%w: document has no text to chunk", ErrInvalidField)
	}
	sum := sha256.Sum256([]byte(content))
	doc, err := s.store.CreateDocument(ctx, NewDocument{
		WorkspaceID: workspaceID,
		ItemID:      item.ID,
		Mime:        parsed.MIME,
		Bytes:       int64(len(content)),
		SHA256:      hex.EncodeToString(sum[:]),
		ParseEngine: ParseEngineNative,
	})
	if err != nil {
		return Document{}, 0, err
	}
	for _, draft := range drafts {
		meta := map[string]any{"level": draft.Level, "chunk_mode": cfg.Mode}
		if draft.ParentOrd != nil {
			meta["parent_ord"] = *draft.ParentOrd
		}
		if _, err := s.store.CreateChunk(ctx, NewChunk{
			WorkspaceID: workspaceID,
			DocumentID:  doc.ID,
			Generation:  doc.Generation,
			Ord:         draft.Ord,
			Content:     draft.Content,
			Tokens:      draft.Tokens,
			HeadingPath: draft.HeadingPath,
			ACLTags:     []string{},
			Metadata:    meta,
		}); err != nil {
			return Document{}, 0, err
		}
	}
	return doc, len(drafts), nil
}

// ---------------------------------------------------------------------------
// Wiki pages
// ---------------------------------------------------------------------------

// Page is one wiki page with its current revision. The body lives in the
// revision's metadata (`{"revision": n, "content": "..."}`): the DDL keeps page
// content hashes and revision summaries, not a duplicated body column, and the
// revision row is the only place a body can be attributed to an editor.
type Page struct {
	ID          string    `json:"id"`
	WorkspaceID string    `json:"workspace_id"`
	SpaceID     string    `json:"space_id"`
	Path        string    `json:"path"`
	Title       string    `json:"title"`
	PageType    string    `json:"page_type"`
	Revision    int       `json:"revision"`
	ContentHash string    `json:"content_hash"`
	Content     string    `json:"content"`
	ParentPath  string    `json:"parent_path"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// PageSummary is one node of the pages listing: the tree metadata without the
// body, so listing a space never reads every revision.
type PageSummary struct {
	ID          string         `json:"id"`
	WorkspaceID string         `json:"workspace_id"`
	SpaceID     string         `json:"space_id"`
	Path        string         `json:"path"`
	Title       string         `json:"title"`
	PageType    string         `json:"page_type"`
	Revision    int            `json:"revision"`
	ParentPath  string         `json:"parent_path"`
	UpdatedAt   time.Time      `json:"updated_at"`
	Children    []*PageSummary `json:"children,omitempty"`
}

// PageRevision is one recorded edit, with the body it recorded.
type PageRevision struct {
	ID          string    `json:"id"`
	PageID      *string   `json:"page_id"`
	Path        string    `json:"path"`
	Revision    int       `json:"revision"`
	ContentHash string    `json:"content_hash"`
	Content     string    `json:"content"`
	Summary     *string   `json:"summary"`
	CreatedAt   time.Time `json:"created_at"`
}

// PageBacklink is one edge pointing at a page.
type PageBacklink struct {
	ID           string    `json:"id"`
	SpaceID      string    `json:"space_id"`
	SourcePageID string    `json:"source_page_id"`
	SourcePath   string    `json:"source_path"`
	SourceTitle  string    `json:"source_title"`
	TargetPageID *string   `json:"target_page_id"`
	TargetPath   string    `json:"target_path"`
	Anchor       *string   `json:"anchor"`
	CreatedAt    time.Time `json:"created_at"`
}

// contentHashOf is the page/revision content hash, stored as hex sha256 so a
// client can compare two revisions without reading either body.
func contentHashOf(content string) string {
	sum := sha256.Sum256([]byte(content))
	return hex.EncodeToString(sum[:])
}

// normalizePath trims a wiki path: no leading or trailing separator, no doubled
// ones. The unique key is (workspace_id, space_id, path), so the shape this
// function produces *is* the identity of a page.
func normalizePath(path string) string {
	parts := strings.Split(strings.TrimSpace(path), "/")
	cleaned := make([]string, 0, len(parts))
	for _, part := range parts {
		if trimmed := strings.TrimSpace(part); trimmed != "" {
			cleaned = append(cleaned, trimmed)
		}
	}
	return strings.Join(cleaned, "/")
}

// parentPath is the path prefix of a page, "" at the root.
func parentPath(path string) string {
	if idx := strings.LastIndex(path, "/"); idx > 0 {
		return path[:idx]
	}
	return ""
}

// CreatePage inserts one page and its first revision, then returns the page.
func (s *Store) CreatePage(ctx context.Context, workspaceID, spaceID, path, title, pageType, content string) (Page, error) {
	path = normalizePath(path)
	if path == "" {
		return Page{}, fmt.Errorf("%w: path is required", ErrInvalidField)
	}
	if !isUUIDString(strings.TrimSpace(spaceID)) {
		return Page{}, fmt.Errorf("%w: space_id=%q is not a uuid", ErrInvalidField, spaceID)
	}
	if title = strings.TrimSpace(title); title == "" {
		title = path
		if idx := strings.LastIndex(title, "/"); idx >= 0 {
			title = title[idx+1:]
		}
	}
	if pageType = strings.TrimSpace(pageType); pageType == "" {
		pageType = "document"
	}
	if err := s.assertSpaceInWorkspace(ctx, workspaceID, spaceID); err != nil {
		return Page{}, err
	}

	var pageID string
	err := s.db.QueryRow(ctx, `
		INSERT INTO knowledge_pages
			(workspace_id, space_id, path, title, page_type, content_hash)
		VALUES ($1, $2, $3, $4, $5, $6)
		ON CONFLICT (workspace_id, space_id, path) DO NOTHING
		RETURNING id::text`,
		workspaceID, spaceID, path, title, pageType, contentHashOf(content)).Scan(&pageID)
	if errors.Is(err, pgx.ErrNoRows) {
		return Page{}, fmt.Errorf("%w: page path %q already exists in this space", ErrInvalidField, path)
	}
	if err != nil {
		return Page{}, fmt.Errorf("create knowledge page: %w", err)
	}

	var revisionID string
	if err := s.db.QueryRow(ctx, `
		INSERT INTO knowledge_page_revisions
			(workspace_id, space_id, page_id, path, content_hash, metadata)
		VALUES ($1, $2, $3, $4, $5,
			jsonb_build_object('revision', 1, 'content', $6::text))
		RETURNING id::text`,
		workspaceID, spaceID, pageID, path, contentHashOf(content), content).Scan(&revisionID); err != nil {
		return Page{}, fmt.Errorf("create knowledge page revision: %w", err)
	}
	if _, err := s.db.Exec(ctx, `
		UPDATE knowledge_pages
		SET current_revision_id = $3::uuid, updated_at = now()
		WHERE workspace_id = $1 AND id::text = $2`, workspaceID, pageID, revisionID); err != nil {
		return Page{}, fmt.Errorf("bind knowledge page revision: %w", err)
	}
	return s.GetPage(ctx, workspaceID, pageID)
}

const pageColumns = `p.id::text, p.workspace_id::text, p.space_id::text, p.path,
	coalesce(p.title, ''), coalesce(p.page_type, ''), coalesce(p.content_hash, ''),
	coalesce((SELECT NULLIF(r.metadata->>'revision', '')::int
	            FROM knowledge_page_revisions r
	           WHERE r.page_id = p.id
	           ORDER BY NULLIF(r.metadata->>'revision', '')::int DESC NULLS LAST
	           LIMIT 1), 0),
	coalesce((SELECT r.metadata->>'content'
	            FROM knowledge_page_revisions r
	           WHERE r.page_id = p.id
	           ORDER BY NULLIF(r.metadata->>'revision', '')::int DESC NULLS LAST
	           LIMIT 1), ''),
	p.created_at, p.updated_at`

func scanPage(row pgx.Row) (Page, error) {
	var page Page
	err := row.Scan(&page.ID, &page.WorkspaceID, &page.SpaceID, &page.Path,
		&page.Title, &page.PageType, &page.ContentHash, &page.Revision,
		&page.Content, &page.CreatedAt, &page.UpdatedAt)
	page.ParentPath = parentPath(page.Path)
	return page, err
}

// GetPage reads one page with its current body.
func (s *Store) GetPage(ctx context.Context, workspaceID, pageID string) (Page, error) {
	if !isUUIDString(pageID) {
		return Page{}, ErrPageNotFound
	}
	page, err := scanPage(s.db.QueryRow(ctx, `
		SELECT `+pageColumns+`
		FROM knowledge_pages p
		WHERE p.workspace_id = $1 AND p.id = $2`, workspaceID, pageID))
	if errors.Is(err, pgx.ErrNoRows) {
		return Page{}, ErrPageNotFound
	}
	if err != nil {
		return Page{}, fmt.Errorf("get knowledge page: %w", err)
	}
	return page, nil
}

// ListPages returns one space's pages as a flat, path-ordered list plus the tree
// built from those paths.
func (s *Store) ListPages(ctx context.Context, workspaceID, spaceID, query string) ([]PageSummary, []*PageSummary, error) {
	args := []any{workspaceID}
	where := []string{"p.workspace_id = $1"}
	if strings.TrimSpace(spaceID) != "" {
		if !isUUIDString(strings.TrimSpace(spaceID)) {
			return nil, nil, fmt.Errorf("%w: space_id=%q is not a uuid", ErrInvalidField, spaceID)
		}
		args = append(args, spaceID)
		where = append(where, fmt.Sprintf("p.space_id::text = $%d", len(args)))
	}
	if q := strings.TrimSpace(query); q != "" {
		args = append(args, "%"+q+"%")
		where = append(where, fmt.Sprintf("(p.path ILIKE $%d OR coalesce(p.title, '') ILIKE $%d)", len(args), len(args)))
	}

	rows, err := s.db.Query(ctx, `
		SELECT p.id::text, p.workspace_id::text, p.space_id::text, p.path,
		       coalesce(p.title, ''), coalesce(p.page_type, ''),
		       coalesce((SELECT NULLIF(r.metadata->>'revision', '')::int
		                   FROM knowledge_page_revisions r
		                  WHERE r.page_id = p.id
		                  ORDER BY NULLIF(r.metadata->>'revision', '')::int DESC NULLS LAST
		                  LIMIT 1), 0),
		       p.updated_at
		FROM knowledge_pages p
		WHERE `+strings.Join(where, " AND ")+`
		ORDER BY p.path`, args...)
	if err != nil {
		return nil, nil, fmt.Errorf("list knowledge pages: %w", err)
	}
	defer rows.Close()

	pages := make([]PageSummary, 0, 16)
	for rows.Next() {
		var page PageSummary
		if err := rows.Scan(&page.ID, &page.WorkspaceID, &page.SpaceID, &page.Path,
			&page.Title, &page.PageType, &page.Revision, &page.UpdatedAt); err != nil {
			return nil, nil, fmt.Errorf("scan knowledge page: %w", err)
		}
		page.ParentPath = parentPath(page.Path)
		pages = append(pages, page)
	}
	if err := rows.Err(); err != nil {
		return nil, nil, fmt.Errorf("list knowledge pages: %w", err)
	}
	return pages, buildPageTree(pages), nil
}

// buildPageTree nests the flat list by path. A page whose parent path has no row
// stays at the root: the tree is a view of the pages that exist, not a claim that
// every path prefix is a page.
func buildPageTree(pages []PageSummary) []*PageSummary {
	roots := make([]*PageSummary, 0, 4)
	byPath := make(map[string]*PageSummary, len(pages))
	nodes := make([]PageSummary, len(pages))
	copy(nodes, pages)
	for i := range nodes {
		byPath[nodes[i].Path] = &nodes[i]
	}
	for i := range nodes {
		node := &nodes[i]
		if parent, ok := byPath[node.ParentPath]; ok && node.ParentPath != "" {
			parent.Children = append(parent.Children, node)
			continue
		}
		roots = append(roots, node)
	}
	return roots
}

// PutPage writes a new revision of a page and repoints the page at it.
//
// baseRevision is the client's "the version I edited" claim: when it is set and
// no longer current, the write is refused instead of silently overwriting
// somebody else's edit. The revision number is computed in SQL from what is
// stored, so the returned number is the row's, not an expectation from Go.
func (s *Store) PutPage(ctx context.Context, workspaceID, pageID, content string, title *string, summary *string, baseRevision *int) (Page, error) {
	current, err := s.GetPage(ctx, workspaceID, pageID)
	if err != nil {
		return Page{}, err
	}
	if baseRevision != nil && *baseRevision != current.Revision {
		return Page{}, fmt.Errorf("%w: base_revision=%d but the page is at %d",
			ErrInvalidField, *baseRevision, current.Revision)
	}

	hash := contentHashOf(content)
	var revisionID string
	if err := s.db.QueryRow(ctx, `
		INSERT INTO knowledge_page_revisions
			(workspace_id, space_id, page_id, path, content_hash, summary, metadata)
		SELECT p.workspace_id, p.space_id, p.id, p.path, $3, $4,
		       jsonb_build_object(
		         'revision', coalesce((SELECT max(NULLIF(r.metadata->>'revision', '')::int)
		                                 FROM knowledge_page_revisions r
		                                WHERE r.page_id = p.id), 0) + 1,
		         'content', $5::text)
		FROM knowledge_pages p
		WHERE p.workspace_id = $1 AND p.id::text = $2
		RETURNING id::text`,
		workspaceID, pageID, hash, summary, content).Scan(&revisionID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return Page{}, ErrPageNotFound
		}
		return Page{}, fmt.Errorf("create knowledge page revision: %w", err)
	}

	args := []any{workspaceID, pageID, revisionID, hash}
	sets := []string{"current_revision_id = $3::uuid", "content_hash = $4", "updated_at = now()"}
	if title != nil {
		trimmed := strings.TrimSpace(*title)
		if trimmed == "" {
			return Page{}, fmt.Errorf("%w: title cannot be empty", ErrInvalidField)
		}
		args = append(args, trimmed)
		sets = append(sets, fmt.Sprintf("title = $%d", len(args)))
	}
	if _, err := s.db.Exec(ctx, fmt.Sprintf(`
		UPDATE knowledge_pages SET %s
		WHERE workspace_id = $1 AND id::text = $2`, strings.Join(sets, ", ")), args...); err != nil {
		return Page{}, fmt.Errorf("update knowledge page: %w", err)
	}
	return s.GetPage(ctx, workspaceID, pageID)
}

// ListPageRevisions returns every recorded revision of a page, newest first.
func (s *Store) ListPageRevisions(ctx context.Context, workspaceID, pageID string) (PageRevision, []PageRevision, error) {
	page, err := s.GetPage(ctx, workspaceID, pageID)
	if err != nil {
		return PageRevision{}, nil, err
	}
	rows, err := s.db.Query(ctx, `
		SELECT r.id::text, r.page_id::text, r.path,
		       coalesce(NULLIF(r.metadata->>'revision', '')::int, 0),
		       r.content_hash, coalesce(r.metadata->>'content', ''), r.summary, r.created_at
		FROM knowledge_page_revisions r
		WHERE r.workspace_id = $1 AND r.page_id::text = $2
		ORDER BY coalesce(NULLIF(r.metadata->>'revision', '')::int, 0) DESC`, workspaceID, page.ID)
	if err != nil {
		return PageRevision{}, nil, fmt.Errorf("list knowledge page revisions: %w", err)
	}
	defer rows.Close()
	out := make([]PageRevision, 0, 8)
	for rows.Next() {
		var rev PageRevision
		if err := rows.Scan(&rev.ID, &rev.PageID, &rev.Path, &rev.Revision,
			&rev.ContentHash, &rev.Content, &rev.Summary, &rev.CreatedAt); err != nil {
			return PageRevision{}, nil, fmt.Errorf("scan knowledge page revision: %w", err)
		}
		out = append(out, rev)
	}
	if err := rows.Err(); err != nil {
		return PageRevision{}, nil, fmt.Errorf("list knowledge page revisions: %w", err)
	}
	// The page is returned with the list so a caller renders "v3 of 3" without a
	// second request.
	return PageRevision{
		ID:          page.ID,
		Path:        page.Path,
		Revision:    page.Revision,
		ContentHash: page.ContentHash,
		Content:     page.Content,
		CreatedAt:   page.CreatedAt,
	}, out, nil
}

// ListPageBacklinks returns the edges that point at one page.
func (s *Store) ListPageBacklinks(ctx context.Context, workspaceID, pageID string) ([]PageBacklink, error) {
	if _, err := s.GetPage(ctx, workspaceID, pageID); err != nil {
		return nil, err
	}
	rows, err := s.db.Query(ctx, `
		SELECT b.id::text, b.space_id::text, b.source_page_id::text,
		       coalesce(p.path, ''), coalesce(p.title, ''),
		       b.target_page_id::text, b.target_path, b.anchor, b.created_at
		FROM knowledge_page_backlinks b
		LEFT JOIN knowledge_pages p
		  ON p.workspace_id = b.workspace_id AND p.id = b.source_page_id
		WHERE b.workspace_id = $1 AND b.target_page_id::text = $2
		ORDER BY b.created_at, b.id`, workspaceID, pageID)
	if err != nil {
		return nil, fmt.Errorf("list knowledge page backlinks: %w", err)
	}
	defer rows.Close()
	out := make([]PageBacklink, 0, 4)
	for rows.Next() {
		var link PageBacklink
		if err := rows.Scan(&link.ID, &link.SpaceID, &link.SourcePageID, &link.SourcePath,
			&link.SourceTitle, &link.TargetPageID, &link.TargetPath, &link.Anchor,
			&link.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan knowledge page backlink: %w", err)
		}
		out = append(out, link)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("list knowledge page backlinks: %w", err)
	}
	return out, nil
}
