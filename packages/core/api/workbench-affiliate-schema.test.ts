// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parseWithFallback } from "./schema";
import {
  AffiliateSummaryResponseSchema,
  EMPTY_AFFILIATE_SUMMARY_RESPONSE,
} from "./schemas";

const endpoint = "GET /api/workbench/affiliate/summary";

// The all-gaps block: nothing measured is a statement of its own, and it is not
// the same statement as zero (docs/METRICS.md §1 rule 3).
const GAP = { value: null, sample_count: 0, empty: "insufficient_data" };

// A month as the server sends it: a GMV with rows behind it, a refund rate at the
// 0–1 storage scale (C3), the income split, and the two counts (real zeros).
const full = {
  window: { month: "2027-05", currency: "CNY" },
  gmv: { value: 4000, sample_count: 1, empty: "zero" },
  commission_est: { value: 800, sample_count: 1, empty: "zero" },
  commission_settled: { value: 400, sample_count: 1, empty: "zero" },
  commission_agency: { value: 540, sample_count: 2, empty: "zero" },
  commission_creator: GAP,
  agency_share_income: { value: 120, sample_count: 1, empty: "zero" },
  refund_rate: { value: 0.05, sample_count: 1, empty: "zero" },
  tech_fee: { value: 12, sample_count: 1, empty: "zero" },
  pick_count: { value: 2, sample_count: 2, empty: "zero" },
  active_creator_count: { value: 2, sample_count: 2, empty: "zero" },
};

describe("affiliate summary schema", () => {
  it("reads the window's currency and keeps every block", () => {
    const parsed = AffiliateSummaryResponseSchema.parse(full);
    expect(parsed.window).toEqual({ month: "2027-05", currency: "CNY" });
    expect(parsed.gmv.value).toBe(4000);
    // Both halves of the refund rate are the same currency's rows, so the ratio is
    // meaningful; it travels at the 0–1 scale and the display layer multiplies.
    expect(parsed.refund_rate.value).toBeCloseTo(0.05);
    // A block with no rows is the gap, not a zero the client would render as "0".
    expect(parsed.commission_creator).toEqual(GAP);
    // The counts answer a real zero on an empty month, and a real number here.
    expect(parsed.pick_count.value).toBe(2);
  });

  it("parses a summary from a server that sends no currency, as CNY", () => {
    // Before the window carried a unit the server sent `{month}` alone, and a
    // client that demanded `currency` would blank the whole strip for every
    // installed desktop build talking to an older backend. CNY is the unit the
    // affiliate columns default to, which is what that server was summing.
    const parsed = AffiliateSummaryResponseSchema.parse({
      ...full,
      window: { month: "2027-05" },
    });
    expect(parsed.window.currency).toBe("CNY");
    expect(parsed.window.month).toBe("2027-05");
    // Nothing else is disturbed by the missing label.
    expect(parsed.gmv.value).toBe(4000);
    expect(parsed.tech_fee.value).toBe(12);

    // A window that is missing entirely degrades the same way, and a window that
    // is not an object at all falls back instead of rejecting the figures.
    expect(AffiliateSummaryResponseSchema.parse({ ...full, window: undefined }).window.currency).toBe("CNY");
    expect(AffiliateSummaryResponseSchema.parse({ ...full, window: "2027-05" }).window.currency).toBe("CNY");
  });

  it("keeps a named unit other than CNY", () => {
    const parsed = AffiliateSummaryResponseSchema.parse({
      ...full,
      window: { month: "2027-06", currency: "USD" },
      gmv: { value: 700, sample_count: 1, empty: "zero" },
    });
    expect(parsed.window.currency).toBe("USD");
    expect(parsed.gmv.value).toBe(700);
  });

  it("degrades a missing money block to the gap block", () => {
    const { commission_agency: _omitted, ...withoutAgency } = full;
    const parsed = AffiliateSummaryResponseSchema.parse(withoutAgency);
    // A server that predates the income split simply omits the key; the tile is a
    // gap, exactly like the money it would have carried.
    expect(parsed.commission_agency).toEqual(GAP);
    expect(parsed.gmv.value).toBe(4000);
  });

  it("falls back to the all-gaps response on a malformed body", () => {
    for (const malformed of [null, 42, "nope", []]) {
      expect(
        parseWithFallback(
          malformed,
          AffiliateSummaryResponseSchema,
          EMPTY_AFFILIATE_SUMMARY_RESPONSE,
          { endpoint },
        ),
      ).toEqual(EMPTY_AFFILIATE_SUMMARY_RESPONSE);
    }
    // The fallback names a unit too: an empty strip still has to say what its
    // figures would have been in.
    expect(EMPTY_AFFILIATE_SUMMARY_RESPONSE.window).toEqual({ month: "", currency: "CNY" });
  });
});
