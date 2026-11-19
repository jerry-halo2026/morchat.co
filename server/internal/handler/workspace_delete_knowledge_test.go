package handler

import (
	"context"
	"testing"

	"github.com/jackc/pgx/v5/pgtype"

	db "github.com/jerry-halo2026/morchat.co/server/pkg/db/generated"
)

// deleteWorkspaceKnowledge must empty a workspace that used the knowledge
// domain, and must do it without tripping the real foreign keys those tables
// still carry (migrations 637鈥?51 predate the no-FK rule): chunk 鈫?document 鈫?// item 鈫?page 鈫?space 鈫?instance, plus the space/issue/project references on the
// distillation tables.
//
// The manifest test only proves the tables are classified. This one proves the
// order works, which is the actual defect: a workspace that had ever opened a
// knowledge space could not be deleted at all, because the project/issue deletes
// hit `knowledge_*_project_fkey` / `knowledge_*_issue_fkey`.
func TestDeleteWorkspaceKnowledgeRemovesTheWholeFamily(t *testing.T) {
	if testPool == nil {
		t.Skip("database not available")
	}
	ctx := context.Background()

	var workspaceID string
	if err := testPool.QueryRow(ctx,
		`INSERT INTO workspace (name, slug) VALUES ($1, $2) RETURNING id`,
		"Knowledge teardown", "knowledge-teardown").Scan(&workspaceID); err != nil {
		t.Fatalf("create workspace: %v", err)
	}
	t.Cleanup(func() {
		_, _ = testPool.Exec(context.Background(), `DELETE FROM workspace WHERE id = $1`, workspaceID)
	})
	workspaceDeleteScratch(t, workspaceID)

	exec := func(sql string, args ...any) {
		t.Helper()
		if _, err := testPool.Exec(ctx, sql, args...); err != nil {
			t.Fatalf("seed: %v\n%s", err, sql)
		}
	}

	// instance 鈫?space 鈫?page 鈫?item 鈫?document 鈫?chunk, each insert satisfying
	// the key its child points at.
	exec(`INSERT INTO knowledge_instances (workspace_id) VALUES ($1)`, workspaceID)
	exec(`INSERT INTO knowledge_spaces (workspace_id, slug, display_name)
	      VALUES ($1, 'docs', 'Docs')`, workspaceID)
	exec(`INSERT INTO knowledge_pages (workspace_id, space_id, path)
	      SELECT $1, id, 'intro' FROM knowledge_spaces WHERE workspace_id = $1`, workspaceID)
	exec(`INSERT INTO knowledge_items (workspace_id, title, space_id, page_id)
	      SELECT $1, 'Intro', s.id, p.id
	      FROM knowledge_spaces s, knowledge_pages p
	      WHERE s.workspace_id = $1 AND p.workspace_id = $1`, workspaceID)
	exec(`INSERT INTO knowledge_documents (workspace_id, item_id)
	      SELECT $1, id FROM knowledge_items WHERE workspace_id = $1`, workspaceID)
	exec(`INSERT INTO knowledge_chunks (workspace_id, document_id, ord, content)
	      SELECT $1, id, 0, 'hello' FROM knowledge_documents WHERE workspace_id = $1`, workspaceID)
	// Distillation hangs off the same space in the other direction, so the
	// ordering has to satisfy both.
	exec(`INSERT INTO knowledge_distillation_work_items (workspace_id, space_id, work_item_kind)
	      SELECT $1, id, 'distill' FROM knowledge_spaces WHERE workspace_id = $1`, workspaceID)
	exec(`INSERT INTO knowledge_distillation_cursors (workspace_id, space_id, source_scope, scope_key)
	      SELECT $1, id, 'page', 'docs/intro' FROM knowledge_spaces WHERE workspace_id = $1`, workspaceID)
	exec(`INSERT INTO knowledge_distillation_runs (workspace_id, space_id, work_item_id, cursor_id, status)
	      SELECT $1, s.id, w.id, c.id, 'queued'
	      FROM knowledge_spaces s, knowledge_distillation_work_items w, knowledge_distillation_cursors c
	      WHERE s.workspace_id = $1 AND w.workspace_id = $1 AND c.workspace_id = $1`, workspaceID)
	var userID string
	if err := testPool.QueryRow(ctx,
		`INSERT INTO "user" (name, email) VALUES ($1, $2) RETURNING id`,
		"gone", "knowledge-teardown@example.test").Scan(&userID); err != nil {
		t.Fatalf("create user: %v", err)
	}
	t.Cleanup(func() {
		_, _ = testPool.Exec(context.Background(), `DELETE FROM "user" WHERE id = $1`, userID)
	})
	exec(`INSERT INTO gateway_credentials (workspace_id, user_id, provider, device_id, token_name, secret_cipher)
	      VALUES ($1, $2, 'openai', 'device-1', 'token', 'cipher')`, workspaceID, userID)

	count := func(table string) int {
		t.Helper()
		var n int
		if err := testPool.QueryRow(ctx,
			"SELECT count(*) FROM "+table+" WHERE workspace_id = $1", workspaceID).Scan(&n); err != nil {
			t.Fatalf("count %s: %v", table, err)
		}
		return n
	}

	tables := []string{
		"knowledge_chunks", "knowledge_documents", "knowledge_items", "knowledge_pages",
		"knowledge_spaces", "knowledge_instances",
		"knowledge_distillation_runs", "knowledge_distillation_work_items",
		"knowledge_distillation_cursors", "gateway_credentials",
	}
	for _, table := range tables {
		if n := count(table); n == 0 {
			t.Fatalf("seed did not reach %s", table)
		}
	}

	var wsUUID pgtype.UUID
	if err := wsUUID.Scan(workspaceID); err != nil {
		t.Fatalf("parse workspace id: %v", err)
	}
	if err := deleteWorkspaceKnowledge(ctx, db.New(testPool), wsUUID); err != nil {
		t.Fatalf("deleteWorkspaceKnowledge: %v", err)
	}

	for _, table := range tables {
		if n := count(table); n != 0 {
			t.Errorf("%s still has %d row(s)", table, n)
		}
	}
}
