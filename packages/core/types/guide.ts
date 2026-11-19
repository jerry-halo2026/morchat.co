/**
 * Interview question bank and per-round guides (docs/engineering/WORKBENCH-API.md
 * §14).
 *
 * The shape that matters, and the reason this is its own module rather than more of
 * `workbench.ts`: **a guide is a snapshot, not a reference.**
 *
 * ```
 * hr_question  (reusable asset: what it verifies / good answer / red flag)
 *      ↓ pick, or let the generator draft
 * HrInterviewGuide.items  (copy of the question + what happened in the room)
 *      ↓
 * hr_scorecard  (the four weighted dimensions, §10)
 * ```
 *
 * `HrGuideItem` therefore carries the question's *text* — not just an id — so editing
 * or archiving a bank row after a round was run leaves that round's record alone.
 * `question_id` inside an item is provenance: it lets the bank count how often a
 * question was used, and no reader resolves content through it.
 *
 * `dimension` reuses the scorecard's four (`skill` / `experience` / `culture` /
 * `potential`) plus `risk`, which the scorecard has no column for: the questions
 * written to surface a disqualifier are not "low skill", and averaging them into the
 * skill score would hide the flag they exist to raise.
 */

/** The five dimensions a question or a guide item is filed under. */
export type HrQuestionDimension = "skill" | "experience" | "culture" | "potential" | "risk";

/** Where a bank row came from: typed by a person, drafted by a model, or generated
 *  by the no-model template. */
export type HrQuestionSource = "manual" | "ai" | "template";

/** A guide's own lifecycle — independent of the interview's. */
export type HrGuideStatus = "draft" | "ready" | "used";

export interface HrQuestion {
  id: string;
  workspace_id: string;
  /** Null for a general question that fits any requisition. */
  job_id: string | null;
  dimension: HrQuestionDimension;
  question: string;
  /** What this question is evidence for. */
  intent: string | null;
  /** What a strong answer contains. */
  signals: string | null;
  /** What should stop the round. */
  red_flags: string | null;
  source: HrQuestionSource;
  tags: string[];
  /** How many guide snapshots named this question. Stored, never derived. */
  usage_count: number;
  owner_member_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export interface HrQuestionListResponse {
  questions: HrQuestion[];
  /** This page's row count, not the workspace total (contract §3.1). */
  total: number;
}

export interface HrQuestionListFilters {
  job_id?: string;
  dimension?: HrQuestionDimension | string;
  /** Free text, matched against the question and its intent. */
  q?: string;
  limit?: number;
}

export interface CreateHrQuestionRequest {
  /** Omit for a general question. */
  job_id?: string;
  dimension: HrQuestionDimension;
  question: string;
  intent?: string;
  signals?: string;
  red_flags?: string;
  source?: HrQuestionSource;
  tags?: string[];
  owner_member_id?: string;
}

/** Every field optional: an omitted one keeps its stored value. */
export type UpdateHrQuestionRequest = Partial<CreateHrQuestionRequest>;

/**
 * One entry of a guide's snapshot.
 *
 * The text fields are plain strings — `""` means "not written down", which is what
 * the interviewer's own notes look like before the round. `score` is nullable
 * because an unscored question and a question scored 0 are different answers.
 */
export interface HrGuideItem {
  /** Provenance only: null for a question that was never in the bank, or that the
   *  generator drafted. */
  question_id: string | null;
  dimension: HrQuestionDimension;
  question: string;
  intent: string;
  signals: string;
  red_flags: string;
  asked: boolean;
  note: string;
  /** 0–5, same scale as the scorecard's dimensions. */
  score: number | null;
}

export interface HrInterviewGuide {
  id: string;
  workspace_id: string;
  /** Null while the round is not booked yet — the normal state of a prepared
   *  outline. */
  interview_id: string | null;
  candidate_id: string;
  job_id: string | null;
  round: number;
  status: HrGuideStatus;
  /** The snapshot. */
  items: HrGuideItem[];
  note: string | null;
  owner_member_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export interface HrGuideListResponse {
  guides: HrInterviewGuide[];
  total: number;
}

export interface HrGuideListFilters {
  candidate_id?: string;
  interview_id?: string;
  status?: HrGuideStatus | string;
  limit?: number;
}

export interface CreateHrInterviewGuideRequest {
  candidate_id: string;
  interview_id?: string;
  job_id?: string;
  /** Defaults to 1; one guide per candidate per round. */
  round?: number;
  status?: HrGuideStatus;
  /** Omit to start empty; the whole array is replaced when sent. */
  items?: HrGuideItem[];
  note?: string;
  owner_member_id?: string;
}

/** `candidate_id` cannot be moved: the guide belongs to a person. */
export type UpdateHrInterviewGuideRequest = Partial<Omit<CreateHrInterviewGuideRequest, "candidate_id">>;

/** `PATCH /guides/{id}/items/{index}` — what happened in the room, not what was
 *  asked. */
export interface UpdateHrGuideItemRequest {
  asked?: boolean;
  note?: string;
  /** Null clears the score; omitting the key keeps it. */
  score?: number | null;
}

/**
 * `POST /guide/generate` — an **unsaved** draft. Nothing is written until the caller
 * saves it through `POST /guides`, which is why the response has no id.
 */
export interface HrGuideGenerateRequest {
  candidate_id: string;
  round?: number;
  /** Defaults to the candidate's own requisition. */
  job_id?: string;
  /** Clamped into 6–8 by the server. */
  limit?: number;
}

export interface HrGuideGenerateResponse {
  candidate_id: string;
  round: number;
  job_id: string | null;
  /**
   * Which generator ran: `template` when the deployment has no model configured (or
   * the model reply was unusable), `ai` when a model drafted the questions. Never
   * `manual` — nothing was stored.
   */
  source: Exclude<HrQuestionSource, "manual">;
  items: HrGuideItem[];
  total: number;
}
