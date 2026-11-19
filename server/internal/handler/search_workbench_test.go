package handler

// Tests for the workbench entity search (search_workbench.go).
//
// Two layers, deliberately split:
//
//   - the vocabulary guard runs with no database and fails the build if a kind
//     is declared without a query, a query without a route, or a route for a
//     kind nobody can ask for. That is the failure this surface invites: a
//     palette group that is always empty because the branch behind it is gone.
//   - the row test runs against the migrated dev database and proves the rows
//     actually come back — one fixture per kind, one query that matches all five.

import (
	"net/http"
	"testing"

	"github.com/jerry-halo2026/morchat.co/server/internal/testutil"
)

// TestWorkbenchSearchKindsHaveBranches is the no-database guard: every declared
// kind must have a query, a route and a place in the order, and nothing else may
// exist in those maps.
func TestWorkbenchSearchKindsHaveBranches(t *testing.T) {
	if len(workbenchSearchKindOrder) != 5 {
		t.Fatalf("kind order has %d entries, want 5: %v", len(workbenchSearchKindOrder), workbenchSearchKindOrder)
	}
	if len(workbenchSearchSQL) != len(workbenchSearchKindOrder) {
		t.Fatalf("query map has %d entries, order has %d", len(workbenchSearchSQL), len(workbenchSearchKindOrder))
	}
	if len(workbenchSearchRoutes) != len(workbenchSearchKindOrder) {
		t.Fatalf("route map has %d entries, order has %d", len(workbenchSearchRoutes), len(workbenchSearchKindOrder))
	}

	declared := make(map[string]bool, len(workbenchSearchKindOrder))
	for _, kind := range workbenchSearchKindOrder {
		if declared[kind] {
			t.Fatalf("kind %q appears twice in the order", kind)
		}
		declared[kind] = true
		if query, ok := workbenchSearchSQL[kind]; !ok || query == "" {
			t.Errorf("kind %q has no query branch", kind)
		}
		route, ok := workbenchSearchRoutes[kind]
		if !ok || route == "" {
			t.Errorf("kind %q has no route", kind)
		} else if route[0] != '/' {
			t.Errorf("kind %q route %q must start with a slash", kind, route)
		}
	}
	for kind := range workbenchSearchSQL {
		if !declared[kind] {
			t.Errorf("query branch %q is not a declared kind", kind)
		}
	}
	for kind := range workbenchSearchRoutes {
		if !declared[kind] {
			t.Errorf("route %q is not a declared kind", kind)
		}
	}

	// The five names are the contract the palette and the docs quote.
	for _, kind := range []string{"creator", "collab", "quote", "goal", "media_topic"} {
		if !declared[kind] {
			t.Errorf("kind %q is missing", kind)
		}
	}
}

// TestWorkbenchSearchFindsEveryKind inserts one searchable row per ledger and
// asserts a single query returns all five, each with the shape the palette
// renders.
func TestWorkbenchSearchFindsEveryKind(t *testing.T) {
	if testPool == nil {
		t.Skip("handler tests require a reachable DATABASE_URL")
	}

	const needle = "searchfixture-zeta"
	fx := dbfx

	creatorID := fx.Insert(t, "creator", testutil.Cols{
		"workspace_id": testWorkspaceID,
		"kind":         "external",
		"display_name": needle + " creator",
		"platform":     "douyin",
		"handle":       "search_fixture",
	})
	clientID := fx.Insert(t, "crm_client", testutil.Cols{
		"workspace_id": testWorkspaceID,
		"name":         needle + " client",
	})
	briefID := fx.Insert(t, "crm_brief", testutil.Cols{
		"workspace_id": testWorkspaceID,
		"client_id":    clientID,
		"title":        needle + " brief",
	})
	fx.Insert(t, "crm_collab", testutil.Cols{
		"workspace_id": testWorkspaceID,
		"brief_id":     briefID,
		"creator_id":   creatorID,
		"stage":        "quoted",
	})
	fx.Insert(t, "creator_quote", testutil.Cols{
		"workspace_id": testWorkspaceID,
		"creator_id":   creatorID,
		"status":       "sent",
		"fee_amount":   12000,
		"currency":     "CNY",
	})
	fx.Insert(t, "goal_okr", testutil.Cols{
		"workspace_id":    testWorkspaceID,
		"cycle":           "2026-Q4",
		"title":           needle + " goal",
		"owner_member_id": testUserID,
	})
	ipID := fx.Insert(t, "media_ip", testutil.Cols{
		"workspace_id": testWorkspaceID,
		"name":         needle + " ip",
	})
	fx.Insert(t, "media_topic", testutil.Cols{
		"workspace_id": testWorkspaceID,
		"ip_id":        ipID,
		"title":        needle + " topic",
	})

	out := testutil.Decode[WorkbenchSearchResponse](t, testHandler.WorkbenchSearch,
		testutil.WithHeaders(
			testutil.JSONRequest(http.MethodGet, "/api/workbench/search?q="+needle, nil),
			"X-User-ID", testUserID, "X-Workspace-ID", testWorkspaceID,
		), http.StatusOK)

	if len(out.Kinds) != len(workbenchSearchKindOrder) {
		t.Fatalf("kinds = %v, want all %d", out.Kinds, len(workbenchSearchKindOrder))
	}

	found := make(map[string]WorkbenchSearchResult, len(out.Results))
	for _, row := range out.Results {
		if row.ID == "" || row.Title == "" || row.Href == "" {
			t.Fatalf("row %+v is missing id/title/href", row)
		}
		if row.Kind == workbenchSearchKindCollab {
			// A collab's title is creator × brief, so the match lands on the
			// joined string rather than on either side alone.
			if row.Title == "" {
				t.Fatalf("collab row has no joined title: %+v", row)
			}
		}
		found[row.Kind] = row
	}
	for _, kind := range workbenchSearchKindOrder {
		if _, ok := found[kind]; !ok {
			t.Errorf("kind %q returned no row for %q (results: %+v)", kind, needle, out.Results)
		}
	}

	// href names the page the row lives on, under this workspace's slug.
	if got := found[workbenchSearchKindCreator].Href; got != "/"+handlerTestWorkspaceSlug+"/sales/creators" {
		t.Errorf("creator href = %q", got)
	}
	if got := found[workbenchSearchKindTopic].Href; got != "/"+handlerTestWorkspaceSlug+"/content/topics" {
		t.Errorf("topic href = %q", got)
	}
}

// TestWorkbenchSearchRejectsUnknownKind keeps a typo visible: an unknown kind is
// a 400, not an empty group.
func TestWorkbenchSearchRejectsUnknownKind(t *testing.T) {
	if testPool == nil {
		t.Skip("handler tests require a reachable DATABASE_URL")
	}
	testutil.Call(t, testHandler.WorkbenchSearch,
		testutil.WithHeaders(
			testutil.JSONRequest(http.MethodGet, "/api/workbench/search?q=x&kinds=creators", nil),
			"X-User-ID", testUserID, "X-Workspace-ID", testWorkspaceID,
		)).Want(http.StatusBadRequest)
}
