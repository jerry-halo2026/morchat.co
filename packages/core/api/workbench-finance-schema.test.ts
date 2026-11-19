// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parseWithFallback } from "./schema";
import {
  EMPTY_WORKBENCH_FINANCE_RESPONSE,
  WorkbenchFinanceMonthListResponseSchema,
  WorkbenchFinanceResponseSchema,
} from "./schemas";

const endpoint = "GET /api/workbench/finance";

// The all-gaps block the schema degrades a missing figure to: nothing measured is
// a statement, and it is not the same statement as zero (docs/METRICS.md §1
// rule 3).
const GAP = { value: null, sample_count: 0, empty: "insufficient_data" };
// The two figures with a cost side say which cost set they used; "none" is the
// reading a missing or unknown basis degrades to.
const COST_GAP = { ...GAP, basis: "none" };

// A payload as the server sends it: two stated figures (one of them a true zero),
// one ratio at the 0–1 storage scale, and the two figures that need rows.
const full = {
  window: { month: "2026-11" },
  signed: { value: 10000, sample_count: 1, empty: "zero" },
  collected: { value: 0, sample_count: 0, empty: "zero" },
  gross_margin: { value: 0.6667, sample_count: 1, empty: "zero", basis: "settled_collabs" },
  receivable_days: { value: 3.5, sample_count: 2, empty: "zero" },
  cash_floor: COST_GAP,
};

describe("workbench money block schema", () => {
  it("parses the four figures and the deliberate gap", () => {
    const parsed = WorkbenchFinanceResponseSchema.parse(full);
    expect(parsed.window.month).toBe("2026-11");
    // A server that sends no unit is read as CNY, and one that names a unit keeps
    // it: every figure above is in `window.currency`, never a mixture.
    expect(parsed.window.currency).toBe("CNY");
    expect(WorkbenchFinanceResponseSchema.parse({ ...full, window: { month: "2026-11", currency: "USD" } }).window.currency).toBe("USD");
    expect(parsed.signed).toEqual({ value: 10000, sample_count: 1, empty: "zero" });
    // A stated zero is a measurement: it must survive, not fall back to a gap.
    expect(parsed.collected.value).toBe(0);
    expect(parsed.collected.empty).toBe("zero");
    // Rates travel at the 0–1 scale (docs/METRICS.md C3); the client multiplies.
    expect(parsed.gross_margin.value).toBeCloseTo(0.6667);
    // The cost side travels with the figure, so a hint can name it.
    expect(parsed.gross_margin.basis).toBe("settled_collabs");
    expect(parsed.cash_floor.value).toBeNull();
    expect(parsed.cash_floor.empty).toBe("insufficient_data");
    expect(parsed.cash_floor.basis).toBe("none");
  });

  it("degrades an unknown cost basis to none instead of dropping the figure", () => {
    const parsed = WorkbenchFinanceResponseSchema.parse({
      ...full,
      gross_margin: { value: 0.4, sample_count: 1, empty: "zero", basis: "budgeted" },
      // No basis at all is the same statement: nothing the client can name.
      cash_floor: { value: 1200, sample_count: 1, empty: "zero" },
    });
    expect(parsed.gross_margin.value).toBe(0.4);
    expect(parsed.gross_margin.basis).toBe("none");
    expect(parsed.cash_floor.value).toBe(1200);
    expect(parsed.cash_floor.basis).toBe("none");
  });

  it("degrades a missing figure to the gap block, not to a zero", () => {
    const { gross_margin: _omitted, ...withoutMargin } = full;
    const parsed = WorkbenchFinanceResponseSchema.parse(withoutMargin);
    expect(parsed.gross_margin).toEqual(COST_GAP);
    // The figures the server did send are untouched.
    expect(parsed.signed.value).toBe(10000);
    // A missing month label is display copy: empty string, not a rejected body.
    expect(WorkbenchFinanceResponseSchema.parse({ signed: full.signed }).window.month).toBe("");
  });

  it("degrades one drifted figure without losing the others", () => {
    // Money arriving as a string is drift (§3.1 says amounts are JSON numbers),
    // and an unknown empty state must fall back toward the gap card, never
    // toward a zero. One broken tile costs a tile, not the tab.
    const parsed = WorkbenchFinanceResponseSchema.parse({
      ...full,
      signed: { value: "10000", sample_count: 1, empty: "zero" },
      gross_margin: { value: 0.4, sample_count: 1, empty: "unknown_state", basis: "entered" },
      receivable_days: "3 days",
    });
    expect(parsed.signed).toEqual(GAP);
    expect(parsed.gross_margin.value).toBe(0.4);
    expect(parsed.gross_margin.empty).toBe("insufficient_data");
    // The basis survives even when the block's other fields drifted.
    expect(parsed.gross_margin.basis).toBe("entered");
    expect(parsed.receivable_days).toEqual(GAP);
    expect(parsed.collected).toEqual(full.collected);
  });

  it("falls back to the all-gaps response on a malformed body", () => {
    for (const malformed of [null, 42, "nope", []]) {
      expect(
        parseWithFallback(
          malformed,
          WorkbenchFinanceResponseSchema,
          EMPTY_WORKBENCH_FINANCE_RESPONSE,
          { endpoint },
        ),
      ).toEqual(EMPTY_WORKBENCH_FINANCE_RESPONSE);
    }
    // The fallback itself is the honest shape: no figure, nothing measured.
    for (const block of [
      EMPTY_WORKBENCH_FINANCE_RESPONSE.signed,
      EMPTY_WORKBENCH_FINANCE_RESPONSE.collected,
      EMPTY_WORKBENCH_FINANCE_RESPONSE.receivable_days,
    ]) {
      expect(block).toEqual(GAP);
    }
    for (const block of [
      EMPTY_WORKBENCH_FINANCE_RESPONSE.gross_margin,
      EMPTY_WORKBENCH_FINANCE_RESPONSE.cash_floor,
    ]) {
      expect(block).toEqual(COST_GAP);
    }
  });
});

// The month entry (707) that feeds the margin's cost side and the cash floor.
describe("workbench finance month schema", () => {
  it("keeps a null amount null and a stale total out of the way", () => {
    const parsed = WorkbenchFinanceMonthListResponseSchema.parse({
      months: [
        {
          id: "m-1",
          workspace_id: "ws-1",
          month: "2026-11-01",
          cash_open: 50000,
          fixed_cost: null,
          variable_cost: 3400,
          note: "rent",
          created_by: null,
          created_at: "2026-11-17T00:00:00Z",
          updated_at: "2026-11-17T00:00:00Z",
        },
      ],
      total: 1,
    });
    expect(parsed.months).toHaveLength(1);
    const [row] = parsed.months;
    expect(row?.month).toBe("2026-11-01");
    // "Not recorded" is not 0: the dialog must open with an empty field.
    expect(row?.fixed_cost).toBeNull();
    expect(row?.variable_cost).toBe(3400);
  });

  it("drops a drifted row instead of failing the whole list", () => {
    const parsed = WorkbenchFinanceMonthListResponseSchema.parse({
      months: ["not a row", { month: "2026-10-01", cash_open: 10 }],
    });
    // A malformed entry costs its own row; the readable one still renders.
    expect(parsed.months.map((month) => month.month)).toEqual(["", "2026-10-01"]);
  });
});
