/**
 * What the business page states, computed once and drawn by its four blocks
 * (`/boss/biz`).
 *
 * Two rules hold this file together, and both are pinned by unit tests:
 *
 * 1. **A missing number is not a zero.** A month with no entry, an entry whose
 *    amounts were never filled in, and an aggregate the server reports as
 *    `insufficient_data` are three different absences; each keeps `null` and the
 *    block prints 数据不足 / 未录入. Only a stated figure becomes a number.
 * 2. **Money is never added across currencies.** `agent.cost` is USD while the
 *    CRM and affiliate ledgers are CNY (WORKBENCH-API.md §8 rule 8), so every sum
 *    here goes through {@link currencyTotals}, which returns one line per currency
 *    and cannot produce a mixed total.
 *
 * The margin is *not* re-derived: {@link trendRows} calls the overview's own
 * `moneySummary` so 毛利 means "已回款 − 当月录入成本" here, in `money-block.tsx`
 * and in the drawer, from one implementation.
 */

import type { AffiliateSummaryResponse, WorkbenchFinanceMonth } from "@morechat/core/types";
import { moneySummary } from "../home/model";

/** How many months the trend draws, the newest one included. */
export const TREND_MONTHS = 6;

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

/** One row of the trend: four figures and whether the month was ever entered. */
export interface TrendRow {
  month: string;
  /** 收入 — only the month the money block aggregates carries one. */
  revenue: number | null;
  /** 已回款 for that same month. */
  collected: number | null;
  /** 当月成本: the entered fixed + variable cost, or null. */
  cost: number | null;
  /** 毛利: 已回款 − 成本, and only when both sides are stated. */
  gross: number | null;
  /** 期初现金 — the entry's opening balance, not a closing one. */
  cashOpen: number | null;
  /**
   * Whether the month has an entry row at all. `false` renders 未录入;
   * `true` with a null cost renders 数据不足. Neither is a 0.
   */
  recorded: boolean;
}

/**
 * The trend's rows, oldest first, one per calendar month.
 *
 * A month nobody touched is still a row (the axis stays continuous) and is marked
 * `recorded: false`. Revenue and gross are only known for the month the server
 * aggregated — `GET /finance` describes the current natural month and there is no
 * per-month revenue read (WORKBENCH-API.md §7.3) — so earlier months state their
 * cost and opening cash and leave the other two `null`, which is the honest
 * answer rather than a series that looks complete.
 */
export function trendRows(
  months: readonly WorkbenchFinanceMonth[] | undefined,
  window: { month: string; signed: number | null; collected: number | null },
  count = TREND_MONTHS,
): TrendRow[] {
  const labels = recentMonths(window.month, count);
  if (labels.length === 0) return [];
  const byMonth = new Map<string, WorkbenchFinanceMonth>();
  for (const entry of months ?? []) byMonth.set(entry.month.slice(0, 7), entry);

  return labels.map((month) => {
    const entry = byMonth.get(month) ?? null;
    const isWindow = month === window.month;
    const summary = moneySummary(
      isWindow ? { signed: window.signed, collected: window.collected } : null,
      entry,
      month,
    );
    return {
      month,
      revenue: summary.signed,
      collected: summary.paid,
      cost: summary.cost,
      gross: summary.margin,
      cashOpen: entry?.cash_open ?? null,
      recorded: entry !== null,
    };
  });
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
