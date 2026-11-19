/**
 * The screening queue's pure part: what a stage means for the reviewer, how the
 * list is ordered, where an arrow key lands, and which PATCH undoes a decision.
 *
 * Everything here is a function of rows alone, so the page keeps only state
 * (which role, which row, which boxes) and the tests for these rules do not need
 * a DOM. The two stage constants are exported because the page names them at
 * three call sites and a literal `"test"` there would be a guess each time.
 */

import type {
  HrCandidate,
  HrCandidateStage,
  MemberRole,
  UpdateHrCandidateRequest,
} from "@morechat/core/types";

/** How the left column is ordered. */
export type ResumesSort = "queue" | "match";

/** The two orderings, in the order the toggle offers them. */
export const RESUMES_SORTS: readonly ResumesSort[] = ["queue", "match"];

/** Where 通过 sends a candidate: on to the written assessment. */
export const APPROVE_STAGE: HrCandidateStage = "test";

/**
 * Where 撤销 sends a row: back to the queue.
 *
 * `screening` is also the stage a brand-new application starts in, so "undo"
 * needs no separate column — the row simply returns to the state nobody has
 * decided on.
 */
export const SCREENING_STAGE: HrCandidateStage = "screening";

/** The roles that may act on the pipeline; a null role is a reader. */
const WRITE_ROLES = new Set<MemberRole>(["owner", "admin", "member"]);

/**
 * Whether the reader may act on the queue at all.
 *
 * A member record arrives a beat after the first paint, and a reader whose
 * membership has not resolved gets the page read-only rather than a button that
 * would be refused. That is the same rule the interview calendar applies.
 */
export function canScreen(role: MemberRole | null, memberLoading: boolean): boolean {
  return !memberLoading && role !== null && WRITE_ROLES.has(role);
}

/** A candidate nobody has read yet: `screening` is the whole of "not screened". */
export function isAwaitingScreening(candidate: HrCandidate): boolean {
  return candidate.stage === SCREENING_STAGE;
}

/** The "还有 N 位待筛" the page shows: rows still in the queue. */
export function awaitingScreeningCount(rows: readonly HrCandidate[]): number {
  let count = 0;
  for (const row of rows) if (isAwaitingScreening(row)) count += 1;
  return count;
}

/**
 * Best match first.
 *
 * A row nobody scored sorts below every scored one rather than above them: an
 * unknown match is not a perfect match, and `null` would otherwise land at
 * position 0 in a numeric sort. The sort is stable, so equal scores keep the
 * server's order.
 */
export function sortByMatchScore(rows: readonly HrCandidate[]): HrCandidate[] {
  return [...rows].sort((a, b) => (b.match_score ?? -1) - (a.match_score ?? -1));
}

/**
 * The id one arrow key press moves to, clamped at both ends.
 *
 * `currentId` may name a row that is no longer in the list (the role changed,
 * the row was rejected out of a filter); the move then starts from the edge the
 * key points at instead of refusing to move.
 */
export function nextSelection(
  rows: readonly HrCandidate[],
  currentId: string | null,
  delta: number,
): string | null {
  if (rows.length === 0) return null;
  const index = rows.findIndex((row) => row.id === currentId);
  const from = index < 0 ? (delta > 0 ? -1 : rows.length) : index;
  const next = Math.min(rows.length - 1, Math.max(0, from + delta));
  return rows[next]?.id ?? null;
}

/**
 * The PATCH that undoes a screening decision.
 *
 * The rejection note is cleared with the stage: it belongs to the rejected state,
 * and a row back in the queue still carrying "不合适" would say two things at
 * once. A row that never had one is sent the stage alone — never a `null` that
 * would rewrite a column nobody touched.
 */
export function undoPatch(candidate: HrCandidate): UpdateHrCandidateRequest {
  return candidate.rejected_reason === null
    ? { stage: SCREENING_STAGE }
    : { stage: SCREENING_STAGE, rejected_reason: null };
}

/** The expected salary as money, or null when the candidate stated none. */
export function formatSalary(candidate: HrCandidate, locales: string): string | null {
  const amount = candidate.expected_salary;
  if (amount === null) return null;
  return new Intl.NumberFormat(locales, {
    style: "currency",
    currency: candidate.currency || "CNY",
    maximumFractionDigits: 0,
  }).format(amount);
}
