package handler

// General manager workbench tests (docs/engineering/WORKBENCH-API.md §13). Eight
// properties, one case each, plus the fixtures that build the OKR tree:
//
//   - a goal title is unique per (workspace, cycle) among live rows, and a
//     duplicate is a 409 rather than a second objective (§13.2);
//   - a key result may over-achieve (`current > target`) but a negative `target`
//     is a 400, because the column cannot hold one and a typo should name itself;
//   - a goal detail embeds its key results and packages in `position` order;
//   - converting a signal into a goal creates the goal and writes the landing
//     pointer back onto the signal;
//   - converting it twice is a 409 and creates nothing the second time;
//   - a member cannot change another member's goal (and therefore not its key
//     results or packages either);
//   - `issue.goal_id` makes an attached task reachable from the goal it advances;
//   - teardown removes the four tables (the row-level case at the bottom; the
//     manifest test carries the classification).

import (
	"net/http"
	"strings"
	"testing"

	"github.com/jerry-halo2026/morchat.co/server/internal/testutil"
)

// goalFixture creates a goal owned by ownerUserID through the handler and
// registers a teardown that removes the whole tree. The tables carry no foreign
// keys, so the children go first and the attached issues are detached rather than
// deleted — an issue belongs to its project, not to the goal that referenced it.
func goalFixture(t *testing.T, ownerUserID, cycle, title string) GoalResponse {
	t.Helper()
	body := map[string]any{
		"cycle":       cycle,
		"title":       title,
		"description": "季度目标说明",
		"priority":    "P0",
		"due_date":    "2021-03-31",
	}
	if ownerUserID != "" {
		body["owner_member_id"] = ownerUserID
	}
	req := workbenchRequest(t, "POST", "/api/workbench/goals", body, ownerUserID)
	created := testutil.Decode[GoalResponse](t, testHandler.CreateGoal, req, http.StatusCreated)
	t.Cleanup(func() {
		dbfx.Exec(t, `DELETE FROM goal_key_result WHERE goal_id = $1`, created.ID)
		dbfx.Exec(t, `DELETE FROM goal_package WHERE goal_id = $1`, created.ID)
		dbfx.Exec(t, `UPDATE issue SET goal_id = NULL WHERE goal_id = $1`, created.ID)
		dbfx.Exec(t, `DELETE FROM goal_okr WHERE id = $1`, created.ID)
	})
	return created
}

// goalDepartmentFixture creates a department to split a goal into. Its name
// carries the test name because (workspace_id, name) is a real unique constraint.
func goalDepartmentFixture(t *testing.T) string {
	t.Helper()
	suffix := strings.NewReplacer("_", "-", "/", "-").Replace(strings.ToLower(t.Name()))
	return dbfx.Insert(t, "department", testutil.Cols{
		"workspace_id": testWorkspaceID,
		"name":         "OKR department " + suffix,
	})
}

// goalKeyResultFixture creates one key result under goalID.
func goalKeyResultFixture(t *testing.T, userID, goalID string, body map[string]any) GoalKeyResultResponse {
	t.Helper()
	req := workbenchRequest(t, "POST", "/api/workbench/goals/"+goalID+"/key-results", body, userID)
	req = withURLParam(req, "goalId", goalID)
	return testutil.Decode[GoalKeyResultResponse](t, testHandler.CreateGoalKeyResult, req, http.StatusCreated)
}

// goalPackageFixture splits goalID for one department.
func goalPackageFixture(t *testing.T, userID, goalID, departmentID string, body map[string]any) GoalPackageResponse {
	t.Helper()
	if _, ok := body["department_id"]; !ok {
		body["department_id"] = departmentID
	}
	req := workbenchRequest(t, "POST", "/api/workbench/goals/"+goalID+"/packages", body, userID)
	req = withURLParam(req, "goalId", goalID)
	return testutil.Decode[GoalPackageResponse](t, testHandler.CreateGoalPackage, req, http.StatusCreated)
}

// marketSignalFixture creates one radar signal owned by ownerUserID.
func marketSignalFixture(t *testing.T, ownerUserID, title string) MarketSignalResponse {
	t.Helper()
	body := map[string]any{
		"title":    title,
		"category": "competitor",
		"cut":      "hot",
		"score":    88,
		"urgency":  "high",
		"summary":  "竞品把主力单品降到 39 元",
		"url":      "https://example.com/competitor-price-cut",
	}
	if ownerUserID != "" {
		body["owner_member_id"] = ownerUserID
	}
	req := workbenchRequest(t, "POST", "/api/workbench/signals", body, ownerUserID)
	created := testutil.Decode[MarketSignalResponse](t, testHandler.CreateMarketSignal, req, http.StatusCreated)
	t.Cleanup(func() { dbfx.Exec(t, `DELETE FROM market_signal WHERE id = $1`, created.ID) })
	return created
}

// TestGoalCycleTitleConflicts covers the partial unique index from 749: one live
// goal per (workspace, cycle, lower(title)), while the same title in another cycle
// is a new objective rather than a duplicate.
func TestGoalCycleTitleConflicts(t *testing.T) {
	goal := goalFixture(t, testUserID, "2026Q4", "Grow GMV")

	if goal.Status != goalStatusDraft {
		t.Fatalf("status = %q, want the draft default", goal.Status)
	}
	if goal.Priority != "P0" || goal.DueDate == nil || *goal.DueDate != "2021-03-31" {
		t.Fatalf("goal = %+v, want the priority and due_date that were sent", goal)
	}
	// A fresh goal embeds empty children rather than null ones, so a client can
	// render the tree without a nil check.
	if goal.KeyResults == nil || goal.Packages == nil {
		t.Fatalf("goal children = %#v / %#v, want empty lists", goal.KeyResults, goal.Packages)
	}

	req := workbenchRequest(t, "POST", "/api/workbench/goals", map[string]any{
		"cycle": goal.Cycle,
		"title": goal.Title,
	}, testUserID)
	testutil.Call(t, testHandler.CreateGoal, req).Want(http.StatusConflict)

	// The comparison ignores case: "Grow GMV" and "grow gmv" are one objective.
	req = workbenchRequest(t, "POST", "/api/workbench/goals", map[string]any{
		"cycle": goal.Cycle,
		"title": strings.ToLower(goal.Title),
	}, testUserID)
	testutil.Call(t, testHandler.CreateGoal, req).Want(http.StatusConflict)

	// Another cycle is another objective: carrying a title forward is the normal
	// way a quarter is planned.
	other := goalFixture(t, testUserID, "2026Q1", goal.Title)
	if other.ID == goal.ID {
		t.Fatal("two cycles share a goal id")
	}
}

// TestGoalKeyResultTargetStaysNonNegative covers the two halves of the numeric
// rule: over-achievement is storable (and displayed as sent), a negative target is
// a 400 on both create and patch.
func TestGoalKeyResultTargetStaysNonNegative(t *testing.T) {
	goal := goalFixture(t, testUserID, "2026Q2", "Key result validation")

	// current > target is 超额完成, a real outcome — the server must not clamp it.
	overAchieved := goalKeyResultFixture(t, testUserID, goal.ID, map[string]any{
		"title":   "签约金额",
		"target":  100,
		"current": 130.5,
		"unit":    "万元",
	})
	if overAchieved.Target == nil || *overAchieved.Target != 100 {
		t.Fatalf("target = %v, want 100", overAchieved.Target)
	}
	if overAchieved.Current != 130.5 {
		t.Fatalf("current = %v, want the over-achieved 130.5", overAchieved.Current)
	}
	if overAchieved.Status != goalKeyResultStatusOnTrack {
		t.Fatalf("status = %q, want the on_track default", overAchieved.Status)
	}

	for _, body := range []map[string]any{
		{"title": "负目标", "target": -1},
		{"title": "负目标两位", "target": -0.01},
	} {
		req := workbenchRequest(t, "POST", "/api/workbench/goals/"+goal.ID+"/key-results", body, testUserID)
		req = withURLParam(req, "goalId", goal.ID)
		testutil.Call(t, testHandler.CreateGoalKeyResult, req).Want(http.StatusBadRequest)
	}

	req := workbenchRequest(t, "PATCH",
		"/api/workbench/goals/"+goal.ID+"/key-results/"+overAchieved.ID,
		map[string]any{"target": -5}, testUserID)
	req = mediaURLParams(req, map[string]string{"goalId": goal.ID, "keyResultId": overAchieved.ID})
	testutil.Call(t, testHandler.UpdateGoalKeyResult, req).Want(http.StatusBadRequest)

	// A patch that records a new figure keeps the target and accepts a value above
	// it — the write path never re-derives one from the other.
	req = workbenchRequest(t, "PATCH",
		"/api/workbench/goals/"+goal.ID+"/key-results/"+overAchieved.ID,
		map[string]any{"current": 160}, testUserID)
	req = mediaURLParams(req, map[string]string{"goalId": goal.ID, "keyResultId": overAchieved.ID})
	patched := testutil.Decode[GoalKeyResultResponse](t, testHandler.UpdateGoalKeyResult, req, http.StatusOK)
	if patched.Current != 160 || patched.Target == nil || *patched.Target != 100 {
		t.Fatalf("patched key result = %+v, want current 160 against target 100", patched)
	}
}

// TestGoalDetailEmbedsChildrenInPositionOrder covers the embedded shape: both
// child lists come back on the goal, sorted by `position` rather than by insertion
// or by id.
func TestGoalDetailEmbedsChildrenInPositionOrder(t *testing.T) {
	goal := goalFixture(t, testUserID, "2026Q3", "Embedded children order")
	department := goalDepartmentFixture(t)

	// Created out of order on purpose: the read must sort, not echo.
	second := goalKeyResultFixture(t, testUserID, goal.ID, map[string]any{
		"title": "第二个关键结果", "position": 2,
	})
	first := goalKeyResultFixture(t, testUserID, goal.ID, map[string]any{
		"title": "第一个关键结果", "position": 1,
	})
	packageSecond := goalPackageFixture(t, testUserID, goal.ID, department, map[string]any{
		"title": "第二份分包", "position": 1,
	})
	packageFirst := goalPackageFixture(t, testUserID, goal.ID, department, map[string]any{
		"title": "第一份分包", "position": 0,
	})

	req := withURLParam(workbenchRequest(t, "GET", "/api/workbench/goals/"+goal.ID, nil, testUserID),
		"goalId", goal.ID)
	detail := testutil.Decode[GoalDetailResponse](t, testHandler.GetGoal, req, http.StatusOK)

	if len(detail.KeyResults) != 2 {
		t.Fatalf("key results = %+v, want both of them", detail.KeyResults)
	}
	if detail.KeyResults[0].ID != first.ID || detail.KeyResults[1].ID != second.ID {
		t.Fatalf("key result order = %s, %s; want %s (position 1), %s (position 2)",
			detail.KeyResults[0].ID, detail.KeyResults[1].ID, first.ID, second.ID)
	}
	if detail.KeyResults[0].Position != 1 || detail.KeyResults[1].Position != 2 {
		t.Fatalf("key result positions = %d, %d; want 1, 2",
			detail.KeyResults[0].Position, detail.KeyResults[1].Position)
	}
	if len(detail.Packages) != 2 {
		t.Fatalf("packages = %+v, want both of them", detail.Packages)
	}
	if detail.Packages[0].ID != packageFirst.ID || detail.Packages[1].ID != packageSecond.ID {
		t.Fatalf("package order = %s, %s; want %s (position 0), %s (position 1)",
			detail.Packages[0].ID, detail.Packages[1].ID, packageFirst.ID, packageSecond.ID)
	}
	// The department split keeps the department it was assigned to.
	if detail.Packages[0].DepartmentID != department {
		t.Fatalf("package department = %s, want %s", detail.Packages[0].DepartmentID, department)
	}

	// The list read embeds the same children, so a board does not have to open each
	// goal to render its progress.
	req = workbenchRequest(t, "GET", "/api/workbench/goals?cycle=2026Q3", nil, testUserID)
	var list struct {
		Goals []GoalResponse `json:"goals"`
		Total int            `json:"total"`
	}
	testutil.Call(t, testHandler.ListGoals, req).Want(http.StatusOK).JSON(&list)
	if list.Total == 0 {
		t.Fatal("goal list is empty, want the goal that was just created")
	}
	found := false
	for _, listed := range list.Goals {
		if listed.ID != goal.ID {
			continue
		}
		found = true
		if len(listed.KeyResults) != 2 || len(listed.Packages) != 2 {
			t.Fatalf("listed goal = %+v, want both children embedded", listed)
		}
	}
	if !found {
		t.Fatalf("goal %s is missing from its own cycle list", goal.ID)
	}
}

// TestSignalConvertToGoal covers the radar's exit into work: the signal becomes a
// goal, the landing pointer is written, and a second convert is a 409 that creates
// nothing.
func TestSignalConvertToGoal(t *testing.T) {
	signal := marketSignalFixture(t, testUserID, "竞品降价 20%")

	req := withURLParam(workbenchRequest(t, "POST",
		"/api/workbench/signals/"+signal.ID+"/convert",
		map[string]any{"target": "goal", "cycle": "2026Q4"}, testUserID), "signalId", signal.ID)
	converted := testutil.Decode[MarketSignalConvertResponse](t, testHandler.ConvertMarketSignal, req, http.StatusCreated)

	if converted.Goal == nil {
		t.Fatalf("convert response = %+v, want the created goal", converted)
	}
	t.Cleanup(func() {
		dbfx.Exec(t, `DELETE FROM goal_key_result WHERE goal_id = $1`, converted.Goal.ID)
		dbfx.Exec(t, `DELETE FROM goal_package WHERE goal_id = $1`, converted.Goal.ID)
		dbfx.Exec(t, `DELETE FROM goal_okr WHERE id = $1`, converted.Goal.ID)
	})
	if converted.Goal.Title != signal.Title {
		t.Fatalf("goal title = %q, want the signal's %q", converted.Goal.Title, signal.Title)
	}
	if converted.Goal.Cycle != "2026Q4" || converted.Goal.Status != goalStatusActive {
		t.Fatalf("goal = %+v, want cycle 2026Q4 and an active goal", converted.Goal)
	}
	if converted.Goal.OwnerMemberID != testUserID {
		t.Fatalf("goal owner = %s, want the signal's owner %s", converted.Goal.OwnerMemberID, testUserID)
	}
	if converted.Signal.Status != marketSignalStatusConverted {
		t.Fatalf("signal status = %q, want converted", converted.Signal.Status)
	}
	if converted.Signal.ConvertedGoalID == nil || *converted.Signal.ConvertedGoalID != converted.Goal.ID {
		t.Fatalf("converted_goal_id = %v, want %s", converted.Signal.ConvertedGoalID, converted.Goal.ID)
	}
	if converted.Signal.ConvertedIssueID != nil {
		t.Fatalf("converted_issue_id = %v, want nil for a goal convert", converted.Signal.ConvertedIssueID)
	}

	// The goal really exists: it is readable through the ordinary endpoint.
	req = withURLParam(workbenchRequest(t, "GET", "/api/workbench/goals/"+converted.Goal.ID, nil, testUserID),
		"goalId", converted.Goal.ID)
	detail := testutil.Decode[GoalDetailResponse](t, testHandler.GetGoal, req, http.StatusOK)
	if detail.ID != converted.Goal.ID {
		t.Fatalf("read back goal = %s, want %s", detail.ID, converted.Goal.ID)
	}

	// Converted signals stay in the list, filtered by status.
	req = workbenchRequest(t, "GET", "/api/workbench/signals?status=converted", nil, testUserID)
	var listed struct {
		Signals []MarketSignalResponse `json:"signals"`
		Total   int                    `json:"total"`
	}
	testutil.Call(t, testHandler.ListMarketSignals, req).Want(http.StatusOK).JSON(&listed)
	foundConverted := false
	for _, row := range listed.Signals {
		if row.ID == signal.ID {
			foundConverted = true
		}
	}
	if !foundConverted {
		t.Fatalf("signal %s is missing from the converted list", signal.ID)
	}

	// A PATCH may not claim `converted`: that status belongs to the convert
	// endpoint, which writes the pointer it implies.
	req = withURLParam(workbenchRequest(t, "PATCH", "/api/workbench/signals/"+signal.ID,
		map[string]any{"status": "converted"}, testUserID), "signalId", signal.ID)
	testutil.Call(t, testHandler.UpdateMarketSignal, req).Want(http.StatusBadRequest)
}

// TestSignalConvertTwiceConflicts covers the idempotency guard: the second convert
// is a 409, and it does not leave a second goal behind.
func TestSignalConvertTwiceConflicts(t *testing.T) {
	signal := marketSignalFixture(t, testUserID, "渠道规则变更")

	req := withURLParam(workbenchRequest(t, "POST",
		"/api/workbench/signals/"+signal.ID+"/convert",
		map[string]any{"target": "goal", "cycle": "2026Q4"}, testUserID), "signalId", signal.ID)
	converted := testutil.Decode[MarketSignalConvertResponse](t, testHandler.ConvertMarketSignal, req, http.StatusCreated)
	t.Cleanup(func() {
		dbfx.Exec(t, `DELETE FROM goal_okr WHERE id = $1`, converted.Goal.ID)
	})

	before := dbfx.Count(t, `SELECT count(*) FROM goal_okr WHERE workspace_id = $1 AND title = $2`,
		testWorkspaceID, signal.Title)

	req = withURLParam(workbenchRequest(t, "POST",
		"/api/workbench/signals/"+signal.ID+"/convert",
		map[string]any{"target": "goal", "cycle": "2026Q5"}, testUserID), "signalId", signal.ID)
	testutil.Call(t, testHandler.ConvertMarketSignal, req).Want(http.StatusConflict)

	after := dbfx.Count(t, `SELECT count(*) FROM goal_okr WHERE workspace_id = $1 AND title = $2`,
		testWorkspaceID, signal.Title)
	if after != before {
		t.Fatalf("goals with this title = %d after the rejected convert, want %d", after, before)
	}
}

// TestSignalConvertToIssue covers the other target: the signal becomes a real
// issue through the ordinary create path, and the signal records it.
func TestSignalConvertToIssue(t *testing.T) {
	signal := marketSignalFixture(t, testUserID, "客户抱怨没有小规格")

	req := withURLParam(workbenchRequest(t, "POST",
		"/api/workbench/signals/"+signal.ID+"/convert",
		map[string]any{"target": "issue"}, testUserID), "signalId", signal.ID)
	converted := testutil.Decode[MarketSignalConvertResponse](t, testHandler.ConvertMarketSignal, req, http.StatusCreated)

	if converted.Issue == nil {
		t.Fatalf("convert response = %+v, want the created issue", converted)
	}
	issueID := converted.Issue.ID
	t.Cleanup(func() {
		dbfx.Exec(t, `DELETE FROM issue WHERE id = $1`, issueID)
	})
	if converted.Issue.Title != signal.Title {
		t.Fatalf("issue title = %q, want the signal's %q", converted.Issue.Title, signal.Title)
	}
	if converted.Issue.GoalID != nil {
		t.Fatalf("issue goal_id = %v, want nil for a task convert", converted.Issue.GoalID)
	}
	if converted.Signal.Status != marketSignalStatusConverted ||
		converted.Signal.ConvertedIssueID == nil || *converted.Signal.ConvertedIssueID != issueID {
		t.Fatalf("signal after convert = %+v, want converted with converted_issue_id %s", converted.Signal, issueID)
	}
}

// TestGoalMemberCannotWriteOthersGoal covers the write gate for the whole tree: a
// member reads everything but changes only goals it owns — and a key result or a
// package is gated on the goal it hangs off, not on its own owner column.
func TestGoalMemberCannotWriteOthersGoal(t *testing.T) {
	memberUserID := workbenchTestMember(t)
	department := goalDepartmentFixture(t)
	goal := goalFixture(t, testUserID, "2026Q4", "Member permission fixture")
	keyResult := goalKeyResultFixture(t, testUserID, goal.ID, map[string]any{"title": "别人的关键结果"})
	goalPackage := goalPackageFixture(t, testUserID, goal.ID, department, map[string]any{"title": "别人的分包"})

	// Reads are member-wide.
	req := withURLParam(workbenchRequest(t, "GET", "/api/workbench/goals/"+goal.ID, nil, memberUserID),
		"goalId", goal.ID)
	testutil.Call(t, testHandler.GetGoal, req).Want(http.StatusOK)

	req = withURLParam(workbenchRequest(t, "PATCH", "/api/workbench/goals/"+goal.ID,
		map[string]any{"title": "我要改别人的目标"}, memberUserID), "goalId", goal.ID)
	testutil.Call(t, testHandler.UpdateGoal, req).Want(http.StatusForbidden)

	req = withURLParam(workbenchRequest(t, "DELETE", "/api/workbench/goals/"+goal.ID, nil, memberUserID),
		"goalId", goal.ID)
	testutil.Call(t, testHandler.DeleteGoal, req).Want(http.StatusForbidden)

	// The key result inherits the goal's gate.
	req = withURLParam(workbenchRequest(t, "POST", "/api/workbench/goals/"+goal.ID+"/key-results",
		map[string]any{"title": "在别人的目标下加关键结果"}, memberUserID), "goalId", goal.ID)
	testutil.Call(t, testHandler.CreateGoalKeyResult, req).Want(http.StatusForbidden)

	req = mediaURLParams(workbenchRequest(t, "PATCH",
		"/api/workbench/goals/"+goal.ID+"/key-results/"+keyResult.ID,
		map[string]any{"current": 99}, memberUserID),
		map[string]string{"goalId": goal.ID, "keyResultId": keyResult.ID})
	testutil.Call(t, testHandler.UpdateGoalKeyResult, req).Want(http.StatusForbidden)

	// So does the package, even though it carries its own owner.
	req = mediaURLParams(workbenchRequest(t, "PATCH",
		"/api/workbench/goals/"+goal.ID+"/packages/"+goalPackage.ID,
		map[string]any{"status": "done"}, memberUserID),
		map[string]string{"goalId": goal.ID, "packageId": goalPackage.ID})
	testutil.Call(t, testHandler.UpdateGoalPackage, req).Want(http.StatusForbidden)

	req = withURLParam(workbenchRequest(t, "DELETE",
		"/api/workbench/goals/"+goal.ID+"/packages/"+goalPackage.ID, nil, memberUserID),
		"goalId", goal.ID)
	testutil.Call(t, testHandler.DeleteGoalPackage, req).Want(http.StatusForbidden)

	// A goal the member creates is its own, and it can write that one.
	own := goalFixture(t, memberUserID, "2026Q4", "Member own goal fixture")
	if own.OwnerMemberID != memberUserID {
		t.Fatalf("own goal owner = %s, want %s", own.OwnerMemberID, memberUserID)
	}
	req = withURLParam(workbenchRequest(t, "PATCH", "/api/workbench/goals/"+own.ID,
		map[string]any{"title": "我自己改的目标"}, memberUserID), "goalId", own.ID)
	testutil.Call(t, testHandler.UpdateGoal, req).Want(http.StatusOK)

	// A signal the member did not create is not convertible by it.
	signal := marketSignalFixture(t, testUserID, "别人抓的信号")
	req = withURLParam(workbenchRequest(t, "POST",
		"/api/workbench/signals/"+signal.ID+"/convert",
		map[string]any{"target": "goal"}, memberUserID), "signalId", signal.ID)
	testutil.Call(t, testHandler.ConvertMarketSignal, req).Want(http.StatusForbidden)
}

// TestGoalIssueAttachFiltersByGoal covers `issue.goal_id` (748): an issue attached
// to a goal is listed under it, an issue outside the goal is not, and an issue
// belongs to at most one goal.
func TestGoalIssueAttachFiltersByGoal(t *testing.T) {
	goal := goalFixture(t, testUserID, "2026Q4", "Issue attach fixture")
	other := goalFixture(t, testUserID, "2026Q4", "Issue attach fixture two")
	issueID := dbfx.Issue(t, "goal issue fixture")
	dbfx.Issue(t, "unrelated issue fixture")

	req := withURLParam(workbenchRequest(t, "POST", "/api/workbench/goals/"+goal.ID+"/issues",
		map[string]any{"issue_id": issueID}, testUserID), "goalId", goal.ID)
	attached := testutil.Decode[GoalIssueResponse](t, testHandler.AttachGoalIssue, req, http.StatusCreated)
	if attached.ID != issueID || attached.GoalID == nil || *attached.GoalID != goal.ID {
		t.Fatalf("attached issue = %+v, want %s under goal %s", attached, issueID, goal.ID)
	}

	// The goal detail lists exactly the attached task, not the whole issue table.
	req = withURLParam(workbenchRequest(t, "GET", "/api/workbench/goals/"+goal.ID, nil, testUserID),
		"goalId", goal.ID)
	detail := testutil.Decode[GoalDetailResponse](t, testHandler.GetGoal, req, http.StatusOK)
	if len(detail.Issues) != 1 || detail.Issues[0].ID != issueID {
		t.Fatalf("goal issues = %+v, want exactly %s", detail.Issues, issueID)
	}

	// Attaching it again, or to another goal, is a 409: a task advances one
	// objective, and re-pointing would move its completion between them.
	req = withURLParam(workbenchRequest(t, "POST", "/api/workbench/goals/"+goal.ID+"/issues",
		map[string]any{"issue_id": issueID}, testUserID), "goalId", goal.ID)
	testutil.Call(t, testHandler.AttachGoalIssue, req).Want(http.StatusConflict)

	req = withURLParam(workbenchRequest(t, "POST", "/api/workbench/goals/"+other.ID+"/issues",
		map[string]any{"issue_id": issueID}, testUserID), "goalId", other.ID)
	testutil.Call(t, testHandler.AttachGoalIssue, req).Want(http.StatusConflict)

	// Detaching clears the pointer; the issue itself stays.
	req = mediaURLParams(workbenchRequest(t, "DELETE",
		"/api/workbench/goals/"+goal.ID+"/issues/"+issueID, nil, testUserID),
		map[string]string{"goalId": goal.ID, "issueId": issueID})
	testutil.Call(t, testHandler.DetachGoalIssue, req).Want(http.StatusNoContent)

	req = withURLParam(workbenchRequest(t, "GET", "/api/workbench/goals/"+goal.ID, nil, testUserID),
		"goalId", goal.ID)
	detail = testutil.Decode[GoalDetailResponse](t, testHandler.GetGoal, req, http.StatusOK)
	if len(detail.Issues) != 0 {
		t.Fatalf("goal issues after detach = %+v, want none", detail.Issues)
	}
	if left := dbfx.Count(t, `SELECT count(*) FROM issue WHERE id = $1`, issueID); left != 1 {
		t.Fatalf("issue row gone after detach (count = %d)", left)
	}
}

// TestGoalTeardownRemovesGoalTables exercises the teardown statement itself for the
// four new tables: the manifest test classifies them, this case proves
// DeleteWorkspaceWorkbenchLedger actually reaches them.
func TestGoalTeardownRemovesGoalTables(t *testing.T) {
	// A throwaway workspace, so the one the rest of the suite shares is untouched.
	slug := strings.NewReplacer("_", "-", "/", "-").Replace(strings.ToLower(t.Name()))
	workspaceID := dbfx.Workspace(t, "OKR teardown workspace", slug)
	t.Cleanup(func() {
		for _, table := range []string{"goal_key_result", "goal_package", "market_signal", "goal_okr"} {
			dbfx.Exec(t, `DELETE FROM `+table+` WHERE workspace_id = $1`, workspaceID)
		}
	})

	goalID := dbfx.Insert(t, "goal_okr", testutil.Cols{
		"workspace_id":    workspaceID,
		"cycle":           "2026Q4",
		"title":           "teardown goal",
		"owner_member_id": testUserID,
	})
	dbfx.Insert(t, "goal_key_result", testutil.Cols{
		"workspace_id": workspaceID,
		"goal_id":      goalID,
		"title":        "teardown key result",
	})
	dbfx.Insert(t, "goal_package", testutil.Cols{
		"workspace_id": workspaceID,
		"goal_id":      goalID,
		"department_id": dbfx.Insert(t, "department", testutil.Cols{
			"workspace_id": workspaceID,
			"name":         "teardown department",
		}),
		"title": "teardown package",
	})
	dbfx.Insert(t, "market_signal", testutil.Cols{
		"workspace_id": workspaceID,
		"title":        "teardown signal",
	})

	if err := testHandler.Queries.DeleteWorkspaceWorkbenchLedger(t.Context(), parseUUID(workspaceID)); err != nil {
		t.Fatalf("teardown: %v", err)
	}

	for _, table := range []string{"goal_okr", "goal_key_result", "goal_package", "market_signal"} {
		if left := dbfx.Count(t, `SELECT count(*) FROM `+table+` WHERE workspace_id = $1`, workspaceID); left != 0 {
			t.Fatalf("%s still holds %d rows after teardown", table, left)
		}
	}
}
