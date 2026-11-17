// @vitest-environment node

import { describe, expect, it } from "vitest";
import type {
  HrCandidate,
  HrGuideItem,
  HrInterview,
  HrInterviewGuide,
  HrScorecard,
} from "@morechat/core/types";
import {
  COMBINED_WEIGHTS,
  buildScoresRows,
  cardTotal,
  combineScore,
  formatPercent,
  formatScore,
  hasAnyScore,
  itemScore,
  scoreGap,
  sortScoresRows,
  type ScoresRow,
} from "./scores-model";

/**
 * The 综合成绩 arithmetic, without a page around it.
 *
 * The combined score is the one number this page invents, so it is pinned here
 * to the statement in `scores-model.ts`: the interview average is required, the
 * guide average is a 30% modifier, and the screening columns (résumé, match) are
 * never part of the sum. Averages skip what nobody rated rather than counting it
 * as a zero — the same rule the scorecard's own dimensions follow.
 */

const WS = "ws-1";

function candidate(name: string, over: Partial<HrCandidate> = {}): HrCandidate {
  return {
    id: `cand-${name}`,
    workspace_id: WS,
    job_id: "job-1",
    name,
    stage: "interview",
    source: null,
    phone: null,
    email: null,
    resume_attachment_id: null,
    match_score: null,
    score_resume: null,
    // Vestigial: the written test was cut, and no reading below may use it.
    score_test: null,
    score_interview: null,
    expected_salary: null,
    offer_salary: null,
    currency: "CNY",
    owner_member_id: null,
    edu: null,
    years_experience: null,
    resume_text: null,
    hired_at: null,
    rejected_reason: null,
    created_by: null,
    created_at: "2026-02-01T09:00:00Z",
    updated_at: "2026-02-01T09:00:00Z",
    archived_at: null,
    ...over,
  };
}

function interview(
  id: string,
  candidateId: string,
  round: number,
  over: Partial<HrInterview> = {},
): HrInterview {
  return {
    id,
    workspace_id: WS,
    candidate_id: candidateId,
    round,
    scheduled_at: "2026-02-10T02:00:00Z",
    duration_minutes: 60,
    interviewer_member_id: null,
    interviewer_name: "Mei",
    mode: "video",
    status: "done",
    rescheduled_count: 0,
    note: null,
    created_by: null,
    created_at: "2026-02-01T09:00:00Z",
    updated_at: "2026-02-01T09:00:00Z",
    archived_at: null,
    ...over,
  };
}

function scorecard(
  id: string,
  interviewId: string,
  over: Partial<HrScorecard> = {},
): HrScorecard {
  return {
    id,
    workspace_id: WS,
    interview_id: interviewId,
    reviewer_member_id: null,
    score_skill: null,
    score_experience: null,
    score_culture: null,
    score_potential: null,
    weighted_score: null,
    dimensions: {},
    verdict: null,
    comment: null,
    created_by: null,
    created_at: "2026-02-10T09:00:00Z",
    updated_at: "2026-02-10T09:00:00Z",
    archived_at: null,
    ...over,
  };
}

function item(over: Partial<HrGuideItem> = {}): HrGuideItem {
  return {
    question_id: null,
    dimension: "skill",
    question: "How do you scope a week?",
    intent: "",
    signals: "",
    red_flags: "",
    asked: false,
    note: "",
    score: null,
    ...over,
  };
}

function guide(
  id: string,
  candidateId: string,
  items: HrGuideItem[],
  over: Partial<HrInterviewGuide> = {},
): HrInterviewGuide {
  return {
    id,
    workspace_id: WS,
    interview_id: null,
    candidate_id: candidateId,
    job_id: null,
    round: 1,
    status: "used",
    items,
    note: null,
    owner_member_id: null,
    created_by: null,
    created_at: "2026-02-01T09:00:00Z",
    updated_at: "2026-02-01T09:00:00Z",
    archived_at: null,
    ...over,
  };
}

describe("combineScore", () => {
  it("面试均分没有提纲时就是综合分", () => {
    expect(combineScore(4, null)).toBe(4);
    expect(combineScore(4.25, null)).toBe(4.25);
  });

  it("面试 4.0 + 提纲 2.0 得 3.4：70 / 30", () => {
    expect(COMBINED_WEIGHTS).toEqual({ interview: 70, guide: 30 });
    expect(combineScore(4, 2)).toBe(3.4);
  });

  it("没有面试均分就没有综合分，哪怕提纲有分", () => {
    expect(combineScore(null, 5)).toBeNull();
  });

  it("面试 0 分是一个结论，不是缺失", () => {
    expect(combineScore(0, null)).toBe(0);
    expect(combineScore(0, 5)).toBe(1.5);
  });

  it("结果保留两位小数", () => {
    expect(combineScore(3.33, 4.44)).toBe(3.66);
  });
});

describe("scoreGap", () => {
  it("说明缺的是哪一半", () => {
    expect(scoreGap(4, null)).toBe("none");
    expect(scoreGap(null, 4)).toBe("no_interview");
    expect(scoreGap(null, null)).toBe("nothing_scored");
  });
});

describe("cardTotal", () => {
  it("优先读库里的加权分", () => {
    expect(cardTotal(scorecard("s", "i", { weighted_score: 4.2 }))).toBe(4.2);
  });

  it("没有加权分时用权威权重从四维重算", () => {
    // 4×40 + 2×20 + 2×20 + 2×20 = 280 / 100 = 2.8
    const card = scorecard("s", "i", {
      dimensions: { skill: 4, experience: 2, culture: 2, potential: 2 },
    });
    expect(cardTotal(card)).toBe(2.8);
  });

  it("未评的维度摊权，不记 0", () => {
    // Only skill was rated: it carries the whole weight, so the total is 4.
    expect(cardTotal(scorecard("s", "i", { dimensions: { skill: 4 } }))).toBe(4);
  });

  it("全空的卡没有分数", () => {
    expect(cardTotal(scorecard("s", "i"))).toBeNull();
  });

  it("越界的存量值被夹到 0–5", () => {
    expect(cardTotal(scorecard("s", "i", { weighted_score: 7 }))).toBe(5);
    expect(cardTotal(scorecard("s", "i", { weighted_score: -2 }))).toBe(0);
  });
});

describe("itemScore", () => {
  it("没打分与 0 分不同", () => {
    expect(itemScore(item({ score: null }))).toBeNull();
    expect(itemScore(item({ score: 0 }))).toBe(0);
  });

  it("越界的存量值被夹到 0–5", () => {
    expect(itemScore(item({ score: 9 }))).toBe(5);
  });
});

describe("buildScoresRows · 面试均分", () => {
  it("按 scorecard 平均 weighted_score，未评的面试不进分母", () => {
    const lin = candidate("lin");
    const rows = buildScoresRows([lin], {
      interviews: [interview("int-1", lin.id, 1), interview("int-2", lin.id, 2)],
      scorecards: [scorecard("sc-1", "int-1", { weighted_score: 4 })],
      guides: [],
    });

    expect(rows[0]?.interviewAverage).toBe(4);
    expect(rows[0]?.combined).toBe(4);
    expect(rows[0]?.rounds).toEqual({ scored: 1, scheduled: 2 });
  });

  it("同一轮的多张卡各自计入", () => {
    const lin = candidate("lin");
    const rows = buildScoresRows([lin], {
      interviews: [interview("int-1", lin.id, 1)],
      scorecards: [
        scorecard("sc-1", "int-1", { weighted_score: 4, reviewer_member_id: "m-1" }),
        scorecard("sc-2", "int-1", { weighted_score: 3, reviewer_member_id: "m-2" }),
      ],
      guides: [],
    });

    expect(rows[0]?.interviewAverage).toBe(3.5);
    expect(rows[0]?.interviews[0]?.total).toBe(3.5);
    expect(rows[0]?.rounds).toEqual({ scored: 1, scheduled: 1 });
  });
});

describe("buildScoresRows · 提纲均分", () => {
  it("只算 asked 的题，且题为未打分时不进分母", () => {
    const lin = candidate("lin");
    const rows = buildScoresRows([lin], {
      interviews: [],
      scorecards: [],
      guides: [
        guide("g-1", lin.id, [
          item({ asked: true, score: 2 }),
          item({ asked: true, score: 4 }),
          // Not asked: a plan, not evidence.
          item({ asked: false, score: 5 }),
          // Asked but never scored: no reading to average.
          item({ asked: true, score: null }),
        ]),
      ],
    });

    expect(rows[0]?.guideAverage).toBe(3);
    // The guide alone is still not a combined score.
    expect(rows[0]?.combined).toBeNull();
    expect(rows[0]?.gap).toBe("no_interview");
  });
  it("risk questions stay out of the guide average", () => {
    // A risk question scores how much risk the answer showed: a high mark is a
    // worse candidate. Averaging it in would let a red flag lift the score.
    const lin = candidate("lin");
    const rows = buildScoresRows([lin], {
      interviews: [],
      scorecards: [],
      guides: [
        guide("g-1", lin.id, [
          item({ asked: true, score: 4, dimension: "skill" }),
          item({ asked: true, score: 5, dimension: "risk" }),
        ]),
      ],
    });

    expect(rows[0]?.guideAverage).toBe(4);
    // Still shown on the sheet, just not counted.
    const risk = rows[0]?.guideGroups.find((group) => group.dimension === "risk");
    expect(risk?.items).toHaveLength(1);
  });

  it("提纲按五个维度分组，且只列 asked 的题", () => {
    const lin = candidate("lin");
    const rows = buildScoresRows([lin], {
      interviews: [],
      scorecards: [],
      guides: [
        guide("g-1", lin.id, [
          item({ dimension: "culture", asked: true, score: 3 }),
          item({ dimension: "skill", asked: true, score: 4 }),
          item({ dimension: "skill", asked: false, score: 5 }),
          item({ dimension: "risk", asked: true, score: 1 }),
        ]),
      ],
    });

    expect(rows[0]?.guideGroups.map((group) => group.dimension)).toEqual([
      "skill",
      "culture",
      "risk",
    ]);
    expect(rows[0]?.guideGroups[0]?.items).toHaveLength(1);
  });
});

describe("buildScoresRows · 结论与场次", () => {
  it("结论取最新一张卡（updated_at 更新的那张）", () => {
    const lin = candidate("lin");
    const rows = buildScoresRows([lin], {
      interviews: [interview("int-1", lin.id, 1), interview("int-2", lin.id, 2)],
      scorecards: [
        scorecard("sc-1", "int-1", {
          weighted_score: 4,
          verdict: "strong_yes",
          updated_at: "2026-02-11T09:00:00Z",
        }),
        scorecard("sc-2", "int-2", {
          weighted_score: 3,
          verdict: "no",
          updated_at: "2026-02-20T09:00:00Z",
        }),
      ],
      guides: [],
    });

    expect(rows[0]?.verdict).toBe("no");
    expect(rows[0]?.interviews.map((line) => line.verdict)).toEqual(["strong_yes", "no"]);
  });

  it("已取消且没评分的场次不算已安排", () => {
    const lin = candidate("lin");
    const rows = buildScoresRows([lin], {
      interviews: [
        interview("int-1", lin.id, 1, { status: "done" }),
        interview("int-2", lin.id, 2, { status: "cancelled" }),
      ],
      scorecards: [scorecard("sc-1", "int-1", { weighted_score: 4 })],
      guides: [],
    });

    expect(rows[0]?.rounds).toEqual({ scored: 1, scheduled: 1 });
  });

  it("四维雷达的值是所有卡片的维度均值，未评的维度不摊成 0", () => {
    const lin = candidate("lin");
    const rows = buildScoresRows([lin], {
      interviews: [interview("int-1", lin.id, 1)],
      scorecards: [
        scorecard("sc-1", "int-1", {
          weighted_score: 4,
          dimensions: { skill: 4, culture: 2 },
        }),
        scorecard("sc-2", "int-1", {
          weighted_score: 4,
          dimensions: { skill: 2, potential: 5 },
        }),
      ],
      guides: [],
    });

    expect(rows[0]?.dimensions).toEqual({
      skill: 3,
      experience: null,
      culture: 2,
      potential: 5,
    });
  });
});

describe("简历分与匹配度是参考列", () => {
  it("不参与综合分", () => {
    const lin = candidate("lin", { score_resume: 95, match_score: 98 });
    const rows = buildScoresRows([lin], {
      interviews: [interview("int-1", lin.id, 1)],
      scorecards: [scorecard("sc-1", "int-1", { weighted_score: 2 })],
      guides: [],
    });

    expect(rows[0]?.resumeScore).toBe(95);
    expect(rows[0]?.matchScore).toBe(98);
    expect(rows[0]?.combined).toBe(2);
  });

  it("score_test 不参与任何读数", () => {
    const lin = candidate("lin", { score_test: 97 });
    const zhang = candidate("zhang", { score_test: 12 });
    const rows = buildScoresRows([lin, zhang], {
      interviews: [],
      scorecards: [],
      guides: [],
    });

    expect(rows.map((row) => row.combined)).toEqual([null, null]);
    expect(rows.map((row) => row.interviewAverage)).toEqual([null, null]);
    expect(hasAnyScore(rows)).toBe(false);
  });
});

describe("sortScoresRows", () => {
  function rows(values: Array<[string, number | null]>): ScoresRow[] {
    const candidates = values.map(([name]) => candidate(name));
    const interviews = values.flatMap(([name, value], index) =>
      value === null ? [] : [interview(`int-${index}`, `cand-${name}`, 1)],
    );
    const scorecards = values.flatMap(([, value], index) =>
      value === null ? [] : [scorecard(`sc-${index}`, `int-${index}`, { weighted_score: value })],
    );
    return buildScoresRows(candidates, { interviews, scorecards, guides: [] });
  }

  it("默认按综合分降序，无综合分的排最后", () => {
    const sorted = sortScoresRows(rows([["a", 3], ["b", null], ["c", 4]]), "combined", "desc");
    expect(sorted.map((row) => row.candidate.name)).toEqual(["c", "a", "b"]);
  });

  it("升序时无综合分的仍然排最后", () => {
    const sorted = sortScoresRows(rows([["a", 3], ["b", null], ["c", 4]]), "combined", "asc");
    expect(sorted.map((row) => row.candidate.name)).toEqual(["a", "c", "b"]);
  });

  it("参考列也能排序，空值同样排最后", () => {
    const lin = candidate("lin", { score_resume: 60, match_score: null });
    const zhang = candidate("zhang", { score_resume: null, match_score: 90 });
    const built = buildScoresRows([lin, zhang], {
      interviews: [],
      scorecards: [],
      guides: [],
    });

    expect(
      sortScoresRows(built, "resume", "desc").map((row) => row.candidate.name),
    ).toEqual(["lin", "zhang"]);
    expect(
      sortScoresRows(built, "match", "desc").map((row) => row.candidate.name),
    ).toEqual(["zhang", "lin"]);
  });

  it("按结论排序时强弱有序，未评的排最后", () => {
    const a = candidate("a");
    const b = candidate("b");
    const c = candidate("c");
    const built = buildScoresRows([a, b, c], {
      interviews: [
        interview("int-a", a.id, 1),
        interview("int-b", b.id, 1),
        interview("int-c", c.id, 1),
      ],
      scorecards: [
        scorecard("sc-a", "int-a", { weighted_score: 4, verdict: "strong_yes" }),
        scorecard("sc-b", "int-b", { weighted_score: 4, verdict: "no" }),
      ],
      guides: [],
    });

    expect(
      sortScoresRows(built, "verdict", "desc").map((row) => row.candidate.name),
    ).toEqual(["a", "b", "c"]);
  });
});

describe("格式化", () => {
  it("0–5 的读数固定一位小数", () => {
    expect(formatScore(4)).toBe("4.0");
    expect(formatScore(3.4)).toBe("3.4");
    expect(formatScore(null)).toBeNull();
  });

  it("匹配度是百分比", () => {
    expect(formatPercent(72)).toBe("72%");
    expect(formatPercent(null)).toBeNull();
  });
});
