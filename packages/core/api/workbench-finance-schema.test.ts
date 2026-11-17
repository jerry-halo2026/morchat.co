// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parseWithFallback } from "./schema";
import {
  EMPTY_WORKBENCH_FINANCE_RESPONSE,
  WorkbenchFinanceResponseSchema,
} from "./schemas";

const endpoint = "GET /api/workbench/finance";

// The all-gaps block the schema degrades a missing figure to: nothing measured is
// a statement, and it is not the same statement as zero (docs/METRICS.md §1
// rule 3).
const GAP = { value: null, sample_count: 0, empty: "insufficient_data" };

// A payload as the server sends it: two stated figures (one of them a true zero),
// one ratio at the 0–1 storage scale, and the two figures that need rows.
const full = {
  window: { month: "2026-11" },
  signed: { value: 10000, sample_count: 1, empty: "zero" },
  collected: { value: 0, sample_count: 0, empty: "zero" },
  gross_margin: { value: 0.6667, sample_count: 1, empty: "zero" },
  receivable_days: { value: 3.5, sample_count: 2, empty: "zero" },
  cash_floor: GAP,
};

describe("workbench money block schema", () => {
  it("parses the four figures and the deliberate gap", () => {
    const parsed = WorkbenchFinanceResponseSchema.parse(full);
    expect(parsed.window.month).toBe("2026-11");
    expect(parsed.signed).toEqual({ value: 10000, sample_count: 1, empty: "zero" });
    // A stated zero is a measurement: it must survive, not fall back to a gap.
    expect(parsed.collected.value).toBe(0);
    expect(parsed.collected.empty).toBe("zero");
    // Rates travel at the 0–1 scale (docs/METRICS.md C3); the client multiplies.
    expect(parsed.gross_margin.value).toBeCloseTo(0.6667);
    expect(parsed.cash_floor.value).toBeNull();
    expect(parsed.cash_floor.empty).toBe("insufficient_data");
  });

  it("degrades a missing figure to the gap block, not to a zero", () => {
    const { gross_margin: _omitted, ...withoutMargin } = full;
    const parsed = WorkbenchFinanceResponseSchema.parse(withoutMargin);
    expect(parsed.gross_margin).toEqual(GAP);
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
      gross_margin: { value: 0.4, sample_count: 1, empty: "unknown_state" },
      receivable_days: "3 days",
    });
    expect(parsed.signed).toEqual(GAP);
    expect(parsed.gross_margin.value).toBe(0.4);
    expect(parsed.gross_margin.empty).toBe("insufficient_data");
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
      EMPTY_WORKBENCH_FINANCE_RESPONSE.gross_margin,
      EMPTY_WORKBENCH_FINANCE_RESPONSE.receivable_days,
      EMPTY_WORKBENCH_FINANCE_RESPONSE.cash_floor,
    ]) {
      expect(block).toEqual(GAP);
    }
  });
});
