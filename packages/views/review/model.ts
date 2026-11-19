import {
  REVIEW_DOMAINS,
  REVIEW_REASON_MAX_LENGTH,
  type OverwriteReason,
  type ReviewQueueRow,
} from "@morechat/core/types";

/**
 * The review queue's pure half.
 *
 * Three things live here because a page that re-derived them would get one of
 * them wrong: the verdict *target* (which rows an `a`/`r` acts on), the reject
 * reason's validation, and the cursor arithmetic. Everything else on the page is
 * formatting.
 *
 * The queue is server-ordered (`updated_at DESC`) and stays that way: a review
 * desk works newest-first, and re-sorting a page of fifty by amount would hide
 * the row that just arrived.
 */

/** One row's identity across the four ledgers — the same id can exist twice. */
export function rowKey(row: Pick<ReviewQueueRow, "domain" | "id">): string {
  return `${row.domain}:${row.id}`;
}

/** The domains in the order the chips read: money first, then the conversation. */
export const DOMAIN_ORDER = REVIEW_DOMAINS;

/** Whether a `domain` value is one this build has words for. */
export function isKnownDomain(domain: string): boolean {
  return (REVIEW_DOMAINS as readonly string[]).includes(domain);
}

/** The copy key for a domain, or `null` when the server named one we lack words
 *  for — the row then prints the raw value rather than a borrowed label. */
export function domainCopyKey(
  domain: string,
): "domain_collabs" | "domain_quotes" | "domain_activities" | "domain_settlements" | null {
  switch (domain) {
    case "collabs":
      return "domain_collabs";
    case "quotes":
      return "domain_quotes";
    case "activities":
      return "domain_activities";
    case "settlements":
      return "domain_settlements";
    default:
      return null;
  }
}

/** How many rows each loaded domain holds — the number beside a filter chip. */
export function domainCounts(rows: readonly ReviewQueueRow[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.domain, (counts.get(row.domain) ?? 0) + 1);
  return counts;
}

/**
 * The cursor after `j`/`k`. Clamped rather than wrapped: a reviewer pressing `j`
 * at the last row should stay there, not jump back to the top and accept
 * something by accident.
 */
export function moveCursor(current: number, delta: number, length: number): number {
  if (length === 0) return -1;
  const next = current + delta;
  if (next < 0) return 0;
  if (next >= length) return length - 1;
  return next;
}

/** Add or remove one row from the multi-selection. */
export function toggleRow(selection: ReadonlySet<string>, key: string): Set<string> {
  const next = new Set(selection);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}

/**
 * The rows a verdict applies to.
 *
 * A non-empty selection wins over the cursor: once the reviewer has ticked rows,
 * `a` means "these". With nothing ticked it means "the row under the cursor",
 * which is what makes j/k/a a usable single-row loop. An empty queue answers
 * nothing, so the page never posts a verdict against no row.
 */
export function verdictTargets(
  rows: readonly ReviewQueueRow[],
  cursor: number,
  selection: ReadonlySet<string>,
): ReviewQueueRow[] {
  if (selection.size > 0) return rows.filter((row) => selection.has(rowKey(row)));
  const row = rows[cursor];
  return row ? [row] : [];
}

/** Which rows stay visible for a selection already applied — none of them. */
export function withoutKeys(
  rows: readonly ReviewQueueRow[],
  keys: ReadonlySet<string>,
): ReviewQueueRow[] {
  if (keys.size === 0) return [...rows];
  return rows.filter((row) => !keys.has(rowKey(row)));
}

/**
 * The cursor after `count` rows left the list. Clamped to the new length so the
 * next `j` starts from a row that exists.
 */
export function cursorAfterRemoval(cursor: number, removed: number, length: number): number {
  return moveCursor(cursor - removed, 0, length);
}

/** Why a reject reason was refused, or `null` when it is acceptable. */
export type RejectReasonError = "empty" | "too_long" | null;

/**
 * §26.1: a rejection must carry a reason, capped at 500 characters. The count is
 * on the trimmed text, because trailing spaces are not a reason.
 */
export function validateRejectReason(reason: string): RejectReasonError {
  const trimmed = reason.trim();
  if (trimmed === "") return "empty";
  if (trimmed.length > REVIEW_REASON_MAX_LENGTH) return "too_long";
  return null;
}

/** The reason as the server should receive it. */
export function trimmedReason(reason: string): string {
  return reason.trim();
}

/** Whether a row was written by an agent — the queue's whole point. */
export function writtenByAgent(row: ReviewQueueRow): boolean {
  return row.actor_type === "agent";
}

/**
 * The writer's display name.
 *
 * Three states, because they are three different facts: an agent whose name the
 * server could resolve, an agent whose name it could not (the id is all we have,
 * and inventing "Agent" would hide that), and a member. A row whose trail names
 * neither is `unknown` — the server sends an empty `actor_type` when it cannot
 * say who wrote the row, and calling that person a member would be a guess.
 */
export function authorLabel(row: ReviewQueueRow): {
  kind: "agent" | "member" | "unknown";
  name: string | null;
} {
  if (writtenByAgent(row)) {
    return { kind: "agent", name: row.agent_name ?? row.actor_name ?? null };
  }
  if (row.actor_type === "member") {
    return { kind: "member", name: row.actor_name ?? null };
  }
  return { kind: "unknown", name: row.actor_name ?? null };
}

/** The changed fields, trimmed and de-duplicated; unknown fields stay as sent. */
export function changedFields(row: ReviewQueueRow): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const field of row.changed_fields) {
    const name = field.trim();
    if (name === "" || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}

/** The four overwrite reasons, in the order the dialog offers them. */
export const OVERWRITE_OPTIONS: readonly OverwriteReason[] = [
  "wrong_fact",
  "wrong_judgement",
  "stale",
  "taste",
];
