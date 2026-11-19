"use client";

import type { HrScorecardDimensions, HrScorecardVerdict } from "@morechat/core/types";

/**
 * The interview scorecard's four dimensions and their weights.
 *
 * The ruler is `blocks/match-score`'s: one dimension carries 40, the rest 20
 * each, and the total is the weighted mean *over the dimensions that were
 * rated* — a dimension nobody scored spreads its weight rather than costing the
 * candidate points. That module weighs a candidate against a requisition
 * (keywords / education / experience / salary, 0–100); this one weighs an
 * interviewer's verdict on one round (skill / experience / culture / potential,
 * 0–5, `hr_scorecard.dimensions`). Same arithmetic, different question, so the
 * weights live here, and the rule they follow is stated once above.
 */
export const SCORECARD_WEIGHTS = {
  skill: 40,
  experience: 20,
  culture: 20,
  potential: 20,
} as const;

export type ScorecardDimension = keyof typeof SCORECARD_WEIGHTS;

/** Drawing order: the weighted dimension first, then the three that follow. */
export const SCORECARD_DIMENSIONS = [
  "skill",
  "experience",
  "culture",
  "potential",
] as const satisfies readonly ScorecardDimension[];

/** `dimensions` is 0–5 per dimension (`NUMERIC(5,2)` on the weighted total). */
export const SCORECARD_MAX = 5;

/** The four verdicts the schema allows, strongest first. */
export const SCORECARD_VERDICTS = [
  "strong_yes",
  "yes",
  "no",
  "strong_no",
] as const satisfies readonly HrScorecardVerdict[];

/**
 * One dimension's score, or `null` for "not rated".
 *
 * The map is JSONB and the server may hold a number out of range — clamped, so
 * a stray 7 in an old row cannot inflate a total. An absent key and an
 * unreadable value are both "not rated": different from a stored 0, which is a
 * real verdict.
 */
export function dimensionScore(
  dimensions: HrScorecardDimensions | undefined,
  dimension: ScorecardDimension,
): number | null {
  const raw = dimensions?.[dimension];
  if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
  return Math.min(SCORECARD_MAX, Math.max(0, raw));
}

/**
 * The weighted total, 0–5, or `null` when nothing was rated.
 *
 * Rounded to two decimals because that is the column's scale; `null` rather
 * than 0 for an unscored card, because a zero says the interviewer judged the
 * candidate worthless, which is not the same answer as "nobody has scored this
 * yet" (`docs/METRICS.md` §1, rule 3).
 */
export function scorecardScore(dimensions: HrScorecardDimensions | undefined): number | null {
  let weight = 0;
  let total = 0;
  for (const dimension of SCORECARD_DIMENSIONS) {
    const score = dimensionScore(dimensions, dimension);
    if (score === null) continue;
    const dimensionWeight = SCORECARD_WEIGHTS[dimension];
    weight += dimensionWeight;
    total += score * dimensionWeight;
  }
  if (weight === 0) return null;
  return Math.round((total / weight) * 100) / 100;
}

/**
 * The dimensions map to store: only what was rated, at the storage scale.
 *
 * An unrated dimension is left out rather than written as 0, so a reopened form
 * shows it as unanswered — the same distinction `dimensionScore` reads back.
 */
export function toDimensions(
  scores: Partial<Record<ScorecardDimension, number | null>>,
): HrScorecardDimensions {
  const dimensions: HrScorecardDimensions = {};
  for (const dimension of SCORECARD_DIMENSIONS) {
    const score = scores[dimension];
    if (typeof score === "number" && Number.isFinite(score)) {
      dimensions[dimension] = Math.min(SCORECARD_MAX, Math.max(0, score));
    }
  }
  return dimensions;
}
