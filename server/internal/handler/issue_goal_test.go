package handler

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/jerry-halo2026/morchat.co/server/internal/testutil"
)

// newGoalFixture inserts an OKR objective in the shared test workspace. Issues
// point at it through `issue.goal_id` (748); there is no foreign key, so
// cleanup order does not matter.
func newGoalFixture(t *testing.T, title string) string {
	t.Helper()
	return dbfx.Insert(t, "goal_okr", testutil.Cols{
		"workspace_id":    testWorkspaceID,
		"cycle":           "2026Q4",
		"title":           title,
		"owner_member_id": testUserID,
	})
}

func readIssueDetail(t *testing.T, id string) IssueResponse {
	t.Helper()
	var detail IssueResponse
	testutil.Call(t, testHandler.GetIssue, withURLParam(newRequest("GET", "/api/issues/"+id, nil), "id", id)).
		Want(http.StatusOK).JSON(&detail)
	return detail
}

func listIssuesByGoal(t *testing.T, query string) []IssueResponse {
	t.Helper()
	var page struct {
		Issues []IssueResponse `json:"issues"`
	}
	testutil.Call(t, testHandler.ListIssues, newRequest("GET", "/api/issues?"+query, nil)).
		Want(http.StatusOK).JSON(&page)
	return page.Issues
}

func findIssue(issues []IssueResponse, id string) *IssueResponse {
	for i := range issues {
		if issues[i].ID == id {
			return &issues[i]
		}
	}
	return nil
}

// issue.goal_id (748) reaches clients on every issue rendering, so the boss
// task page can group tasks by goal from /api/issues instead of walking
// GET /goals/{id} once per goal.
func TestIssueResponseCarriesGoalID(t *testing.T) {
	if testHandler == nil {
		t.Skip("database not available")
	}
	goalID := newGoalFixture(t, "task page goal")
	attached := dbfx.Issue(t, "goal-carried", testutil.Cols{"goal_id": goalID})
	unattached := dbfx.Issue(t, "goal-absent")

	detail := readIssueDetail(t, attached)
	if detail.GoalID == nil || *detail.GoalID != goalID {
		t.Fatalf("detail goal_id = %v, want %q", detail.GoalID, goalID)
	}
	if loose := readIssueDetail(t, unattached); loose.GoalID != nil {
		t.Fatalf("unattached detail goal_id = %v, want null", *loose.GoalID)
	}

	for _, issue := range listIssuesByGoal(t, "goal_id="+goalID+"&limit=200") {
		if issue.GoalID == nil || *issue.GoalID != goalID {
			t.Fatalf("goal-filtered list returned goal_id = %v, want %q", issue.GoalID, goalID)
		}
	}

	listed := findIssue(listIssuesByGoal(t, "goal_id="+goalID+"&limit=200"), attached)
	if listed == nil {
		t.Fatal("goal-filtered list omitted the attached issue")
	}
	if listed.GoalID == nil || *listed.GoalID != goalID {
		t.Fatalf("list goal_id = %v, want %q", listed.GoalID, goalID)
	}

	// open_only is the same endpoint with a different branch; it must carry the
	// field too, since the task page's grouped tab reads that branch.
	openListed := findIssue(listIssuesByGoal(t, "open_only=true&goal_id="+goalID), attached)
	if openListed == nil {
		t.Fatal("goal-filtered open_only list omitted the attached issue")
	}
	if openListed.GoalID == nil || *openListed.GoalID != goalID {
		t.Fatalf("open_only goal_id = %v, want %q", openListed.GoalID, goalID)
	}
}

// The key is present-and-null rather than absent, so a client can tell "this
// task is not attached to a goal" apart from "this server predates the field".
func TestIssueResponseAlwaysEmitsGoalID(t *testing.T) {
	if testHandler == nil {
		t.Skip("database not available")
	}
	unattached := dbfx.Issue(t, "goal-key-present")

	var raw map[string]json.RawMessage
	testutil.Call(t, testHandler.GetIssue, withURLParam(newRequest("GET", "/api/issues/"+unattached, nil), "id", unattached)).
		Want(http.StatusOK).JSON(&raw)
	value, ok := raw["goal_id"]
	if !ok {
		t.Fatal("detail response has no goal_id key; a client cannot tell unattached from a pre-748 server")
	}
	if string(value) != "null" {
		t.Fatalf("goal_id = %s, want null", value)
	}
}

func TestListIssuesFiltersByGoalID(t *testing.T) {
	if testHandler == nil {
		t.Skip("database not available")
	}
	goalA := newGoalFixture(t, "filter goal a")
	goalB := newGoalFixture(t, "filter goal b")
	issueA := dbfx.Issue(t, "goal-filter-a", testutil.Cols{"goal_id": goalA})
	issueB := dbfx.Issue(t, "goal-filter-b", testutil.Cols{"goal_id": goalB})
	dbfx.Issue(t, "goal-filter-nothing")

	only := func(t *testing.T, query, want, unwanted string) {
		t.Helper()
		issues := listIssuesByGoal(t, query)
		if findIssue(issues, want) == nil {
			t.Fatalf("%s omitted the wanted issue", query)
		}
		if findIssue(issues, unwanted) != nil {
			t.Fatalf("%s returned an issue attached to another goal", query)
		}
		// The filter is an equality on goal_id, so every row it returns must
		// carry it — an OR that degraded into "no filter" would slip through a
		// membership-only assertion.
		for _, issue := range issues {
			if issue.GoalID == nil || *issue.GoalID != goalA {
				t.Fatalf("%s returned an issue with goal_id = %v", query, issue.GoalID)
			}
		}
	}
	only(t, "goal_id="+goalA+"&limit=200", issueA, issueB)
	only(t, "open_only=true&goal_id="+goalA, issueA, issueB)

	// No goal_id means no filter: the window is still the whole workspace.
	unfiltered := findIssue(listIssuesByGoal(t, "limit=200"), issueB)
	if unfiltered == nil {
		t.Fatal("omitting goal_id dropped an issue attached to a different goal")
	}
	if unfiltered.GoalID == nil || *unfiltered.GoalID != goalB {
		t.Fatalf("unfiltered goal_id = %v, want %q", unfiltered.GoalID, goalB)
	}
}

// A malformed id is a client bug, not "this goal has no tasks": silently
// emptying the window would make the two indistinguishable.
func TestListIssuesRejectsMalformedGoalID(t *testing.T) {
	if testHandler == nil {
		t.Skip("database not available")
	}
	for _, bad := range []string{"not-a-uuid", "1", "goal-a"} {
		testutil.Call(t, testHandler.ListIssues, newRequest("GET", "/api/issues?goal_id="+bad, nil)).
			Want(http.StatusBadRequest)
	}
}
