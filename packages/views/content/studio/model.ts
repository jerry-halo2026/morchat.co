import type {
  MediaIP,
  MediaScript,
  MediaShoot,
  MediaTopic,
  MemberRole,
} from "@morechat/core/types";

/**
 * What the studio derives from the content tables, as pure functions.
 *
 * The original 工作室 page is one card per IP, each recording what is waiting at
 * each step of the pipeline (`IP → 账号 → 选题 → 文案 → 拍摄 → 发布`), plus a
 * three-cell bar above them for this week. None of that is a server aggregate:
 * `WORKBENCH-API.md` §12 has no summary endpoint, so the page reads the three
 * lists it already needs and folds them here.
 *
 * The two links that make the fold possible:
 *
 *   - `media_topic.ip_id` — a topic belongs to exactly one IP.
 *   - `media_script.ip_id`, with `media_topic.ip_id` behind it — the column is
 *     nullable, and a script written before the IP pointer existed still belongs
 *     to its topic's IP.
 *   - `media_shoot.script_id` only — a shoot has no IP of its own; it belongs to
 *     whatever IP its script belongs to. A shoot whose script is missing from
 *     the window stays unattributed rather than being handed to some IP.
 */

/** One read is capped at this many rows server-side (`workbenchLimit`). */
export const STUDIO_LIST_LIMIT = 200;

export interface StudioRows {
  topics: readonly MediaTopic[];
  scripts: readonly MediaScript[];
  shoots: readonly MediaShoot[];
}

/** The four numbers on an IP card, in pipeline order. */
export interface IpCounts {
  /** `media_topic.status = 'pool'` — ideas decided but not yet written. */
  topics: number;
  /** `media_script.status` draft or review — copy being written. */
  scripts: number;
  /** `media_shoot.status = 'planned'` — scheduled, not yet shot. */
  shoots: number;
  /** `media_script.status = 'approved'` — ready to go out. */
  publishing: number;
}

/** The three numbers of the bar above the cards. */
export interface WeekTodo {
  /** `media_script.publish_at` inside this week. */
  publishing: number;
  /** `media_shoot.shoot_date` inside this week, not finished or cancelled. */
  shooting: number;
  /** Every topic still in the pool — a backlog, not a week's figure. */
  backlog: number;
}

/**
 * Which IP each script and shoot belongs to.
 *
 * Built once per read and passed around: resolving a shoot walks
 * `shoot → script → topic`, and doing that per row per render would turn a
 * three-list fold into a quadratic walk.
 */
export interface IpIndex {
  /** topic id → IP id. */
  topicIp: ReadonlyMap<string, string>;
  /** script id → IP id, `null` when neither pointer names one. */
  scriptIp: ReadonlyMap<string, string | null>;
}

/** A row the list endpoints still return but nobody should count. */
function isLive(row: { archived_at: string | null }): boolean {
  return row.archived_at === null;
}

export function indexRows(rows: StudioRows): IpIndex {
  const topicIp = new Map<string, string>();
  for (const topic of rows.topics) topicIp.set(topic.id, topic.ip_id);

  const scriptIp = new Map<string, string | null>();
  for (const script of rows.scripts) {
    scriptIp.set(script.id, script.ip_id ?? topicIp.get(script.topic_id) ?? null);
  }
  return { topicIp, scriptIp };
}

/** The IP a shoot belongs to: the IP of its script, or `null` when unknown. */
export function shootIpId(shoot: MediaShoot, index: IpIndex): string | null {
  return index.scriptIp.get(shoot.script_id) ?? null;
}

/** The IP of a script, falling back to its topic's. */
export function scriptIpId(script: MediaScript, index: IpIndex): string | null {
  return index.scriptIp.get(script.id) ?? null;
}

/**
 * The rows one IP's screens may show. An unscoped read (`ipId === null`) is
 * every row — narrowing is a scope, not a filter, so `全部 IP` must not mean
 * "no IP".
 */
export function narrowToIp(rows: StudioRows, ipId: string | null, index: IpIndex): StudioRows {
  if (!ipId) return rows;
  return {
    topics: rows.topics.filter((topic) => topic.ip_id === ipId),
    scripts: rows.scripts.filter((script) => scriptIpId(script, index) === ipId),
    shoots: rows.shoots.filter((shoot) => shootIpId(shoot, index) === ipId),
  };
}

const EMPTY_COUNTS: IpCounts = { topics: 0, scripts: 0, shoots: 0, publishing: 0 };

/**
 * The four card numbers for every IP, in one pass.
 *
 * Each cell is one stage's own status column, not a difference between two
 * stages: a topic that has been scripted leaves `pool`, so `pool` is the size of
 * the idea backlog, `draft`/`review` the copy in hand, `approved` the copy
 * waiting to be published, and `planned` the shoots still to happen. Counting
 * totals and subtracting would silently re-count a topic whose script was
 * archived.
 */
export function countsByIp(rows: StudioRows, index: IpIndex): Map<string, IpCounts> {
  const counts = new Map<string, IpCounts>();
  const bucket = (ipId: string | null): IpCounts | null => {
    if (!ipId) return null;
    let entry = counts.get(ipId);
    if (!entry) {
      entry = { ...EMPTY_COUNTS };
      counts.set(ipId, entry);
    }
    return entry;
  };

  for (const topic of rows.topics) {
    if (!isLive(topic) || topic.status !== "pool") continue;
    const entry = bucket(topic.ip_id);
    if (entry) entry.topics += 1;
  }
  for (const script of rows.scripts) {
    if (!isLive(script)) continue;
    const entry = bucket(scriptIpId(script, index));
    if (!entry) continue;
    if (script.status === "draft" || script.status === "review") entry.scripts += 1;
    else if (script.status === "approved") entry.publishing += 1;
  }
  for (const shoot of rows.shoots) {
    if (!isLive(shoot) || shoot.status !== "planned") continue;
    const entry = bucket(shootIpId(shoot, index));
    if (entry) entry.shoots += 1;
  }
  return counts;
}

/** One IP's four numbers; an IP with nothing waiting reads four zeroes. */
export function countsFor(counts: Map<string, IpCounts>, ipId: string): IpCounts {
  return counts.get(ipId) ?? EMPTY_COUNTS;
}

const pad = (value: number) => String(value).padStart(2, "0");

/** A `YYYY-MM-DD` day in the reader's zone, for comparing `shoot_date`. */
function dayOf(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export interface WeekWindow {
  /** Monday 00:00 local, as an instant — what `publish_at` is compared to. */
  start: Date;
  /** The next Monday 00:00 local, exclusive. */
  end: Date;
  /** The week's first day as `YYYY-MM-DD`, inclusive. */
  firstDay: string;
  /** The week's last day as `YYYY-MM-DD`, inclusive. */
  lastDay: string;
}

/**
 * This week, Monday to Sunday in the reader's zone.
 *
 * `media_shoot.shoot_date` is a date with no zone, so the week is compared as
 * `YYYY-MM-DD` strings — a calendar day must not move with the reader's offset.
 * `publish_at` is an instant, so it is compared against the two midnight
 * bounds. The week starts Monday because the workbench plans in work weeks, and
 * a Sunday reading of "this week" that counted the day just gone would make the
 * bar disagree with the schedule.
 */
export function weekWindow(now: Date): WeekWindow {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  // `getDay()` is 0 for Sunday; Monday is the 1st day of the week here.
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7);
  const lastDayDate = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
  return { start, end, firstDay: dayOf(start), lastDay: dayOf(lastDayDate) };
}

/** A shoot scheduled for a day inside the window, and not yet done or dropped. */
function isShootingThisWeek(shoot: MediaShoot, week: WeekWindow): boolean {
  if (!isLive(shoot)) return false;
  if (shoot.status !== "planned" && shoot.status !== "shooting") return false;
  const day = shoot.shoot_date.slice(0, 10);
  return day >= week.firstDay && day <= week.lastDay;
}

/** A script scheduled to go out inside the window. */
function isPublishingThisWeek(script: MediaScript, week: WeekWindow): boolean {
  if (!isLive(script) || !script.publish_at) return false;
  const at = new Date(script.publish_at).getTime();
  if (Number.isNaN(at)) return false;
  return at >= week.start.getTime() && at < week.end.getTime();
}

/**
 * The bar above the cards.
 *
 * Published work is the week's own question; the idea backlog is not — it has no
 * date, and pretending it fits in a week would hide how much has piled up. So two
 * cells count days and one counts rows.
 */
export function weekTodo(rows: StudioRows, week: WeekWindow): WeekTodo {
  let publishing = 0;
  for (const script of rows.scripts) if (isPublishingThisWeek(script, week)) publishing += 1;
  let shooting = 0;
  for (const shoot of rows.shoots) if (isShootingThisWeek(shoot, week)) shooting += 1;
  let backlog = 0;
  for (const topic of rows.topics) {
    if (isLive(topic) && topic.status === "pool") backlog += 1;
  }
  return { publishing, shooting, backlog };
}

/**
 * Whether this reader may create an IP.
 *
 * Mirrors the shared rules in `@morechat/core/permissions` — creating a
 * workspace-level record is an owner/admin action there — instead of growing a
 * fourth opinion here. An unknown role (the member list has not answered yet)
 * is not permission: the button appears when the answer does.
 */
export function canCreateIp(role: MemberRole | null): boolean {
  return role === "owner" || role === "admin";
}

/** The IP cards in the order the server returned them, narrowed by scope. */
export function visibleIps(
  ips: readonly MediaIP[],
  scope: string | null,
): { cards: readonly MediaIP[]; scopeMissing: boolean } {
  if (!scope) return { cards: ips, scopeMissing: false };
  const cards = ips.filter((ip) => ip.id === scope);
  return { cards, scopeMissing: cards.length === 0 };
}
