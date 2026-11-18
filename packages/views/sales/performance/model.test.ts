// @vitest-environment node
import { describe, expect, it } from "vitest";
import type {
  BdPerformanceMemberRow,
  BdPerformanceMonthRow,
  BdPipelineMoney,
  BdPipelineNumber,
} from "@morechat/core/types";
import {
  dayOf,
  isEmptyWindow,
  lastMonthRange,
  memberRows,
  metricText,
  moneyLabel,
  monthRange,
  monthRows,
  quarterRange,
  rangeFor,
  ratioText,
  receivable,
  totalOf,
  validRange,
  windowLabel,
} from "./model";

/**
 * The performance report's arithmetic, without a renderer.
 *
 * Six rules are pinned here because each one becomes a wrong number on screen
 * rather than a wrong pixel: the window arithmetic (month ends, leap February,
 * January and quarter boundaries), a rate printed as a percentage, a missing
 * figure kept apart from a measured zero, the derived 未回款 figure, the member
 * table's order, and a total that only ever adds one currency.
 */

function number(value: number | null, empty: "zero" | "insufficient_data" = "zero"): BdPipelineNumber {
  return { value, sample_count: value === null ? 0 : 1, empty };
}

function money(amount: number | null, currency = "CNY"): BdPipelineMoney {
  return { amount, currency, sample_count: amount === null ? 0 : 1, empty: amount === null ? "insufficient_data" : "zero" };
}

describe("the window", () => {
  it("runs 本月 from the first of the month through today", () => {
    expect(monthRange("2026-11-18")).toEqual({ from: "2026-11-01", to: "2026-11-18" });
    // The first of the month is a one-day window, not an empty one.
    expect(monthRange("2026-11-01")).toEqual({ from: "2026-11-01", to: "2026-11-01" });
  });

  it("covers the whole of 上月, month ends included", () => {
    expect(lastMonthRange("2026-11-18")).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(lastMonthRange("2026-05-31")).toEqual({ from: "2026-04-01", to: "2026-04-30" });
  });

  it("rolls 上月 into the previous year in January", () => {
    expect(lastMonthRange("2026-01-15")).toEqual({ from: "2025-12-01", to: "2025-12-31" });
  });

  it("reads February from the calendar, leap year and not", () => {
    expect(lastMonthRange("2028-03-10")).toEqual({ from: "2028-02-01", to: "2028-02-29" });
    expect(lastMonthRange("2026-03-10")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
  });

  it("starts 本季 on the quarter's first day", () => {
    expect(quarterRange("2026-11-18")).toEqual({ from: "2026-10-01", to: "2026-11-18" });
    expect(quarterRange("2026-06-30")).toEqual({ from: "2026-04-01", to: "2026-06-30" });
    expect(quarterRange("2026-01-05")).toEqual({ from: "2026-01-01", to: "2026-01-05" });
  });

  it("names the same window through rangeFor", () => {
    expect(rangeFor("month", "2026-11-18")).toEqual(monthRange("2026-11-18"));
    expect(rangeFor("last_month", "2026-11-18")).toEqual(lastMonthRange("2026-11-18"));
    expect(rangeFor("quarter", "2026-11-18")).toEqual(quarterRange("2026-11-18"));
  });

  it("refuses a backwards or malformed window before the request", () => {
    expect(validRange({ from: "2026-11-01", to: "2026-11-18" })).toBe(true);
    expect(validRange({ from: "2026-11-18", to: "2026-11-18" })).toBe(true);
    expect(validRange({ from: "2026-11-18", to: "2026-11-01" })).toBe(false);
    expect(validRange({ from: "2026-1-1", to: "2026-11-18" })).toBe(false);
    expect(validRange({ from: "", to: "2026-11-18" })).toBe(false);
  });

  it("prints the window the response says it used", () => {
    expect(windowLabel({ from: "2026-11-01", to: "2026-11-18" })).toBe("2026-11-01 – 2026-11-18");
    expect(windowLabel({ from: "", to: "" })).toBeNull();
  });

  it("pads calendar parts", () => {
    expect(dayOf(2026, 1, 5)).toBe("2026-01-05");
  });
});

describe("numbers on screen", () => {
  it("keeps a measured zero apart from a figure that is not there", () => {
    expect(metricText(number(0))).toBe("0");
    expect(metricText(number(7))).toBe("7");
    expect(metricText(number(null, "insufficient_data"))).toBeNull();
  });

  it("prints a 0–1 rate as a percentage", () => {
    expect(ratioText(0.2)).toBe("20.0%");
    expect(ratioText(0)).toBe("0.0%");
    expect(ratioText(1)).toBe("100.0%");
    expect(ratioText(0.0555)).toBe("5.6%");
    expect(ratioText(null)).toBeNull();
  });

  it("labels an amount with the currency it was reported in", () => {
    expect(moneyLabel(money(8000), "en")).toBe("¥8,000");
    expect(moneyLabel(money(1200, "USD"), "en")).toBe("$1,200");
    expect(moneyLabel(money(null), "en")).toBeNull();
  });
});

describe("未回款 · the one derived figure", () => {
  it("subtracts what arrived from what was signed", () => {
    expect(receivable(money(9000), money(3000))).toEqual({
      amount: 6000,
      currency: "CNY",
      empty: "zero",
    });
  });

  it("counts a window with no settlement as nothing collected yet", () => {
    expect(receivable(money(9000), money(null))).toEqual({
      amount: 9000,
      currency: "CNY",
      empty: "zero",
    });
  });

  it("floors at zero when the window collected for earlier deals", () => {
    expect(receivable(money(1000), money(4000))).toEqual({
      amount: 0,
      currency: "CNY",
      empty: "zero",
    });
  });

  it("says nothing was signed rather than zero owed", () => {
    expect(receivable(money(null), money(4000))).toEqual({
      amount: null,
      currency: "CNY",
      empty: "insufficient_data",
    });
  });
});

describe("the member table", () => {
  function member(overrides: Partial<BdPerformanceMemberRow> = {}): BdPerformanceMemberRow {
    return {
      member_id: "member-1",
      name: "",
      win_rate: null,
      signed_count: 0,
      signed_amount: null,
      delivered_count: 0,
      collected_count: 0,
      collected_amount: null,
      quote_sent: 0,
      quote_accepted: 0,
      quote_amount: null,
      followups: 0,
      replied: 0,
      meetings: 0,
      ...overrides,
    };
  }

  it("names a row by its own name, then the directory, then a short id", () => {
    const names = new Map([["member-2", "Zhao Min"]]);
    const rows = memberRows(
      [
        member({ member_id: "member-1", name: "Lin Wei" }),
        member({ member_id: "member-2", name: "  " }),
        member({ member_id: "4f3c9a11-0000-4000-8000-000000000000", name: "" }),
      ],
      names,
    );
    // Read by id: the table's order is a separate rule, asserted below.
    const byId = new Map(rows.map((row) => [row.memberId, row.name] as const));
    expect(byId.get("member-1")).toBe("Lin Wei");
    expect(byId.get("member-2")).toBe("Zhao Min");
    expect(byId.get("4f3c9a11-0000-4000-8000-000000000000")).toBe("4f3c9a11");
  });

  it("orders by signatures, then id, the way §22 does", () => {
    const names = new Map<string, string>();
    const rows = memberRows(
      [
        member({ member_id: "b-2", name: "Yu", signed_count: 1, signed_amount: 9000 }),
        member({ member_id: "b-1", name: "Wang", signed_count: 2, signed_amount: null }),
        member({ member_id: "b-3", name: "An", signed_count: 1, signed_amount: 20000 }),
      ],
      names,
    );
    // 2 signatures first; the two with 1 are ordered by member id, not by value.
    expect(rows.map((row) => row.memberId)).toEqual(["b-1", "b-2", "b-3"]);
  });

  it("is a total order, so two identical rows never swap", () => {
    const names = new Map<string, string>();
    const rows = memberRows(
      [
        member({ member_id: "zzz", name: "Same", signed_count: 1, signed_amount: 100 }),
        member({ member_id: "aaa", name: "Same", signed_count: 1, signed_amount: 100 }),
      ],
      names,
    );
    expect(rows.map((row) => row.memberId)).toEqual(["aaa", "zzz"]);
  });
});

describe("the month table", () => {
  it("reads oldest first", () => {
    const month = (value: string): BdPerformanceMonthRow => ({
      month: value,
      win_rate: null,
      signed_count: 0,
      signed_amount: null,
      delivered_count: 0,
      collected_count: 0,
      collected_amount: null,
      quote_sent: 0,
      quote_accepted: 0,
      quote_amount: null,
      followups: 0,
      replied: 0,
      meetings: 0,
    });
    expect(monthRows([month("2026-11"), month("2026-10"), month("2026-09")]).map((row) => row.month))
      .toEqual(["2026-09", "2026-10", "2026-11"]);
  });
});

describe("the 合计 line", () => {
  const rows = [
    {
      signed_count: 2,
      signed_amount: 30000,
      delivered_count: 1,
      collected_count: 1,
      collected_amount: 9000,
      quote_sent: 3,
      quote_accepted: 2,
      quote_amount: 12000,
      followups: 5,
      replied: 3,
      meetings: 1,
    },
    {
      signed_count: 1,
      signed_amount: null,
      delivered_count: 0,
      collected_count: 0,
      collected_amount: null,
      quote_sent: 1,
      quote_accepted: 0,
      quote_amount: null,
      followups: 2,
      replied: 0,
      meetings: 0,
    },
  ];

  it("adds the rows above it in one currency", () => {
    const total = totalOf(rows, "CNY");
    expect(total.signed_count).toBe(3);
    expect(total.signed_amount).toEqual({ amount: 30000, currency: "CNY", empty: "zero" });
    // A row with no amount contributes nothing — it is not a zero.
    expect(total.collected_amount).toEqual({ amount: 9000, currency: "CNY", empty: "zero" });
    expect(total.quote_amount).toEqual({ amount: 12000, currency: "CNY", empty: "zero" });
    expect(total.followups).toBe(7);
    expect(total.delivered_count).toBe(1);
  });

  it("recomputes the rate from the summed counts instead of averaging rows", () => {
    // 2/4 overall — the second row's 0/1 must not weigh as much as the first's 2/3.
    expect(totalOf(rows, "CNY").win_rate).toBe(0.5);
    expect(totalOf([rows[1]!], "CNY").win_rate).toBe(0);
    expect(
      totalOf([{ ...rows[1]!, quote_sent: 0, quote_accepted: 0 }], "CNY").win_rate,
    ).toBeNull();
  });

  it("says nothing was summed when no row carries an amount", () => {
    const total = totalOf([{ ...rows[1]!, followups: 3 }], "CNY");
    expect(total.signed_amount).toEqual({
      amount: null,
      currency: "CNY",
      empty: "insufficient_data",
    });
  });

  it("is empty-safe on no rows at all", () => {
    const total = totalOf([], "CNY");
    expect(total.signed_count).toBe(0);
    expect(total.signed_amount.empty).toBe("insufficient_data");
    expect(total.win_rate).toBeNull();
  });
});

describe("an empty window", () => {
  it("trusts the response's own state", () => {
    expect(isEmptyWindow({ empty: "insufficient_data" })).toBe(true);
    expect(isEmptyWindow({ empty: "zero" })).toBe(false);
    // An `empty` state this client does not know is treated as "there is
    // something": hiding data the server meant to send is the worse mistake.
    expect(isEmptyWindow({ empty: "something_new" })).toBe(false);
  });
});
