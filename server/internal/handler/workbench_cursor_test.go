package handler

import (
	"net/http"
	"testing"

	"github.com/google/uuid"

	"github.com/jerry-halo2026/morchat.co/server/internal/testutil"
)

// Cursor paging for every workbench list (WORKBENCH-API §3.3).
//
// One contract, checked on every ledger: `?cursor=` names the previous page's last
// row id, `next_cursor` names this page's last row and is present only on a full
// page, following the cursor yields the rest without repeating a row, and a cursor
// that resolves to nothing is a 400 rather than an empty page (an empty page reads
// as "you have reached the end", which is the failure this suite exists to catch).
//
// The shared test workspace holds rows other cases put there, so every assertion is
// about *this* fixture's rows: each of them must appear exactly once across the
// walk. The page-shape rules (full ⇒ cursor, short ⇒ no cursor) are checked on every
// page, which is what makes the walk terminate where the client expects it to.

const cursorLimit = 2

// cursorPage is one decoded page of any workbench list.
type cursorPage struct {
	ids  []string
	next *string
}

// cursorList describes one paged endpoint: where to read it, which chi URL
// parameters the route needs, and the resource key its envelope uses.
type cursorList struct {
	label    string
	resource string
	path     string
	param    string
	value    string
	handler  http.HandlerFunc
}

func (l cursorList) get(t *testing.T, query string) *testutil.Response {
	t.Helper()
	req := workbenchRequest(t, "GET", l.path+query, nil, testUserID)
	if l.param != "" {
		req = withURLParam(req, l.param, l.value)
	}
	return testutil.Call(t, l.handler, req).Want(http.StatusOK)
}

// decodeCursorPage reads the ids and the `next_cursor` of one envelope.
func decodeCursorPage(t *testing.T, res *testutil.Response, resource string) cursorPage {
	t.Helper()
	body := res.Map()
	raw, ok := body[resource]
	if !ok {
		t.Fatalf("response has no %q key: %v", resource, body)
	}
	items, ok := raw.([]any)
	if !ok {
		t.Fatalf("%q is %T, want an array", resource, raw)
	}
	page := cursorPage{ids: make([]string, 0, len(items))}
	for _, item := range items {
		row, ok := item.(map[string]any)
		if !ok {
			t.Fatalf("%q row is %T, want an object", resource, item)
		}
		id, ok := row["id"].(string)
		if !ok {
			t.Fatalf("%q row has no string id: %v", resource, row)
		}
		page.ids = append(page.ids, id)
	}
	token, present := body["next_cursor"]
	if !present {
		t.Fatalf("response has no next_cursor key: %v", body)
	}
	if token != nil {
		text, ok := token.(string)
		if !ok {
			t.Fatalf("next_cursor is %T, want a string or null", token)
		}
		page.next = &text
	}
	return page
}

// walk follows `next_cursor` to the end and returns every id it saw, in order. It
// fails on the two shapes a client cannot survive: a full page with no cursor (the
// walk stops on data that remains) and a short page that still names a successor
// (the walk costs an empty round trip), plus any id that repeats.
func (l cursorList) walk(t *testing.T, base string, limit int) []string {
	t.Helper()
	seen := make(map[string]int)
	var ids []string
	query := base
	for page := 1; page <= 100; page++ {
		got := decodeCursorPage(t, l.get(t, query), l.resource)
		if len(got.ids) == limit && got.next == nil {
			t.Fatalf("%s page %d: %d rows (a full page) with next_cursor null", l.label, page, len(got.ids))
		}
		if len(got.ids) < limit && got.next != nil {
			t.Fatalf("%s page %d: a short page (%d of %d rows) named a successor", l.label, page, len(got.ids), limit)
		}
		for _, id := range got.ids {
			seen[id]++
			if seen[id] > 1 {
				t.Fatalf("%s page %d: row %s repeated across pages", l.label, page, id)
			}
		}
		ids = append(ids, got.ids...)
		if got.next == nil {
			return ids
		}
		query = base + "&cursor=" + *got.next
	}
	t.Fatalf("%s: the walk never ended", l.label)
	return nil
}

// wantPages walks the list and asserts every fixture row is reachable exactly once.
func (l cursorList) wantPages(t *testing.T, base string, rows ...string) []string {
	t.Helper()
	ids := l.walk(t, base, cursorLimit)
	present := make(map[string]bool, len(ids))
	for _, id := range ids {
		present[id] = true
	}
	for _, row := range rows {
		if !present[row] {
			t.Fatalf("%s: row %s was never reached; walked %v", l.label, row, ids)
		}
	}
	return ids
}

// wantOrder asserts the given ids appeared in exactly this relative order, which is
// what a keyset walk over a shared workspace can promise: other cases' rows may sit
// between them, but a page boundary must not reorder this fixture's own.
func wantOrder(t *testing.T, label string, ids []string, want ...string) {
	t.Helper()
	previous := -1
	for _, id := range want {
		at := -1
		for i, got := range ids {
			if got == id {
				at = i
				break
			}
		}
		if at < 0 {
			t.Fatalf("%s: row %s was never reached; walked %v", label, id, ids)
		}
		if at <= previous {
			t.Fatalf("%s: row %s arrived at %d, out of order; walked %v", label, id, at, ids)
		}
		previous = at
	}
}

// wantCursorNotFound asserts a cursor that resolves to nothing is a 400 — not an
// empty page, which a client would draw as the end of the ledger.
func (l cursorList) wantCursorNotFound(t *testing.T, base string) {
	t.Helper()
	req := workbenchRequest(t, "GET", l.path+base+"&cursor="+uuid.NewString(), nil, testUserID)
	if l.param != "" {
		req = withURLParam(req, l.param, l.value)
	}
	testutil.Call(t, l.handler, req).Want(http.StatusBadRequest)
}

// TestCreatorListsPageByCursor covers the creator ledger's three paged lists: the
// post ledger, the drawer's mirrored works (whose `create_time` is nullable, so its
// NULL tail has to stay reachable) and the daily snapshots of one post.
func TestCreatorListsPageByCursor(t *testing.T) {
	creator := createWorkbenchCreator(t, testUserID, "Cursor pages creator")

	posts := []CreatorPostResponse{
		createWorkbenchPost(t, creator.ID, "https://example.test/post/cursor-1"),
		createWorkbenchPost(t, creator.ID, "https://example.test/post/cursor-2"),
		createWorkbenchPost(t, creator.ID, "https://example.test/post/cursor-3"),
	}
	postsList := cursorList{
		label: "creator-posts", resource: "posts",
		path: "/api/workbench/creator-posts", handler: testHandler.ListCreatorPosts,
	}
	base := "?limit=2&creator_id=" + creator.ID
	postsList.wantPages(t, base, posts[0].ID, posts[1].ID, posts[2].ID)
	postsList.wantCursorNotFound(t, base)

	// Three works: two published a day apart, one with no captured date at all. The
	// undated row sorts last (NULLS LAST), and a cursor that lands on a dated row has
	// to keep it reachable instead of truncating the walk at the first NULL.
	publish := func(awemeID string, daysAgo int) string {
		t.Helper()
		id := insertCreatorVideo(t, testWorkspaceID, creator.ID, awemeID, daysAgo)
		t.Cleanup(func() { dbfx.Exec(t, `DELETE FROM creator_video WHERE id = $1`, id) })
		return id
	}
	dated := publish("cursor-aweme-dated", -2)
	untimed := publish("cursor-aweme-untimed", -1)
	dbfx.Exec(t, `UPDATE creator_video SET create_time = NULL WHERE id = $1`, untimed)
	older := publish("cursor-aweme-older", -5)

	videosList := cursorList{
		label: "creator-videos", resource: "videos",
		path:    "/api/workbench/creators/" + creator.ID + "/videos",
		param:   "creatorId", value: creator.ID,
		handler: testHandler.ListCreatorVideos,
	}
	// The walk reaches the undated row *through* the page boundary, which is the
	// property the NULL branch of the predicate exists for.
	videoIDs := videosList.walk(t, "?limit=1&creator_id="+creator.ID, 1)
	// Newest first, and the undated work last: the NULL tail is reached *through* the
	// page boundary, which is what the NULL branch of the predicate is for.
	wantOrder(t, "videos", videoIDs, dated, untimed)
	if last := videoIDs[len(videoIDs)-1]; last != untimed {
		t.Fatalf("videos walk ended on %s, want the undated work %s last", last, untimed)
	}
	if !containsID(videoIDs, older) {
		t.Fatalf("videos walk never reached %s; walked %v", older, videoIDs)
	}
	videosList.wantCursorNotFound(t, "?limit=2")

	post := posts[0]
	snapshot := func(day string, captured string) string {
		t.Helper()
		req := workbenchRequest(t, "POST", "/api/workbench/creator-posts/"+post.ID+"/metrics", map[string]any{
			"captured_on": captured,
			"play":        1000,
		}, testUserID)
		req = withURLParam(req, "postId", post.ID)
		created := testutil.Decode[CreatorPostMetricResponse](t, testHandler.UpsertCreatorPostMetric, req, http.StatusCreated)
		t.Cleanup(func() { dbfx.Exec(t, `DELETE FROM creator_post_metric WHERE id = $1`, created.ID) })
		return created.ID
	}
	metricIDs := []string{
		snapshot("day-1", "2026-11-08"),
		snapshot("day-2", "2026-11-09"),
		snapshot("day-3", "2026-11-10"),
	}
	metricsList := cursorList{
		label: "creator-post-metrics", resource: "metrics",
		path:    "/api/workbench/creator-posts/" + post.ID + "/metrics",
		param:   "postId", value: post.ID,
		handler: testHandler.ListCreatorPostMetrics,
	}
	metricsList.wantPages(t, "?limit=2", metricIDs...)
	metricsList.wantCursorNotFound(t, "?limit=2")
}

// TestCrmListsPageByCursor covers the four CRM ledgers.
func TestCrmListsPageByCursor(t *testing.T) {
	creator := createWorkbenchCreator(t, testUserID, "CRM cursor creator")

	clients := []CrmClientResponse{
		createWorkbenchClient(t, testUserID, "Cursor client 1"),
		createWorkbenchClient(t, testUserID, "Cursor client 2"),
		createWorkbenchClient(t, testUserID, "Cursor client 3"),
	}
	clientsList := cursorList{
		label: "crm-clients", resource: "clients",
		path: "/api/workbench/crm/clients", handler: testHandler.ListCrmClients,
	}
	clientsList.wantPages(t, "?limit=2", clients[0].ID, clients[1].ID, clients[2].ID)
	clientsList.wantCursorNotFound(t, "?limit=2")

	briefs := []CrmBriefResponse{
		createWorkbenchBrief(t, clients[0].ID, "Cursor brief 1"),
		createWorkbenchBrief(t, clients[0].ID, "Cursor brief 2"),
		createWorkbenchBrief(t, clients[0].ID, "Cursor brief 3"),
	}
	briefsList := cursorList{
		label: "crm-briefs", resource: "briefs",
		path: "/api/workbench/crm/briefs", handler: testHandler.ListCrmBriefs,
	}
	briefsList.wantPages(t, "?limit=2", briefs[0].ID, briefs[1].ID, briefs[2].ID)
	briefsList.wantCursorNotFound(t, "?limit=2")

	collabs := make([]CrmCollabResponse, 0, 3)
	settlements := make([]CrmSettlementResponse, 0, 3)
	for _, brief := range briefs {
		collab := createWorkbenchCollab(t, brief.ID, creator.ID, nil)
		collabs = append(collabs, collab)
		settlements = append(settlements, edgeCreateSettlement(t, collab.ID))
	}
	collabsList := cursorList{
		label: "crm-collabs", resource: "collabs",
		path: "/api/workbench/crm/collabs", handler: testHandler.ListCrmCollabs,
	}
	collabsList.wantPages(t, "?limit=2", collabs[0].ID, collabs[1].ID, collabs[2].ID)
	collabsList.wantCursorNotFound(t, "?limit=2")

	settlementsList := cursorList{
		label: "crm-settlements", resource: "settlements",
		path: "/api/workbench/crm/settlements", handler: testHandler.ListCrmSettlements,
	}
	settlementsList.wantPages(t, "?limit=2", settlements[0].ID, settlements[1].ID, settlements[2].ID)
	settlementsList.wantCursorNotFound(t, "?limit=2")
}

// TestBdCampaignListPagesByCursor covers the batch ledger: its order is a start day
// plus a creation timestamp, so the keyset carries both and two batches recorded on
// one day still page apart.
func TestBdCampaignListPagesByCursor(t *testing.T) {
	// Same start day for all three: the order inside the day is the creation
	// timestamp and the id, which is the tie a day-only cursor would repeat.
	campaigns := []BdCampaignResponse{
		bdCreateCampaign(t, testWorkspaceID, testUserID, map[string]any{
			"name": "Cursor campaign 1", "started_on": "2026-11-01",
		}),
		bdCreateCampaign(t, testWorkspaceID, testUserID, map[string]any{
			"name": "Cursor campaign 2", "started_on": "2026-11-01",
		}),
		bdCreateCampaign(t, testWorkspaceID, testUserID, map[string]any{
			"name": "Cursor campaign 3", "started_on": "2026-11-01",
		}),
	}
	campaignsList := cursorList{
		label: "bd-campaigns", resource: "campaigns",
		path: "/api/workbench/bd/campaigns", handler: testHandler.ListBdCampaigns,
	}
	campaignsList.wantPages(t, "?limit=2", campaigns[0].ID, campaigns[1].ID, campaigns[2].ID)
	campaignsList.wantCursorNotFound(t, "?limit=2")
}

// TestAffiliateListsPageByCursor covers products, picks, the daily facts (whose order
// is mixed — newest day, then pick id) and the settlement statements.
func TestAffiliateListsPageByCursor(t *testing.T) {
	product := createAffiliateProductAs(t, map[string]any{
		"ownership": "own_brand", "platform": "douyin",
		"platform_product_id": "cursor-product-shared", "title": "Cursor shared SKU",
	})
	products := []AffiliateProductResponse{product}
	for _, id := range []string{"cursor-product-2", "cursor-product-3"} {
		products = append(products, createAffiliateProductAs(t, map[string]any{
			"ownership": "own_brand", "platform": "douyin",
			"platform_product_id": id, "title": "Cursor SKU " + id,
		}))
	}
	productsList := cursorList{
		label: "affiliate-products", resource: "products",
		path: "/api/workbench/affiliate/products", handler: testHandler.ListAffiliateProducts,
	}
	productsList.wantPages(t, "?limit=2", products[0].ID, products[1].ID, products[2].ID)
	productsList.wantCursorNotFound(t, "?limit=2")

	creator := createWorkbenchCreator(t, testUserID, "Affiliate cursor creator")
	// One pick per product: a pick is unique per (product, creator), and the daily
	// facts below hang off them.
	picks := make([]AffiliatePickResponse, 0, 3)
	for _, row := range products {
		pick := createAffiliatePickAs(t, map[string]any{
			"product_id": row.ID, "creator_id": creator.ID, "commission_rate": 0.2,
		})
		picks = append(picks, pick)
	}
	picksList := cursorList{
		label: "affiliate-picks", resource: "picks",
		path: "/api/workbench/affiliate/picks", handler: testHandler.ListAffiliatePicks,
	}
	picksList.wantPages(t, "?limit=2", picks[0].ID, picks[1].ID, picks[2].ID)
	picksList.wantCursorNotFound(t, "?limit=2")

	// Three days of facts for one pick, so the mixed order (day desc, pick asc) has
	// to carry both keys through the page boundary.
	days := make([]string, 0, 3)
	for _, day := range []string{"2026-11-01", "2026-11-02", "2026-11-03"} {
		daily := putAffiliateDaily(t, picks[0].ID, day, map[string]any{"gmv_amount": 100})
		t.Cleanup(func() { dbfx.Exec(t, `DELETE FROM affiliate_daily WHERE id = $1`, daily.ID) })
		days = append(days, daily.ID)
	}
	dailyList := cursorList{
		label: "affiliate-daily", resource: "daily",
		path: "/api/workbench/affiliate/daily", handler: testHandler.ListAffiliateDaily,
	}
	dailyList.wantPages(t, "?limit=2&pick_id="+picks[0].ID, days...)
	dailyList.wantCursorNotFound(t, "?limit=2")

	settlements := make([]AffiliateSettlementResponse, 0, 3)
	for _, period := range [][2]string{
		{"2026-09-01", "2026-09-30"},
		{"2026-10-01", "2026-10-31"},
		{"2026-11-01", "2026-11-30"},
	} {
		settlements = append(settlements, createAffiliateSettlementAs(t, map[string]any{
			"period_start": period[0], "period_end": period[1],
			"gross_commission": 1000, "net_amount": 900,
		}))
	}
	settlementsList := cursorList{
		label: "affiliate-settlements", resource: "settlements",
		path: "/api/workbench/affiliate/settlements", handler: testHandler.ListAffiliateSettlements,
	}
	settlementsList.wantPages(t, "?limit=2", settlements[0].ID, settlements[1].ID, settlements[2].ID)
	settlementsList.wantCursorNotFound(t, "?limit=2")
}

// TestMediaListsPageByCursor covers the six content boards. The hotspot radar is the
// interesting one: three captures on one day share their whole sort key but the id,
// and a day-keyed cursor that forgot the id would repeat one of them forever.
func TestMediaListsPageByCursor(t *testing.T) {
	ips := []MediaIPResponse{
		mediaIPFixture(t, testUserID, "Cursor IP 1"),
		mediaIPFixture(t, testUserID, "Cursor IP 2"),
		mediaIPFixture(t, testUserID, "Cursor IP 3"),
	}
	ipsList := cursorList{
		label: "media-ips", resource: "ips",
		path: "/api/workbench/media/ips", handler: testHandler.ListMediaIPs,
	}
	ipsList.wantPages(t, "?limit=2", ips[0].ID, ips[1].ID, ips[2].ID)
	ipsList.wantCursorNotFound(t, "?limit=2")

	ip := ips[0]
	topics := []MediaTopicResponse{
		mediaTopicFixture(t, testUserID, ip.ID, "Cursor topic 1"),
		mediaTopicFixture(t, testUserID, ip.ID, "Cursor topic 2"),
		mediaTopicFixture(t, testUserID, ip.ID, "Cursor topic 3"),
	}
	topicsList := cursorList{
		label: "media-topics", resource: "topics",
		path: "/api/workbench/media/topics", handler: testHandler.ListMediaTopics,
	}
	topicsList.wantPages(t, "?limit=2&ip_id="+ip.ID, topics[0].ID, topics[1].ID, topics[2].ID)
	topicsList.wantCursorNotFound(t, "?limit=2")

	topic := topics[0]
	scripts := []MediaScriptResponse{
		mediaScriptFixture(t, testUserID, topic.ID, "第一版脚本"),
		mediaScriptFixture(t, testUserID, topic.ID, "第二版脚本"),
		mediaScriptFixture(t, testUserID, topic.ID, "第三版脚本"),
	}
	scriptsList := cursorList{
		label: "media-scripts", resource: "scripts",
		path: "/api/workbench/media/scripts", handler: testHandler.ListMediaScripts,
	}
	scriptsList.wantPages(t, "?limit=2&topic_id="+topic.ID, scripts[0].ID, scripts[1].ID, scripts[2].ID)
	scriptsList.wantCursorNotFound(t, "?limit=2")

	// The calendar reads forward, so its cursor pages toward *later* days.
	shoots := []MediaShootResponse{
		mediaShootFixture(t, testUserID, scripts[0].ID, "2026-11-01"),
		mediaShootFixture(t, testUserID, scripts[0].ID, "2026-11-02"),
		mediaShootFixture(t, testUserID, scripts[0].ID, "2026-11-03"),
	}
	shootsList := cursorList{
		label: "media-shoots", resource: "shoots",
		path: "/api/workbench/media/shoots", handler: testHandler.ListMediaShoots,
	}
	shootsList.wantPages(t, "?limit=2&script_id="+scripts[0].ID, shoots[0].ID, shoots[1].ID, shoots[2].ID)
	shootsList.wantCursorNotFound(t, "?limit=2")

	// Three captures on one day: the day is the same, the id is the whole tiebreak.
	hot := make([]MediaHotResponse, 0, 3)
	for _, title := range []string{"Cursor hot 1", "Cursor hot 2", "Cursor hot 3"} {
		row := mediaHotFixture(t, testUserID, title)
		dbfx.Exec(t, `UPDATE media_hot SET captured_on = DATE '2026-11-18' WHERE id = $1`, row.ID)
		hot = append(hot, row)
	}
	hotList := cursorList{
		label: "media-hot", resource: "hot",
		path: "/api/workbench/media/hot", handler: testHandler.ListMediaHot,
	}
	hotList.wantPages(t, "?limit=2&captured_on=2026-11-18", hot[0].ID, hot[1].ID, hot[2].ID)
	hotList.wantCursorNotFound(t, "?limit=2")

	bench := []MediaBenchResponse{
		mediaBenchFixture(t, testUserID, ip.ID, "Cursor bench 1"),
		mediaBenchFixture(t, testUserID, ip.ID, "Cursor bench 2"),
		mediaBenchFixture(t, testUserID, ip.ID, "Cursor bench 3"),
	}
	benchList := cursorList{
		label: "media-bench", resource: "bench",
		path: "/api/workbench/media/bench", handler: testHandler.ListMediaBench,
	}
	benchList.wantPages(t, "?limit=2", bench[0].ID, bench[1].ID, bench[2].ID)
	benchList.wantCursorNotFound(t, "?limit=2")
}

// TestGoalAndSignalListsPageByCursor covers the goal board (cycle, then creation) and
// the radar. The radar is the NULL case of the whole convention: `score` is nullable
// and sorts last, so the walk has to cross a page boundary that lands on an unscored
// signal and still reach the older unscored one behind it.
func TestGoalAndSignalListsPageByCursor(t *testing.T) {
	goals := []GoalResponse{
		goalFixture(t, testUserID, "2026-Q4", "Cursor goal 1"),
		goalFixture(t, testUserID, "2026-Q4", "Cursor goal 2"),
		goalFixture(t, testUserID, "2026-Q3", "Cursor goal 3"),
	}
	goalsList := cursorList{
		label: "goals", resource: "goals",
		path: "/api/workbench/goals", handler: testHandler.ListGoals,
	}
	goalsList.wantPages(t, "?limit=2", goals[0].ID, goals[1].ID, goals[2].ID)
	goalsList.wantCursorNotFound(t, "?limit=2")

	// Three hot signals: the newest is scored, the two older ones carry no score and
	// are therefore the tail of the order.
	scored := marketSignalFixture(t, testUserID, "Cursor signal scored")
	unscoredNewer := marketSignalFixture(t, testUserID, "Cursor signal unscored newer")
	unscoredOlder := marketSignalFixture(t, testUserID, "Cursor signal unscored older")
	for _, row := range []MarketSignalResponse{unscoredNewer, unscoredOlder} {
		dbfx.Exec(t, `UPDATE market_signal SET cut = 'hot', score = NULL WHERE id = $1`, row.ID)
	}
	dbfx.Exec(t, `UPDATE market_signal SET cut = 'hot', score = 42 WHERE id = $1`, scored.ID)

	signalsList := cursorList{
		label: "signals", resource: "signals",
		path: "/api/workbench/signals", handler: testHandler.ListMarketSignals,
	}
	// A page of one row: page 2 is the first unscored signal, so its cursor carries a
	// NULL score, and the third page has to be the other unscored row rather than an
	// empty page.
	ids := signalsList.walk(t, "?limit=1&cut=hot", 1)
	// The scored signal leads, both unscored ones follow it, and each of them was
	// reached *through* a page boundary — that is the NULL tail of the order, which is
	// the branch a keyset predicate gets wrong by dropping every NULL row behind the
	// cursor. The two unscored rows share `created_at`, so their order is the id
	// tiebreak and the walk is what proves it does not repeat one of them.
	if len(ids) < 3 {
		t.Fatalf("signals walk stopped at %v, want the scored signal and both NULL tail rows", ids)
	}
	if ids[0] != scored.ID {
		t.Fatalf("signals walk started on %s, want the scored signal %s first", ids[0], scored.ID)
	}
	wantOrder(t, "signals", ids, scored.ID)
	for _, want := range []string{unscoredNewer.ID, unscoredOlder.ID} {
		if !containsID(ids[1:], want) {
			t.Fatalf("signals walk never reached the NULL tail row %s; walked %v", want, ids)
		}
	}
	signalsList.wantCursorNotFound(t, "?limit=2")
}

// TestHrListsPageByCursor covers the HR ledgers: the recruiting four, the roster, the
// question bank and its guides, the change stream, the rewards tab, the exit records
// and one employee's generated documents.
func TestHrListsPageByCursor(t *testing.T) {
	reviewer := workbenchTestMember(t)

	jobs := []HrJobResponse{
		createHrJobFixture(t, testUserID, "Cursor job 1"),
		createHrJobFixture(t, testUserID, "Cursor job 2"),
		createHrJobFixture(t, testUserID, "Cursor job 3"),
	}
	jobsList := cursorList{
		label: "hr-jobs", resource: "jobs",
		path: "/api/workbench/hr/jobs", handler: testHandler.ListHrJobs,
	}
	jobsList.wantPages(t, "?limit=2", jobs[0].ID, jobs[1].ID, jobs[2].ID)
	jobsList.wantCursorNotFound(t, "?limit=2")

	candidates := []HrCandidateResponse{
		createHrCandidateFixture(t, jobs[0].ID, "Cursor candidate 1", "13800000001"),
		createHrCandidateFixture(t, jobs[0].ID, "Cursor candidate 2", "13800000002"),
		createHrCandidateFixture(t, jobs[0].ID, "Cursor candidate 3", "13800000003"),
	}
	candidatesList := cursorList{
		label: "hr-candidates", resource: "candidates",
		path: "/api/workbench/hr/candidates", handler: testHandler.ListHrCandidates,
	}
	candidatesList.wantPages(t, "?limit=2&job_id="+jobs[0].ID,
		candidates[0].ID, candidates[1].ID, candidates[2].ID)
	candidatesList.wantCursorNotFound(t, "?limit=2&job_id="+jobs[0].ID)

	interviews := []HrInterviewResponse{
		createHrInterviewFixture(t, candidates[0].ID, reviewer, "2026-11-20T09:00:00Z", http.StatusCreated),
		createHrInterviewFixture(t, candidates[0].ID, reviewer, "2026-11-21T09:00:00Z", http.StatusCreated),
		createHrInterviewFixture(t, candidates[0].ID, reviewer, "2026-11-22T09:00:00Z", http.StatusCreated),
	}
	interviewsList := cursorList{
		label: "hr-interviews", resource: "interviews",
		path: "/api/workbench/hr/interviews", handler: testHandler.ListHrInterviews,
	}
	interviewsList.wantPages(t, "?limit=2&candidate_id="+candidates[0].ID,
		interviews[0].ID, interviews[1].ID, interviews[2].ID)
	interviewsList.wantCursorNotFound(t, "?limit=2")

	for _, interview := range interviews {
		t.Cleanup(func() { dbfx.Exec(t, `DELETE FROM hr_scorecard WHERE interview_id = $1`, interview.ID) })
	}
	scorecards := make([]HrScorecardResponse, 0, 3)
	for _, interview := range interviews {
		req := workbenchRequest(t, "POST", "/api/workbench/hr/scorecards", map[string]any{
			"interview_id":       interview.ID,
			"reviewer_member_id": reviewer,
			"score_skill":        4,
			"verdict":            "yes",
		}, testUserID)
		scorecards = append(scorecards,
			testutil.Decode[HrScorecardResponse](t, testHandler.CreateHrScorecard, req, http.StatusCreated))
	}
	scorecardsList := cursorList{
		label: "hr-scorecards", resource: "scorecards",
		path: "/api/workbench/hr/scorecards", handler: testHandler.ListHrScorecards,
	}
	// One card per interview, so the list is read across them rather than filtered to
	// one round.
	scorecardsList.wantPages(t, "?limit=2", scorecards[0].ID, scorecards[1].ID, scorecards[2].ID)
	scorecardsList.wantCursorNotFound(t, "?limit=2")

	employees := []HrEmployeeProfileResponse{
		createRewardEmployeeFixture(t, "cursor-a", testUserID),
		createRewardEmployeeFixture(t, "cursor-b", testUserID),
		createRewardEmployeeFixture(t, "cursor-c", testUserID),
	}
	employeesList := cursorList{
		label: "hr-employees", resource: "employees",
		path: "/api/workbench/hr/employees", handler: testHandler.ListHrEmployees,
	}
	employeesList.wantPages(t, "?limit=2", employees[0].ID, employees[1].ID, employees[2].ID)
	employeesList.wantCursorNotFound(t, "?limit=2")

	// The change stream and the rewards tab page on (day, created_at, id): three rows
	// entered for one person on one day share the whole key but the timestamp and id.
	employee := employees[0]
	changes := make([]HrEmployeeChangeResponse, 0, 3)
	rewards := make([]HrEmployeeRewardResponse, 0, 3)
	for i := 0; i < 3; i++ {
		req := workbenchRequest(t, "POST", "/api/workbench/hr/changes", map[string]any{
			"employee_id":  employee.ID,
			"kind":         "salary",
			"effective_on": "2026-07-01",
			"from_amount":  20000,
			"to_amount":    24000,
			"currency":     "CNY",
			"note":         "cursor change",
		}, testUserID)
		changes = append(changes,
			testutil.Decode[HrEmployeeChangeResponse](t, testHandler.CreateHrEmployeeChange, req, http.StatusCreated))
		rewards = append(rewards, createReward(t, testUserID, map[string]any{
			"employee_id": employee.ID,
			"kind":        "reward",
			"reason":      "cursor reward",
			"decided_on":  "2026-07-01",
		}))
	}
	t.Cleanup(func() {
		for _, id := range changes {
			dbfx.Exec(t, `DELETE FROM hr_employee_change WHERE id = $1`, id.ID)
		}
	})
	t.Cleanup(func() {
		for _, id := range rewards {
			dbfx.Exec(t, `DELETE FROM hr_employee_reward WHERE id = $1`, id.ID)
		}
	})

	changesList := cursorList{
		label: "hr-changes", resource: "changes",
		path: "/api/workbench/hr/changes", handler: testHandler.ListHrEmployeeChanges,
	}
	changesList.wantPages(t, "?limit=2&employee_id="+employee.ID, changes[0].ID, changes[1].ID, changes[2].ID)
	changesList.wantCursorNotFound(t, "?limit=2&employee_id="+employee.ID)

	rewardsList := cursorList{
		label: "hr-rewards", resource: "rewards",
		path: "/api/workbench/hr/rewards", handler: testHandler.ListHrEmployeeRewards,
	}
	rewardsList.wantPages(t, "?limit=2&employee_id="+employee.ID, rewards[0].ID, rewards[1].ID, rewards[2].ID)
	rewardsList.wantCursorNotFound(t, "?limit=2&employee_id="+employee.ID)

	questions := []HrQuestionResponse{
		createHrQuestionFixture(t, "Cursor question 1", nil),
		createHrQuestionFixture(t, "Cursor question 2", nil),
		createHrQuestionFixture(t, "Cursor question 3", nil),
	}
	questionsList := cursorList{
		label: "hr-questions", resource: "questions",
		path: "/api/workbench/hr/questions", handler: testHandler.ListHrQuestions,
	}
	questionsList.wantPages(t, "?limit=2", questions[0].ID, questions[1].ID, questions[2].ID)
	questionsList.wantCursorNotFound(t, "?limit=2")

	guides := make([]HrGuideResponse, 0, 3)
	for round := 1; round <= 3; round++ {
		guides = append(guides, createHrGuideFixture(t, candidates[1].ID, round,
			[]HrGuideItem{guideSnapshotItem("skill", "讲一个你重构过的模块", "结构化")}, http.StatusCreated))
	}
	guidesList := cursorList{
		label: "hr-guides", resource: "guides",
		path: "/api/workbench/hr/guides", handler: testHandler.ListHrInterviewGuides,
	}
	guidesList.wantPages(t, "?limit=2&candidate_id="+candidates[1].ID, guides[0].ID, guides[1].ID, guides[2].ID)
	guidesList.wantCursorNotFound(t, "?limit=2&candidate_id="+candidates[1].ID)

	offboardings := make([]HrOffboardingResponse, 0, 3)
	for _, row := range employees {
		offboardings = append(offboardings, createHrOffboardingFixture(t, row.ID, nil, http.StatusCreated))
	}
	offboardingsList := cursorList{
		label: "hr-offboardings", resource: "offboardings",
		path: "/api/workbench/hr/offboardings", handler: testHandler.ListHrOffboardings,
	}
	offboardingsList.wantPages(t, "?limit=2",
		offboardings[0].ID, offboardings[1].ID, offboardings[2].ID)
	offboardingsList.wantCursorNotFound(t, "?limit=2")

	// Generated documents: the ledger only joins the attachment, so the rows go in
	// directly and the read order is all this list is about.
	documents := make([]string, 0, 3)
	for _, name := range []string{"Cursor doc 1", "Cursor doc 2", "Cursor doc 3"} {
		var id string
		dbfx.QueryRow(t, `
			INSERT INTO hr_doc_generation (
				workspace_id, employee_id, template_name, format, values
			) VALUES ($1, $2, $3, 'docx', '{}'::jsonb)
			RETURNING id::text`, testWorkspaceID, employee.ID, name).Scan(&id)
		documents = append(documents, id)
	}
	t.Cleanup(func() {
		for _, id := range documents {
			dbfx.Exec(t, `DELETE FROM hr_doc_generation WHERE id = $1`, id)
		}
	})
	documentsList := cursorList{
		label: "hr-employee-documents", resource: "documents",
		path:    "/api/workbench/hr/employees/" + employee.ID + "/documents",
		param:   "employeeId", value: employee.ID,
		handler: testHandler.ListHrEmployeeDocuments,
	}
	documentsList.wantPages(t, "?limit=2", documents...)
	documentsList.wantCursorNotFound(t, "?limit=2")
}
