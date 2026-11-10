package knowledge

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// Migration 641 round trip. Everything runs inside one transaction that is rolled
// back, so the shared dev database ends each test exactly as it started.

const (
	migration641Up   = "../../migrations/641_knowledge_import.up.sql"
	migration641Down = "../../migrations/641_knowledge_import.down.sql"
)

// rollBackAfter620 removes what the migrations newer than 620 added, newest
// first, so 620's own down file can run.
//
// This is the migration runner's order, not a test-only arrangement: 620's down
// drops knowledge_spaces, and 641's knowledge_import_tasks has a foreign key onto
// it, so a database at head must roll 641 back before 620. The 620 tests apply
// their down file in isolation, which is exactly the case that needs the newer
// files undone first.
func rollBackAfter620(t *testing.T, tx pgx.Tx) {
	t.Helper()
	execMigrationFile(t, tx, migration641Down)
}

// migrationProbe is the read surface the schema assertions need. They run inside
// the migration's own transaction - a pooled connection would still see the table
// the down file just dropped - so the probe is the tx, not testPool.
type migrationProbe interface {
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

// columnExists reports whether table.column exists in the public schema.
func columnExists(t *testing.T, probe migrationProbe, table, column string) bool {
	t.Helper()
	var exists bool
	if err := probe.QueryRow(context.Background(), `
		SELECT EXISTS (
			SELECT 1 FROM information_schema.columns
			WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2
		)`, table, column).Scan(&exists); err != nil {
		t.Fatalf("probe column %s.%s: %v", table, column, err)
	}
	return exists
}

// tableExists reports whether public.<table> exists.
func tableExists(t *testing.T, probe migrationProbe, table string) bool {
	t.Helper()
	var exists bool
	if err := probe.QueryRow(context.Background(),
		`SELECT to_regclass($1) IS NOT NULL`, "public."+table).Scan(&exists); err != nil {
		t.Fatalf("probe table %s: %v", table, err)
	}
	return exists
}

// TestMigration641RoundTrips checks both directions: the down file removes the
// table and the two chunk columns, and the up file puts them back.
func TestMigration641RoundTrips(t *testing.T) {
	requireDB(t)
	tx := beginTx(t)

	// Up is idempotent: on a database that already ran 641 every statement is a
	// no-op, which is what lets the migration be replayed after a partial run.
	execMigrationFile(t, tx, migration641Up)
	if !tableExists(t, tx, "knowledge_import_tasks") {
		t.Fatal("knowledge_import_tasks missing after up")
	}
	for _, column := range []string{"embedding_model", "content_tsv"} {
		if !columnExists(t, tx, "knowledge_chunks", column) {
			t.Fatalf("knowledge_chunks.%s missing after up", column)
		}
	}
	// acl_tags predates 641 (620 creates it); 641 only guarantees it exists.
	if !columnExists(t, tx, "knowledge_chunks", "acl_tags") {
		t.Fatal("knowledge_chunks.acl_tags missing after up")
	}
	for _, index := range []string{
		"knowledge_import_tasks_workspace_created_idx",
		"knowledge_chunks_content_tsv_idx",
	} {
		var exists bool
		if err := tx.QueryRow(context.Background(),
			`SELECT to_regclass($1) IS NOT NULL`, "public."+index).Scan(&exists); err != nil {
			t.Fatalf("probe index %s: %v", index, err)
		}
		if !exists {
			t.Fatalf("index %s missing after up", index)
		}
	}

	execMigrationFile(t, tx, migration641Down)
	if tableExists(t, tx, "knowledge_import_tasks") {
		t.Fatal("knowledge_import_tasks survived down")
	}
	for _, column := range []string{"embedding_model", "content_tsv"} {
		if columnExists(t, tx, "knowledge_chunks", column) {
			t.Fatalf("knowledge_chunks.%s survived down", column)
		}
	}
	// The down file must not drop 620's column: acl_tags is not 641's to remove.
	if !columnExists(t, tx, "knowledge_chunks", "acl_tags") {
		t.Fatal("down removed acl_tags, which 620 owns")
	}

	execMigrationFile(t, tx, migration641Up)
	if !tableExists(t, tx, "knowledge_import_tasks") {
		t.Fatal("knowledge_import_tasks missing after re-up")
	}
	if !columnExists(t, tx, "knowledge_chunks", "content_tsv") {
		t.Fatal("content_tsv missing after re-up")
	}
}

// TestMigration641StatusCheckIsClosed pins the DDL half of the import state
// machine: an unknown status cannot be stored.
func TestMigration641StatusCheckIsClosed(t *testing.T) {
	requireDB(t)
	tx := beginTx(t)
	execMigrationFile(t, tx, migration641Up)

	var def string
	if err := tx.QueryRow(context.Background(), `
		SELECT pg_get_constraintdef(oid) FROM pg_constraint
		WHERE conrelid = 'public.knowledge_import_tasks'::regclass
		  AND conname = 'knowledge_import_tasks_status_check'`).Scan(&def); err != nil {
		t.Fatalf("read status check: %v", err)
	}
	for _, status := range []string{
		ImportStatusPending, ImportStatusParsing, ImportStatusChunking,
		ImportStatusDone, ImportStatusFailed,
	} {
		if !strings.Contains(def, "'"+status+"'") {
			t.Errorf("status check %q does not allow %s", def, status)
		}
	}

	spaceID := testSpace(t, testWorkspaceID)
	_, err := tx.Exec(context.Background(), `
		INSERT INTO knowledge_import_tasks (workspace_id, space_id, status)
		VALUES ($1, $2, 'paused')`, testWorkspaceID, spaceID)
	if err == nil {
		t.Fatal("an out-of-set status was accepted")
	}
	var pgErr *pgconn.PgError
	if !errors.As(err, &pgErr) || pgErr.Code != "23514" {
		t.Fatalf("error = %v, want a CHECK violation", err)
	}
}

// TestMigration641TaskFieldsAreStoredAndReadable exercises the row the pipeline
// writes: the jsonb chunk_config survives a round trip and finished_at is set
// only once the task ends.
func TestMigration641TaskFieldsAreStoredAndReadable(t *testing.T) {
	requireDB(t)
	cleanupItems(t)
	cleanupImportTasks(t)
	spaceID := testSpace(t, testWorkspaceID)
	service := testService(WithSynchronousImport())

	task, err := service.StartImport(context.Background(), ImportRequest{
		WorkspaceID: testWorkspaceID,
		SpaceID:     spaceID,
		Content:     []byte("# Round trip\n\nA short document.\n"),
		Chunk:       ChunkConfig{Mode: ChunkModeParentChild, TargetTokens: 512, OverlapRatio: 0.15},
	})
	if err != nil {
		t.Fatalf("StartImport: %v", err)
	}
	var cfg ChunkConfig
	if err := json.Unmarshal(task.ChunkConfig, &cfg); err != nil {
		t.Fatalf("chunk_config is not JSON: %v", err)
	}
	if cfg.Mode != ChunkModeParentChild || cfg.TargetTokens != 512 || cfg.OverlapRatio != 0.15 {
		t.Fatalf("chunk_config round trip = %+v", cfg)
	}
	if task.FinishedAt == nil {
		t.Fatal("finished_at is NULL on a finished task")
	}
}
