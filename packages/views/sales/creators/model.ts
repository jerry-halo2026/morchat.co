import type { BdActivity, Creator } from "@morechat/core/types";

/**
 * The ledger's arithmetic — filtering, faceting and the three date questions the
 * table asks — kept out of the components so every rule can be read and tested
 * without a renderer.
 *
 * **Why the filters run here and not on the server.** `GET /api/workbench/creators`
 * takes `q`, `kind`, `sort`, `limit`, `cursor` and `department_id` and nothing
 * else (WORKBENCH-API §3): there is no `cooperation_intent`, `lead_status`, region
 * or follower-band parameter, and `q` matches `display_name` / `handle` only — not
 * the 抖音号, the `sec_uid` or the source keyword a BD person actually pastes.
 * Filtering the page the server happened to send would answer "who matches in the
 * first 200 rows", which is not the question this screen asks. So the page reads
 * the ledger (see `ledger.ts`) and every one of these predicates runs over the
 * whole of it. When the contract grows these parameters, the predicates below move
 * behind them and the call sites do not change.
 *
 * **The vocabularies are the database's, not the UI's.** `cooperation_intent`
 * carries orange's machine tokens since migration 811 (`'signed'`, not `'已签约'`),
 * and `lead_status` the five-character funnel states the mirror copies. The label
 * for each one lives in the `blocks` bundle (`copy.ts`); nothing here translates.
 */

/** `creator.cooperation_intent`, in the order a creator moves through it. */
export type CreatorIntent =
  | "not_contacted"
  | "pending_send"
  | "sent"
  | "replied"
  | "quoted"
  | "sampling"
  | "signed"
  | "deal"
  | "excluded";

/** Migration 811's nine-value CHECK, in outreach order. */
export const CREATOR_INTENTS: readonly CreatorIntent[] = [
  "not_contacted",
  "pending_send",
  "sent",
  "replied",
  "quoted",
  "sampling",
  "signed",
  "deal",
  "excluded",
];

/** `creator.lead_status`: orange's funnel state, copied verbatim. */
export type CreatorLeadStatus = "LEAD_NEW" | "LEAD_CONTACTED" | "LEAD_DEAL" | "LEAD_REJECT";

export const CREATOR_LEAD_STATUSES: readonly CreatorLeadStatus[] = [
  "LEAD_NEW",
  "LEAD_CONTACTED",
  "LEAD_DEAL",
  "LEAD_REJECT",
];

/**
 * Follower bands, in the units a Chinese BD desk quotes them: 1万 / 10万 / 50万.
 * A band is a half-open interval `[from, next)` so every creator lands in exactly
 * one — 10,000 followers is the bottom of 1–10万, and 500,000 the bottom of
 * 50万以上.
 */
export type FansBand = "under_10k" | "from_10k" | "from_100k" | "from_500k";

export const FANS_BANDS: readonly FansBand[] = [
  "under_10k",
  "from_10k",
  "from_100k",
  "from_500k",
];

/** The band `fans` falls in. `fans` is never null on the row, so neither is this. */
export function fansBand(fans: number): FansBand {
  if (fans >= 500_000) return "from_500k";
  if (fans >= 100_000) return "from_100k";
  if (fans >= 10_000) return "from_10k";
  return "under_10k";
}

/** The four narrowings the page offers. `null` means "any" in every dimension. */
export interface CreatorFilters {
  intent: CreatorIntent | null;
  leadStatus: CreatorLeadStatus | null;
  band: FansBand | null;
  region: string | null;
}

export const NO_CREATOR_FILTERS: CreatorFilters = {
  intent: null,
  leadStatus: null,
  band: null,
  region: null,
};

/** How many dimensions are on, for the filter button's badge. */
export function activeFilterCount(filters: CreatorFilters): number {
  let count = 0;
  if (filters.intent !== null) count += 1;
  if (filters.leadStatus !== null) count += 1;
  if (filters.band !== null) count += 1;
  if (filters.region !== null) count += 1;
  return count;
}

/**
 * The free-text search: 昵称, 抖音号, sec_uid and 来源关键词, case-insensitive.
 *
 * `handle` is in the list because a manually created row has nothing else, and a
 * `sec_uid` is the one identifier that survives a nickname change — a BD person
 * pasting either expects a match.
 */
export function matchesSearch(creator: Creator, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (needle === "") return true;
  const fields = [
    creator.display_name,
    creator.douyin_id,
    creator.sec_uid,
    creator.source_keyword,
    creator.handle,
  ];
  return fields.some((value) => value !== null && value.toLowerCase().includes(needle));
}

/**
 * Whether one creator survives the toolbar. A dimension is on only when it is
 * set, and an unset dimension never excludes anyone: a creator whose
 * `cooperation_intent` is null is a real row (the mirror refused the upstream
 * label), and it must show up under "any" rather than disappear from every view.
 */
export function matchesFilters(creator: Creator, filters: CreatorFilters): boolean {
  if (filters.intent !== null && creator.cooperation_intent !== filters.intent) return false;
  if (filters.leadStatus !== null && creator.lead_status !== filters.leadStatus) return false;
  if (filters.band !== null && fansBand(creator.fans) !== filters.band) return false;
  if (filters.region !== null && (creator.region ?? "") !== filters.region) return false;
  return true;
}

/** The rows the table draws: filters first, then the search, order untouched. */
export function filterCreators(
  creators: readonly Creator[],
  filters: CreatorFilters,
  query: string,
): Creator[] {
  return creators.filter(
    (creator) => matchesFilters(creator, filters) && matchesSearch(creator, query),
  );
}

/** One facet value and how many of the loaded creators carry it. */
export interface FacetOption<T extends string> {
  value: T;
  count: number;
}

function countValues<T extends string>(
  creators: readonly Creator[],
  read: (creator: Creator) => string | null,
  known: readonly T[],
): FacetOption<T>[] {
  const counts = new Map<T, number>();
  for (const value of known) counts.set(value, 0);
  for (const creator of creators) {
    const value = read(creator) as T | null;
    // A token the vocabulary does not name is left out on purpose: the filter
    // menu can only offer values the screen knows how to label.
    if (value !== null && counts.has(value)) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return known.map((value) => ({ value, count: counts.get(value) ?? 0 }));
}

/** Counts per cooperation intent over the loaded ledger. */
export function intentFacets(creators: readonly Creator[]): FacetOption<CreatorIntent>[] {
  return countValues(creators, (creator) => creator.cooperation_intent, CREATOR_INTENTS);
}

/** Counts per lead status over the loaded ledger. */
export function leadStatusFacets(
  creators: readonly Creator[],
): FacetOption<CreatorLeadStatus>[] {
  return countValues(creators, (creator) => creator.lead_status, CREATOR_LEAD_STATUSES);
}

/** Counts per follower band over the loaded ledger. */
export function bandFacets(creators: readonly Creator[]): FacetOption<FansBand>[] {
  const counts = new Map<FansBand, number>(FANS_BANDS.map((band) => [band, 0]));
  for (const creator of creators) {
    const band = fansBand(creator.fans);
    counts.set(band, (counts.get(band) ?? 0) + 1);
  }
  return FANS_BANDS.map((band) => ({ value: band, count: counts.get(band) ?? 0 }));
}

/**
 * The regions present in the ledger, most crowded first. The vocabulary is the
 * upstream `ipLocation` string, so the list is whatever orange carries — no
 * country list is hard-coded and no row's region is rewritten to fit one.
 */
export function regionFacets(creators: readonly Creator[]): FacetOption<string>[] {
  const counts = new Map<string, number>();
  for (const creator of creators) {
    const region = (creator.region ?? "").trim();
    if (region === "") continue;
    counts.set(region, (counts.get(region) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

/**
 * The newest follow-up row per creator, which is the row `next_follow_at` is read
 * from (WORKBENCH-API §20.3: an older row asking for a call is answered by the
 * newer one). The activity list already arrives `happened_at DESC, id DESC`, so
 * the first row seen for a creator is the newest and the loop only has to skip
 * repeats.
 */
export function latestFollowups(
  activities: readonly BdActivity[],
): ReadonlyMap<string, BdActivity> {
  const latest = new Map<string, BdActivity>();
  for (const activity of activities) {
    if (!latest.has(activity.creator_id)) latest.set(activity.creator_id, activity);
  }
  return latest;
}

/**
 * Where a scheduled follow-up stands against `now`, in whole local calendar days.
 * `overdue` counts days late (1 = yesterday), `due_today` is anything left today,
 * and `upcoming` counts days to go (0 = tomorrow, because a call already due today
 * is one of the other two branches).
 */
export type FollowupTiming =
  | { kind: "due_today" }
  | { kind: "overdue"; days: number }
  | { kind: "upcoming"; days: number };

/** Midnight of the local day `value` falls on. */
function startOfLocalDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

/**
 * The timing of one `next_follow_at`, or `null` when it is absent or unreadable.
 * Days are rounded, not truncated, because a daylight-saving change makes one
 * local day 23 or 25 hours long.
 */
export function followupTiming(nextFollowAt: string | null, now: Date): FollowupTiming | null {
  if (!nextFollowAt) return null;
  const due = new Date(nextFollowAt);
  if (Number.isNaN(due.getTime())) return null;
  const days = Math.round(
    (startOfLocalDay(due).getTime() - startOfLocalDay(now).getTime()) / 86_400_000,
  );
  if (days < 0) return { kind: "overdue", days: -days };
  if (days === 0) return { kind: "due_today" };
  return { kind: "upcoming", days };
}

/**
 * A timestamp as a `Date`, or `null` when it is absent or unreadable.
 *
 * The list responses carry these as strings; `Intl.DateTimeFormat#format` throws a
 * `RangeError` on an invalid date, and a throw inside a cell's `title` would take the
 * whole table down with it. One guard, used by both the table and the sheet.
 */
export function parseStamp(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? null : at;
}

/**
 * The quote range as the two figures a row carries: `[min, max]`, `[min]` when the
 * creator quoted one number, `null` when the mirror left both empty (the upstream
 * pair was missing or `max < min`, which the mirror discards as one unit). The cell
 * decides the punctuation; `—` for `null` is the table's business.
 */
export function quoteBounds(creator: Creator): readonly number[] | null {
  const { quote_min: min, quote_max: max } = creator;
  const bounds: number[] = [];
  if (min !== null) bounds.push(min);
  if (max !== null && max !== min) bounds.push(max);
  return bounds.length === 0 ? null : bounds;
}

/**
 * The creator's own page on Douyin. `url` is what the mirror captured; the
 * `sec_uid` form is Douyin's own profile path and the only fallback that resolves
 * — a `douyin_id` (the @ handle) is not a URL segment, so it is never glued into
 * one here.
 */
export function profileUrl(creator: Creator): string | null {
  if (creator.url) return creator.url;
  if (creator.sec_uid) return `https://www.douyin.com/user/${creator.sec_uid}`;
  return null;
}
