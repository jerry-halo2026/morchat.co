import type { Creator, CreatorPost, MediaScript } from "@morechat/core/types";

/**
 * The publish queue's pure half.
 *
 * Two facts shape this file:
 *
 *   - **A publish plan is `media_script.publish_at` plus a status** — there is no
 *     `media_publish` table (WORKBENCH-B3-PLAN §2). So the queue is a group of
 *     approved scripts, and the only thing this page owns is the instant in
 *     `publish_at`.
 *   - **`publishing` is a topic stage, not a script status.** The script statuses
 *     are `draft | review | approved | archived` (§12); `publishing` belongs to
 *     `media_topic.status`'s pipeline (`pool → scripting → shooting → publishing →
 *     done`). "Start publishing" therefore moves the script's *topic*, which is
 *     why {@link MediaScript.topic_id} is read here at all.
 *
 * Days are the reader's local calendar days, not UTC ones: a 06:00 publish in
 * Shanghai is the 20th to the person scheduling it, whatever the server's zone
 * is. `datetime-local` speaks that same wall clock, so one conversion pair
 * ({@link localDateTimeValue} / {@link parseLocalDateTime}) serves both the
 * grouping and the edit control.
 */

/** Group key for the scripts nobody has scheduled yet. */
export const UNSCHEDULED_KEY = "unscheduled";

export interface PublishDayGroup {
  /** Local `YYYY-MM-DD`, or {@link UNSCHEDULED_KEY}. */
  key: string;
  /** Local midnight of the day; `null` for the unscheduled group. */
  at: Date | null;
  rows: MediaScript[];
}

const pad = (part: number) => String(part).padStart(2, "0");

/** The `YYYY-MM-DD` the reader's clock is on, for the day `date` falls in. */
export function localDayKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Midnight of the local day `date` falls in. */
export function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * Only an approved script is publishable. The page asks the server for exactly
 * that set and re-checks here: a row that arrived anyway must not render a
 * publish action, because a draft has no agreed copy to publish.
 */
export function approvedScripts(scripts: readonly MediaScript[]): MediaScript[] {
  return scripts.filter((script) => script.status === "approved");
}

/** The instant a script is planned for, or `null` when it has none (or an unparsable one). */
export function publishInstant(script: MediaScript): number | null {
  if (!script.publish_at) return null;
  const at = new Date(script.publish_at).getTime();
  return Number.isNaN(at) ? null : at;
}

function dayTime(group: PublishDayGroup): number {
  return group.at ? group.at.getTime() : Number.POSITIVE_INFINITY;
}

/**
 * Scheduled scripts first, earliest first; the undated ones after them, most
 * recently touched first. An undated script is not "the earliest day" — it is a
 * row that still needs a decision, so it sinks instead of floating to the top.
 */
export function sortScheduled(scripts: readonly MediaScript[]): MediaScript[] {
  return [...scripts].sort((a, b) => {
    const left = publishInstant(a);
    const right = publishInstant(b);
    if (left === null && right === null) return b.updated_at.localeCompare(a.updated_at);
    if (left === null) return 1;
    if (right === null) return -1;
    return left - right;
  });
}

/**
 * The queue as a day-by-day list: one group per local day that holds work, in
 * order, then one group for the scripts with no `publish_at`. Days with no work
 * are absent — a publish queue lists what is planned, not what a calendar could
 * hold.
 */
export function groupByPublishDay(scripts: readonly MediaScript[]): PublishDayGroup[] {
  const groups = new Map<string, PublishDayGroup>();
  const unscheduled: MediaScript[] = [];

  for (const script of sortScheduled(scripts)) {
    const at = publishInstant(script);
    if (at === null) {
      unscheduled.push(script);
      continue;
    }
    const day = new Date(at);
    const key = localDayKey(day);
    const existing = groups.get(key);
    if (existing) existing.rows.push(script);
    else groups.set(key, { key, at: startOfLocalDay(day), rows: [script] });
  }

  const ordered = [...groups.values()].sort((a, b) => dayTime(a) - dayTime(b));
  if (unscheduled.length > 0) {
    ordered.push({ key: UNSCHEDULED_KEY, at: null, rows: unscheduled });
  }
  return ordered;
}

/**
 * The one line a queue row prints. A script has no title of its own: the hook is
 * what a viewer hears first, so it names the row; the body's opening line and the
 * cover note are the fallbacks, and a script with none of the three prints the
 * empty placeholder.
 */
export function scriptTitle(script: MediaScript): string | null {
  for (const candidate of [script.hook, script.body, script.cover_note]) {
    const line = candidate?.trim().split("\n")[0]?.trim() ?? "";
    if (line) return line;
  }
  return null;
}

/**
 * A `datetime-local` value — `YYYY-MM-DDTHH:mm` in the viewer's zone — for a
 * stored instant. The control rejects an ISO string, and would shift the time by
 * the offset if it accepted one.
 */
export function localDateTimeValue(instant: string | null): string {
  if (!instant) return "";
  const date = new Date(instant);
  if (Number.isNaN(date.getTime())) return "";
  return `${localDayKey(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** The instant a `datetime-local` value names, or `null` when it names no day. */
export function parseLocalDateTime(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Newest published first: the list answers "what went out", and that is recent. */
export function sortPublished(posts: readonly CreatorPost[]): CreatorPost[] {
  return [...posts].sort((a, b) => b.published_at.localeCompare(a.published_at));
}

/**
 * Names for the posts' `creator_id`. The post row carries the id only, so the
 * ledger is read once and folded into a map rather than one query per row.
 */
export function creatorNameIndex(creators: readonly Creator[]): Map<string, string> {
  return new Map(creators.map((creator) => [creator.id, creator.display_name]));
}

/** Every script this page can name, by id — the map a published row resolves against. */
export function scriptIndex(scripts: readonly MediaScript[]): Map<string, MediaScript> {
  return new Map(scripts.map((script) => [script.id, script]));
}

/**
 * `creator_post.media_script_id` — the script version a post came from (migration
 * 733, `CreatorPostResponse.MediaScriptID`).
 *
 * **The field is on the wire but not in the type.** `CreatorPostResponse` has
 * carried it since the B3 backend batch, and the client's post parser is a zod
 * `.loose()` object, so the value survives parsing — but
 * `packages/core/types/workbench.ts` does not declare it on `CreatorPost` yet.
 * This module may not change `core`, so the value is read off the row as an
 * unknown extra and narrowed here rather than asserted: the column shows when the
 * response carries the key and behaves as unlinked when it does not.
 */
export function postScriptId(post: CreatorPost): string | null {
  // The column is nullable on the wire and `.loose()` lets older payloads
  // drop it entirely, so an absent key reads as "no script" rather than
  // throwing a column that claims nothing.
  const value = post.media_script_id;
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

/**
 * The head of an id, for a link this page cannot resolve to a row. Eight
 * characters is enough to tell two scripts apart in a column and short enough to
 * read; printing nothing would claim the post has no script.
 */
export function shortId(id: string): string {
  return id.slice(0, 8);
}

/** The host of a post's URL, for a cell that has to stay one line. */
export function urlHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
