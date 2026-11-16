import type { HrCandidate, HrJob } from "@morechat/core/types";

/**
 * A candidate's match against an opening, from the row's own fields.
 *
 * Every dimension is a comparison between one column on the candidate and one on
 * the requisition: `resume_text` against `keywords`, `edu` against `edu`,
 * `years_experience` against `years`, and `expected_salary` against the band
 * (migration 705 filled in the first three; before it the row carried none of
 * them). The rule stays: a dimension whose signal is absent on *either* side
 * contributes nothing — neither points nor a zero — and its weight is spread over
 * the dimensions that did score. Inventing a 0 for "no résumé on file" would
 * silently mark every candidate down by 40 points, which is the opposite of a
 * missing measurement.
 *
 * What a dimension scores is an integer 0–100, and the result is the weighted
 * mean over the dimensions that scored.
 */
export const MATCH_WEIGHTS = {
  keywords: 40,
  education: 20,
  experience: 20,
  salary: 20,
} as const;

/**
 * Which reason a scored dimension reports. `no_job` and `no_text` are the two
 * ways a run can end without a number to show, so the caller always has copy.
 */
export type MatchReasonKey =
  | "keywords"
  | "education"
  | "experience"
  | "salary"
  | "no_job"
  | "no_text";

/** One dimension: what it scored (0–100, null = no signal) and its weight. */
export interface MatchDimension {
  score: number | null;
  weight: number;
}

export interface MatchSignals {
  keywords: MatchDimension;
  education: MatchDimension;
  experience: MatchDimension;
  salary: MatchDimension;
}

/** A sentence for the sheet: a bundle key plus the number it carries. */
export interface MatchReason {
  key: MatchReasonKey;
  /** The dimension's 0–100 score, as a plain string, for `match.reason.*`. */
  detail?: string;
}

export interface MatchResult {
  /**
   * 0–100, or null when there is nothing to score — no job to match against, or
   * a row with no signal in any dimension.
   */
  score: number | null;
  /** Two or three sentences, always about a dimension that was considered. */
  reasons: MatchReason[];
}

/**
 * Score each dimension, keeping the ones with no signal as `null`.
 *
 * `text` overrides the row's own `resume_text` when the caller has a better copy
 * (an upload preview, a test); with no argument the row's stored body is what the
 * keyword dimension reads. Education and experience read `candidate.edu` and
 * `candidate.years_experience` directly and have nothing to override: a caller
 * that knows better has no third place to put it.
 */
export function matchSignals(
  candidate: HrCandidate,
  job: HrJob | null,
  text: string | null = null,
): MatchSignals {
  return {
    keywords: {
      score: keywordScore(job, text ?? candidate.resume_text),
      weight: MATCH_WEIGHTS.keywords,
    },
    education: { score: educationScore(candidate, job), weight: MATCH_WEIGHTS.education },
    experience: { score: experienceScore(candidate, job), weight: MATCH_WEIGHTS.experience },
    salary: { score: salaryScore(candidate, job), weight: MATCH_WEIGHTS.salary },
  };
}

/** A dimension that had something to measure: the only ones that score. */
type ScoredDimension = {
  key: Exclude<MatchReasonKey, "no_job" | "no_text">;
  score: number;
  weight: number;
};

/**
 * The weighted mean over the dimensions that scored, plus their reasons.
 *
 * No job means no requirement to compare with, which is a `null` score and a
 * reason saying so — not a 0. A job with every requirement blank (and a row with
 * no expected salary) is the same kind of answer: `no_text`, because the
 * measurements are missing rather than bad.
 */
export function scoreCandidate(
  candidate: HrCandidate,
  job: HrJob | null,
  text: string | null = null,
): MatchResult {
  if (!job) return { score: null, reasons: [{ key: "no_job" }] };

  const signals = matchSignals(candidate, job, text);
  const dimensions = (
    [
      ["keywords", signals.keywords],
      ["education", signals.education],
      ["experience", signals.experience],
      ["salary", signals.salary],
    ] as const
  )
    .map(([key, dimension]) => ({ key, score: dimension.score, weight: dimension.weight }))
    .filter((entry): entry is ScoredDimension => entry.score !== null);

  const weight = dimensions.reduce((sum, dimension) => sum + dimension.weight, 0);
  if (weight === 0) return { score: null, reasons: [{ key: "no_text" }] };

  const total = dimensions.reduce(
    (sum, dimension) => sum + dimension.score * dimension.weight,
    0,
  );

  // Heaviest first: when four dimensions scored, the two that matter least are
  // the ones a 2–3 sentence list can drop.
  const reasons: MatchReason[] = [...dimensions]
    .sort((left, right) => right.weight - left.weight)
    .slice(0, 3)
    .map((dimension) => ({ key: dimension.key, detail: String(dimension.score) }));

  // A single scored dimension is a thin answer to "why this score?"; the skip
  // itself is part of the answer, so it is said out loud.
  if (reasons.length < 2) reasons.push({ key: "no_text" });

  return { score: clamp(Math.round(total / weight)), reasons };
}

/**
 * Share of the opening's keywords the candidate's text contains, 0–100.
 *
 * Containment, case-folded and space-collapsed, because a résumé says "短视频剪辑"
 * where the job says "短视频 · 剪辑". No keywords (or no text) is `null`: there is
 * no denominator, so there is no score.
 */
function keywordScore(job: HrJob | null, text: string | null): number | null {
  const keywords = (job?.keywords ?? []).map(fold).filter(Boolean);
  const haystack = fold(text ?? "");
  if (keywords.length === 0 || haystack === "") return null;
  const hits = keywords.filter((keyword) => haystack.includes(keyword)).length;
  return clamp(Math.round((hits / keywords.length) * 100));
}

/**
 * Whether the candidate's degree answers the requisition's, 0 or 100.
 *
 * Education is a label, not a measurement: "本科" either is what the opening asks
 * for or it is not, and a five-level ladder would be this module inventing a
 * vocabulary the two free-text columns never agreed on. Both sides are folded
 * first (`foldEdu`), so "本科以上" and "本科 " compare equal.
 *
 * `不限` on the job is 100 — the opening has no requirement, so everyone meets it.
 * A missing value on either side is `null`: with nothing to compare, the
 * dimension is skipped rather than failed.
 */
function educationScore(candidate: HrCandidate, job: HrJob | null): number | null {
  const wanted = foldEdu(job?.edu ?? null);
  if (wanted === null) return null;
  if (EDU_ANY.has(wanted)) return 100;
  const held = foldEdu(candidate.edu);
  if (held === null) return null;
  return held === wanted ? 100 : 0;
}

/** What a requisition writes when it has no education requirement. */
const EDU_ANY = new Set(["不限", "不限学历", "无", "无要求", "any", "none", "norequirement"]);

/**
 * How well the candidate's years fit the opening's requirement, 0–100.
 *
 * The range is parsed out of the job's free text (`3-5 年`, `5年以上`, `3年`).
 * Inside it is 100. Below the floor the deduction is linear in the shortfall over
 * that floor — 1 year against a 3-year requirement is 67 — because "not enough
 * yet" is a measurable distance. Above the ceiling it stays 100: more experience
 * than asked for is not a mismatch, and penalising it would rank a senior last
 * for a mid-level role.
 */
function experienceScore(candidate: HrCandidate, job: HrJob | null): number | null {
  const floor = parseYearsFloor(job?.years ?? null);
  if (floor === null) return null;
  const years = candidate.years_experience;
  if (years === null || !Number.isFinite(years) || years < 0) return null;

  if (years >= floor) return 100;
  // An open floor of 0 has no distance to deduct across.
  if (floor <= 0) return 100;
  return clamp(Math.round(100 * (1 - (floor - years) / floor)));
}

/**
 * The experience a requirement names as its floor, or `null` when it names none.
 *
 * `3-5 年` floors at 3, `5年以上` and `3+` at 5, a lone `3年` at 3 — "three years
 * required" is a minimum — and `3年以内` at 0, because a ceiling asks for *at
 * most* three and so excludes nobody for having more. Everything else (`资深`,
 * `经验丰富`) has no figure to compare against, so the dimension is skipped.
 *
 * The floor is the only number the score needs: everything at or above it is 100
 * (see `experienceScore`), so the band's upper end is deliberately discarded
 * rather than carried around as dead data.
 */
function parseYearsFloor(value: string | null): number | null {
  if (!value) return null;
  const normalized = value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/(?:years?|yrs?)/g, "")
    .replace(/[年月]/g, "")
    .replace(/\s/g, "");
  const numbers = [...normalized.matchAll(/\d+(?:\.\d+)?/g)].map((match) => Number(match[0]));
  const [first, second] = numbers;
  if (first === undefined) return null;

  // A ceiling-only requirement ("3年以内") has no experience floor.
  if (second === undefined && /以内|以下/.test(normalized)) return 0;
  if (second !== undefined) return Math.min(first, second);
  return first;
}

/**
 * An education label reduced to what it claims: case, width and separators
 * folded away, and the "or above" tail dropped so `本科以上` matches `本科`.
 * `null` for a blank value, which is no answer rather than a wrong one.
 */
function foldEdu(value: string | null): string | null {
  if (value === null) return null;
  const folded = value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/(?:及以上|或以上|以上)/g, "")
    .replace(/[\s·・,，、/]+/g, "");
  return folded === "" ? null : folded;
}

/**
 * How close the expected salary is to the band, 0–100.
 *
 * Inside the band is 100. Outside, the penalty is linear in the shortfall over
 * the band's own width (or its single bound), reaching 0 at one band away — so
 * a 18k–24k opening scores 21k at 100, 27k at 50 and 30k at 0.
 */
function salaryScore(candidate: HrCandidate, job: HrJob | null): number | null {
  const expected = candidate.expected_salary;
  if (expected === null || !Number.isFinite(expected) || !job) return null;

  const min = job.salary_min;
  const max = job.salary_max;
  if (min === null && max === null) return null;

  if (min !== null && max !== null) {
    if (expected >= min && expected <= max) return 100;
    const distance = expected < min ? min - expected : expected - max;
    const span = max - min;
    // A band with no width has no scale to deduct against: on target or nothing.
    if (span <= 0) return 0;
    return clamp(Math.round(100 * (1 - distance / span)));
  }

  if (min !== null) {
    if (expected >= min) return 100;
    if (min <= 0) return 0;
    return clamp(Math.round(100 * (1 - (min - expected) / min)));
  }

  const upper = max ?? 0;
  if (expected <= upper) return 100;
  if (upper <= 0) return 0;
  return clamp(Math.round(100 * (1 - (expected - upper) / upper)));
}

/** Case-folded, with whitespace and ・/· removed, so a phrase compares as one run. */
function fold(value: string): string {
  return value.trim().toLowerCase().replace(/[\s·・,，、/]+/g, "");
}

function clamp(value: number): number {
  return Math.min(100, Math.max(0, value));
}
