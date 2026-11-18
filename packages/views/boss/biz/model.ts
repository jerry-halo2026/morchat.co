/**
 * What the business page states, computed once and drawn by its four blocks
 * (`/boss/biz`).
 *
 * Three rules hold this file together, and all three are pinned by unit tests:
 *
 * 1. **A missing number is not a zero.** A month with no entry, an entry whose
 *    amounts were never filled in, and an aggregate the server reports as
 *    `insufficient_data` are three different absences; each keeps `null` and the
 *    block prints 数据不足 / 未录入. Only a stated figure becomes a number.
 * 2. **Money is never added across currencies.** `agent.cost` is USD while the
 *    CRM and affiliate ledgers are CNY (WORKBENCH-API.md §8 rule 8), so every sum
 *    here goes through {@link currencyTotals}, which returns one line per currency
 *    and cannot produce a mixed total.
 * 3. **The month is a parameter, not a page.** Every figure on the page is read for
 *    one `YYYY-MM`; `null` means "whatever month the server calls current", and the
 *    label under the numbers is always the month the response says it sliced.
 *
 * The margin is *not* re-derived: {@link trendRows} calls the overview's own
 * `moneySummary` so 毛利 means "已回款 − 当月录入成本" here, in `money-block.tsx`
 * and in the drawer, from one implementation.
 */

import type {
  AffiliateSummaryResponse,
  WorkbenchFinanceMonth,
  WorkbenchFinanceResponse,
} from "@morechat/core/types";
import { moneySummary, type MoneySummary } from "../home/model";

/** How many months the trend draws, the newest one included. */
export const TREND_MONTHS = 6;

/** How many months the picker offers, this month included. */
export const MONTH_CHOICES = 12;

/**
 * The `count` month labels ending at `endMonth`, oldest first.
 *
 * Labels are `YYYY-MM` strings counted as month indices, not `Date`s: the month
 * is a label from the server's own window, and pushing it through a time zone is
 * how a December figure ends up filed under November.
 */
export function recentMonths(endMonth: string, count = TREND_MONTHS): string[] {
  const match = /^(\d{4})-(\d{2})$/.exec(endMonth);
  if (!match) return [];
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return [];
  const end = year * 12 + (month - 1);
  const months: string[] = [];
  for (let index = end - count + 1; index <= end; index += 1) {
    const value = Math.max(index, 0);
    const label = `${Math.floor(value / 12)}-${String((value % 12) + 1).padStart(2, "0")}`;
    months.push(label);
  }
  return months;
}

/**
 * The picker's options, newest first, ending at `currentMonth`.
 *
 * Newest first because the menu is read top-down and the month the reader most
 * often wants is the one at the top; the list is anchored to the calendar month
 * rather than to the selected one, so opening the menu after visiting March does
 * not quietly renumber the choices.
 */
export function monthChoices(currentMonth: string, count = MONTH_CHOICES): string[] {
  return recentMonths(currentMonth, count).reverse();
}

/** The `YYYY-MM` label of a local date — the same shape `window.month` uses. */
export function monthOf(date: Date): string {
  const month = date.getMonth() + 1;
  return `${date.getFullYear()}-${month < 10 ? "0" : ""}${month}`;
}


/** One currency's own total. There is deliberately no combined total. */
export interface CurrencyTotal {
  currency: string;
  total: number;
  /** How many stated amounts went into it. */
  count: number;
}

/**
 * Amounts grouped by the currency they are stated in.
 *
 * `null` amounts are "not recorded" and contribute nothing (they do not make the
 * currency line disappear either: a currency with no stated amount simply has no
 * line). Order follows the currency code so two renders of the same data agree.
 */
export function currencyTotals(
  items: readonly { amount: number | null; currency: string }[],
): CurrencyTotal[] {
  const totals = new Map<string, CurrencyTotal>();
  for (const item of items) {
    if (item.amount === null || Number.isNaN(item.amount)) continue;
    const current = totals.get(item.currency);
    if (current) {
      current.total += item.amount;
      current.count += 1;
    } else {
      totals.set(item.currency, { currency: item.currency, total: item.amount, count: 1 });
    }
  }
  return [...totals.values()].sort((a, b) => a.currency.localeCompare(b.currency));
}

/** The four figures one month's aggregate states, pulled out of the response. */
export interface MonthFinance {
  month: string;
  signed: number | null;
  collected: number | null;
  /** 账面现金 for that month (`cash_floor`): opening + collected − cost. */
  cash: number | null;
  receivableDays: number | null;
}

/**
 * One month's aggregate as the figures this page reads.
 *
 * `window.month` is the label the response itself carries: the server says which
 * month it sliced, so a request the server narrowed differently can never be
 * printed under the requested month by accident.
 */
export function monthFinanceOf(response: WorkbenchFinanceResponse): MonthFinance {
  return {
    month: response.window?.month ?? "",
    signed: response.signed?.value ?? null,
    collected: response.collected?.value ?? null,
    cash: response.cash_floor?.value ?? null,
    receivableDays: response.receivable_days?.value ?? null,
  };
}

/** One row of the trend: four figures and whether the month was ever entered. */
export interface TrendRow {
  month: string;
  /** 收入 (签约额) for that month, or null when the month answered without one. */
  revenue: number | null;
  /** 已回款 for that same month. */
  collected: number | null;
  /** 当月成本: the entered fixed + variable cost, or null. */
  cost: number | null;
  /** 毛利: 已回款 − 成本, and only when both sides are stated. */
  gross: number | null;
  /** 账面现金 at the end of that month (`cash_floor`). */
  cash: number | null;
  /**
   * Whether the month has a cost entry row at all. `false` renders 未录入;
   * `true` with a null cost renders 数据不足. Neither is a 0.
   */
  recorded: boolean;
  /** Whether the month's aggregate answered at all (a read, not an entry). */
  answered: boolean;
}

/**
 * The trend's rows, oldest first, one per calendar month.
 *
 * Every month of the window is read on its own (`GET /finance?month=`), so each
 * row states that month's 收入 / 已回款 / 现金 as the server aggregated them —
 * not only the current month's, and not a derived series. The cost side still
 * comes from `GET /finance/months`, which is where the entered amounts live.
 *
 * A month with no answer keeps `null` everywhere and 数据不足, and a month nobody
 * entered is marked `recorded: false` (未录入). The margin is `moneySummary`, the
 * same call `boss/home/money-block.tsx` makes, so 毛利 means one thing across the
 * product.
 */
export function trendRows(
  months: readonly WorkbenchFinanceMonth[] | undefined,
  finances: readonly MonthFinance[],
  endMonth: string,
  count = TREND_MONTHS,
): TrendRow[] {
  const labels = recentMonths(endMonth, count);
  if (labels.length === 0) return [];
  const byMonth = new Map<string, WorkbenchFinanceMonth>();
  for (const entry of months ?? []) byMonth.set(entry.month.slice(0, 7), entry);
  const answered = new Map<string, MonthFinance>();
  for (const finance of finances) answered.set(finance.month, finance);

  return labels.map((month) => {
    const entry = byMonth.get(month) ?? null;
    const finance = answered.get(month) ?? null;
    const summary = moneySummary(
      finance ? { signed: finance.signed, collected: finance.collected } : null,
      entry,
      month,
    );
    return {
      month,
      revenue: summary.signed,
      collected: summary.paid,
      cost: summary.cost,
      gross: summary.margin,
      cash: finance?.cash ?? null,
      recorded: entry !== null,
      answered: finance !== null,
    };
  });
}

/** The two reasons a month's margin can be missing, told apart. */
export type MonthGap = "no_revenue" | "no_cost";

/**
 * Why the margin has no value — and it is two different facts:
 *
 *   - `no_revenue` — nothing cleared that month, so the subtraction has no minuend;
 *   - `no_cost`    — money came in but no cost was entered, so it has no subtrahend.
 *
 * Both can be true at once (a month with nothing recorded), which is why this
 * returns a list rather than one reason: the reader can fix the cost side, and
 * cannot fix "nobody paid yet" by typing.
 */
export function monthGaps(summary: MoneySummary): MonthGap[] {
  if (summary.margin !== null) return [];
  const gaps: MonthGap[] = [];
  if (summary.paid === null || summary.paid === 0) gaps.push("no_revenue");
  if (summary.cost === null) gaps.push("no_cost");
  return gaps;
}

/** The cost side of one month, laid out as the lines the block prints. */
export function costLines(
  entry: WorkbenchFinanceMonth | null,
): { key: "fixed_cost" | "variable_cost" | "cash_open"; amount: number | null }[] {
  return [
    { key: "fixed_cost", amount: entry?.fixed_cost ?? null },
    { key: "variable_cost", amount: entry?.variable_cost ?? null },
    { key: "cash_open", amount: entry?.cash_open ?? null },
  ];
}

/**
 * The month's cost as the ledger's own currency, through {@link currencyTotals}.
 *
 * `ops_finance_month` has no currency column — the contract states the amounts in
 * 元 (WORKBENCH-API.md §3.3) — so the two halves are labelled CNY here and the
 * sum is one line. It goes through the grouping anyway so that a later cost line
 * in another currency cannot silently join this total.
 */
export function costTotals(entry: WorkbenchFinanceMonth | null): CurrencyTotal[] {
  return currencyTotals([
    { amount: entry?.fixed_cost ?? null, currency: "CNY" },
    { amount: entry?.variable_cost ?? null, currency: "CNY" },
  ]);
}

/** One of the affiliate income blocks. `ratio` ones are 0–1 at the storage scale. */
export interface AffiliateFigure {
  key: "agency" | "creator" | "settled" | "refund";
  value: number | null;
  ratio: boolean;
}

/**
 * 机构佣金 / 达人佣金 / 已结算佣金 / 退款率 — four blocks, never one sum.
 *
 * `commission_agency` is money we received, `commission_creator` is money the
 * platform paid creators: adding them would report income that never arrived
 * (WORKBENCH-API.md §11.5). Each block is copied out on its own, so the page
 * cannot accidentally total them.
 */
export function affiliateFigures(
  summary: AffiliateSummaryResponse | null | undefined,
): AffiliateFigure[] {
  return [
    { key: "agency", value: summary?.commission_agency.value ?? null, ratio: false },
    { key: "creator", value: summary?.commission_creator.value ?? null, ratio: false },
    { key: "settled", value: summary?.commission_settled.value ?? null, ratio: false },
    { key: "refund", value: summary?.refund_rate.value ?? null, ratio: true },
  ];
}

/**
 * A 0–1 ratio at the 0–100 display scale (docs/METRICS.md C3), one decimal.
 *
 * This is the unit conversion the whole workbench uses, not a recomputation: the
 * server stores ratios as fractions and the UI prints percents.
 */
export function percentOf(ratio: number | null): number | null {
  if (ratio === null || Number.isNaN(ratio)) return null;
  return Math.round(ratio * 1000) / 10;
}
