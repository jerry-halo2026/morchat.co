package knowledge

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5"
)

// The 637 round-trip runs inside one transaction: apply the down file, assert
// the knowledge schema is gone, apply the up file again, assert it is back, then
// roll back. A shared dev database therefore ends the test exactly as it started,
// while both directions of the migration are exercised for real.

func beginTx(t *testing.T) pgx.Tx {
	t.Helper()
	requireDB(t)
	ctx := context.Background()
	tx, err := testPool.Begin(ctx)
	if err != nil {
		t.Fatalf("begin: %v", err)
	}
	t.Cleanup(func() {
		if err := tx.Rollback(context.Background()); err != nil && err != pgx.ErrTxClosed {
			t.Errorf("rollback: %v", err)
		}
	})
	return tx
}

func execMigrationFile(t *testing.T, tx pgx.Tx, path string) {
	t.Helper()
	body, err := os.ReadFile(filepath.Clean(path))
	if err != nil {
		t.Fatalf("read %s: %v", path, err)
	}
	if _, err := tx.Exec(context.Background(), string(body)); err != nil {
		t.Fatalf("apply %s: %v", filepath.Base(path), err)
	}
}

func countKnowledgeTables(t *testing.T, tx pgx.Tx) int {
	t.Helper()
	var n int
	if err := tx.QueryRow(context.Background(), `
		SELECT count(*) FROM pg_tables
		WHERE schemaname = 'public' AND tablename LIKE 'knowledge\_%'
	`).Scan(&n); err != nil {
		t.Fatalf("count knowledge tables: %v", err)
	}
	return n
}

func TestMigration637RoundTrip(t *testing.T) {
	tx := beginTx(t)

	// The state the test found, so the rollback assertion does not have to know
	// how many knowledge_* tables later migrations have added since 620.
	before := countKnowledgeTables(t, mustTx(t))

	rollBackAfter620(t, tx)
	execMigrationFile(t, tx, migrationDown)
	if n := countKnowledgeTables(t, tx); n != 0 {
		t.Fatalf("after down: %d knowledge_* tables remain", n)
	}

	execMigrationFile(t, tx, migrationUp)
	if n := countKnowledgeTables(t, tx); n != 12 {
		t.Fatalf("after up: %d knowledge_* tables, want 12", n)
	}

	// Every registry enum must be enforced by the constraint the registry names,
	// not merely by a constraint of a similar name.
	for _, enum := range Enums {
		var definition string
		err := tx.QueryRow(context.Background(), `
			SELECT pg_get_constraintdef(oid)
			FROM pg_constraint
			WHERE conname = $1 AND contype = 'c'
		`, enum.Constraint).Scan(&definition)
		if err != nil {
			t.Fatalf("%s: constraint %s missing after up: %v", enum.Field, enum.Constraint, err)
		}
		for _, value := range enum.Values {
			if !strings.Contains(definition, "'"+value+"'") {
				t.Errorf("%s: constraint %s does not mention %q: %s",
					enum.Field, enum.Constraint, value, definition)
			}
		}
	}

	// Re-segmentation depends on the generation being part of the chunk key.
	var chunkKey string
	if err := tx.QueryRow(context.Background(), `
		SELECT pg_get_constraintdef(oid)
		FROM pg_constraint
		WHERE conname = 'knowledge_chunks_document_generation_ord_key'
	`).Scan(&chunkKey); err != nil {
		t.Fatalf("chunk uniqueness constraint missing: %v", err)
	}
	if !strings.Contains(chunkKey, "document_id, generation, ord") {
		t.Errorf("chunk key = %s, want (document_id, generation, ord)", chunkKey)
	}

	// Roll back to the state the test found.
	if err := tx.Rollback(context.Background()); err != nil {
		t.Fatalf("rollback: %v", err)
	}
	if n := countKnowledgeTables(t, mustTx(t)); n != before {
		t.Fatalf("after rollback: %d knowledge_* tables, want the %d the database had", n, before)
	}
}

func mustTx(t *testing.T) pgx.Tx {
	t.Helper()
	tx, err := testPool.Begin(context.Background())
	if err != nil {
		t.Fatalf("begin: %v", err)
	}
	t.Cleanup(func() { _ = tx.Rollback(context.Background()) })
	return tx
}

// TestMigration637AppliesWithoutPgvector is the fail-soft guarantee plan §4 asks
// for: on a server with no pgvector, the migration must still apply and simply
// skip the embedding column.
//
// The absence is simulated by dropping the extension inside the transaction and
// running the up file as a role that cannot install it — so the pgvector
// branches really do go through their exception handlers instead of the test
// asserting that a guard exists.
func TestMigration637AppliesWithoutPgvector(t *testing.T) {
	tx := beginTx(t)
	ctx := context.Background()

	rollBackAfter620(t, tx)
	execMigrationFile(t, tx, migrationDown)

	suffix := make([]byte, 4)
	if _, err := rand.Read(suffix); err != nil {
		t.Fatal(err)
	}
	role := "kn_novec_" + hex.EncodeToString(suffix)

	if _, err := tx.Exec(ctx, "CREATE ROLE "+role+" NOSUPERUSER NOLOGIN"); err != nil {
		t.Fatalf("create role: %v", err)
	}
	t.Cleanup(func() {
		_, _ = testPool.Exec(context.Background(), "DROP ROLE IF EXISTS "+role)
	})
	// The role needs to build objects in public and to reference the workspace /
	// project / issue tables its foreign keys point at.
	if _, err := tx.Exec(ctx, "GRANT USAGE, CREATE ON SCHEMA public TO "+role); err != nil {
		t.Fatalf("grant schema: %v", err)
	}
	if _, err := tx.Exec(ctx,
		"GRANT REFERENCES ON public.workspace, public.project, public.issue TO "+role); err != nil {
		t.Fatalf("grant references: %v", err)
	}
	if _, err := tx.Exec(ctx, "DROP EXTENSION IF EXISTS vector CASCADE"); err != nil {
		t.Fatalf("drop vector extension: %v", err)
	}
	if _, err := tx.Exec(ctx, "SET LOCAL ROLE "+role); err != nil {
		t.Fatalf("set role: %v", err)
	}

	// Nothing here may fail: every missing extension is caught by its own DO block.
	execMigrationFile(t, tx, migrationUp)

	if n := countKnowledgeTables(t, tx); n != 12 {
		t.Fatalf("without pgvector: %d knowledge_* tables, want 12", n)
	}
	var hasEmbedding bool
	if err := tx.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM information_schema.columns
			WHERE table_schema = 'public'
			  AND table_name = 'knowledge_chunks'
			  AND column_name = 'embedding'
		)
	`).Scan(&hasEmbedding); err != nil {
		t.Fatalf("select columns: %v", err)
	}
	if hasEmbedding {
		t.Fatal("embedding column exists although pgvector is absent")
	}
	if _, err := tx.Exec(ctx, "RESET ROLE"); err != nil {
		t.Fatalf("reset role: %v", err)
	}
	if err := tx.Rollback(ctx); err != nil {
		t.Fatalf("rollback: %v", err)
	}
}

// TestMigration637CreatesEmbeddingWherePgvectorExists is the other side: on the
// pgvector image the column and its HNSW index must be there after a plain up.
func TestMigration637CreatesEmbeddingWherePgvectorExists(t *testing.T) {
	tx := beginTx(t)
	ctx := context.Background()

	var available bool
	if err := tx.QueryRow(ctx, `
		SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector')
	`).Scan(&available); err != nil {
		t.Fatal(err)
	}
	if !available {
		t.Skip("pgvector is not installed on this database")
	}

	rollBackAfter620(t, tx)
	execMigrationFile(t, tx, migrationDown)
	execMigrationFile(t, tx, migrationUp)

	var columnType string
	if err := tx.QueryRow(ctx, `
		SELECT format_type(a.atttypid, a.atttypmod)
		FROM pg_attribute a
		JOIN pg_class c ON c.oid = a.attrelid
		WHERE c.relname = 'knowledge_chunks' AND a.attname = 'embedding' AND a.attnum > 0
	`).Scan(&columnType); err != nil {
		t.Fatalf("read embedding column: %v", err)
	}
	if want := fmt.Sprintf("vector(%d)", EmbeddingDim); columnType != want {
		t.Fatalf("embedding type = %s, want %s", columnType, want)
	}
	var indexDef string
	if err := tx.QueryRow(ctx, `
		SELECT indexdef FROM pg_indexes
		WHERE schemaname = 'public' AND indexname = 'knowledge_chunks_embedding_idx'
	`).Scan(&indexDef); err != nil {
		t.Fatalf("read embedding index: %v", err)
	}
	if !strings.Contains(indexDef, "hnsw") {
		t.Fatalf("embedding index is not HNSW: %s", indexDef)
	}
}
