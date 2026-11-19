import type { HrCandidateStage } from "@morechat/core/types";
import type { KanbanTone } from "../../layout/kanban-board";

/**
 * The pipeline's own vocabulary, in the order a person walks it.
 *
 * `hr_candidate.stage` has eight values (`WORKBENCH-API.md` §10.2). Six of them
 * are places somebody can still be: the board draws those as columns. The other
 * two are where a search ends — `rejected` and `withdrawn` — and a column for
 * them would be a column nobody drags into on purpose. They are folded into the
 * rail beside the board instead, counted and openable, so a closed candidate is
 * still findable without taking a column's width away from the live pipeline.
 *
 * The eight keys are the server's, unchanged: the board's column keys are the
 * `stage` values a drop writes, so a column and a PATCH cannot disagree.
 */
export const BOARD_STAGES = [
  "screening",
  "test",
  "interview",
  "scored",
  "offer",
  "hired",
] as const;

export type BoardStage = (typeof BOARD_STAGES)[number];

/** The two stages a search ends at. Folded into the rail, never a column. */
export const CLOSED_STAGES = ["rejected", "withdrawn"] as const;

export type ClosedStage = (typeof CLOSED_STAGES)[number];

/**
 * Column accents. The dot is the only colour a column carries, because the
 * count and the heading already say what the column is: `screening` is where
 * nothing has been decided, `interview`/`scored` are the rounds in progress,
 * `offer` is the one that needs an answer, `hired` is done.
 */
export const STAGE_TONE: Record<BoardStage, KanbanTone> = {
  screening: "neutral",
  test: "neutral",
  interview: "brand",
  scored: "brand",
  offer: "warn",
  hired: "brand",
};

/**
 * Where a closed candidate goes when it is restored.
 *
 * The original page remembered the stage a candidate was rejected from; we keep
 * no stage history (parity list, difference 3: no event stream), so a restore
 * puts the person back at the pipeline's first column rather than inventing the
 * stage they came from. The recruiter moves them on from there.
 */
export const RESTORE_STAGE: BoardStage = "screening";

export function isClosedStage(stage: HrCandidateStage): stage is ClosedStage {
  return (CLOSED_STAGES as readonly string[]).includes(stage);
}
