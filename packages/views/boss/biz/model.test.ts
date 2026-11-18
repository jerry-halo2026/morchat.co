// @vitest-environment node
import { describe, expect, it } from "vitest";
import type {
  AffiliateSummaryResponse,
  WorkbenchFinanceMonth,
  WorkbenchFinanceResponse,
} from "@morechat/core/types";
import { moneySummary } from "../home/model";
import {
  affiliateFigures,
  costLines,
  costTotals,
  currencyTotals,
  percentOf,
  recentMonths,
  trendRows,
} from "./model";

/**
 * 经营数据's arithmetic, pinned without a DOM. Four rules:
 *
 *   - money is never added across currencies (USD agent cost vs CNY ledgers);
 *   - 毛利 is `moneySummary`'s 已回款 − 成本, not a second formula;
 *   - a month nobody entered and a month entered without amounts are two different
 *     absences, and neither is a 0;
 *   - a stored 0–1 ratio is displayed at the 0–100 scale.
 */

function entry(month: string, overrides: Partial<WorkbenchFinanceMonth> = {}): WorkbenchFinanceMonth {
  return {
    id: `m-${month}`,
    workspace_id: "ws-1",
    month: `${month}-01`,
    cash_open: null,
    fixed_cost: null,
    variable_cost: null,
    note: null,
    created_by: null,
    created_at: "2026-11-01T02:00:00Z",
    updated_at: "2026-11-01T02:00:00Z",
    ...overrides,
  };
}

describe("月份标签", () => {
  it("walks calendar months, oldest first, across a year boundary", () => {
    expect(recentMonths("2026-11", 3)).toEqual(["2026-09", "2026-10", "2026-11"]);
    expect(recentMonths("2026-01", 3)).toEqual(["2025-11", "2025-12", "2026-01"]);
    expect(recentMonths("2026-11")).toHaveLength(6);
  });

  it("refuses a label it cannot count", () => {
    expect(recentMonths("")).toEqual([]);
    expect(recentMonths("2026-13", 3)).toEqual([]);
    expect(recentMonths("nope", 3)).toEqual([]);
  });
});

describe("币种分组不相加", () => {
  it("keeps each currency on its own line", () => {
    // `agent.cost` is USD and the CRM ledgers are CNY (WORKBENCH-API §8 rule 8):
    // 100 + 50 would be a number nobody earned.
    expect(
      currencyTotals([
        { amount: 100, currency: "CNY" },
        { amount: 50, currency: "USD" },
        { amount: 20, currency: "CNY" },
      ]),
    ).toEqual([
      { currency: "CNY", total: 120, count: 2 },
      { currency: "USD", total: 50, count: 1 },
    ]);
  });

  it("drops unrecorded amounts instead of reading them as zero", () => {
    expect(currencyTotals([{ amount: null, currency: "CNY" }])).toEqual([]);
    expect(
      currencyTotals([
        { amount: null, currency: "CNY" },
        { amount: 0, currency: "CNY" },
      ]),
    ).toEqual([{ currency: "CNY", total: 0, count: 1 }]);
  });
});

describe("本月成本", () => {
  it("prints the two halves it has, and 合计 only when one exists", () => {
    expect(costLines(null)).toEqual([
      { key: "fixed_cost", amount: null },
      { key: "variable_cost", amount: null },
      { key: "cash_open", amount: null },
    ]);
    expect(costTotals(null)).toEqual([]);
    expect(costTotals(entry("2026-11", { fixed_cost: 100, variable_cost: 50 }))).toEqual([
      { currency: "CNY", total: 150, count: 2 },
    ]);
    // One half alone is a cost; the other being unrecorded does not zero it.
    expect(costTotals(entry("2026-11", { variable_cost: 50 }))).toEqual([
      { currency: "CNY", total: 50, count: 1 },
    ]);
  });
});

describe("月度趋势", () => {
  const months = [
    // The window month: a full entry.
    entry("2026-11", { cash_open: 1000, fixed_cost: 600, variable_cost: 400 }),
    // An entry whose amounts were never filled in.
    entry("2026-10"),
    // 2026-09 has no row at all — the month must still get a line.
  ];
  const window = { month: "2026-11", signed: 5000, collected: 3000 };

  it("draws every month in the window, including the ones nobody entered", () => {
    const rows = trendRows(months, window, 6);
    expect(rows.map((row) => row.month)).toEqual([
      "2026-06",
      "2026-07",
      "2026-08",
      "2026-09",
      "2026-10",
      "2026-11",
    ]);
    // 未录入 — no entry row.
    expect(rows[3]).toMatchObject({ month: "2026-09", recorded: false, cost: null });
    // 数据不足 — a row exists, the amounts are blank. Not a 0.
    expect(rows[4]).toMatchObject({ month: "2026-10", recorded: true, cost: null });
  });

  it("states revenue and margin only for the month the server aggregated", () => {
    const rows = trendRows(months, window, 6);
    const month = rows[5]!;
    expect(month).toMatchObject({
      revenue: 5000,
      collected: 3000,
      cost: 1000,
      gross: 2000,
      cashOpen: 1000,
      recorded: true,
    });
    // Earlier months carry their cost and opening cash and nothing else.
    expect(rows[0]).toMatchObject({ revenue: null, collected: null, gross: null, cost: null });
  });

  it("uses the overview's margin, verbatim", () => {
    const rows = trendRows(months, window, 6);
    const shared = moneySummary(
      { signed: window.signed, collected: window.collected },
      months[0]!,
      "2026-11",
    );
    expect(rows[5]!.gross).toBe(shared.margin);
    expect(rows[5]!.gross).toBe(3000 - 1000);
  });

  it("leaves the margin empty when either side is missing", () => {
    const revenueOnly = trendRows(
      [entry("2026-11")],
      { month: "2026-11", signed: 5000, collected: 3000 },
      1,
    );
    // Money came in, no cost was entered: a margin would be revenue wearing a
    // different name.
    expect(revenueOnly[0]).toMatchObject({ collected: 3000, cost: null, gross: null });

    const costOnly = trendRows(
      [entry("2026-11", { fixed_cost: 600 })],
      { month: "2026-11", signed: null, collected: null },
      1,
    );
    expect(costOnly[0]).toMatchObject({ collected: null, cost: 600, gross: null });
  });

  it("has no rows when the window has no month", () => {
    expect(trendRows(months, { month: "", signed: 1, collected: 1 })).toEqual([]);
  });
});

describe("联盟收入", () => {
  function summary(): AffiliateSummaryResponse {
    return {
      window: { month: "2026-11" },
      gmv: { value: 2000, sample_count: 3, empty: "zero" },
      commission_est: { value: 400, sample_count: 3, empty: "zero" },
      commission_settled: { value: 160, sample_count: 2, empty: "zero" },
      commission_agency: { value: 440, sample_count: 2, empty: "zero" },
      commission_creator: { value: 60, sample_count: 1, empty: "zero" },
      agency_share_income: { value: 40, sample_count: 1, empty: "zero" },
      refund_rate: { value: 0.05, sample_count: 3, empty: "zero" },
      tech_fee: { value: null, sample_count: 0, empty: "insufficient_data" },
      pick_count: { value: 1, sample_count: 1, empty: "zero" },
      active_creator_count: { value: 1, sample_count: 1, empty: "zero" },
    };
  }

  it("hands back four separate blocks and no total", () => {
    const figures = affiliateFigures(summary());
    expect(figures.map((figure) => figure.key)).toEqual([
      "agency",
      "creator",
      "settled",
      "refund",
    ]);
    expect(figures.map((figure) => figure.value)).toEqual([440, 60, 160, 0.05]);
    // 440 + 60 is not a number anybody earned: nothing here adds them.
    expect(figures.some((figure) => figure.value === 500)).toBe(false);
    expect(figures[3]!.ratio).toBe(true);
  });

  it("keeps a gap as a gap, and an unloaded summary as four gaps", () => {
    const gaps = affiliateFigures(null);
    expect(gaps.every((figure) => figure.value === null)).toBe(true);
  });
});

describe("比率显示", () => {
  it("prints a stored 0–1 ratio at the 0–100 scale", () => {
    expect(percentOf(0.05)).toBe(5);
    expect(percentOf(0.0532)).toBe(5.3);
    expect(percentOf(1)).toBe(100);
    expect(percentOf(0)).toBe(0);
    expect(percentOf(null)).toBe(null);
  });
});

describe("本月六格的口径", () => {
  it("takes signed and collected from the aggregate and cost from the entry", () => {
    const finance = {
      window: { month: "2026-11" },
      signed: { value: 5000, sample_count: 2, empty: "zero" },
      collected: { value: 3000, sample_count: 1, empty: "zero" },
      gross_margin: { value: 0.66, sample_count: 1, empty: "zero", basis: "entered" },
      receivable_days: { value: 12.5, sample_count: 2, empty: "zero" },
      cash_floor: { value: 2000, sample_count: 1, empty: "zero", basis: "entered" },
    } satisfies WorkbenchFinanceResponse;
    const summary = moneySummary(
      { signed: finance.signed.value, collected: finance.collected.value },
      entry("2026-11", { fixed_cost: 600, variable_cost: 400 }),
      "2026-11",
    );
    expect(summary).toMatchObject({ signed: 5000, paid: 3000, cost: 1000, margin: 2000 });
  });
});
