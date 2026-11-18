package handler

// Employee rewards and disciplines tests (docs/engineering/WORKBENCH-API.md §17).
//
// Three properties this domain has to prove beyond the shared ledger rules:
//
//   - **the enum and the required text are enforced.** `kind` is what the tab
//     splits on and `reason` is the only answer the tab exists to give, so both a
//     stray kind and a blank reason are 400 (§17.3).
//   - **money is stored positive and `kind` carries the direction.** A fine is a
//     `discipline` of 500, never -500; a negative amount is rejected so nobody
//     invents a second sign convention for the same table (§17.2).
//   - **`employee_id` / `kind` are not editable.** The row is tied to one person
//     and one direction; a PATCH that changes either is 400 and the client
//     deletes and re-adds, while the six descriptive columns stay editable.

import (
	"fmt"
	"net/http"
	"strings"
	"testing"

	"github.com/jerry-halo2026/morchat.co/server/internal/testutil"
)

// createRewardEmployeeFixture creates one employee profile through the handler and
// registers the cleanup for both rows it can grow: the profile itself and its
// rewards. `label` keeps two fixtures of one test apart (the user email is unique).
// `ownerUserID` is the caller that creates the profile, so it becomes the profile's
// owner — the write gate the reward rows inherit.
func createRewardEmployeeFixture(t *testing.T, label, ownerUserID string) HrEmployeeProfileResponse {
	t.Helper()
	suffix := strings.NewReplacer("_", "-", "/", "-").Replace(strings.ToLower(t.Name()))
	memberUserID := dbfx.User(t, "Reward Employee",
		fmt.Sprintf("wb-reward-%s-%s@multica.ai", label, suffix))
	dbfx.Member(t, testWorkspaceID, memberUserID, "member")
	caller := ownerUserID
	if caller == "" {
		caller = testUserID
	}
	req := workbenchRequest(t, "POST", "/api/workbench/hr/employees", map[string]any{
		"member_id": memberUserID,
		"job_title": "Content Operator",
		"grade":     "P4",
		"hire_date": "2024-06-01",
	}, caller)
	profile := testutil.Decode[HrEmployeeProfileResponse](t, testHandler.CreateHrEmployee, req, http.StatusCreated)
	// No foreign key removes the reward rows, so a test that forgot them would hand
	// the next one somebody else's 奖惩 list. Registered before the profile's own
	// cleanup, so it runs after it.
	t.Cleanup(func() {
		dbfx.Exec(t, `DELETE FROM hr_employee_reward WHERE employee_id = $1`, profile.ID)
	})
	t.Cleanup(func() {
		dbfx.Exec(t, `DELETE FROM hr_employee_profile WHERE id = $1`, profile.ID)
	})
	return profile
}

// rewardListResponse is the list envelope §3.1 fixes: `{ rewards, total }`, with
// `total` counting this page only.
type rewardListResponse struct {
	Rewards []HrEmployeeRewardResponse `json:"rewards"`
	Total   int                        `json:"total"`
}

// createReward records one row through the handler as `userID` and returns it.
func createReward(t *testing.T, userID string, body map[string]any) HrEmployeeRewardResponse {
	t.Helper()
	req := workbenchRequest(t, "POST", "/api/workbench/hr/rewards", body, userID)
	return testutil.Decode[HrEmployeeRewardResponse](t, testHandler.CreateHrEmployeeReward, req, http.StatusCreated)
}

// employeeRewards reads one employee's 奖惩 list through the handler.
func employeeRewards(t *testing.T, employeeID, userID string, want int) rewardListResponse {
	t.Helper()
	req := workbenchRequest(t, "GET", "/api/workbench/hr/rewards?employee_id="+employeeID, nil, userID)
	return testutil.Decode[rewardListResponse](t, testHandler.ListHrEmployeeRewards, req, want)
}

// TestRewardKindIsValidated covers ①: `kind` is a closed enum (reward |
// discipline), and an unknown value is a 400 rather than a row the tab cannot
// place in either segment.
func TestRewardKindIsValidated(t *testing.T) {
	employee := createRewardEmployeeFixture(t, "a", "")
	events := collectWorkbenchEvents(t, eventHrEmployeeProfileChanged)

	created := createReward(t, testUserID, map[string]any{
		"employee_id": employee.ID,
		"kind":        "reward",
		"category":    "月度之星",
		"reason":      "连续三个月交付无延误",
		"amount":      500,
		"decided_on":  "2026-03-01",
	})
	if created.Kind != "reward" || created.Category == nil || *created.Category != "月度之星" {
		t.Fatalf("created reward = %+v, want a reward with its category", created)
	}
	if created.Currency != "CNY" {
		t.Fatalf("currency = %q, want the CNY default", created.Currency)
	}
	// The row hangs off the employee profile, so the write publishes that event.
	if events.count(eventHrEmployeeProfileChanged) != 1 {
		t.Fatalf("published %d hr_employee_profile:changed events, want 1",
			events.count(eventHrEmployeeProfileChanged))
	}
	if payload := events.last(eventHrEmployeeProfileChanged); payload["id"] != employee.ID {
		t.Fatalf("event payload = %v, want the employee profile id %s", payload, employee.ID)
	}

	for _, kind := range []string{"bonus", "REWARD", ""} {
		req := workbenchRequest(t, "POST", "/api/workbench/hr/rewards", map[string]any{
			"employee_id": employee.ID,
			"kind":        kind,
			"reason":      "越界的类型",
			"decided_on":  "2026-03-01",
		}, testUserID)
		testutil.Call(t, testHandler.CreateHrEmployeeReward, req).Want(http.StatusBadRequest)
	}

	// The same enum guards the list filter: an unknown `?kind=` is the same 400.
	req := workbenchRequest(t, "GET", "/api/workbench/hr/rewards?kind=bonus", nil, testUserID)
	testutil.Call(t, testHandler.ListHrEmployeeRewards, req).Want(http.StatusBadRequest)
}

// TestRewardReasonIsRequired covers ②: `reason` is what happened. Blanking it —
// on create or through a PATCH — is a 400, because a row without it cannot answer
// the question the tab asks.
func TestRewardReasonIsRequired(t *testing.T) {
	employee := createRewardEmployeeFixture(t, "a", "")

	for _, reason := range []string{"", "   ", "\t\n"} {
		req := workbenchRequest(t, "POST", "/api/workbench/hr/rewards", map[string]any{
			"employee_id": employee.ID,
			"kind":        "discipline",
			"reason":      reason,
			"decided_on":  "2026-03-01",
		}, testUserID)
		testutil.Call(t, testHandler.CreateHrEmployeeReward, req).Want(http.StatusBadRequest)
	}
	// The field is required, not merely optional-with-a-default.
	req := workbenchRequest(t, "POST", "/api/workbench/hr/rewards", map[string]any{
		"employee_id": employee.ID,
		"kind":        "discipline",
		"decided_on":  "2026-03-01",
	}, testUserID)
	testutil.Call(t, testHandler.CreateHrEmployeeReward, req).Want(http.StatusBadRequest)

	created := createReward(t, testUserID, map[string]any{
		"employee_id": employee.ID,
		"kind":        "discipline",
		"reason":      "迟到三次",
		"decided_on":  "2026-03-02",
	})
	req = workbenchRequest(t, "PATCH", "/api/workbench/hr/rewards/"+created.ID,
		map[string]any{"reason": "  "}, testUserID)
	req = withURLParam(req, "rewardId", created.ID)
	testutil.Call(t, testHandler.UpdateHrEmployeeReward, req).Want(http.StatusBadRequest)
}

// TestRewardAmountIsStoredPositive covers ③: money is always >= 0 and `kind` says
// which direction it points. A negative amount is a 400 rather than a fine stored
// as a negative bonus, and `null` clears the money on a PATCH.
func TestRewardAmountIsStoredPositive(t *testing.T) {
	employee := createRewardEmployeeFixture(t, "a", "")

	req := workbenchRequest(t, "POST", "/api/workbench/hr/rewards", map[string]any{
		"employee_id": employee.ID,
		"kind":        "discipline",
		"reason":      "违反考勤制度",
		"amount":      -500,
		"decided_on":  "2026-03-03",
	}, testUserID)
	testutil.Call(t, testHandler.CreateHrEmployeeReward, req).Want(http.StatusBadRequest)

	// A fine is a positive number on a `discipline` row.
	fine := createReward(t, testUserID, map[string]any{
		"employee_id": employee.ID,
		"kind":        "discipline",
		"reason":      "违反考勤制度",
		"amount":      500,
		"decided_on":  "2026-03-03",
	})
	if fine.Amount == nil || *fine.Amount != 500 {
		t.Fatalf("amount = %v, want 500 stored positive", fine.Amount)
	}

	// No money attached is the normal case for a 通报表扬.
	plain := createReward(t, testUserID, map[string]any{
		"employee_id": employee.ID,
		"kind":        "reward",
		"reason":      "协助其他小组赶进度",
		"decided_on":  "2026-03-04",
	})
	if plain.Amount != nil {
		t.Fatalf("amount = %v, want null when no money is attached", plain.Amount)
	}

	// A PATCH cannot turn it negative either, and `null` clears it.
	req = workbenchRequest(t, "PATCH", "/api/workbench/hr/rewards/"+fine.ID,
		map[string]any{"amount": -1}, testUserID)
	req = withURLParam(req, "rewardId", fine.ID)
	testutil.Call(t, testHandler.UpdateHrEmployeeReward, req).Want(http.StatusBadRequest)

	req = workbenchRequest(t, "PATCH", "/api/workbench/hr/rewards/"+fine.ID,
		map[string]any{"amount": nil}, testUserID)
	req = withURLParam(req, "rewardId", fine.ID)
	cleared := testutil.Decode[HrEmployeeRewardResponse](t, testHandler.UpdateHrEmployeeReward, req, http.StatusOK)
	if cleared.Amount != nil {
		t.Fatalf("amount = %v after null, want it cleared", cleared.Amount)
	}
	if cleared.Kind != "discipline" || cleared.Reason != "违反考勤制度" {
		t.Fatalf("clearing the amount moved another field: %+v", cleared)
	}
}

// TestRewardPatchCannotChangeKind covers ④: `kind` (and `employee_id`) are 400 —
// a row that turns a fine into a bonus is a different record — while the six
// descriptive columns are editable.
func TestRewardPatchCannotChangeKind(t *testing.T) {
	employee := createRewardEmployeeFixture(t, "a", "")
	other := createRewardEmployeeFixture(t, "b", "")

	created := createReward(t, testUserID, map[string]any{
		"employee_id": employee.ID,
		"kind":        "discipline",
		"category":    "考勤",
		"reason":      "迟到",
		"amount":      100,
		"decided_on":  "2026-04-01",
		"note":        "首次提醒",
	})

	for _, body := range []map[string]any{
		{"kind": "reward"},
		{"employee_id": other.ID},
		{"reason": "迟到（第二次）", "kind": "reward"},
	} {
		req := workbenchRequest(t, "PATCH", "/api/workbench/hr/rewards/"+created.ID, body, testUserID)
		req = withURLParam(req, "rewardId", created.ID)
		testutil.Call(t, testHandler.UpdateHrEmployeeReward, req).Want(http.StatusBadRequest)
	}
	// An unknown key is refused rather than silently dropped.
	req := workbenchRequest(t, "PATCH", "/api/workbench/hr/rewards/"+created.ID,
		map[string]any{"decided_onx": "2026-04-02"}, testUserID)
	req = withURLParam(req, "rewardId", created.ID)
	testutil.Call(t, testHandler.UpdateHrEmployeeReward, req).Want(http.StatusBadRequest)

	req = workbenchRequest(t, "PATCH", "/api/workbench/hr/rewards/"+created.ID, map[string]any{
		"reason":     "迟到（第二次）",
		"category":   "考勤纪律",
		"amount":     200,
		"currency":   "usd",
		"decided_on": "2026-04-02",
		"note":       nil,
	}, testUserID)
	req = withURLParam(req, "rewardId", created.ID)
	updated := testutil.Decode[HrEmployeeRewardResponse](t, testHandler.UpdateHrEmployeeReward, req, http.StatusOK)
	if updated.Reason != "迟到（第二次）" {
		t.Fatalf("reason = %q, want the patched value", updated.Reason)
	}
	if updated.Kind != "discipline" || updated.EmployeeID != employee.ID {
		t.Fatalf("the patch moved employee_id/kind: %+v", updated)
	}
	if updated.Amount == nil || *updated.Amount != 200 {
		t.Fatalf("amount = %v, want 200", updated.Amount)
	}
	if updated.Currency != "USD" {
		t.Fatalf("currency = %q, want it upper-cased to USD", updated.Currency)
	}
	if updated.DecidedOn != "2026-04-02" {
		t.Fatalf("decided_on = %q, want 2026-04-02", updated.DecidedOn)
	}
	if updated.Note != nil {
		t.Fatalf("note = %v, want it cleared by null", *updated.Note)
	}
}

// TestRewardListOrdersByDecidedOnDesc covers ⑤: the read order is the contract's
// (`decided_on DESC`), not insertion order — a March decision entered last sorts
// above a February one.
func TestRewardListOrdersByDecidedOnDesc(t *testing.T) {
	employee := createRewardEmployeeFixture(t, "a", "")

	for _, entry := range []struct {
		day  string
		kind string
	}{
		{"2026-01-15", "reward"},
		{"2026-03-20", "discipline"},
		{"2026-02-10", "reward"},
	} {
		createReward(t, testUserID, map[string]any{
			"employee_id": employee.ID,
			"kind":        entry.kind,
			"reason":      "记录 " + entry.day,
			"decided_on":  entry.day,
		})
	}

	listed := employeeRewards(t, employee.ID, testUserID, http.StatusOK)
	if listed.Total != 3 {
		t.Fatalf("got %d rewards, want 3", listed.Total)
	}
	want := []string{"2026-03-20", "2026-02-10", "2026-01-15"}
	for i, day := range want {
		if listed.Rewards[i].DecidedOn != day {
			t.Fatalf("rewards[%d].decided_on = %q, want %q (order: decided_on DESC)",
				i, listed.Rewards[i].DecidedOn, day)
		}
	}

	// `?kind=` and the `?from=` window are the same read narrowed.
	req := workbenchRequest(t, "GET",
		"/api/workbench/hr/rewards?employee_id="+employee.ID+"&kind=reward&from=2026-02-01", nil, testUserID)
	filtered := testutil.Decode[rewardListResponse](t, testHandler.ListHrEmployeeRewards, req, http.StatusOK)
	if filtered.Total != 1 || filtered.Rewards[0].DecidedOn != "2026-02-10" {
		t.Fatalf("kind=reward&from=2026-02-01 returned %+v, want the single 2026-02-10 row", filtered.Rewards)
	}

	// A soft delete takes the row out of the answer.
	req = workbenchRequest(t, "DELETE", "/api/workbench/hr/rewards/"+listed.Rewards[0].ID, nil, testUserID)
	req = withURLParam(req, "rewardId", listed.Rewards[0].ID)
	testutil.Call(t, testHandler.DeleteHrEmployeeReward, req).Want(http.StatusNoContent)
	if got := employeeRewards(t, employee.ID, testUserID, http.StatusOK); got.Total != 2 {
		t.Fatalf("after a soft delete %d rewards remain, want 2", got.Total)
	}
}

// TestRewardWriteGate covers ⑥: a `member` records rewards only for the profiles
// it owns and only edits the rows it owns — writing somebody's 奖励 is part of
// editing their file. Reads stay member-wide.
func TestRewardWriteGate(t *testing.T) {
	memberUserID := workbenchTestMember(t)
	ownersProfile := createRewardEmployeeFixture(t, "a", "")
	ownersReward := createReward(t, testUserID, map[string]any{
		"employee_id": ownersProfile.ID,
		"kind":        "reward",
		"reason":      "年度优秀员工",
		"decided_on":  "2026-05-01",
	})

	// Read: member-wide, like every other workbench read.
	if got := employeeRewards(t, ownersProfile.ID, memberUserID, http.StatusOK); got.Total != 1 {
		t.Fatalf("member read %d rewards, want 1", got.Total)
	}

	// Create on a profile the member does not own.
	req := workbenchRequest(t, "POST", "/api/workbench/hr/rewards", map[string]any{
		"employee_id": ownersProfile.ID,
		"kind":        "discipline",
		"reason":      "越权写别人的档案",
		"decided_on":  "2026-05-02",
	}, memberUserID)
	testutil.Call(t, testHandler.CreateHrEmployeeReward, req).Want(http.StatusForbidden)

	// Edit and delete on a row the member does not own.
	req = workbenchRequest(t, "PATCH", "/api/workbench/hr/rewards/"+ownersReward.ID,
		map[string]any{"reason": "越权修改"}, memberUserID)
	req = withURLParam(req, "rewardId", ownersReward.ID)
	testutil.Call(t, testHandler.UpdateHrEmployeeReward, req).Want(http.StatusForbidden)

	req = workbenchRequest(t, "DELETE", "/api/workbench/hr/rewards/"+ownersReward.ID, nil, memberUserID)
	req = withURLParam(req, "rewardId", ownersReward.ID)
	testutil.Call(t, testHandler.DeleteHrEmployeeReward, req).Want(http.StatusForbidden)

	// A profile the member owns: recorded and edited by the member, and the row's
	// owner is the profile's owner rather than the request.
	ownProfile := createRewardEmployeeFixture(t, "b", memberUserID)
	ownReward := createReward(t, memberUserID, map[string]any{
		"employee_id": ownProfile.ID,
		"kind":        "reward",
		"reason":      "自己档案里的奖励",
		"decided_on":  "2026-05-03",
	})
	if ownProfile.OwnerMemberID == nil {
		t.Fatal("the member-created profile has no owner")
	}
	if ownReward.OwnerMemberID == nil || *ownReward.OwnerMemberID != *ownProfile.OwnerMemberID {
		t.Fatalf("owner_member_id = %v, want the profile's owner %v",
			ownReward.OwnerMemberID, ownProfile.OwnerMemberID)
	}
	req = workbenchRequest(t, "PATCH", "/api/workbench/hr/rewards/"+ownReward.ID,
		map[string]any{"reason": "自己档案里的奖励（补充说明）"}, memberUserID)
	req = withURLParam(req, "rewardId", ownReward.ID)
	updated := testutil.Decode[HrEmployeeRewardResponse](t, testHandler.UpdateHrEmployeeReward, req, http.StatusOK)
	if updated.Reason != "自己档案里的奖励（补充说明）" {
		t.Fatalf("reason = %q, want the member's edit", updated.Reason)
	}
}

// TestRewardTeardownCoversNewTable covers ⑦: the new table is part of both
// teardowns — the per-test fixture (above) and workspace deletion, whose manifest
// classifies every table in the schema. A table missing from the manifest fails the
// suite; a row left behind would surface in the next test's list.
func TestRewardTeardownCoversNewTable(t *testing.T) {
	if action, ok := workspaceDeletionManifest["hr_employee_reward"]; !ok || action != workspaceDelete {
		t.Fatalf("workspaceDeletionManifest[hr_employee_reward] = %q (present=%v), want delete",
			action, ok)
	}

	employee := createRewardEmployeeFixture(t, "a", "")
	createReward(t, testUserID, map[string]any{
		"employee_id": employee.ID,
		"kind":        "reward",
		"reason":      "清理测试用行",
		"decided_on":  "2026-06-01",
	})

	const rewardCount = `SELECT count(*) FROM hr_employee_reward WHERE employee_id = $1`
	if got := dbfx.Count(t, rewardCount, employee.ID); got != 1 {
		t.Fatalf("reward rows = %d, want 1", got)
	}
	// The same statement the fixture registers, run where the test can see it: no
	// foreign key removes these rows, so this delete is the only thing that does.
	dbfx.Exec(t, `DELETE FROM hr_employee_reward WHERE employee_id = $1`, employee.ID)
	if got := dbfx.Count(t, rewardCount, employee.ID); got != 0 {
		t.Fatalf("after teardown %d reward rows remain, want 0", got)
	}
}
