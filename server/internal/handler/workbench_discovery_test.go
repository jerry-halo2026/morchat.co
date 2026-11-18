package handler

// Hotspot radar and benchmark teardown tests (docs/engineering/WORKBENCH-API.md
// §21, migrations 812–815). What each case proves:
//
//   - the two ledgers round-trip through the handler (create / read / patch /
//     soft delete), with `rank` and `heat_value` staying NULL when nobody sent
//     them — NULL is "the platform published none", not 0;
//   - the list facets the screens open with (`captured_on` / `category` /
//     `platform` / `q`, plus `ip_id` on the teardown) actually filter;
//   - `PATCH` is tri-state on the nullable columns: omitted keeps, `null` clears;
//   - `adopt` copies a row into `media_topic` with `source` / `hot_id` set and an
//     empty score card, and refuses an `ip_id` that is not a live IP here;
//   - a plain member can read both ledgers and adopt from them, but cannot change
//     another member's rows;
//   - teardown removes both tables (the manifest test carries the classification).

import (
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/jerry-halo2026/morchat.co/server/internal/testutil"
)

// mediaHotFixture creates a radar row through the handler and registers cleanup.
func mediaHotFixture(t *testing.T, ownerUserID, title string) MediaHotResponse {
	t.Helper()
	body := map[string]any{
		"title":       title,
		"platform":    "douyin",
		"url":         "https://www.douyin.com/hot/1",
		"rank":        3,
		"heat_value":  920000,
		"category":    "家居",
		"captured_on": "2026-11-18",
	}
	if ownerUserID != "" {
		body["owner_member_id"] = ownerUserID
	}
	req := workbenchRequest(t, "POST", "/api/workbench/media/hot", body, ownerUserID)
	created := testutil.Decode[MediaHotResponse](t, testHandler.CreateMediaHot, req, http.StatusCreated)
	t.Cleanup(func() { dbfx.Exec(t, `DELETE FROM media_hot WHERE id = $1`, created.ID) })
	return created
}

// mediaBenchFixture creates a benchmarked account through the handler.
func mediaBenchFixture(t *testing.T, ownerUserID, ipID, name string) MediaBenchResponse {
	t.Helper()
	body := map[string]any{
		"platform":       "xiaohongshu",
		"name":           name,
		"url":            "https://www.xiaohongshu.com/user/profile/bench",
		"follower_count": 128000,
		"metrics":        map[string]any{"avg_play": 42000, "engagement_rate": 0.0612},
		"captured_on":    "2026-11-18",
	}
	if ipID != "" {
		body["ip_id"] = ipID
	}
	if ownerUserID != "" {
		body["owner_member_id"] = ownerUserID
	}
	req := workbenchRequest(t, "POST", "/api/workbench/media/bench", body, ownerUserID)
	created := testutil.Decode[MediaBenchResponse](t, testHandler.CreateMediaBench, req, http.StatusCreated)
	t.Cleanup(func() { dbfx.Exec(t, `DELETE FROM media_bench WHERE id = $1`, created.ID) })
	return created
}

// TestMediaHotLifecycle covers create defaults, the tri-state PATCH and the soft
// delete. `captured_on` defaults to today because a radar row is entered the day
// it is read; `source` defaults to `manual` because a hand-entered row is the
// ordinary case.
func TestMediaHotLifecycle(t *testing.T) {
	events := collectWorkbenchEvents(t, eventMediaHotChanged)

	req := workbenchRequest(t, "POST", "/api/workbench/media/hot", map[string]any{
		"title":    "三合一收纳架爆了",
		"platform": "douyin",
		"rank":     8,
	}, testUserID)
	created := testutil.Decode[MediaHotResponse](t, testHandler.CreateMediaHot, req, http.StatusCreated)
	t.Cleanup(func() { dbfx.Exec(t, `DELETE FROM media_hot WHERE id = $1`, created.ID) })

	if created.Source != mediaHotSourceManual {
		t.Fatalf("source = %q, want the manual default", created.Source)
	}
	today := time.Now().UTC().Format("2006-01-02")
	if created.CapturedOn != today {
		t.Fatalf("captured_on = %q, want today (%s) when the body omits it", created.CapturedOn, today)
	}
	if created.HeatValue != nil {
		t.Fatalf("heat_value = %v, want null: nobody sent a heat figure", *created.HeatValue)
	}
	if events.count(eventMediaHotChanged) != 1 || events.last(eventMediaHotChanged)["id"] != created.ID {
		t.Fatalf("media_hot:changed = %v, want one event naming %s",
			events.last(eventMediaHotChanged), created.ID)
	}

	// Omitted fields keep their stored value; an explicit null clears the nullable
	// ones. A rank that cannot be cleared is a rank the operator is stuck with.
	req = withURLParam(workbenchRequest(t, "PATCH", "/api/workbench/media/hot/"+created.ID,
		map[string]any{"rank": nil, "note": "换成第二轮抓取"}, testUserID), "hotId", created.ID)
	patched := testutil.Decode[MediaHotResponse](t, testHandler.UpdateMediaHot, req, http.StatusOK)
	if patched.Rank != nil {
		t.Fatalf("rank = %v after null, want cleared", *patched.Rank)
	}
	if patched.Title != created.Title || patched.Platform != created.Platform {
		t.Fatalf("patch cleared an unsent field: title=%q platform=%q", patched.Title, patched.Platform)
	}
	if patched.Note == nil || *patched.Note != "换成第二轮抓取" {
		t.Fatalf("note = %v, want the value that was sent", patched.Note)
	}
	if events.count(eventMediaHotChanged) != 2 {
		t.Fatalf("media_hot:changed published %d times, want 2", events.count(eventMediaHotChanged))
	}

	// A negative rank is rejected instead of stored.
	req = withURLParam(workbenchRequest(t, "PATCH", "/api/workbench/media/hot/"+created.ID,
		map[string]any{"rank": -1}, testUserID), "hotId", created.ID)
	testutil.Call(t, testHandler.UpdateMediaHot, req).Want(http.StatusBadRequest)

	// DELETE is a soft delete: 204, and the row leaves every read.
	req = withURLParam(workbenchRequest(t, "DELETE", "/api/workbench/media/hot/"+created.ID, nil, testUserID), "hotId", created.ID)
	testutil.Call(t, testHandler.DeleteMediaHot, req).Want(http.StatusNoContent)

	req = withURLParam(workbenchRequest(t, "GET", "/api/workbench/media/hot/"+created.ID, nil, testUserID), "hotId", created.ID)
	testutil.Call(t, testHandler.GetMediaHot, req).Want(http.StatusNotFound)

	archivedAt := dbfx.Count(t, `SELECT count(*) FROM media_hot WHERE id = $1 AND archived_at IS NOT NULL`, created.ID)
	if archivedAt != 1 {
		t.Fatalf("archived_at not set: teardown would resurrect the row")
	}
}

// TestMediaHotListFilters covers the four facets the radar screen offers.
func TestMediaHotListFilters(t *testing.T) {
	match := mediaHotFixture(t, testUserID, "露营灯收纳改造")

	req := workbenchRequest(t, "POST", "/api/workbench/media/hot", map[string]any{
		"title":       "别的一条热点",
		"platform":    "xiaohongshu",
		"category":    "美妆",
		"captured_on": "2026-11-17",
	}, testUserID)
	other := testutil.Decode[MediaHotResponse](t, testHandler.CreateMediaHot, req, http.StatusCreated)
	t.Cleanup(func() { dbfx.Exec(t, `DELETE FROM media_hot WHERE id = $1`, other.ID) })

	type hotList struct {
		Hot   []MediaHotResponse `json:"hot"`
		Total int                `json:"total"`
	}
	list := func(query string) hotList {
		t.Helper()
		req := workbenchRequest(t, "GET", "/api/workbench/media/hot"+query, nil, testUserID)
		return testutil.Decode[hotList](t, testHandler.ListMediaHot, req, http.StatusOK)
	}

	// Every filter is applied against rows this test created, never the totals of
	// a shared database: the workspace may hold other hotspots.
	byDay := list("?captured_on=2026-11-18&platform=douyin&category=" + "%E5%AE%B6%E5%B1%85")
	if byDay.Total != 1 || byDay.Hot[0].ID != match.ID {
		t.Fatalf("filtered list = %+v, want only %s", byDay.Hot, match.ID)
	}
	byQuery := list("?q=" + "%E9%9C%B2%E8%90%A5")
	if byQuery.Total != 1 || byQuery.Hot[0].ID != match.ID {
		t.Fatalf("q list = %+v, want only %s", byQuery.Hot, match.ID)
	}
	if got := list("?captured_on=2026-11-17&platform=xiaohongshu"); got.Total != 1 || got.Hot[0].ID != other.ID {
		t.Fatalf("day list = %+v, want only %s", got.Hot, other.ID)
	}

	// A malformed day is a 400, not a silently unfiltered list.
	req = workbenchRequest(t, "GET", "/api/workbench/media/hot?captured_on=18-11-2026", nil, testUserID)
	testutil.Call(t, testHandler.ListMediaHot, req).Want(http.StatusBadRequest)
}

// TestMediaBenchLifecycle covers the teardown ledger: `ip_id` validation, the
// `ip_id` facet, whole-object `metrics`, and the soft delete.
func TestMediaBenchLifecycle(t *testing.T) {
	events := collectWorkbenchEvents(t, eventMediaBenchChanged)
	ip := mediaIPFixture(t, testUserID, "对标用 IP")
	bench := mediaBenchFixture(t, testUserID, ip.ID, "对标账号 A")

	if bench.IPID == nil || *bench.IPID != ip.ID {
		t.Fatalf("ip_id = %v, want %s", bench.IPID, ip.ID)
	}
	if events.count(eventMediaBenchChanged) != 1 {
		t.Fatalf("media_bench:changed published %d times, want 1", events.count(eventMediaBenchChanged))
	}

	// `metrics` travels as the object that was stored, not as a string.
	metrics := string(bench.Metrics)
	if !strings.Contains(metrics, `"avg_play"`) || !strings.Contains(metrics, "42000") {
		t.Fatalf("metrics = %s, want the object that was sent", metrics)
	}

	type benchList struct {
		Bench []MediaBenchResponse `json:"bench"`
		Total int                  `json:"total"`
	}
	req := workbenchRequest(t, "GET", "/api/workbench/media/bench?ip_id="+ip.ID, nil, testUserID)
	listed := testutil.Decode[benchList](t, testHandler.ListMediaBench, req, http.StatusOK)
	if listed.Total != 1 || listed.Bench[0].ID != bench.ID {
		t.Fatalf("ip_id list = %+v, want only %s", listed.Bench, bench.ID)
	}

	// A non-object metrics payload is a 400: the column's CHECK would otherwise be
	// a 500 the caller cannot act on.
	req = withURLParam(workbenchRequest(t, "PATCH", "/api/workbench/media/bench/"+bench.ID,
		map[string]any{"metrics": []any{1, 2}}, testUserID), "benchId", bench.ID)
	testutil.Call(t, testHandler.UpdateMediaBench, req).Want(http.StatusBadRequest)

	// A whole-object replace: the second write does not merge the first card.
	req = withURLParam(workbenchRequest(t, "PATCH", "/api/workbench/media/bench/"+bench.ID,
		map[string]any{"metrics": map[string]any{"hit_rate": 0.13}}, testUserID), "benchId", bench.ID)
	updated := testutil.Decode[MediaBenchResponse](t, testHandler.UpdateMediaBench, req, http.StatusOK)
	if strings.Contains(string(updated.Metrics), "avg_play") {
		t.Fatalf("metrics = %s, want the replacement card only", updated.Metrics)
	}

	// An ip_id that is not a live IP here is a 400 (no foreign key does this).
	req = workbenchRequest(t, "POST", "/api/workbench/media/bench", map[string]any{
		"name":     "对标账号 B",
		"platform": "xiaohongshu",
		"ip_id":    "00000000-0000-0000-0000-000000000000",
	}, testUserID)
	testutil.Call(t, testHandler.CreateMediaBench, req).Want(http.StatusBadRequest)

	req = withURLParam(workbenchRequest(t, "DELETE", "/api/workbench/media/bench/"+bench.ID, nil, testUserID), "benchId", bench.ID)
	testutil.Call(t, testHandler.DeleteMediaBench, req).Want(http.StatusNoContent)
	req = withURLParam(workbenchRequest(t, "GET", "/api/workbench/media/bench/"+bench.ID, nil, testUserID), "benchId", bench.ID)
	testutil.Call(t, testHandler.GetMediaBench, req).Want(http.StatusNotFound)
}

// TestMediaAdoptCreatesTopic covers both adopt routes: the copy into `media_topic`
// carries the source, the pointer and an empty score card, and the target IP has
// to be a live one.
func TestMediaAdoptCreatesTopic(t *testing.T) {
	ip := mediaIPFixture(t, testUserID, "承接热点用 IP")
	hot := mediaHotFixture(t, testUserID, "被采纳的热点")

	req := withURLParam(workbenchRequest(t, "POST", "/api/workbench/media/hot/"+hot.ID+"/adopt",
		map[string]any{"ip_id": ip.ID}, testUserID), "hotId", hot.ID)
	topic := testutil.Decode[MediaTopicResponse](t, testHandler.AdoptMediaHot, req, http.StatusCreated)
	if topic.Source != mediaTopicSourceHot {
		t.Fatalf("source = %q, want hot", topic.Source)
	}
	if topic.HotID == nil || *topic.HotID != hot.ID {
		t.Fatalf("hot_id = %v, want the adopted row %s", topic.HotID, hot.ID)
	}
	if topic.Title != hot.Title {
		t.Fatalf("title = %q, want the source title %q", topic.Title, hot.Title)
	}
	if topic.Status != mediaTopicStatusPool {
		t.Fatalf("status = %q, want the pool", topic.Status)
	}
	for dimension, score := range topic.Scores {
		if score != 0 {
			t.Fatalf("scores.%s = %d; an adopted topic has not been judged yet", dimension, score)
		}
	}

	// The title may be overridden: an operator often rewrites the hook's angle.
	req = withURLParam(workbenchRequest(t, "POST", "/api/workbench/media/hot/"+hot.ID+"/adopt",
		map[string]any{"ip_id": ip.ID, "title": "换个角度的选题"}, testUserID), "hotId", hot.ID)
	retitled := testutil.Decode[MediaTopicResponse](t, testHandler.AdoptMediaHot, req, http.StatusCreated)
	if retitled.Title != "换个角度的选题" {
		t.Fatalf("title = %q, want the override", retitled.Title)
	}

	// Benchmark adopt: same tail, `source = 'bench'`, the bench row in `hot_id`
	// (the column predates that table — §21 records it as debt).
	bench := mediaBenchFixture(t, testUserID, ip.ID, "被拆解的对标账号")
	req = withURLParam(workbenchRequest(t, "POST", "/api/workbench/media/bench/"+bench.ID+"/adopt",
		map[string]any{"ip_id": ip.ID}, testUserID), "benchId", bench.ID)
	benchTopic := testutil.Decode[MediaTopicResponse](t, testHandler.AdoptMediaBench, req, http.StatusCreated)
	if benchTopic.Source != mediaTopicSourceBench || benchTopic.Title != bench.Name {
		t.Fatalf("bench adopt = %+v, want source bench and the account name", benchTopic)
	}
	if benchTopic.HotID == nil || *benchTopic.HotID != bench.ID {
		t.Fatalf("hot_id = %v, want the bench row %s", benchTopic.HotID, bench.ID)
	}

	// Missing ip_id, an unknown IP and an archived IP are all 400s: a topic whose
	// persona is gone has nowhere to sit.
	req = withURLParam(workbenchRequest(t, "POST", "/api/workbench/media/hot/"+hot.ID+"/adopt",
		map[string]any{}, testUserID), "hotId", hot.ID)
	testutil.Call(t, testHandler.AdoptMediaHot, req).Want(http.StatusBadRequest)

	req = withURLParam(workbenchRequest(t, "POST", "/api/workbench/media/hot/"+hot.ID+"/adopt",
		map[string]any{"ip_id": "00000000-0000-0000-0000-000000000000"}, testUserID), "hotId", hot.ID)
	testutil.Call(t, testHandler.AdoptMediaHot, req).Want(http.StatusBadRequest)

	req = withURLParam(workbenchRequest(t, "DELETE", "/api/workbench/media/ips/"+ip.ID, nil, testUserID), "ipId", ip.ID)
	testutil.Call(t, testHandler.DeleteMediaIP, req).Want(http.StatusNoContent)
	req = withURLParam(workbenchRequest(t, "POST", "/api/workbench/media/hot/"+hot.ID+"/adopt",
		map[string]any{"ip_id": ip.ID}, testUserID), "hotId", hot.ID)
	testutil.Call(t, testHandler.AdoptMediaHot, req).Want(http.StatusBadRequest)

	// Adopting a row that is not in this workspace is a 404, not a silent topic.
	req = withURLParam(workbenchRequest(t, "POST", "/api/workbench/media/hot/00000000-0000-0000-0000-000000000000/adopt",
		map[string]any{"ip_id": ip.ID}, testUserID), "hotId", "00000000-0000-0000-0000-000000000000")
	testutil.Call(t, testHandler.AdoptMediaHot, req).Want(http.StatusNotFound)
}

// TestMediaDiscoveryMemberScope covers the write gate on the two source ledgers: a
// plain member reads them and may adopt from them, but cannot change a row it does
// not own.
func TestMediaDiscoveryMemberScope(t *testing.T) {
	memberUserID := workbenchTestMember(t)
	ip := mediaIPFixture(t, testUserID, "热点权限用 IP")
	hot := mediaHotFixture(t, testUserID, "别人的热点")
	bench := mediaBenchFixture(t, testUserID, ip.ID, "别人的对标")

	req := workbenchRequest(t, "GET", "/api/workbench/media/hot", nil, memberUserID)
	testutil.Call(t, testHandler.ListMediaHot, req).Want(http.StatusOK)
	req = workbenchRequest(t, "GET", "/api/workbench/media/bench", nil, memberUserID)
	testutil.Call(t, testHandler.ListMediaBench, req).Want(http.StatusOK)

	req = withURLParam(workbenchRequest(t, "PATCH", "/api/workbench/media/hot/"+hot.ID,
		map[string]any{"title": "我要改别人的热点"}, memberUserID), "hotId", hot.ID)
	testutil.Call(t, testHandler.UpdateMediaHot, req).Want(http.StatusForbidden)
	req = withURLParam(workbenchRequest(t, "DELETE", "/api/workbench/media/bench/"+bench.ID, nil, memberUserID), "benchId", bench.ID)
	testutil.Call(t, testHandler.DeleteMediaBench, req).Want(http.StatusForbidden)

	// Adopting is a read of the source plus a create of a topic the member owns, so
	// it is allowed — the source row is untouched.
	req = withURLParam(workbenchRequest(t, "POST", "/api/workbench/media/hot/"+hot.ID+"/adopt",
		map[string]any{"ip_id": ip.ID}, memberUserID), "hotId", hot.ID)
	topic := testutil.Decode[MediaTopicResponse](t, testHandler.AdoptMediaHot, req, http.StatusCreated)
	if topic.OwnerMemberID == nil || *topic.OwnerMemberID != memberUserID {
		t.Fatalf("adopted topic owner = %v, want the caller %s", topic.OwnerMemberID, memberUserID)
	}

	// A row the member created is its own to change.
	own := mediaHotFixture(t, memberUserID, "我自己抓的热点")
	req = withURLParam(workbenchRequest(t, "PATCH", "/api/workbench/media/hot/"+own.ID,
		map[string]any{"note": "我自己补一句"}, memberUserID), "hotId", own.ID)
	testutil.Call(t, testHandler.UpdateMediaHot, req).Want(http.StatusOK)
}

// TestMediaDiscoveryTeardown proves DeleteWorkspaceWorkbenchLedger reaches the two
// new tables; the manifest test carries their classification.
func TestMediaDiscoveryTeardown(t *testing.T) {
	slug := strings.NewReplacer("_", "-", "/", "-").Replace(strings.ToLower(t.Name()))
	workspaceID := dbfx.Workspace(t, "Media discovery teardown workspace", slug)
	t.Cleanup(func() {
		for _, table := range []string{"media_hot", "media_bench"} {
			dbfx.Exec(t, `DELETE FROM `+table+` WHERE workspace_id = $1`, workspaceID)
		}
	})

	dbfx.Insert(t, "media_hot", testutil.Cols{
		"workspace_id": workspaceID,
		"title":        "teardown hotspot",
		"platform":     "douyin",
		"captured_on":  testutil.Raw("DATE '2026-11-18'"),
	})
	dbfx.Insert(t, "media_bench", testutil.Cols{
		"workspace_id": workspaceID,
		"platform":     "xiaohongshu",
		"name":         "teardown benchmark",
		"captured_on":  testutil.Raw("DATE '2026-11-18'"),
	})

	if err := testHandler.Queries.DeleteWorkspaceWorkbenchLedger(t.Context(), parseUUID(workspaceID)); err != nil {
		t.Fatalf("teardown: %v", err)
	}

	for _, table := range []string{"media_hot", "media_bench"} {
		if left := dbfx.Count(t, `SELECT count(*) FROM `+table+` WHERE workspace_id = $1`, workspaceID); left != 0 {
			t.Fatalf("%s kept %d rows after teardown", table, left)
		}
	}
}
