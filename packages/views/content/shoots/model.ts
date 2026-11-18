import type {
  MediaSellingPoint,
  MediaShoot,
  MediaShotItem,
  MediaShotList,
  MediaShotRhythm,
  MediaShotScene,
  MediaShotSize,
  MediaShootStatus,
} from "@morechat/core/types";

/**
 * 拍摄排期's arithmetic: the week the page draws, and the round trip between the
 * shot-list table and `media_shoot.shots`.
 *
 * `shots` is not "a list of rows" on the wire. `WORKBENCH-API.md` §12.5 fixes it
 * to the frozen `shotlist.v1` contract (`contracts/library/domains/video/`), which
 * describes the whole document — title, duration, aspect ratio, and shots that
 * carry `index / start_ms / end_ms / shot_size / scene / rhythm` — while the
 * column's other legal value is the empty object `{}`, meaning "镜头清单还没排".
 * Two consequences this module owns:
 *
 * 1. **Reading is tolerant, writing is exact.** A stored document may be older
 *    than this screen, hand-written, or (from a build that predates §12.5) a plain
 *    map of `序号 → {desc, shot_type, duration_ms}`. Reading accepts all of those
 *    and never throws; writing only ever emits a contract-shaped document or `{}`.
 * 2. **Saving replaces the whole document.** There is no per-shot endpoint, so a
 *    row the editor dropped is a shot the server deletes. `buildShotsValue` is
 *    therefore built from the rows in front of the reader and nothing else, and
 *    the sheet says so before the button.
 *
 * Pure functions: no React, no `useT`, no clock. The page passes the anchor date
 * and the locale in.
 */

/** 镜号 order is the chain's identity; `duration_ms` is per-shot length in seconds. */
const DEFAULT_SECONDS = 3;
const MAX_SECONDS = 600;
const DOC_MIN_MS = 1000;
const DOC_MAX_MS = 600000;
const DOC_MAX_SHOTS = 200;
const DOC_TITLE_MAX = 120;

export const SHOT_SIZES: readonly MediaShotSize[] = ["close-up", "medium", "wide"];
export const SHOT_SCENES: readonly MediaShotScene[] = ["indoor", "outdoor", "shelf", "studio"];
export const SHOT_RHYTHMS: readonly MediaShotRhythm[] = ["fast-cut", "steady", "slow"];
export const SHOT_ASPECT_RATIOS = ["9:16", "16:9", "1:1"] as const;

export type MediaAspectRatio = (typeof SHOT_ASPECT_RATIOS)[number];

/** The five statuses the shooting pipeline allows. */
export const SHOOT_STATUSES: readonly MediaShootStatus[] = [
  "planned",
  "shooting",
  "editing",
  "done",
  "cancelled",
];

export const DEFAULT_ASPECT_RATIO: MediaAspectRatio = "9:16";

/**
 * One editable row of the shot list.
 *
 * `seconds` is a string because it is a text field being typed into: `"1"` on the
 * way to `"15"` must not become `1` and re-render the input under the operator's
 * cursor. The other three are the contract's own enums — `shot_size` is 景别,
 * `scene` and `rhythm` are kept because `shotlist.v1` requires them per shot and
 * the screen edits shots as a table, so a value the operator cannot see would be
 * a value the save silently rewrote.
 *
 * `selling_points` and `product_ref` are carried, not edited: no screen in this
 * batch writes them, and dropping them on the next save would be a data loss the
 * operator never asked for.
 */
export interface ShotRow {
  /** React key: rows move up and down, so an index would re-key every input. */
  key: string;
  text: string;
  shotSize: MediaShotSize;
  scene: MediaShotScene;
  rhythm: MediaShotRhythm;
  seconds: string;
  sellingPoints: readonly MediaSellingPoint[];
  productRef: string;
}

let shotKeySeq = 0;

function nextShotKey(): string {
  shotKeySeq += 1;
  return `shot-${shotKeySeq}`;
}

/**
 * A new row. `scene` / `rhythm` / `shotSize` come from the row the operator is
 * adding under: one shoot is one set-up, so the lighting and the cut rhythm of the
 * shot above is the better guess than a constant, and the row shows the values it
 * got before it is saved.
 */
export function newShotRow(inherit?: Pick<ShotRow, "shotSize" | "scene" | "rhythm">): ShotRow {
  return {
    key: nextShotKey(),
    text: "",
    shotSize: inherit?.shotSize ?? "medium",
    scene: inherit?.scene ?? "indoor",
    rhythm: inherit?.rhythm ?? "steady",
    seconds: String(DEFAULT_SECONDS),
    sellingPoints: [],
    productRef: "",
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function enumOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

/** A duration in milliseconds as whole seconds, floored at 1s (a shot that lasts nothing is not a shot). */
function secondsOf(ms: number): number {
  if (!Number.isFinite(ms) || ms <= 0) return 1;
  return Math.min(MAX_SECONDS, Math.max(1, Math.round(ms / 1000)));
}

/** A duration the operator typed, as whole seconds. */
export function secondsValue(raw: string): number {
  const parsed = Number(raw.trim());
  if (!Number.isFinite(parsed) || parsed <= 0) return 1;
  return Math.min(MAX_SECONDS, Math.round(parsed));
}

function rowFromItem(item: unknown): ShotRow | null {
  if (!isRecord(item)) return null;
  const start = typeof item.start_ms === "number" ? item.start_ms : 0;
  const end = typeof item.end_ms === "number" ? item.end_ms : start + DEFAULT_SECONDS * 1000;
  const selling = Array.isArray(item.selling_points)
    ? item.selling_points.filter((point): point is MediaSellingPoint =>
        typeof point === "string" &&
        ["price", "gift", "ingredient", "effect", "proof", "pain-point"].includes(point),
      )
    : [];
  return {
    key: nextShotKey(),
    text: typeof item.text === "string" ? item.text : "",
    shotSize: enumOf(item.shot_size, SHOT_SIZES, "medium"),
    scene: enumOf(item.scene, SHOT_SCENES, "indoor"),
    rhythm: enumOf(item.rhythm, SHOT_RHYTHMS, "steady"),
    seconds: String(secondsOf(end - start)),
    sellingPoints: selling,
    productRef: typeof item.product_ref === "string" ? item.product_ref : "",
  };
}

/**
 * A `序号 → {desc, shot_type, duration_ms}` row, the shape this feature used
 * before §12.5 froze the contract. Kept because a stored column written by an
 * older build still reads as something the operator recognises instead of an
 * empty table they would then have to retype.
 */
function rowFromLegacyKeyed(value: unknown): ShotRow | null {
  if (!isRecord(value)) return null;
  const duration = typeof value.duration_ms === "number" ? value.duration_ms : DEFAULT_SECONDS * 1000;
  return {
    key: nextShotKey(),
    text: typeof value.desc === "string" ? value.desc : "",
    shotSize: enumOf(value.shot_type, SHOT_SIZES, "medium"),
    scene: "indoor",
    rhythm: "steady",
    seconds: String(secondsOf(duration)),
    sellingPoints: [],
    productRef: "",
  };
}

/** What a stored `shots` column says: the document header plus its rows. */
export interface ShotDocument {
  /** The document's `title`, or null when the column is `{}` / not a document. */
  title: string | null;
  aspectRatio: MediaAspectRatio | null;
  rows: ShotRow[];
}

/**
 * Read any legal-or-broken `shots` value into rows. Never throws, always answers.
 *
 * The order of the checks is the order the values exist in: the empty object is
 * the column default; a document is recognised by its `shots` array (not by
 * `schema_version`, because a document that lost its version field is still worth
 * reading); anything left with 序号-like keys is the legacy map; everything else
 * (an array, a string, `null`, `42`) is junk.
 */
export function readShotDocument(shots: unknown): ShotDocument {
  if (!isRecord(shots)) return { title: null, aspectRatio: null, rows: [] };

  const items = shots.shots;
  if (Array.isArray(items)) {
    const rows = items
      .map(rowFromItem)
      .filter((row): row is ShotRow => row !== null)
      .slice(0, DOC_MAX_SHOTS);
    return {
      title: typeof shots.title === "string" ? shots.title : null,
      aspectRatio:
        typeof shots.aspect_ratio === "string" &&
        (SHOT_ASPECT_RATIOS as readonly string[]).includes(shots.aspect_ratio)
          ? (shots.aspect_ratio as MediaAspectRatio)
          : DEFAULT_ASPECT_RATIO,
      rows,
    };
  }

  // 序号 keys: `"1"`, `"2"`, … sorted by their number, not by string order
  // (`"10"` must follow `"9"`).
  const keyed = Object.keys(shots)
    .filter((key) => /^\d+$/.test(key))
    .sort((a, b) => Number(a) - Number(b));
  if (keyed.length > 0) {
    const rows = keyed
      .map((key) => rowFromLegacyKeyed(shots[key]))
      .filter((row): row is ShotRow => row !== null);
    return { title: null, aspectRatio: null, rows };
  }

  return { title: null, aspectRatio: null, rows: [] };
}

/** Convenience for callers that only want the table. */
export function readShotRows(shots: unknown): ShotRow[] {
  return readShotDocument(shots).rows;
}

export interface ShotDocumentInput {
  title: string;
  aspectRatio: MediaAspectRatio;
  rows: readonly ShotRow[];
}

/**
 * Rows → one `shotlist.v1` document, **replacing everything**.
 *
 * Renumbered from 1 and laid end to end from 0 ms, so `index` / `start_ms` /
 * `end_ms` agree with the table's order and durations instead of being preserved
 * from a list that changed. The document's `duration_ms` is the sum of its shots,
 * clamped into the contract's 1 s–10 min range: the server validates that field,
 * and a table whose total is outside it is not a shot list anyone is going to
 * shoot.
 *
 * Callers with no rows want {@link buildShotsValue} instead — the empty object is
 * a different value, not an empty document.
 */
export function shotDocument(input: ShotDocumentInput): MediaShotList {
  const rows = input.rows.slice(0, DOC_MAX_SHOTS);
  const shots: MediaShotItem[] = [];
  let cursor = 0;
  rows.forEach((row, position) => {
    const length = secondsValue(row.seconds) * 1000;
    const item: MediaShotItem = {
      index: position + 1,
      start_ms: cursor,
      end_ms: cursor + length,
      shot_size: row.shotSize,
      scene: row.scene,
      rhythm: row.rhythm,
    };
    if (row.sellingPoints.length > 0) item.selling_points = [...row.sellingPoints];
    if (row.text.trim()) item.text = row.text.trim().slice(0, 200);
    if (row.productRef.trim()) item.product_ref = row.productRef.trim().slice(0, 80);
    shots.push(item);
    cursor += length;
  });

  return {
    schema_version: "shotlist.v1",
    title: input.title.trim().slice(0, DOC_TITLE_MAX),
    duration_ms: Math.min(DOC_MAX_MS, Math.max(DOC_MIN_MS, cursor)),
    aspect_ratio: input.aspectRatio,
    shots,
  };
}

/**
 * The column value for a table: `{}` when nothing is planned — the one value
 * §12.5 allows for "not planned yet", which the contract itself cannot express
 * because it requires at least one shot — and the document otherwise.
 */
export function buildShotsValue(input: ShotDocumentInput): MediaShotList | Record<string, never> {
  if (input.rows.length === 0) return {};
  return shotDocument(input);
}

// --- scheduling -------------------------------------------------------------

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/** The calendar day of an instant, on the reader's clock (`YYYY-MM-DD`). */
export function localDay(at: Date): string {
  return `${at.getFullYear()}-${pad2(at.getMonth() + 1)}-${pad2(at.getDate())}`;
}

/**
 * `YYYY-MM-DD` as a local calendar day. `new Date("2026-11-18")` would read it as
 * UTC midnight and land on the 17th for anyone west of Greenwich, so the parts are
 * passed to the constructor instead.
 */
export function parseDay(day: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day.trim());
  if (!match) return null;
  const [, year, month, date] = match;
  const at = new Date(Number(year), Number(month) - 1, Number(date));
  return Number.isNaN(at.getTime()) ? null : at;
}

export function addDays(at: Date, days: number): Date {
  const next = new Date(at.getFullYear(), at.getMonth(), at.getDate());
  next.setDate(next.getDate() + days);
  return next;
}

/** Monday of the week `at` falls in. */
export function startOfWeek(at: Date): Date {
  const day = at.getDay(); // 0 = Sunday
  const backToMonday = day === 0 ? 6 : day - 1;
  return addDays(at, -backToMonday);
}

export interface ShootWeek {
  /** Inclusive first day, `YYYY-MM-DD`. */
  start: string;
  /** Inclusive last day (the Sunday), `YYYY-MM-DD`. */
  end: string;
  /** The seven days, Monday first. */
  days: readonly string[];
}

/**
 * The Monday–Sunday week `weeksAway` weeks from `anchor`'s week. `?from=&to=` on
 * `GET /media/shoots` is inclusive on both ends (`§12.3`), so the last day is the
 * window's own last day, not the day after it.
 */
export function weekWindow(anchor: Date, weeksAway = 0): ShootWeek {
  const start = addDays(startOfWeek(anchor), weeksAway * 7);
  const days = Array.from({ length: 7 }, (_, offset) => localDay(addDays(start, offset)));
  return { start: days[0] ?? localDay(start), end: days[6] ?? localDay(start), days };
}

/** The day's heading: a localised date, e.g. `11月18日 周三` on zh-Hans. */
export function dayLabel(day: string, locale: string): string {
  const at = parseDay(day);
  if (!at) return day;
  try {
    return new Intl.DateTimeFormat(locale, {
      month: "short",
      day: "numeric",
      weekday: "short",
    }).format(at);
  } catch {
    return day;
  }
}

/**
 * Sort a shoot list into day buckets inside the week window.
 *
 * A shoot outside the window is *not* shown: the page asked the server for that
 * window (`from`/`to`), so a row from another week would be a row it never read.
 */
export function groupShootsByDay(
  shoots: readonly MediaShoot[],
  week: ShootWeek,
): { day: string; shoots: MediaShoot[] }[] {
  const inside = new Set(week.days);
  const buckets = new Map<string, MediaShoot[]>();
  for (const shoot of shoots) {
    if (!inside.has(shoot.shoot_date)) continue;
    const bucket = buckets.get(shoot.shoot_date);
    if (bucket) bucket.push(shoot);
    else buckets.set(shoot.shoot_date, [shoot]);
  }
  return week.days
    .filter((day) => buckets.has(day))
    .map((day) => ({
      day,
      // Within a day, the shoot that is still to happen comes before the one
      // that is done — the pipeline order, then the creation order.
      shoots: [...(buckets.get(day) ?? [])].sort(
        (a, b) =>
          SHOOT_STATUSES.indexOf(a.status) - SHOOT_STATUSES.indexOf(b.status) ||
          (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0),
      ),
    }));
}

/** Tick one checklist item; the server merges the map key by key (§12.3). */
export function checklistTogglePayload(
  checklist: Readonly<Record<string, boolean>>,
  item: string,
  ticked: boolean,
): Record<string, boolean> {
  return { ...checklist, [item]: ticked };
}

/** The checklist as rows, in the order the operator's keys arrived. */
export function checklistEntries(
  checklist: Readonly<Record<string, boolean>>,
): { name: string; ticked: boolean }[] {
  return Object.entries(checklist).map(([name, ticked]) => ({ name, ticked }));
}

/** How many items are ticked — the sheet prints it as `done/total`. */
export function checklistProgress(
  checklist: Readonly<Record<string, boolean>>,
): { done: number; total: number } {
  const entries = checklistEntries(checklist);
  return { done: entries.filter((entry) => entry.ticked).length, total: entries.length };
}
