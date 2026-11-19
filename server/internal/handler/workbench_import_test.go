package handler

// Batch CSV import tests (docs/engineering/WORKBENCH-API.md §23).
//
// The cases pin the three rules, because each of them is a thing a plausible
// implementation gets wrong:
//
//   - `creator_not_found` — an import never creates a creator (rule 1);
//   - `dry_run=1` writes nothing, and the valid values are the same ones the real
//     import writes (rule 3);
//   - a batch with one bad row commits nothing at all (rule 2).
//
// They also pin the duplicate rule: re-sending the same file marks the rows `skip`
// instead of writing them twice (§23.4).

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/jerry-halo2026/morchat.co/server/internal/testutil"
)

// importRequest posts a CSV body to the import endpoint as userID.
func importRequest(t *testing.T, query, csv string, userID string) *http.Request {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, "/api/workbench/import"+query, strings.NewReader(csv))
	req.Header.Set("Content-Type", "text/csv; charset=utf-8")
	req.Header.Set("X-User-ID", userID)
	req.Header.Set("X-Workspace-ID", testWorkspaceID)
	return req
}

// importPrefixedCreator creates a creator whose handle is unique to this test, so a
// `creator_handle` cell cannot collide with another suite's fixture.
func importPrefixedCreator(t *testing.T, ownerUserID, handle string) CreatorResponse {
	t.Helper()
	req := workbenchRequest(t, "POST", "/api/workbench/creators", map[string]any{
		"kind":         "external",
		"display_name": handle,
		"platform":     "douyin",
		"handle":       handle,
	}, ownerUserID)
	created := testutil.Decode[CreatorResponse](t, testHandler.CreateCreator, req, http.StatusCreated)
	t.Cleanup(func() { dbfx.Exec(t, `DELETE FROM creator WHERE id = $1`, created.ID) })
	return created
}

// importRun posts one CSV and decodes the response.
func importRun(t *testing.T, query, csv string) ImportPreviewResponse {
	t.Helper()
	return testutil.Decode[ImportPreviewResponse](t, testHandler.ImportWorkbenchCSV, importRequest(t, query, csv, testUserID), http.StatusOK)
}

// importReasonCount counts how many errors name one reason.
func importReasonCount(response ImportPreviewResponse, reason string) int {
	count := 0
	for _, err := range response.Errors {
		if err.Reason == reason {
			count++
		}
	}
	return count
}

// TestImportQuotesDryRunPreviewsWithoutWriting covers the happy path for `quotes`
// and rule 3: the preview reports the rows, and the ledger still has none of them.
func TestImportQuotesDryRunPreviewsWithoutWriting(t *testing.T) {
	handle := "import-quotes-" + strings.ToLower(strings.ReplaceAll(t.Name(), "_", "-"))
	creator := importPrefixedCreator(t, testUserID, handle)

	csv := "creator_handle,fee_amount,commission_rate,valid_until,currency,note\n" +
		handle + ",3000,0.2,2026-12-31,CNY,首轮报价\n" +
		handle + ",4500,,,,\n"

	response := importRun(t, "?kind=quotes", csv)
	if response.Kind != importKindQuotes || response.Parsed != 2 || response.Accepted != 2 {
		t.Fatalf("preview = %+v, want 2 parsed / 2 accepted quotes", response)
	}
	if response.Committed != 0 {
		t.Fatalf("committed = %d on a dry run, want 0", response.Committed)
	}
	if len(response.Errors) != 0 {
		t.Fatalf("errors = %+v, want none", response.Errors)
	}
	if response.Rows[0].Line != 2 || response.Rows[0].Action != importActionCreate {
		t.Fatalf("first row = %+v, want line 2 / create", response.Rows[0])
	}
	if got := response.Rows[0].Preview["creator_id"]; got != creator.ID {
		t.Fatalf("preview creator_id = %v, want the resolved id %s", got, creator.ID)
	}
	if got := response.Rows[0].Preview["fee_amount"]; got != float64(3000) {
		t.Fatalf("preview fee_amount = %v, want 3000", got)
	}

	// Rule 3: the dry run wrote nothing.
	if count := dbfx.Count(t, `SELECT count(*) FROM creator_quote WHERE workspace_id = $1 AND creator_id = $2`, testWorkspaceID, creator.ID); count != 0 {
		t.Fatalf("dry run wrote %d quotes", count)
	}

	// The real import writes both rows and says so.
	response = importRun(t, "?kind=quotes&dry_run=0", csv)
	if response.Committed != 2 || response.Accepted != 2 {
		t.Fatalf("commit response = %+v, want 2 committed", response)
	}
	t.Cleanup(func() { dbfx.Exec(t, `DELETE FROM creator_quote WHERE creator_id = $1`, creator.ID) })
	if count := dbfx.Count(t, `SELECT count(*) FROM creator_quote WHERE workspace_id = $1 AND creator_id = $2`, testWorkspaceID, creator.ID); count != 2 {
		t.Fatalf("committed %d quotes, want 2", count)
	}

	// Re-sending the same file is a no-op: the duplicate key catches both rows, they
	// come back as `skip`, and nothing new is written (§23.4).
	response = importRun(t, "?kind=quotes&dry_run=0", csv)
	if response.Committed != 0 || response.Accepted != 0 {
		t.Fatalf("re-import = %+v, want nothing committed", response)
	}
	for _, row := range response.Rows {
		if row.Action != importActionSkip {
			t.Fatalf("re-import row = %+v, want action skip", row)
		}
	}
	if count := dbfx.Count(t, `SELECT count(*) FROM creator_quote WHERE workspace_id = $1 AND creator_id = $2`, testWorkspaceID, creator.ID); count != 2 {
		t.Fatalf("re-import left %d quotes, want the original 2", count)
	}
}

// TestImportActivitiesAndCollabsPreview covers the other two kinds' previews, so all
// three column tables are exercised.
func TestImportActivitiesAndCollabsPreview(t *testing.T) {
	handle := "import-bd-" + strings.ToLower(strings.ReplaceAll(t.Name(), "_", "-"))
	creator := importPrefixedCreator(t, testUserID, handle)
	client := createWorkbenchClient(t, testUserID, "Import brief client")
	brief := createWorkbenchBrief(t, client.ID, "Import brief")

	activitiesCSV := "达人账号,方式,跟进时间,内容,结果,下次跟进\n" +
		handle + ",dm,2026-11-10 09:00:00,第一次私信,replied,2026-11-18T09:00:00Z\n" +
		handle + ",meeting,2026-11-12,线下见面,,\n"
	response := importRun(t, "?kind=activities", activitiesCSV)
	if response.Parsed != 2 || response.Accepted != 2 || len(response.Errors) != 0 {
		t.Fatalf("activities preview = %+v, want 2 accepted and no errors", response)
	}
	if got := response.Rows[0].Preview["kind"]; got != "dm" {
		t.Fatalf("activity kind preview = %v, want dm", got)
	}
	if got := response.Rows[0].Preview["creator_id"]; got != creator.ID {
		t.Fatalf("activity creator preview = %v, want %s", got, creator.ID)
	}

	collabsCSV := "creator_id,brief_id,stage,quote_amount,creator_fee,currency,publish_url\n" +
		creator.ID + "," + brief.ID + ",published,8000,3000,CNY,https://example.test/publish/1\n"
	response = importRun(t, "?kind=collabs", collabsCSV)
	if response.Parsed != 1 || response.Accepted != 1 || len(response.Errors) != 0 {
		t.Fatalf("collabs preview = %+v, want 1 accepted and no errors", response)
	}
	if got := response.Rows[0].Preview["brief_id"]; got != brief.ID {
		t.Fatalf("collab brief preview = %v, want %s", got, brief.ID)
	}
	if got := response.Rows[0].Preview["stage"]; got != "published" {
		t.Fatalf("collab stage preview = %v, want published", got)
	}

	// The collab import publishes `crm_collab:changed` once per created row.
	events := collectWorkbenchEvents(t, eventCRMCollabChanged)
	response = importRun(t, "?kind=collabs&dry_run=0", collabsCSV)
	if response.Committed != 1 {
		t.Fatalf("collab import committed = %d, want 1", response.Committed)
	}
	t.Cleanup(func() { dbfx.Exec(t, `DELETE FROM crm_collab WHERE creator_id = $1`, creator.ID) })
	if events.count(eventCRMCollabChanged) != 1 {
		t.Fatalf("crm_collab:changed published %d times, want 1", events.count(eventCRMCollabChanged))
	}
	if count := dbfx.Count(t, `SELECT count(*) FROM crm_collab WHERE workspace_id = $1 AND creator_id = $2`, testWorkspaceID, creator.ID); count != 1 {
		t.Fatalf("committed %d collabs, want 1", count)
	}
}

// TestImportRowErrors covers rule 1 (no creator is invented) and the per-column
// validation reasons. Every case is a 200 with `errors`, not an API failure: a bad
// file is a normal answer.
func TestImportRowErrors(t *testing.T) {
	handle := "import-errors-" + strings.ToLower(strings.ReplaceAll(t.Name(), "_", "-"))
	creator := importPrefixedCreator(t, testUserID, handle)
	client := createWorkbenchClient(t, testUserID, "Import errors client")
	brief := createWorkbenchBrief(t, client.ID, "Import errors brief")

	// A creator that is not in this workspace, a bad amount and a bad enum in one file.
	csv := "creator_handle,fee_amount,commission_rate,valid_until\n" +
		"nobody-here,3000,,\n" +
		handle + ",abc,,\n" +
		handle + ",3000,20,\n" +
		handle + ",3000,,31/12/2026\n"
	response := importRun(t, "?kind=quotes", csv)
	if response.Parsed != 4 || response.Accepted != 0 {
		t.Fatalf("preview = %+v, want 4 parsed / 0 accepted", response)
	}
	for _, reason := range []string{importReasonCreatorNotFound, importReasonInvalidAmount, importReasonInvalidRate, importReasonInvalidDate} {
		if importReasonCount(response, reason) != 1 {
			t.Fatalf("errors = %+v, want one %s", response.Errors, reason)
		}
	}
	// The unresolved creator is reported against the column the row used.
	for _, err := range response.Errors {
		if err.Reason == importReasonCreatorNotFound && (err.Line != 2 || err.Column != "creator_handle") {
			t.Fatalf("creator error = %+v, want line 2 / creator_handle", err)
		}
	}

	// Enums: an unknown follow-up kind and outcome.
	activities := "creator_id,kind,happened_at,summary,outcome\n" +
		creator.ID + ",fax,2026-11-10,发传真,\n" +
		creator.ID + ",dm,not-a-date,私信,\n" +
		creator.ID + ",dm,2026-11-10,私信,maybe\n"
	response = importRun(t, "?kind=activities", activities)
	for _, reason := range []string{importReasonInvalidEnum, importReasonInvalidTime} {
		if importReasonCount(response, reason) == 0 {
			t.Fatalf("activities errors = %+v, want at least one %s", response.Errors, reason)
		}
	}
	if response.Accepted != 0 {
		t.Fatalf("activities accepted = %d, want 0", response.Accepted)
	}

	// A collab pointing at a brief this workspace does not have.
	collabs := "creator_id,brief_id,stage\n" +
		creator.ID + ",00000000-0000-0000-0000-000000000000,inquiry\n" +
		creator.ID + ",not-a-uuid,inquiry\n" +
		creator.ID + "," + brief.ID + ",teleported\n"
	response = importRun(t, "?kind=collabs", collabs)
	for _, reason := range []string{importReasonBriefNotFound, importReasonInvalidUUID, importReasonInvalidEnum} {
		if importReasonCount(response, reason) != 1 {
			t.Fatalf("collab errors = %+v, want one %s", response.Errors, reason)
		}
	}

	// Malformed request parameters are API errors, not row errors.
	req := importRequest(t, "?kind=invoices", "creator_handle\n", testUserID)
	testutil.Call(t, testHandler.ImportWorkbenchCSV, req).Want(http.StatusBadRequest)

	// A header without the required column fails the whole file at line 1.
	response = importRun(t, "?kind=quotes", "creator_handle,note\n"+handle+",hi\n")
	if importReasonCount(response, importReasonMissingColumn) != 1 || response.Parsed != 1 {
		t.Fatalf("missing-column response = %+v, want one missing_column at the header", response)
	}
}

// TestImportAllOrNothing covers rule 2: one bad row means the whole batch is
// rejected, and the ledger keeps nothing even though 2 of 3 rows were valid.
func TestImportAllOrNothing(t *testing.T) {
	handle := "import-atomic-" + strings.ToLower(strings.ReplaceAll(t.Name(), "_", "-"))
	creator := importPrefixedCreator(t, testUserID, handle)

	csv := "creator_handle,fee_amount,note\n" +
		handle + ",3000,ok\n" +
		handle + ",not-a-number,bad\n" +
		handle + ",4500,ok\n"

	response := importRun(t, "?kind=quotes&dry_run=0", csv)
	if response.Committed != 0 {
		t.Fatalf("committed = %d for a batch with an error, want 0", response.Committed)
	}
	if response.Accepted != 2 || len(response.Errors) != 1 {
		t.Fatalf("response = %+v, want 2 valid rows, 1 error, 0 committed", response)
	}
	if count := dbfx.Count(t, `SELECT count(*) FROM creator_quote WHERE workspace_id = $1 AND creator_id = $2`, testWorkspaceID, creator.ID); count != 0 {
		t.Fatalf("rejected batch wrote %d quotes", count)
	}
}

// TestImportTextCapsAreRowErrors covers the caps an import has to apply itself.
//
// The import writes TEXT columns straight into the ledger, so no cell ever passes
// through the request-body caps in workbenchTextLimits: a note the REST create
// refuses at 20001 characters would otherwise be stored by a spreadsheet. The answer
// is a row error with its own reason — `text_too_long` — which the dry run reports
// too, so an operator sees it before committing. The batch stays atomic (§23 rule 2),
// so `committed` is 0 rather than a half-applied file; what must not happen is a 500,
// and the rest of the file is still previewed row by row.
//
// The boundary is pinned from both sides: exactly the cap imports, one character
// more does not.
func TestImportTextCapsAreRowErrors(t *testing.T) {
	handle := "import-caps-" + strings.ToLower(strings.ReplaceAll(t.Name(), "_", "-"))
	creator := importPrefixedCreator(t, testUserID, handle)
	client := createWorkbenchClient(t, testUserID, "Import caps client")
	brief := createWorkbenchBrief(t, client.ID, "Import caps brief")

	overNote := strings.Repeat("名", workbenchNoteLimit+1)
	csv := "creator_handle,fee_amount,note\n" +
		handle + ",3000,short\n" +
		handle + ",4500," + overNote + "\n"

	preview := importRun(t, "?kind=quotes", csv)
	if preview.Parsed != 2 || preview.Accepted != 1 || preview.Committed != 0 {
		t.Fatalf("preview = %+v, want 2 parsed / 1 accepted / 0 committed", preview)
	}
	want := ImportRowError{Line: 3, Column: "note", Reason: importReasonTextTooLong}
	if len(preview.Errors) != 1 || preview.Errors[0] != want {
		t.Fatalf("errors = %+v, want exactly %+v", preview.Errors, want)
	}

	// The real import answers the same preview instead of failing the request: one bad
	// cell is a row error, and rule 2 keeps the valid rows from landing alone.
	commit := importRun(t, "?kind=quotes&dry_run=0", csv)
	if commit.Committed != 0 || importReasonCount(commit, importReasonTextTooLong) != 1 {
		t.Fatalf("commit = %+v, want 0 committed and one text_too_long", commit)
	}
	if count := dbfx.Count(t, `SELECT count(*) FROM creator_quote WHERE workspace_id = $1 AND creator_id = $2`, testWorkspaceID, creator.ID); count != 0 {
		t.Fatalf("a rejected batch wrote %d quotes", count)
	}

	// Exactly the cap is legal, and the stored note is the whole note.
	atCap := strings.Repeat("名", workbenchNoteLimit)
	boundary := "creator_handle,fee_amount,note\n" + handle + ",5200," + atCap + "\n"
	preview = importRun(t, "?kind=quotes", boundary)
	if preview.Accepted != 1 || len(preview.Errors) != 0 {
		t.Fatalf("at-cap preview = %+v, want the row accepted", preview)
	}
	commit = importRun(t, "?kind=quotes&dry_run=0", boundary)
	t.Cleanup(func() { dbfx.Exec(t, `DELETE FROM creator_quote WHERE creator_id = $1`, creator.ID) })
	if commit.Committed != 1 {
		t.Fatalf("at-cap commit = %+v, want 1", commit)
	}
	if count := dbfx.Count(t, `SELECT count(*) FROM creator_quote WHERE creator_id = $1 AND length(note) = $2`, creator.ID, workbenchNoteLimit); count != 1 {
		t.Fatalf("%d quotes stored the full %d-character note, want 1", count, workbenchNoteLimit)
	}

	// The other two kinds' capped columns: a follow-up's summary and a
	// collaboration's publish_url.
	activities := "creator_id,kind,happened_at,summary\n" +
		creator.ID + ",dm,2026-11-10," + overNote + "\n"
	preview = importRun(t, "?kind=activities", activities)
	summaryProblem := ImportRowError{Line: 2, Column: "summary", Reason: importReasonTextTooLong}
	if len(preview.Errors) != 1 || preview.Errors[0] != summaryProblem {
		t.Fatalf("activities errors = %+v, want exactly %+v", preview.Errors, summaryProblem)
	}

	const prefix = "https://example.test/"
	collabs := "creator_id,brief_id,publish_url\n" +
		creator.ID + "," + brief.ID + "," + prefix + strings.Repeat("u", workbenchURLLimit) + "\n"
	preview = importRun(t, "?kind=collabs", collabs)
	urlProblem := ImportRowError{Line: 2, Column: "publish_url", Reason: importReasonTextTooLong}
	if len(preview.Errors) != 1 || preview.Errors[0] != urlProblem {
		t.Fatalf("collabs errors = %+v, want exactly %+v", preview.Errors, urlProblem)
	}

	// A publish_url at exactly the cap imports.
	boundary = "creator_id,brief_id,publish_url\n" +
		creator.ID + "," + brief.ID + "," + prefix + strings.Repeat("u", workbenchURLLimit-len(prefix)) + "\n"
	commit = importRun(t, "?kind=collabs&dry_run=0", boundary)
	t.Cleanup(func() { dbfx.Exec(t, `DELETE FROM crm_collab WHERE creator_id = $1`, creator.ID) })
	if commit.Committed != 1 || len(commit.Errors) != 0 {
		t.Fatalf("publish_url at-cap commit = %+v, want 1 committed", commit)
	}
}

// TestImportLimits covers the two ceilings and the request-shape guards.
func TestImportLimits(t *testing.T) {
	handle := "import-limits-" + strings.ToLower(strings.ReplaceAll(t.Name(), "_", "-"))
	importPrefixedCreator(t, testUserID, handle)

	// 2001 data rows is over the row ceiling.
	var builder strings.Builder
	builder.WriteString("creator_handle,fee_amount\n")
	for i := 0; i < importMaxRows+1; i++ {
		fmt.Fprintf(&builder, "%s,%d\n", handle, i+1)
	}
	req := importRequest(t, "?kind=quotes", builder.String(), testUserID)
	testutil.Call(t, testHandler.ImportWorkbenchCSV, req).Want(http.StatusRequestEntityTooLarge)

	// A body over 1 MiB is refused before parsing.
	big := "creator_handle,fee_amount,note\n" + handle + ",1," + strings.Repeat("x", importMaxBody) + "\n"
	req = importRequest(t, "?kind=quotes", big, testUserID)
	testutil.Call(t, testHandler.ImportWorkbenchCSV, req).Want(http.StatusRequestEntityTooLarge)

	// A non-CSV content type is refused with 415; a missing one is tolerated (a shell
	// curl without -H still means "here is a file").
	req = importRequest(t, "?kind=quotes", "creator_handle,fee_amount\n", testUserID)
	req.Header.Set("Content-Type", "application/json")
	testutil.Call(t, testHandler.ImportWorkbenchCSV, req).Want(http.StatusUnsupportedMediaType)
	req = importRequest(t, "?kind=quotes", "creator_handle,fee_amount\n", testUserID)
	req.Header.Del("Content-Type")
	testutil.Call(t, testHandler.ImportWorkbenchCSV, req).Want(http.StatusOK)

	// An Excel-written BOM must not break the first header cell.
	bom := "\ufeffcreator_handle,fee_amount\n" + handle + ",1000\n"
	response := importRun(t, "?kind=quotes", bom)
	if response.Accepted != 1 || len(response.Errors) != 0 {
		t.Fatalf("BOM response = %+v, want 1 accepted", response)
	}
}
