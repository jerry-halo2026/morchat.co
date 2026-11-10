package handler

import (
	"context"
	"net/http"
	"testing"

	"github.com/jerry-halo2026/morchat.co/server/internal/testutil"
)

// The credential dimension is commercial, so both halves are asserted together:
// the terminal usage report has to STORE which key paid (`task_usage
// .credential_source`, migration 642), and the report endpoint has to group by
// it. A write path with no reader is an untestable claim, and a reader with a
// hand-seeded row proves nothing about what a daemon actually writes.
//
// The provider/model are unique to this test so the workspace-wide report can
// be read without other suites' rows moving the numbers.
const (
	credentialSourceTestProvider = "credential-source-test"
	credentialSourceTestModel    = "credential-source-model"
)

func TestReportTaskUsageRecordsCredentialSourceAndReportGroupsByIt(t *testing.T) {
	issueID := dbfx.Issue(t, "credential source usage")
	agentID := dbfx.Agent(t, "credential source agent", testRuntimeID)
	newTask := func() string {
		return dbfx.Task(t, agentID, testutil.Cols{
			"issue_id":   issueID,
			"runtime_id": testRuntimeID,
			"status":     "running",
		})
	}
	companyTask := newTask()
	personalTask := newTask()
	legacyTask := newTask()
	t.Cleanup(func() {
		dbfx.Exec(t, `DELETE FROM task_usage WHERE provider = $1`, credentialSourceTestProvider)
	})

	report := func(taskID string, entry map[string]any) {
		t.Helper()
		req := withURLParam(newOwnerDaemonRequest(http.MethodPost, "/api/daemon/tasks/"+taskID+"/usage",
			map[string]any{"usage": []map[string]any{entry}}), "taskId", taskID)
		testutil.Call(t, testHandler.ReportTaskUsage, req).Want(http.StatusOK)
	}

	report(companyTask, map[string]any{
		"provider": credentialSourceTestProvider, "model": credentialSourceTestModel,
		"input_tokens": 100, "credential_source": "company",
	})
	// Case and padding are not a third source: the handler normalises before the
	// database CHECK ever sees the value.
	report(personalTask, map[string]any{
		"provider": credentialSourceTestProvider, "model": credentialSourceTestModel,
		"input_tokens": 40, "credential_source": " Personal ",
	})
	// A daemon that predates migration 642 reports no source at all. That must
	// stay NULL ("unknown" in the report), never be inferred as `company` —
	// inferring is how an employee's own spend lands on the company ledger.
	report(legacyTask, map[string]any{
		"provider": credentialSourceTestProvider, "model": credentialSourceTestModel,
		"input_tokens": 7,
	})
	// A retried report that says nothing must not erase what the first one
	// established: silence is ignorance, not a correction.
	report(personalTask, map[string]any{
		"provider": credentialSourceTestProvider, "model": credentialSourceTestModel,
		"input_tokens": 40, "credential_source": "",
	})

	storedSource := func(taskID string) string {
		t.Helper()
		var stored *string
		if err := testPool.QueryRow(context.Background(),
			`SELECT credential_source FROM task_usage WHERE task_id = $1 AND provider = $2 AND model = $3`,
			taskID, credentialSourceTestProvider, credentialSourceTestModel,
		).Scan(&stored); err != nil {
			t.Fatalf("read credential_source for task %s: %v", taskID, err)
		}
		if stored == nil {
			return ""
		}
		return *stored
	}
	if got := storedSource(companyTask); got != CredentialSourceCompany {
		t.Fatalf("company run credential_source = %q, want %q", got, CredentialSourceCompany)
	}
	if got := storedSource(personalTask); got != CredentialSourcePersonal {
		t.Fatalf("personal run credential_source = %q, want %q (a re-report without a source must not clear it)",
			got, CredentialSourcePersonal)
	}
	if got := storedSource(legacyTask); got != "" {
		t.Fatalf("source-less run credential_source = %q, want NULL (never inferred)", got)
	}

	// The report endpoint must show the same three buckets the column holds:
	// two named sources plus the "unknown" line for rows that never recorded one.
	req := newRequest(http.MethodGet, "/api/dashboard/usage/by-credential-source?days=30", nil)
	var rows []TaskUsageByCredentialSourceRow
	testutil.Call(t, testHandler.GetTaskUsageByCredentialSource, req).Want(http.StatusOK).JSON(&rows)
	if len(rows) > 3 {
		t.Fatalf("report rows = %+v, want at most one row per credential source", rows)
	}
	bySource := make(map[string]TaskUsageByCredentialSourceRow, len(rows))
	for _, row := range rows {
		bySource[row.CredentialSource] = row
	}
	company, ok := bySource[CredentialSourceCompany]
	if !ok || company.InputTokens != 100 || company.TaskCount != 1 {
		t.Fatalf("company bucket = %+v (present %v), want 100 input tokens over 1 task", company, ok)
	}
	personal, ok := bySource[CredentialSourcePersonal]
	if !ok || personal.InputTokens != 40 || personal.TaskCount != 1 {
		t.Fatalf("personal bucket = %+v (present %v), want 40 input tokens over 1 task", personal, ok)
	}
	unknown, ok := bySource[CredentialSourceUnknown]
	if !ok || unknown.InputTokens < 7 {
		t.Fatalf("unknown bucket = %+v (present %v), want the source-less run's 7 tokens at minimum", unknown, ok)
	}
	for _, source := range []string{CredentialSourceCompany, CredentialSourcePersonal} {
		if row := bySource[source]; row.OutputTokens != 0 || row.CostUSDTicks != 0 {
			t.Fatalf("%s bucket invented output tokens or cost: %+v", source, row)
		}
	}
}

// The dimension is a reporting axis, not a pricing one: a known source must not
// change what anything else in the row says.
func TestReportTaskUsageCredentialSourceKeepsCostAndTokensIntact(t *testing.T) {
	issueID := dbfx.Issue(t, "credential source cost")
	agentID := dbfx.Agent(t, "credential source cost agent", testRuntimeID)
	taskID := dbfx.Task(t, agentID, testutil.Cols{
		"issue_id":   issueID,
		"runtime_id": testRuntimeID,
		"status":     "running",
	})
	t.Cleanup(func() {
		dbfx.Exec(t, `DELETE FROM task_usage WHERE provider = $1`, credentialSourceTestProvider)
	})

	req := withURLParam(newOwnerDaemonRequest(http.MethodPost, "/api/daemon/tasks/"+taskID+"/usage",
		map[string]any{"usage": []map[string]any{{
			"provider":          credentialSourceTestProvider,
			"model":             credentialSourceTestModel,
			"input_tokens":      300,
			"output_tokens":     60,
			"cache_read_tokens": 20,
			"cost_usd_ticks":    10_000_000_000,
			"credential_source": "personal",
		}}}), "taskId", taskID)
	testutil.Call(t, testHandler.ReportTaskUsage, req).Want(http.StatusOK)

	rows, err := testHandler.Queries.GetTaskUsage(context.Background(), parseUUID(taskID))
	if err != nil || len(rows) != 1 {
		t.Fatalf("usage rows = %v, err = %v; want one row", rows, err)
	}
	row := rows[0]
	if row.InputTokens != 300 || row.OutputTokens != 60 || row.CacheReadTokens != 20 {
		t.Fatalf("token counters changed by the credential dimension: %+v", row)
	}
	if !row.CostUsdTicks.Valid || row.CostUsdTicks.Int64 != 10_000_000_000 {
		t.Fatalf("cost_usd_ticks = %+v, want the provider's own 1e-10 USD figure untouched", row.CostUsdTicks)
	}
	var stored *string
	if err := testPool.QueryRow(context.Background(),
		`SELECT credential_source FROM task_usage WHERE task_id = $1 AND provider = $2 AND model = $3`,
		taskID, credentialSourceTestProvider, credentialSourceTestModel,
	).Scan(&stored); err != nil {
		t.Fatalf("read credential_source: %v", err)
	}
	if stored == nil || *stored != CredentialSourcePersonal {
		t.Fatalf("credential_source = %v, want %q", stored, CredentialSourcePersonal)
	}
}
