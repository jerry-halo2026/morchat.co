package knowledge

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"path"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// The import pipeline: upload-url -> import task -> parse -> chunk -> store.
//
// The task row is the pipeline's only durable contract. A POST /import writes it
// as `pending` and returns immediately; one goroutine walks it through
// `parsing`, `chunking`, and `done` (or `failed`), and every step is a guarded
// UPDATE whose WHERE clause names the status it expects. Two consequences worth
// stating because they are the reason for the shape:
//
//   - A client can lose the SSE stream, crash, and still learn exactly what
//     happened from GET /import/{id}; the progress integer the stream emits and
//     the one the poll returns are the same column.
//   - A retry or a duplicated goroutine cannot rewind a finished task: the
//     transition table and the WHERE clause both refuse it, and the loser of the
//     race gets ErrImportTransition.

// ImportStatus is the closed status set enforced by migration 641's CHECK.
const (
	ImportStatusPending  = "pending"
	ImportStatusParsing  = "parsing"
	ImportStatusChunking = "chunking"
	ImportStatusDone     = "done"
	ImportStatusFailed   = "failed"
)

// ImportProgress* are the milestones a task reports. They are the wire values, so
// they are chosen to be monotone and readable, not evenly spaced: parsing is
// cheap, chunking is where the work is.
const (
	ImportProgressPending  = 0
	ImportProgressParsing  = 10
	ImportProgressChunking = 55
	ImportProgressDone     = 100
)

// importTransitions is the state machine. `failed` is reachable from every
// non-terminal state and terminal states are final 鈥?there is no `done ->
// parsing`, because a finished import is a stored generation, not a retry.
var importTransitions = map[string][]string{
	ImportStatusPending:  {ImportStatusParsing, ImportStatusFailed},
	ImportStatusParsing:  {ImportStatusChunking, ImportStatusFailed},
	ImportStatusChunking: {ImportStatusDone, ImportStatusFailed},
	ImportStatusDone:     {},
	ImportStatusFailed:   {},
}

// ErrImportTransition is returned when a status change is not in
// importTransitions, or when the row moved underneath the caller (the guarded
// UPDATE matched nothing).
var ErrImportTransition = errors.New("knowledge: illegal import transition")

// ErrImportTaskNotFound mirrors ErrItemNotFound for import tasks.
var ErrImportTaskNotFound = errors.New("knowledge: import task not found")

// ErrUnsupportedMedia is returned by ParseDocument for a payload the pipeline
// cannot read. Markdown and plain text only: the PDF/DOCX path is the
// ragflow_deepdoc engine's job and lands with it.
var ErrUnsupportedMedia = errors.New("knowledge: unsupported media type")

// ErrKnowledgeForbidden is the retrieval ACL's fail-closed answer. The handler
// maps it to 403 with code `knowledge_forbidden`.
var ErrKnowledgeForbidden = errors.New("knowledge: forbidden")

const (
	// UploadURLTTL is the presigned PUT lifetime. Thirty minutes is long enough
	// for a slow upload and short enough that a leaked URL is not a standing
	// grant.
	UploadURLTTL = 30 * time.Minute
	// maxImportBytes bounds one import. A knowledge base is made of many
	// documents; refusing a 100MB paste keeps one request from pinning a
	// connection and a chunker for minutes.
	maxImportBytes = 32 << 20
	// importTimeout bounds one background import end to end.
	importTimeout = 5 * time.Minute
)

// ObjectSource is the read half of storage.Storage the pipeline needs. Kept as
// its own interface so a test can hand over bytes without an S3 client.
type ObjectSource interface {
	GetReader(ctx context.Context, key string) (io.ReadCloser, error)
}

// UploadSigner is storage.UploadPresigner, repeated here so the knowledge
// package does not import storage (and its AWS SDK) just for a type.
type UploadSigner interface {
	PresignPut(ctx context.Context, key, contentType string, ttl time.Duration) (string, error)
}

// DB is the slice of pgx the pipeline needs. *pgxpool.Pool and pgx.Tx both
// satisfy it, which is what lets the DB-backed tests run inside a rolled-back
// transaction when they need to.
type DB interface {
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

// Embedder turns query text into a vector. The pipeline does not import an
// embedding model in this phase: a nil Embedder is the normal configuration and
// makes the vector channel degrade to the keyword channel instead of failing.
type Embedder interface {
	Embed(ctx context.Context, texts []string) ([][]float32, error)
}

// Service owns the knowledge pipeline over one database.
type Service struct {
	db    DB
	store *Store
	// objects and uploads are optional: without them the inline-content import
	// path and the preview endpoint still work, while upload-url answers 503.
	objects ObjectSource
	uploads UploadSigner
	embed   Embedder
	now     func() time.Time
	// synchronous runs the pipeline inline instead of in a goroutine. Tests
	// use it to assert the terminal state without polling; the API leaves it
	// off so POST /import answers before parsing starts.
	synchronous bool
	logger      *slog.Logger

	capabilitiesOnce sync.Once
	capabilities     chunkCapabilities
	capabilitiesErr  error
}

// Option configures a Service.
type Option func(*Service)

// WithObjectSource wires the read half of storage.
func WithObjectSource(src ObjectSource) Option {
	return func(s *Service) {
		if src != nil {
			s.objects = src
		}
	}
}

// WithUploadSigner wires presigned uploads.
func WithUploadSigner(signer UploadSigner) Option {
	return func(s *Service) {
		if signer != nil {
			s.uploads = signer
		}
	}
}

// WithEmbedder wires the vector channel. A nil embedder is legal.
func WithEmbedder(e Embedder) Option {
	return func(s *Service) { s.embed = e }
}

// WithClock replaces the clock, for tests that assert finished_at.
func WithClock(now func() time.Time) Option {
	return func(s *Service) {
		if now != nil {
			s.now = now
		}
	}
}

// WithSynchronousImport runs imports inline. Test seam; never set by the API.
func WithSynchronousImport() Option {
	return func(s *Service) { s.synchronous = true }
}

// WithLogger sets the logger the background pipeline reports through.
func WithLogger(l *slog.Logger) Option {
	return func(s *Service) {
		if l != nil {
			s.logger = l
		}
	}
}

// NewService builds a Service over db.
func NewService(db DB, opts ...Option) *Service {
	s := &Service{
		db:     db,
		store:  NewStore(db),
		now:    time.Now,
		logger: slog.Default(),
	}
	for _, opt := range opts {
		opt(s)
	}
	return s
}

// Store exposes the persistence layer for callers that need item/document
// creation outside the pipeline (the wiki endpoints, tools).
func (s *Service) Store() *Store { return s.store }

// ImportTask is one row of knowledge_import_tasks as the API returns it.
//
// `Error` and `FinishedAt` are pointers so "still running" and "finished with no
// error" stay distinguishable on the wire, which is the only way a client can
// tell a done task from one that has not started.
type ImportTask struct {
	ID          string          `json:"id"`
	WorkspaceID string          `json:"workspace_id"`
	SpaceID     string          `json:"space_id"`
	Title       string          `json:"title"`
	SourceType  string          `json:"source_type"`
	SourceRef   string          `json:"source_ref"`
	Status      string          `json:"status"`
	Progress    int             `json:"progress"`
	Error       *string         `json:"error"`
	ChunkConfig json.RawMessage `json:"chunk_config"`
	ItemID      *string         `json:"item_id"`
	DocumentID  *string         `json:"document_id"`
	ChunkCount  int             `json:"chunk_count"`
	CreatedAt   time.Time       `json:"created_at"`
	FinishedAt  *time.Time      `json:"finished_at"`
}

// Terminal reports whether the task has stopped moving, which is what lets both
// the SSE stream and the poller know to stop.
func (t ImportTask) Terminal() bool {
	return t.Status == ImportStatusDone || t.Status == ImportStatusFailed
}

const importTaskColumns = `id, workspace_id, space_id, title, source_type, source_ref,
	status, progress, error, chunk_config, item_id, document_id, chunk_count,
	created_at, finished_at`

func scanImportTask(row pgx.Row) (ImportTask, error) {
	var (
		task    ImportTask
		docID   *string
		itemID  *string
		cfg     []byte
		errText *string
	)
	if err := row.Scan(&task.ID, &task.WorkspaceID, &task.SpaceID, &task.Title,
		&task.SourceType, &task.SourceRef, &task.Status, &task.Progress, &errText,
		&cfg, &itemID, &docID, &task.ChunkCount, &task.CreatedAt, &task.FinishedAt); err != nil {
		return ImportTask{}, err
	}
	task.Error = errText
	task.ItemID = itemID
	task.DocumentID = docID
	if len(cfg) == 0 {
		cfg = []byte("{}")
	}
	task.ChunkConfig = json.RawMessage(cfg)
	return task, nil
}

// UploadTicket is the answer to POST /api/knowledge/upload-url.
type UploadTicket struct {
	Key       string    `json:"key"`
	UploadURL string    `json:"upload_url"`
	Method    string    `json:"method"`
	ExpiresAt time.Time `json:"expires_at"`
}

// RequestUploadURL mints a presigned PUT for one import object.
//
// The key is namespaced by workspace and by a fresh uuid, so two imports of the
// same filename never collide and a key cannot be guessed into another
// workspace's prefix.
func (s *Service) RequestUploadURL(ctx context.Context, workspaceID, filename, contentType string) (UploadTicket, error) {
	if strings.TrimSpace(workspaceID) == "" {
		return UploadTicket{}, fmt.Errorf("%w: workspace_id is required", ErrInvalidField)
	}
	if s.uploads == nil {
		return UploadTicket{}, fmt.Errorf("%w: object storage is not configured", ErrUploadUnavailable)
	}
	name := sanitizeFilename(filename)
	if name == "" {
		name = "document.md"
	}
	if contentType == "" {
		contentType = mimeForName(name)
	}
	key := fmt.Sprintf("knowledge/imports/%s/%s/%s", workspaceID, uuid.NewString(), name)
	url, err := s.uploads.PresignPut(ctx, key, contentType, UploadURLTTL)
	if err != nil {
		return UploadTicket{}, fmt.Errorf("presign knowledge import: %w", err)
	}
	return UploadTicket{
		Key:       key,
		UploadURL: url,
		Method:    "PUT",
		ExpiresAt: s.now().Add(UploadURLTTL),
	}, nil
}

// ErrUploadUnavailable is returned when no presigner is configured. The handler
// answers 503: the deployment, not the request, is what is missing.
var ErrUploadUnavailable = errors.New("knowledge: upload signing unavailable")

// ImportRequest starts one import.
type ImportRequest struct {
	WorkspaceID string
	SpaceID     string
	Title       string
	SourceType  string
	SourceRef   string
	MIME        string
	// Content is inline document text. When empty the pipeline reads SourceRef
	// through ObjectSource, which is the presigned-upload path.
	Content []byte
	Chunk   ChunkConfig
	ACLMode string
	OwnerID string
}

// StartImport records a task and 鈥?unless the Service is synchronous 鈥?starts the
// background run.
func (s *Service) StartImport(ctx context.Context, in ImportRequest) (ImportTask, error) {
	if strings.TrimSpace(in.WorkspaceID) == "" {
		return ImportTask{}, fmt.Errorf("%w: workspace_id is required", ErrInvalidField)
	}
	if strings.TrimSpace(in.SpaceID) == "" {
		return ImportTask{}, fmt.Errorf("%w: space_id is required", ErrInvalidField)
	}
	sourceType := in.SourceType
	if sourceType == "" {
		sourceType = SourceTypeUpload
	}
	if !SourceType.Has(sourceType) {
		return ImportTask{}, fmt.Errorf("%w: source_type=%q not in %v",
			ErrInvalidField, sourceType, SourceType.Values)
	}
	if strings.TrimSpace(in.SourceRef) == "" && len(in.Content) == 0 {
		return ImportTask{}, fmt.Errorf("%w: source_ref or content is required", ErrInvalidField)
	}
	aclMode := in.ACLMode
	if aclMode == "" {
		aclMode = ACLMode.Default
	}
	if !ACLMode.Has(aclMode) {
		return ImportTask{}, fmt.Errorf("%w: acl_mode=%q not in %v",
			ErrInvalidField, aclMode, ACLMode.Values)
	}
	if err := s.store.assertSpaceInWorkspace(ctx, in.WorkspaceID, in.SpaceID); err != nil {
		return ImportTask{}, err
	}
	cfg, err := in.Chunk.WithDefaults()
	if err != nil {
		return ImportTask{}, err
	}
	cfgJSON, err := json.Marshal(cfg)
	if err != nil {
		return ImportTask{}, fmt.Errorf("encode chunk config: %w", err)
	}

	var task ImportTask
	row := s.db.QueryRow(ctx, `
		INSERT INTO knowledge_import_tasks
			(workspace_id, space_id, title, source_type, source_ref, status, progress, chunk_config)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		RETURNING `+importTaskColumns,
		in.WorkspaceID, in.SpaceID, strings.TrimSpace(in.Title), sourceType,
		in.SourceRef, ImportStatusPending, ImportProgressPending, cfgJSON)
	task, err = scanImportTask(row)
	if err != nil {
		return ImportTask{}, fmt.Errorf("create knowledge import task: %w", err)
	}

	run := func() {
		// The request context dies with the HTTP response; the import must not.
		bg, cancel := context.WithTimeout(context.WithoutCancel(ctx), importTimeout)
		defer cancel()
		s.runImport(bg, task, in, cfg)
	}
	if s.synchronous {
		run()
		refreshed, err := s.GetImportTask(context.WithoutCancel(ctx), in.WorkspaceID, task.ID)
		if err != nil {
			return task, err
		}
		return refreshed, nil
	}
	go run()
	return task, nil
}

// GetImportTask reads one task inside its workspace.
func (s *Service) GetImportTask(ctx context.Context, workspaceID, taskID string) (ImportTask, error) {
	task, err := scanImportTask(s.db.QueryRow(ctx, `
		SELECT `+importTaskColumns+`
		FROM knowledge_import_tasks
		WHERE workspace_id = $1 AND id::text = $2`, workspaceID, taskID))
	if errors.Is(err, pgx.ErrNoRows) {
		return ImportTask{}, ErrImportTaskNotFound
	}
	if err != nil {
		return ImportTask{}, fmt.Errorf("get knowledge import task: %w", err)
	}
	return task, nil
}

// runImport walks one task to a terminal state. Every failure is recorded on the
// task rather than returned: the caller is a goroutine nobody is waiting on.
func (s *Service) runImport(ctx context.Context, task ImportTask, in ImportRequest, cfg ChunkConfig) {
	fail := func(stage string, err error) {
		s.logger.Warn("knowledge import failed", "task", task.ID, "stage", stage, "error", err)
		if _, ferr := s.finishTask(ctx, task, ImportStatusFailed, nil, nil, 0,
			stage+": "+truncateError(err)); ferr != nil {
			s.logger.Error("knowledge import: could not record failure",
				"task", task.ID, "error", ferr)
		}
	}

	if updated, err := s.advance(ctx, task, ImportStatusParsing, ImportProgressParsing); err != nil {
		if errors.Is(err, ErrImportTransition) {
			return // someone else owns this task now
		}
		fail("parsing", err)
		return
	} else {
		// The guarded UPDATE is the authority on the row's status, so the local
		// copy follows it: the next transition must name the status the database
		// actually holds, not the one this goroutine remembers.
		task = updated
	}

	raw := in.Content
	if len(raw) == 0 {
		if s.objects == nil {
			fail("parsing", fmt.Errorf("%w: object storage is not configured", ErrUploadUnavailable))
			return
		}
		data, err := readObject(ctx, s.objects, in.SourceRef)
		if err != nil {
			fail("parsing", err)
			return
		}
		raw = data
	}

	parsed, err := ParseDocument(in.SourceRef, in.MIME, raw)
	if err != nil {
		fail("parsing", err)
		return
	}

	if updated, err := s.advance(ctx, task, ImportStatusChunking, ImportProgressChunking); err != nil {
		if errors.Is(err, ErrImportTransition) {
			return
		}
		fail("chunking", err)
		return
	} else {
		task = updated
	}

	drafts, err := Split(parsed.Text, cfg)
	if err != nil {
		fail("chunking", err)
		return
	}
	if len(drafts) == 0 {
		fail("chunking", fmt.Errorf("%w: document has no text to chunk", ErrInvalidField))
		return
	}

	title := strings.TrimSpace(in.Title)
	if title == "" {
		title = parsed.Title
	}
	if title == "" {
		title = path.Base(strings.TrimSpace(in.SourceRef))
	}
	if title == "" || title == "." {
		title = "imported document"
	}

	item, err := s.store.CreateItem(ctx, NewItem{
		WorkspaceID: in.WorkspaceID,
		SpaceID:     in.SpaceID,
		Title:       title,
		Kind:        KindDoc,
		SourceType:  in.SourceType,
		SourceRef:   in.SourceRef,
		Status:      StatusActive,
		ACLMode:     in.ACLMode,
		OwnerID:     optionalString(in.OwnerID),
	})
	if err != nil {
		fail("storing item", err)
		return
	}

	sum := sha256.Sum256(raw)
	var storageKey *string
	if strings.TrimSpace(in.SourceRef) != "" {
		key := in.SourceRef
		storageKey = &key
	}
	doc, err := s.store.CreateDocument(ctx, NewDocument{
		WorkspaceID: in.WorkspaceID,
		ItemID:      item.ID,
		Version:     1,
		Mime:        parsed.MIME,
		Bytes:       int64(len(raw)),
		SHA256:      hex.EncodeToString(sum[:]),
		StorageKey:  storageKey,
		ParseEngine: ParseEngineNative,
	})
	if err != nil {
		fail("storing document", err)
		return
	}

	for _, draft := range drafts {
		meta := map[string]any{"level": draft.Level, "chunk_mode": cfg.Mode}
		if draft.ParentOrd != nil {
			meta["parent_ord"] = *draft.ParentOrd
		}
		if _, err := s.store.CreateChunk(ctx, NewChunk{
			WorkspaceID: in.WorkspaceID,
			DocumentID:  doc.ID,
			Generation:  doc.Generation,
			Ord:         draft.Ord,
			Content:     draft.Content,
			Tokens:      draft.Tokens,
			HeadingPath: draft.HeadingPath,
			ACLTags:     []string{},
			Metadata:    meta,
		}); err != nil {
			fail("storing chunks", err)
			return
		}
	}

	itemID, docID := item.ID, doc.ID
	if _, err := s.finishTask(ctx, task, ImportStatusDone, &itemID, &docID, len(drafts), ""); err != nil {
		s.logger.Error("knowledge import: could not mark done", "task", task.ID, "error", err)
	}
}

// advance moves a task forward and bumps progress.
func (s *Service) advance(ctx context.Context, task ImportTask, to string, progress int) (ImportTask, error) {
	if !canImportTransition(task.Status, to) {
		return ImportTask{}, fmt.Errorf("%w: %s -> %s", ErrImportTransition, task.Status, to)
	}
	row := s.db.QueryRow(ctx, `
		UPDATE knowledge_import_tasks
		SET status = $3, progress = $4
		WHERE workspace_id = $1 AND id = $2 AND status = $5
		RETURNING `+importTaskColumns,
		task.WorkspaceID, task.ID, to, progress, task.Status)
	updated, err := scanImportTask(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return ImportTask{}, fmt.Errorf("%w: %s -> %s was already taken", ErrImportTransition, task.Status, to)
	}
	if err != nil {
		return ImportTask{}, fmt.Errorf("advance import task: %w", err)
	}
	return updated, nil
}

// finishTask closes a task as done or failed.
func (s *Service) finishTask(ctx context.Context, task ImportTask, to string,
	itemID, documentID *string, chunkCount int, errText string) (ImportTask, error) {
	if !canImportTransition(task.Status, to) {
		return ImportTask{}, fmt.Errorf("%w: %s -> %s", ErrImportTransition, task.Status, to)
	}
	progress := ImportProgressDone
	if to == ImportStatusFailed {
		progress = task.Progress
	}
	var errValue *string
	if strings.TrimSpace(errText) != "" {
		trimmed := truncateError(errors.New(errText))
		errValue = &trimmed
	}
	row := s.db.QueryRow(ctx, `
		UPDATE knowledge_import_tasks
		SET status = $3, progress = $4, error = $5, item_id = $6, document_id = $7,
		    chunk_count = $8, finished_at = now()
		WHERE workspace_id = $1 AND id = $2 AND status = $9
		RETURNING `+importTaskColumns,
		task.WorkspaceID, task.ID, to, progress, errValue, itemID, documentID,
		chunkCount, task.Status)
	updated, err := scanImportTask(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return ImportTask{}, fmt.Errorf("%w: %s -> %s was already taken", ErrImportTransition, task.Status, to)
	}
	if err != nil {
		return ImportTask{}, fmt.Errorf("finish import task: %w", err)
	}
	return updated, nil
}

// canImportTransition is the pure half of the state machine; the guarded UPDATE
// is the transactional half.
func canImportTransition(from, to string) bool {
	for _, candidate := range importTransitions[from] {
		if candidate == to {
			return true
		}
	}
	return false
}

// PreviewRequest asks what Split would produce for a document without writing.
type PreviewRequest struct {
	WorkspaceID string
	SourceRef   string
	MIME        string
	// Content is inline text. When empty, SourceRef is read through
	// ObjectSource 鈥?the same resolution order StartImport uses, which is what
	// makes preview an honest rehearsal.
	Content []byte
	Chunk   ChunkConfig
}

// PreviewResult is the rehearsal's answer.
type PreviewResult struct {
	Chunks []ChunkDraft `json:"chunks"`
	Config ChunkConfig  `json:"config"`
	Tokens int          `json:"tokens"`
	Text   int          `json:"text_bytes"`
}

// PreviewChunks runs parse + chunk and returns the drafts. It touches no table:
// the only database use is the space check StartImport also performs, so a
// preview cannot be mistaken for an import that half-succeeded.
func (s *Service) PreviewChunks(ctx context.Context, in PreviewRequest) (PreviewResult, error) {
	if strings.TrimSpace(in.WorkspaceID) == "" {
		return PreviewResult{}, fmt.Errorf("%w: workspace_id is required", ErrInvalidField)
	}
	cfg, err := in.Chunk.WithDefaults()
	if err != nil {
		return PreviewResult{}, err
	}
	raw := in.Content
	if len(raw) == 0 {
		if strings.TrimSpace(in.SourceRef) == "" {
			return PreviewResult{}, fmt.Errorf("%w: source_ref or content is required", ErrInvalidField)
		}
		if s.objects == nil {
			return PreviewResult{}, fmt.Errorf("%w: object storage is not configured", ErrUploadUnavailable)
		}
		data, err := readObject(ctx, s.objects, in.SourceRef)
		if err != nil {
			return PreviewResult{}, err
		}
		raw = data
	}
	parsed, err := ParseDocument(in.SourceRef, in.MIME, raw)
	if err != nil {
		return PreviewResult{}, err
	}
	drafts, err := Split(parsed.Text, cfg)
	if err != nil {
		return PreviewResult{}, err
	}
	total := 0
	for _, draft := range drafts {
		total += draft.Tokens
	}
	return PreviewResult{Chunks: drafts, Config: cfg, Tokens: total, Text: len(raw)}, nil
}

// ParsedDocument is what ParseDocument extracted.
type ParsedDocument struct {
	Title string
	Text  string
	MIME  string
}

// ParseDocument turns an uploaded payload into text plus a title.
//
// Markdown and plain text only (see ErrUnsupportedMedia). The title is the first
// ATX H1 when there is one, then the first non-empty line, then the filename 鈥?// each a better guess than the previous, and none of them a claim about the
// document's own metadata, which a parser that understands the format will
// replace later.
func ParseDocument(name, contentType string, raw []byte) (ParsedDocument, error) {
	if len(raw) == 0 {
		return ParsedDocument{}, fmt.Errorf("%w: empty document", ErrInvalidField)
	}
	if len(raw) > maxImportBytes {
		return ParsedDocument{}, fmt.Errorf("%w: document exceeds %d bytes",
			ErrInvalidField, maxImportBytes)
	}
	// A NUL byte means this is not text, whatever the extension says.
	for _, b := range raw {
		if b == 0 {
			return ParsedDocument{}, fmt.Errorf("%w: payload contains NUL bytes", ErrUnsupportedMedia)
		}
	}
	ext := strings.ToLower(path.Ext(name))
	if contentType == "" {
		contentType = mimeForName(name)
	}
	switch ext {
	case ".md", ".markdown", ".mdx", ".txt", ".text", ".log", "":
	default:
		return ParsedDocument{}, fmt.Errorf("%w: %s", ErrUnsupportedMedia, ext)
	}
	text := strings.ReplaceAll(string(raw), "\r\n", "\n")
	text = strings.ReplaceAll(text, "\r", "\n")
	text = stripFrontMatter(text)

	parsed := ParsedDocument{Text: text, MIME: contentType}
	if parsed.MIME == "" {
		parsed.MIME = "text/markdown"
	}
	for _, line := range strings.Split(text, "\n") {
		if level, title, ok := parseHeading(line); ok && level == 1 && title != "" {
			parsed.Title = title
			break
		}
	}
	if parsed.Title == "" {
		for _, line := range strings.Split(text, "\n") {
			if trimmed := strings.TrimSpace(line); trimmed != "" {
				parsed.Title = trimTitle(trimmed)
				break
			}
		}
	}
	if parsed.Title == "" {
		base := path.Base(strings.TrimSpace(name))
		if base != "." && base != "/" {
			parsed.Title = strings.TrimSuffix(base, path.Ext(base))
		}
	}
	return parsed, nil
}

// stripFrontMatter removes a leading `---` YAML block. It is dropped rather than
// parsed: task 641's chunker has no business inventing metadata, and leaving the
// block in the text would make every first chunk about the document instead of
// its content.
func stripFrontMatter(text string) string {
	if !strings.HasPrefix(text, "---\n") {
		return text
	}
	rest := text[len("---\n"):]
	if idx := strings.Index(rest, "\n---"); idx >= 0 {
		after := rest[idx+len("\n---"):]
		after = strings.TrimPrefix(after, "\n")
		return after
	}
	return text
}

// trimTitle keeps a title a single line of sane length.
func trimTitle(s string) string {
	s = strings.TrimSpace(strings.TrimLeft(s, "#"))
	if idx := strings.IndexByte(s, '\n'); idx >= 0 {
		s = s[:idx]
	}
	const max = 200
	if len(s) > max {
		s = strings.TrimSpace(s[:max])
	}
	return s
}

// readObject reads a stored object with the size cap applied while streaming, so
// an oversized object cannot be pulled into memory before it is rejected.
func readObject(ctx context.Context, src ObjectSource, key string) ([]byte, error) {
	if strings.TrimSpace(key) == "" {
		return nil, fmt.Errorf("%w: source_ref is required", ErrInvalidField)
	}
	rc, err := src.GetReader(ctx, key)
	if err != nil {
		return nil, fmt.Errorf("read import object %s: %w", key, err)
	}
	defer rc.Close()
	data, err := io.ReadAll(io.LimitReader(rc, maxImportBytes+1))
	if err != nil {
		return nil, fmt.Errorf("read import object %s: %w", key, err)
	}
	if len(data) > maxImportBytes {
		return nil, fmt.Errorf("%w: object exceeds %d bytes", ErrInvalidField, maxImportBytes)
	}
	return data, nil
}

// sanitizeFilename keeps the last path element and strips the characters that
// would let a filename escape its key prefix.
func sanitizeFilename(name string) string {
	name = strings.TrimSpace(name)
	if name == "" {
		return ""
	}
	name = strings.ReplaceAll(name, "\\", "/")
	name = path.Base(name)
	name = strings.Map(func(r rune) rune {
		switch r {
		case '/', '\\', ':', '*', '?', '"', '<', '>', '|', 0:
			return -1
		}
		return r
	}, name)
	if name == "." || name == ".." {
		return ""
	}
	const max = 120
	if len(name) > max {
		ext := path.Ext(name)
		keep := max - len(ext)
		if keep < 1 {
			keep = max
			ext = ""
		}
		name = name[:keep] + ext
	}
	return name
}

// mimeForName guesses a content type from the extension for the two families the
// pipeline reads.
func mimeForName(name string) string {
	switch strings.ToLower(path.Ext(name)) {
	case ".md", ".markdown", ".mdx":
		return "text/markdown"
	case ".txt", ".text", ".log":
		return "text/plain"
	}
	return "application/octet-stream"
}

// truncateError keeps a stored error message readable in a UI and inside the
// DDL's unconstrained text column.
func truncateError(err error) string {
	if err == nil {
		return ""
	}
	msg := strings.TrimSpace(err.Error())
	const max = 2000
	if len(msg) > max {
		msg = msg[:max] + "..."
	}
	return msg
}

// optionalString maps "" to nil, which is what a nullable uuid column wants.
func optionalString(v string) *string {
	if strings.TrimSpace(v) == "" {
		return nil
	}
	return &v
}
