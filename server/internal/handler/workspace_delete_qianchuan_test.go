package handler

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	db "github.com/jerry-halo2026/morchat.co/server/pkg/db/generated"
)

// qianchuanDeleteTables is the twelve ads ledgers migrations 840–852 introduced
// (WORKBENCH-API §25). They are listed here by hand on purpose: the manifest test
// proves the schema is classified, this test proves the teardown actually reaches
// the rows, and a new table has to be added to both.
var qianchuanDeleteTables = []string{
	"qianchuan_account",
	"qianchuan_anchor",
	"qianchuan_balance",
	"qianchuan_daily_overall",
	"qianchuan_daily_uni_live",
	"qianchuan_daily_uni_video",
	"qianchuan_material",
	"qianchuan_oplog",
	"qianchuan_plan",
	"qianchuan_product",
	"qianchuan_recon",
	"qianchuan_violation",
}

// TestWorkspaceDeleteQianchuanRemovesOnlyItsOwnRows proves the two halves of the
// defect at once: the twelve Qianchuan tables are empty for the deleted workspace
// (otherwise a teardown leaves rows no foreign key would ever clean), and a second
// workspace's rows are untouched (otherwise "delete my workspace" would be a
// cross-tenant delete).
func TestWorkspaceDeleteQianchuanRemovesOnlyItsOwnRows(t *testing.T) {
	if testPool == nil {
		t.Skip("database not available")
	}
	ctx := context.Background()

	suffix := fmt.Sprintf("%d", time.Now().UnixNano())
	newWorkspace := func(label string) string {
		t.Helper()
		var id string
		if err := testPool.QueryRow(ctx,
			`INSERT INTO workspace (name, slug) VALUES ($1, $2) RETURNING id`,
			"Qianchuan teardown "+label, "qianchuan-teardown-"+label+"-"+suffix).Scan(&id); err != nil {
			t.Fatalf("create %s workspace: %v", label, err)
		}
		t.Cleanup(func() {
			_, _ = testPool.Exec(context.Background(), `DELETE FROM workspace WHERE id = $1`, id)
		})
		return id
	}

	doomed := newWorkspace("doomed")
	bystander := newWorkspace("bystander")

	// Every row these tables hold is a sync-written snapshot: the only NOT NULL
	// columns without a default are the natural key, the provenance pair and
	// workspace_id, so a minimal insert is a faithful row.
	seed := func(workspaceID, tag string) {
		t.Helper()
		inserts := []struct {
			sql  string
			args []any
		}{
			{`INSERT INTO qianchuan_account (workspace_id, account_id, account_name, source_version, captured_at)
			  VALUES ($1, $2, 'account', 'v1', now())`, []any{workspaceID, "acct-" + tag}},
			{`INSERT INTO qianchuan_anchor (workspace_id, account_id, aweme_id, aweme_name, source_version, captured_at)
			  VALUES ($1, $2, $3, 'anchor', 'v1', now())`, []any{workspaceID, "acct-" + tag, "aweme-" + tag}},
			{`INSERT INTO qianchuan_plan (workspace_id, plan_id, account_id, name, source_version, captured_at)
			  VALUES ($1, $2, $3, 'plan', 'v1', now())`, []any{workspaceID, "plan-" + tag, "acct-" + tag}},
			{`INSERT INTO qianchuan_balance (workspace_id, account_id, balance, source_version, captured_at)
			  VALUES ($1, $2, 100.00, 'v1', now())`, []any{workspaceID, "acct-" + tag}},
			{`INSERT INTO qianchuan_daily_overall (workspace_id, stat_date, account_id, spend, gmv, source_version, captured_at)
			  VALUES ($1, '2026-11-01', $2, 10.00, 20.00, 'v1', now())`, []any{workspaceID, "acct-" + tag}},
			{`INSERT INTO qianchuan_daily_uni_live (workspace_id, stat_date, account_id, dim_id, spend, source_version, captured_at)
			  VALUES ($1, '2026-11-01', $2, $3, 10.00, 'v1', now())`, []any{workspaceID, "acct-" + tag, "live-" + tag}},
			{`INSERT INTO qianchuan_daily_uni_video (workspace_id, stat_date, account_id, dim_id, spend, source_version, captured_at)
			  VALUES ($1, '2026-11-01', $2, $3, 10.00, 'v1', now())`, []any{workspaceID, "acct-" + tag, "video-" + tag}},
			{`INSERT INTO qianchuan_product (workspace_id, product_id, account_id, product_name, source_version, captured_at)
			  VALUES ($1, $2, $3, 'product', 'v1', now())`, []any{workspaceID, "product-" + tag, "acct-" + tag}},
			{`INSERT INTO qianchuan_material (workspace_id, kind, material_id, account_id, source_version, captured_at)
			  VALUES ($1, 'video', $2, $3, 'v1', now())`, []any{workspaceID, "material-" + tag, "acct-" + tag}},
			{`INSERT INTO qianchuan_violation (workspace_id, event_id, account_id, illegal_type, source_version, captured_at)
			  VALUES ($1, $2, $3, 'material', 'v1', now())`, []any{workspaceID, "event-" + tag, "acct-" + tag}},
			{`INSERT INTO qianchuan_oplog (workspace_id, log_id, account_id, action, source_version, captured_at)
			  VALUES ($1, $2, $3, 'create', 'v1', now())`, []any{workspaceID, "log-" + tag, "acct-" + tag}},
			{`INSERT INTO qianchuan_recon (workspace_id, account_id, goal, acct_cost, source_version, captured_at)
			  VALUES ($1, $2, 'ALL', 10.00, 'v1', now())`, []any{workspaceID, "acct-" + tag}},
		}
		for _, insert := range inserts {
			if _, err := testPool.Exec(ctx, insert.sql, insert.args...); err != nil {
				t.Fatalf("seed %s for %s: %v\n%s", tag, workspaceID, err, insert.sql)
			}
		}
	}
	seed(doomed, "doomed")
	seed(bystander, "bystander")

	count := func(table, workspaceID string) int {
		t.Helper()
		var n int
		if err := testPool.QueryRow(ctx,
			"SELECT count(*) FROM "+table+" WHERE workspace_id = $1", workspaceID).Scan(&n); err != nil {
			t.Fatalf("count %s: %v", table, err)
		}
		return n
	}

	for _, table := range qianchuanDeleteTables {
		for _, workspaceID := range []string{doomed, bystander} {
			if n := count(table, workspaceID); n == 0 {
				t.Fatalf("seed did not reach %s for workspace %s", table, workspaceID)
			}
		}
	}

	var doomedUUID pgtype.UUID
	if err := doomedUUID.Scan(doomed); err != nil {
		t.Fatalf("parse workspace id: %v", err)
	}
	if err := deleteWorkspaceQianchuan(ctx, db.New(testPool), doomedUUID); err != nil {
		t.Fatalf("deleteWorkspaceQianchuan: %v", err)
	}

	for _, table := range qianchuanDeleteTables {
		if n := count(table, doomed); n != 0 {
			t.Errorf("%s still has %d row(s) for the deleted workspace", table, n)
		}
		// The bystander is the evidence that the sweep is keyed by workspace_id
		// and not "delete everything": a teardown that got this wrong would pass
		// the assertion above on its own.
		if n := count(table, bystander); n == 0 {
			t.Errorf("%s lost the other workspace's rows during teardown", table)
		}
	}
}
