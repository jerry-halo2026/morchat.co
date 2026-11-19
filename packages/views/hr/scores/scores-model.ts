import type {
  HrCandidate,
  HrGuideItem,
  HrInterview,
  HrInterviewGuide,
  HrQuestionDimension,
  HrScorecard,
  HrScorecardVerdict,
} from "@morechat/core/types";
import { GUIDE_DIMENSIONS } from "../guide/guide-model";
import {
  SCORECARD_DIMENSIONS,
  SCORECARD_MAX,
  dimensionScore,
  scorecardScore,
  type ScorecardDimension,
} from "../interviews/interview-score";

/**
 * 综合成绩 page: the one number per candidate, and the four readings behind it.
 *
 * This page replaced the weighted résumé + written test + interview total the
 * original workbench drew. The written test is gone (its `hr_candidate.score_test`
 * column is vestigial and is not read here), so the ledger is now the two things
 * an interview actually produces:
 *
 *   interview average  — the mean of every scorecard's `weighted_score`, on the
 *                        four weighted dimensions in `interview-score.ts`
 *   guide average      — the mean of the guide's own per-question scores (0–5)
 *
 * ## The combined score
 *
 * ```
 * combined = interview × 70% + guide × 30%      (only when both exist)
 * combined = interview                          (interview alone)
 * combined = —                                  (no interview score at all)
 * ```
 *
 * Three rules, and the reason each one exists:
 *
 * 1. **The interview average is required.** A guide is what an interviewer aimed
 *    at, not what they concluded: a candidate whose questions were scored during
 *    the round but whose scorecard was never filled in has an agenda, not a
 *    verdict. No interview average, no combined score.
 * 2. **The guide average is a 30% modifier, never a substitute.** It says how the
 *    conversation went question by question, which is the evidence behind the
 *    scorecard's four dimensions — enough to move a total, not enough to be one.
 * 3. **`score_resume` and `match_score` are reference columns.** They are the
 *    screening filter: a strong résumé read is a prediction made before anyone
 *    spoke to the person. Weighting them would let a candidate who was never
 *    interviewed outrank one who was, which is the exact ordering this page
 *    exists to get right. They sit in their own columns, unweighted.
 *
 * Averages skip what nobody rated rather than counting it as 0 — the same rule
 * `interview-score.ts` states for a scorecard's dimensions: "nobody scored this"
 * and "this scored 0" are different answers, and averaging in zeros would punish
 * a candidate for a reviewer's omission (`docs/METRICS.md` §1, rule 3).
 *
 * Everything here is a pure reading of rows the queries already returned: no
 * fetch, no store, no formatting beyond `format*`, so the arithmetic above is
 * testable on its own (`scores-model.test.ts`) and the page only draws it.
 */

/** What the two halves of the combined score are worth. */
export const COMBINED_WEIGHTS = { interview: 70, guide: 30 } as const;

/** The weighted `hr_scorecard.verdict`, best first: the order a reader ranks by. */
const VERDICT_RANK: Record<HrScorecardVerdict, number> = {
  strong_yes: 4,
  yes: 3,
  no: 2,
  strong_no: 1,
};

/**
 * The rows the page writes from, grouped by candidate.
 *
 * `hr_scorecard` carries no `candidate_id` — a card hangs off an interview — so
 * the candidate is reached through the interview the card points at. That join
 * is why this module takes all three lists at once instead of a per-candidate
 * read: one card list is enough for every row on the page.
 */
export interface ScoresSource {
  interviews: readonly HrInterview[];
  scorecards: readonly HrScorecard[];
  guides: readonly HrInterviewGuide[];
}

/** One round, with its reviewers' cards averaged into a round-level reading. */
export interface ScoresInterviewLine {
  interview: HrInterview;
  /** Every scorecard filed against this round, newest first. */
  cards: readonly HrScorecard[];
  /** The mean of the round's card totals; `null` while nobody has scored it. */
  total: number | null;
  /** The round's dimension means, each `null` when no reviewer rated it. */
  dimensions: Record<ScorecardDimension, number | null>;
  /** The most recently written card's verdict. */
  verdict: HrScorecardVerdict | null;
}

/** The guide's asked questions for one dimension, in the guide's own order. */
export interface GuideGroup {
  dimension: HrQuestionDimension;
  items: readonly HrGuideItem[];
}

/** What the combined column cannot be built from, for the `—` cell's tooltip. */
export type ScoreGap = "none" | "no_interview" | "nothing_scored";

/** One candidate's line in the table, and everything the sheet draws. */
export interface ScoresRow {
  candidate: HrCandidate;
  /** Reference column: the screening read, never weighted into `combined`. */
  resumeScore: number | null;
  /** Reference column: 0–100 match against the requisition, never weighted. */
  matchScore: number | null;
  interviewAverage: number | null;
  guideAverage: number | null;
  combined: number | null;
  gap: ScoreGap;
  /** The candidate's newest scorecard verdict, across every round. */
  verdict: HrScorecardVerdict | null;
  /** Scored rounds over rounds that were booked, for the 场次 column. */
  rounds: { scored: number; scheduled: number };
  interviews: readonly ScoresInterviewLine[];
  /** Only the dimensions that hold at least one asked question. */
  guideGroups: readonly GuideGroup[];
  /** The radar's four values: every card's dimension means. */
  dimensions: Record<ScorecardDimension, number | null>;
}

export type ScoresSortField =
  | "candidate"
  | "resume"
  | "match"
  | "interview"
  | "guide"
  | "combined"
  | "verdict"
  | "rounds";

/** Header order, which is also the order the Display menu would list them in. */
export const SCORES_SORT_FIELDS: readonly ScoresSortField[] = [
  "candidate",
  "resume",
  "match",
  "interview",
  "guide",
  "combined",
  "verdict",
  "rounds",
];

export type SortDirection = "asc" | "desc";

/** Two decimals, the scale `hr_scorecard.weighted_score` is stored at. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  let total = 0;
  for (const value of values) total += value;
  return round2(total / values.length);
}

/**
 * A card's total on the 0–5 scale.
 *
 * `weighted_score` is the column this page is specified to read; the server fills
 * it from `dimensions`, but a row written before it did — or one whose map came
 * back empty — still has its dimensions, so the total is recomputed with the same
 * authoritative weights (`scorecardScore`) instead of being dropped. Clamped,
 * because one stray value must not move a ranking.
 */
export function cardTotal(card: HrScorecard): number | null {
  const stored = card.weighted_score;
  const total =
    typeof stored === "number" && Number.isFinite(stored)
      ? stored
      : scorecardScore(card.dimensions);
  if (total === null || !Number.isFinite(total)) return null;
  return Math.min(SCORECARD_MAX, Math.max(0, round2(total)));
}

/** One guide question's score, clamped to the scorecard's 0–5, or `null`. */
export function itemScore(item: HrGuideItem): number | null {
  const raw = item.score;
  if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
  return Math.min(SCORECARD_MAX, Math.max(0, round2(raw)));
}

/**
 * The combined score, as stated at the top of this module.
 *
 * `null` — never 0 — when there is no interview average: an unscored candidate
 * has no place in a ranking, and a 0 would sort them into one.
 */
export function combineScore(
  interviewAverage: number | null,
  guideAverage: number | null,
): number | null {
  if (interviewAverage === null) return null;
  if (guideAverage === null) return round2(interviewAverage);
  return round2(
    (interviewAverage * COMBINED_WEIGHTS.interview +
      guideAverage * COMBINED_WEIGHTS.guide) /
      100,
  );
}

/** Which reading the `—` is waiting on. */
export function scoreGap(
  interviewAverage: number | null,
  guideAverage: number | null,
): ScoreGap {
  if (interviewAverage !== null) return "none";
  return guideAverage === null ? "nothing_scored" : "no_interview";
}

/** Averages of one dimension across a set of cards, skipping unrated ones. */
function dimensionAverages(
  cards: readonly HrScorecard[],
): Record<ScorecardDimension, number | null> {
  const averages = {} as Record<ScorecardDimension, number | null>;
  for (const dimension of SCORECARD_DIMENSIONS) {
    const rated: number[] = [];
    for (const card of cards) {
      const score = dimensionScore(card.dimensions, dimension);
      if (score !== null) rated.push(score);
    }
    averages[dimension] = mean(rated);
  }
  return averages;
}

/**
 * The newest card of a set.
 *
 * `updated_at`, not `created_at`: a reviewer who reopens a card and changes the
 * verdict has said the newest thing, and the newest thing is what the column
 * shows. Ties fall back to `id` so the pick is stable across renders.
 */
function latestCard(cards: readonly HrScorecard[]): HrScorecard | null {
  let newest: HrScorecard | null = null;
  for (const card of cards) {
    if (newest === null || cardStamp(card) > cardStamp(newest)) newest = card;
    else if (cardStamp(card) === cardStamp(newest) && card.id > newest.id) newest = card;
  }
  return newest;
}

function cardStamp(card: HrScorecard): number {
  const stamp = Date.parse(card.updated_at || card.created_at);
  return Number.isNaN(stamp) ? 0 : stamp;
}

/** The asked questions of a candidate's guides, grouped by dimension. */
function guideGroups(guides: readonly HrInterviewGuide[]): GuideGroup[] {
  const byDimension = new Map<HrQuestionDimension, HrGuideItem[]>();
  for (const guide of guides) {
    for (const item of guide.items) {
      // Only what was actually asked: an unticked question is a plan, not
      // evidence, and its score (if any) was never earned in the room.
      if (!item.asked) continue;
      const list = byDimension.get(item.dimension);
      if (list) list.push(item);
      else byDimension.set(item.dimension, [item]);
    }
  }
  const groups: GuideGroup[] = [];
  // The five dimensions in the guide's canonical order, so two candidates'
  // sheets read the same headings in the same places.
  for (const dimension of GUIDE_DIMENSIONS) {
    const items = byDimension.get(dimension);
    if (items && items.length > 0) groups.push({ dimension, items });
  }
  return groups;
}

/**
 * Every asked question's score across a candidate's guides, minus the risk
 * dimension.
 *
 * A risk question scores how much risk the answer showed, so a high mark means
 * a worse candidate. Averaging it with the other four would let a strong red
 * flag raise the combined score — the opposite of what the reader is looking
 * for. Risk stays visible on the sheet, grouped with its sisters, but stays out
 * of the arithmetic.
 */
function guideScores(groups: readonly GuideGroup[]): number[] {
  const scores: number[] = [];
  for (const group of groups) {
    if (group.dimension === "risk") continue;
    for (const item of group.items) {
      const score = itemScore(item);
      if (score !== null) scores.push(score);
    }
  }
  return scores;
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V) {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

/**
 * One row per candidate, in the order the candidates arrived.
 *
 * Rounds are ordered by `round`; a candidate with no interview at all is a legal
 * row (everyone still in screening is one) and simply has no interview average,
 * which the table draws as `—` and the sort pushes to the end.
 */
export function buildScoresRows(
  candidates: readonly HrCandidate[],
  { interviews, scorecards, guides }: ScoresSource,
): ScoresRow[] {
  const cardsByInterview = new Map<string, HrScorecard[]>();
  for (const card of scorecards) push(cardsByInterview, card.interview_id, card);

  const interviewsByCandidate = new Map<string, HrInterview[]>();
  for (const interview of interviews) {
    push(interviewsByCandidate, interview.candidate_id, interview);
  }

  const guidesByCandidate = new Map<string, HrInterviewGuide[]>();
  for (const guide of guides) push(guidesByCandidate, guide.candidate_id, guide);

  return candidates.map((candidate) =>
    rowFor(
      candidate,
      interviewsByCandidate.get(candidate.id) ?? [],
      guidesByCandidate.get(candidate.id) ?? [],
      cardsByInterview,
    ),
  );
}

function rowFor(
  candidate: HrCandidate,
  candidateInterviews: readonly HrInterview[],
  candidateGuides: readonly HrInterviewGuide[],
  cardsByInterview: ReadonlyMap<string, HrScorecard[]>,
): ScoresRow {
  const rounds = [...candidateInterviews].sort((a, b) => a.round - b.round);

  const lines: ScoresInterviewLine[] = rounds.map((interview) => {
    const cards = [...(cardsByInterview.get(interview.id) ?? [])].sort(
      (a, b) => cardStamp(b) - cardStamp(a) || a.id.localeCompare(b.id),
    );
    const totals: number[] = [];
    for (const card of cards) {
      const total = cardTotal(card);
      if (total !== null) totals.push(total);
    }
    return {
      interview,
      cards,
      total: mean(totals),
      dimensions: dimensionAverages(cards),
      verdict: latestCard(cards)?.verdict ?? null,
    };
  });

  const allCards = lines.flatMap((line) => line.cards);
  const cardTotals: number[] = [];
  for (const card of allCards) {
    const total = cardTotal(card);
    if (total !== null) cardTotals.push(total);
  }
  const interviewAverage = mean(cardTotals);

  const groups = guideGroups(candidateGuides);
  const guideAverage = mean(guideScores(groups));

  // A round counts as booked when it is scheduled, was held, or already has a
  // scorecard — a card on a cancelled slot still says "this round happened",
  // and a denominator that omitted it would print "1 / 0".
  const scheduled = lines.filter(
    (line) =>
      line.interview.status === "scheduled" ||
      line.interview.status === "done" ||
      line.total !== null,
  ).length;
  const scored = lines.filter((line) => line.total !== null).length;

  return {
    candidate,
    resumeScore: candidate.score_resume,
    matchScore: candidate.match_score,
    interviewAverage,
    guideAverage,
    combined: combineScore(interviewAverage, guideAverage),
    gap: scoreGap(interviewAverage, guideAverage),
    verdict: latestCard(allCards)?.verdict ?? null,
    rounds: { scored, scheduled },
    interviews: lines,
    guideGroups: groups,
    dimensions: dimensionAverages(allCards),
  };
}

/** Whether any row on the page has a combined score — the "数据不全" test. */
export function hasAnyScore(rows: readonly ScoresRow[]): boolean {
  return rows.some((row) => row.combined !== null);
}

/**
 * Nulls sort last in both directions.
 *
 * A candidate nobody has scored is not "the lowest score": they are outside the
 * ranking, so flipping the direction must not float them to the top of a
 * best-first list. The name breaks ties in every field, so equal numbers have a
 * stable, readable order.
 */
function compareNullable(a: number | null, b: number | null, direction: SortDirection): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  const order = a - b;
  return order === 0 ? 0 : direction === "asc" ? order : -order;
}

function compareNames(a: ScoresRow, b: ScoresRow): number {
  return a.candidate.name.localeCompare(b.candidate.name, undefined, { numeric: true });
}

export function sortScoresRows(
  rows: readonly ScoresRow[],
  field: ScoresSortField,
  direction: SortDirection,
): ScoresRow[] {
  const sorted = [...rows];
  sorted.sort((a, b) => {
    switch (field) {
      case "candidate":
        return direction === "asc" ? compareNames(a, b) : -compareNames(a, b);
      case "resume":
        return (
          compareNullable(a.resumeScore, b.resumeScore, direction) || compareNames(a, b)
        );
      case "match":
        return (
          compareNullable(a.matchScore, b.matchScore, direction) || compareNames(a, b)
        );
      case "interview":
        return (
          compareNullable(a.interviewAverage, b.interviewAverage, direction) ||
          compareNames(a, b)
        );
      case "guide":
        return (
          compareNullable(a.guideAverage, b.guideAverage, direction) || compareNames(a, b)
        );
      case "verdict":
        return (
          compareNullable(verdictRank(a.verdict), verdictRank(b.verdict), direction) ||
          compareNames(a, b)
        );
      case "rounds":
        return (
          compareNullable(a.rounds.scored, b.rounds.scored, direction) ||
          compareNullable(a.rounds.scheduled, b.rounds.scheduled, direction) ||
          compareNames(a, b)
        );
      case "combined":
      default:
        return (
          compareNullable(a.combined, b.combined, direction) || compareNames(a, b)
        );
    }
  });
  return sorted;
}

function verdictRank(verdict: HrScorecardVerdict | null): number | null {
  return verdict === null ? null : VERDICT_RANK[verdict];
}

/** The 0–5 readings print at one decimal, like every other score in this space. */
export function formatScore(value: number | null): string | null {
  return value === null ? null : value.toFixed(1);
}

/** `match_score` is a 0–100 smallint, so it reads as a percentage. */
export function formatPercent(value: number | null): string | null {
  return value === null ? null : `${Math.round(value)}%`;
}
