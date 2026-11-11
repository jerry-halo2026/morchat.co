package knowledge

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// 640 replaces the workspace-only page foreign keys of knowledge_page_revisions
// and knowledge_page_backlinks with (workspace_id, space_id, page_id) keys, the
// same tightening 638 applied to knowledge_items. The tests below cover the two
// directions of that swap and the one property the migration exists for: a row
// whose space_id is not the space of its page cannot be stored.
//
// Like the 637 round-trip, everything runs inside one transaction that is rolled
// back, so the shared dev database ends each test exactly as it started.

const (
	migration640Up   = "../../migrations/640_knowledge_space_fk_tighten.up.sql"
	migration640Down = "../../migrations/640_knowledge_space_fk_tighten.down.sql"
)

// constraintDef returns the definition of conname on table, or "" when the
// constraint is absent (so a missing object fails as a readable diff rather than
// as a fatal "no rows").
func constraintDef(t *testing.T, tx pgx.Tx, table, conname string) string {
	t.Helper()
	var def string
	err := tx.QueryRow(context.Background(), `
		SELECT pg_get_constraintdef(oid)
		FROM pg_constraint
		WHERE conrelid = $1::regclass AND conname = $2
	`, "public."+table, conname).Scan(&def)
	if errors.Is(err, pgx.ErrNoRows) {
		return ""
	}
	if err != nil {
		t.Fatalf("read constraint %s on %s: %v", conname, table, err)
	}
	return def
}

// TestMigration640RoundTrips checks both directions: the down file restores
// 637's workspace-only keys under their original names, and the up file replaces
// them again with the space-aware ones.
func TestMigration640RoundTrips(t *testing.T) {
	tx := beginTx(t)

	execMigrationFile(t, tx, migration640Down)
	for _, want := range []struct {
		table, conname, columns string
	}{
		{"knowledge_page_revisions", "knowledge_page_revisions_page_fkey", "FOREIGN KEY (workspace_id, page_id)"},
		{"knowledge_page_backlinks", "knowledge_page_backlinks_source_fkey", "FOREIGN KEY (workspace_id, source_page_id)"},
		{"knowledge_page_backlinks", "knowledge_page_backlinks_target_fkey", "FOREIGN KEY (workspace_id, target_page_id)"},
	} {
		def := constraintDef(t, tx, want.table, want.conname)
		if def == "" {
			t.Fatalf("after 640 down: %s is missing", want.conname)
		}
		if !strings.Contains(def, want.columns) {
			t.Errorf("after 640 down: %s = %s, want %s", want.conname, def, want.columns)
		}
		// "workspace_id" contains "space_id" as a substring, so the widened column
		// list is checked on the text with every workspace_id removed.
		if strings.Contains(strings.ReplaceAll(def, "workspace_id", ""), "space_id") {
			t.Errorf("after 640 down: %s still mentions space_id: %s", want.conname, def)
		}
	}

	execMigrationFile(t, tx, migration640Up)
	for _, want := range []struct {
		table, conname, columns string
	}{
		{"knowledge_page_revisions", "knowledge_page_revisions_page_fkey", "FOREIGN KEY (workspace_id, space_id, page_id)"},
		{"knowledge_page_backlinks", "knowledge_page_backlinks_source_fkey", "FOREIGN KEY (workspace_id, space_id, source_page_id)"},
		{"knowledge_page_backlinks", "knowledge_page_backlinks_target_fkey", "FOREIGN KEY (workspace_id, space_id, target_page_id)"},
	} {
		def := constraintDef(t, tx, want.table, want.conname)
		if def == "" {
			t.Fatalf("after 640 up: %s is missing", want.conname)
		}
		if !strings.Contains(def, want.columns) {
			t.Errorf("after 640 up: %s = %s, want %s", want.conname, def, want.columns)
		}
		if target := "REFERENCES knowledge_pages(workspace_id, space_id, id)"; !strings.Contains(def, target) {
			t.Errorf("after 640 up: %s does not reference %s: %s", want.conname, target, def)
		}
	}

	// The old key must be gone, not merely shadowed: a leftover
	// (workspace_id, page_id) key beside the new one would run two checks on every
	// page delete and leave the rollback ambiguous. Counted on the catalog, so an
	// old key under a different name is caught too.
	for _, want := range []struct {
		table string
		fks   int
	}{
		{"knowledge_page_revisions", 2}, // page, space
		{"knowledge_page_backlinks", 3}, // source, target, space
	} {
		if n := countFKOn(t, tx, want.table); n != want.fks {
			t.Errorf("%s: %d foreign keys, want %d (an old key beside the new one?)", want.table, n, want.fks)
		}
	}

	// 638 owns knowledge_pages(workspace_id, space_id, id), so it must survive both
	// directions of 640. The constraint keeps the name 638 gave it, which embeds
	// the earlier number this migration had before the 0.8.2 renumbering: it is a
	// frozen identifier in 638's SQL, not a reference to the current numbering.
	if def := constraintDef(t, tx, "knowledge_pages", "knowledge_pages_workspace_space_id_621_key"); def == "" {
		t.Error("after 640: knowledge_pages_workspace_space_id_621_key was dropped")
	}

	if err := tx.Rollback(context.Background()); err != nil && err != pgx.ErrTxClosed {
		t.Fatalf("rollback: %v", err)
	}
}

// countFKOn counts the foreign keys of table, so "one key per edge" is checked
// on the catalog instead of on a name the test already knows.
func countFKOn(t *testing.T, tx pgx.Tx, table string) int {
	t.Helper()
	var n int
	if err := tx.QueryRow(context.Background(), `
		SELECT count(*) FROM pg_constraint
		WHERE conrelid = $1::regclass AND contype = 'f'
	`, "public."+table).Scan(&n); err != nil {
		t.Fatalf("count foreign keys on %s: %v", table, err)
	}
	return n
}

// TestMigration640RefusesDriftedRows is the data-safety half: existing rows are
// checked, not repaired. A database that holds a revision (or a backlink edge)
// whose space_id disagrees with its page aborts the migration, and the error
// carries the counts so the operator knows how much to fix.
func TestMigration640RefusesDriftedRows(t *testing.T) {
	tx := beginTx(t)
	ctx := context.Background()

	// Start from the widened keys: this is the state a 637-era database can be in.
	execMigrationFile(t, tx, migration640Down)

	if _, err := tx.Exec(ctx, `
		INSERT INTO knowledge_instances (workspace_id, wiki_id)
		VALUES ($1, 'default') ON CONFLICT DO NOTHING
	`, testWorkspaceID); err != nil {
		t.Fatalf("insert knowledge instance: %v", err)
	}
	var spaceA, spaceB, pageID string
	if err := tx.QueryRow(ctx, `
		INSERT INTO knowledge_spaces (workspace_id, wiki_id, slug, display_name)
		VALUES ($1, 'default', 'drift-a', 'Drift A') RETURNING id
	`, testWorkspaceID).Scan(&spaceA); err != nil {
		t.Fatalf("insert space A: %v", err)
	}
	if err := tx.QueryRow(ctx, `
		INSERT INTO knowledge_spaces (workspace_id, wiki_id, slug, display_name)
		VALUES ($1, 'default', 'drift-b', 'Drift B') RETURNING id
	`, testWorkspaceID).Scan(&spaceB); err != nil {
		t.Fatalf("insert space B: %v", err)
	}
	if err := tx.QueryRow(ctx, `
		INSERT INTO knowledge_pages (workspace_id, space_id, path)
		VALUES ($1, $2, 'wiki/drifted.md') RETURNING id
	`, testWorkspaceID, spaceA).Scan(&pageID); err != nil {
		t.Fatalf("insert page: %v", err)
	}

	// The drift a workspace-only key allows: the page is in space A, the row
	// claims space B.
	if _, err := tx.Exec(ctx, `
		INSERT INTO knowledge_page_revisions (workspace_id, space_id, page_id, path, content_hash)
		VALUES ($1, $2, $3, 'wiki/drifted.md', 'sha256:drifted')
	`, testWorkspaceID, spaceB, pageID); err != nil {
		t.Fatalf("insert drifted revision under the widened key: %v", err)
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO knowledge_page_backlinks (workspace_id, space_id, source_page_id, target_path)
		VALUES ($1, $2, $3, 'wiki/elsewhere.md')
	`, testWorkspaceID, spaceB, pageID); err != nil {
		t.Fatalf("insert drifted backlink under the widened key: %v", err)
	}

	body, err := os.ReadFile(filepath.Clean(migration640Up))
	if err != nil {
		t.Fatalf("read %s: %v", migration640Up, err)
	}
	if _, err := tx.Exec(ctx, string(body)); err == nil {
		t.Fatal("640 applied although a revision and a backlink name a space their page is not in")
	} else {
		message := err.Error()
		for _, want := range []string{
			"migration 640",
			"1 knowledge_page_revisions row(s)",
			"1 knowledge_page_backlinks source edge(s)",
		} {
			if !strings.Contains(message, want) {
				t.Errorf("migration error does not report %q:\n%s", want, message)
			}
		}
	}
}

// TestMigration640KeepsConsistentRows is the other half: a database whose rows
// already agree migrates, the rows survive untouched, and the composite key is in
// force afterwards.
func TestMigration640KeepsConsistentRows(t *testing.T) {
	tx := beginTx(t)
	ctx := context.Background()

	execMigrationFile(t, tx, migration640Down)

	if _, err := tx.Exec(ctx, `
		INSERT INTO knowledge_instances (workspace_id, wiki_id)
		VALUES ($1, 'default') ON CONFLICT DO NOTHING
	`, testWorkspaceID); err != nil {
		t.Fatalf("insert knowledge instance: %v", err)
	}
	var spaceID, pageID, revisionID string
	if err := tx.QueryRow(ctx, `
		INSERT INTO knowledge_spaces (workspace_id, wiki_id, slug, display_name)
		VALUES ($1, 'default', 'consistent', 'Consistent') RETURNING id
	`, testWorkspaceID).Scan(&spaceID); err != nil {
		t.Fatalf("insert space: %v", err)
	}
	if err := tx.QueryRow(ctx, `
		INSERT INTO knowledge_pages (workspace_id, space_id, path)
		VALUES ($1, $2, 'wiki/consistent.md') RETURNING id
	`, testWorkspaceID, spaceID).Scan(&pageID); err != nil {
		t.Fatalf("insert page: %v", err)
	}
	if err := tx.QueryRow(ctx, `
		INSERT INTO knowledge_page_revisions (workspace_id, space_id, page_id, path, content_hash)
		VALUES ($1, $2, $3, 'wiki/consistent.md', 'sha256:consistent') RETURNING id
	`, testWorkspaceID, spaceID, pageID).Scan(&revisionID); err != nil {
		t.Fatalf("insert revision: %v", err)
	}

	execMigrationFile(t, tx, migration640Up)

	var kept int
	if err := tx.QueryRow(ctx, `
		SELECT count(*) FROM knowledge_page_revisions
		WHERE workspace_id = $1 AND id = $2 AND space_id = $3 AND page_id = $4
	`, testWorkspaceID, revisionID, spaceID, pageID).Scan(&kept); err != nil {
		t.Fatalf("count revision after up: %v", err)
	}
	if kept != 1 {
		t.Fatalf("consistent revision did not survive the migration (rows=%d)", kept)
	}

	// The key is now enforced by the database itself.
	_, err := tx.Exec(ctx, `
		INSERT INTO knowledge_page_revisions (workspace_id, space_id, page_id, path, content_hash)
		VALUES ($1, $2, $3, 'wiki/consistent.md', 'sha256:other')
	`, testWorkspaceID, mustOtherSpace(t, tx, testWorkspaceID), pageID)
	var pgErr *pgconn.PgError
	if !errors.As(err, &pgErr) || pgErr.Code != "23503" {
		t.Fatalf("drifted insert after up: err = %v, want SQLSTATE 23503", err)
	}
}

func mustOtherSpace(t *testing.T, tx pgx.Tx, workspaceID string) string {
	t.Helper()
	var id string
	if err := tx.QueryRow(context.Background(), `
		INSERT INTO knowledge_spaces (workspace_id, wiki_id, slug, display_name)
		VALUES ($1, 'default', 'other-space', 'Other') RETURNING id
	`, workspaceID).Scan(&id); err != nil {
		t.Fatalf("insert other space: %v", err)
	}
	return id
}
