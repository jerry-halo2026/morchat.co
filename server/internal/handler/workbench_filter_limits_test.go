package handler

// Two rules that the whole workbench has to answer the same way, over the domains
// this batch owns (creator / CRM / media / BD / HR):
//
//   - `?q=` is a substring search, not a pattern. It reaches SQL as
//     `ILIKE '%' || $n || '%'`, so an unescaped `%` widens the filter to the whole
//     ledger and the search box silently answers a different question
//     (workbenchLikePattern).
//   - a TEXT column has no length of its own. A pasted megabyte lands in the row
//     and comes back through every list request that selects it, so the handler
//     refuses the paste at the column's cap and says which box was too long
//     (workbenchTextLimits / workbenchTextValue).

import (
	"fmt"
	"net/http"
	"strings"
	"testing"

	"github.com/jerry-halo2026/morchat.co/server/internal/testutil"
)

// ---- 1. ?q= is a substring, not a LIKE pattern ------------------------------

// workbenchSearchProbe is one ledger row plus the character its text really
// contains (`""` for the row that contains neither metacharacter).
type workbenchSearchProbe struct {
	id   string
	text string
}

// workbenchAssertSubstringSearch lists through one endpoint and asserts that the
// rows without the character are filtered out. The rows are compared by id, not by
// totals: the suite shares its database with other packages' parallel runs
// (server/internal/testutil), so a count would depend on rows this case never made.
func workbenchAssertSubstringSearch(t *testing.T, list func(query string) map[string]bool, probes []workbenchSearchProbe, metacharacter string) {
	t.Helper()
	query := metacharacter
	if metacharacter == "%" {
		query = "%25" // the URL spelling of the literal character
	}
	matched := list("&q=" + query)

	seen := 0
	for _, probe := range probes {
		wants := strings.Contains(probe.text, metacharacter)
		if wants {
			seen++
		}
		if matched[probe.id] != wants {
			t.Fatalf("?q=%s matched=%v for %q (id %s), want %v — LIKE metacharacters reach SQL unescaped",
				query, matched[probe.id], probe.text, probe.id, wants)
		}
	}
	if seen == len(probes) {
		t.Fatalf("the fixture is wrong: every probe contains %q, so this case could not tell escaping from not", metacharacter)
	}
}

func TestWorkbenchCreatorSearchIsSubstring(t *testing.T) {
	probes := []workbenchSearchProbe{
		{text: "百分号百分之%达人", id: createWorkbenchCreator(t, "", "百分号百分之%达人").ID},
		{text: "下划线下划线_达人", id: createWorkbenchCreator(t, "", "下划线下划线_达人").ID},
		{text: "普通达人普通达人", id: createWorkbenchCreator(t, "", "普通达人普通达人").ID},
	}
	list := func(query string) map[string]bool {
		req := workbenchRequest(t, "GET", "/api/workbench/creators?limit=200"+query, nil, "")
		var page struct {
			Creators []CreatorResponse `json:"creators"`
		}
		testutil.Call(t, testHandler.ListCreators, req).Want(http.StatusOK).JSON(&page)
		ids := make(map[string]bool, len(page.Creators))
		for _, row := range page.Creators {
			ids[row.ID] = true
		}
		return ids
	}
	workbenchAssertSubstringSearch(t, list, probes, "%")
	workbenchAssertSubstringSearch(t, list, probes, "_")
}

func TestWorkbenchHrJobSearchIsSubstring(t *testing.T) {
	probes := []workbenchSearchProbe{
		{text: "后端工程师后端%", id: createHrJobFixture(t, "", "后端工程师后端%").ID},
		{text: "前端工程师前端_", id: createHrJobFixture(t, "", "前端工程师前端_").ID},
		{text: "产品经理产品经理", id: createHrJobFixture(t, "", "产品经理产品经理").ID},
	}
	list := func(query string) map[string]bool {
		req := workbenchRequest(t, "GET", "/api/workbench/hr/jobs?limit=200"+query, nil, "")
		var page struct {
			Jobs []HrJobResponse `json:"jobs"`
		}
		testutil.Call(t, testHandler.ListHrJobs, req).Want(http.StatusOK).JSON(&page)
		ids := make(map[string]bool, len(page.Jobs))
		for _, row := range page.Jobs {
			ids[row.ID] = true
		}
		return ids
	}
	workbenchAssertSubstringSearch(t, list, probes, "%")
	workbenchAssertSubstringSearch(t, list, probes, "_")
}

// The `?q=` filter in workbench_guide.sql belongs to the question bank
// (`GET /api/workbench/hr/questions`); the interview-guide list has no query
// parameter, so this is the endpoint that SQL is read by.
func TestWorkbenchHrQuestionSearchIsSubstring(t *testing.T) {
	probes := []workbenchSearchProbe{
		{text: "你用过 % 吗", id: createHrQuestionFixture(t, "你用过 % 吗", nil).ID},
		{text: "你写过 _ 吗", id: createHrQuestionFixture(t, "你写过 _ 吗", nil).ID},
		{text: "你带过团队吗", id: createHrQuestionFixture(t, "你带过团队吗", nil).ID},
	}
	list := func(query string) map[string]bool {
		req := workbenchRequest(t, "GET", "/api/workbench/hr/questions?limit=200"+query, nil, "")
		var page struct {
			Questions []HrQuestionResponse `json:"questions"`
		}
		testutil.Call(t, testHandler.ListHrQuestions, req).Want(http.StatusOK).JSON(&page)
		ids := make(map[string]bool, len(page.Questions))
		for _, row := range page.Questions {
			ids[row.ID] = true
		}
		return ids
	}
	workbenchAssertSubstringSearch(t, list, probes, "%")
	workbenchAssertSubstringSearch(t, list, probes, "_")
}

// ---- 2. every list TEXT column has a cap -----------------------------------

// workbenchTextCapFixture is the create chain the capped columns hang off: one
// creator/client/brief/collab/settlement and one IP → topic → script, so every
// case below PATCHes an existing row instead of creating a new one per probe.
func workbenchTextCapFixture(t *testing.T) (client CrmClientResponse, brief CrmBriefResponse,
	collab CrmCollabResponse, settlement CrmSettlementResponse, ip MediaIPResponse,
	topic MediaTopicResponse, script MediaScriptResponse, activity BdActivityResponse,
	campaign BdCampaignResponse) {
	t.Helper()
	creator := createWorkbenchCreator(t, "", "Caps creator")
	client = createWorkbenchClient(t, "", "Caps client")
	brief = createWorkbenchBrief(t, client.ID, "Caps brief")
	collab = createWorkbenchCollab(t, brief.ID, creator.ID, nil)

	req := workbenchRequest(t, "POST", "/api/workbench/crm/settlements", map[string]any{
		"collab_id": collab.ID,
		"kind":      "final",
		"amount":    100,
		"currency":  "CNY",
		"due_at":    "2026-12-01",
	}, "")
	settlement = testutil.Decode[CrmSettlementResponse](t, testHandler.CreateCrmSettlement, req, http.StatusCreated)
	t.Cleanup(func() { dbfx.Exec(t, `DELETE FROM crm_settlement WHERE id = $1`, settlement.ID) })

	req = workbenchRequest(t, "POST", "/api/workbench/media/ips",
		map[string]any{"name": "Caps IP"}, "")
	ip = testutil.Decode[MediaIPResponse](t, testHandler.CreateMediaIP, req, http.StatusCreated)
	t.Cleanup(func() { dbfx.Exec(t, `DELETE FROM media_ip WHERE id = $1`, ip.ID) })

	req = workbenchRequest(t, "POST", "/api/workbench/media/topics",
		map[string]any{"ip_id": ip.ID, "title": "Caps topic"}, "")
	topic = testutil.Decode[MediaTopicResponse](t, testHandler.CreateMediaTopic, req, http.StatusCreated)
	t.Cleanup(func() { dbfx.Exec(t, `DELETE FROM media_topic WHERE id = $1`, topic.ID) })

	req = workbenchRequest(t, "POST", "/api/workbench/media/scripts",
		map[string]any{"topic_id": topic.ID, "body": "Caps body"}, "")
	script = testutil.Decode[MediaScriptResponse](t, testHandler.CreateMediaScript, req, http.StatusCreated)
	t.Cleanup(func() { dbfx.Exec(t, `DELETE FROM media_script WHERE id = $1`, script.ID) })

	activity = bdCreateActivity(t, testWorkspaceID, "", creator.ID, nil)
	campaign = bdCreateCampaign(t, testWorkspaceID, "", nil)
	return client, brief, collab, settlement, ip, topic, script, activity, campaign
}

func TestWorkbenchTextCapsBoundListColumns(t *testing.T) {
	client, brief, collab, settlement, ip, topic, script, activity, campaign := workbenchTextCapFixture(t)

	// path → handler, with the row id in the chi URL param the router uses.
	patch := func(path, param, id string, h http.HandlerFunc, field string) func(*testing.T, string) *testutil.Response {
		return func(t *testing.T, value string) *testutil.Response {
			t.Helper()
			req := workbenchRequest(t, "PATCH", path+"/"+id, map[string]any{field: value}, "")
			req = withURLParam(req, param, id)
			return testutil.Call(t, h, req)
		}
	}

	cases := []struct {
		column string
		field  string
		limit  int
		write  func(*testing.T, string) *testutil.Response
	}{
		{"crm_brief.title", "title", workbenchTitleLimit,
			patch("/api/workbench/crm/briefs", "briefId", brief.ID, testHandler.UpdateCrmBrief, "title")},
		{"media_topic.title", "title", workbenchTitleLimit,
			patch("/api/workbench/media/topics", "topicId", topic.ID, testHandler.UpdateMediaTopic, "title")},
		{"crm_client.brand", "brand", workbenchTitleLimit,
			patch("/api/workbench/crm/clients", "clientId", client.ID, testHandler.UpdateCrmClient, "brand")},
		{"bd_campaign.source_keyword", "source_keyword", workbenchTitleLimit,
			bdPatch(testHandler.UpdateBdCampaign, "/api/workbench/bd/campaigns", "campaignId", campaign.ID, "source_keyword")},
		{"media_ip.persona", "persona", workbenchTitleLimit,
			patch("/api/workbench/media/ips", "ipId", ip.ID, testHandler.UpdateMediaIP, "persona")},
		{"creator_activity.summary", "summary", workbenchNoteLimit,
			bdPatch(testHandler.UpdateBdActivity, "/api/workbench/bd/activities", "activityId", activity.ID, "summary")},
		{"crm_settlement.note", "note", workbenchNoteLimit,
			patch("/api/workbench/crm/settlements", "settlementId", settlement.ID, testHandler.UpdateCrmSettlement, "note")},
		{"media_script.body", "body", workbenchNoteLimit,
			patch("/api/workbench/media/scripts?inPlace=1", "scriptId", script.ID, testHandler.UpdateMediaScript, "body")},
		{"media_script.cta", "cta", workbenchNoteLimit,
			patch("/api/workbench/media/scripts?inPlace=1", "scriptId", script.ID, testHandler.UpdateMediaScript, "cta")},
		{"crm_collab.publish_url", "publish_url", workbenchURLLimit,
			patch("/api/workbench/crm/collabs", "collabId", collab.ID, testHandler.UpdateCrmCollab, "publish_url")},
		{"crm_settlement.invoice_no", "invoice_no", workbenchInvoiceLimit,
			patch("/api/workbench/crm/settlements", "settlementId", settlement.ID, testHandler.UpdateCrmSettlement, "invoice_no")},
		{"media_ip.color", "color", workbenchColorLimit,
			patch("/api/workbench/media/ips", "ipId", ip.ID, testHandler.UpdateMediaIP, "color")},
	}

	for _, testCase := range cases {
		testCase := testCase
		t.Run(testCase.column, func(t *testing.T) {
			atLimit := strings.Repeat("a", testCase.limit)
			testCase.write(t, atLimit).Want(http.StatusOK)

			res := testCase.write(t, atLimit+"a")
			res.Want(http.StatusBadRequest)
			want := fmt.Sprintf("%s must be at most %d characters", testCase.field, testCase.limit)
			if !strings.Contains(res.Text(), want) {
				t.Fatalf("%s +1 answered %q, want it to name the field and the cap (%q)",
					testCase.column, res.Text(), want)
			}
		})
	}

	// The cap counts runes, not bytes: 512 CJK characters and 512 emoji both fit,
	// and the byte length of the emoji (2048) is not what is measured.
	t.Run("runes not bytes", func(t *testing.T) {
		write := cases[0].write
		write(t, strings.Repeat("名", workbenchTitleLimit)).Want(http.StatusOK)
		write(t, strings.Repeat("😀", workbenchTitleLimit)).Want(http.StatusOK)
		write(t, strings.Repeat("😀", workbenchTitleLimit+1)).Want(http.StatusBadRequest)
	})
}

// bdPatch is patch() for the BD ledgers, whose requests carry X-Workspace-ID.
func bdPatch(h http.HandlerFunc, path, param, id, field string) func(*testing.T, string) *testutil.Response {
	return func(t *testing.T, value string) *testutil.Response {
		t.Helper()
		req := bdRequestIn(t, "PATCH", path+"/"+id, testWorkspaceID, map[string]any{field: value}, "")
		req = withURLParam(req, param, id)
		return testutil.Call(t, h, req)
	}
}
