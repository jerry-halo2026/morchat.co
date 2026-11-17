package handler

// Offboarding tests (docs/engineering/WORKBENCH-API.md §15).
//
// Three properties this domain has to prove beyond the shared ledger rules:
//
//   - the four segments are a machine, not a column: one legal forward step, one
//     way out, and everything else is 409 rather than a silent write;
//   - reaching `done` writes `hr_employee_profile.leave_date` from `last_day`, in
//     the same request — that write-back is the whole reason the record exists;
//   - "one live record per employee" is a 409, while a cancelled record frees the
//     slot, so an exit that was called off can be re-initiated.
//
// The write gate is checked where it differs from the rest of the workbench: a
// `member` may edit the record it owns, but may not walk it to `done`.

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"strings"
	"testing"

	"github.com/jerry-halo2026/morchat.co/server/internal/testutil"
	"github.com/jerry-halo2026/morchat.co/server/internal/util"
)

// workbenchOtherMember joins a second `member` to the test workspace under its
// own address. workbenchTestMember derives the address from the test name, so a
// test that needs two members has to name the second one differently.
func workbenchOtherMember(t *testing.T) string {
	t.Helper()
	suffix := strings.NewReplacer("_", "-", "/", "-").Replace(strings.ToLower(t.Name()))
	userID := dbfx.User(t, "Workbench Other Member", fmt.Sprintf("wb-other-%s@multica.ai", suffix))
	dbfx.Member(t, testWorkspaceID, userID, "member")
	return userID
}

// createOffboardEmployeeFixture creates one employee profile to hang an exit
// record on. The member behind it is its own address (not workbenchTestMember's),
// so a test can also build a second member without colliding on the shared one.
func createOffboardEmployeeFixture(t *testing.T) HrEmployeeProfileResponse {
	t.Helper()
	suffix := strings.NewReplacer("_", "-", "/", "-").Replace(strings.ToLower(t.Name()))
	memberUserID := dbfx.User(t, "Offboarding Employee", fmt.Sprintf("wb-employee-%s@multica.ai", suffix))
	dbfx.Member(t, testWorkspaceID, memberUserID, "member")
	req := workbenchRequest(t, "POST", "/api/workbench/hr/employees", map[string]any{
		"member_id": memberUserID,
		"job_title": "Backend Engineer",
		"grade":     "P5",
		"hire_date": "2023-03-01",
	}, testUserID)
	profile := testutil.Decode[HrEmployeeProfileResponse](t, testHandler.CreateHrEmployee, req, http.StatusCreated)
	t.Cleanup(func() { dbfx.Exec(t, `DELETE FROM hr_employee_profile WHERE id = $1`, profile.ID) })
	return profile
}

// createHrOffboardingFixture creates one exit record through the handler and
// registers its cleanup. The default body is the page's 发起离职: a planned last
// day, a free-text reason, a kind and a two-entry checklist.
func createHrOffboardingFixture(t *testing.T, employeeID string, body map[string]any, want int) HrOffboardingResponse {
	t.Helper()
	payload := map[string]any{
		"employee_id": employeeID,
		"last_day":    "2026-12-31",
		"reason":      "家庭原因，回原籍发展",
		"kind":        "voluntary",
		"handover": []map[string]any{
			{"label": "源代码仓库权限交接", "note": ""},
			{"label": "客户对接人名册", "note": ""},
		},
	}
	for key, value := range body {
		payload[key] = value
	}
	req := workbenchRequest(t, "POST", "/api/workbench/hr/offboardings", payload, testUserID)
	created := testutil.Decode[HrOffboardingResponse](t, testHandler.CreateHrOffboarding, req, want)
	if want == http.StatusCreated {
		t.Cleanup(func() { dbfx.Exec(t, `DELETE FROM hr_offboarding WHERE id = $1`, created.ID) })
	}
	return created
}

// offboardListResponse is the list envelope the contract fixes in §3.1:
// `{ <resource>: T[], total }`, with `total` counting this page only.
type offboardListResponse struct {
	Offboardings []HrOffboardingResponse `json:"offboardings"`
	Total        int                     `json:"total"`
}

// handoverItems builds a checklist of n labelled entries.
func handoverItems(n int) []map[string]any {
	items := make([]map[string]any, 0, n)
	for i := 0; i < n; i++ {
		items = append(items, map[string]any{"label": fmt.Sprintf("交接事项 %d", i)})
	}
	return items
}

// TestOffboardDuplicateOpenRecordIsConflict covers ①: one live record per
// employee. The second create is a 409 with a message, not a second plan that
// would give the roster two answers about one person's last day.
func TestOffboardDuplicateOpenRecordIsConflict(t *testing.T) {
	employee := createOffboardEmployeeFixture(t)

	created := createHrOffboardingFixture(t, employee.ID, nil, http.StatusCreated)
	if created.Status != "apply" {
		t.Fatalf("new offboarding status = %q, want apply", created.Status)
	}
	if created.EmployeeID != employee.ID {
		t.Fatalf("employee_id = %s, want %s", created.EmployeeID, employee.ID)
	}
	if created.LastDay != "2026-12-31" {
		t.Fatalf("last_day = %q, want the requested 2026-12-31", created.LastDay)
	}
	if created.Kind != "voluntary" {
		t.Fatalf("kind = %q, want voluntary", created.Kind)
	}
	// The checklist arrives addressed: a label-only entry gets a generated key.
	if len(created.Handover) != 2 {
		t.Fatalf("handover has %d entries, want 2", len(created.Handover))
	}
	if created.Handover[0].Key == "" || created.Handover[0].Key == created.Handover[1].Key {
		t.Fatalf("handover keys = %q / %q, want two distinct generated keys",
			created.Handover[0].Key, created.Handover[1].Key)
	}

	// The same employee again — a different last day, same open record — is 409.
	req := workbenchRequest(t, "POST", "/api/workbench/hr/offboardings", map[string]any{
		"employee_id": employee.ID,
		"last_day":    "2027-01-31",
	}, testUserID)
	testutil.Call(t, testHandler.CreateHrOffboarding, req).Want(http.StatusConflict)
}

// TestOffboardHandoverCeiling covers ②: 40 entries is the contract's ceiling, and
// the 41st is a 400 on every path that writes the list — create and append alike.
func TestOffboardHandoverCeiling(t *testing.T) {
	employee := createOffboardEmployeeFixture(t)

	// A create that starts over the ceiling is rejected before the row exists.
	createHrOffboardingFixture(t, employee.ID, map[string]any{
		"handover": handoverItems(hrOffboardingMaxHandover + 1),
	}, http.StatusBadRequest)

	// Exactly at the ceiling is accepted.
	saved := createHrOffboardingFixture(t, employee.ID, map[string]any{
		"handover": handoverItems(hrOffboardingMaxHandover),
	}, http.StatusCreated)
	if len(saved.Handover) != hrOffboardingMaxHandover {
		t.Fatalf("saved %d entries, want the ceiling %d", len(saved.Handover), hrOffboardingMaxHandover)
	}

	// Appending to a full checklist is a 400 rather than a silent drop.
	req := workbenchRequest(t, "POST", "/api/workbench/hr/offboardings/"+saved.ID+"/handover",
		map[string]any{"label": "多出来的一项"}, testUserID)
	req = withURLParam(req, "offboardingId", saved.ID)
	testutil.Call(t, testHandler.AppendHrOffboardingHandoverItem, req).Want(http.StatusBadRequest)

	// An entry without a label is a 400 too: a checklist line nobody can read is
	// not a checklist line.
	req = workbenchRequest(t, "POST", "/api/workbench/hr/offboardings/"+saved.ID+"/handover",
		map[string]any{"note": "没有标题"}, testUserID)
	req = withURLParam(req, "offboardingId", saved.ID)
	testutil.Call(t, testHandler.AppendHrOffboardingHandoverItem, req).Want(http.StatusBadRequest)
}

// TestOffboardAdvanceWritesLeaveDate covers ③ and ④: the machine walks
// apply → handover → done, the `done` step writes `leave_date` from `last_day`
// (and a later correction of `last_day` rewrites it), and a finished record cannot
// advance again.
func TestOffboardAdvanceWritesLeaveDate(t *testing.T) {
	employee := createOffboardEmployeeFixture(t)
	created := createHrOffboardingFixture(t, employee.ID, nil, http.StatusCreated)
	// Subscribed before the first move, so both segments of the walk are counted.
	events := collectWorkbenchEvents(t, eventHrOffboardingChanged, eventHrEmployeeProfileChanged)

	// apply → handover: the employee file does not move, so no employee comes back.
	req := workbenchRequest(t, "POST", "/api/workbench/hr/offboardings/"+created.ID+"/advance", map[string]any{}, testUserID)
	req = withURLParam(req, "offboardingId", created.ID)
	handover := testutil.Decode[HrOffboardingAdvanceResponse](t, testHandler.AdvanceHrOffboarding, req, http.StatusOK)
	if handover.Offboarding.Status != "handover" {
		t.Fatalf("status = %q after one advance, want handover", handover.Offboarding.Status)
	}
	if handover.Employee != nil {
		t.Fatalf("advancing to handover answered an employee profile; the file did not move")
	}

	// The profile has no leave date yet.
	if n := dbfx.Count(t, `SELECT count(*) FROM hr_employee_profile WHERE id = $1 AND leave_date IS NULL`, employee.ID); n != 1 {
		t.Fatalf("leave_date is already set before the record is done")
	}

	// handover → done: the same request writes the employee's leave date.
	req = workbenchRequest(t, "POST", "/api/workbench/hr/offboardings/"+created.ID+"/advance", map[string]any{}, testUserID)
	req = withURLParam(req, "offboardingId", created.ID)
	done := testutil.Decode[HrOffboardingAdvanceResponse](t, testHandler.AdvanceHrOffboarding, req, http.StatusOK)
	if done.Offboarding.Status != "done" {
		t.Fatalf("status = %q after two advances, want done", done.Offboarding.Status)
	}
	if done.Employee == nil {
		t.Fatalf("advancing to done answered no employee profile; the write-back is unreachable")
	}
	if done.Employee.LeaveDate == nil || *done.Employee.LeaveDate != "2026-12-31" {
		t.Fatalf("employee leave_date = %v, want the offboarding's last_day 2026-12-31", done.Employee.LeaveDate)
	}
	// The same fact on the row itself, so the assertion cannot pass on a response
	// that nobody stored.
	if n := dbfx.Count(t,
		`SELECT count(*) FROM hr_employee_profile WHERE id = $1 AND leave_date = DATE '2026-12-31'`,
		employee.ID); n != 1 {
		t.Fatalf("hr_employee_profile.leave_date was not written from last_day")
	}
	// Both rows moved, so both events went out: the roster and the exit list each
	// have something to refetch.
	if events.count(eventHrOffboardingChanged) != 2 {
		t.Fatalf("hr_offboarding:changed published %d times, want 2", events.count(eventHrOffboardingChanged))
	}
	if events.count(eventHrEmployeeProfileChanged) != 1 {
		t.Fatalf("hr_employee_profile:changed published %d times, want 1",
			events.count(eventHrEmployeeProfileChanged))
	}

	// The manual repair path: `last_day` is the single source, so fixing it on a
	// done record rewrites the leave date in the same request.
	req = workbenchRequest(t, "PATCH", "/api/workbench/hr/offboardings/"+created.ID, map[string]any{
		"last_day": "2027-01-15",
	}, testUserID)
	req = withURLParam(req, "offboardingId", created.ID)
	corrected := testutil.Decode[HrOffboardingResponse](t, testHandler.UpdateHrOffboarding, req, http.StatusOK)
	if corrected.LastDay != "2027-01-15" {
		t.Fatalf("last_day = %q after the correction, want 2027-01-15", corrected.LastDay)
	}
	if n := dbfx.Count(t,
		`SELECT count(*) FROM hr_employee_profile WHERE id = $1 AND leave_date = DATE '2027-01-15'`,
		employee.ID); n != 1 {
		t.Fatalf("fixing a done record's last_day did not rewrite leave_date")
	}

	// ④ A finished record cannot advance, and cannot be cancelled either.
	req = workbenchRequest(t, "POST", "/api/workbench/hr/offboardings/"+created.ID+"/advance", map[string]any{}, testUserID)
	req = withURLParam(req, "offboardingId", created.ID)
	testutil.Call(t, testHandler.AdvanceHrOffboarding, req).Want(http.StatusConflict)

	req = workbenchRequest(t, "POST", "/api/workbench/hr/offboardings/"+created.ID+"/cancel", map[string]any{}, testUserID)
	req = withURLParam(req, "offboardingId", created.ID)
	testutil.Call(t, testHandler.CancelHrOffboarding, req).Want(http.StatusConflict)

	// The transition table has no other forward edge: once cancelled, `advance` is
	// the illegal move (checked above); nothing else is reachable.

	// The checklist of a finished record is a record, not a scratchpad.
	req = workbenchRequest(t, "POST", "/api/workbench/hr/offboardings/"+created.ID+"/handover",
		map[string]any{"label": "补一项"}, testUserID)
	req = withURLParam(req, "offboardingId", created.ID)
	testutil.Call(t, testHandler.AppendHrOffboardingHandoverItem, req).Want(http.StatusConflict)
}

// TestOffboardCancelReleasesSlot covers ⑤: `cancel` is a terminal segment, and it
// frees the employee's slot in the partial unique index — re-initiating the same
// person's exit is an ordinary create, and the cancelled record stays as the
// history of the attempt.
func TestOffboardCancelReleasesSlot(t *testing.T) {
	employee := createOffboardEmployeeFixture(t)

	first := createHrOffboardingFixture(t, employee.ID, nil, http.StatusCreated)

	req := workbenchRequest(t, "POST", "/api/workbench/hr/offboardings/"+first.ID+"/cancel", map[string]any{}, testUserID)
	req = withURLParam(req, "offboardingId", first.ID)
	cancelled := testutil.Decode[HrOffboardingResponse](t, testHandler.CancelHrOffboarding, req, http.StatusOK)
	if cancelled.Status != "cancelled" {
		t.Fatalf("status = %q after cancel, want cancelled", cancelled.Status)
	}

	// The record survives the cancel — it is history, not a deletion.
	req = workbenchRequest(t, "GET", "/api/workbench/hr/offboardings/"+first.ID, nil, testUserID)
	req = withURLParam(req, "offboardingId", first.ID)
	reread := testutil.Decode[HrOffboardingResponse](t, testHandler.GetHrOffboarding, req, http.StatusOK)
	if reread.Status != "cancelled" {
		t.Fatalf("cancelled record reads back as %q", reread.Status)
	}

	// A cancelled record cannot advance: the way out is the way out.
	req = workbenchRequest(t, "POST", "/api/workbench/hr/offboardings/"+first.ID+"/advance", map[string]any{}, testUserID)
	req = withURLParam(req, "offboardingId", first.ID)
	testutil.Call(t, testHandler.AdvanceHrOffboarding, req).Want(http.StatusConflict)

	// The slot is free again.
	second := createHrOffboardingFixture(t, employee.ID, map[string]any{"last_day": "2027-02-28"}, http.StatusCreated)
	if second.ID == first.ID {
		t.Fatalf("re-initiating the exit reused the cancelled record")
	}
	if second.Status != "apply" {
		t.Fatalf("re-initiated status = %q, want apply", second.Status)
	}
	// And the first is still there as history: two rows, one live.
	if n := dbfx.Count(t,
		`SELECT count(*) FROM hr_offboarding WHERE employee_id = $1 AND archived_at IS NULL`,
		employee.ID); n != 2 {
		t.Fatalf("live+cancelled rows for the employee = %d, want 2", n)
	}

	// The list still filters by segment, which is how the page opens on 在办.
	req = workbenchRequest(t, "GET", "/api/workbench/hr/offboardings?status=cancelled", nil, testUserID)
	listed := testutil.Decode[offboardListResponse](t, testHandler.ListHrOffboardings, req, http.StatusOK)
	if len(listed.Offboardings) == 0 {
		t.Fatalf("the cancelled filter returned no rows; the record was not listed by its segment")
	}
	for _, row := range listed.Offboardings {
		if row.Status != "cancelled" {
			t.Fatalf("status filter returned a %q row", row.Status)
		}
	}
}

// TestOffboardMemberCannotAdvance covers ⑥: the write gate is the record's owner,
// but closing a record is owner/admin only. A `member` may tick its own checklist
// and may not declare that somebody has left.
func TestOffboardMemberCannotAdvance(t *testing.T) {
	employee := createOffboardEmployeeFixture(t)
	memberUserID := workbenchTestMember(t)

	created := createHrOffboardingFixture(t, employee.ID, map[string]any{
		"owner_member_id": memberUserID,
	}, http.StatusCreated)

	// The member owns the record, so an ordinary edit is allowed.
	req := workbenchRequest(t, "PATCH", "/api/workbench/hr/offboardings/"+created.ID, map[string]any{
		"reason": "个人发展",
	}, memberUserID)
	req = withURLParam(req, "offboardingId", created.ID)
	edited := testutil.Decode[HrOffboardingResponse](t, testHandler.UpdateHrOffboarding, req, http.StatusOK)
	if edited.Reason == nil || *edited.Reason != "个人发展" {
		t.Fatalf("reason = %v, want the member's own edit", edited.Reason)
	}

	// Ticking a checklist entry is an ordinary edit too.
	req = workbenchRequest(t, "PATCH", "/api/workbench/hr/offboardings/"+created.ID+"/handover/0",
		map[string]any{"done": true, "note": "已交接"}, memberUserID)
	req = withURLParams(req, "offboardingId", created.ID, "index", "0")
	ticked := testutil.Decode[HrOffboardingResponse](t, testHandler.UpdateHrOffboardingHandoverItem, req, http.StatusOK)
	if !ticked.Handover[0].Done || ticked.Handover[0].Note != "已交接" {
		t.Fatalf("handover[0] = %+v, want the tick the member made", ticked.Handover[0])
	}

	// Advancing is not: it is the route that decides whether a person is still on
	// the roster.
	req = workbenchRequest(t, "POST", "/api/workbench/hr/offboardings/"+created.ID+"/advance", map[string]any{}, memberUserID)
	req = withURLParam(req, "offboardingId", created.ID)
	testutil.Call(t, testHandler.AdvanceHrOffboarding, req).Want(http.StatusForbidden)

	req = workbenchRequest(t, "POST", "/api/workbench/hr/offboardings/"+created.ID+"/cancel", map[string]any{}, memberUserID)
	req = withURLParam(req, "offboardingId", created.ID)
	testutil.Call(t, testHandler.CancelHrOffboarding, req).Want(http.StatusForbidden)

	// The record is untouched by the two rejected calls.
	req = workbenchRequest(t, "GET", "/api/workbench/hr/offboardings/"+created.ID, nil, testUserID)
	req = withURLParam(req, "offboardingId", created.ID)
	reread := testutil.Decode[HrOffboardingResponse](t, testHandler.GetHrOffboarding, req, http.StatusOK)
	if reread.Status != "apply" {
		t.Fatalf("status = %q after two forbidden transitions, want apply", reread.Status)
	}

	// A member who does not own the record cannot edit it at all.
	other := workbenchOtherMember(t)
	req = workbenchRequest(t, "PATCH", "/api/workbench/hr/offboardings/"+created.ID, map[string]any{
		"reason": "不是我的单",
	}, other)
	req = withURLParam(req, "offboardingId", created.ID)
	testutil.Call(t, testHandler.UpdateHrOffboarding, req).Want(http.StatusForbidden)
}

// TestOffboardTeardownCoversTheTable covers ⑦: workspace teardown owns the new
// table.
//
// The manifest entry is what makes the schema-coverage test in
// workspace_delete_manifest_test.go pass, and the teardown statement is then
// exercised for real against a scratch workspace, so "the manifest says delete"
// and "the SQL deletes" are both proven rather than one assumed from the other.
func TestOffboardTeardownCoversTheTable(t *testing.T) {
	action, ok := workspaceDeletionManifest["hr_offboarding"]
	if !ok {
		t.Fatalf("hr_offboarding is not classified in the workspace deletion manifest")
	}
	if action != workspaceDelete {
		t.Fatalf("hr_offboarding is classified %q, want delete: it has no owner outside the workspace", action)
	}

	// A scratch workspace so the assertion cannot observe other tests' rows.
	scratch := dbfx.Workspace(t, "Offboarding teardown workspace", fmt.Sprintf("offboard-teardown-%d", os.Getpid()))
	// The workspace row's own cleanup deletes it; these rows are what the teardown
	// under test is supposed to remove first.
	dbfx.Cleanup(t, `DELETE FROM hr_offboarding WHERE workspace_id = $1`, scratch)
	dbfx.Cleanup(t, `DELETE FROM hr_employee_profile WHERE workspace_id = $1`, scratch)

	profileID := dbfx.Insert(t, "hr_employee_profile", testutil.Cols{
		"workspace_id": scratch,
		"member_id":    testUserID,
		"job_title":    "Teardown Engineer",
	})
	offboardingID := dbfx.Insert(t, "hr_offboarding", testutil.Cols{
		"workspace_id": scratch,
		"employee_id":  profileID,
		"last_day":     testutil.Raw(`DATE '2026-12-31'`),
		"handover":     testutil.Raw(`'[{"key":"ho-1","label":"权限回收","done":false,"note":""}]'::jsonb`),
	})

	workspaceUUID, err := util.ParseUUID(scratch)
	if err != nil {
		t.Fatalf("parse scratch workspace id: %v", err)
	}
	if err := testHandler.Queries.DeleteWorkspaceWorkbenchLedger(context.Background(), workspaceUUID); err != nil {
		t.Fatalf("delete workspace workbench ledger: %v", err)
	}

	if n := dbfx.Count(t, `SELECT count(*) FROM hr_offboarding WHERE id = $1`, offboardingID); n != 0 {
		t.Fatalf("teardown left %d hr_offboarding rows behind", n)
	}
	if n := dbfx.Count(t, `SELECT count(*) FROM hr_employee_profile WHERE id = $1`, profileID); n != 0 {
		t.Fatalf("teardown left %d hr_employee_profile rows behind", n)
	}
}
