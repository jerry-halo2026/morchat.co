import type { CreatorPost, CreatorPostMetric, CreatorVideo } from "@morechat/core/types";

/**
 * The data page's pure half: what a snapshot number *means*.
 *
 * The whole file exists because of one rule from `WORKBENCH-DATA-CONTRACT` §2:
 * **NULL is "not collected yet", not 0.** Roughly two thirds of the mirrored
 * works carry no like/comment/share count, and a workspace that rendered those
 * as zero would invent a collapse in engagement that never happened. So every
 * number on the page goes through {@link figureState}, which keeps three states
 * apart instead of two:
 *
 *   `value`             — a reading (anything but zero)
 *   `zero`              — the platform says zero, which is also a reading
 *   `insufficient_data` — nothing was collected, and nothing is claimed
 *
 * The second reason is {@link fieldCoverage}: a measure the platform has never
 * answered for is not a column of this table. Drawing it would fill the screen
 * with "not collected" and say nothing about the rows; instead the column is
 * dropped and *named* in a note above the table, so the absence stays visible as
 * a fact rather than as noise.
 */

/** The per-day measures of one post (`creator_post_metric`, §19.2). */
export type MetricField = "play" | "likes" | "comments" | "shares" | "clicks" | "converts";

export const METRIC_FIELDS = [
  "play",
  "likes",
  "comments",
  "shares",
  "clicks",
  "converts",
] as const satisfies readonly MetricField[];

/** The counters on a mirrored work (`creator_video`, §2.1). All four are nullable. */
export type VideoCounterField = "play_count" | "digg_count" | "comment_count" | "share_count";

export const VIDEO_COUNTER_FIELDS = [
  "play_count",
  "digg_count",
  "comment_count",
  "share_count",
] as const satisfies readonly VideoCounterField[];

export type FigureState = "value" | "zero" | "insufficient_data";

/**
 * Three states, never two. A missing value and a zero are different facts and
 * the page prints different words for them.
 */
export function figureState(value: number | null | undefined): FigureState {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "insufficient_data";
  }
  return value === 0 ? "zero" : "value";
}

export interface FieldCoverage<F extends string> {
  /** Fields at least one row answers for — these become columns. */
  columns: F[];
  /** Fields no row answers for — dropped from the table and named in a note. */
  missing: F[];
}

/**
 * Which fields the response actually speaks about.
 *
 * A field is a column when **some** row carries a number for it. That keeps a
 * column whose values are mostly missing (a platform that reports likes but not
 * plays) and drops one that is empty on every row (a measure this source never
 * returns) — the first is per-day absence, the second is a column that does not
 * exist for this workspace.
 */
export function fieldCoverage<T, F extends keyof T & string>(
  rows: readonly T[],
  fields: readonly F[],
  read: (row: T, field: F) => number | null | undefined,
): FieldCoverage<F> {
  const answered = new Set<F>();
  for (const row of rows) {
    for (const field of fields) {
      if (answered.has(field)) continue;
      const value = read(row, field);
      // A key the response does not carry at all reads as `undefined`; both that
      // and an explicit `null` mean "no reading", which is not a column.
      if (value !== null && value !== undefined && Number.isFinite(value)) {
        answered.add(field);
      }
    }
  }
  return {
    columns: fields.filter((field) => answered.has(field)),
    missing: fields.filter((field) => !answered.has(field)),
  };
}

export function metricCoverage(rows: readonly CreatorPostMetric[]): FieldCoverage<MetricField> {
  return fieldCoverage(rows, METRIC_FIELDS, (row, field) => row[field]);
}

export function videoCoverage(videos: readonly CreatorVideo[]): FieldCoverage<VideoCounterField> {
  return fieldCoverage(videos, VIDEO_COUNTER_FIELDS, (video, field) => video[field]);
}

/**
 * Oldest day first. The series is read as a line — "what happened to this post" —
 * and a line runs left to right; the newest day is found through
 * {@link latestSnapshot} rather than by taking the first row.
 */
export function sortSnapshots(metrics: readonly CreatorPostMetric[]): CreatorPostMetric[] {
  return [...metrics].sort((a, b) => a.captured_on.localeCompare(b.captured_on));
}

/** The most recent capture, or `null` when the post has never been captured. */
export function latestSnapshot(
  metrics: readonly CreatorPostMetric[],
): CreatorPostMetric | null {
  return sortSnapshots(metrics).at(-1) ?? null;
}

/** A work's one-line name: the description's first line, else its aweme id. */
export function videoTitle(video: CreatorVideo): string {
  const line = video.desc_text?.trim().split("\n")[0]?.trim() ?? "";
  return line || video.aweme_id;
}

/**
 * The post the page opens on: the newest one. The list endpoint states no order,
 * so the page picks rather than trusting the first row it was handed.
 */
export function newestPost(posts: readonly CreatorPost[]): CreatorPost | null {
  let newest: CreatorPost | null = null;
  for (const post of posts) {
    if (!newest || post.published_at > newest.published_at) newest = post;
  }
  return newest;
}

/** A post as the picker prints it: its title, or the URL when it has none. */
export function postLabel(post: CreatorPost): string {
  return post.title?.trim() || post.url;
}

/** `YYYY-MM-DD` of the reader's clock, the default day of a hand-written snapshot. */
export function todayKey(now: Date): string {
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * A blank form field is `null` — "not collected" — and never 0. A zero is
 * something the platform reported; a blank is something nobody has read yet.
 */
export function numberOrNull(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}
