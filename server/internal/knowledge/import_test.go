package knowledge

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"os"
	"strings"
	"testing"
)

// Import pipeline tests. The pure ones (parse, state machine) always run; the
// DB-backed ones follow the package's fixture pattern and skip when the database
// is unreachable.

// quietLogger keeps the background pipeline's warnings out of test output.
func quietLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

func testService(opts ...Option) *Service {
	base := []Option{WithLogger(quietLogger())}
	return NewService(testPool, append(base, opts...)...)
}

// cleanupImportTasks registers a teardown for the task rows this test created.
func cleanupImportTasks(t *testing.T) {
	t.Helper()
	dbfx.Cleanup(t, `DELETE FROM knowledge_import_tasks WHERE workspace_id = $1`, testWorkspaceID)
}

// fakeObjects is an ObjectSource over an in-memory key map, standing in for the
// presigned-upload read path without an S3 client.
type fakeObjects map[string]string

func (f fakeObjects) GetReader(_ context.Context, key string) (io.ReadCloser, error) {
	body, ok := f[key]
	if !ok {
		return nil, os.ErrNotExist
	}
	return io.NopCloser(strings.NewReader(body)), nil
}

// importDoc is the document every DB test imports: long enough to split into
// several chunks, with one term ("zeppelin") that no other text contains, so a
// retrieval assertion cannot pass by accident.
func importDoc() string {
	var b strings.Builder
	b.WriteString("# Retrieval handbook\n\n")
	b.WriteString("The knowledge base answers questions about zeppelin scheduling. ")
	b.WriteString("A zeppelin is a rigid airship; scheduling one is the example this page exists for.\n\n")
	b.WriteString("## Chunking\n\n")
	for i := 0; i < 120; i++ {
		fmt.Fprintf(&b, "Sentence %d explains the general rule about windows, overlap, and headings. ", i)
	}
	b.WriteString("\n\n## Fusion\n\n")
	for i := 0; i < 60; i++ {
		fmt.Fprintf(&b, "Fusion note %d describes reciprocal rank fusion with k equal to sixty. ", i)
	}
	b.WriteString("\n")
	return b.String()
}

func TestParseDocumentExtractsTitleAndDropsFrontMatter(t *testing.T) {
	raw := []byte("---\ntitle: ignored\ntags: [a, b]\n---\n# Real title\n\nBody text.\n")
	parsed, err := ParseDocument("notes.md", "", raw)
	if err != nil {
		t.Fatalf("ParseDocument: %v", err)
	}
	if parsed.Title != "Real title" {
		t.Fatalf("title = %q, want %q", parsed.Title, "Real title")
	}
	if strings.Contains(parsed.Text, "tags:") {
		t.Fatalf("front matter survived parsing: %q", parsed.Text)
	}
	if parsed.MIME != "text/markdown" {
		t.Fatalf("mime = %q, want text/markdown", parsed.MIME)
	}
}

func TestParseDocumentFallsBackToFirstLineThenFilename(t *testing.T) {
	parsed, err := ParseDocument("plain.txt", "", []byte("First line is the title\nsecond line\n"))
	if err != nil {
		t.Fatalf("ParseDocument: %v", err)
	}
	if parsed.Title != "First line is the title" {
		t.Fatalf("title = %q", parsed.Title)
	}

	parsed, err = ParseDocument("dir/quarterly-review.md", "", []byte("\n\n"))
	if err != nil {
		t.Fatalf("ParseDocument: %v", err)
	}
	if parsed.Title != "quarterly-review" {
		t.Fatalf("title from filename = %q", parsed.Title)
	}
}

func TestParseDocumentRejectsWhatThePipelineCannotRead(t *testing.T) {
	if _, err := ParseDocument("scan.pdf", "application/pdf", []byte("%PDF-1.7")); !errors.Is(err, ErrUnsupportedMedia) {
		t.Fatalf("pdf accepted: %v", err)
	}
	if _, err := ParseDocument("binary.md", "", []byte{'a', 0, 'b'}); !errors.Is(err, ErrUnsupportedMedia) {
		t.Fatalf("NUL payload accepted: %v", err)
	}
	if _, err := ParseDocument("empty.md", "", nil); !errors.Is(err, ErrInvalidField) {
		t.Fatalf("empty payload accepted: %v", err)
	}
}

// TestImportStateMachineTable pins the transition table itself: this is the pure
// half of the guard whose SQL half is the WHERE clause in advance/finishTask.
func TestImportStateMachineTable(t *testing.T) {
	for _, tc := range []struct {
		from, to string
		ok       bool
	}{
		{ImportStatusPending, ImportStatusParsing, true},
		{ImportStatusPending, ImportStatusFailed, true},
		{ImportStatusPending, ImportStatusDone, false},
		{ImportStatusPending, ImportStatusChunking, false},
		{ImportStatusParsing, ImportStatusChunking, true},
		{ImportStatusParsing, ImportStatusFailed, true},
		{ImportStatusParsing, ImportStatusDone, false},
		{ImportStatusChunking, ImportStatusDone, true},
		{ImportStatusChunking, ImportStatusFailed, true},
		{ImportStatusDone, ImportStatusParsing, false},
		{ImportStatusDone, ImportStatusFailed, false},
		{ImportStatusFailed, ImportStatusParsing, false},
		{ImportStatusFailed, ImportStatusDone, false},
	} {
		if got := canImportTransition(tc.from, tc.to); got != tc.ok {
			t.Errorf("canImportTransition(%s -> %s) = %v, want %v", tc.from, tc.to, got, tc.ok)
		}
	}
}

// TestImportTaskRunsToDoneSynchronously is the pipeline's happy path end to end:
// a task row, a parsed document, and chunks in the configured window.
func TestImportTaskRunsToDoneSynchronously(t *testing.T) {
	requireDB(t)
	cleanupItems(t)
	cleanupImportTasks(t)
	spaceID := testSpace(t, testWorkspaceID)
	ctx := context.Background()
	service := testService(WithSynchronousImport())

	content := importDoc()
	task, err := service.StartImport(ctx, ImportRequest{
		WorkspaceID: testWorkspaceID,
		SpaceID:     spaceID,
		Title:       "Retrieval handbook",
		SourceRef:   "knowledge/imports/test/handbook.md",
		Content:     []byte(content),
		Chunk:       ChunkConfig{Mode: ChunkModeGeneral},
		OwnerID:     testUserID,
	})
	if err != nil {
		t.Fatalf("StartImport: %v", err)
	}
	if task.Status != ImportStatusDone {
		t.Fatalf("status = %q error=%v, want done", task.Status, task.Error)
	}
	if task.Progress != ImportProgressDone {
		t.Fatalf("progress = %d, want %d", task.Progress, ImportProgressDone)
	}
	if task.FinishedAt == nil {
		t.Fatal("finished_at is NULL on a done task")
	}
	if task.ItemID == nil || task.DocumentID == nil {
		t.Fatalf("done task does not name its item/document: %+v", task)
	}
	if task.ChunkCount == 0 {
		t.Fatal("done task stored no chunks")
	}

	// The stored config is the effective one, so a later reader cannot claim a
	// window the chunker did not use.
	var storedCfg ChunkConfig
	if err := json.Unmarshal(task.ChunkConfig, &storedCfg); err != nil {
		t.Fatalf("stored chunk_config %s is not JSON: %v", task.ChunkConfig, err)
	}
	if storedCfg.TargetTokens != DefaultChunkTokens || storedCfg.Mode != ChunkModeGeneral {
		t.Fatalf("stored chunk_config = %+v, want the defaulted config", storedCfg)
	}

	doc, err := service.Store().GetDocument(ctx, testWorkspaceID, *task.DocumentID)
	if err != nil {
		t.Fatalf("GetDocument: %v", err)
	}
	if doc.ItemID != *task.ItemID {
		t.Fatalf("document item_id = %s, want %s", doc.ItemID, *task.ItemID)
	}
	if doc.Mime != "text/markdown" {
		t.Fatalf("document mime = %q", doc.Mime)
	}
	if doc.Bytes != int64(len(content)) {
		t.Fatalf("document bytes = %d, want %d", doc.Bytes, len(content))
	}

	chunks, err := service.ListChunks(ctx, testWorkspaceID, doc.ID, 500)
	if err != nil {
		t.Fatalf("ListChunks: %v", err)
	}
	if len(chunks) != task.ChunkCount {
		t.Fatalf("stored %d chunks, task says %d", len(chunks), task.ChunkCount)
	}
	for i, chunk := range chunks {
		if chunk.Ord != i {
			t.Fatalf("chunk %d has ord %d", i, chunk.Ord)
		}
		if chunk.Tokens > MaxChunkTokens {
			t.Fatalf("chunk %d has %d tokens, above the ceiling", i, chunk.Tokens)
		}
	}
}

// TestImportReadsThroughObjectSource covers the presigned-upload path: an import
// that carries no inline content reads source_ref from storage instead.
func TestImportReadsThroughObjectSource(t *testing.T) {
	requireDB(t)
	cleanupItems(t)
	cleanupImportTasks(t)
	spaceID := testSpace(t, testWorkspaceID)
	ctx := context.Background()
	objects := fakeObjects{"knowledge/imports/test/doc.md": "# Stored doc\n\nbody text about airships\n"}
	service := testService(WithObjectSource(objects), WithSynchronousImport())

	task, err := service.StartImport(ctx, ImportRequest{
		WorkspaceID: testWorkspaceID,
		SpaceID:     spaceID,
		SourceRef:   "knowledge/imports/test/doc.md",
		Chunk:       ChunkConfig{},
		OwnerID:     testUserID,
	})
	if err != nil {
		t.Fatalf("StartImport: %v", err)
	}
	if task.Status != ImportStatusDone {
		t.Fatalf("status = %q error=%v", task.Status, task.Error)
	}
	doc, err := service.Store().GetDocument(ctx, testWorkspaceID, *task.DocumentID)
	if err != nil {
		t.Fatalf("GetDocument: %v", err)
	}
	if doc.StorageKey == nil || *doc.StorageKey != "knowledge/imports/test/doc.md" {
		t.Fatalf("storage_key = %v, want the source_ref", doc.StorageKey)
	}
}

// TestImportFailsClosedWhenTheObjectIsMissing proves a broken import ends in
// `failed` with the reason recorded, never in a hung pending row.
func TestImportFailsClosedWhenTheObjectIsMissing(t *testing.T) {
	requireDB(t)
	cleanupItems(t)
	cleanupImportTasks(t)
	spaceID := testSpace(t, testWorkspaceID)
	ctx := context.Background()
	service := testService(WithObjectSource(fakeObjects{}), WithSynchronousImport())

	task, err := service.StartImport(ctx, ImportRequest{
		WorkspaceID: testWorkspaceID,
		SpaceID:     spaceID,
		SourceRef:   "knowledge/imports/test/absent.md",
		Chunk:       ChunkConfig{},
		OwnerID:     testUserID,
	})
	if err != nil {
		t.Fatalf("StartImport: %v", err)
	}
	if task.Status != ImportStatusFailed {
		t.Fatalf("status = %q, want failed", task.Status)
	}
	if task.Error == nil || !strings.Contains(*task.Error, "parsing:") {
		t.Fatalf("error = %v, want a parsing stage message", task.Error)
	}
	if task.FinishedAt == nil {
		t.Fatal("failed task has no finished_at")
	}
	if task.ItemID != nil || task.DocumentID != nil {
		t.Fatalf("failed task names an item/document: %+v", task)
	}
}

// TestIllegalTransitionIsRejectedByTheDatabase checks the transactional half of
// the state machine: a finished task cannot be advanced again.
func TestIllegalTransitionIsRejectedByTheDatabase(t *testing.T) {
	requireDB(t)
	cleanupItems(t)
	cleanupImportTasks(t)
	spaceID := testSpace(t, testWorkspaceID)
	ctx := context.Background()
	service := testService(WithSynchronousImport())

	task, err := service.StartImport(ctx, ImportRequest{
		WorkspaceID: testWorkspaceID,
		SpaceID:     spaceID,
		Content:     []byte("# done\n\nshort body\n"),
		OwnerID:     testUserID,
	})
	if err != nil {
		t.Fatalf("StartImport: %v", err)
	}
	if task.Status != ImportStatusDone {
		t.Fatalf("status = %q", task.Status)
	}
	if _, err := service.advance(ctx, task, ImportStatusParsing, ImportProgressParsing); !errors.Is(err, ErrImportTransition) {
		t.Fatalf("advance on a done task: %v, want ErrImportTransition", err)
	}
	if _, err := service.finishTask(ctx, task, ImportStatusFailed, nil, nil, 0, "late failure"); !errors.Is(err, ErrImportTransition) {
		t.Fatalf("finishTask on a done task: %v, want ErrImportTransition", err)
	}

	// The row is untouched by both attempts.
	after, err := service.GetImportTask(ctx, testWorkspaceID, task.ID)
	if err != nil {
		t.Fatalf("GetImportTask: %v", err)
	}
	if after.Status != ImportStatusDone || after.Error != nil {
		t.Fatalf("task changed after illegal transitions: %+v", after)
	}
}

// TestPreviewWritesNothing is the rehearsal's whole promise: the same chunker,
// no rows.
func TestPreviewWritesNothing(t *testing.T) {
	requireDB(t)
	cleanupItems(t)
	// A space has to exist for the workspace to look imported-into, but preview
	// never touches it: that is the point of the test.
	_ = testSpace(t, testWorkspaceID)
	ctx := context.Background()
	service := testService()

	before := dbfx.Count(t, `SELECT count(*) FROM knowledge_chunks WHERE workspace_id = $1`, testWorkspaceID)
	beforeDocs := dbfx.Count(t, `SELECT count(*) FROM knowledge_documents WHERE workspace_id = $1`, testWorkspaceID)
	beforeItems := dbfx.Count(t, `SELECT count(*) FROM knowledge_items WHERE workspace_id = $1`, testWorkspaceID)

	cfg := ChunkConfig{Mode: ChunkModeParentChild}
	preview, err := service.PreviewChunks(ctx, PreviewRequest{
		WorkspaceID: testWorkspaceID,
		Content:     []byte(importDoc()),
		Chunk:       cfg,
	})
	if err != nil {
		t.Fatalf("PreviewChunks: %v", err)
	}
	if len(preview.Chunks) == 0 {
		t.Fatal("preview returned no chunks")
	}
	if preview.Config.Mode != ChunkModeParentChild {
		t.Fatalf("preview config mode = %q", preview.Config.Mode)
	}

	// The preview is the chunker's own answer, not a second implementation.
	want, err := Split(importDoc(), cfg)
	if err != nil {
		t.Fatalf("Split: %v", err)
	}
	if len(want) != len(preview.Chunks) {
		t.Fatalf("preview produced %d chunks, Split produces %d", len(preview.Chunks), len(want))
	}
	for i := range want {
		if want[i].Content != preview.Chunks[i].Content || want[i].Tokens != preview.Chunks[i].Tokens {
			t.Fatalf("chunk %d differs between preview and Split", i)
		}
	}

	if after := dbfx.Count(t, `SELECT count(*) FROM knowledge_chunks WHERE workspace_id = $1`, testWorkspaceID); after != before {
		t.Fatalf("preview wrote %d chunk(s)", after-before)
	}
	if after := dbfx.Count(t, `SELECT count(*) FROM knowledge_documents WHERE workspace_id = $1`, testWorkspaceID); after != beforeDocs {
		t.Fatalf("preview wrote %d document(s)", after-beforeDocs)
	}
	if after := dbfx.Count(t, `SELECT count(*) FROM knowledge_items WHERE workspace_id = $1`, testWorkspaceID); after != beforeItems {
		t.Fatalf("preview wrote %d item(s)", after-beforeItems)
	}
}

// TestImportRejectsForeignSpace keeps the tenancy guard: an import cannot name a
// space of another workspace, and the failure is ErrSpaceNotFound rather than a
// foreign-key violation the caller cannot classify.
func TestImportRejectsForeignSpace(t *testing.T) {
	requireDB(t)
	otherWorkspace := dbfx.Workspace(t, "Knowledge Foreign Workspace", "knowledge-foreign-ws")
	dbfx.Cleanup(t, `DELETE FROM workspace WHERE id = $1`, otherWorkspace)
	otherSpace := testSpace(t, otherWorkspace)

	service := testService(WithSynchronousImport())
	_, err := service.StartImport(context.Background(), ImportRequest{
		WorkspaceID: testWorkspaceID,
		SpaceID:     otherSpace,
		Content:     []byte("body"),
	})
	if !errors.Is(err, ErrSpaceNotFound) {
		t.Fatalf("StartImport with a foreign space: %v, want ErrSpaceNotFound", err)
	}
}
