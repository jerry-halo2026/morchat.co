package handler

// Employee file change stream tests (docs/engineering/WORKBENCH-API.md §16).
//
// Two properties this domain has to prove beyond the shared ledger rules:
//
//   - the stream fills itself. A PATCH that moves a *fact* about the employment
//     leaves exactly one row, with the values from before and after; a PATCH that
//     moves nothing (a display-only field, or the stored values posted back) leaves
//     none. That comparison is the whole feature — a stream that fires on every
//     save is noise, and one that misses a save is worse than no stream.
//   - the stream is append-only. `PATCH` accepts `note` and rejects every other
//     field with 400, because a client that believed it corrected an event must
//     not be told it succeeded.
//
// The multi-field case is the one that shapes the data: one PATCH can move a grade
// and a contract end at once, and the row carries one `kind` (the higher-priority
// milestone) with the rest listed in `note`. Test ④ pins that down for both
// directions — the kind chosen and the fields named.

import (
	"fmt"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/jerry-halo2026/morchat.co/server/internal/testutil"
)

// workbenchDepartmentFixture inserts one department and registers its deletion.
// The name carries the test name so two tests (which share the workspace) cannot
// collide on UNIQUE (workspace_id, name).
func workbenchDepartmentFixture(t *testing.T, label string) string {
	t.Helper()
	suffix := strings.NewReplacer("_", "-", "/", "-").Replace(strings.ToLower(t.Name()))
	return dbfx.Insert(t, "department", testutil.Cols{
		"workspace_id": testWorkspaceID,
		"name":         fmt.Sprintf("%s-%s", label, suffix),
	})
}

// createChangeEmployeeFixture creates one employee profile through the handler and
// registers the cleanup for both rows it can grow: the profile itself and its
// change stream. `extra` overrides or adds profile fields (department_id, grade…).
func createChangeEmployeeFixture(t *testing.T, extra map[string]any) HrEmployeeProfileResponse {
	t.Helper()
	suffix := strings.NewReplacer("_", "-", "/", "-").Replace(strings.ToLower(t.Name()))
	memberUserID := dbfx.User(t, "Change Stream Employee", fmt.Sprintf("wb-change-%s@multica.ai", suffix))
	dbfx.Member(t, testWorkspaceID, memberUserID, "member")
	payload := map[string]any{
		"member_id": memberUserID,
		"job_title": "Backend Engineer",
		"grade":     "P5",
		"hire_date": "2023-03-01",
	}
	for key, value := range extra {
		payload[key] = value
	}
	req := workbenchRequest(t, "POST", "/api/workbench/hr/employees", payload, testUserID)
	profile := testutil.Decode[HrEmployeeProfileResponse](t, testHandler.CreateHrEmployee, req, http.StatusCreated)
	// The new table is part of the fixture's teardown: no foreign key removes these
	// rows, so a test that forgot them would hand the next one somebody else's
	// history. Registered before the profile's own cleanup, so it runs after it.
	t.Cleanup(func() {
		dbfx.Exec(t, `DELETE FROM hr_employee_change WHERE employee_id = $1`, profile.ID)
	})
	t.Cleanup(func() {
		dbfx.Exec(t, `DELETE FROM hr_employee_profile WHERE id = $1`, profile.ID)
	})
	return profile
}

// changeListResponse is the list envelope §3.1 fixes: `{ changes, total }`, with
// `total` counting this page only.
type changeListResponse struct {
	Changes []HrEmployeeChangeResponse `json:"changes"`
	Total   int                        `json:"total"`
}

// employeeChanges reads one employee's stream through the handler.
func employeeChanges(t *testing.T, employeeID, userID string, want int) changeListResponse {
	t.Helper()
	req := workbenchRequest(t, "GET", "/api/workbench/hr/changes?employee_id="+employeeID, nil, userID)
	return testutil.Decode[changeListResponse](t, testHandler.ListHrEmployeeChanges, req, want)
}

// patchEmployeeProfile is the plain PATCH the 异动 hook sits in.
func patchEmployeeProfile(t *testing.T, employeeID string, body map[string]any) HrEmployeeProfileResponse {
	t.Helper()
	req := workbenchRequest(t, "PATCH", "/api/workbench/hr/employees/"+employeeID, body, testUserID)
	req = withURLParam(req, "employeeId", employeeID)
	return testutil.Decode[HrEmployeeProfileResponse](t, testHandler.UpdateHrEmployee, req, http.StatusOK)
}

// todayUTC is the `effective_on` the hook stamps: the day the file changed.
func todayUTC() string {
	return time.Now().UTC().Format("2006-01-02")
}

// TestChangeDepartmentPatchRecordsMove covers ①: changing `department_id` records
// one `move`, with the department from before and the one after — not the profile's
// current value twice.
func TestChangeDepartmentPatchRecordsMove(t *testing.T) {
	from := workbenchDepartmentFixture(t, "研发中心")
	to := workbenchDepartmentFixture(t, "平台技术部")
	employee := createChangeEmployeeFixture(t, map[string]any{"department_id": from})

	// A create is not an 异动: the stream starts empty for a brand-new profile.
	if got := employeeChanges(t, employee.ID, testUserID, http.StatusOK); got.Total != 0 {
		t.Fatalf("a fresh profile has %d changes, want 0", got.Total)
	}

	patchEmployeeProfile(t, employee.ID, map[string]any{"department_id": to})

	listed := employeeChanges(t, employee.ID, testUserID, http.StatusOK)
	if listed.Total != 1 || len(listed.Changes) != 1 {
		t.Fatalf("after a department patch got %d changes, want 1", listed.Total)
	}
	change := listed.Changes[0]
	if change.Kind != "move" {
		t.Fatalf("kind = %q, want move", change.Kind)
	}
	if change.EmployeeID != employee.ID {
		t.Fatalf("employee_id = %s, want %s", change.EmployeeID, employee.ID)
	}
	if change.FromDepartmentID == nil || *change.FromDepartmentID != from {
		t.Fatalf("from_department_id = %v, want %s", change.FromDepartmentID, from)
	}
	if change.ToDepartmentID == nil || *change.ToDepartmentID != to {
		t.Fatalf("to_department_id = %v, want %s", change.ToDepartmentID, to)
	}
	if change.EffectiveOn != todayUTC() {
		t.Fatalf("effective_on = %q, want today (%s)", change.EffectiveOn, todayUTC())
	}
	if change.Note == nil || !strings.Contains(*change.Note, "department_id") {
		t.Fatalf("note = %v, want the moved field named", change.Note)
	}
}

// TestChangeAbilityOnlyPatchLeavesNoTrace covers ②: `ability` / `disc` are display
// and AI context, not facts about the employment. A patch that only touches them
// must not produce an event, or every scorecard refresh would fill the 异动 tab.
func TestChangeAbilityOnlyPatchLeavesNoTrace(t *testing.T) {
	employee := createChangeEmployeeFixture(t, nil)

	patchEmployeeProfile(t, employee.ID, map[string]any{
		"ability": map[string]any{"execution": 8, "communication": 7},
		"disc":    map[string]any{"d": 6, "i": 5},
	})

	if got := employeeChanges(t, employee.ID, testUserID, http.StatusOK); got.Total != 0 {
		t.Fatalf("display-only patch produced %d changes, want 0", got.Total)
	}
}

// TestChangeSameValuePatchLeavesNoTrace covers ③: the client posts the whole form
// back, values unchanged. The detector compares against the stored row, so an
// unchanged PATCH is not an event — and a single changed field is still one event.
func TestChangeSameValuePatchLeavesNoTrace(t *testing.T) {
	department := workbenchDepartmentFixture(t, "客服中心")
	employee := createChangeEmployeeFixture(t, map[string]any{
		"department_id": department,
		"contract_end":  "2026-12-31",
	})

	patchEmployeeProfile(t, employee.ID, map[string]any{
		"department_id": department,
		"job_title":     "Backend Engineer",
		"grade":         "P5",
		"contract_end":  "2026-12-31",
	})
	if got := employeeChanges(t, employee.ID, testUserID, http.StatusOK); got.Total != 0 {
		t.Fatalf("same-value patch produced %d changes, want 0", got.Total)
	}

	patchEmployeeProfile(t, employee.ID, map[string]any{"job_title": "Staff Engineer"})
	listed := employeeChanges(t, employee.ID, testUserID, http.StatusOK)
	if listed.Total != 1 {
		t.Fatalf("one changed field produced %d changes, want 1", listed.Total)
	}
	if listed.Changes[0].Kind != "promote" {
		t.Fatalf("kind = %q, want promote", listed.Changes[0].Kind)
	}
	if listed.Changes[0].FromJobTitle == nil || *listed.Changes[0].FromJobTitle != "Backend Engineer" {
		t.Fatalf("from_job_title = %v, want Backend Engineer", listed.Changes[0].FromJobTitle)
	}
	if listed.Changes[0].ToJobTitle == nil || *listed.Changes[0].ToJobTitle != "Staff Engineer" {
		t.Fatalf("to_job_title = %v, want Staff Engineer", listed.Changes[0].ToJobTitle)
	}
}

// TestChangeMultiFieldPatchRecordsOneRow covers ④: `grade` + `contract_end` in one
// PATCH is one row, `kind` = the higher-priority milestone (`renew`), and `note`
// names both fields. Two rows would say the person had two separate changes on
// one day; a note naming one field would lose the other.
func TestChangeMultiFieldPatchRecordsOneRow(t *testing.T) {
	employee := createChangeEmployeeFixture(t, map[string]any{"contract_end": "2026-12-31"})

	patchEmployeeProfile(t, employee.ID, map[string]any{
		"grade":        "P6",
		"contract_end": "2027-12-31",
	})

	listed := employeeChanges(t, employee.ID, testUserID, http.StatusOK)
	if listed.Total != 1 {
		t.Fatalf("a two-field patch produced %d changes, want 1", listed.Total)
	}
	change := listed.Changes[0]
	if change.Kind != "renew" {
		t.Fatalf("kind = %q, want renew (contract_end outranks grade)", change.Kind)
	}
	if change.FromGrade == nil || *change.FromGrade != "P5" {
		t.Fatalf("from_grade = %v, want P5", change.FromGrade)
	}
	if change.ToGrade == nil || *change.ToGrade != "P6" {
		t.Fatalf("to_grade = %v, want P6", change.ToGrade)
	}
	if change.FromContractEnd == nil || *change.FromContractEnd != "2026-12-31" {
		t.Fatalf("from_contract_end = %v, want 2026-12-31", change.FromContractEnd)
	}
	if change.ToContractEnd == nil || *change.ToContractEnd != "2027-12-31" {
		t.Fatalf("to_contract_end = %v, want 2027-12-31", change.ToContractEnd)
	}
	if change.Note == nil {
		t.Fatal("note is null, want both moved fields listed")
	}
	for _, field := range []string{"grade", "contract_end"} {
		if !strings.Contains(*change.Note, field) {
			t.Fatalf("note = %q, want it to name %q", *change.Note, field)
		}
	}
}

// TestChangePatchIsNoteOnly covers ⑤: the manual entry's `note` is editable, every
// other field is a 400. A stream whose facts can be rewritten cannot answer "what
// changed", so the rejection is the feature.
func TestChangePatchIsNoteOnly(t *testing.T) {
	employee := createChangeEmployeeFixture(t, nil)

	req := workbenchRequest(t, "POST", "/api/workbench/hr/changes", map[string]any{
		"employee_id":  employee.ID,
		"kind":         "salary",
		"effective_on": "2026-07-01",
		"from_amount":  20000,
		"to_amount":    24000,
		"currency":     "CNY",
		"note":         "年度调薪",
	}, testUserID)
	created := testutil.Decode[HrEmployeeChangeResponse](t, testHandler.CreateHrEmployeeChange, req, http.StatusCreated)
	if created.Kind != "salary" || created.ToAmount == nil || *created.ToAmount != 24000 {
		t.Fatalf("created change = %+v, want a salary row of 24000", created)
	}

	// Every field but `note` is refused, including the two that carry the fact.
	for _, body := range []map[string]any{
		{"kind": "move"},
		{"effective_on": "2026-08-01"},
		{"note": "改个备注", "to_amount": 30000},
	} {
		request := workbenchRequest(t, "PATCH", "/api/workbench/hr/changes/"+created.ID, body, testUserID)
		request = withURLParam(request, "changeId", created.ID)
		testutil.Call(t, testHandler.UpdateHrEmployeeChange, request).Want(http.StatusBadRequest)
	}

	// `note` alone is the one accepted edit.
	request := workbenchRequest(t, "PATCH", "/api/workbench/hr/changes/"+created.ID,
		map[string]any{"note": "年度调薪（8 月起生效）"}, testUserID)
	request = withURLParam(request, "changeId", created.ID)
	updated := testutil.Decode[HrEmployeeChangeResponse](t, testHandler.UpdateHrEmployeeChange, request, http.StatusOK)
	if updated.Note == nil || *updated.Note != "年度调薪（8 月起生效）" {
		t.Fatalf("note = %v, want the edited text", updated.Note)
	}
	if updated.Kind != "salary" || updated.ToAmount == nil || *updated.ToAmount != 24000 {
		t.Fatalf("editing the note moved a fact: %+v", updated)
	}
}

// TestChangeListOrdersByEffectiveOnDesc covers ⑥: the read order is the contract's
// (`effective_on DESC`), not insertion order — a raise recorded today but
// effective in January sorts at January.
func TestChangeListOrdersByEffectiveOnDesc(t *testing.T) {
	employee := createChangeEmployeeFixture(t, nil)

	recorded := []string{"2026-01-01", "2026-03-01", "2026-02-01"}
	for i, day := range recorded {
		req := workbenchRequest(t, "POST", "/api/workbench/hr/changes", map[string]any{
			"employee_id":  employee.ID,
			"kind":         "salary",
			"effective_on": day,
			"to_amount":    20000 + float64(i)*1000,
		}, testUserID)
		testutil.Decode[HrEmployeeChangeResponse](t, testHandler.CreateHrEmployeeChange, req, http.StatusCreated)
	}

	listed := employeeChanges(t, employee.ID, testUserID, http.StatusOK)
	if listed.Total != 3 {
		t.Fatalf("got %d changes, want 3", listed.Total)
	}
	want := []string{"2026-03-01", "2026-02-01", "2026-01-01"}
	for i, day := range want {
		if listed.Changes[i].EffectiveOn != day {
			t.Fatalf("changes[%d].effective_on = %q, want %q (order: effective_on DESC)",
				i, listed.Changes[i].EffectiveOn, day)
		}
	}

	// The kind filter is the same read narrowed: no other kind exists here, so a
	// mismatched filter answers an empty page rather than everything.
	req := workbenchRequest(t, "GET",
		"/api/workbench/hr/changes?employee_id="+employee.ID+"&kind=salary&from=2026-02-01", nil, testUserID)
	filtered := testutil.Decode[changeListResponse](t, testHandler.ListHrEmployeeChanges, req, http.StatusOK)
	if filtered.Total != 2 {
		t.Fatalf("from=2026-02-01 returned %d changes, want 2", filtered.Total)
	}
	for _, change := range filtered.Changes {
		if change.EffectiveOn < "2026-02-01" {
			t.Fatalf("effective_on = %q slipped past the from filter", change.EffectiveOn)
		}
	}
}

// TestChangeTeardownCoversNewTable covers ⑦: the new table is part of both
// teardowns — the per-test fixture (above) and workspace deletion, whose manifest
// classifies every table in the schema. A row left by a test would surface in the
// next one's stream; a table missing from the manifest fails the suite.
func TestChangeTeardownCoversNewTable(t *testing.T) {
	if action, ok := workspaceDeletionManifest["hr_employee_change"]; !ok || action != workspaceDelete {
		t.Fatalf("workspaceDeletionManifest[hr_employee_change] = %q (present=%v), want delete",
			action, ok)
	}

	employee := createChangeEmployeeFixture(t, nil)
	patchEmployeeProfile(t, employee.ID, map[string]any{"grade": "P6"})

	const streamCount = `SELECT count(*) FROM hr_employee_change WHERE employee_id = $1`
	if got := dbfx.Count(t, streamCount, employee.ID); got != 1 {
		t.Fatalf("change rows = %d, want 1", got)
	}
	// The same statement the fixture registers, run where the test can see it: no
	// foreign key removes these rows, so this delete is the only thing that does.
	dbfx.Exec(t, `DELETE FROM hr_employee_change WHERE employee_id = $1`, employee.ID)
	if got := dbfx.Count(t, streamCount, employee.ID); got != 0 {
		t.Fatalf("after teardown %d change rows remain, want 0", got)
	}
}

// TestChangeWriteGate pins the ownership rule the rest of the workbench uses: a
// `member` records changes on the profiles it owns, and cannot touch a row it does
// not own — appending to somebody's history is part of editing their file.
func TestChangeWriteGate(t *testing.T) {
	memberUserID := workbenchTestMember(t)
	ownerProfile := createChangeEmployeeFixture(t, nil)

	req := workbenchRequest(t, "POST", "/api/workbench/hr/changes", map[string]any{
		"employee_id":  ownerProfile.ID,
		"kind":         "salary",
		"effective_on": "2026-05-01",
	}, memberUserID)
	testutil.Call(t, testHandler.CreateHrEmployeeChange, req).Want(http.StatusForbidden)

	// Reading is member-wide, like every other workbench read.
	if got := employeeChanges(t, ownerProfile.ID, memberUserID, http.StatusOK); got.Total != 0 {
		t.Fatalf("member read %d changes, want 0", got.Total)
	}

	// The seeded profile already belongs to this member (workbenchTestMember seeds
	// one so the capability template resolves a job title). The table allows one
	// profile per member, so the test reuses it instead of creating a second — and
	// hands it to the member, which is the ownership the assertions below are about.
	ownProfileID := seededEmployeeProfileID(t, memberUserID)
	dbfx.Exec(t, `UPDATE hr_employee_profile SET owner_member_id = $2 WHERE id = $1`, ownProfileID, memberUserID)

	req = workbenchRequest(t, "POST", "/api/workbench/hr/changes", map[string]any{
		"employee_id":  ownProfileID,
		"kind":         "hire",
		"effective_on": "2025-09-01",
		"to_job_title": "Recruiter",
	}, memberUserID)
	created := testutil.Decode[HrEmployeeChangeResponse](t, testHandler.CreateHrEmployeeChange, req, http.StatusCreated)
	if created.Kind != "hire" {
		t.Fatalf("kind = %q, want hire", created.Kind)
	}

	req = workbenchRequest(t, "PATCH", "/api/workbench/hr/changes/"+created.ID,
		map[string]any{"note": "入职补录"}, memberUserID)
	req = withURLParam(req, "changeId", created.ID)
	updated := testutil.Decode[HrEmployeeChangeResponse](t, testHandler.UpdateHrEmployeeChange, req, http.StatusOK)
	if updated.Note == nil || *updated.Note != "入职补录" {
		t.Fatalf("note = %v, want 入职补录", updated.Note)
	}
}
