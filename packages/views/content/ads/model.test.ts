// @vitest-environment node
import { describe, expect, it } from "vitest";
import { ADS_BASES } from "@morechat/core/types";
import type { AdsMoney, AdsNumber, AdsTotals } from "@morechat/core/types";
import {
  amountState,
  basisOptions,
  countState,
  delta,
  fenToYuan,
  figureNumber,
  figureOf,
  materialScript,
  rangeLabel,
} from "./model";

/**
 * The board's rules, pinned without a DOM:
 *
 *   - 分 → 元 happens once, here (`fenToYuan`), never in a cell;
 *   - the three states stay three (`insufficient_data` ≠ dash ≠ 0);
 *   - 环比 is like-for-like only — the same basis's previous window, and null
 *     whenever a side is missing or the denominator is 0.
 */

function money(amount: number | null, empty: "zero" | "insufficient_data" = "zero"): AdsMoney {
  return { amount, currency: "CNY", sample_count: amount === null ? 0 : 1, empty };
}

function count(value: number | null, empty: "zero" | "insufficient_data" = "zero"): AdsNumber {
  return { value, sample_count: value === null ? 0 : 1, empty };
}

function totals(overrides: Partial<AdsTotals> = {}): AdsTotals {
  return {
    spend: money(1000),
    gmv: money(4000),
    refund: money(120),
    settle: money(3200),
    orders: count(12),
    ...overrides,
  };
}

describe("分 → 元 只有一处", () => {
  it("divides by 100 and rounds to fen precision", () => {
    expect(fenToYuan(12345)).toBe(123.45);
    expect(fenToYuan(100)).toBe(1);
    expect(fenToYuan(0)).toBe(0);
    expect(fenToYuan(1)).toBe(0.01);
  });

  it("keeps 'not recorded' as null instead of converting it to 0", () => {
    expect(fenToYuan(null)).toBeNull();
  });
});

describe("三态", () => {
  it("tells 数据不足 from a dash from a real zero", () => {
    expect(amountState(money(null, "insufficient_data"))).toBe("insufficient");
    // A null amount the server did not call insufficient is simply absent.
    expect(amountState(money(null, "zero"))).toBe("missing");
    // A stated 0 is an answer, not a gap.
    expect(amountState(money(0, "zero"))).toBe("stated");
    expect(amountState(money(0.5))).toBe("stated");
    expect(amountState(null)).toBe("missing");
    expect(amountState(undefined)).toBe("missing");
  });

  it("applies the same three states to the order counter", () => {
    expect(countState(count(0))).toBe("stated");
    expect(countState(count(null, "insufficient_data"))).toBe("insufficient");
    expect(countState(count(null, "zero"))).toBe("missing");
    expect(countState(null)).toBe("missing");
  });
});

describe("环比", () => {
  it("compares two figures of one window", () => {
    expect(delta(120, 100)).toBeCloseTo(0.2);
    expect(delta(80, 100)).toBeCloseTo(-0.2);
    expect(delta(0, 100)).toBeCloseTo(-1);
    expect(delta(100, 100)).toBe(0);
  });

  it("refuses to divide by nothing", () => {
    expect(delta(120, null)).toBeNull();
    expect(delta(null, 120)).toBeNull();
    // A previous window of 0 has no ratio: "+∞%" is not a reading.
    expect(delta(120, 0)).toBeNull();
    expect(delta(120, undefined)).toBeNull();
  });
});

describe("一个窗口的五个数", () => {
  it("tags the money figures and the counter apart", () => {
    const window = totals();
    expect(figureOf(window, "spend")?.kind).toBe("money");
    expect(figureOf(window, "orders")?.kind).toBe("count");
    expect(figureNumber(window, "orders")).toBe(12);
    expect(figureNumber(window, "settle")).toBe(3200);
  });

  it("returns null rather than 0 for a figure the response left out", () => {
    const partial = { ...totals() } as Partial<AdsTotals>;
    delete partial.orders;
    expect(figureOf(partial as AdsTotals, "orders")).toBeNull();
    expect(figureNumber(partial as AdsTotals, "orders")).toBeNull();
  });
});

describe("口径", () => {
  it("offers the server's list, and the contract's five when it sent none", () => {
    expect(basisOptions({ basis_options: ["settle_1h", "settle_30d"] } as never)).toEqual([
      "settle_1h",
      "settle_30d",
    ]);
    expect(basisOptions(null)).toEqual([...ADS_BASES]);
    // An unknown window the platform invents is not offered: it has no figures.
    expect(basisOptions({ basis_options: ["settle_1y"] } as never)).toEqual([...ADS_BASES]);
  });
});

describe("素材与区间", () => {
  it("shortens a linked script id, and says 未关联 with none", () => {
    expect(materialScript("3f2a9c11-8888-4c2b-9d1e-1a2b3c4d5e6f")).toBe("3f2a9c11");
    expect(materialScript("abc")).toBe("abc");
    expect(materialScript(null)).toBeNull();
  });

  it("prints the window the server echoed", () => {
    expect(rangeLabel("2026-11-01", "2026-11-19")).toBe("2026-11-01 → 2026-11-19");
    expect(rangeLabel("", "")).toBe("");
  });
});
