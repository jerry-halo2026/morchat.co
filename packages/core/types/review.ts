/**
 * The review gate (docs/engineering/WORKBENCH-API.md §26, docs/engineering/
 * COLLAB-MODEL.md §7).
 *
 * An agent's write — or a human's edit of a high-value field — lands in
 * `review_state = 'pending'` instead of being taken as fact. This module is the
 * queue that answers "what is waiting for a person", and the reason vocabulary
 * that makes an overwrite mean something: "a human changed it" is not evidence
 * the agent was wrong, and "a human said *wrong fact*" is.
 *
 * Two vocabularies, deliberately separate:
 *
 *   - a **reject reason** explains a verdict on a row the reviewer did not
 *     write. It is free text (≤500 characters) because the reviewer is
 *     explaining a judgement, and four fixed words cannot hold it.
 *   - an **overwrite reason** explains why a human is replacing an agent's
 *     value, and it is exactly the four kinds §26.3 fixes: a wrong fact, a wrong
 *     judgement, an answer that went stale, or taste. Counting those is what
 *     turns "the human changed 3 of 10 agent rows" into a rate with a cause.
 */

/** The four ledgers that can hold a pending row (§26.1). */
export const REVIEW_DOMAINS = ["collabs", "quotes", "activities", "settlements"] as const;

export type ReviewDomain = (typeof REVIEW_DOMAINS)[number];

/** `pending | accepted | rejected`; the queue only ever lists `pending`. */
export type ReviewState = "pending" | "accepted" | "rejected";

/**
 * Why a human replaced an agent's value (§26.3). Closed on purpose: the
 * overwrite rate is only meaningful if the answer is one of four.
 */
export const OVERWRITE_REASONS = [
  "wrong_fact",
  "wrong_judgement",
  "stale",
  "taste",
] as const;

export type OverwriteReason = (typeof OVERWRITE_REASONS)[number];

/**
 * One row waiting for a verdict.
 *
 * The queue is a *projection*, not a ledger row: four tables with different
 * columns are flattened into what a reviewer needs to decide — which ledger, who
 * wrote it (and whether that was an agent), what it is about, the money when
 * there is any, and when it changed. `summary` is the server's one-line
 * description; `changed_fields` is the "what did it touch" list, which is the
 * difference between "review this" and "review this number".
 */
export interface ReviewQueueRow {
  /** The ledger this row belongs to. */
  domain: string;
  /** The ledger row's id — the accept/reject path segment. */
  id: string;
  /** `pending` for everything the queue returns. */
  review_state: string;
  /** Who wrote the change being reviewed: `member` or `agent`. */
  actor_type: string;
  actor_id: string | null;
  /** The agent's name when `actor_type` is `agent`; null otherwise. */
  agent_name: string | null;
  /** A human-readable name for the writer (member name, or the agent's). */
  actor_name: string | null;
  /** One line about the row itself (a creator name, a brief title, …). */
  summary: string;
  /** Business fields the write touched, in the ledger's own vocabulary. */
  changed_fields: string[];
  /** The row's amount in `currency`, when the ledger has money on it. */
  amount: number | null;
  currency: string;
  /** The ledger row's own version counter (§3), for a stale-write retry. */
  revision: number;
  created_at: string;
  updated_at: string;
}

export interface ReviewQueueResponse {
  rows: ReviewQueueRow[];
  /** This page's row count, not the workspace total. */
  total: number;
}

export interface ReviewQueueFilters {
  /** Omitted = every domain. */
  domain?: ReviewDomain | string;
  limit?: number;
}

/** `POST /review/{domain}/{id}/reject` (§26.2). */
export interface RejectReviewRequest {
  /** Why the row was refused; the server caps it at 500 characters. */
  reason: string;
}

/** The longest reject reason the server accepts (§26.1). */
export const REVIEW_REASON_MAX_LENGTH = 500;
