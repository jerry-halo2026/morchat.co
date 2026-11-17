// @vitest-environment node

import { describe, expect, it } from "vitest";
import type { HrCandidate } from "@morechat/core/types";
import {
  APPROVE_STAGE,
  SCREENING_STAGE,
  awaitingScreeningCount,
  canScreen,
  formatSalary,
  isAwaitingScreening,
  nextSelection,
  sortByMatchScore,
  undoPatch,
} from "./resumes-model";

function candidate(overrides: Partial<HrCandidate> & Pick<HrCandidate, "id">): HrCandidate {
  return {
    workspace_id: "ws-1",
    job_id: "job-1",
    name: overrides.id,
    stage: "screening",
    source: null,
    phone: null,
    email: null,
    resume_attachment_id: null,
    match_score: null,
    score_resume: null,
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
    created_at: "2026-01-05T09:00:00Z",
    updated_at: "2026-01-05T09:00:00Z",
    archived_at: null,
    ...overrides,
  };
}

describe("awaiting screening", () => {
  it("counts only the rows nobody has decided on", () => {
    const rows = [
      candidate({ id: "a", stage: "screening" }),
      candidate({ id: "b", stage: "test" }),
      candidate({ id: "c", stage: "screening" }),
      candidate({ id: "d", stage: "rejected" }),
    ];

    expect(awaitingScreeningCount(rows)).toBe(2);
    expect(isAwaitingScreening(rows[1]!)).toBe(false);
    expect(isAwaitingScreening(rows[0]!)).toBe(true);
  });

  it("is zero for an empty queue", () => {
    expect(awaitingScreeningCount([])).toBe(0);
  });
});

describe("sortByMatchScore", () => {
  it("puts the best match first and an unscored row last", () => {
    const rows = [
      candidate({ id: "none", match_score: null }),
      candidate({ id: "high", match_score: 91 }),
      candidate({ id: "low", match_score: 12 }),
    ];

    expect(sortByMatchScore(rows).map((row) => row.id)).toEqual(["high", "low", "none"]);
    // The list it was given is untouched: the page keeps the server's order
    // for the toggle's other position.
    expect(rows.map((row) => row.id)).toEqual(["none", "high", "low"]);
  });

  it("keeps ties in the order they arrived", () => {
    const rows = [
      candidate({ id: "first", match_score: 50 }),
      candidate({ id: "second", match_score: 50 }),
    ];
    expect(sortByMatchScore(rows).map((row) => row.id)).toEqual(["first", "second"]);
  });
});

describe("nextSelection", () => {
  const rows = [candidate({ id: "a" }), candidate({ id: "b" }), candidate({ id: "c" })];

  it("walks one row at a time", () => {
    expect(nextSelection(rows, "a", 1)).toBe("b");
    expect(nextSelection(rows, "c", -1)).toBe("b");
  });

  it("stops at both ends instead of wrapping", () => {
    expect(nextSelection(rows, "a", -1)).toBe("a");
    expect(nextSelection(rows, "c", 1)).toBe("c");
  });

  it("starts from the edge the key points at when nothing is selected", () => {
    expect(nextSelection(rows, null, 1)).toBe("a");
    expect(nextSelection(rows, null, -1)).toBe("c");
    // A stale id is the same case as no id: the row left the list.
    expect(nextSelection(rows, "gone", 1)).toBe("a");
  });

  it("has nothing to select in an empty queue", () => {
    expect(nextSelection([], "a", 1)).toBeNull();
  });
});

describe("undoPatch", () => {
  it("only sends the stage when there is no rejection note to clear", () => {
    expect(undoPatch(candidate({ id: "a" }))).toEqual({ stage: SCREENING_STAGE });
  });

  it("clears the rejection note with the stage", () => {
    expect(undoPatch(candidate({ id: "a", stage: "rejected", rejected_reason: "" }))).toEqual({
      stage: SCREENING_STAGE,
      rejected_reason: null,
    });
  });
});

describe("stage constants", () => {
  it("approving moves a candidate on to the assessment", () => {
    expect(APPROVE_STAGE).toBe("test");
    expect(SCREENING_STAGE).toBe("screening");
  });
});

describe("canScreen", () => {
  it("lets any member act once their membership has resolved", () => {
    expect(canScreen("owner", false)).toBe(true);
    expect(canScreen("admin", false)).toBe(true);
    expect(canScreen("member", false)).toBe(true);
  });

  it("keeps the queue read-only for a reader, and until the role is known", () => {
    expect(canScreen(null, false)).toBe(false);
    expect(canScreen("member", true)).toBe(false);
  });
});

describe("formatSalary", () => {
  it("says nothing when the candidate stated no expectation", () => {
    expect(formatSalary(candidate({ id: "a" }), "en")).toBeNull();
  });

  it("formats the expectation in the row's own currency", () => {
    const text = formatSalary(candidate({ id: "a", expected_salary: 21000 }), "en");
    expect(text).toContain("21,000");
  });
});
