package handler

// Content workbench tests (docs/engineering/WORKBENCH-API.md §12). Seven
// properties, one case each, plus the fixtures that build the chain:
//
//   - an IP name is unique per workspace among live rows, and a duplicate is a
//     409 rather than a second persona;
//   - a platform account attaches to an IP through `creator.media_ip_id`, the IP
//     detail shows it, and attaching it twice is a 409;
//   - a topic's five-dimension score card rejects a value outside 0–100;
//   - rewriting a script's body creates v2 and leaves v1 readable, while an
//     `?inPlace=1` edit does not;
//   - the shoot calendar filters on `shoot_date` with inclusive `from`/`to`;
//   - a member cannot change another member's topic (and therefore not its
//     scripts or shoots either);
//   - teardown removes the four tables (the row-level case at the bottom; the
//     manifest test carries the classification).

import (
	"context"
	"net/http"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"

	"github.com/jerry-halo2026/morchat.co/server/internal/testutil"
)

// mediaURLParams attaches several chi URL parameters to one request. The shared
// `withURLParam` helper installs a fresh route context each time, so nesting it
// would leave only the innermost parameter — and the account routes need the IP
// and the creator at once.
func mediaURLParams(req *http.Request, params map[string]string) *http.Request {
	rctx := chi.NewRouteContext()
	for key, value := range params {
		rctx.URLParams.Add(key, value)
	}
	return req.WithContext(context.WithValue(req.Context(), chi.RouteCtxKey, rctx))
}

// mediaIPFixture creates an IP owned by ownerUserID through the handler.
func mediaIPFixture(t *testing.T, ownerUserID, name string) MediaIPResponse {
	t.Helper()
	body := map[string]any{
		"name":      name,
		"persona":   "25-35 岁宝妈的性价比好物推荐官",
		"track":     "家居日用",
		"audience":  "二线城市宝妈",
		"week_goal": 5,
	}
	if ownerUserID != "" {
		body["owner_member_id"] = ownerUserID
	}
	req := workbenchRequest(t, "POST", "/api/workbench/media/ips", body, ownerUserID)
	created := testutil.Decode[MediaIPResponse](t, testHandler.CreateMediaIP, req, http.StatusCreated)
	t.Cleanup(func() {
		// The chain has no foreign keys, so clean up children before the IP.
		dbfx.Exec(t, `DELETE FROM media_shoot WHERE script_id IN (
			SELECT id FROM media_script WHERE topic_id IN (
				SELECT id FROM media_topic WHERE ip_id = $1))`, created.ID)
		dbfx.Exec(t, `DELETE FROM media_script WHERE topic_id IN (
			SELECT id FROM media_topic WHERE ip_id = $1)`, created.ID)
		dbfx.Exec(t, `DELETE FROM media_topic WHERE ip_id = $1`, created.ID)
		dbfx.Exec(t, `UPDATE creator SET media_ip_id = NULL WHERE media_ip_id = $1`, created.ID)
		dbfx.Exec(t, `DELETE FROM media_ip WHERE id = $1`, created.ID)
	})
	return created
}

// mediaTopicFixture creates a topic in the IP's pool.
func mediaTopicFixture(t *testing.T, ownerUserID, ipID, title string) MediaTopicResponse {
	t.Helper()
	body := map[string]any{
		"ip_id":  ipID,
		"title":  title,
		"source": "hot",
		"scores": map[string]any{"pain": 80, "save": 60, "debate": 40, "susp": 70, "fit": 90},
	}
	if ownerUserID != "" {
		body["owner_member_id"] = ownerUserID
	}
	req := workbenchRequest(t, "POST", "/api/workbench/media/topics", body, ownerUserID)
	return testutil.Decode[MediaTopicResponse](t, testHandler.CreateMediaTopic, req, http.StatusCreated)
}

// mediaScriptFixture writes the first version of a topic's script.
func mediaScriptFixture(t *testing.T, ownerUserID, topicID, body string) MediaScriptResponse {
	t.Helper()
	payload := map[string]any{
		"topic_id": topicID,
		"hook":     "别再花 200 块买收纳盒了",
		"body":     body,
		"cta":      "评论区扣 1 拿链接",
		"tags":     []string{"收纳", "性价比"},
	}
	req := workbenchRequest(t, "POST", "/api/workbench/media/scripts", payload, ownerUserID)
	return testutil.Decode[MediaScriptResponse](t, testHandler.CreateMediaScript, req, http.StatusCreated)
}

func mediaShootFixture(t *testing.T, ownerUserID, scriptID, shootDate string) MediaShootResponse {
	t.Helper()
	payload := map[string]any{
		"script_id":  scriptID,
		"shoot_date": shootDate,
		"location":   "三号棚",
		"checklist":  map[string]bool{"灯光": true, "收音": false},
	}
	req := workbenchRequest(t, "POST", "/api/workbench/media/shoots", payload, ownerUserID)
	return testutil.Decode[MediaShootResponse](t, testHandler.CreateMediaShoot, req, http.StatusCreated)
}

// TestMediaIPNameConflicts covers the partial unique index from 734: the same
// name twice is a 409, and the comparison is case-insensitive because two
// personas called "Umi" and "umi" would make every topic ambiguous.
func TestMediaIPNameConflicts(t *testing.T) {
	ip := mediaIPFixture(t, testUserID, "Media IP duplicate fixture")

	if ip.Status != mediaIPStatusActive {
		t.Fatalf("status = %q, want the active default", ip.Status)
	}
	if ip.WeekGoal != 5 {
		t.Fatalf("week_goal = %d, want 5", ip.WeekGoal)
	}

	req := workbenchRequest(t, "POST", "/api/workbench/media/ips", map[string]any{
		"name": ip.Name,
	}, testUserID)
	testutil.Call(t, testHandler.CreateMediaIP, req).Want(http.StatusConflict)

	req = workbenchRequest(t, "POST", "/api/workbench/media/ips", map[string]any{
		"name": strings.ToUpper(ip.Name),
	}, testUserID)
	testutil.Call(t, testHandler.CreateMediaIP, req).Want(http.StatusConflict)

	// Another name is a different persona.
	other := mediaIPFixture(t, testUserID, "Media IP second fixture")
	if other.ID == ip.ID {
		t.Fatal("two different IPs share an id")
	}
}

// TestMediaIPAccountAttach covers 729's link column: attaching a creator puts it
// under the IP, the IP detail lists it, and a second attach is a 409 — an account
// belongs to at most one persona.
func TestMediaIPAccountAttach(t *testing.T) {
	ip := mediaIPFixture(t, testUserID, "Media IP account fixture")
	creator := createWorkbenchCreator(t, testUserID, "Media IP account creator")

	req := workbenchRequest(t, "POST", "/api/workbench/media/ips/"+ip.ID+"/accounts",
		map[string]any{"creator_id": creator.ID}, testUserID)
	req = withURLParam(req, "ipId", ip.ID)
	attached := testutil.Decode[MediaIPAccountResponse](t, testHandler.AttachMediaIPAccount, req, http.StatusCreated)
	if attached.ID != creator.ID || attached.MediaIPID != ip.ID {
		t.Fatalf("attached account = %+v, want creator %s under IP %s", attached, creator.ID, ip.ID)
	}

	req = withURLParam(workbenchRequest(t, "GET", "/api/workbench/media/ips/"+ip.ID, nil, testUserID), "ipId", ip.ID)
	detail := testutil.Decode[MediaIPDetailResponse](t, testHandler.GetMediaIP, req, http.StatusOK)
	if len(detail.Accounts) != 1 || detail.Accounts[0].ID != creator.ID {
		t.Fatalf("IP detail accounts = %+v, want exactly the attached creator", detail.Accounts)
	}

	// Already attached to this IP.
	req = withURLParam(workbenchRequest(t, "POST", "/api/workbench/media/ips/"+ip.ID+"/accounts",
		map[string]any{"creator_id": creator.ID}, testUserID), "ipId", ip.ID)
	testutil.Call(t, testHandler.AttachMediaIPAccount, req).Want(http.StatusConflict)

	// Already attached to another IP: still a 409, because re-pointing would move
	// the account's whole publishing history between personas.
	second := mediaIPFixture(t, testUserID, "Media IP account fixture two")
	req = withURLParam(workbenchRequest(t, "POST", "/api/workbench/media/ips/"+second.ID+"/accounts",
		map[string]any{"creator_id": creator.ID}, testUserID), "ipId", second.ID)
	testutil.Call(t, testHandler.AttachMediaIPAccount, req).Want(http.StatusConflict)

	// Detaching clears the pointer and empties the IP's list.
	req = workbenchRequest(t, "DELETE", "/api/workbench/media/ips/"+ip.ID+"/accounts/"+creator.ID, nil, testUserID)
	req = mediaURLParams(req, map[string]string{"ipId": ip.ID, "creatorId": creator.ID})
	testutil.Call(t, testHandler.DetachMediaIPAccount, req).Want(http.StatusNoContent)

	req = withURLParam(workbenchRequest(t, "GET", "/api/workbench/media/ips/"+ip.ID, nil, testUserID), "ipId", ip.ID)
	detail = testutil.Decode[MediaIPDetailResponse](t, testHandler.GetMediaIP, req, http.StatusOK)
	if len(detail.Accounts) != 0 {
		t.Fatalf("IP detail accounts after detach = %+v, want none", detail.Accounts)
	}
}

// TestMediaTopicScoresStayInRange covers the score card: each dimension is an
// integer 0–100, and an unknown dimension is a typo rather than a sixth axis.
func TestMediaTopicScoresStayInRange(t *testing.T) {
	ip := mediaIPFixture(t, testUserID, "Media IP scores fixture")

	topic := mediaTopicFixture(t, testUserID, ip.ID, "五个抽屉收纳法")
	if topic.Scores["pain"] != 80 || topic.Scores["fit"] != 90 {
		t.Fatalf("scores = %v, want the five values that were sent", topic.Scores)
	}
	// Every dimension is present even though the request could have omitted one.
	if len(topic.Scores) != len(mediaScoreDimensions) {
		t.Fatalf("scores = %v, want all %d dimensions", topic.Scores, len(mediaScoreDimensions))
	}

	for _, scores := range []map[string]any{
		{"pain": 101},
		{"save": -1},
		{"debate": 50.5},
		{"hook": 50},
	} {
		req := workbenchRequest(t, "POST", "/api/workbench/media/topics", map[string]any{
			"ip_id":  ip.ID,
			"title":  "越界打分",
			"scores": scores,
		}, testUserID)
		testutil.Call(t, testHandler.CreateMediaTopic, req).Want(http.StatusBadRequest)
	}

	// A PATCH sends one dimension and keeps the rest.
	req := workbenchRequest(t, "PATCH", "/api/workbench/media/topics/"+topic.ID, map[string]any{
		"scores": map[string]any{"pain": 95},
	}, testUserID)
	req = withURLParam(req, "topicId", topic.ID)
	updated := testutil.Decode[MediaTopicResponse](t, testHandler.UpdateMediaTopic, req, http.StatusOK)
	if updated.Scores["pain"] != 95 || updated.Scores["fit"] != 90 {
		t.Fatalf("scores after PATCH = %v, want pain 95 and fit unchanged", updated.Scores)
	}
}

// TestMediaScriptBodyEditCreatesVersion covers 731's versioning semantics: a PATCH
// that rewrites the copy inserts v2 and leaves v1 readable, while `?inPlace=1`
// overwrites the row it was given.
func TestMediaScriptBodyEditCreatesVersion(t *testing.T) {
	ip := mediaIPFixture(t, testUserID, "Media IP script fixture")
	topic := mediaTopicFixture(t, testUserID, ip.ID, "收纳盒真的越多越好吗")
	v1 := mediaScriptFixture(t, testUserID, topic.ID, "第一版正文：三个抽屉就够了")

	if v1.Version != 1 {
		t.Fatalf("first version = %d, want 1", v1.Version)
	}

	req := workbenchRequest(t, "PATCH", "/api/workbench/media/scripts/"+v1.ID, map[string]any{
		"body": "第二版正文：讲清楚为什么第 4 个抽屉是智商税",
	}, testUserID)
	req = withURLParam(req, "scriptId", v1.ID)
	v2 := testutil.Decode[MediaScriptResponse](t, testHandler.UpdateMediaScript, req, http.StatusOK)
	if v2.Version != 2 {
		t.Fatalf("version after rewrite = %d, want 2", v2.Version)
	}
	if v2.ID == v1.ID {
		t.Fatal("the rewrite overwrote the row instead of creating a version")
	}
	if v2.Body == nil || !strings.Contains(*v2.Body, "第二版") {
		t.Fatalf("v2 body = %v, want the rewritten copy", v2.Body)
	}
	// The untouched fields carry over from v1.
	if v2.Hook == nil || *v2.Hook != *v1.Hook {
		t.Fatalf("v2 hook = %v, want v1's %v", v2.Hook, v1.Hook)
	}

	// v1 is still readable, byte for byte.
	req = withURLParam(workbenchRequest(t, "GET", "/api/workbench/media/scripts/"+v1.ID, nil, testUserID), "scriptId", v1.ID)
	stillOne := testutil.Decode[MediaScriptResponse](t, testHandler.GetMediaScript, req, http.StatusOK)
	if stillOne.Body == nil || !strings.Contains(*stillOne.Body, "第一版") {
		t.Fatalf("v1 body = %v, want the original copy", stillOne.Body)
	}

	// The topic's script list holds both versions.
	req = workbenchRequest(t, "GET", "/api/workbench/media/scripts?topic_id="+topic.ID, nil, testUserID)
	var list struct {
		Scripts []MediaScriptResponse `json:"scripts"`
		Total   int                   `json:"total"`
	}
	testutil.Call(t, testHandler.ListMediaScripts, req).Want(http.StatusOK).JSON(&list)
	if list.Total != 2 {
		t.Fatalf("script list total = %d, want 2 versions", list.Total)
	}

	// A status-only PATCH does not mint a version.
	req = withURLParam(workbenchRequest(t, "PATCH", "/api/workbench/media/scripts/"+v2.ID,
		map[string]any{"status": "approved"}, testUserID), "scriptId", v2.ID)
	approved := testutil.Decode[MediaScriptResponse](t, testHandler.UpdateMediaScript, req, http.StatusOK)
	if approved.ID != v2.ID || approved.Version != 2 || approved.Status != "approved" {
		t.Fatalf("status patch = %+v, want v2 approved in place", approved)
	}

	// `?inPlace=1` overwrites instead.
	req = withURLParam(workbenchRequest(t, "PATCH", "/api/workbench/media/scripts/"+v2.ID+"?inPlace=1",
		map[string]any{"cta": "评论区扣 2 拿链接"}, testUserID), "scriptId", v2.ID)
	inPlace := testutil.Decode[MediaScriptResponse](t, testHandler.UpdateMediaScript, req, http.StatusOK)
	if inPlace.ID != v2.ID || inPlace.Version != 2 {
		t.Fatalf("in-place patch = %+v, want the same v2 row", inPlace)
	}
	if inPlace.CTA == nil || *inPlace.CTA != "评论区扣 2 拿链接" {
		t.Fatalf("in-place cta = %v, want the patched value", inPlace.CTA)
	}
}

// TestMediaShootDateFilter covers the calendar read: `from`/`to` are inclusive
// calendar days on `shoot_date`, and a shoot outside the window is not listed.
func TestMediaShootDateFilter(t *testing.T) {
	ip := mediaIPFixture(t, testUserID, "Media IP shoot fixture")
	topic := mediaTopicFixture(t, testUserID, ip.ID, "拍摄排期用选题")
	script := mediaScriptFixture(t, testUserID, topic.ID, "排期脚本正文")

	// `shoot_date` is a DATE column: this is inserted through the handler, so the
	// filter is exercised against the same write path the API uses.
	early := mediaShootFixture(t, testUserID, script.ID, "2021-01-05")
	late := mediaShootFixture(t, testUserID, script.ID, "2021-01-20")

	if early.ShootDate != "2021-01-05" {
		t.Fatalf("shoot_date = %q, want the date that was sent", early.ShootDate)
	}

	req := workbenchRequest(t, "GET",
		"/api/workbench/media/shoots?from=2021-01-10&to=2021-01-31&script_id="+script.ID, nil, testUserID)
	var window struct {
		Shoots []MediaShootResponse `json:"shoots"`
		Total  int                  `json:"total"`
	}
	testutil.Call(t, testHandler.ListMediaShoots, req).Want(http.StatusOK).JSON(&window)
	if window.Total != 1 || window.Shoots[0].ID != late.ID {
		t.Fatalf("window list = %+v, want only the late shoot", window.Shoots)
	}

	// The boundaries are inclusive.
	req = workbenchRequest(t, "GET",
		"/api/workbench/media/shoots?from=2021-01-05&to=2021-01-05&script_id="+script.ID, nil, testUserID)
	testutil.Call(t, testHandler.ListMediaShoots, req).Want(http.StatusOK).JSON(&window)
	if window.Total != 1 || window.Shoots[0].ID != early.ID {
		t.Fatalf("single-day window = %+v, want the early shoot", window.Shoots)
	}

	// Open-ended from.
	req = workbenchRequest(t, "GET", "/api/workbench/media/shoots?from=2021-01-10&script_id="+script.ID, nil, testUserID)
	testutil.Call(t, testHandler.ListMediaShoots, req).Want(http.StatusOK).JSON(&window)
	if window.Total != 1 || window.Shoots[0].ID != late.ID {
		t.Fatalf("open-ended window = %+v, want only the late shoot", window.Shoots)
	}

	// A reversed window is a 400, not an empty list that looks like "no shoots".
	req = workbenchRequest(t, "GET", "/api/workbench/media/shoots?from=2021-01-31&to=2021-01-01", nil, testUserID)
	testutil.Call(t, testHandler.ListMediaShoots, req).Want(http.StatusBadRequest)
}

// TestMediaMemberCannotWriteOthersTopic covers the write gate for the whole
// chain: a member reads everything, but can only change its own rows — and a
// script or shoot is gated through the topic it came from.
func TestMediaMemberCannotWriteOthersTopic(t *testing.T) {
	memberUserID := workbenchTestMember(t)
	ip := mediaIPFixture(t, testUserID, "Media IP permission fixture")
	// A topic owned by the workspace owner (testUserID), not by the member.
	topic := mediaTopicFixture(t, testUserID, ip.ID, "别人的选题")
	script := mediaScriptFixture(t, testUserID, topic.ID, "别人的脚本")

	// Reads are member-wide.
	req := workbenchRequest(t, "GET", "/api/workbench/media/topics?ip_id="+ip.ID, nil, memberUserID)
	testutil.Call(t, testHandler.ListMediaTopics, req).Want(http.StatusOK)

	req = withURLParam(workbenchRequest(t, "PATCH", "/api/workbench/media/topics/"+topic.ID,
		map[string]any{"title": "我要改别人的选题"}, memberUserID), "topicId", topic.ID)
	testutil.Call(t, testHandler.UpdateMediaTopic, req).Want(http.StatusForbidden)

	req = withURLParam(workbenchRequest(t, "DELETE", "/api/workbench/media/topics/"+topic.ID, nil, memberUserID), "topicId", topic.ID)
	testutil.Call(t, testHandler.DeleteMediaTopic, req).Want(http.StatusForbidden)

	// The script inherits the topic's gate.
	req = withURLParam(workbenchRequest(t, "PATCH", "/api/workbench/media/scripts/"+script.ID,
		map[string]any{"body": "改别人的正文"}, memberUserID), "scriptId", script.ID)
	testutil.Call(t, testHandler.UpdateMediaScript, req).Want(http.StatusForbidden)

	// So does the shoot.
	shoot := mediaShootFixture(t, testUserID, script.ID, "2021-02-01")
	req = withURLParam(workbenchRequest(t, "PATCH", "/api/workbench/media/shoots/"+shoot.ID,
		map[string]any{"location": "别人的棚"}, memberUserID), "shootId", shoot.ID)
	testutil.Call(t, testHandler.UpdateMediaShoot, req).Want(http.StatusForbidden)

	// A topic the member creates is its own, and it can edit that one.
	own := mediaTopicFixture(t, memberUserID, ip.ID, "我自己抓的选题")
	req = withURLParam(workbenchRequest(t, "PATCH", "/api/workbench/media/topics/"+own.ID,
		map[string]any{"title": "我自己改"}, memberUserID), "topicId", own.ID)
	testutil.Call(t, testHandler.UpdateMediaTopic, req).Want(http.StatusOK)
}

// TestMediaTeardownRemovesContentTables exercises the teardown statement itself
// for the four new tables: the manifest test classifies them, this case proves
// DeleteWorkspaceWorkbenchLedger actually reaches them.
func TestMediaTeardownRemovesContentTables(t *testing.T) {
	// A throwaway workspace, so the one the rest of the suite shares is untouched.
	slug := strings.NewReplacer("_", "-", "/", "-").Replace(strings.ToLower(t.Name()))
	workspaceID := dbfx.Workspace(t, "Media teardown workspace", slug)
	t.Cleanup(func() {
		for _, table := range []string{"media_shoot", "media_script", "media_topic", "media_ip"} {
			dbfx.Exec(t, `DELETE FROM `+table+` WHERE workspace_id = $1`, workspaceID)
		}
	})

	ipID := dbfx.Insert(t, "media_ip", testutil.Cols{
		"workspace_id": workspaceID,
		"name":         "teardown ip",
	})
	topicID := dbfx.Insert(t, "media_topic", testutil.Cols{
		"workspace_id": workspaceID,
		"ip_id":        ipID,
		"title":        "teardown topic",
	})
	scriptID := dbfx.Insert(t, "media_script", testutil.Cols{
		"workspace_id": workspaceID,
		"topic_id":     topicID,
	})
	dbfx.Insert(t, "media_shoot", testutil.Cols{
		"workspace_id": workspaceID,
		"script_id":    scriptID,
		"shoot_date":   testutil.Raw("DATE '2021-03-01'"),
	})

	if err := testHandler.Queries.DeleteWorkspaceWorkbenchLedger(t.Context(), parseUUID(workspaceID)); err != nil {
		t.Fatalf("teardown: %v", err)
	}

	for _, table := range []string{"media_ip", "media_topic", "media_script", "media_shoot"} {
		if left := dbfx.Count(t, `SELECT count(*) FROM `+table+` WHERE workspace_id = $1`, workspaceID); left != 0 {
			t.Fatalf("%s still holds %d rows after teardown", table, left)
		}
	}
}
