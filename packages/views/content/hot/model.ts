import type {
  AdoptMediaRequest,
  CreateMediaHotRequest,
  MediaHot,
  MediaTopic,
  UpdateMediaHotRequest,
} from "@morechat/core/types";

/**
 * The hotspot radar's pure half: the day-grouped list, the two writes, and the
 * adoption.
 *
 * A `media_hot` row is one capture of a platform's trending list on one day
 * (`WORKBENCH-API.md` §21). It is not a pipeline stage: adopting it copies it
 * into `media_topic` (`source = 'hot'`, `hot_id` = this row) and leaves the
 * capture alone.
 *
 * Two rules run through the whole file:
 *
 * - **`rank` / `heat_value` are `number | null`, and NULL means "the capture
 *   carried no figure" — which is not 0.** Nothing here substitutes a number;
 *   the page prints its own copy for null, and a patch sends `null` to clear a
 *   column (an omitted field keeps the stored value).
 * - **The order is total.** The radar is read day by day, toolbars and all, so a
 *   list that reshuffles between renders looks like it is hiding rows. Every
 *   comparison ends on `created_at` and then `id`, which cannot tie.
 */

/** A workbench list answers at most this many rows (`WORKBENCH-API.md` §12). */
export const HOT_LIST_LIMIT = 200;

/**
 * How many topics the page scans to answer "was this hotspot already adopted".
 * There is no per-hot read for that (`media_topic.hot_id` is only a filter in
 * the list), so the pool is read once and indexed below.
 */
export const TOPIC_SCAN_LIMIT = 200;

// --- days -------------------------------------------------------------------

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/** The calendar day of an instant, on the reader's clock (`YYYY-MM-DD`). */
export function localDay(at: Date): string {
  return `${at.getFullYear()}-${pad2(at.getMonth() + 1)}-${pad2(at.getDate())}`;
}

/**
 * `YYYY-MM-DD` as a local calendar day. `new Date("2026-11-18")` would read it as
 * UTC midnight and land on the 17th for anyone west of Greenwich, so the parts go
 * to the constructor instead.
 */
export function parseDay(day: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const date = Number(match[3]);
  const at = new Date(year, month - 1, date);
  return Number.isNaN(at.getTime()) ? null : at;
}

/** A capture day's heading, e.g. `11月18日 周三` on zh-Hans. */
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

/** A heat figure or a follower count, grouped the reader's way. */
export function formatCount(value: number, locale: string): string {
  try {
    return new Intl.NumberFormat(locale).format(value);
  } catch {
    return String(value);
  }
}

// --- ordering and grouping --------------------------------------------------

export interface HotDayGroup {
  /** `YYYY-MM-DD`. */
  day: string;
  rows: MediaHot[];
}

/** Ascending rank, and an unranked capture after every ranked one. */
function compareRank(a: MediaHot, b: MediaHot): number {
  if (a.rank === b.rank) return 0;
  if (a.rank === null) return 1;
  if (b.rank === null) return -1;
  return a.rank - b.rank;
}

/** Descending heat, and an unmeasured capture after every measured one. */
function compareHeat(a: MediaHot, b: MediaHot): number {
  if (a.heat_value === b.heat_value) return 0;
  if (a.heat_value === null) return 1;
  if (b.heat_value === null) return -1;
  return b.heat_value - a.heat_value;
}

/**
 * One day's order: rank first (the platform's own ranking is what a radar is
 * read for), then heat, then the capture time and finally the id. The last two
 * exist so two rows with the same rank and heat can never swap between renders.
 */
export function compareHot(a: MediaHot, b: MediaHot): number {
  const byRank = compareRank(a, b);
  if (byRank !== 0) return byRank;
  const byHeat = compareHeat(a, b);
  if (byHeat !== 0) return byHeat;
  const byCreated = a.created_at.localeCompare(b.created_at);
  if (byCreated !== 0) return byCreated;
  return a.id.localeCompare(b.id);
}

/**
 * The radar as bands of days, the newest day first.
 *
 * A day is the unit because that is how a trending list is captured and how it is
 * read: the same platform's ranking from yesterday is a different list, not more
 * rows of today's.
 */
export function groupHotByDay(rows: readonly MediaHot[]): HotDayGroup[] {
  const buckets = new Map<string, MediaHot[]>();
  for (const row of rows) {
    const bucket = buckets.get(row.captured_on);
    if (bucket) bucket.push(row);
    else buckets.set(row.captured_on, [row]);
  }
  return [...buckets.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([day, dayRows]) => ({ day, rows: [...dayRows].sort(compareHot) }));
}

// --- adoption ---------------------------------------------------------------

/** Which topic a hotspot became, and the IP that topic belongs to. */
export interface AdoptedTarget {
  topicId: string;
  ipId: string;
}

/**
 * `media_topic.hot_id` → the topic it produced.
 *
 * A topic carries `hot_id` only when it was adopted from the radar, so this is
 * the read side of "already adopted": a row that has one is not adoptable a
 * second time from this screen. A dangling id is tolerated — the topic list is
 * the truth, and a topic that is gone simply is not in it.
 */
export function adoptedTopicIndex(
  topics: readonly MediaTopic[],
): Map<string, AdoptedTarget> {
  const index = new Map<string, AdoptedTarget>();
  for (const topic of topics) {
    if (topic.source !== "hot" || !topic.hot_id) continue;
    if (index.has(topic.hot_id)) continue;
    index.set(topic.hot_id, { topicId: topic.id, ipId: topic.ip_id });
  }
  return index;
}

// --- the form ---------------------------------------------------------------

/** The create/edit dialog's state: every field as the input holds it. */
export interface HotDraft {
  title: string;
  platform: string;
  url: string;
  /** Digits as typed; `""` is "the capture carried no rank". */
  rank: string;
  /** Digits as typed; `""` is "the platform published no heat figure". */
  heat: string;
  category: string;
  capturedOn: string;
  note: string;
}

export function emptyHotDraft(today: string): HotDraft {
  return {
    title: "",
    platform: "",
    url: "",
    rank: "",
    heat: "",
    category: "",
    capturedOn: today,
    note: "",
  };
}

export function hotDraftFrom(row: MediaHot): HotDraft {
  return {
    title: row.title,
    platform: row.platform,
    url: row.url ?? "",
    rank: row.rank === null ? "" : String(row.rank),
    heat: row.heat_value === null ? "" : String(row.heat_value),
    category: row.category ?? "",
    capturedOn: row.captured_on,
    note: row.note ?? "",
  };
}

/** A count as typed, or `null` — "not collected" is not 0. */
export function parseCount(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0) return null;
  return value;
}

/**
 * The create payload, or `null` while the form is not sendable.
 *
 * `source` is left off: a row entered on this screen is `manual`, and the server
 * defaults it. Sending anything else would be a claim the operator never made.
 */
export function createHotPayload(draft: HotDraft): CreateMediaHotRequest | null {
  const title = draft.title.trim();
  const platform = draft.platform.trim();
  if (title === "" || platform === "") return null;
  const url = draft.url.trim();
  const category = draft.category.trim();
  const note = draft.note.trim();
  return {
    title,
    platform,
    url: url === "" ? null : url,
    rank: parseCount(draft.rank),
    heat_value: parseCount(draft.heat),
    ...(category === "" ? {} : { category }),
    ...(draft.capturedOn === "" ? {} : { captured_on: draft.capturedOn }),
    ...(note === "" ? {} : { note }),
  };
}

/**
 * The patch for an edited capture: only what actually changed.
 *
 * `url` / `rank` / `heat_value` go out as `null` when the field is emptied,
 * because that is how this endpoint clears a column — an omitted field keeps the
 * stored value (`WORKBENCH-API.md` §21). `category` and `note` have no null form
 * in the request, so clearing them sends an empty string.
 */
export function updateHotPayload(draft: HotDraft, row: MediaHot): UpdateMediaHotRequest {
  const patch: UpdateMediaHotRequest = {};

  const title = draft.title.trim();
  if (title !== "" && title !== row.title) patch.title = title;

  const platform = draft.platform.trim();
  if (platform !== "" && platform !== row.platform) patch.platform = platform;

  const url = draft.url.trim();
  if (url !== (row.url ?? "")) patch.url = url === "" ? null : url;

  const rank = parseCount(draft.rank);
  if (rank !== row.rank) patch.rank = rank;

  const heat = parseCount(draft.heat);
  if (heat !== row.heat_value) patch.heat_value = heat;

  const category = draft.category.trim();
  if (category !== (row.category ?? "")) patch.category = category;

  const capturedOn = draft.capturedOn;
  if (capturedOn !== "" && capturedOn !== row.captured_on) patch.captured_on = capturedOn;

  const note = draft.note.trim();
  if (note !== (row.note ?? "")) patch.note = note;

  return patch;
}

// --- adopting ---------------------------------------------------------------

export interface AdoptDraft {
  ipId: string;
  title: string;
}

/**
 * The adoption dialog opens on the capture's own title and the IP the page is
 * filtered to, if any — the reader is adopting *this* headline, usually for the
 * persona they are already looking at.
 */
export function adoptHotDraft(hot: MediaHot, defaultIpId: string | null): AdoptDraft {
  return { ipId: defaultIpId ?? "", title: hot.title };
}

/**
 * The adopt payload, or `null` without an IP (a topic belongs to one) or a
 * title.
 *
 * The title is omitted when it still equals the capture's own, because the
 * endpoint already defaults to it — sending it back would be indistinguishable
 * from an edit that never happened.
 */
export function adoptHotPayload(
  hot: MediaHot,
  draft: AdoptDraft,
): AdoptMediaRequest | null {
  const title = draft.title.trim();
  if (draft.ipId === "" || title === "") return null;
  return title === hot.title ? { ip_id: draft.ipId } : { ip_id: draft.ipId, title };
}
