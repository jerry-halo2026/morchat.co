package handler

// BD list filters, keyset pages and the read-side department switch
// (docs/engineering/WORKBENCH-API.md §20.3, §24.4/§24.6).
//
// Three rules are pinned here, because each one fails silently if it regresses:
//
//   - a keyset page must neither repeat nor skip a row, and `next_cursor` must only
//     exist on a page that has a successor (a cursor on the last page makes a client
//     fetch an empty page forever);
//   - `?due=1` must return what the inbox due scan would notify about, not "rows with
//     no outcome" — the two would drift apart the moment the scan changed;
//   - `workbench_visibility=department` must narrow the *lists* the same way it already
//     narrows a by-id read, and must never widen an ownerless row into everybody's.
//
// The workspace is a throwaway one in each case: these assertions are about which rows
// come back, and the suite's shared workspace already holds rows from other suites.

import (
	"fmt"
	"net/http"
	"strings"
	"testing"

	"github.com/jerry-halo2026/morchat.co/server/internal/testutil"
)

// bdQuotePage / bdActivityPage are the list envelopes as the client parses them,
// `next_cursor` included: the wire key is what matters, not the Go field.
type bdQuotePage struct {
	Quotes     []BdQuoteWithThread `json:"quotes"`
	Total      int                 `json:"total"`
	NextCursor *string             `json:"next_cursor"`
}

type bdActivityPage struct {
	Activities []BdActivityResponse `json:"activities"`
	Total      int                  `json:"total"`
	NextCursor *string              `json:"next_cursor"`
}

type bdCampaignPage struct {
	Campaigns []BdCampaignResponse `json:"campaigns"`
	Total     int                  `json:"total"`
}

// bdListQuotes reads the quote ledger with query (already URL-encoded, e.g. "?limit=2").
func bdListQuotes(t *testing.T, workspaceID, userID, query string) bdQuotePage {
	t.Helper()
	req := bdRequestIn(t, "GET", "/api/workbench/bd/quotes"+query, workspaceID, nil, userID)
	return testutil.Decode[bdQuotePage](t, testHandler.ListBdQuotes, req, http.StatusOK)
}

// bdListActivities reads the follow-up timeline with query.
func bdListActivities(t *testing.T, workspaceID, userID, query string) bdActivityPage {
	t.Helper()
	req := bdRequestIn(t, "GET", "/api/workbench/bd/activities"+query, workspaceID, nil, userID)
	return testutil.Decode[bdActivityPage](t, testHandler.ListBdActivities, req, http.StatusOK)
}

// bdListCampaigns reads the collection batches with query.
func bdListCampaigns(t *testing.T, workspaceID, userID, query string) bdCampaignPage {
	t.Helper()
	req := bdRequestIn(t, "GET", "/api/workbench/bd/campaigns"+query, workspaceID, nil, userID)
	return testutil.Decode[bdCampaignPage](t, testHandler.ListBdCampaigns, req, http.StatusOK)
}

// crmCollabIDs reads the collaboration ledger. The department cases assert on which
// rows came back, so the whole list is read with one page.
func crmCollabIDs(t *testing.T, workspaceID, userID string) []string {
	t.Helper()
	req := bdRequestIn(t, "GET", "/api/workbench/crm/collabs?limit=200", workspaceID, nil, userID)
	var page struct {
		Collabs []CrmCollabWithThread `json:"collabs"`
	}
	testutil.Call(t, testHandler.ListCrmCollabs, req).Want(http.StatusOK).JSON(&page)
	ids := make([]string, len(page.Collabs))
	for i, collab := range page.Collabs {
		ids[i] = collab.ID
	}
	return ids
}

// crmSettlementIDs reads the settlement ledger.
func crmSettlementIDs(t *testing.T, workspaceID, userID string) []string {
	t.Helper()
	req := bdRequestIn(t, "GET", "/api/workbench/crm/settlements?limit=200", workspaceID, nil, userID)
	var page struct {
		Settlements []CrmSettlementResponse `json:"settlements"`
	}
	testutil.Call(t, testHandler.ListCrmSettlements, req).Want(http.StatusOK).JSON(&page)
	ids := make([]string, len(page.Settlements))
	for i, settlement := range page.Settlements {
		ids[i] = settlement.ID
	}
	return ids
}

// bdCampaignIDs collapses a campaign page into its ids.
func bdCampaignIDs(page bdCampaignPage) []string {
	ids := make([]string, len(page.Campaigns))
	for i, campaign := range page.Campaigns {
		ids[i] = campaign.ID
	}
	return ids
}

// bdQuoteIDs collapses a page into the ids it carries, in order.
func bdQuoteIDs(page bdQuotePage) []string {
	ids := make([]string, len(page.Quotes))
	for i, quote := range page.Quotes {
		ids[i] = quote.ID
	}
	return ids
}

// bdActivityIDs collapses a page into the ids it carries, in order.
func bdActivityIDs(page bdActivityPage) []string {
	ids := make([]string, len(page.Activities))
	for i, activity := range page.Activities {
		ids[i] = activity.ID
	}
	return ids
}

// bdWantIDs fails with both lists spelled out: "the page changed" is the least useful
// message a filter test can print.
func bdWantIDs(t *testing.T, label string, got, want []string) {
	t.Helper()
	if len(got) != len(want) {
		t.Fatalf("%s = %v, want %v", label, got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("%s = %v, want %v", label, got, want)
		}
	}
}

// bdWantSet is `bdWantIDs` without the order: used where the case is about *which*
// rows survive a filter, not about the ranking a separate case already pins.
func bdWantSet(t *testing.T, label string, got, want []string) {
	t.Helper()
	if len(got) != len(want) {
		t.Fatalf("%s = %v, want the same %v", label, got, want)
	}
	remaining := make(map[string]int, len(want))
	for _, id := range want {
		remaining[id]++
	}
	for _, id := range got {
		if remaining[id] == 0 {
			t.Fatalf("%s = %v, want the same %v", label, got, want)
		}
		remaining[id]--
	}
}

// TestBdQuoteListTextStatusAndSort covers `?q=`, `?status=` and `?sort=` on the quote
// ledger (§20.3).
func TestBdQuoteListTextStatusAndSort(t *testing.T) {
	workspaceID, ownerUserID := bdScratchWorkspace(t, "BD quote filters")
	alpha := bdCreateCreator(t, workspaceID, ownerUserID, "BD alpha creator")
	beta := bdCreateCreator(t, workspaceID, ownerUserID, "BD beta creator")

	// Three offers: one big, one small, one pure commission (no slot fee at all).
	big := bdCreateQuote(t, workspaceID, ownerUserID, alpha.ID, map[string]any{
		"fee_amount": 9000, "note": "exclusive terms included",
	})
	small := bdCreateQuote(t, workspaceID, ownerUserID, alpha.ID, map[string]any{
		"fee_amount": 1000,
	})
	commissionOnly := bdCreateQuote(t, workspaceID, ownerUserID, beta.ID, map[string]any{
		"commission_rate": 0.2, "status": "accepted",
	})

	// `?q=` matches the creator's name …
	bdWantIDs(t, "?q=beta", bdQuoteIDs(bdListQuotes(t, workspaceID, ownerUserID, "?q=beta")),
		[]string{commissionOnly.ID})
	// … and the quote's own note: a 商务 searches by what they wrote down.
	bdWantIDs(t, "?q=exclusive", bdQuoteIDs(bdListQuotes(t, workspaceID, ownerUserID, "?q=exclusive")),
		[]string{big.ID})
	// A term that matches nothing is an empty page, not "no filter".
	bdWantIDs(t, "?q=nothing-matches", bdQuoteIDs(bdListQuotes(t, workspaceID, ownerUserID, "?q=nothing-matches")), nil)

	// `?status=accepted` is the decided segment of the ledger.
	bdWantIDs(t, "?status=accepted", bdQuoteIDs(bdListQuotes(t, workspaceID, ownerUserID, "?status=accepted")),
		[]string{commissionOnly.ID})
	// An unknown status is a 400 rather than a silently unfiltered list.
	req := bdRequestIn(t, "GET", "/api/workbench/bd/quotes?status=maybe", workspaceID, nil, ownerUserID)
	testutil.Call(t, testHandler.ListBdQuotes, req).Want(http.StatusBadRequest)

	// `?sort=fee_amount` puts the largest slot fee first and the offer with no fee last:
	// NULL is "pure commission", which is not "we offered 0", so it must not sit between
	// the two amounts.
	bdWantIDs(t, "sort=fee_amount", bdQuoteIDs(bdListQuotes(t, workspaceID, ownerUserID, "?sort=fee_amount")),
		[]string{big.ID, small.ID, commissionOnly.ID})

	// An unknown sort is a 400: a client that asked for an ordering it did not get would
	// draw unsorted rows as a ranking.
	req = bdRequestIn(t, "GET", "/api/workbench/bd/quotes?sort=fans", workspaceID, nil, ownerUserID)
	testutil.Call(t, testHandler.ListBdQuotes, req).Want(http.StatusBadRequest)

	// `sort=updated_at` is the default, and the row that moved last leads it.
	patch := withURLParam(bdRequestIn(t, "PATCH", "/api/workbench/bd/quotes/"+commissionOnly.ID,
		workspaceID, map[string]any{"note": "客户追加了口播"}, ownerUserID), "quoteId", commissionOnly.ID)
	testutil.Call(t, testHandler.UpdateBdQuote, patch).Want(http.StatusOK)
	if ids := bdQuoteIDs(bdListQuotes(t, workspaceID, ownerUserID, "")); ids[0] != commissionOnly.ID {
		t.Fatalf("default order = %v, want the just-updated quote first", ids)
	}
}

// TestBdListCursorPagesBothLedgers covers the keyset pages of §20.3: a full page names
// its successor, following the cursor yields the rest without repeating a row, and the
// last page carries no cursor at all.
func TestBdListCursorPagesBothLedgers(t *testing.T) {
	workspaceID, ownerUserID := bdScratchWorkspace(t, "BD cursor pages")
	creator := bdCreateCreator(t, workspaceID, ownerUserID, "BD cursor creator")

	// Four offers, told apart by the day they were quoted, so the `quoted_at` order is a
	// fact of the fixture and not of insertion timing. The last one carries no slot fee:
	// it is the NULL tail of the `fee_amount` order, which is the branch a keyset
	// predicate gets wrong most easily (a NULL sort key must still be *after* every
	// amount, so it has to be reachable from a cursor whose key is a number).
	first := bdCreateQuote(t, workspaceID, ownerUserID, creator.ID, map[string]any{
		"quoted_at": "2026-11-01T09:00:00Z", "fee_amount": 100,
	})
	second := bdCreateQuote(t, workspaceID, ownerUserID, creator.ID, map[string]any{
		"quoted_at": "2026-11-02T09:00:00Z", "fee_amount": 200,
	})
	third := bdCreateQuote(t, workspaceID, ownerUserID, creator.ID, map[string]any{
		"quoted_at": "2026-11-03T09:00:00Z", "fee_amount": 300,
	})
	commissionOnly := bdCreateQuote(t, workspaceID, ownerUserID, creator.ID, map[string]any{
		"quoted_at": "2026-10-01T09:00:00Z", "commission_rate": 0.2,
	})

	page1 := bdListQuotes(t, workspaceID, ownerUserID, "?sort=quoted_at&limit=2")
	bdWantIDs(t, "quotes page 1", bdQuoteIDs(page1), []string{third.ID, second.ID})
	if page1.NextCursor == nil {
		t.Fatalf("quotes page 1 = %+v, want a next_cursor on a full page", page1)
	}
	page2 := bdListQuotes(t, workspaceID, ownerUserID, "?sort=quoted_at&limit=2&cursor="+*page1.NextCursor)
	bdWantIDs(t, "quotes page 2", bdQuoteIDs(page2), []string{first.ID, commissionOnly.ID})
	if page2.NextCursor == nil {
		t.Fatalf("quotes page 2 = %+v, want a next_cursor while rows remain", page2)
	}
	page3 := bdListQuotes(t, workspaceID, ownerUserID, "?sort=quoted_at&limit=2&cursor="+*page2.NextCursor)
	bdWantIDs(t, "quotes page 3", bdQuoteIDs(page3), nil)
	if page3.NextCursor != nil {
		t.Fatalf("quotes page 3 next_cursor = %q, want nil on the last page", *page3.NextCursor)
	}

	// The money order pages over the same four rows, resuming from an amount rather than
	// a date: `(sort key, id)` keyset, whatever the key's type is. The second page is
	// where the NULL fee has to arrive — after the 100, not before it.
	money1 := bdListQuotes(t, workspaceID, ownerUserID, "?sort=fee_amount&limit=2")
	bdWantIDs(t, "fee page 1", bdQuoteIDs(money1), []string{third.ID, second.ID})
	if money1.NextCursor == nil {
		t.Fatalf("fee page 1 = %+v, want a next_cursor", money1)
	}
	money2 := bdListQuotes(t, workspaceID, ownerUserID, "?sort=fee_amount&limit=2&cursor="+*money1.NextCursor)
	bdWantIDs(t, "fee page 2", bdQuoteIDs(money2), []string{first.ID, commissionOnly.ID})

	// A cursor that names nothing in this workspace is a 400, not an empty page: an empty
	// page reads as "you have reached the end".
	req := bdRequestIn(t, "GET", "/api/workbench/bd/quotes?cursor="+creator.ID, workspaceID, nil, ownerUserID)
	testutil.Call(t, testHandler.ListBdQuotes, req).Want(http.StatusBadRequest)

	// The follow-up timeline pages on `happened_at` the same way.
	older := bdCreateActivity(t, workspaceID, ownerUserID, creator.ID, map[string]any{
		"happened_at": "2026-11-05T09:00:00Z", "summary": "older follow-up",
	})
	newer := bdCreateActivity(t, workspaceID, ownerUserID, creator.ID, map[string]any{
		"happened_at": "2026-11-06T09:00:00Z", "summary": "newer follow-up",
	})
	newest := bdCreateActivity(t, workspaceID, ownerUserID, creator.ID, map[string]any{
		"happened_at": "2026-11-07T09:00:00Z", "summary": "newest follow-up",
	})

	activities1 := bdListActivities(t, workspaceID, ownerUserID, "?limit=2")
	bdWantIDs(t, "activities page 1", bdActivityIDs(activities1), []string{newest.ID, newer.ID})
	if activities1.NextCursor == nil {
		t.Fatalf("activities page 1 = %+v, want a next_cursor", activities1)
	}
	activities2 := bdListActivities(t, workspaceID, ownerUserID, "?limit=2&cursor="+*activities1.NextCursor)
	bdWantIDs(t, "activities page 2", bdActivityIDs(activities2), []string{older.ID})
	if activities2.NextCursor != nil {
		t.Fatalf("activities page 2 next_cursor = %q, want nil", *activities2.NextCursor)
	}
}

// TestBdActivityDueFilter covers `?due=1` (§20.3): the scheduled-and-passed rows, with
// the same predicate the inbox due scan uses.
func TestBdActivityDueFilter(t *testing.T) {
	workspaceID, ownerUserID := bdScratchWorkspace(t, "BD due filter")
	creator := bdCreateCreator(t, workspaceID, ownerUserID, "BD due creator")

	// `next_follow_at` in 2020 is past anything this test will run at; 2035 is future.
	overdue := bdCreateActivity(t, workspaceID, ownerUserID, creator.ID, map[string]any{
		"happened_at": "2026-11-01T09:00:00Z", "next_follow_at": "2020-01-01T00:00:00Z",
		"summary": "chase the price list",
	})
	// A passed date with a recorded outcome is still a call somebody owes: `outcome` is
	// deliberately not part of the filter (same rule as the due scan).
	answered := bdCreateActivity(t, workspaceID, ownerUserID, creator.ID, map[string]any{
		"happened_at": "2026-11-02T09:00:00Z", "next_follow_at": "2020-01-02T00:00:00Z",
		"outcome": "replied", "summary": "she replied, send the contract",
	})
	scheduled := bdCreateActivity(t, workspaceID, ownerUserID, creator.ID, map[string]any{
		"happened_at": "2026-11-03T09:00:00Z", "next_follow_at": "2035-01-01T00:00:00Z",
		"summary": "follow up next year",
	})
	if scheduled.NextFollowAt == nil {
		t.Fatalf("scheduled follow-up = %+v, want a next_follow_at", scheduled)
	}
	_ = bdCreateActivity(t, workspaceID, ownerUserID, creator.ID, map[string]any{
		"happened_at": "2026-11-04T09:00:00Z", "summary": "note with nothing scheduled",
	})

	bdWantIDs(t, "?due=1", bdActivityIDs(bdListActivities(t, workspaceID, ownerUserID, "?due=1")),
		[]string{answered.ID, overdue.ID})
	// The switch, not a default: without it the whole timeline comes back.
	if page := bdListActivities(t, workspaceID, ownerUserID, ""); page.Total != 4 {
		t.Fatalf("unfiltered total = %d, want 4", page.Total)
	}
	if page := bdListActivities(t, workspaceID, ownerUserID, "?due=0"); page.Total != 4 {
		t.Fatalf("?due=0 total = %d, want the unfiltered 4", page.Total)
	}
	// `due` combines with the other filters instead of replacing them.
	bdWantIDs(t, "?due=1&creator_id=other",
		bdActivityIDs(bdListActivities(t, workspaceID, ownerUserID, "?due=1&creator_id="+workspaceID)), nil)

	// A misspelt switch is a 400: silently widening to the whole ledger is the failure
	// mode this check exists for.
	req := bdRequestIn(t, "GET", "/api/workbench/bd/activities?due=maybe", workspaceID, nil, ownerUserID)
	testutil.Call(t, testHandler.ListBdActivities, req).Want(http.StatusBadRequest)
}

// bdDepartmentMember creates a member of workspaceID in departmentID, with no job
// title, so the department default (not a template) resolves its capabilities.
func bdDepartmentMember(t *testing.T, workspaceID, departmentID, label string) string {
	t.Helper()
	slug := strings.NewReplacer("_", "-", "/", "-", " ", "-").Replace(strings.ToLower(t.Name() + "-" + label))
	userID := dbfx.User(t, "Department Member", fmt.Sprintf("dept-%s@multica.ai", slug))
	dbfx.Member(t, workspaceID, userID, "member", testutil.Cols{"department_id": departmentID})
	return userID
}

// TestWorkbenchDepartmentVisibilityFiltersLists covers §24.4's read half, which §24.6
// recorded as the open gap: with `workbench_visibility=department` the four core
// ledgers (and the campaign list) return only the rows whose owner sits in the
// caller's department. `transparent` — the default — keeps the workspace-wide read,
// and a row with no owner is invisible in department mode rather than visible to
// everybody.
func TestWorkbenchDepartmentVisibilityFiltersLists(t *testing.T) {
	workspaceID, ownerUserID := bdScratchWorkspace(t, "Department visibility lists")
	salesDepartment := dbfx.Insert(t, "department", testutil.Cols{"workspace_id": workspaceID, "name": "销售部"})
	contentDepartment := dbfx.Insert(t, "department", testutil.Cols{"workspace_id": workspaceID, "name": "内容组"})
	salesUser := bdDepartmentMember(t, workspaceID, salesDepartment, "sales")
	contentUser := bdDepartmentMember(t, workspaceID, contentDepartment, "content")

	// One row per ledger per owner, plus one row owned by nobody. Inserted directly:
	// these cases are about the read predicate, not about the write path (which other
	// suites own), and a handler create per row would drag in three more fixtures.
	creatorID := dbfx.Insert(t, "creator", testutil.Cols{
		"workspace_id": workspaceID, "kind": "external", "display_name": "Department creator",
		"platform": "douyin", "handle": "department-creator",
	})
	clientID := dbfx.Insert(t, "crm_client", testutil.Cols{"workspace_id": workspaceID, "name": "Department client"})
	briefID := dbfx.Insert(t, "crm_brief", testutil.Cols{
		"workspace_id": workspaceID, "client_id": clientID, "title": "Department brief",
	})

	collabOf := func(owner any) string {
		return dbfx.Insert(t, "crm_collab", testutil.Cols{
			"workspace_id": workspaceID, "brief_id": briefID, "creator_id": creatorID,
			"stage": "negotiating", "owner_member_id": owner,
		})
	}
	collabSales := collabOf(salesUser)
	collabContent := collabOf(contentUser)
	collabNoOwner := collabOf(nil)

	settlementOf := func(collabID string, amount int) string {
		return dbfx.Insert(t, "crm_settlement", testutil.Cols{
			"workspace_id": workspaceID, "collab_id": collabID, "kind": "final", "amount": amount,
		})
	}
	settlementSales := settlementOf(collabSales, 1000)
	settlementContent := settlementOf(collabContent, 2000)
	settlementNoOwner := settlementOf(collabNoOwner, 3000)

	activityOf := func(owner any, summary string) string {
		return dbfx.Insert(t, "creator_activity", testutil.Cols{
			"workspace_id": workspaceID, "creator_id": creatorID, "kind": "dm",
			"happened_at": "2026-11-10T09:00:00Z", "summary": summary, "owner_member_id": owner,
		})
	}
	activitySales := activityOf(salesUser, "sales follow-up")
	activityContent := activityOf(contentUser, "content follow-up")
	activityNoOwner := activityOf(nil, "unowned follow-up")

	quoteOf := func(owner any, note string) string {
		return dbfx.Insert(t, "creator_quote", testutil.Cols{
			"workspace_id": workspaceID, "creator_id": creatorID, "status": "sent",
			"quoted_at": "2026-11-10T09:00:00Z", "fee_amount": 5000, "note": note,
			"owner_member_id": owner,
		})
	}
	quoteSales := quoteOf(salesUser, "sales offer")
	quoteContent := quoteOf(contentUser, "content offer")
	quoteNoOwner := quoteOf(nil, "unowned offer")

	campaignOf := func(owner any, name string) string {
		return dbfx.Insert(t, "creator_campaign", testutil.Cols{
			"workspace_id": workspaceID, "name": name, "kind": "manual", "owner_member_id": owner,
		})
	}
	campaignSales := campaignOf(salesUser, "sales batch")
	campaignContent := campaignOf(contentUser, "content batch")
	campaignNoOwner := campaignOf(nil, "unowned batch")

	// ---- transparent (the default): every row in the workspace -------------
	bdWantSet(t, "transparent collabs", crmCollabIDs(t, workspaceID, salesUser), []string{
		collabNoOwner, collabContent, collabSales,
	})
	bdWantSet(t, "transparent settlements", crmSettlementIDs(t, workspaceID, salesUser), []string{
		settlementNoOwner, settlementContent, settlementSales,
	})
	bdWantSet(t, "transparent activities", bdActivityIDs(bdListActivities(t, workspaceID, salesUser, "?limit=200")),
		[]string{activityNoOwner, activityContent, activitySales})
	bdWantSet(t, "transparent quotes", bdQuoteIDs(bdListQuotes(t, workspaceID, salesUser, "?limit=200")),
		[]string{quoteNoOwner, quoteContent, quoteSales})
	bdWantSet(t, "transparent campaigns", bdCampaignIDs(bdListCampaigns(t, workspaceID, salesUser, "?limit=200")),
		[]string{campaignNoOwner, campaignContent, campaignSales})

	dbfx.Exec(t, `UPDATE workspace
		SET settings = COALESCE(settings, '{}'::jsonb) || '{"workbench_visibility":"department"}'::jsonb
		WHERE id = $1`, workspaceID)

	// ---- department: only the rows owned inside the caller's department -----
	bdWantIDs(t, "department collabs", crmCollabIDs(t, workspaceID, salesUser), []string{collabSales})
	bdWantIDs(t, "department settlements", crmSettlementIDs(t, workspaceID, salesUser), []string{settlementSales})
	bdWantIDs(t, "department activities", bdActivityIDs(bdListActivities(t, workspaceID, salesUser, "?limit=200")),
		[]string{activitySales})
	bdWantIDs(t, "department quotes", bdQuoteIDs(bdListQuotes(t, workspaceID, salesUser, "?limit=200")),
		[]string{quoteSales})
	bdWantIDs(t, "department campaigns", bdCampaignIDs(bdListCampaigns(t, workspaceID, salesUser, "?limit=200")),
		[]string{campaignSales})

	// The other department sees the mirror image: its own row, and none of the three
	// rows above — in particular not the ownerless ones.
	bdWantIDs(t, "content collabs", crmCollabIDs(t, workspaceID, contentUser), []string{collabContent})
	bdWantIDs(t, "content settlements", crmSettlementIDs(t, workspaceID, contentUser), []string{settlementContent})
	bdWantIDs(t, "content activities", bdActivityIDs(bdListActivities(t, workspaceID, contentUser, "?limit=200")),
		[]string{activityContent})
	bdWantIDs(t, "content quotes", bdQuoteIDs(bdListQuotes(t, workspaceID, contentUser, "?limit=200")),
		[]string{quoteContent})

	// owner/admin keep the whole workspace: the by-id read already exempts them, and a
	// list that disagreed with the rows it can open would be the same bug in the other
	// direction.
	if got := crmCollabIDs(t, workspaceID, ownerUserID); len(got) != 3 {
		t.Fatalf("owner collabs = %v, want all three in department mode", got)
	}

	// A member with no department reads nothing in department mode — never "every
	// department". The envelope is a normal empty page, not a 403.
	departmentlessUser := dbfx.User(t, "Departmentless Member",
		fmt.Sprintf("dept-none-%s@multica.ai", strings.ToLower(strings.NewReplacer("_", "-", "/", "-", " ", "-").Replace(t.Name()))))
	dbfx.Member(t, workspaceID, departmentlessUser, "member")
	if page := bdListQuotes(t, workspaceID, departmentlessUser, "?limit=200"); page.Total != 0 || page.Quotes == nil {
		t.Fatalf("departmentless quotes = %+v, want an empty page with an empty list", page)
	}
	if page := bdListActivities(t, workspaceID, departmentlessUser, "?limit=200"); page.Total != 0 {
		t.Fatalf("departmentless activities = %+v, want an empty page", page)
	}
	if page := bdListCampaigns(t, workspaceID, departmentlessUser, "?limit=200"); page.Total != 0 {
		t.Fatalf("departmentless campaigns = %+v, want an empty page", page)
	}
	if got := crmCollabIDs(t, workspaceID, departmentlessUser); len(got) != 0 {
		t.Fatalf("departmentless collabs = %v, want none", got)
	}
	if got := crmSettlementIDs(t, workspaceID, departmentlessUser); len(got) != 0 {
		t.Fatalf("departmentless settlements = %v, want none", got)
	}
}
