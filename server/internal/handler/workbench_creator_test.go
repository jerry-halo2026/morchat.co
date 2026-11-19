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

	// The exact ordering is by created_at DESC; whichever row came back, the
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
