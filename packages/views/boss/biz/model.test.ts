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
  monthChoices,
  monthFinanceOf,
  monthGaps,
  monthOf,
  percentOf,
  recentMonths,
  trendRows,
  type MonthFinance,
} from "./model";

/**
 * 经营数据's arithmetic, pinned without a DOM. Five rules:
 *
 *   - money is never added across currencies (USD agent cost vs CNY ledgers);
 *   - 毛利 is `moneySummary`'s 已回款 − 成本, not a second formula;
 *   - a month nobody entered and a month whose aggregate answered without data are
 *     two different absences, and neither is a 0;
 *   - every month of the trend is its own read, so a month that did not answer
 *     keeps `null` rather than borrowing its neighbour's number;
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

function monthFinance(month: string, overrides: Partial<MonthFinance> = {}): MonthFinance {
  return {
    month,
    signed: null,
    collected: null,
    cash: null,
    receivableDays: null,
    ...overrides,
  };
}

function block(value: number | null) {
  return value === null
    ? { value: null, sample_count: 0, empty: "insufficient_data" as const }
    : { value, sample_count: 1, empty: "zero" as const };
}

function financeResponse(month: string, figures: {
  signed?: number | null;
  collected?: number | null;
  cash?: number | null;
}): WorkbenchFinanceResponse {
  return {
    window: { month },
    signed: block(figures.signed ?? null),
    collected: block(figures.collected ?? null),
    gross_margin: { ...block(null), basis: "none" },
    receivable_days: block(null),
    cash_floor: { ...block(figures.cash ?? null), basis: "entered" },
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

  it("offers the picker newest first, anchored on the calendar month", () => {
    const choices = monthChoices("2026-02", 3);
    expect(choices).toEqual(["2026-02", "2026-01", "2025-12"]);
    expect(monthChoices("2026-11")).toHaveLength(12);
    expect(monthChoices("nope")).toEqual([]);
  });

  it("labels a local date as the wire's `YYYY-MM`", () => {
    expect(monthOf(new Date(2026, 10, 18))).toBe("2026-11");
    expect(monthOf(new Date(2026, 0, 3))).toBe("2026-01");
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

describe("当月成本", () => {
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

describe("月度趋势（逐月读）", () => {
  const months = [
    entry("2026-11", { cash_open: 1000, fixed_cost: 600, variable_cost: 400 }),
    // An entry whose amounts were never filled in.
    entry("2026-10"),
    // 2026-09 has no row at all — the month must still get a line.
  ];
  const reads = [
    monthFinance("2026-06", { signed: 800, collected: 200 }),
    monthFinance("2026-10", { signed: 4000, collected: 2500 }),
    monthFinance("2026-11", { signed: 5000, collected: 3000, cash: 2600 }),
  ];

  it("draws every month of the window, including the ones without a read", () => {
    const rows = trendRows(months, reads, "2026-11", 6);
    expect(rows.map((row) => row.month)).toEqual([
      "2026-06",
      "2026-07",
      "2026-08",
      "2026-09",
      "2026-10",
      "2026-11",
    ]);
    // No entry row: 未录入.
    expect(rows[3]).toMatchObject({ month: "2026-09", recorded: false, cost: null, answered: false });
    // An entry with blank amounts: 数据不足, not 0.
    expect(rows[4]).toMatchObject({ month: "2026-10", recorded: true, cost: null, answered: true });
  });

  it("states each month's own money instead of only the current month's", () => {
    const rows = trendRows(months, reads, "2026-11", 6);
    // A past month carries real numbers when the server answered for it.
    expect(rows[0]).toMatchObject({ month: "2026-06", revenue: 800, collected: 200, answered: true });
    expect(rows[4]).toMatchObject({ month: "2026-10", revenue: 4000, collected: 2500 });
    expect(rows[5]).toMatchObject({
      revenue: 5000,
      collected: 3000,
      cost: 1000,
      gross: 2000,
      cash: 2600,
    });
    // A month nobody read keeps null: it never borrows its neighbour's figure.
    expect(rows[1]).toMatchObject({ month: "2026-07", revenue: null, collected: null, answered: false });
  });

  it("uses the overview's margin, verbatim", () => {
    const rows = trendRows(months, reads, "2026-11", 6);
    const shared = moneySummary(
      { signed: 5000, collected: 3000 },
      months[0]!,
      "2026-11",
    );
    expect(rows[5]!.gross).toBe(shared.margin);
    expect(rows[5]!.gross).toBe(3000 - 1000);
  });

  it("leaves the margin empty when either side is missing", () => {
    const revenueOnly = trendRows(
      [entry("2026-11")],
      [monthFinance("2026-11", { signed: 5000, collected: 3000 })],
      "2026-11",
      1,
    );
    // Money came in, no cost was entered: a margin would be revenue wearing a
    // different name.
    expect(revenueOnly[0]).toMatchObject({ collected: 3000, cost: null, gross: null });

    const costOnly = trendRows(
      [entry("2026-11", { fixed_cost: 600 })],
      [monthFinance("2026-11")],
      "2026-11",
      1,
    );
    expect(costOnly[0]).toMatchObject({ collected: null, cost: 600, gross: null });
  });

  it("has no rows when the window has no month", () => {
    expect(trendRows(months, reads, "")).toEqual([]);
  });
});

describe("缺月为什么缺", () => {
  it("tells 没成交 from 没录成本", () => {
    // Nothing was collected and nothing was measured: the margin has no minuend.
    const noRevenue = moneySummary(
      { signed: null, collected: null },
      entry("2026-11", { fixed_cost: 600 }),
      "2026-11",
    );
    expect(monthGaps(noRevenue)).toEqual(["no_revenue"]);

    // Money came in but no cost was entered: the margin has no subtrahend, and
    // this one the reader can fix by typing.
    const noCost = moneySummary(
      { signed: 5000, collected: 3000 },
      null,
      "2026-11",
    );
    expect(monthGaps(noCost)).toEqual(["no_cost"]);

    // A month with nothing at all is both, and only one of them is in their hands.
    const empty = moneySummary({ signed: null, collected: null }, null, "2026-11");
    expect(monthGaps(empty)).toEqual(["no_revenue", "no_cost"]);

    // Zero collected against a real cost is a stated loss, not a gap: −600 is the
    // margin, and printing 数据不足 over it would hide a bad month.
    const loss = moneySummary({ signed: 0, collected: 0 }, entry("2026-11", { fixed_cost: 600 }), "2026-11");
    expect(monthGaps(loss)).toEqual([]);
    expect(loss.margin).toBe(-600);

    const whole = moneySummary(
      { signed: 5000, collected: 3000 },
      entry("2026-11", { fixed_cost: 600 }),
      "2026-11",
    );
    expect(monthGaps(whole)).toEqual([]);
  });
});

describe("一个月的聚合", () => {
  it("takes the label from the response, not from the request", () => {
    const response = financeResponse("2026-10", { signed: 4000, collected: 2500, cash: 900 });
    expect(monthFinanceOf(response)).toEqual({
      month: "2026-10",
      signed: 4000,
      collected: 2500,
      cash: 900,
      receivableDays: null,
    });
  });

  it("keeps an answered-but-empty month null rather than zero", () => {
    expect(monthFinanceOf(financeResponse("2026-10", {}))).toMatchObject({
      month: "2026-10",
      signed: null,
      collected: null,
      cash: null,
    });
  });
});

describe("联盟收入", () => {
  function summary(): AffiliateSummaryResponse {
    return {
      window: { month: "2026-11" },
      gmv: block(2000),
      commission_est: block(400),
      commission_settled: block(160),
      commission_agency: block(440),
      commission_creator: block(60),
      agency_share_income: block(40),
      refund_rate: block(0.05),
      tech_fee: block(null),
      pick_count: block(1),
      active_creator_count: block(1),
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
    const response = financeResponse("2026-11", { signed: 5000, collected: 3000, cash: 2000 });
    const summary = moneySummary(
      { signed: response.signed.value, collected: response.collected.value },
      entry("2026-11", { fixed_cost: 600, variable_cost: 400 }),
      "2026-11",
    );
    expect(summary).toMatchObject({ signed: 5000, paid: 3000, cost: 1000, margin: 2000 });
  });
});
