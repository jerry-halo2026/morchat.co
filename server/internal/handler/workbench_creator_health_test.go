package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/jerry-halo2026/morchat.co/server/internal/testutil"
	"github.com/jerry-halo2026/morchat.co/server/pkg/orange"
)

// Content health (WORKBENCH-API §19; WORKBENCH-DATA-CONTRACT §2.3) is read here
// and written by `cmd/orange-sync -videos`. These tests therefore write their
// snapshots through the real writer — orange.StoreCreatorHealth — and assert on
// what the endpoints make of them: the arithmetic itself is covered by
// pkg/orange/videos_test.go, this file is about the read surface.
//
// Each test runs in its own workspace via `X-Workspace-ID`: the health board's
// whole premise is "every creator in this workspace", so a count assertion against
// the shared handler-test workspace would be at the mercy of every other test in
// the package.

// healthWorkspace creates a throwaway workspace owned by the fixture user and
// returns its id as text (for SQL) and as a uuid (for the metric writer).
func healthWorkspace(t *testing.T) (string, uuid.UUID) {
	t.Helper()
	slug := fmt.Sprintf("health-%s", uuid.NewString()[:8])
	workspaceID := dbfx.Workspace(t, "Health fixture workspace", slug)
	dbfx.Member(t, workspaceID, testUserID, "owner")

	// No foreign key ties these together, so the fixture names every table it
	// fills. Registered after the workspace fixture, which means it runs first.
	t.Cleanup(func() {
		dbfx.Exec(t, `DELETE FROM creator_video WHERE workspace_id = $1`, workspaceID)
		dbfx.Exec(t, `DELETE FROM creator_metric WHERE workspace_id = $1`, workspaceID)
		dbfx.Exec(t, `DELETE FROM creator WHERE workspace_id = $1`, workspaceID)
	})

	parsed, err := uuid.Parse(workspaceID)
	if err != nil {
		t.Fatalf("parse fixture workspace id %q: %v", workspaceID, err)
	}
	return workspaceID, parsed
}

// healthRequest is a workbench request acting in a specific workspace.
func healthRequest(t *testing.T, method, path, userID, workspaceID string) *http.Request {
	t.Helper()
	req := newRequest(method, path, nil)
	if userID != "" {
		req.Header.Set("X-User-ID", userID)
	}
	req.Header.Set("X-Workspace-ID", workspaceID)
	return req
}

// insertHealthCreator inserts one mirrored creator with a follower count.
func insertHealthCreator(t *testing.T, workspaceID, handle string, fans int64) uuid.UUID {
	t.Helper()
	var id string
	dbfx.QueryRow(t, `
		INSERT INTO creator (workspace_id, kind, display_name, platform, handle, fans, source_system, source_id)
		VALUES ($1, 'external', $2, 'douyin', $2, $3, 'orange', $2)
		RETURNING id::text`, workspaceID, handle, fans).Scan(&id)
	parsed, err := uuid.Parse(id)
	if err != nil {
		t.Fatalf("parse creator id %q: %v", id, err)
	}
	return parsed
}

// insertHealthVideos inserts one work per entry in likes, published the same day.
// Comment and share counts are left NULL, so the engagement arithmetic in the
// assertions is the likes average alone.
func insertHealthVideos(t *testing.T, workspaceID string, creatorID uuid.UUID, awemePrefix string, likes []int64) {
	t.Helper()
	published := time.Now().UTC().Add(-24 * time.Hour)
	for i, like := range likes {
		dbfx.Exec(t, `
			INSERT INTO creator_video (
				workspace_id, creator_id, aweme_id, desc_text, digg_count,
				create_time, source_system, source_id
			)
			VALUES ($1, $2, $3, $4, $5, $6, 'orange', $3)`,
			workspaceID, creatorID.String(), fmt.Sprintf("%s-%d", awemePrefix, i),
			fmt.Sprintf("#咖啡 work %d", i), like, published)
	}
}

// computeHealth runs the production metric writer for these creators and returns
// what it reported.
func computeHealth(t *testing.T, workspaceID uuid.UUID, creators ...uuid.UUID) orange.HealthStoreResult {
	t.Helper()
	result, err := orange.StoreCreatorHealth(context.Background(), testPool, orange.HealthStoreOptions{
		WorkspaceID: workspaceID,
		CreatorIDs:  creators,
	})
	if err != nil {
		t.Fatalf("StoreCreatorHealth: %v", err)
	}
	return result
}

// TestCreatorHealthListIncludesUnsampledCreators is the board's first promise:
// with no content data at all, the list is still the creator list — 623 mirrored
// creators, every health field null — rather than an empty page.
func TestCreatorHealthListIncludesUnsampledCreators(t *testing.T) {
	workspaceID, _ := healthWorkspace(t)
	dbfx.Exec(t, `
		INSERT INTO creator (workspace_id, kind, display_name, platform, handle, fans, source_system, source_id)
		SELECT $1, 'external', 'health fixture ' || g, 'douyin', 'health-fixture-' || g, g, 'orange', 'sec-' || g
		FROM generate_series(1, 623) AS g`, workspaceID)

	const pageSize = 200
	total := 0
	cursor := ""
	for page := 0; page < 10; page++ {
		path := fmt.Sprintf("/api/workbench/creators/health?limit=%d", pageSize)
		if cursor != "" {
			path += "&cursor=" + cursor
		}
		req := healthRequest(t, "GET", path, testUserID, workspaceID)
		got := testutil.Decode[CreatorHealthListResponse](t, testHandler.ListCreatorHealth, req, http.StatusOK)
		if got.Total != len(got.Creators) {
			t.Fatalf("total = %d, want the page length %d", got.Total, len(got.Creators))
		}
		for _, entry := range got.Creators {
			if entry.EngagementRate != nil || entry.HitRate != nil {
				t.Fatalf("creator %s has health numbers without a snapshot: %+v", entry.ID, entry)
			}
			if entry.VideosWithStats != nil || entry.PostsLast30D != nil || entry.CapturedOn != nil {
				t.Fatalf("creator %s has snapshot counts without a snapshot: %+v", entry.ID, entry)
			}
		}
		total += got.Total
		if got.NextCursor == nil {
			break
		}
		cursor = *got.NextCursor
	}
	if total != 623 {
		t.Fatalf("walked %d creators, want all 623", total)
	}
}

// TestCreatorHealthMetricsFromSampledWorks covers the happy path end to end: ten
// works with one clear hit produce a median of 10, a hit rate of 1/10 and an
// engagement rate over the follower count — and both endpoints agree with the
// writer.
func TestCreatorHealthMetricsFromSampledWorks(t *testing.T) {
	workspaceID, workspaceUUID := healthWorkspace(t)
	creatorID := insertHealthCreator(t, workspaceID, "health-sampled", 1000)
	// Nine tens and one hundred: median 10, so only the hundred is above 2×10.
	insertHealthVideos(t, workspaceID, creatorID, "sampled", []int64{100, 10, 10, 10, 10, 10, 10, 10, 10, 10})

	first := computeHealth(t, workspaceUUID, creatorID)
	if first.Computed != 1 {
		t.Fatalf("computed = %d, want 1 snapshot", first.Computed)
	}

	req := healthRequest(t, "GET", "/api/workbench/creators/"+creatorID.String()+"/health", testUserID, workspaceID)
	req = withURLParam(req, "creatorId", creatorID.String())
	detail := testutil.Decode[CreatorHealthDetailResponse](t, testHandler.GetCreatorHealth, req, http.StatusOK)
	if detail.CreatorID != creatorID.String() {
		t.Fatalf("creator_id = %q, want %s", detail.CreatorID, creatorID)
	}
	if detail.Latest == nil {
		t.Fatal("latest = nil, want the snapshot that was just written")
	}
	latest := detail.Latest
	if latest.VideosWithStats == nil || *latest.VideosWithStats != 10 {
		t.Fatalf("videos_with_stats = %v, want 10", latest.VideosWithStats)
	}
	if latest.PostsLast30D == nil || *latest.PostsLast30D != 10 {
		t.Fatalf("posts_last_30d = %v, want 10", latest.PostsLast30D)
	}
	if latest.AvgDigg == nil || *latest.AvgDigg != 19 {
		t.Fatalf("avg_digg = %v, want 19", latest.AvgDigg)
	}
	if latest.HitRate == nil || *latest.HitRate != 0.1 {
		t.Fatalf("hit_rate = %v, want 0.1", latest.HitRate)
	}
	if latest.EngagementRate == nil || *latest.EngagementRate != 0.019 {
		t.Fatalf("engagement_rate = %v, want 0.019", latest.EngagementRate)
	}
	if latest.SampleNote != nil {
		t.Fatalf("sample_note = %v, want null when every metric is computable", *latest.SampleNote)
	}
	if len(detail.Recent) != 1 {
		t.Fatalf("recent = %d snapshots, want 1 (today's)", len(detail.Recent))
	}

	// The board shows the same numbers for the same creator.
	req = healthRequest(t, "GET", "/api/workbench/creators/health?limit=200", testUserID, workspaceID)
	board := testutil.Decode[CreatorHealthListResponse](t, testHandler.ListCreatorHealth, req, http.StatusOK)
	if board.Total != 1 {
		t.Fatalf("board total = %d, want 1", board.Total)
	}
	entry := board.Creators[0]
	if entry.EngagementRate == nil || *entry.EngagementRate != 0.019 {
		t.Fatalf("board engagement_rate = %v, want 0.019", entry.EngagementRate)
	}
	if entry.HitRate == nil || *entry.HitRate != 0.1 {
		t.Fatalf("board hit_rate = %v, want 0.1", entry.HitRate)
	}
	if entry.CapturedOn == nil || *entry.CapturedOn != time.Now().UTC().Format("2006-01-02") {
		t.Fatalf("board captured_on = %v, want today", entry.CapturedOn)
	}

	// A second run of the same day changes nothing and says so.
	second := computeHealth(t, workspaceUUID, creatorID)
	if second.Computed != 0 {
		t.Fatalf("second run computed = %d, want 0: same day, same works", second.Computed)
	}
}

// TestCreatorHealthSampleBelowTenHasNoHitRate pins the contract's sample rule: a
// creator with nine sampled works gets an engagement rate and no hit rate, and
// the snapshot says why instead of leaving a bare NULL.
func TestCreatorHealthSampleBelowTenHasNoHitRate(t *testing.T) {
	workspaceID, workspaceUUID := healthWorkspace(t)
	creatorID := insertHealthCreator(t, workspaceID, "health-nine", 1000)
	insertHealthVideos(t, workspaceID, creatorID, "nine", []int64{10, 10, 10, 10, 10, 10, 10, 10, 10})

	computeHealth(t, workspaceUUID, creatorID)

	req := healthRequest(t, "GET", "/api/workbench/creators/"+creatorID.String()+"/health", testUserID, workspaceID)
	req = withURLParam(req, "creatorId", creatorID.String())
	detail := testutil.Decode[CreatorHealthDetailResponse](t, testHandler.GetCreatorHealth, req, http.StatusOK)
	if detail.Latest == nil {
		t.Fatal("latest = nil, want the snapshot")
	}
	if detail.Latest.HitRate != nil {
		t.Fatalf("hit_rate = %v, want null below ten sampled works", *detail.Latest.HitRate)
	}
	if detail.Latest.SampleNote == nil || *detail.Latest.SampleNote != orange.HealthNoteSampleBelow10 {
		t.Fatalf("sample_note = %v, want %q", detail.Latest.SampleNote, orange.HealthNoteSampleBelow10)
	}
	if detail.Latest.EngagementRate == nil || *detail.Latest.EngagementRate != 0.01 {
		t.Fatalf("engagement_rate = %v, want 0.01", detail.Latest.EngagementRate)
	}
}

// TestCreatorHealthSortPutsNullsLast covers the three orderings: the default by
// follower count, and the two metric sorts, where a creator with no snapshot must
// sink to the bottom (and be ordered by followers among themselves) instead of
// floating to the top.
func TestCreatorHealthSortPutsNullsLast(t *testing.T) {
	workspaceID, workspaceUUID := healthWorkspace(t)

	// A: ten works at 1000 likes over 100 followers → engagement 10.00, hit 0.
	high := insertHealthCreator(t, workspaceID, "health-high", 100)
	insertHealthVideos(t, workspaceID, high, "high", []int64{1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000})
	// C: one work at 500 likes over 200 followers → engagement 2.50, no hit rate.
	low := insertHealthCreator(t, workspaceID, "health-low", 200)
	insertHealthVideos(t, workspaceID, low, "low", []int64{500})
	// B: no works at all, and the largest audience — the trap for NULLS LAST.
	big := insertHealthCreator(t, workspaceID, "health-big", 500)

	computeHealth(t, workspaceUUID, high, low)

	ids := func(entries []CreatorHealthEntry) []string {
		out := make([]string, 0, len(entries))
		for _, entry := range entries {
			out = append(out, entry.ID)
		}
		return out
	}
	get := func(query string) CreatorHealthListResponse {
		req := healthRequest(t, "GET", "/api/workbench/creators/health"+query, testUserID, workspaceID)
		return testutil.Decode[CreatorHealthListResponse](t, testHandler.ListCreatorHealth, req, http.StatusOK)
	}

	// Default: biggest audience first, sampled or not.
	byFans := get("?limit=200")
	wantFans := []string{big.String(), low.String(), high.String()}
	if fmt.Sprint(ids(byFans.Creators)) != fmt.Sprint(wantFans) {
		t.Fatalf("fans order = %v, want %v", ids(byFans.Creators), wantFans)
	}

	// Engagement: 10.00, then 2.50, then the creator with no snapshot.
	byEngagement := get("?sort=engagement&limit=200")
	wantEngagement := []string{high.String(), low.String(), big.String()}
	if fmt.Sprint(ids(byEngagement.Creators)) != fmt.Sprint(wantEngagement) {
		t.Fatalf("engagement order = %v, want %v", ids(byEngagement.Creators), wantEngagement)
	}

	// Hit rate: one real 0, then the two nulls ordered by their followers.
	byHit := get("?sort=hit&limit=200")
	wantHit := []string{high.String(), big.String(), low.String()}
	if fmt.Sprint(ids(byHit.Creators)) != fmt.Sprint(wantHit) {
		t.Fatalf("hit order = %v, want %v", ids(byHit.Creators), wantHit)
	}

	// A metric-sorted cursor pages through the same order, nulls included.
	firstPage := get("?sort=engagement&limit=1")
	if firstPage.NextCursor == nil {
		t.Fatal("next_cursor = nil on a full page")
	}
	if fmt.Sprint(ids(firstPage.Creators)) != fmt.Sprint([]string{high.String()}) {
		t.Fatalf("first page = %v, want just the highest engagement", ids(firstPage.Creators))
	}
	secondPage := get("?sort=engagement&limit=1&cursor=" + *firstPage.NextCursor)
	if fmt.Sprint(ids(secondPage.Creators)) != fmt.Sprint([]string{low.String()}) {
		t.Fatalf("second page = %v, want the second-highest engagement", ids(secondPage.Creators))
	}

	// An unknown sort is a 400 rather than a silently unsorted board.
	req := healthRequest(t, "GET", "/api/workbench/creators/health?sort=vibes", testUserID, workspaceID)
	testutil.Call(t, testHandler.ListCreatorHealth, req).Want(http.StatusBadRequest)
}

// TestCreatorHealthReadsAreMemberWide: a plain member reads the board and one
// creator's health. Content data is not an ACL (WORKBENCH-API §3).
func TestCreatorHealthReadsAreMemberWide(t *testing.T) {
	workspaceID, workspaceUUID := healthWorkspace(t)
	creatorID := insertHealthCreator(t, workspaceID, "health-member-read", 1000)
	insertHealthVideos(t, workspaceID, creatorID, "member", []int64{10, 10, 10, 10, 10, 10, 10, 10, 10, 10})
	computeHealth(t, workspaceUUID, creatorID)

	memberID := dbfx.User(t, "Health Member", fmt.Sprintf("health-member-%s@multica.ai", uuid.NewString()[:8]))
	dbfx.Member(t, workspaceID, memberID, "member")

	req := healthRequest(t, "GET", "/api/workbench/creators/health?limit=200", memberID, workspaceID)
	board := testutil.Decode[CreatorHealthListResponse](t, testHandler.ListCreatorHealth, req, http.StatusOK)
	if board.Total != 1 {
		t.Fatalf("member saw %d creators, want 1", board.Total)
	}

	req = healthRequest(t, "GET", "/api/workbench/creators/"+creatorID.String()+"/health", memberID, workspaceID)
	req = withURLParam(req, "creatorId", creatorID.String())
	detail := testutil.Decode[CreatorHealthDetailResponse](t, testHandler.GetCreatorHealth, req, http.StatusOK)
	if detail.Latest == nil {
		t.Fatal("member got no snapshot, want the same data an owner sees")
	}
}

// TestCreatorHealthDetailRequiresTheCreatorHere: a creator id from another
// workspace is a 404, not an empty health record.
func TestCreatorHealthDetailRequiresTheCreatorHere(t *testing.T) {
	workspaceID, _ := healthWorkspace(t)
	otherWorkspaceID, _ := healthWorkspace(t)
	otherCreator := insertHealthCreator(t, otherWorkspaceID, "health-other", 100)

	req := healthRequest(t, "GET", "/api/workbench/creators/"+otherCreator.String()+"/health", testUserID, workspaceID)
	req = withURLParam(req, "creatorId", otherCreator.String())
	testutil.Call(t, testHandler.GetCreatorHealth, req).Want(http.StatusNotFound)
}

// TestCreatorHealthEmptyWorkspaceKeepsTheEnvelope: no creators at all is an empty
// list with total 0 and no cursor, not a null body — the schema has to parse.
func TestCreatorHealthEmptyWorkspaceKeepsTheEnvelope(t *testing.T) {
	workspaceID, _ := healthWorkspace(t)
	req := healthRequest(t, "GET", "/api/workbench/creators/health", testUserID, workspaceID)
	payload := testutil.Decode[json.RawMessage](t, testHandler.ListCreatorHealth, req, http.StatusOK)

	var decoded struct {
		Creators   []CreatorHealthEntry `json:"creators"`
		Total      int                  `json:"total"`
		NextCursor *string              `json:"next_cursor"`
	}
	if err := json.Unmarshal(payload, &decoded); err != nil {
		t.Fatalf("decode health list: %v", err)
	}
	if decoded.Creators == nil {
		t.Fatal("creators = null, want an empty array")
	}
	if decoded.Total != 0 || len(decoded.Creators) != 0 {
		t.Fatalf("total = %d (%d rows), want 0", decoded.Total, len(decoded.Creators))
	}
	if decoded.NextCursor != nil {
		t.Fatalf("next_cursor = %v, want null on an empty page", *decoded.NextCursor)
	}
}
