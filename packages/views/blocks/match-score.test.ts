// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { HrCandidate, HrJob } from "@morechat/core/types";
import { MATCH_WEIGHTS, matchSignals, scoreCandidate } from "./match-score";

// Migration 705 gave `hr_candidate` its own `edu`, `years_experience` and
// `resume_text`, so all four dimensions can now be measured against the job. The
// cases below pin the shared rule (no signal in a dimension → its weight moves,
// never a zero) and the three comparisons: keyword containment in the stored
// résumé body, label equality on education, a floor-plus-linear-deduction on
// experience.

const BAND_JOB: HrJob = {
  id: "job-1",
  workspace_id: "ws-1",
  title: "Senior video editor",
  department_id: null,
  level: "P5",
  headcount: 1,
  status: "open",
  salary_min: 18000,
  salary_max: 24000,
  currency: "CNY",
  requirements: null,
  edu: "本科",
  years: "3-5 年",
  city: null,
  jd: null,
  urgent: false,
  keywords: ["剪辑", "短视频", "Premiere"],
  owner_member_id: null,
  created_by: null,
  created_at: "2026-01-04T09:00:00Z",
  updated_at: "2026-01-04T09:00:00Z",
  archived_at: null,
};

const CANDIDATE: HrCandidate = {
  id: "cand-1",
  workspace_id: "ws-1",
  job_id: BAND_JOB.id,
  name: "Lin Wei",
  stage: "screening",
  source: "Referral",
  phone: null,
  email: null,
  resume_attachment_id: null,
  match_score: null,
  score_resume: null,
  score_test: null,
  score_interview: null,
  expected_salary: 21000,
  offer_salary: null,
  currency: "CNY",
  owner_member_id: null,
  edu: null,
  years_experience: null,
  resume_text: null,
  hired_at: null,
  rejected_reason: null,
  created_by: null,
  created_at: "2026-01-05T09:00:00Z",
  updated_at: "2026-01-05T09:00:00Z",
  archived_at: null,
};

function withSalary(expected: number | null): HrCandidate {
  return { ...CANDIDATE, expected_salary: expected };
}

describe("scoreCandidate · salary band", () => {
  it("scores a full 100 when the expectation sits inside the band", () => {
    const result = scoreCandidate(withSalary(21000), BAND_JOB);

    // Only the salary dimension has a signal, so its 20 points carry the whole
    // result: an in-band expectation is a 100, not a 20.
    expect(result.score).toBe(100);
    expect(result.reasons.map((reason) => reason.key)).toContain("salary");
  });

  it("deducts linearly for an expectation outside the band", () => {
    // The band is 6000 wide, so 3000 over its top is exactly half deducted, and
    // one full band away is nothing at all.
    expect(scoreCandidate(withSalary(27000), BAND_JOB).score).toBe(50);
    expect(scoreCandidate(withSalary(30000), BAND_JOB).score).toBe(0);
    // The same rule below the floor.
    expect(scoreCandidate(withSalary(15000), BAND_JOB).score).toBe(50);
    expect(scoreCandidate(withSalary(12000), BAND_JOB).score).toBe(0);
    // Monotonic between the samples.
    const over = [24000, 25000, 26000, 27000, 28000].map(
      (expected) => scoreCandidate(withSalary(expected), BAND_JOB).score ?? -1,
    );
    expect(over).toEqual([...over].sort((left, right) => right - left));
  });

  it("scores against a single bound when the band is open-ended", () => {
    const atLeast: HrJob = { ...BAND_JOB, salary_max: null };
    expect(scoreCandidate(withSalary(30000), atLeast).score).toBe(100);
    // Half the floor short: 9000 of 18000.
    expect(scoreCandidate(withSalary(9000), atLeast).score).toBe(50);

    const atMost: HrJob = { ...BAND_JOB, salary_min: null };
    expect(scoreCandidate(withSalary(20000), atMost).score).toBe(100);
    expect(scoreCandidate(withSalary(36000), atMost).score).toBe(50);
  });
});

describe("scoreCandidate · what has no signal", () => {
  it("returns a null score and a reason when there is no job", () => {
    const result = scoreCandidate(CANDIDATE, null);

    // A missing opening is not a bad match: there is no requirement to compare.
    expect(result.score).toBeNull();
    expect(result.reasons).toEqual([{ key: "no_job" }]);
  });

  it("spreads the weight of the dimensions the row cannot answer", () => {
    const signals = matchSignals(CANDIDATE, BAND_JOB);

    // The row carries no résumé text, no education and no experience, so three
    // dimensions are skipped and only the salary weight stays.
    expect(signals.keywords.score).toBeNull();
    expect(signals.education.score).toBeNull();
    expect(signals.experience.score).toBeNull();
    expect(signals.salary.score).toBe(100);
    expect(MATCH_WEIGHTS.keywords + MATCH_WEIGHTS.education + MATCH_WEIGHTS.experience + MATCH_WEIGHTS.salary).toBe(100);
  });

  it("scores keywords from supplied résumé text rather than from nothing", () => {
    // Two of three keywords present; the rest of the weights still spread.
    const half = scoreCandidate(CANDIDATE, BAND_JOB, "负责短视频剪辑与拍摄，熟悉 PR 调色");
    expect(matchSignals(CANDIDATE, BAND_JOB, "负责短视频剪辑与拍摄，熟悉 PR 调色").keywords.score).toBe(67);
    // keywords 67 at weight 40 plus salary 100 at weight 20 → 78.
    expect(half.score).toBe(78);
    expect(half.reasons.map((reason) => reason.key)).toEqual(["keywords", "salary"]);

    // Text that hits nothing scores 0 for that dimension — a real measurement,
    // and not the same thing as an absent one.
    expect(matchSignals(CANDIDATE, BAND_JOB, "十年财务审计").keywords.score).toBe(0);
  });

  it("has no score at all when neither the row nor the job can be measured", () => {
    const bare: HrJob = { ...BAND_JOB, keywords: [], salary_min: null, salary_max: null };
    const result = scoreCandidate(withSalary(null), bare);

    expect(result.score).toBeNull();
    expect(result.reasons).toEqual([{ key: "no_text" }]);
  });
});

describe("scoreCandidate · reasons", () => {
  it("always reports two or three reasons drawn from the dimensions it used", () => {
    const cases = [
      scoreCandidate(CANDIDATE, BAND_JOB),
      scoreCandidate(withSalary(27000), BAND_JOB),
      scoreCandidate(withSalary(null), BAND_JOB, "短视频剪辑 Premiere"),
      scoreCandidate(CANDIDATE, BAND_JOB, "短视频剪辑 Premiere"),
      scoreCandidate(withSalary(12000), BAND_JOB, "短视频剪辑 Premiere"),
    ];

    for (const result of cases) {
      expect(result.score).not.toBeNull();
      expect(result.reasons.length).toBeGreaterThanOrEqual(2);
      expect(result.reasons.length).toBeLessThanOrEqual(3);
      // Every reason names a dimension or a documented skip — never an empty one.
      for (const reason of result.reasons) {
        expect(reason.key).not.toBe("");
        if (reason.detail !== undefined) expect(reason.detail).toMatch(/^\d+$/);
      }
    }
  });

  it("keeps the one reason a run with nothing to score can honestly give", () => {
    // No job, and no signal in any dimension: one sentence, and no padding to
    // reach a count the data cannot support.
    expect(scoreCandidate(CANDIDATE, null).reasons).toHaveLength(1);
    expect(scoreCandidate(withSalary(null), { ...BAND_JOB, keywords: [] }).reasons).toHaveLength(
      1,
    );
  });

  it("keeps the heaviest dimensions when four of them scored", () => {
    // With the stored profile filled in, four dimensions can score at once
    // (keywords 40, education 20, experience 20, salary 20): the trim rule then
    // drops the lightest reason, and the heaviest one still opens the list.
    const full: HrCandidate = {
      ...CANDIDATE,
      edu: "本科",
      years_experience: 4,
      resume_text: "短视频剪辑 Premiere",
    };
    const result = scoreCandidate(full, BAND_JOB);
    expect(result.score).toBe(100);
    expect(result.reasons.length).toBe(3);
    expect(result.reasons[0]?.key).toBe("keywords");
  });
});

describe("scoreCandidate · the stored profile", () => {
  it("scores keywords from the row's own résumé text", () => {
    // No text argument: the body is on the row now (migration 705), so the
    // dimension reads it without the caller having to hand it over.
    const withText: HrCandidate = {
      ...CANDIDATE,
      resume_text: "负责短视频剪辑与拍摄，熟悉 PR 调色",
    };
    const signals = matchSignals(withText, BAND_JOB);
    // Two of the three keywords are present.
    expect(signals.keywords.score).toBe(67);
    // keywords 67 at weight 40 plus salary 100 at weight 20 → 78.
    expect(scoreCandidate(withText, BAND_JOB).score).toBe(78);

    // A résumé on file that matches nothing is a measurement of 0, not a skip.
    expect(
      matchSignals({ ...CANDIDATE, resume_text: "十年财务审计" }, BAND_JOB).keywords.score,
    ).toBe(0);
    // No body on the row keeps the dimension out of the mean entirely.
    expect(matchSignals(CANDIDATE, BAND_JOB).keywords.score).toBeNull();
  });

  it("scores education on label equality, and 不限 as everyone's fit", () => {
    expect(matchSignals({ ...CANDIDATE, edu: "本科" }, BAND_JOB).education.score).toBe(100);
    // Folded: a trailing "or above" and stray spaces are the same requirement.
    expect(matchSignals({ ...CANDIDATE, edu: " 本科 " }, BAND_JOB).education.score).toBe(100);
    expect(
      matchSignals({ ...CANDIDATE, edu: "本科" }, { ...BAND_JOB, edu: "本科以上" }).education.score,
    ).toBe(100);
    // A different degree is a real 0.
    expect(matchSignals({ ...CANDIDATE, edu: "大专" }, BAND_JOB).education.score).toBe(0);
    // An opening with no requirement fits everyone holding any degree.
    expect(
      matchSignals({ ...CANDIDATE, edu: "大专" }, { ...BAND_JOB, edu: "不限" }).education.score,
    ).toBe(100);
    // Either side missing is no signal, not a failure.
    expect(matchSignals({ ...CANDIDATE, edu: null }, BAND_JOB).education.score).toBeNull();
    expect(
      matchSignals({ ...CANDIDATE, edu: "本科" }, { ...BAND_JOB, edu: null }).education.score,
    ).toBeNull();
  });

  it("scores experience inside the band's floor and deducts below it", () => {
    // The requirement is "3-5 年": everything from 3 up is a full 100, including
    // more than the band's top — surplus experience is not a mismatch.
    for (const years of [3, 4.5, 5, 12]) {
      expect(
        matchSignals({ ...CANDIDATE, years_experience: years }, BAND_JOB).experience.score,
      ).toBe(100);
    }
    // Below the floor the deduction is linear in the shortfall: 1.5 of 3 is half.
    expect(
      matchSignals({ ...CANDIDATE, years_experience: 1.5 }, BAND_JOB).experience.score,
    ).toBe(50);
    expect(
      matchSignals({ ...CANDIDATE, years_experience: 2 }, BAND_JOB).experience.score,
    ).toBe(67);
    expect(
      matchSignals({ ...CANDIDATE, years_experience: 0 }, BAND_JOB).experience.score,
    ).toBe(0);
    // An open floor ("5年以上") floors at 5; a lone figure ("3年") at 3.
    expect(
      matchSignals({ ...CANDIDATE, years_experience: 4 }, { ...BAND_JOB, years: "5年以上" })
        .experience.score,
    ).toBe(80);
    expect(
      matchSignals({ ...CANDIDATE, years_experience: 3 }, { ...BAND_JOB, years: "3年" }).experience
        .score,
    ).toBe(100);
    // No years on the row, or a requirement with no figure, is no signal.
    expect(matchSignals(CANDIDATE, BAND_JOB).experience.score).toBeNull();
    expect(
      matchSignals({ ...CANDIDATE, years_experience: 4 }, { ...BAND_JOB, years: "经验丰富" })
        .experience.score,
    ).toBeNull();
  });
});
