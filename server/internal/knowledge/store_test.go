package knowledge

import (
	"context"
	"errors"
	"fmt"
	"os"
	"reflect"
	"testing"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jerry-halo2026/morchat.co/server/internal/testutil"
)

// The DB-backed tests follow internal/handler's fixture pattern: one shared
// pool from DATABASE_URL (defaulting to the local dev database), a workspace and
// user seeded once in TestMain, and per-test rows inserted through
// testutil.Fixture so cleanup runs in reverse creation order.
//
// Unlike the handler suite, a missing database skips only the DB tests instead
// of the whole package: the registry tests are pure and must keep running where
// no Postgres exists.

var (
	testPool        *pgxpool.Pool
	dbfx            *testutil.Fixture
	testWorkspaceID string
	testUserID      string
)

const (
	knowledgeTestEmail  = "knowledge-test@multica.ai"
	knowledgeTestName   = "Knowledge Test User"
	knowledgeTestWSName = "Knowledge Tests"
	knowledgeTestWSSlug = "knowledge-tests"
)

func TestMain(m *testing.M) {
	ctx := context.Background()
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		dbURL = "postgres://multica:multica@localhost:5432/multica?sslmode=disable"
	}
	if pool, err := pgxpool.New(ctx, dbURL); err == nil {
		if err := pool.Ping(ctx); err == nil {
			testPool = pool
			if err := setupKnowledgeFixture(ctx, pool); err != nil {
				fmt.Printf("knowledge tests: fixture setup failed: %v\n", err)
				pool.Close()
				testPool = nil
				os.Exit(1)
			}
		} else {
			fmt.Printf("knowledge tests: database unreachable, skipping DB tests: %v\n", err)
			pool.Close()
		}
	} else {
		fmt.Printf("knowledge tests: database not configured, skipping DB tests: %v\n", err)
	}

	code := m.Run()
	if testPool != nil {
		cleanupKnowledgeFixture(context.Background(), testPool)
		testPool.Close()
	}
	os.Exit(code)
}

func setupKnowledgeFixture(ctx context.Context, pool *pgxpool.Pool) error {
	if err := cleanupKnowledgeFixture(ctx, pool); err != nil {
		return err
	}
	if err := pool.QueryRow(ctx, `
		INSERT INTO "user" (name, email) VALUES ($1, $2) RETURNING id
	`, knowledgeTestName, knowledgeTestEmail).Scan(&testUserID); err != nil {
		return fmt.Errorf("insert test user: %w", err)
	}
	if err := pool.QueryRow(ctx, `
		INSERT INTO workspace (name, slug, description, issue_prefix)
		VALUES ($1, $2, $3, $4) RETURNING id
	`, knowledgeTestWSName, knowledgeTestWSSlug, "Temporary workspace for knowledge tests", "KNW").Scan(&testWorkspaceID); err != nil {
		return fmt.Errorf("insert test workspace: %w", err)
	}
	dbfx = testutil.New(pool, testWorkspaceID, testUserID)
	return nil
}

// cleanupKnowledgeFixture removes only the rows this suite owns. knowledge_items
// is deleted first so the document/chunk cascade does not depend on FK ordering.
func cleanupKnowledgeFixture(ctx context.Context, pool *pgxpool.Pool) error {
	if _, err := pool.Exec(ctx, `
		DELETE FROM knowledge_items
		WHERE workspace_id IN (SELECT id FROM workspace WHERE slug = $1)
	`, knowledgeTestWSSlug); err != nil {
		return fmt.Errorf("delete knowledge items: %w", err)
	}
	if _, err := pool.Exec(ctx, `DELETE FROM workspace WHERE slug = $1`, knowledgeTestWSSlug); err != nil {
		return fmt.Errorf("delete test workspace: %w", err)
	}
	if _, err := pool.Exec(ctx, `DELETE FROM "user" WHERE email = $1`, knowledgeTestEmail); err != nil {
		return fmt.Errorf("delete test user: %w", err)
	}
	return nil
}

func requireDB(t *testing.T) {
	t.Helper()
	if testPool == nil {
		t.Skip("knowledge store tests require a reachable DATABASE_URL")
	}
}

// cleanupItems registers a teardown that removes every item this test created in
// the workspace, and with them their documents and chunks.
func cleanupItems(t *testing.T) {
	t.Helper()
	dbfx.Cleanup(t, `DELETE FROM knowledge_items WHERE workspace_id = $1`, testWorkspaceID)
}

// testSpace creates the knowledge instance and space every item needs since
// migration 621 (space_id is NOT NULL), and returns the space id. It also
// creates an optional extra space in the same workspace, which the page-binding
// test uses to prove that a page from another space cannot be bound.
func testSpace(t *testing.T, workspaceID string) string {
	t.Helper()
	dbfx.Insert(t, "knowledge_instances", testutil.Cols{
		"workspace_id": workspaceID,
		"wiki_id":      "default",
	})
	return dbfx.Insert(t, "knowledge_spaces", testutil.Cols{
		"workspace_id": workspaceID,
		"wiki_id":      "default",
		"slug":         "default",
		"display_name": "Default",
	})
}

// testSpaceWithSlug creates a second space in the same instance / workspace.
func testSpaceWithSlug(t *testing.T, workspaceID, slug string) string {
	t.Helper()
	return dbfx.Insert(t, "knowledge_spaces", testutil.Cols{
		"workspace_id": workspaceID,
		"wiki_id":      "default",
		"slug":         slug,
		"display_name": slug,
	})
}

// testPage inserts one wiki page of spaceID.
func testPage(t *testing.T, workspaceID, spaceID, path string) string {
	t.Helper()
	return dbfx.Insert(t, "knowledge_pages", testutil.Cols{
		"workspace_id": workspaceID,
		"space_id":     spaceID,
		"path":         path,
	})
}

// TestStoreCreateItemReadBackDefaults is the P0 write→read contract: create
// with the required fields only, read it back, and require the two values to be
// deeply equal — which can only hold if every default the store applied in Go
// matches what the row actually stores.
func TestStoreCreateItemReadBackDefaults(t *testing.T) {
	requireDB(t)
	cleanupItems(t)
	spaceID := testSpace(t, testWorkspaceID)
	ctx := context.Background()
	store := NewStore(testPool)

	created, err := store.CreateItem(ctx, NewItem{
		WorkspaceID: testWorkspaceID,
		SpaceID:     spaceID,
		Title:       "write→read contract",
	})
	if err != nil {
		t.Fatalf("CreateItem: %v", err)
	}

	got, err := store.GetItem(ctx, testWorkspaceID, created.ID)
	if err != nil {
		t.Fatalf("GetItem: %v", err)
	}
	if !reflect.DeepEqual(created, got) {
		t.Fatalf("read-back differs from create:\n created=%+v\n read=%+v", created, got)
	}

	// Defaults are asserted explicitly as well: deep equality alone would also
	// hold if create and read were equally wrong.
	for _, want := range []struct {
		field string
		value string
		ok    bool
	}{
		{"kind", Kind.Default, created.Kind == Kind.Default},
		{"source_type", SourceType.Default, created.SourceType == SourceType.Default},
		{"status", Status.Default, created.Status == Status.Default},
		{"acl_mode", ACLMode.Default, created.ACLMode == ACLMode.Default},
		{"source_ref", "", created.SourceRef == ""},
	} {
		if !want.ok {
			t.Errorf("%s = %q, want %q", want.field, want.value, want.value)
		}
	}
	if created.ProjectID != nil {
		t.Errorf("project_id = %v, want NULL", *created.ProjectID)
	}
	if created.OwnerID != nil {
		t.Errorf("owner_id = %v, want NULL", *created.OwnerID)
	}
	if created.SpaceID != spaceID {
		t.Errorf("space_id = %q, want %q", created.SpaceID, spaceID)
	}
	if created.PageID != nil {
		t.Errorf("page_id = %v, want NULL", *created.PageID)
	}
	if created.CreatedAt.IsZero() || created.UpdatedAt.IsZero() {
		t.Error("timestamps were not populated")
	}
}

// TestStoreItemExplicitValuesSurvive covers the other half: an explicit choice is
// stored verbatim, including the foreign keys that make an item project-scoped.
func TestStoreItemExplicitValuesSurvive(t *testing.T) {
	requireDB(t)
	cleanupItems(t)
	projectID := dbfx.Project(t, "Knowledge Project")
	spaceID := testSpace(t, testWorkspaceID)
	ctx := context.Background()
	store := NewStore(testPool)

	created, err := store.CreateItem(ctx, NewItem{
		WorkspaceID: testWorkspaceID,
		SpaceID:     spaceID,
		ProjectID:   &projectID,
		Title:       "design notes",
		Kind:        KindNote,
		SourceType:  SourceTypeObsidianVault,
		SourceRef:   "vault/design/notes.md",
		Status:      StatusActive,
		ACLMode:     ACLModeProject,
		OwnerID:     &testUserID,
	})
	if err != nil {
		t.Fatalf("CreateItem: %v", err)
	}
	got, err := store.GetItem(ctx, testWorkspaceID, created.ID)
	if err != nil {
		t.Fatalf("GetItem: %v", err)
	}
	if !reflect.DeepEqual(created, got) {
		t.Fatalf("read-back differs from create:\n created=%+v\n read=%+v", created, got)
	}
	if got.Kind != KindNote || got.ACLMode != ACLModeProject || got.Status != StatusActive {
		t.Fatalf("enum values were not preserved: %+v", got)
	}
	if got.ProjectID == nil || *got.ProjectID != projectID {
		t.Fatalf("project_id = %v, want %s", got.ProjectID, projectID)
	}
}

// TestStoreRejectsUnknownEnum proves the registry is enforced before the write,
// so a caller cannot rely on the DDL CHECK to find out.
func TestStoreRejectsUnknownEnum(t *testing.T) {
	requireDB(t)
	store := NewStore(testPool)
	spaceID := testSpace(t, testWorkspaceID)

	for _, tc := range []struct {
		name string
		in   NewItem
	}{
		{"kind", NewItem{WorkspaceID: testWorkspaceID, SpaceID: spaceID, Title: "x", Kind: "presentation"}},
		{"source_type", NewItem{WorkspaceID: testWorkspaceID, SpaceID: spaceID, Title: "x", SourceType: "carrier_pigeon"}},
		{"status", NewItem{WorkspaceID: testWorkspaceID, SpaceID: spaceID, Title: "x", Status: "published"}},
		{"acl_mode", NewItem{WorkspaceID: testWorkspaceID, SpaceID: spaceID, Title: "x", ACLMode: "public"}},
		{"title", NewItem{WorkspaceID: testWorkspaceID, SpaceID: spaceID, Title: "  "}},
		{"workspace", NewItem{Title: "x"}},
	} {
		if _, err := store.CreateItem(context.Background(), tc.in); !errors.Is(err, ErrInvalidField) {
			t.Errorf("%s: err = %v, want ErrInvalidField", tc.name, err)
		}
	}
}

// TestStoreGetItemIsWorkspaceScoped is the read-side isolation guarantee: the
// same id under a different workspace must not resolve.
func TestStoreGetItemIsWorkspaceScoped(t *testing.T) {
	requireDB(t)
	cleanupItems(t)
	otherWorkspaceID := dbfx.Workspace(t, "Knowledge Other", "knowledge-tests-other")
	spaceID := testSpace(t, testWorkspaceID)
	ctx := context.Background()
	store := NewStore(testPool)

	created, err := store.CreateItem(ctx, NewItem{
		WorkspaceID: testWorkspaceID,
		SpaceID:     spaceID,
		Title:       "scoped",
	})
	if err != nil {
		t.Fatalf("CreateItem: %v", err)
	}
	if _, err := store.GetItem(ctx, otherWorkspaceID, created.ID); !errors.Is(err, ErrItemNotFound) {
		t.Fatalf("cross-workspace read: err = %v, want ErrItemNotFound", err)
	}
	if _, err := store.GetItem(ctx, testWorkspaceID, created.ID); err != nil {
		t.Fatalf("same-workspace read: %v", err)
	}
}

// TestStoreDocumentAndChunkDefaults covers the two child tables, including the
// generation/ordinal uniqueness that re-segmentation depends on and the empty
// (never NULL) acl_tags array.
func TestStoreDocumentAndChunkDefaults(t *testing.T) {
	requireDB(t)
	cleanupItems(t)
	spaceID := testSpace(t, testWorkspaceID)
	ctx := context.Background()
	store := NewStore(testPool)

	item, err := store.CreateItem(ctx, NewItem{
		WorkspaceID: testWorkspaceID,
		SpaceID:     spaceID,
		Title:       "payload",
	})
	if err != nil {
		t.Fatalf("CreateItem: %v", err)
	}
	doc, err := store.CreateDocument(ctx, NewDocument{
		WorkspaceID: testWorkspaceID,
		ItemID:      item.ID,
		Bytes:       42,
		SHA256:      "deadbeef",
	})
	if err != nil {
		t.Fatalf("CreateDocument: %v", err)
	}
	if doc.Version != 1 || doc.Generation != 1 || doc.ActiveGeneration != 1 {
		t.Fatalf("document defaults: %+v", doc)
	}
	if doc.ParseEngine != ParseEngine.Default || doc.Mime != "text/markdown" {
		t.Fatalf("document defaults: %+v", doc)
	}
	readDoc, err := store.GetDocument(ctx, testWorkspaceID, doc.ID)
	if err != nil {
		t.Fatalf("GetDocument: %v", err)
	}
	if !reflect.DeepEqual(doc, readDoc) {
		t.Fatalf("document read-back differs:\n created=%+v\n read=%+v", doc, readDoc)
	}

	chunk, err := store.CreateChunk(ctx, NewChunk{
		WorkspaceID: testWorkspaceID,
		DocumentID:  doc.ID,
		Ord:         0,
		Content:     "first chunk",
	})
	if err != nil {
		t.Fatalf("CreateChunk: %v", err)
	}
	if chunk.Generation != 1 {
		t.Fatalf("chunk generation = %d, want 1", chunk.Generation)
	}
	if chunk.ACLTags == nil || len(chunk.ACLTags) != 0 {
		t.Fatalf("acl_tags = %v, want empty non-nil slice", chunk.ACLTags)
	}
	readChunk, err := store.GetChunk(ctx, testWorkspaceID, chunk.ID)
	if err != nil {
		t.Fatalf("GetChunk: %v", err)
	}
	if !reflect.DeepEqual(chunk, readChunk) {
		t.Fatalf("chunk read-back differs:\n created=%+v\n read=%+v", chunk, readChunk)
	}

	// Re-segmentation: the same ordinal may re-appear under a new generation, but
	// not twice within one.
	if _, err := store.CreateChunk(ctx, NewChunk{
		WorkspaceID: testWorkspaceID,
		DocumentID:  doc.ID,
		Ord:         0,
		Content:     "duplicate ordinal",
	}); err == nil {
		t.Fatal("duplicate (document_id, generation, ord) was accepted")
	}
	if _, err := store.CreateChunk(ctx, NewChunk{
		WorkspaceID: testWorkspaceID,
		DocumentID:  doc.ID,
		Generation:  2,
		Ord:         0,
		Content:     "regenerated",
	}); err != nil {
		t.Fatalf("same ord under a new generation: %v", err)
	}
}

// TestRetrievalRequestDefaults keeps the three retrieval knobs from collapsing
// into one: plan §5 forbids a single topK defaulted from a zero value.
func TestRetrievalRequestDefaults(t *testing.T) {
	got := RetrievalRequest{}.WithDefaults()
	want := RetrievalRequest{
		Mode:           Mode.Default,
		TopK:           DefaultTopK,
		ScoreThreshold: DefaultScoreThreshold,
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("WithDefaults() = %+v, want %+v", got, want)
	}
	explicit := RetrievalRequest{Mode: ModeVector, TopK: 9, ScoreThreshold: 0.4, Rerank: true, Rewrite: true}
	if !reflect.DeepEqual(explicit.WithDefaults(), explicit) {
		t.Fatal("WithDefaults() overwrote explicit values")
	}
}

// TestStoreItemRequiresSpace is the 621 contract: an item is space-scoped, so a
// create without a space is refused before the write — not by the NOT NULL.
func TestStoreItemRequiresSpace(t *testing.T) {
	requireDB(t)
	cleanupItems(t)
	spaceID := testSpace(t, testWorkspaceID)
	store := NewStore(testPool)
	ctx := context.Background()

	if _, err := store.CreateItem(ctx, NewItem{
		WorkspaceID: testWorkspaceID,
		Title:       "no space",
	}); !errors.Is(err, ErrInvalidField) {
		t.Fatalf("missing space_id: err = %v, want ErrInvalidField", err)
	}
	if _, err := store.CreateItem(ctx, NewItem{
		WorkspaceID: testWorkspaceID,
		SpaceID:     "   ",
		Title:       "blank space",
	}); !errors.Is(err, ErrInvalidField) {
		t.Fatalf("blank space_id: err = %v, want ErrInvalidField", err)
	}
	if n := dbfx.Count(t, `SELECT count(*) FROM knowledge_items WHERE workspace_id = $1`, testWorkspaceID); n != 0 {
		t.Fatalf("%d item(s) were written despite the refused create", n)
	}
	if _, err := store.CreateItem(ctx, NewItem{
		WorkspaceID: testWorkspaceID,
		SpaceID:     spaceID,
		Title:       "with space",
	}); err != nil {
		t.Fatalf("CreateItem with space: %v", err)
	}
}

// TestStoreItemRejectsForeignWorkspaceSpace proves the space is workspace-bound:
// a space of a different workspace cannot carry the item, and the store reports
// it as ErrSpaceNotFound (the composite FK enforces the same rule in the DDL).
func TestStoreItemRejectsForeignWorkspaceSpace(t *testing.T) {
	requireDB(t)
	cleanupItems(t)
	otherWorkspaceID := dbfx.Workspace(t, "Knowledge Other Space", "knowledge-tests-other-space")
	otherSpaceID := testSpace(t, otherWorkspaceID)
	ownSpaceID := testSpace(t, testWorkspaceID)
	store := NewStore(testPool)
	ctx := context.Background()

	_, err := store.CreateItem(ctx, NewItem{
		WorkspaceID: testWorkspaceID,
		SpaceID:     otherSpaceID,
		Title:       "smuggled space",
	})
	if !errors.Is(err, ErrSpaceNotFound) {
		t.Fatalf("cross-workspace space: err = %v, want ErrSpaceNotFound", err)
	}

	// A space id that does not exist at all is the same answer, and an item that
	// names its own space still goes through.
	if _, err := store.CreateItem(ctx, NewItem{
		WorkspaceID: testWorkspaceID,
		SpaceID:     "00000000-0000-0000-0000-000000000000",
		Title:       "unknown space",
	}); !errors.Is(err, ErrSpaceNotFound) {
		t.Fatalf("unknown space: err = %v, want ErrSpaceNotFound", err)
	}
	if _, err := store.CreateItem(ctx, NewItem{
		WorkspaceID: testWorkspaceID,
		SpaceID:     ownSpaceID,
		Title:       "own space",
	}); err != nil {
		t.Fatalf("CreateItem with own space: %v", err)
	}
}

// TestStoreItemPageBinding covers both halves of the nullable page_id: an item
// without a page stores NULL, an item bound to a page stores the id, both read
// back deeply equal, and a page of another space of the same workspace cannot be
// bound (the composite FK is (workspace_id, space_id, page_id)).
func TestStoreItemPageBinding(t *testing.T) {
	requireDB(t)
	cleanupItems(t)
	spaceID := testSpace(t, testWorkspaceID)
	otherSpaceID := testSpaceWithSlug(t, testWorkspaceID, "other")
	pageID := testPage(t, testWorkspaceID, spaceID, "wiki/handbook.md")
	foreignPageID := testPage(t, testWorkspaceID, otherSpaceID, "wiki/elsewhere.md")
	store := NewStore(testPool)
	ctx := context.Background()

	unbound, err := store.CreateItem(ctx, NewItem{
		WorkspaceID: testWorkspaceID,
		SpaceID:     spaceID,
		Title:       "no page",
	})
	if err != nil {
		t.Fatalf("CreateItem without page: %v", err)
	}
	if unbound.PageID != nil {
		t.Fatalf("page_id = %v, want NULL", *unbound.PageID)
	}

	bound, err := store.CreateItem(ctx, NewItem{
		WorkspaceID: testWorkspaceID,
		SpaceID:     spaceID,
		PageID:      &pageID,
		Title:       "from page",
	})
	if err != nil {
		t.Fatalf("CreateItem with page: %v", err)
	}
	if bound.PageID == nil || *bound.PageID != pageID {
		t.Fatalf("page_id = %v, want %s", bound.PageID, pageID)
	}

	for _, want := range []Item{unbound, bound} {
		got, err := store.GetItem(ctx, testWorkspaceID, want.ID)
		if err != nil {
			t.Fatalf("GetItem %s: %v", want.ID, err)
		}
		if !reflect.DeepEqual(want, got) {
			t.Fatalf("read-back differs from create:\n created=%+v\n read=%+v", want, got)
		}
	}

	// A page from a sibling space is refused by the DDL; the same workspace is
	// not enough, because the item and its page must agree on the space too.
	if _, err := store.CreateItem(ctx, NewItem{
		WorkspaceID: testWorkspaceID,
		SpaceID:     spaceID,
		PageID:      &foreignPageID,
		Title:       "cross-space page",
	}); err == nil {
		t.Fatal("a page from another space was accepted")
	}
}

// requireForeignKeyViolation asserts err is PostgreSQL's foreign-key violation
// (SQLSTATE 23503) raised by constraint conname. The SQLSTATE is the contract:
// the caller must be able to tell "the row contradicts the schema" from "the row
// is invalid Go input" (ErrInvalidField) without parsing a message.
func requireForeignKeyViolation(t *testing.T, err error, conname string) {
	t.Helper()
	if err == nil {
		t.Fatalf("the write was accepted; want %s to reject it", conname)
	}
	var pgErr *pgconn.PgError
	if !errors.As(err, &pgErr) {
		t.Fatalf("err = %v, want a *pgconn.PgError", err)
	}
	if pgErr.Code != "23503" {
		t.Fatalf("SQLSTATE = %s (%s), want 23503", pgErr.Code, pgErr.Message)
	}
	if pgErr.ConstraintName != conname {
		t.Fatalf("violated constraint = %s, want %s", pgErr.ConstraintName, conname)
	}
}

// TestStoreRevisionSpaceMustMatchPage is the 623 contract for revisions: a
// revision names a page in its own space, and a page of a sibling space — same
// workspace, so 620's key accepted it — is refused by the composite key with
// SQLSTATE 23503. A revision without a page is still legal, because the
// composite key is MATCH SIMPLE and its third column is NULL.
func TestStoreRevisionSpaceMustMatchPage(t *testing.T) {
	requireDB(t)
	spaceID := testSpace(t, testWorkspaceID)
	otherSpaceID := testSpaceWithSlug(t, testWorkspaceID, "revision-sibling")
	pageID := testPage(t, testWorkspaceID, spaceID, "wiki/revisioned.md")
	store := NewStore(testPool)
	ctx := context.Background()

	created, err := store.CreateRevision(ctx, NewRevision{
		WorkspaceID: testWorkspaceID,
		SpaceID:     spaceID,
		PageID:      &pageID,
		Path:        "wiki/revisioned.md",
		ContentHash: "sha256:first",
	})
	if err != nil {
		t.Fatalf("CreateRevision with the page's own space: %v", err)
	}
	if created.PageID == nil || *created.PageID != pageID || created.SpaceID != spaceID {
		t.Fatalf("revision = %+v, want page %s in space %s", created, pageID, spaceID)
	}

	// No page: a revision of a path, not of a live row.
	if _, err := store.CreateRevision(ctx, NewRevision{
		WorkspaceID: testWorkspaceID,
		SpaceID:     spaceID,
		Path:        "wiki/vanished.md",
		ContentHash: "sha256:no-page",
	}); err != nil {
		t.Fatalf("CreateRevision without a page: %v", err)
	}

	// The drift 620 allowed and 623 removes.
	_, err = store.CreateRevision(ctx, NewRevision{
		WorkspaceID: testWorkspaceID,
		SpaceID:     otherSpaceID,
		PageID:      &pageID,
		Path:        "wiki/revisioned.md",
		ContentHash: "sha256:drifted",
	})
	requireForeignKeyViolation(t, err, "knowledge_page_revisions_page_fkey")

	if n := dbfx.Count(t, `
		SELECT count(*) FROM knowledge_page_revisions
		WHERE workspace_id = $1 AND space_id = $2`, testWorkspaceID, otherSpaceID); n != 0 {
		t.Fatalf("%d revision(s) were written into the sibling space despite the refusal", n)
	}
}

// TestStoreBacklinkSpaceMustMatchPage covers both edges of a backlink: the source
// page is mandatory and space-checked, and the optional resolved target is
// space-checked too, while a red link (no target page yet) stays representable.
func TestStoreBacklinkSpaceMustMatchPage(t *testing.T) {
	requireDB(t)
	spaceID := testSpace(t, testWorkspaceID)
	otherSpaceID := testSpaceWithSlug(t, testWorkspaceID, "backlink-sibling")
	sourceID := testPage(t, testWorkspaceID, spaceID, "wiki/source.md")
	targetID := testPage(t, testWorkspaceID, spaceID, "wiki/target.md")
	foreignID := testPage(t, testWorkspaceID, otherSpaceID, "wiki/foreign.md")
	store := NewStore(testPool)
	ctx := context.Background()

	edge, err := store.CreateBacklink(ctx, NewBacklink{
		WorkspaceID:  testWorkspaceID,
		SpaceID:      spaceID,
		SourcePageID: sourceID,
		TargetPageID: &targetID,
		TargetPath:   "wiki/target.md",
	})
	if err != nil {
		t.Fatalf("CreateBacklink inside one space: %v", err)
	}
	if edge.TargetPageID == nil || *edge.TargetPageID != targetID {
		t.Fatalf("backlink = %+v, want target %s", edge, targetID)
	}

	// A red link: target_path is known, no page answers for it yet.
	red, err := store.CreateBacklink(ctx, NewBacklink{
		WorkspaceID:  testWorkspaceID,
		SpaceID:      spaceID,
		SourcePageID: sourceID,
		TargetPath:   "wiki/not-written-yet.md",
	})
	if err != nil {
		t.Fatalf("CreateBacklink red link: %v", err)
	}
	if red.TargetPageID != nil {
		t.Fatalf("red link target_page_id = %v, want NULL", *red.TargetPageID)
	}

	// Source page of a sibling space.
	_, err = store.CreateBacklink(ctx, NewBacklink{
		WorkspaceID:  testWorkspaceID,
		SpaceID:      otherSpaceID,
		SourcePageID: sourceID,
		TargetPath:   "wiki/target.md",
	})
	requireForeignKeyViolation(t, err, "knowledge_page_backlinks_source_fkey")

	// Target page of a sibling space: the source is fine, the edge is not.
	_, err = store.CreateBacklink(ctx, NewBacklink{
		WorkspaceID:  testWorkspaceID,
		SpaceID:      spaceID,
		SourcePageID: sourceID,
		TargetPageID: &foreignID,
		TargetPath:   "wiki/foreign.md",
	})
	requireForeignKeyViolation(t, err, "knowledge_page_backlinks_target_fkey")
}

// TestStorePageDeleteCascadesWikiChildren pins the delete behaviour 623 keeps
// from 620: a page takes its revisions with it, and a backlink edge disappears
// when either endpoint page goes. The space foreign key is the only one 623
// rewrote; the cascade actions are part of the contract it must not disturb.
func TestStorePageDeleteCascadesWikiChildren(t *testing.T) {
	requireDB(t)
	spaceID := testSpace(t, testWorkspaceID)
	sourceID := testPage(t, testWorkspaceID, spaceID, "wiki/cascade-source.md")
	targetID := testPage(t, testWorkspaceID, spaceID, "wiki/cascade-target.md")
	store := NewStore(testPool)
	ctx := context.Background()

	revision, err := store.CreateRevision(ctx, NewRevision{
		WorkspaceID: testWorkspaceID,
		SpaceID:     spaceID,
		PageID:      &sourceID,
		Path:        "wiki/cascade-source.md",
		ContentHash: "sha256:cascade",
	})
	if err != nil {
		t.Fatalf("CreateRevision: %v", err)
	}
	edge, err := store.CreateBacklink(ctx, NewBacklink{
		WorkspaceID:  testWorkspaceID,
		SpaceID:      spaceID,
		SourcePageID: sourceID,
		TargetPageID: &targetID,
		TargetPath:   "wiki/cascade-target.md",
	})
	if err != nil {
		t.Fatalf("CreateBacklink: %v", err)
	}

	// Deleting the source page drops its revisions and its outgoing edges.
	if _, err := testPool.Exec(ctx,
		`DELETE FROM knowledge_pages WHERE workspace_id = $1 AND id = $2`,
		testWorkspaceID, sourceID); err != nil {
		t.Fatalf("delete source page: %v", err)
	}
	if n := dbfx.Count(t, `SELECT count(*) FROM knowledge_page_revisions WHERE id = $1`, revision.ID); n != 0 {
		t.Errorf("%d revision(s) survived their page", n)
	}
	if n := dbfx.Count(t, `SELECT count(*) FROM knowledge_page_backlinks WHERE id = $1`, edge.ID); n != 0 {
		t.Errorf("%d backlink edge(s) survived their source page", n)
	}
	if n := dbfx.Count(t, `SELECT count(*) FROM knowledge_pages WHERE id = $1`, targetID); n != 1 {
		t.Errorf("the target page was deleted as well (rows=%d)", n)
	}

	// A surviving page keeps its revisions when the *target* of its edge goes;
	// only the edge is removed.
	leftID := testPage(t, testWorkspaceID, spaceID, "wiki/left.md")
	rightID := testPage(t, testWorkspaceID, spaceID, "wiki/right.md")
	leftRevision, err := store.CreateRevision(ctx, NewRevision{
		WorkspaceID: testWorkspaceID,
		SpaceID:     spaceID,
		PageID:      &leftID,
		Path:        "wiki/left.md",
		ContentHash: "sha256:left",
	})
	if err != nil {
		t.Fatalf("CreateRevision for left page: %v", err)
	}
	rightEdge, err := store.CreateBacklink(ctx, NewBacklink{
		WorkspaceID:  testWorkspaceID,
		SpaceID:      spaceID,
		SourcePageID: leftID,
		TargetPageID: &rightID,
		TargetPath:   "wiki/right.md",
	})
	if err != nil {
		t.Fatalf("CreateBacklink to right page: %v", err)
	}
	if _, err := testPool.Exec(ctx,
		`DELETE FROM knowledge_pages WHERE workspace_id = $1 AND id = $2`,
		testWorkspaceID, rightID); err != nil {
		t.Fatalf("delete target page: %v", err)
	}
	if n := dbfx.Count(t, `SELECT count(*) FROM knowledge_page_backlinks WHERE id = $1`, rightEdge.ID); n != 0 {
		t.Errorf("%d backlink edge(s) survived their target page", n)
	}
	if n := dbfx.Count(t, `SELECT count(*) FROM knowledge_page_revisions WHERE id = $1`, leftRevision.ID); n != 1 {
		t.Errorf("the surviving page lost its revision (rows=%d)", n)
	}
}
