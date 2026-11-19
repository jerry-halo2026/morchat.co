import type {
  BdPerformance,
  BdPerformanceMemberRow,
  BdPerformanceMonthRow,
  BdPerformanceTotals,
  BdPipelineMoney,
  BdPipelineNumber,
} from "@morechat/core/types";
// The sales space formats money and reads days in one place each:
// `quotes/model` owns the Intl configuration and the `YYYY-MM-DD` helpers,
// `collabs/model` owns the three-state `MoneySum`. This page reuses both rather
// than starting a third formatting rule.
import { formatMoney, localDayOf, roundMoney } from "../quotes/model";
import { sumMoney, type MoneySum } from "../collabs/model";

/**
 * The performance report's arithmetic, kept out of the components so every rule
 * below can be read — and tested — without a renderer.
 *
 * `GET /api/workbench/bd/performance` is one window, one currency, every fact
 * bucketed by its own date (`WORKBENCH-API.md` §22): a collaboration is signed on
 * `confirmed_at` and delivered on `published_at`, so one deal can appear in two
 * blocks with two amounts. That is the report, not double counting.
 *
 * Five rules this file keeps:
 *
 *   - **One currency.** `currency` on the response names the currency every
 *     amount is in (the window's dominant one) and rows in another currency are
 *     excluded from the counts too. Nothing here adds across a currency boundary:
 *     every sum takes the response's currency and every label prints it.
 *   - **A missing number is not a zero.** Counts arrive as numbers (a real 0 is a
 *     real 0) and a rate arrives as `null` when it is not computable. Note that
 *     `empty` is **not** the discriminator per number: the server stamps
 *     `insufficient_data` on a win rate even when it carries a value
 *     (`bdPerformanceWinRate` in `workbench_bd.go` passes it unconditionally), so
 *     the dash is driven by the null, and `empty` is read once for the window.
 *   - **A rate is 0–1 on the wire and a percentage on screen.** {@link ratioText}
 *     is the only place the multiplication happens.
 *   - **A calendar day stays a calendar day.** The range is `YYYY-MM-DD` strings
 *     and is never parsed into an instant, so a window never shifts a day because
 *     of where it is read.
 *   - **The member total is Σ of the rows, and its rate is recomputed from the
 *     summed counts.** Averaging the members' rates would weight a one-offer
 *     member the same as a forty-offer one.
 */

// --- The window -------------------------------------------------------------

/** The four ranges the toolbar offers. */
export type RangeKey = "month" | "last_month" | "quarter" | "custom";

/** The three a preset can compute; `custom` comes from two date fields. */
export type PresetRangeKey = Exclude<RangeKey, "custom">;

export const RANGE_KEYS: readonly RangeKey[] = ["month", "last_month", "quarter", "custom"];
export const PRESET_RANGE_KEYS: readonly PresetRangeKey[] = ["month", "last_month", "quarter"];

/** An inclusive `YYYY-MM-DD` window, the shape the endpoint takes. */
export interface DayRange {
  from: string;
  to: string;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** `YYYY-MM-DD` from 1-based calendar parts. */
export function dayOf(year: number, month: number, date: number): string {
  return `${year}-${pad(month)}-${pad(date)}`;
}

function parseDay(day: string): { year: number; month: number; date: number } | null {
  const matched = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!matched) return null;
  const year = Number(matched[1]);
  const month = Number(matched[2]);
  const date = Number(matched[3]);
  if (!year || month < 1 || month > 12 || date < 1 || date > 31) return null;
  return { year, month, date };
}

/**
 * 本月: the first day of the month `today` falls in, through `today`. The window
 * stops at today because nothing after it can hold a fact, and a report that
 * claims to reach the end of the month reads as a month that already finished.
 */
export function monthRange(today: string): DayRange {
  const parsed = parseDay(today);
  if (!parsed) return { from: today, to: today };
  return { from: dayOf(parsed.year, parsed.month, 1), to: today };
}

/**
 * 上月: the whole of the calendar month before the one `today` falls in.
 *
 * `new Date(y, m - 1, 0)` is the day before the first of this month, which is the
 * last day of the previous one — that is a leap year and a January rollover
 * resolved by the calendar itself instead of by a 30-day guess.
 */
export function lastMonthRange(today: string): DayRange {
  const parsed = parseDay(today);
  if (!parsed) return { from: today, to: today };
  const first = new Date(parsed.year, parsed.month - 2, 1);
  const last = new Date(parsed.year, parsed.month - 1, 0);
  return { from: localDayOf(first), to: localDayOf(last) };
}

/** 本季: the first day of the quarter `today` falls in, through `today`. */
export function quarterRange(today: string): DayRange {
  const parsed = parseDay(today);
  if (!parsed) return { from: today, to: today };
  const firstMonth = Math.floor((parsed.month - 1) / 3) * 3 + 1;
  return { from: dayOf(parsed.year, firstMonth, 1), to: today };
}

/** The window a preset names. `custom` is the page's two date fields. */
export function rangeFor(key: PresetRangeKey, today: string): DayRange {
  if (key === "last_month") return lastMonthRange(today);
  if (key === "quarter") return quarterRange(today);
  return monthRange(today);
}

/**
 * Whether the window can be asked for: two real days and `to >= from`. The server
 * answers 400 for a backwards range, so the page refuses it in place and says why
 * instead of turning a typo into a failed request.
 */
export function validRange(range: DayRange): boolean {
  const from = parseDay(range.from);
  const to = parseDay(range.to);
  if (!from || !to) return false;
  return range.from <= range.to;
}

/** The window the report says it used, or `null` when the response carried none. */
export function windowLabel(report: Pick<BdPerformance, "from" | "to">): string | null {
  if (!report.from || !report.to) return null;
  return `${report.from} – ${report.to}`;
}

// --- Numbers on screen ------------------------------------------------------

/**
 * A count as text, or `null` when the response has no number for it. A count of
 * `0` is printed as `0`: in this report a zero count is a measured zero.
 */
export function metricText(metric: BdPipelineNumber): string | null {
  return metric.value === null ? null : String(metric.value);
}

/**
 * A 0–1 rate as a percentage: `0.2` → `"20.0%"`, `0` → `"0.0%"`, `null` → nothing.
 *
 * One decimal, because the difference between 33 % and 33.3 % is the difference
 * between two members' quarter.
 */
export function ratioText(rate: number | null): string | null {
  if (rate === null || !Number.isFinite(rate)) return null;
  return `${(Math.round(rate * 1000) / 10).toFixed(1)}%`;
}

/** An amount with the currency the response says every amount is in. */
export function moneyLabel(money: BdPipelineMoney, locale: string): string | null {
  return money.amount === null ? null : formatMoney(money.amount, money.currency, locale);
}

/**
 * 未回款, derived from the two figures the window reports: what was signed here
 * minus what arrived here.
 *
 * The endpoint has no receivable column. Both sides bucket by their own date, so
 * the difference is "money still owed by the deals this window signed" — not an
 * ageing figure, and the page says so under the block. It floors at zero because
 * a window can collect money for deals signed before `from`, and a negative
 * "uncollected" would be a different sentence entirely.
 *
 * When nothing was signed the figure is `insufficient_data`, not `0`: there is no
 * receivable to compute.
 */
export function receivable(
  signed: BdPipelineMoney,
  collected: BdPipelineMoney,
): MoneySum {
  if (signed.amount === null) {
    return { amount: null, currency: signed.currency, empty: "insufficient_data" };
  }
  const arrived = collected.amount ?? 0;
  return {
    amount: Math.max(0, roundMoney(signed.amount - arrived)),
    currency: signed.currency,
    empty: "zero",
  };
}

// --- The two dimension tables ----------------------------------------------

/** One member's line, with the name the table prints. */
export interface MemberPerformanceRow {
  memberId: string;
  /** Display name: the row's own, else the member directory, else a short id. */
  name: string;
  row: BdPerformanceMemberRow;
}

/** Ids are UUIDs; the first segment is what people read out loud. */
export function shortId(id: string): string {
  return id.length > 8 ? id.slice(0, 8) : id;
}

/**
 * The name to print for a member: the row's own `name`, then the workspace
 * directory, then the id's first segment. A member row can be gone while their
 * numbers stay in the report, and a blank cell would look like a data error
 * instead of a deleted account.
 */
export function memberName(
  row: Pick<BdPerformanceMemberRow, "member_id" | "name">,
  names: ReadonlyMap<string, string>,
): string {
  const own = row.name.trim();
  if (own !== "") return own;
  const known = names.get(row.member_id);
  if (known && known.trim() !== "") return known;
  return shortId(row.member_id);
}

/**
 * The member rows in the order the contract defines them: `signed_count`
 * descending, then `member_id` ascending (`WORKBENCH-API.md` §22.3).
 *
 * The server already orders this way; repeating it here keeps the table stable
 * through a refetch, a reload or a member directory that resolved a name between
 * two renders — a table that reorders under the cursor reads as a change.
 */
export function memberRows(
  rows: readonly BdPerformanceMemberRow[],
  names: ReadonlyMap<string, string>,
): MemberPerformanceRow[] {
  return [...rows]
    .sort((a, b) => {
      if (a.signed_count !== b.signed_count) return b.signed_count - a.signed_count;
      return a.member_id < b.member_id ? -1 : a.member_id > b.member_id ? 1 : 0;
    })
    .map((row) => ({ memberId: row.member_id, name: memberName(row, names), row }));
}

/** The months in the order a trend reads: oldest first, `YYYY-MM` compared as text. */
export function monthRows(rows: readonly BdPerformanceMonthRow[]): BdPerformanceMonthRow[] {
  return [...rows].sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : 0));
}

/** A summed row, in the same three states as the rest of the page. */
export interface PerformanceTotal {
  signed_count: number;
  signed_amount: MoneySum;
  delivered_count: number;
  collected_count: number;
  collected_amount: MoneySum;
  quote_sent: number;
  quote_accepted: number;
  quote_amount: MoneySum;
  followups: number;
  replied: number;
  meetings: number;
  /** `quote_accepted / quote_sent` over the summed counts; null when nothing was sent. */
  win_rate: number | null;
}

/**
 * The 合计 row: Σ of the rows the table shows, over one currency.
 *
 * Every amount sum is the response's currency — the only currency the endpoint
 * reports — so the row adds like with like. `null` amounts are skipped rather than
 * counted as zero, which means a member who signed nothing contributes no number
 * instead of a fake ¥0; if no member has one, the sum is `insufficient_data`.
 *
 * The rate is recomputed from the summed counts, not averaged over the rows.
 */
export function totalOf(
  rows: readonly BdPerformanceTotals[],
  currency: string,
): PerformanceTotal {
  const count = (pick: (row: BdPerformanceTotals) => number) =>
    rows.reduce((sum, row) => sum + pick(row), 0);
  const quoteSent = count((row) => row.quote_sent);
  const quoteAccepted = count((row) => row.quote_accepted);
  return {
    signed_count: count((row) => row.signed_count),
    signed_amount: sumMoney(
      rows.map((row) => row.signed_amount),
      currency,
    ),
    delivered_count: count((row) => row.delivered_count),
    collected_count: count((row) => row.collected_count),
    collected_amount: sumMoney(
      rows.map((row) => row.collected_amount),
      currency,
    ),
    quote_sent: quoteSent,
    quote_accepted: quoteAccepted,
    quote_amount: sumMoney(
      rows.map((row) => row.quote_amount),
      currency,
    ),
    followups: count((row) => row.followups),
    replied: count((row) => row.replied),
    meetings: count((row) => row.meetings),
    win_rate: quoteSent === 0 ? null : quoteAccepted / quoteSent,
  };
}

/**
 * Whether the window holds nothing at all.
 *
 * The response's own `empty` says it: `insufficient_data` means no fact is dated
 * inside the window, which is a different page from four zeros and empty tables.
 *
 * `empty` is typed as a plain string, not the enum, because that is how the wire
 * schema keeps it (`z.string()`, `schemas.ts`): a state a newer server adds must
 * render as itself. An unknown value is treated as "there is something", because
 * inventing an empty page for a state the server meant positively would hide
 * data.
 */
export function isEmptyWindow(report: { empty: string }): boolean {
  return report.empty === "insufficient_data";
}
