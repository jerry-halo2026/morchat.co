import type {
  HrGuideItem,
  HrGuideStatus,
  HrInterviewGuide,
  HrQuestion,
  HrQuestionDimension,
} from "@morechat/core/types";

/**
 * The guide page's pure parts: the enums it draws, one snapshot entry built from
 * a bank row, the reordering an up/down button performs, and the counts a row
 * shows.
 *
 * Nothing here reads or writes: reordering is local until Save, because
 * `items` is replaced as a whole (§14.3) and the server never sees a half-moved
 * list.
 */

/** The five dimensions, in the order the scorecard's four come first. */
export const GUIDE_DIMENSIONS: readonly HrQuestionDimension[] = [
  "skill",
  "experience",
  "culture",
  "potential",
  "risk",
];

/** A guide's three states, draft → ready → used. */
export const GUIDE_STATUSES: readonly HrGuideStatus[] = ["draft", "ready", "used"];

/** An entry for a question nobody has written down yet. */
export function emptyItem(dimension: HrQuestionDimension = "skill"): HrGuideItem {
  return {
    question_id: null,
    dimension,
    question: "",
    intent: "",
    signals: "",
    red_flags: "",
    asked: false,
    note: "",
    score: null,
  };
}

/**
 * A snapshot entry copied out of the bank.
 *
 * The text is copied, not referenced: `question_id` is provenance for
 * `usage_count`, and later edits to the bank row must not rewrite this outline
 * (§14.4).
 */
export function itemFromQuestion(question: HrQuestion): HrGuideItem {
  return {
    question_id: question.id,
    dimension: question.dimension,
    question: question.question,
    intent: question.intent ?? "",
    signals: question.signals ?? "",
    red_flags: question.red_flags ?? "",
    asked: false,
    note: "",
    score: null,
  };
}

/** Move one entry by `delta` (+1 down, -1 up), clamped to the ends. */
export function moveItem(
  items: readonly HrGuideItem[],
  index: number,
  delta: -1 | 1,
): HrGuideItem[] {
  const next = [...items];
  const target = index + delta;
  const moved = next[index];
  const displaced = next[target];
  if (!moved || !displaced) return next;
  next[index] = displaced;
  next[target] = moved;
  return next;
}

/** Drop entries with no question text and trim the rest: the server rejects "". */
export function savableItems(items: readonly HrGuideItem[]): HrGuideItem[] {
  return items
    .map((item) => ({ ...item, question: item.question.trim() }))
    .filter((item) => item.question !== "");
}

/** How many questions a row holds, and how many were ticked in the room. */
export function guideCounts(items: readonly HrGuideItem[]): {
  questions: number;
  asked: number;
} {
  let asked = 0;
  for (const item of items) if (item.asked) asked += 1;
  return { questions: items.length, asked };
}

/** The first 40 characters of a question, for the bank picker's one-line rows. */
export function previewQuestion(question: string, max = 40): string {
  const text = question.trim();
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}

/**
 * The round a new outline for `candidateId` most likely is: one past the
 * highest round that candidate already has.
 */
export function nextRound(
  guides: readonly Pick<HrInterviewGuide, "candidate_id" | "round">[],
  candidateId: string,
): number {
  let highest = 0;
  for (const guide of guides) {
    if (guide.candidate_id === candidateId && guide.round > highest) highest = guide.round;
  }
  return highest + 1;
}

/** Whether an entry's question is already in the list (the bank's own identity). */
export function hasQuestion(items: readonly HrGuideItem[], questionId: string): boolean {
  return items.some((item) => item.question_id === questionId);
}
