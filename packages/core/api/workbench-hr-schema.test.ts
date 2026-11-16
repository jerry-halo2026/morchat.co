// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parseWithFallback } from "./schema";
import {
  EMPTY_HR_CANDIDATE,
  EMPTY_HR_CANDIDATE_LIST_RESPONSE,
  EMPTY_HR_EMPLOYEE_PROFILE,
  EMPTY_HR_EMPLOYEE_PROFILE_LIST_RESPONSE,
  EMPTY_HR_INTERVIEW,
  EMPTY_HR_INTERVIEW_LIST_RESPONSE,
  EMPTY_HR_JOB,
  EMPTY_HR_JOB_LIST_RESPONSE,
  EMPTY_HR_SCORECARD,
  EMPTY_HR_SCORECARD_LIST_RESPONSE,
  HrCandidateListResponseSchema,
  HrCandidateSchema,
  HrEmployeeProfileListResponseSchema,
  HrEmployeeProfileSchema,
  HrInterviewListResponseSchema,
  HrInterviewSchema,
  HrJobListResponseSchema,
  HrJobSchema,
  HrScorecardListResponseSchema,
  HrScorecardSchema,
} from "./schemas";

const endpoint = "hr-test";

// One row of each HR table as docs/engineering/WORKBENCH-API.md §10.2 defines it,
// kept to the fields a client cannot render without.
const job = {
  id: "job-1",
  workspace_id: "ws",
  title: "Backend Engineer",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const candidate = {
  id: "cand-1",
  workspace_id: "ws",
  job_id: "job-1",
  name: "Ada",
};

describe("HR schemas (contract §10.2/§10.3)", () => {
  it("fills absent nullable columns, counters and currency defaults", () => {
    const parsed = HrJobListResponseSchema.parse({ jobs: [job], total: 1 });
    expect(parsed.jobs[0]).toMatchObject({
      id: "job-1",
      department_id: null,
      level: null,
      headcount: 1,
      status: "draft",
      salary_min: null,
      salary_max: null,
      currency: "CNY",
      requirements: null,
      owner_member_id: null,
      archived_at: null,
    });
    expect(parsed.total).toBe(1);
  });

  it("defaults a candidate to the first stage and keeps money as a number", () => {
    const parsed = HrCandidateListResponseSchema.parse({
      candidates: [{ ...candidate, expected_salary: 24000, offer_salary: 26000.5 }],
    });
    expect(parsed.candidates[0]).toMatchObject({
      stage: "screening",
      match_score: null,
      score_resume: null,
      expected_salary: 24000,
      offer_salary: 26000.5,
      currency: "CNY",
      hired_at: null,
      rejected_reason: null,
    });
    // Money must stay numeric: a string here would blank the whole page.
    expect(typeof parsed.candidates[0]?.offer_salary).toBe("number");
  });

  it("keeps unknown enum values instead of rejecting the row", () => {
    // A newer server may add a candidate stage, an interview mode, a verdict or a
    // job status. Each row must still parse so the UI can default-case it.
    const jobs = HrJobListResponseSchema.parse({ jobs: [{ id: "j", status: "on_hold" }] });
    expect(jobs.jobs[0]?.status).toBe("on_hold");

    const candidates = HrCandidateListResponseSchema.parse({
      candidates: [{ id: "c", stage: "background_check" }],
    });
    expect(candidates.candidates[0]?.stage).toBe("background_check");

    const interviews = HrInterviewListResponseSchema.parse({
      interviews: [{ id: "i", mode: "async_video", status: "rescheduling" }],
    });
    expect(interviews.interviews[0]?.mode).toBe("async_video");
    expect(interviews.interviews[0]?.status).toBe("rescheduling");

    const scorecards = HrScorecardListResponseSchema.parse({
      scorecards: [{ id: "s", verdict: "leaning_yes" }],
    });
    expect(scorecards.scorecards[0]?.verdict).toBe("leaning_yes");
  });

  it("keeps a row whose defaulted column arrived NULL", () => {
    // §10.2 declares `status` and `currency` with a DEFAULT but no NOT NULL, so an
    // imported row can carry null where an API-written one has a value. One such
    // row must not empty the page.
    const parsed = HrJobListResponseSchema.parse({
      jobs: [{ id: "j", status: null, currency: null }],
    });
    expect(parsed.jobs[0]?.status).toBe("draft");
    expect(parsed.jobs[0]?.currency).toBe("CNY");

    const candidates = HrCandidateListResponseSchema.parse({
      candidates: [{ id: "c", currency: null }],
    });
    expect(candidates.candidates[0]?.currency).toBe("CNY");
  });

  it("keeps an unrecorded interview channel and verdict null, not a default", () => {
    // §10.2 makes both columns nullable: "nobody chose yet" is not "phone".
    expect(HrInterviewSchema.parse({ id: "i" }).mode).toBeNull();
    expect(HrInterviewSchema.parse({ id: "i" }).status).toBe("scheduled");
    expect(HrScorecardSchema.parse({ id: "s" }).verdict).toBeNull();
  });

  it("keeps unrated scorecard dimensions null so the UI can tell them from zero", () => {
    const parsed = HrScorecardListResponseSchema.parse({
      scorecards: [{ id: "s", interview_id: "i-1", score_skill: 4, weighted_score: 78.5 }],
    });
    expect(parsed.scorecards[0]).toMatchObject({
      reviewer_member_id: null,
      score_skill: 4,
      score_experience: null,
      score_culture: null,
      score_potential: null,
      weighted_score: 78.5,
      verdict: null,
      comment: null,
    });
  });

  it("treats the JSONB score matrices as open maps that default to empty", () => {
    const parsed = HrEmployeeProfileListResponseSchema.parse({
      employees: [
        { id: "e-1", workspace_id: "ws", member_id: "m-1" },
        { id: "e-2", member_id: "m-2", ability: { skill: 8, experience: 7 }, disc: { d: 6, i: 4, s: 3, c: 5 } },
      ],
    });
    expect(parsed.employees[0]?.ability).toEqual({});
    expect(parsed.employees[0]?.disc).toEqual({});
    expect(parsed.employees[0]?.hire_date).toBeNull();
    // Unknown keys survive: the dimension set is a product decision, not a union.
    expect(parsed.employees[1]?.ability).toEqual({ skill: 8, experience: 7 });
    expect(parsed.employees[1]?.disc).toEqual({ d: 6, i: 4, s: 3, c: 5 });
  });

  it("degrades a drifted JSONB matrix to an empty map instead of dropping the row", () => {
    const parsed = HrEmployeeProfileListResponseSchema.parse({
      employees: [{ id: "e-1", member_id: "m-1", ability: "not-json", disc: [1, 2, 3] }],
    });
    expect(parsed.employees[0]?.id).toBe("e-1");
    expect(parsed.employees[0]?.ability).toEqual({});
  });

  it.each([
    ["jobs", HrJobListResponseSchema, EMPTY_HR_JOB_LIST_RESPONSE],
    ["candidates", HrCandidateListResponseSchema, EMPTY_HR_CANDIDATE_LIST_RESPONSE],
    ["interviews", HrInterviewListResponseSchema, EMPTY_HR_INTERVIEW_LIST_RESPONSE],
    ["scorecards", HrScorecardListResponseSchema, EMPTY_HR_SCORECARD_LIST_RESPONSE],
    ["employees", HrEmployeeProfileListResponseSchema, EMPTY_HR_EMPLOYEE_PROFILE_LIST_RESPONSE],
  ])("falls back to an empty %s page on a malformed body", (_label, schema, fallback) => {
    for (const malformed of [null, "not-an-array", 42, { total: "many" }]) {
      expect(parseWithFallback(malformed, schema, fallback, { endpoint })).toEqual(fallback);
    }
  });

  it("degrades a single malformed detail row to the empty record", () => {
    // Detail reads gate an edit form; an id-less body must never be rendered as a
    // row, because the form would then save against an empty id.
    expect(parseWithFallback({ id: 42 }, HrJobSchema, EMPTY_HR_JOB, { endpoint })).toEqual(
      EMPTY_HR_JOB,
    );
    expect(parseWithFallback({ id: 42 }, HrCandidateSchema, EMPTY_HR_CANDIDATE, { endpoint })).toEqual(
      EMPTY_HR_CANDIDATE,
    );
    expect(parseWithFallback({ id: 42 }, HrInterviewSchema, EMPTY_HR_INTERVIEW, { endpoint })).toEqual(
      EMPTY_HR_INTERVIEW,
    );
    expect(parseWithFallback({ id: 42 }, HrScorecardSchema, EMPTY_HR_SCORECARD, { endpoint })).toEqual(
      EMPTY_HR_SCORECARD,
    );
    expect(
      parseWithFallback("not-an-object", HrEmployeeProfileSchema, EMPTY_HR_EMPLOYEE_PROFILE, {
        endpoint,
      }),
    ).toEqual(EMPTY_HR_EMPLOYEE_PROFILE);
  });
});
