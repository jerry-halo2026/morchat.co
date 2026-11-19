package handler

// Interview question bank and guide tests (docs/engineering/WORKBENCH-API.md §14).
//
// Two properties this domain has to prove beyond the shared ledger rules:
//
//   - the bank refuses to hold the same sentence twice, and a guide is one per
//     candidate per round — both are 409s with a message rather than a constraint
//     violation;
//   - a saved guide is a **snapshot**: editing the bank row afterwards must leave
//     the outline's items exactly as they were, because that copy is the record of
//     what was actually asked.
//
// The generator is also covered here, in the one configuration a test can be sure
// of: no model configured, so `source='template'` and the deterministic skeletons.

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"strings"
	"testing"

	"github.com/jerry-halo2026/morchat.co/server/internal/testutil"
	"github.com/jerry-halo2026/morchat.co/server/internal/util"
)

// createHrQuestionFixture creates one bank row through the handler and registers
// its cleanup.
func createHrQuestionFixture(t *testing.T, question string, body map[string]any) HrQuestionResponse {
	t.Helper()
	payload := map[string]any{
		"dimension": "skill",
		"question":  question,
		"intent":    "验证该项技能是否动手做过",
		"signals":   "能说出职责边界与具体数字",
		"red_flags": "只复述团队成果",
	}
	for key, value := range body {
		payload[key] = value
	}
	req := workbenchRequest(t, "POST", "/api/workbench/hr/questions", payload, testUserID)
	created := testutil.Decode[HrQuestionResponse](t, testHandler.CreateHrQuestion, req, http.StatusCreated)
	t.Cleanup(func() { dbfx.Exec(t, `DELETE FROM hr_question WHERE id = $1`, created.ID) })
	return created
}

// createHrGuideFixture saves one outline for a candidate and registers its cleanup.
func createHrGuideFixture(t *testing.T, candidateID string, round int, items []HrGuideItem, want int) HrGuideResponse {
	t.Helper()
	body := map[string]any{"candidate_id": candidateID, "round": round}
	if items != nil {
		body["items"] = items
	}
	req := workbenchRequest(t, "POST", "/api/workbench/hr/guides", body, testUserID)
	created := testutil.Decode[HrGuideResponse](t, testHandler.CreateHrInterviewGuide, req, want)
	if want == http.StatusCreated {
		t.Cleanup(func() { dbfx.Exec(t, `DELETE FROM hr_interview_guide WHERE id = $1`, created.ID) })
	}
	return created
}

// guideSnapshotItem is one snapshot entry as a test spells it.
func guideSnapshotItem(dimension, question, intent string) HrGuideItem {
	return HrGuideItem{
		Dimension: dimension,
		Question:  question,
		Intent:    intent,
		Signals:   "能说出具体做法与结果",
		RedFlags:  "含糊其辞",
	}
}

// TestGuideQuestionBankRejectsDuplicateSentence covers ①: the same sentence is one
// bank row. The duplicate is spelled differently on purpose — the identity the
// index enforces is `lower(question)`, and the handler trims before it compares.
func TestGuideQuestionBankRejectsDuplicateSentence(t *testing.T) {
	created := createHrQuestionFixture(t, "请讲讲你做过最难的一次性能优化。", nil)
	if created.UsageCount != 0 {
		t.Fatalf("new question usage_count = %d, want 0", created.UsageCount)
	}

	for _, duplicate := range []string{
		"请讲讲你做过最难的一次性能优化。",
		"  请讲讲你做过最难的一次性能优化。  ",
	} {
		req := workbenchRequest(t, "POST", "/api/workbench/hr/questions", map[string]any{
			"dimension": "skill",
			"question":  duplicate,
		}, testUserID)
		testutil.Call(t, testHandler.CreateHrQuestion, req).Want(http.StatusConflict)
	}

	// A different sentence in the same dimension is fine.
	other := createHrQuestionFixture(t, "讲一次你判断错方向、后来怎么纠正的经历。", map[string]any{
		"dimension": "potential",
	})
	if other.ID == created.ID {
		t.Fatalf("second question reused the first row")
	}

	// Editing a row onto an existing sentence is a 409 too, and a row keeping its
	// own text is not.
	req := workbenchRequest(t, "PATCH", "/api/workbench/hr/questions/"+other.ID, map[string]any{
		"question": "请讲讲你做过最难的一次性能优化。",
	}, testUserID)
	req = withURLParam(req, "questionId", other.ID)
	testutil.Call(t, testHandler.UpdateHrQuestion, req).Want(http.StatusConflict)

	req = workbenchRequest(t, "PATCH", "/api/workbench/hr/questions/"+other.ID, map[string]any{
		"question": "讲一次你判断错方向、后来怎么纠正的经历。",
		"intent":   "看复盘是否真实",
	}, testUserID)
	req = withURLParam(req, "questionId", other.ID)
	testutil.Decode[HrQuestionResponse](t, testHandler.UpdateHrQuestion, req, http.StatusOK)

	// A soft-deleted row frees its sentence, exactly like the partial index.
	req = workbenchRequest(t, "DELETE", "/api/workbench/hr/questions/"+other.ID, nil, testUserID)
	req = withURLParam(req, "questionId", other.ID)
	testutil.Call(t, testHandler.DeleteHrQuestion, req).Want(http.StatusNoContent)
	createHrQuestionFixture(t, "讲一次你判断错方向、后来怎么纠正的经历。", map[string]any{
		"dimension": "potential",
	})
}

// TestGuideQuestionDimensionVocabulary covers ②: `dimension` is the scorecard's
// four plus `risk`, and anything else is a 400 rather than a row nothing can group.
func TestGuideQuestionDimensionVocabulary(t *testing.T) {
	req := workbenchRequest(t, "POST", "/api/workbench/hr/questions", map[string]any{
		"dimension": "communication",
		"question":  "描述一次跨部门协作。",
	}, testUserID)
	testutil.Call(t, testHandler.CreateHrQuestion, req).Want(http.StatusBadRequest)

	req = workbenchRequest(t, "POST", "/api/workbench/hr/questions", map[string]any{
		"question": "描述一次跨部门协作。",
	}, testUserID)
	testutil.Call(t, testHandler.CreateHrQuestion, req).Want(http.StatusBadRequest)

	req = workbenchRequest(t, "GET", "/api/workbench/hr/questions?dimension=communication", nil, testUserID)
	testutil.Call(t, testHandler.ListHrQuestions, req).Want(http.StatusBadRequest)

	// `risk` is a first-class dimension even though the scorecard has no such column.
	risk := createHrQuestionFixture(t, "上一份工作为什么离开？", map[string]any{"dimension": "risk"})
	if risk.Dimension != "risk" {
		t.Fatalf("dimension = %q, want risk", risk.Dimension)
	}
}

// TestGuideItemsCeiling covers ③: 40 entries is the contract's ceiling, and 41 is
// a 400 instead of a row the client cannot render a count against.
func TestGuideItemsCeiling(t *testing.T) {
	job := createHrJobFixture(t, testUserID, "Guide ceiling job")
	candidate := createHrCandidateFixture(t, job.ID, "Ceiling Candidate", "+8613800000010")

	build := func(n int) []HrGuideItem {
		items := make([]HrGuideItem, 0, n)
		for i := 0; i < n; i++ {
			items = append(items, guideSnapshotItem("skill", fmt.Sprintf("第 %d 个问题：讲讲你的项目。", i), "验证项目深度"))
		}
		return items
	}

	saved := createHrGuideFixture(t, candidate.ID, 1, build(hrGuideMaxItems), http.StatusCreated)
	if len(saved.Items) != hrGuideMaxItems {
		t.Fatalf("saved %d items, want the ceiling %d", len(saved.Items), hrGuideMaxItems)
	}

	// Appending to a full outline is a 400 rather than a silent drop.
	req := workbenchRequest(t, "POST", "/api/workbench/hr/guides/"+saved.ID+"/items",
		guideSnapshotItem("culture", "多出来的一个问题？", "验证协作"), testUserID)
	req = withURLParam(req, "guideId", saved.ID)
	testutil.Call(t, testHandler.AppendHrGuideItem, req).Want(http.StatusBadRequest)

	// A create that starts over the ceiling is rejected before the row exists.
	createHrGuideFixture(t, candidate.ID, 2, build(hrGuideMaxItems+1), http.StatusBadRequest)

	// The same ceiling applies to a PATCH that resends the array.
	req = workbenchRequest(t, "PATCH", "/api/workbench/hr/guides/"+saved.ID, map[string]any{
		"items": build(hrGuideMaxItems + 1),
	}, testUserID)
	req = withURLParam(req, "guideId", saved.ID)
	testutil.Call(t, testHandler.UpdateHrInterviewGuide, req).Want(http.StatusBadRequest)
}

// TestGuideItemScoreRange covers ④: `score` is null or 0-5 — the scale the
// scorecard's dimensions use — so 6 is a 400 on every path that writes one.
func TestGuideItemScoreRange(t *testing.T) {
	job := createHrJobFixture(t, testUserID, "Guide score job")
	candidate := createHrCandidateFixture(t, job.ID, "Score Candidate", "+8613800000011")

	six := int16(6)
	guide := createHrGuideFixture(t, candidate.ID, 1, []HrGuideItem{
		{
			Dimension: "skill",
			Question:  "讲讲你在 Go 上最得意的一次重构。",
			Intent:    "验证 Go 的动手深度",
			Signals:   "能说清取舍与收益",
			Score:     &six,
		},
	}, http.StatusBadRequest)
	if guide.ID != "" {
		t.Fatalf("a score of 6 should not have created a guide")
	}

	zero := int16(0)
	saved := createHrGuideFixture(t, candidate.ID, 1, []HrGuideItem{
		{
			Dimension: "skill",
			Question:  "讲讲你在 Go 上最得意的一次重构。",
			Intent:    "验证 Go 的动手深度",
			Signals:   "能说清取舍与收益",
			Score:     &zero,
		},
	}, http.StatusCreated)
	if saved.Items[0].Score == nil || *saved.Items[0].Score != 0 {
		t.Fatalf("stored score = %v, want 0 (a scored 0 is not \"unscored\")", saved.Items[0].Score)
	}

	// The item patch route carries the same scale, and can clear a score.
	req := workbenchRequest(t, "PATCH", "/api/workbench/hr/guides/"+saved.ID+"/items/0",
		map[string]any{"score": 6}, testUserID)
	req = withURLParams(req, "guideId", saved.ID, "index", "0")
	testutil.Call(t, testHandler.UpdateHrGuideItem, req).Want(http.StatusBadRequest)

	req = workbenchRequest(t, "PATCH", "/api/workbench/hr/guides/"+saved.ID+"/items/0",
		map[string]any{"score": 5, "asked": true, "note": "答得具体"}, testUserID)
	req = withURLParams(req, "guideId", saved.ID, "index", "0")
	scored := testutil.Decode[HrGuideResponse](t, testHandler.UpdateHrGuideItem, req, http.StatusOK)
	if scored.Items[0].Score == nil || *scored.Items[0].Score != 5 {
		t.Fatalf("score = %v, want 5", scored.Items[0].Score)
	}
	if !scored.Items[0].Asked {
		t.Fatalf("asked = false after ticking it")
	}

	req = workbenchRequest(t, "PATCH", "/api/workbench/hr/guides/"+saved.ID+"/items/0",
		map[string]any{"score": nil}, testUserID)
	req = withURLParams(req, "guideId", saved.ID, "index", "0")
	cleared := testutil.Decode[HrGuideResponse](t, testHandler.UpdateHrGuideItem, req, http.StatusOK)
	if cleared.Items[0].Score != nil {
		t.Fatalf("score = %v, want nil after clearing it", *cleared.Items[0].Score)
	}
	if !cleared.Items[0].Asked || cleared.Items[0].Note != "答得具体" {
		t.Fatalf("clearing the score reset the other fields: %+v", cleared.Items[0])
	}

	// An out-of-range index is the same answer as a missing row.
	req = workbenchRequest(t, "PATCH", "/api/workbench/hr/guides/"+saved.ID+"/items/9",
		map[string]any{"asked": true}, testUserID)
	req = withURLParams(req, "guideId", saved.ID, "index", "9")
	testutil.Call(t, testHandler.UpdateHrGuideItem, req).Want(http.StatusNotFound)
}

// TestGuideOnePerCandidateRound covers ⑤: one outline per candidate per round, while
// the same candidate's next round and the same round for another candidate are both
// fine.
func TestGuideOnePerCandidateRound(t *testing.T) {
	job := createHrJobFixture(t, testUserID, "Guide uniqueness job")
	candidate := createHrCandidateFixture(t, job.ID, "Round Candidate", "+8613800000012")
	other := createHrCandidateFixture(t, job.ID, "Other Round Candidate", "+8613800000013")

	first := createHrGuideFixture(t, candidate.ID, 1, []HrGuideItem{
		guideSnapshotItem("skill", "第一个问题？", "验证技能"),
	}, http.StatusCreated)
	if first.Status != "draft" {
		t.Fatalf("new guide status = %q, want draft", first.Status)
	}
	if first.JobID == nil || *first.JobID != job.ID {
		t.Fatalf("new guide job_id = %v, want the candidate's requisition %s", first.JobID, job.ID)
	}

	// Same candidate, same round → 409.
	createHrGuideFixture(t, candidate.ID, 1, nil, http.StatusConflict)

	// Same candidate, next round → allowed, and both rounds keep their own outline.
	second := createHrGuideFixture(t, candidate.ID, 2, nil, http.StatusCreated)
	if second.Round != 2 {
		t.Fatalf("round = %d, want 2", second.Round)
	}

	// Another candidate's round 1 → allowed.
	createHrGuideFixture(t, other.ID, 1, nil, http.StatusCreated)

	// Moving a round onto a taken one is a 409; leaving it alone is not.
	req := workbenchRequest(t, "PATCH", "/api/workbench/hr/guides/"+second.ID, map[string]any{
		"round": 1,
	}, testUserID)
	req = withURLParam(req, "guideId", second.ID)
	testutil.Call(t, testHandler.UpdateHrInterviewGuide, req).Want(http.StatusConflict)

	req = workbenchRequest(t, "PATCH", "/api/workbench/hr/guides/"+second.ID, map[string]any{
		"round":  2,
		"status": "ready",
	}, testUserID)
	req = withURLParam(req, "guideId", second.ID)
	updated := testutil.Decode[HrGuideResponse](t, testHandler.UpdateHrInterviewGuide, req, http.StatusOK)
	if updated.Status != "ready" {
		t.Fatalf("status = %q, want ready", updated.Status)
	}

	// The list filters by candidate and status.
	req = workbenchRequest(t, "GET", "/api/workbench/hr/guides?candidate_id="+candidate.ID, nil, testUserID)
	var page struct {
		Guides []HrGuideResponse `json:"guides"`
		Total  int               `json:"total"`
	}
	testutil.Call(t, testHandler.ListHrInterviewGuides, req).Want(http.StatusOK).JSON(&page)
	if page.Total != 2 || len(page.Guides) != 2 {
		t.Fatalf("candidate's guide list = %d/%d, want 2", page.Total, len(page.Guides))
	}

	// A zero round is rejected: it would be a second way to say round 1.
	req = workbenchRequest(t, "POST", "/api/workbench/hr/guides", map[string]any{
		"candidate_id": candidate.ID,
		"round":        0,
	}, testUserID)
	testutil.Call(t, testHandler.CreateHrInterviewGuide, req).Want(http.StatusBadRequest)
}

// TestGuideGenerateTemplateDraft covers ⑥: with no model configured the generator
// answers a template draft — 6-8 items, every one carrying its intent and signals,
// every dimension covered — and nothing is written.
func TestGuideGenerateTemplateDraft(t *testing.T) {
	job := createHrJobFixture(t, testUserID, "Backend Engineer")
	req := workbenchRequest(t, "PATCH", "/api/workbench/hr/jobs/"+job.ID, map[string]any{
		"jd":           "负责订单服务的 Go 微服务开发，要求熟悉 PostgreSQL 与分布式事务。",
		"requirements": "3-5 年 Go 服务端经验，带过小团队优先。",
		"keywords":     []string{"Go", "PostgreSQL", "分布式"},
	}, testUserID)
	req = withURLParam(req, "jobId", job.ID)
	testutil.Decode[HrJobResponse](t, testHandler.UpdateHrJob, req, http.StatusOK)

	candidate := createHrCandidateFixture(t, job.ID, "Draft Candidate", "+8613800000014")
	req = workbenchRequest(t, "PATCH", "/api/workbench/hr/candidates/"+candidate.ID, map[string]any{
		"resume_text":      "五年 Go 服务端开发，做过订单与支付系统，主导过一次分库分表迁移。",
		"edu":              "本科",
		"years_experience": 5,
	}, testUserID)
	req = withURLParam(req, "candidateId", candidate.ID)
	testutil.Decode[HrCandidateResponse](t, testHandler.UpdateHrCandidate, req, http.StatusOK)

	// The handler under test has no LLM configured, which is the configuration this
	// assertion is about: `source` says template, not "ai" with a template body.
	if testHandler.LLM != nil && testHandler.LLM.Enabled() {
		t.Skip("this test asserts the no-model path; the suite handler has a model configured")
	}

	before := dbfx.Count(t, `SELECT count(*) FROM hr_interview_guide WHERE workspace_id = $1`, testWorkspaceID)

	req = workbenchRequest(t, "POST", "/api/workbench/hr/guides/generate", map[string]any{
		"candidate_id": candidate.ID,
		"round":        3,
	}, testUserID)
	draft := testutil.Decode[HrGuideGenerateResponse](t, testHandler.GenerateHrInterviewGuide, req, http.StatusOK)

	if draft.Source != "template" {
		t.Fatalf("source = %q, want template with no model configured", draft.Source)
	}
	if draft.Total < hrGuideGenerateMinCount || draft.Total > hrGuideGenerateMaxCount {
		t.Fatalf("draft has %d items, want %d-%d", draft.Total, hrGuideGenerateMinCount, hrGuideGenerateMaxCount)
	}
	if len(draft.Items) != draft.Total {
		t.Fatalf("total = %d but %d items, want them equal", draft.Total, len(draft.Items))
	}
	if draft.Round != 3 {
		t.Fatalf("round = %d, want the requested 3", draft.Round)
	}

	dimensions := map[string]bool{}
	for i, item := range draft.Items {
		if strings.TrimSpace(item.Question) == "" {
			t.Fatalf("items[%d] has no question", i)
		}
		if strings.TrimSpace(item.Intent) == "" {
			t.Fatalf("items[%d] has no intent: %+v", i, item)
		}
		if strings.TrimSpace(item.Signals) == "" {
			t.Fatalf("items[%d] has no signals: %+v", i, item)
		}
		if !hrQuestionDimensions[item.Dimension] {
			t.Fatalf("items[%d].dimension = %q, want a dimension from the enum", i, item.Dimension)
		}
		if item.Asked || item.Score != nil || item.Note != "" {
			t.Fatalf("items[%d] is a fresh draft but carries interview state: %+v", i, item)
		}
		dimensions[item.Dimension] = true
	}
	if len(dimensions) != len(hrQuestionDimensions) {
		t.Fatalf("draft covers %d dimensions (%v), want all %d", len(dimensions), dimensions, len(hrQuestionDimensions))
	}
	// The requisition's keywords reach the questions, which is what makes the draft
	// about this role instead of any role.
	if !strings.Contains(strings.Join(questionTexts(draft.Items), " | "), "Go") {
		t.Fatalf("draft questions mention none of the requisition keywords: %v", questionTexts(draft.Items))
	}

	// A requested size inside the window is honoured; outside it is clamped, not an
	// error.
	req = workbenchRequest(t, "POST", "/api/workbench/hr/guides/generate", map[string]any{
		"candidate_id": candidate.ID,
		"limit":        8,
	}, testUserID)
	eight := testutil.Decode[HrGuideGenerateResponse](t, testHandler.GenerateHrInterviewGuide, req, http.StatusOK)
	if eight.Total != hrGuideGenerateMaxCount {
		t.Fatalf("limit 8 produced %d items, want %d", eight.Total, hrGuideGenerateMaxCount)
	}
	req = workbenchRequest(t, "POST", "/api/workbench/hr/guides/generate", map[string]any{
		"candidate_id": candidate.ID,
		"limit":        1,
	}, testUserID)
	clamped := testutil.Decode[HrGuideGenerateResponse](t, testHandler.GenerateHrInterviewGuide, req, http.StatusOK)
	if clamped.Total != hrGuideGenerateMinCount {
		t.Fatalf("limit 1 produced %d items, want the floor %d", clamped.Total, hrGuideGenerateMinCount)
	}

	// Generating is a preview: no row was written.
	if after := dbfx.Count(t, `SELECT count(*) FROM hr_interview_guide WHERE workspace_id = $1`, testWorkspaceID); after != before {
		t.Fatalf("generate wrote %d guide rows, want 0", after-before)
	}

	// A draft becomes a row only through POST /guides.
	req = workbenchRequest(t, "POST", "/api/workbench/hr/guides", map[string]any{
		"candidate_id": candidate.ID,
		"round":        3,
		"items":        draft.Items,
	}, testUserID)
	saved := testutil.Decode[HrGuideResponse](t, testHandler.CreateHrInterviewGuide, req, http.StatusCreated)
	t.Cleanup(func() { dbfx.Exec(t, `DELETE FROM hr_interview_guide WHERE id = $1`, saved.ID) })
	if len(saved.Items) != draft.Total {
		t.Fatalf("saved %d items, want the draft's %d", len(saved.Items), draft.Total)
	}
}

// questionTexts is the question column of a draft, for failure messages.
func questionTexts(items []HrGuideItem) []string {
	texts := make([]string, len(items))
	for i, item := range items {
		texts[i] = item.Question
	}
	return texts
}

// TestGuideSnapshotSurvivesQuestionEdit covers ⑦, the whole reason a guide stores
// copies: the bank row can be rewritten afterwards, and the outline that used it
// keeps what it recorded.
func TestGuideSnapshotSurvivesQuestionEdit(t *testing.T) {
	job := createHrJobFixture(t, testUserID, "Snapshot job")
	candidate := createHrCandidateFixture(t, job.ID, "Snapshot Candidate", "+8613800000015")
	bank := createHrQuestionFixture(t, "讲讲你做过的一次容量评估。", map[string]any{
		"intent":  "验证容量规划的经验",
		"signals": "能给出容量水位与扩容判断依据",
		"tags":    []string{"后端", "容量"},
	})

	questionID := bank.ID
	guide := createHrGuideFixture(t, candidate.ID, 1, []HrGuideItem{
		{
			QuestionID: &questionID,
			Dimension:  "skill",
			Question:   bank.Question,
			Intent:     valueOrEmpty(bank.Intent),
			Signals:    valueOrEmpty(bank.Signals),
			RedFlags:   valueOrEmpty(bank.RedFlags),
		},
	}, http.StatusCreated)

	// Snapshotting a bank row counts as a use of it.
	req := workbenchRequest(t, "GET", "/api/workbench/hr/questions/"+bank.ID, nil, testUserID)
	req = withURLParam(req, "questionId", bank.ID)
	banked := testutil.Decode[HrQuestionResponse](t, testHandler.GetHrQuestion, req, http.StatusOK)
	if banked.UsageCount != 1 {
		t.Fatalf("usage_count = %d after one guide snapshot, want 1", banked.UsageCount)
	}

	// Rewrite the bank row: all three descriptive fields, and its dimension.
	req = workbenchRequest(t, "PATCH", "/api/workbench/hr/questions/"+bank.ID, map[string]any{
		"question":  "请描述一次你做过的高并发压测。",
		"intent":    "验证压测设计而不是工具熟练度",
		"signals":   "能说清指标口径与瓶颈定位",
		"red_flags": "只会念工具名字",
		"dimension": "experience",
	}, testUserID)
	req = withURLParam(req, "questionId", bank.ID)
	edited := testutil.Decode[HrQuestionResponse](t, testHandler.UpdateHrQuestion, req, http.StatusOK)
	if edited.Question == bank.Question {
		t.Fatalf("the bank edit did not take effect; the rest of this test would prove nothing")
	}

	// The saved guide is unchanged, field by field.
	req = workbenchRequest(t, "GET", "/api/workbench/hr/guides/"+guide.ID, nil, testUserID)
	req = withURLParam(req, "guideId", guide.ID)
	reread := testutil.Decode[HrGuideResponse](t, testHandler.GetHrInterviewGuide, req, http.StatusOK)
	if len(reread.Items) != 1 {
		t.Fatalf("guide has %d items after a bank edit, want 1", len(reread.Items))
	}
	item := reread.Items[0]
	if item.Question != bank.Question {
		t.Fatalf("item question = %q, want the snapshot %q", item.Question, bank.Question)
	}
	if item.Dimension != "skill" {
		t.Fatalf("item dimension = %q, want the snapshot skill", item.Dimension)
	}
	if item.Intent != valueOrEmpty(bank.Intent) || item.Signals != valueOrEmpty(bank.Signals) ||
		item.RedFlags != valueOrEmpty(bank.RedFlags) {
		t.Fatalf("item intent/signals/red_flags = %q/%q/%q, want the snapshot %q/%q/%q",
			item.Intent, item.Signals, item.RedFlags,
			valueOrEmpty(bank.Intent), valueOrEmpty(bank.Signals), valueOrEmpty(bank.RedFlags))
	}
	if item.QuestionID == nil || *item.QuestionID != bank.ID {
		t.Fatalf("item question_id = %v, want the provenance pointer %s", item.QuestionID, bank.ID)
	}

	// Archiving the bank row does not reach into the guide either.
	req = workbenchRequest(t, "DELETE", "/api/workbench/hr/questions/"+bank.ID, nil, testUserID)
	req = withURLParam(req, "questionId", bank.ID)
	testutil.Call(t, testHandler.DeleteHrQuestion, req).Want(http.StatusNoContent)

	req = workbenchRequest(t, "GET", "/api/workbench/hr/guides/"+guide.ID, nil, testUserID)
	req = withURLParam(req, "guideId", guide.ID)
	afterArchive := testutil.Decode[HrGuideResponse](t, testHandler.GetHrInterviewGuide, req, http.StatusOK)
	if afterArchive.Items[0].Question != bank.Question {
		t.Fatalf("archiving the bank row rewrote the guide: %q", afterArchive.Items[0].Question)
	}
}

// TestGuideTeardownCoversBothTables covers ⑧: workspace teardown owns both tables.
//
// The manifest entry is what makes the schema-coverage test in
// workspace_delete_manifest_test.go pass, and the teardown statement is then
// exercised for real against a scratch workspace, so "the manifest says delete" and
// "the SQL deletes" are both proven rather than one assumed from the other.
func TestGuideTeardownCoversBothTables(t *testing.T) {
	for _, table := range []string{"hr_question", "hr_interview_guide"} {
		action, ok := workspaceDeletionManifest[table]
		if !ok {
			t.Fatalf("%s is not classified in the workspace deletion manifest", table)
		}
		if action != workspaceDelete {
			t.Fatalf("%s is classified %q, want delete: it has no owner outside the workspace", table, action)
		}
	}

	// A scratch workspace so the assertion cannot observe other tests' rows.
	scratch := dbfx.Workspace(t, "Guide teardown workspace", fmt.Sprintf("guide-teardown-%d", os.Getpid()))
	// The workspace row's own cleanup deletes it; these rows are what the teardown
	// under test is supposed to remove first.
	dbfx.Cleanup(t, `DELETE FROM hr_question WHERE workspace_id = $1`, scratch)
	dbfx.Cleanup(t, `DELETE FROM hr_interview_guide WHERE workspace_id = $1`, scratch)

	questionID := dbfx.Insert(t, "hr_question", testutil.Cols{
		"workspace_id": scratch,
		"dimension":    "skill",
		"question":     "容灾演练多久做一次？",
	})
	guideID := dbfx.Insert(t, "hr_interview_guide", testutil.Cols{
		"workspace_id": scratch,
		"candidate_id": testUserID,
		"items":        testutil.Raw(`'[{"dimension":"skill","question":"容灾演练多久做一次？"}]'::jsonb`),
	})

	workspaceUUID, err := util.ParseUUID(scratch)
	if err != nil {
		t.Fatalf("parse scratch workspace id: %v", err)
	}
	if err := testHandler.Queries.DeleteWorkspaceWorkbenchLedger(context.Background(), workspaceUUID); err != nil {
		t.Fatalf("delete workspace workbench ledger: %v", err)
	}

	if n := dbfx.Count(t, `SELECT count(*) FROM hr_question WHERE id = $1`, questionID); n != 0 {
		t.Fatalf("teardown left %d hr_question rows behind", n)
	}
	if n := dbfx.Count(t, `SELECT count(*) FROM hr_interview_guide WHERE id = $1`, guideID); n != 0 {
		t.Fatalf("teardown left %d hr_interview_guide rows behind", n)
	}
}
