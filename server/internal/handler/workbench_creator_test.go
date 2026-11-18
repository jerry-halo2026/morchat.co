package handler

import (
	"fmt"
	"net/http"
	"strings"
	"sync"
	"testing"

	"github.com/jerry-halo2026/morchat.co/server/internal/events"
	"github.com/jerry-halo2026/morchat.co/server/internal/testutil"
)

// Workbench ledger tests. Three things every domain in this package has to prove
// (docs/engineering/WORKBENCH-API.md §3):
//
//   - any workspace member can read, so the ledger is not an ACL;
//   - writes follow "owner/admin write everything, a member writes only its own
//     rows" — the case below is the one that used to be missing;
//   - a successful write publishes the domain's `:changed` event, which is what
//     makes other clients' lists and the overview strip refetch.

// workbenchEvents records the payloads of the workbench events a test subscribes
// to. The bus is synchronous today, so reading after the call is deterministic;
// the mutex only protects against a future async listener.
type workbenchEvents struct {
	mu     sync.Mutex
	byType map[string][]map[string]any
}

func collectWorkbenchEvents(t *testing.T, eventTypes ...string) *workbenchEvents {
	t.Helper()
	collector := &workbenchEvents{byType: make(map[string][]map[string]any, len(eventTypes))}
	for _, eventType := range eventTypes {
		eventType := eventType
		testHandler.Bus.Subscribe(eventType, func(e events.Event) {
			payload, ok := e.Payload.(map[string]any)
			if !ok {
				return
			}
			collector.mu.Lock()
			collector.byType[eventType] = append(collector.byType[eventType], payload)
			collector.mu.Unlock()
		})
	}
	return collector
}

func (c *workbenchEvents) count(eventType string) int {
	c.mu.Lock()
	defer c.mu.Unlock()
	return len(c.byType[eventType])
}

func (c *workbenchEvents) last(eventType string) map[string]any {
	c.mu.Lock()
	defer c.mu.Unlock()
	entries := c.byType[eventType]
	if len(entries) == 0 {
		return nil
	}
	return entries[len(entries)-1]
}

// workbenchTestMember joins a fresh user to the test workspace with the `member`
// role — the role that is allowed to read everything and write only its own rows.
func workbenchTestMember(t *testing.T) string {
	t.Helper()
	suffix := strings.NewReplacer("_", "-", "/", "-").Replace(strings.ToLower(t.Name()))
	userID := dbfx.User(t, "Workbench Member", fmt.Sprintf("wb-member-%s@multica.ai", suffix))
	dbfx.Member(t, testWorkspaceID, userID, "member")
	return userID
}

// workbenchRequest builds a request that acts as userID (empty means the
// workspace owner the suite is set up as).
func workbenchRequest(t *testing.T, method, path string, body any, userID string) *http.Request {
	t.Helper()
	req := newRequest(method, path, body)
	if userID != "" {
		req.Header.Set("X-User-ID", userID)
	}
	return req
}

// createWorkbenchCreator creates a creator owned by ownerUserID through the
// handler, registers its cleanup and returns the response.
func createWorkbenchCreator(t *testing.T, ownerUserID, displayName string) CreatorResponse {
	t.Helper()
	body := map[string]any{
		"kind":         "external",
		"display_name": displayName,
		"platform":     "douyin",
		"handle":       strings.NewReplacer(" ", "-").Replace(strings.ToLower(displayName)),
	}
	if ownerUserID != "" {
		body["owner_member_id"] = ownerUserID
	}
	req := workbenchRequest(t, "POST", "/api/workbench/creators", body, ownerUserID)
	created := testutil.Decode[CreatorResponse](t, testHandler.CreateCreator, req, http.StatusCreated)
	t.Cleanup(func() { dbfx.Exec(t, `DELETE FROM creator WHERE id = $1`, created.ID) })
	return created
}

// TestCreatorReadIsMemberWideAndWriteIsOwnerScoped covers the read/write split
// for the creator ledger: a plain member reads another member's creator but
// cannot change it, while an owner can.
func TestCreatorReadIsMemberWideAndWriteIsOwnerScoped(t *testing.T) {
	memberUserID := workbenchTestMember(t)
	creator := createWorkbenchCreator(t, testUserID, "Creator permission fixture")

	// Read: a plain member sees the owner's creator.
	req := workbenchRequest(t, "GET", "/api/workbench/creators/"+creator.ID, nil, memberUserID)
	req = withURLParam(req, "creatorId", creator.ID)
	got := testutil.Decode[CreatorResponse](t, testHandler.GetCreator, req, http.StatusOK)
	if got.ID != creator.ID {
		t.Fatalf("GetCreator as member returned %s, want %s", got.ID, creator.ID)
	}

	// Write: rejected for a row the member does not own.
	req = workbenchRequest(t, "PATCH", "/api/workbench/creators/"+creator.ID, map[string]any{
		"display_name": "Renamed by a non-owner",
	}, memberUserID)
	req = withURLParam(req, "creatorId", creator.ID)
	testutil.Call(t, testHandler.UpdateCreator, req).Want(http.StatusForbidden)

	// Write: allowed for the owner, and it publishes creator:changed.
	events := collectWorkbenchEvents(t, eventCreatorChanged)
	req = workbenchRequest(t, "PATCH", "/api/workbench/creators/"+creator.ID, map[string]any{
		"display_name": "Renamed by the owner",
		"score":        4,
	}, testUserID)
	req = withURLParam(req, "creatorId", creator.ID)
	updated := testutil.Decode[CreatorResponse](t, testHandler.UpdateCreator, req, http.StatusOK)
	if updated.DisplayName != "Renamed by the owner" {
		t.Fatalf("display_name = %q, want the patched value", updated.DisplayName)
	}
	if updated.Score == nil || *updated.Score != 4 {
		t.Fatalf("score = %v, want 4", updated.Score)
	}
	if events.count(eventCreatorChanged) != 1 {
		t.Fatalf("creator:changed published %d times, want 1", events.count(eventCreatorChanged))
	}
	if payload := events.last(eventCreatorChanged); payload == nil || payload["id"] != creator.ID {
		t.Fatalf("creator:changed payload = %v, want id %s", payload, creator.ID)
	}

	// Delete: a member cannot archive someone else's creator; the owner can, and
	// the row disappears from the list.
	req = workbenchRequest(t, "DELETE", "/api/workbench/creators/"+creator.ID, nil, memberUserID)
	req = withURLParam(req, "creatorId", creator.ID)
	testutil.Call(t, testHandler.DeleteCreator, req).Want(http.StatusForbidden)

	req = workbenchRequest(t, "DELETE", "/api/workbench/creators/"+creator.ID, nil, testUserID)
	req = withURLParam(req, "creatorId", creator.ID)
	testutil.Call(t, testHandler.DeleteCreator, req).Want(http.StatusNoContent)

	req = workbenchRequest(t, "GET", "/api/workbench/creators/"+creator.ID, nil, testUserID)
	req = withURLParam(req, "creatorId", creator.ID)
	testutil.Call(t, testHandler.GetCreator, req).Want(http.StatusNotFound)
}

// TestCreateCreatorAsMemberOwnsTheRow covers the create-side rule: a member
// cannot hand a new row to someone else, and the row it creates is its own.
func TestCreateCreatorAsMemberOwnsTheRow(t *testing.T) {
	memberUserID := workbenchTestMember(t)

	req := workbenchRequest(t, "POST", "/api/workbench/creators", map[string]any{
		"display_name":    "Member owned creator",
		"platform":        "xiaohongshu",
		"handle":          "member-owned",
		"owner_member_id": testUserID,
	}, memberUserID)
	testutil.Call(t, testHandler.CreateCreator, req).Want(http.StatusForbidden)

	req = workbenchRequest(t, "POST", "/api/workbench/creators", map[string]any{
		"display_name": "Member owned creator",
		"platform":     "xiaohongshu",
		"handle":       "member-owned",
	}, memberUserID)
	created := testutil.Decode[CreatorResponse](t, testHandler.CreateCreator, req, http.StatusCreated)
	t.Cleanup(func() { dbfx.Exec(t, `DELETE FROM creator WHERE id = $1`, created.ID) })
	if created.OwnerMemberID == nil || *created.OwnerMemberID != memberUserID {
		t.Fatalf("owner_member_id = %v, want the creating member %s", created.OwnerMemberID, memberUserID)
	}

	// The member may then change that row.
	req = workbenchRequest(t, "PATCH", "/api/workbench/creators/"+created.ID, map[string]any{
		"display_name": "Member renamed its own creator",
	}, memberUserID)
	req = withURLParam(req, "creatorId", created.ID)
	testutil.Call(t, testHandler.UpdateCreator, req).Want(http.StatusOK)
}

// TestCreatorDuplicatePlatformHandleConflicts guards the UNIQUE
// (workspace, platform, handle) constraint surfacing as a 409 rather than a 500.
func TestCreatorDuplicatePlatformHandleConflicts(t *testing.T) {
	first := createWorkbenchCreator(t, testUserID, "Duplicate handle fixture")
	req := workbenchRequest(t, "POST", "/api/workbench/creators", map[string]any{
		"display_name": "Duplicate handle fixture",
		"platform":     first.Platform,
		"handle":       first.Handle,
	}, testUserID)
	testutil.Call(t, testHandler.CreateCreator, req).Want(http.StatusConflict)
}

// createWorkbenchPost creates a post for creatorID through the handler and
// returns it.
func createWorkbenchPost(t *testing.T, creatorID, url string) CreatorPostResponse {
	t.Helper()
	req := workbenchRequest(t, "POST", "/api/workbench/creator-posts", map[string]any{
		"creator_id":   creatorID,
		"platform":     "douyin",
		"url":          url,
		"published_at": "2026-11-10T09:00:00Z",
	}, "")
	created := testutil.Decode[CreatorPostResponse](t, testHandler.CreateCreatorPost, req, http.StatusCreated)
	t.Cleanup(func() { dbfx.Exec(t, `DELETE FROM creator_post WHERE id = $1`, created.ID) })
	return created
}

// TestCreatorPostAndDailyMetric covers the post ledger and its daily snapshots,
// including the upsert key: re-posting the same (post, day) rewrites the row
// instead of appending a duplicate observation.
func TestCreatorPostAndDailyMetric(t *testing.T) {
	memberUserID := workbenchTestMember(t)
	creator := createWorkbenchCreator(t, testUserID, "Post fixture creator")

	events := collectWorkbenchEvents(t, eventCreatorPostChanged)
	post := createWorkbenchPost(t, creator.ID, "https://example.test/post/1")
	if events.count(eventCreatorPostChanged) != 1 {
		t.Fatalf("creator_post:changed published %d times, want 1", events.count(eventCreatorPostChanged))
	}
	payload := events.last(eventCreatorPostChanged)
	if payload == nil || payload["id"] != post.ID || payload["creator_id"] != creator.ID {
		t.Fatalf("creator_post:changed payload = %v, want id %s attached to %s", payload, post.ID, creator.ID)
	}

	// A member cannot post for a creator it does not own.
	req := workbenchRequest(t, "POST", "/api/workbench/creator-posts", map[string]any{
		"creator_id":   creator.ID,
		"platform":     "douyin",
		"url":          "https://example.test/post/2",
		"published_at": "2026-11-11T09:00:00Z",
	}, memberUserID)
	testutil.Call(t, testHandler.CreateCreatorPost, req).Want(http.StatusForbidden)

	// A foreign creator id is rejected as a broken relationship, not stored.
	req = workbenchRequest(t, "POST", "/api/workbench/creator-posts", map[string]any{
		"creator_id":   "00000000-0000-0000-0000-000000000000",
		"platform":     "douyin",
		"url":          "https://example.test/post/3",
		"published_at": "2026-11-11T09:00:00Z",
	}, testUserID)
	testutil.Call(t, testHandler.CreateCreatorPost, req).Want(http.StatusBadRequest)

	// Snapshot: first write creates, second write for the same day updates.
	snapshotBody := map[string]any{
		"captured_on": "2026-11-10",
		"play":        1000,
		"gmv_amount":  1200.5,
	}
	req = workbenchRequest(t, "POST", "/api/workbench/creator-posts/"+post.ID+"/metrics", snapshotBody, testUserID)
	req = withURLParam(req, "postId", post.ID)
	first := testutil.Decode[CreatorPostMetricResponse](t, testHandler.UpsertCreatorPostMetric, req, http.StatusCreated)
	t.Cleanup(func() { dbfx.Exec(t, `DELETE FROM creator_post_metric WHERE id = $1`, first.ID) })
	if first.Play == nil || *first.Play != 1000 {
		t.Fatalf("play = %v, want 1000", first.Play)
	}
	if first.GMVAmount == nil || *first.GMVAmount != 1200.5 {
		t.Fatalf("gmv_amount = %v, want 1200.5", first.GMVAmount)
	}
	if first.CapturedOn != "2026-11-10" {
		t.Fatalf("captured_on = %q, want 2026-11-10", first.CapturedOn)
	}

	snapshotBody["play"] = 1500
	req = workbenchRequest(t, "POST", "/api/workbench/creator-posts/"+post.ID+"/metrics", snapshotBody, testUserID)
	req = withURLParam(req, "postId", post.ID)
	second := testutil.Decode[CreatorPostMetricResponse](t, testHandler.UpsertCreatorPostMetric, req, http.StatusCreated)
	if second.ID != first.ID {
		t.Fatalf("second snapshot created a new row (%s -> %s); (post_id, captured_on) must upsert", first.ID, second.ID)
	}
	if second.Play == nil || *second.Play != 1500 {
		t.Fatalf("upserted play = %v, want 1500", second.Play)
	}

	req = workbenchRequest(t, "GET", "/api/workbench/creator-posts/"+post.ID+"/metrics", nil, memberUserID)
	req = withURLParam(req, "postId", post.ID)
	var list struct {
		Metrics []CreatorPostMetricResponse `json:"metrics"`
		Total   int                         `json:"total"`
	}
	testutil.Call(t, testHandler.ListCreatorPostMetrics, req).Want(http.StatusOK).JSON(&list)
	if list.Total != 1 {
		t.Fatalf("metrics total = %d, want 1 row for one captured day", list.Total)
	}

	// A member cannot write a snapshot for a post it does not own.
	req = workbenchRequest(t, "POST", "/api/workbench/creator-posts/"+post.ID+"/metrics", snapshotBody, memberUserID)
	req = withURLParam(req, "postId", post.ID)
	testutil.Call(t, testHandler.UpsertCreatorPostMetric, req).Want(http.StatusForbidden)

	// Archive the post: the list for that creator no longer returns it.
	req = workbenchRequest(t, "DELETE", "/api/workbench/creator-posts/"+post.ID, nil, testUserID)
	req = withURLParam(req, "postId", post.ID)
	testutil.Call(t, testHandler.DeleteCreatorPost, req).Want(http.StatusNoContent)

	req = workbenchRequest(t, "GET", "/api/workbench/creator-posts?creator_id="+creator.ID, nil, testUserID)
	var posts struct {
		Posts []CreatorPostResponse `json:"posts"`
	}
	testutil.Call(t, testHandler.ListCreatorPosts, req).Want(http.StatusOK).JSON(&posts)
	for _, candidate := range posts.Posts {
		if candidate.ID == post.ID {
			t.Fatalf("archived post %s still listed", post.ID)
		}
	}
}

// TestListCreatorsPagesByCursor keeps the keyset contract honest: a page is
// capped, and the cursor returned as the last id resumes without repeating it.
func TestListCreatorsPagesByCursor(t *testing.T) {
	first := createWorkbenchCreator(t, testUserID, "Cursor page A")
	second := createWorkbenchCreator(t, testUserID, "Cursor page B")

	req := workbenchRequest(t, "GET", "/api/workbench/creators?limit=1", nil, testUserID)
	var page struct {
		Creators []CreatorResponse `json:"creators"`
		Total    int               `json:"total"`
	}
	testutil.Call(t, testHandler.ListCreators, req).Want(http.StatusOK).JSON(&page)
	if page.Total != 1 || len(page.Creators) != 1 {
		t.Fatalf("page = %d rows, want 1", len(page.Creators))
	}

	// The ordering is the default `fans DESC`; whichever row came back, the
	// cursor must move past it.
	cursor := page.Creators[0].ID
	req = workbenchRequest(t, "GET", "/api/workbench/creators?limit=10&cursor="+cursor, nil, testUserID)
	testutil.Call(t, testHandler.ListCreators, req).Want(http.StatusOK).JSON(&page)
	for _, candidate := range page.Creators {
		if candidate.ID == cursor {
			t.Fatalf("cursor %s repeated on the next page", cursor)
		}
	}
	if first.ID == second.ID {
		t.Fatal("fixture setup returned the same creator twice")
	}

	// A cursor that does not resolve is a client bug, not an empty ledger.
	req = workbenchRequest(t, "GET", "/api/workbench/creators?cursor=00000000-0000-0000-0000-000000000000", nil, testUserID)
	testutil.Call(t, testHandler.ListCreators, req).Want(http.StatusBadRequest)
}

// ---- content health on the creator ledger ---------------------------------

// insertCreatorMetric writes one day's snapshot for a fixture creator. The list
// read joins the newest one, so the tests below need exact values rather than
// whatever the arithmetic would produce from a set of works.
func insertCreatorMetric(t *testing.T, workspaceID, creatorID string, engagement, hit *float64, posts, videosWithStats int32) {
	t.Helper()
	dbfx.Exec(t, `
		INSERT INTO creator_metric (
			workspace_id, creator_id, captured_on, video_count, videos_with_stats,
			posts_last_30d, engagement_rate, hit_rate
		)
		VALUES ($1, $2, '2026-11-18', 12, $3, $4, $5, $6)`,
		workspaceID, creatorID, videosWithStats, posts, engagement, hit)
}

// listCreatorPage reads the ledger in one workspace and indexes it by id.
func listCreatorPage(t *testing.T, workspaceID, query string) ([]CreatorResponse, map[string]CreatorResponse) {
	t.Helper()
	req := healthRequest(t, "GET", "/api/workbench/creators"+query, testUserID, workspaceID)
	var page struct {
		Creators []CreatorResponse `json:"creators"`
		Total    int               `json:"total"`
	}
	testutil.Call(t, testHandler.ListCreators, req).Want(http.StatusOK).JSON(&page)
	byID := make(map[string]CreatorResponse, len(page.Creators))
	for _, row := range page.Creators {
		byID[row.ID] = row
	}
	return page.Creators, byID
}

// TestListCreatorsCarriesLatestHealth covers the join's two promises: a sampled
// creator's newest snapshot arrives flattened on the row, and a creator nobody
// has sampled is still in the list with every health field null — not 0, and not
// filtered out by the join.
func TestListCreatorsCarriesLatestHealth(t *testing.T) {
	workspaceID, _ := healthWorkspace(t)
	sampled := insertHealthCreator(t, workspaceID, "health-sampled", 12000)
	unsampled := insertHealthCreator(t, workspaceID, "health-unsampled", 8000)
	engagement := 0.129
	hit := 0.47619
	insertCreatorMetric(t, workspaceID, sampled.String(), &engagement, &hit, 4, 12)

	rows, byID := listCreatorPage(t, workspaceID, "?limit=200")
	if len(rows) != 2 {
		t.Fatalf("list returned %d creators, want 2: a creator with no snapshot must not be filtered out", len(rows))
	}

	got := byID[sampled.String()]
	if got.EngagementRate == nil || *got.EngagementRate != engagement {
		t.Fatalf("engagement_rate = %v, want %v", got.EngagementRate, engagement)
	}
	if got.HitRate == nil || *got.HitRate != hit {
		t.Fatalf("hit_rate = %v, want %v", got.HitRate, hit)
	}
	if got.PostsLast30D == nil || *got.PostsLast30D != 4 {
		t.Fatalf("posts_last_30d = %v, want 4", got.PostsLast30D)
	}
	if got.VideosWithStats == nil || *got.VideosWithStats != 12 {
		t.Fatalf("videos_with_stats = %v, want 12", got.VideosWithStats)
	}
	if got.MetricCapturedOn == nil || *got.MetricCapturedOn != "2026-11-18" {
		t.Fatalf("metric_captured_on = %v, want 2026-11-18", got.MetricCapturedOn)
	}

	empty := byID[unsampled.String()]
	if empty.EngagementRate != nil || empty.HitRate != nil || empty.PostsLast30D != nil ||
		empty.VideosWithStats != nil || empty.MetricCapturedOn != nil {
		t.Fatalf("unsampled creator carries health %v/%v/%v/%v/%v, want every field null",
			empty.EngagementRate, empty.HitRate, empty.PostsLast30D,
			empty.VideosWithStats, empty.MetricCapturedOn)
	}
}

// TestListCreatorsSortsByEngagement puts the highest rate first and every
// never-sampled creator after them, which is what NULLS LAST is for.
func TestListCreatorsSortsByEngagement(t *testing.T) {
	workspaceID, _ := healthWorkspace(t)
	high := insertHealthCreator(t, workspaceID, "engagement-high", 1000)
	low := insertHealthCreator(t, workspaceID, "engagement-low", 2000)
	none := insertHealthCreator(t, workspaceID, "engagement-none", 3000)
	highRate := 0.42
	lowRate := 0.07
	insertCreatorMetric(t, workspaceID, high.String(), &highRate, nil, 1, 12)
	insertCreatorMetric(t, workspaceID, low.String(), &lowRate, nil, 1, 12)

	rows, _ := listCreatorPage(t, workspaceID, "?sort=engagement&limit=200")
	if len(rows) != 3 {
		t.Fatalf("list returned %d creators, want 3", len(rows))
	}
	want := []string{high.String(), low.String(), none.String()}
	for i, id := range want {
		if rows[i].ID != id {
			t.Fatalf("sort=engagement row %d = %s, want %s (order: high, low, unsampled last)", i, rows[i].ID, id)
		}
	}
	if rows[2].EngagementRate != nil {
		t.Fatalf("last row has engagement_rate %v, want null", *rows[2].EngagementRate)
	}

	// The cursor has to resume inside the same ordering, not repeat the row it
	// was built from.
	req := healthRequest(t, "GET", "/api/workbench/creators?sort=engagement&limit=1&cursor="+high.String(), testUserID, workspaceID)
	var next struct {
		Creators []CreatorResponse `json:"creators"`
	}
	testutil.Call(t, testHandler.ListCreators, req).Want(http.StatusOK).JSON(&next)
	if len(next.Creators) != 1 || next.Creators[0].ID != low.String() {
		t.Fatalf("page after cursor = %v, want the low-rate creator %s", next.Creators, low.String())
	}

	// An ordering the server does not have is a 400, not the default order
	// presented as the requested one.
	req = healthRequest(t, "GET", "/api/workbench/creators?sort=vibes", testUserID, workspaceID)
	testutil.Call(t, testHandler.ListCreators, req).Want(http.StatusBadRequest)
}

// TestListCreatorsDefaultSortIsFans keeps the ledger's opening order: biggest
// audience first, whether `sort` is omitted or named explicitly.
func TestListCreatorsDefaultSortIsFans(t *testing.T) {
	workspaceID, _ := healthWorkspace(t)
	small := insertHealthCreator(t, workspaceID, "fans-small", 100)
	big := insertHealthCreator(t, workspaceID, "fans-big", 9000)
	mid := insertHealthCreator(t, workspaceID, "fans-mid", 3000)

	want := []string{big.String(), mid.String(), small.String()}
	for _, query := range []string{"?limit=200", "?sort=fans&limit=200"} {
		rows, _ := listCreatorPage(t, workspaceID, query)
		if len(rows) != 3 {
			t.Fatalf("%s returned %d creators, want 3", query, len(rows))
		}
		for i, id := range want {
			if rows[i].ID != id {
				t.Fatalf("%s row %d = %s, want %s", query, i, rows[i].ID, id)
			}
		}
	}
}

// TestListCreatorVideosNewestFirst covers the drawer's 最近作品 read: newest
// work first, the requested page size, a play count that stays null when it was
// never collected, and a creator outside the workspace as a 404.
func TestListCreatorVideosNewestFirst(t *testing.T) {
	workspaceID, _ := healthWorkspace(t)
	creatorID := insertHealthCreator(t, workspaceID, "videos-creator", 1000)
	newest := insertCreatorVideo(t, workspaceID, creatorID.String(), "aweme-newest", -1)
	dbfx.Exec(t, `UPDATE creator_video SET digg_count = 120, comment_count = 8, share_count = 3 WHERE id = $1`, newest)
	insertCreatorVideo(t, workspaceID, creatorID.String(), "aweme-middle", -2)
	insertCreatorVideo(t, workspaceID, creatorID.String(), "aweme-oldest", -3)

	req := healthRequest(t, "GET", "/api/workbench/creators/"+creatorID.String()+"/videos?limit=2", testUserID, workspaceID)
	req = withURLParam(req, "creatorId", creatorID.String())
	var page struct {
		Videos []CreatorVideoResponse `json:"videos"`
		Total  int                    `json:"total"`
	}
	testutil.Call(t, testHandler.ListCreatorVideos, req).Want(http.StatusOK).JSON(&page)
	if page.Total != 2 || len(page.Videos) != 2 {
		t.Fatalf("videos = %d rows, want the 2 asked for", len(page.Videos))
	}
	if page.Videos[0].AwemeID != "aweme-newest" {
		t.Fatalf("first work = %s, want the newest", page.Videos[0].AwemeID)
	}
	if page.Videos[0].DiggCount == nil || *page.Videos[0].DiggCount != 120 {
		t.Fatalf("digg_count = %v, want 120", page.Videos[0].DiggCount)
	}
	// The counters nobody collected stay null: "no data" is not "0 plays".
	if page.Videos[0].PlayCount != nil {
		t.Fatalf("play_count = %v, want null", *page.Videos[0].PlayCount)
	}

	req = healthRequest(t, "GET", "/api/workbench/creators/00000000-0000-0000-0000-000000000000/videos", testUserID, workspaceID)
	req = withURLParam(req, "creatorId", "00000000-0000-0000-0000-000000000000")
	testutil.Call(t, testHandler.ListCreatorVideos, req).Want(http.StatusNotFound)
}

// insertCreatorVideo mirrors one work published `daysAgo` days ago.
func insertCreatorVideo(t *testing.T, workspaceID, creatorID, awemeID string, daysAgo int) string {
	t.Helper()
	var id string
	dbfx.QueryRow(t, `
		INSERT INTO creator_video (
			workspace_id, creator_id, aweme_id, desc_text, create_time, source_system, source_id
		)
		VALUES ($1, $2, $3, $4, now() + ($5 || ' days')::interval, 'orange', $3)
		RETURNING id::text`,
		workspaceID, creatorID, awemeID, "作品 "+awemeID, fmt.Sprintf("%d", daysAgo)).Scan(&id)
	return id
}
