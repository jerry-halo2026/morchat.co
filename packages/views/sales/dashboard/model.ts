import type { BdActivity, Creator } from "@morechat/core/types";

/**
 * The cockpit's arithmetic, kept out of the components so every rule below can
 * be read — and tested — without a renderer.
 *
 * Three rules the numbers follow:
 *
 *   - **"This month" is the reader's local month.** `creator.created_at` and
 *     `creator.updated_at` are timestamps, and a BD day ends in the time zone the
 *     person is sitting in, not in UTC: 11-01 07:00 in Shanghai is still October
 *     in UTC, and counting it as November would move a deal into a month it was
 *     not signed in. Every comparison here goes through the local calendar day.
 *   - **A follow-up obligation is the newest row, per creator.** `WORKBENCH-API`
 *     §20 gives `next_follow_at` that meaning (an older row asking for a call is
 *     answered by the newer row that already happened), and the cockpit's own
 *     `followups` block is computed from exactly that row. `dueFollowups` picks
 *     the newest row per creator with the same ordering the server uses, then
 *     asks whether its `next_follow_at` has passed.
 *   - **A number nobody could compute is `null`, never 0.** The month counts come
 *     from the creator ledger, and a ledger that was only partly read cannot say
 *     how many creators joined this month — `creatorMonthCounts` answers `null`
 *     and the page prints `—`.
 */

/** `本月第 N 天 · 还剩 M 天`, in the reader's calendar. */
export interface MonthClock {
  /** 1-based day of the month. */
  dayOfMonth: number;
  /** Days left after today; 0 on the last day of the month. */
  daysLeft: number;
}

export function monthClock(now: Date): MonthClock {
  const dayOfMonth = now.getDate();
  // Day 0 of the next month is the last day of this one.
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return { dayOfMonth, daysLeft: daysInMonth - dayOfMonth };
}

/** Midnight of the local day `value` falls on. */
export function startOfLocalDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

/** Whether `iso` falls in the same local calendar month as `now`. */
export function inSameMonth(iso: string, now: Date): boolean {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return false;
  return at.getFullYear() === now.getFullYear() && at.getMonth() === now.getMonth();
}

/**
 * Whole local calendar days from `nextFollowAt` to `now`: 0 for later today, 1
 * for yesterday, 3 for three days ago. Rounded rather than truncated because a
 * daylight-saving change makes one local day 23 or 25 hours long.
 */
export function overdueDays(nextFollowAt: string, now: Date): number {
  const due = startOfLocalDay(new Date(nextFollowAt));
  const today = startOfLocalDay(now);
  return Math.round((today.getTime() - due.getTime()) / 86_400_000);
}

/** One creator awaiting a call, and how late that call is. */
export interface FollowupDue {
  activity: BdActivity;
  /** 0 = still due today, 1 = yesterday, … */
  overdueDays: number;
}

/**
 * `happened_at DESC, created_at DESC, id DESC` — the server's ordering for "the
 * newest follow-up of this creator" (WORKBENCH-API §20.3). `happened_at` alone
 * is not a total order: two calls logged the same afternoon tie.
 */
function newestFirst(a: BdActivity, b: BdActivity): number {
  const happened = Date.parse(b.happened_at) - Date.parse(a.happened_at);
  if (happened !== 0) return happened;
  const created = Date.parse(b.created_at) - Date.parse(a.created_at);
  if (created !== 0) return created;
  if (a.id === b.id) return 0;
  return a.id < b.id ? 1 : -1;
}

/**
 * The queue behind 今日跟进: one row per creator whose newest follow-up is due,
 * most overdue first.
 *
 * Today still counts as due — the panel's red badge already treats a follow-up
 * due at 09:00 today as late at 10:00 — and the row carries the day difference
 * so the list can print 今天 for 0 instead of 逾期 0 天.
 */
export function dueFollowups(
  activities: readonly BdActivity[],
  now: Date,
): FollowupDue[] {
  const nowMs = now.getTime();
  const seen = new Set<string>();
  const rows: FollowupDue[] = [];
  for (const activity of [...activities].sort(newestFirst)) {
    if (seen.has(activity.creator_id)) continue;
    seen.add(activity.creator_id);
    if (!activity.next_follow_at) continue;
    const due = Date.parse(activity.next_follow_at);
    if (Number.isNaN(due) || due > nowMs) continue;
    rows.push({ activity, overdueDays: overdueDays(activity.next_follow_at, now) });
  }
  // A stable sort keeps the newest-first order inside a day, so two creators
  // equally late stay in the order their calls were logged.
  rows.sort((a, b) => b.overdueDays - a.overdueDays);
  return rows;
}

/** The two month figures the creator ledger can answer (`null` = cannot say). */
export interface CreatorMonthCounts {
  newThisMonth: number | null;
  signedThisMonth: number | null;
}

/**
 * `cooperation_intent` carries orange's machine tokens since migration 811, and
 * these two are what `/bd/pipeline` counts as 签单. Kept next to the count so the
 * page and the cockpit cannot drift into counting different things.
 */
const SIGNED_INTENTS: ReadonlySet<string> = new Set(["signed", "deal"]);

/**
 * 本月新增 / 本月签单 over the whole creator ledger.
 *
 * `complete` is the caller's statement that `creators` is the entire live
 * ledger: 本月新增 is a count over every row, and a partial page can only
 * undercount it. When the ledger is incomplete both answers are `null`.
 *
 * 签单 reads `updated_at` because that is when `cooperation_intent` last moved
 * — a creator signed in October and edited in November would otherwise count as
 * a November deal.
 */
export function creatorMonthCounts(
  creators: readonly Creator[],
  now: Date,
  complete: boolean,
): CreatorMonthCounts {
  if (!complete) return { newThisMonth: null, signedThisMonth: null };
  let newThisMonth = 0;
  let signedThisMonth = 0;
  for (const creator of creators) {
    if (inSameMonth(creator.created_at, now)) newThisMonth += 1;
    if (
      creator.cooperation_intent !== null &&
      SIGNED_INTENTS.has(creator.cooperation_intent) &&
      inSameMonth(creator.updated_at, now)
    ) {
      signedThisMonth += 1;
    }
  }
  return { newThisMonth, signedThisMonth };
}

/** Display names for the rows that only carry a `creator_id`. */
export function creatorNamesById(
  creators: readonly Creator[],
): ReadonlyMap<string, string> {
  return new Map(creators.map((creator) => [creator.id, creator.display_name]));
}
