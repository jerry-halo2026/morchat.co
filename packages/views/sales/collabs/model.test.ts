// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { CrmCollab, CrmSettlement } from "@morechat/core/types";
import {
  amountText,
  COLLAB_STAGES,
  collabFields,
  collabForm,
  commissionText,
  createCollabRequest,
  dayText,
  EMPTY_COLLAB_FORM,
  EMPTY_SETTLEMENT_FORM,
  feeAmounts,
  filterByWindow,
  groupByStage,
  inWindow,
  instantDayText,
  invalidAmounts,
  isReceived,
  paidAtFromDay,
  parseMoneyField,
  parseSettlementKind,
  parseStage,
  parseWindow,
  settlementRequest,
  settlementTotals,
  stageRank,
  sumMoney,
  sumText,
} from "./model";

/**
 * The collaboration ledger's arithmetic, without a renderer.
 *
 * Four rules are pinned here because they are the ones that turn into wrong
 * numbers on screen rather than merely ugly ones: a sum with nothing behind it is
 * `insufficient_data` and never `0`; a null amount prints nothing; the window is
 * inclusive of today and drops nothing it cannot date; and the request carries
 * exactly the fields the drawer owns — `null` for a cleared field, and no
 * timestamp the server stamps itself.
 */

function collab(overrides: Partial<CrmCollab> = {}): CrmCollab {
  return {
    id: "collab-1",
    workspace_id: "ws-1",
    brief_id: "brief-1",
    creator_id: "creator-1",
    stage: "confirmed",
    quote_amount: null,
    final_amount: null,
    prob: null,
    creator_fee: null,
    sample_cost: null,
    platform_fee: null,
    currency: "CNY",
    settlement_mode: null,
    commission_rate: null,
    sample_required: false,
    script_required: false,
    scheduled_at: null,
    confirmed_at: null,
    published_at: null,
    accepted_at: null,
    issue_id: null,
    owner_member_id: null,
    created_by: null,
    created_at: "2026-11-01T02:00:00Z",
    updated_at: "2026-11-10T02:00:00Z",
    archived_at: null,
    publish_url: null,
    settled_on: null,
    ...overrides,
  };
}

let settlementSeq = 0;

function settlement(overrides: Partial<CrmSettlement> = {}): CrmSettlement {
  settlementSeq += 1;
  return {
    id: `settlement-${settlementSeq}`,
    workspace_id: "ws-1",
    collab_id: "collab-1",
    kind: "prepay",
    amount: 1000,
    currency: "CNY",
    due_at: null,
    paid_at: null,
    invoice_no: null,
    note: null,
    created_by: null,
    created_at: "2026-11-01T02:00:00Z",
    updated_at: "2026-11-01T02:00:00Z",
    archived_at: null,
    ...overrides,
  };
}

describe("sumMoney · three states", () => {
  it("says nothing was summed rather than zero", () => {
    expect(sumMoney([], "CNY")).toEqual({
      amount: null,
      currency: "CNY",
      empty: "insufficient_data",
    });
    expect(sumMoney([null, null], "CNY")).toEqual({
      amount: null,
      currency: "CNY",
      empty: "insufficient_data",
    });
  });

  it("keeps a settled zero apart from an unknown", () => {
    expect(sumMoney([0], "CNY")).toEqual({ amount: 0, currency: "CNY", empty: "zero" });
    expect(sumText({ amount: 0, currency: "CNY", empty: "zero" }, "en")).toBe("¥0");
  });

  it("adds only the numbers that are there", () => {
    expect(sumMoney([8000, null, 2500.555], "CNY")).toEqual({
      amount: 10500.56,
      currency: "CNY",
      empty: "zero",
    });
  });
});

describe("amountText · a missing amount prints nothing", () => {
  it("returns null for a null and text for a number", () => {
    expect(amountText(null, "CNY", "en")).toBeNull();
    expect(amountText(8000, "CNY", "en")).toBe("¥8,000");
  });

  it("keeps the currency of the row it formats", () => {
    expect(amountText(1200, "USD", "en")).toBe("$1,200");
  });
});

describe("commissionText · 0–1 stored, percentage shown", () => {
  it("multiplies exactly once", () => {
    expect(commissionText(0.2)).toBe("20.0%");
    expect(commissionText(0.055)).toBe("5.5%");
    expect(commissionText(0)).toBe("0.0%");
    expect(commissionText(null)).toBeNull();
  });
});

describe("feeAmounts · three slots, three empties", () => {
  it("keeps the order 合作费 / 样品费 / 平台费 and their nulls", () => {
    const row = collab({ creator_fee: 8000, sample_cost: null, platform_fee: 300 });
    expect(feeAmounts(row)).toEqual([8000, null, 300]);
  });
});

describe("stage tokens", () => {
  it("orders by the contract, unknown stages last", () => {
    expect(stageRank("inquiry")).toBe(0);
    expect(stageRank("cancelled")).toBe(COLLAB_STAGES.length - 1);
    expect(stageRank("invented_by_a_newer_server")).toBe(COLLAB_STAGES.length);
  });

  it("guards the pickers' values", () => {
    expect(parseStage("settled")).toBe("settled");
    expect(parseStage("nope")).toBeNull();
    expect(parseSettlementKind("tax")).toBe("tax");
    expect(parseSettlementKind("bonus")).toBeNull();
    expect(parseWindow("30")).toBe(30);
    expect(parseWindow("365")).toBe("all");
  });
});

describe("groupByStage · the folded view of eleven stages", () => {
  it("bands only the stages that hold a row, in pipeline order", () => {
    // `stage: string` on the banding helper is the point: the wire schema is
    // lenient, so a token a newer server adds must band like any other.
    const unknown = { ...collab({ id: "c-tail" }), stage: "no_such_stage" };
    const bands = groupByStage([
      collab({ id: "c-settled", stage: "settled", final_amount: 9000 }),
      collab({ id: "c-confirmed", stage: "confirmed", final_amount: 5000 }),
      unknown,
    ]);
    expect(bands.map((band) => band.stage)).toEqual(["confirmed", "settled", "no_such_stage"]);
    expect(bands[0]!.total.amount).toBe(5000);
    expect(bands[2]!.total).toEqual({ amount: null, currency: "CNY", empty: "insufficient_data" });
  });

  it("draws no band at all for an empty ledger", () => {
    expect(groupByStage([])).toEqual([]);
  });

  it("orders each band newest first", () => {
    const bands = groupByStage([
      collab({ id: "old", stage: "quoted", updated_at: "2026-11-01T02:00:00Z" }),
      collab({ id: "new", stage: "quoted", updated_at: "2026-11-12T02:00:00Z" }),
    ]);
    expect(bands[0]!.rows.map((row) => row.id)).toEqual(["new", "old"]);
  });
});

describe("the updated-at window", () => {
  const today = "2026-11-18";

  it("counts today as inside the window and the day before it as outside", () => {
    expect(inWindow(new Date(2026, 10, 18, 9).toISOString(), 7, today)).toBe(true);
    expect(inWindow(new Date(2026, 10, 12, 9).toISOString(), 7, today)).toBe(true);
    expect(inWindow(new Date(2026, 10, 11, 9).toISOString(), 7, today)).toBe(false);
  });

  it("keeps a row it cannot date instead of dropping it silently", () => {
    expect(inWindow(null, 7, today)).toBe(true);
    expect(inWindow("not a date", 7, today)).toBe(true);
  });

  it("drops nothing when the window is off", () => {
    const rows = [collab({ id: "a" }), collab({ id: "b", updated_at: "2020-01-01T00:00:00Z" })];
    expect(filterByWindow(rows, "all", today)).toHaveLength(2);
    expect(filterByWindow(rows, 30, today).map((row) => row.id)).toEqual(["a"]);
  });
});

describe("days", () => {
  it("prints a calendar day as stored and an instant as a local day", () => {
    expect(dayText("2026-11-18")).toBe("2026-11-18");
    expect(dayText("2026-11-18T00:00:00Z")).toBe("2026-11-18");
    expect(dayText(null)).toBeNull();
    expect(instantDayText(new Date(2026, 10, 3, 9).toISOString())).toBe("2026-11-03");
    expect(instantDayText(null)).toBeNull();
  });
});

describe("the money fields", () => {
  it("tells an empty field from a typo", () => {
    expect(parseMoneyField("")).toEqual({ ok: true, value: null });
    expect(parseMoneyField("  ")).toEqual({ ok: true, value: null });
    expect(parseMoneyField("8000.555")).toEqual({ ok: true, value: 8000.56 });
    expect(parseMoneyField("0")).toEqual({ ok: true, value: 0 });
    expect(parseMoneyField("-1")).toEqual({ ok: false });
    expect(parseMoneyField("abc")).toEqual({ ok: false });
  });

  it("refuses a form with one bad amount", () => {
    expect(invalidAmounts({ ...EMPTY_COLLAB_FORM, quote: "abc" })).toBe(true);
    expect(invalidAmounts({ ...EMPTY_COLLAB_FORM, final: "-2" })).toBe(true);
    expect(invalidAmounts(EMPTY_COLLAB_FORM)).toBe(false);
  });
});

describe("collabFields · what the drawer owns", () => {
  it("sends the four fields and clears what was emptied", () => {
    const form = collabForm(
      collab({
        stage: "published",
        quote_amount: 8000,
        final_amount: 9000,
        publish_url: "https://example.test/v/1",
        settled_on: "2026-11-18",
      }),
    );
    expect(collabFields(form)).toEqual({
      stage: "published",
      quote_amount: 8000,
      final_amount: 9000,
      publish_url: "https://example.test/v/1",
      settled_on: "2026-11-18",
    });

    // Emptied: `null` clears the column instead of keeping the old value.
    expect(collabFields(EMPTY_COLLAB_FORM)).toEqual({
      stage: "inquiry",
      quote_amount: null,
      final_amount: null,
      publish_url: null,
      settled_on: null,
    });
  });

  it("carries the brief and the creator on a create, and nothing server-decided", () => {
    const request = createCollabRequest("brief-9", "creator-9", {
      ...EMPTY_COLLAB_FORM,
      quote: "1500",
    });
    expect(request).toEqual({
      brief_id: "brief-9",
      creator_id: "creator-9",
      stage: "inquiry",
      quote_amount: 1500,
      final_amount: null,
      publish_url: null,
      settled_on: null,
    });
  });
});

describe("settlements", () => {
  it("reads paid_at and nothing else", () => {
    expect(isReceived(settlement({ paid_at: "2026-11-18T04:00:00Z" }))).toBe(true);
    expect(isReceived(settlement({ kind: "final", paid_at: null }))).toBe(false);
  });

  it("splits the two totals by arrival", () => {
    const totals = settlementTotals(
      [
        settlement({ amount: 3000, paid_at: "2026-11-10T04:00:00Z" }),
        settlement({ amount: 500, paid_at: "2026-11-12T04:00:00Z" }),
        settlement({ amount: 7000, paid_at: null }),
      ],
      "CNY",
    );
    expect(totals.received).toEqual({ amount: 3500, currency: "CNY", empty: "zero" });
    expect(totals.owed).toEqual({ amount: 7000, currency: "CNY", empty: "zero" });
  });

  it("says nothing was received rather than zero received", () => {
    const totals = settlementTotals([settlement({ amount: 7000, paid_at: null })], "CNY");
    expect(totals.received).toEqual({
      amount: null,
      currency: "CNY",
      empty: "insufficient_data",
    });
    expect(sumText(totals.received, "en")).toBeNull();
  });

  it("builds the request from the form, refusing an empty amount", () => {
    expect(
      settlementRequest("collab-1", "CNY", { ...EMPTY_SETTLEMENT_FORM, amount: "" }),
    ).toBeNull();
    expect(
      settlementRequest("collab-1", "CNY", { ...EMPTY_SETTLEMENT_FORM, amount: "abc" }),
    ).toBeNull();

    expect(
      settlementRequest("collab-1", "CNY", { kind: "tax", amount: "120", paidOn: "" }),
    ).toEqual({
      collab_id: "collab-1",
      kind: "tax",
      amount: 120,
      currency: "CNY",
      paid_at: null,
    });
  });

  it("turns a received day into an instant that reads back as that day", () => {
    const paidAt = paidAtFromDay("2026-11-18");
    expect(paidAt).not.toBeNull();
    // Noon survives every UTC offset, so the day never shifts when it is read back.
    expect(instantDayText(paidAt)).toBe("2026-11-18");
    expect(paidAtFromDay("")).toBeNull();
  });
});
