// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  SCORECARD_MAX,
  SCORECARD_WEIGHTS,
  dimensionScore,
  scorecardScore,
  toDimensions,
} from "./interview-score";

// The four-dimension ruler is `blocks/match-score`'s: one dimension at 40, the
// rest at 20, and the total a weighted mean over the dimensions that were
// actually rated. These cases pin the arithmetic and the two answers that must
// not collapse into one — "not rated" (null) and a stored 0.

describe("interview scorecard weights", () => {
  it("carries 40 on skill and 20 on each of the other three", () => {
    expect(SCORECARD_WEIGHTS).toEqual({ skill: 40, experience: 20, culture: 20, potential: 20 });
    expect(SCORECARD_WEIGHTS.skill).toBe(SCORECARD_WEIGHTS.experience * 2);
    expect(SCORECARD_MAX).toBe(5);
  });
});

describe("scorecardScore", () => {
  it("is the weighted mean, on the 0–5 storage scale", () => {
    // (4×40 + 3×20) / 60 = 3.66…, rounded to the column's two decimals.
    expect(scorecardScore({ skill: 4, experience: 3 })).toBe(3.67);
    expect(scorecardScore({ skill: 5, experience: 5, culture: 5, potential: 5 })).toBe(5);
  });

  it("spreads an unrated dimension's weight instead of scoring it 0", () => {
    // A reviewer who only rated skill gets that score, not a fifth of it.
    expect(scorecardScore({ skill: 4 })).toBe(4);
  });

  it("answers null when nothing was rated, which is not a zero", () => {
    expect(scorecardScore({})).toBeNull();
    expect(scorecardScore(undefined)).toBeNull();
    expect(scorecardScore({ skill: 0 })).toBe(0);
  });

  it("clamps a stored value that is out of range", () => {
    expect(dimensionScore({ skill: 7 }, "skill")).toBe(5);
    expect(dimensionScore({ skill: -2 }, "skill")).toBe(0);
    expect(dimensionScore({ skill: Number.NaN }, "skill")).toBeNull();
    expect(dimensionScore({}, "skill")).toBeNull();
  });
});

describe("toDimensions", () => {
  it("keeps only what was rated, so an unanswered dimension stays unanswered", () => {
    expect(toDimensions({ skill: 4, experience: null, culture: undefined })).toEqual({ skill: 4 });
    expect(toDimensions({ skill: 9 })).toEqual({ skill: 5 });
  });
});
