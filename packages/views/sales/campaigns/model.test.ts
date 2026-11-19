// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { BdCampaign } from "@morechat/core/types";
import {
  budgetText,
  CAMPAIGN_KINDS,
  campaignFields,
  campaignForm,
  createCampaignRequest,
  dayText,
  formError,
  instantDayText,
  parseKind,
  parseMoneyField,
  sortCampaigns,
  updateCampaignRequest,
  windowEnds,
} from "./model";

/**
 * The collection batch ledger's arithmetic, without a renderer.
 *
 * Four rules are pinned because each one is a wrong sentence on screen rather
 * than a wrong pixel: `creator_count` 0 is a real zero (the column is
 * `NOT NULL DEFAULT 0`), a missing budget prints nothing, a window that runs
 * backwards is refused before the 400, and the payload never carries a
 * `creator_count` the form was never allowed to type.
 */

function campaign(overrides: Partial<BdCampaign> = {}): BdCampaign {
  return {
    id: "campaign-1",
    workspace_id: "ws-1",
    name: "Autumn search",
    kind: "search",
    budget_amount: null,
    currency: "CNY",
    started_on: null,
    ended_on: null,
    source_keyword: null,
    creator_count: 0,
    note: null,
    owner_member_id: null,
    created_by: null,
    created_at: "2026-11-01T02:00:00Z",
    updated_at: "2026-11-01T02:00:00Z",
    ...overrides,
  };
}

describe("budgetText · a missing budget prints nothing", () => {
  it("keeps an unset budget apart from a zero one", () => {
    expect(budgetText(null, "CNY", "en")).toBeNull();
    expect(budgetText(0, "CNY", "en")).toBe("¥0");
    expect(budgetText(5000, "CNY", "en")).toBe("¥5,000");
    expect(budgetText(1200, "USD", "en")).toBe("$1,200");
  });
});

describe("kinds", () => {
  it("guards the picker and the filter", () => {
    expect(CAMPAIGN_KINDS).toEqual(["search", "comment", "manual"]);
    expect(parseKind("comment")).toBe("comment");
    expect(parseKind("affiliate")).toBeNull();
  });
});

describe("the window", () => {
  it("prints both ends and leaves an open end open", () => {
    expect(windowEnds(campaign({ started_on: "2026-10-01", ended_on: "2026-10-31" }))).toEqual({
      from: "2026-10-01",
      to: "2026-10-31",
    });
    expect(windowEnds(campaign({ started_on: "2026-10-01" }))).toEqual({
      from: "2026-10-01",
      to: null,
    });
    expect(windowEnds(campaign())).toEqual({ from: null, to: null });
  });

  it("prints a day as stored and an instant as a local day", () => {
    expect(dayText("2026-10-01")).toBe("2026-10-01");
    expect(dayText("2026-10-01T00:00:00Z")).toBe("2026-10-01");
    expect(instantDayText(new Date(2026, 9, 3, 9).toISOString())).toBe("2026-10-03");
    expect(instantDayText(null)).toBeNull();
  });
});

describe("sortCampaigns · the endpoint's own order", () => {
  it("puts the newest window first and sorts a windowless batch by its creation day", () => {
    const rows = [
      campaign({ id: "a", started_on: "2026-10-01" }),
      campaign({ id: "b", started_on: "2026-11-05" }),
      campaign({ id: "c", created_at: "2026-11-08T02:00:00Z" }),
    ];
    expect(sortCampaigns(rows).map((row) => row.id)).toEqual(["c", "b", "a"]);
  });

  it("is stable on the id when two rows share a day", () => {
    const rows = [
      campaign({ id: "aaa", started_on: "2026-11-01", created_at: "2026-11-01T02:00:00Z" }),
      campaign({ id: "bbb", started_on: "2026-11-01", created_at: "2026-11-01T02:00:00Z" }),
    ];
    expect(sortCampaigns(rows).map((row) => row.id)).toEqual(["bbb", "aaa"]);
    expect(sortCampaigns([...rows].reverse()).map((row) => row.id)).toEqual(["bbb", "aaa"]);
  });
});

describe("the form", () => {
  it("opens on a stored row and on a blank one", () => {
    const form = campaignForm(
      campaign({
        name: " Autumn ",
        kind: "comment",
        source_keyword: "护肤",
        budget_amount: 5000,
        started_on: "2026-10-01",
        ended_on: "2026-10-31",
      }),
    );
    expect(form).toEqual({
      name: " Autumn ",
      kind: "comment",
      keyword: "护肤",
      budget: "5000",
      currency: "CNY",
      startedOn: "2026-10-01",
      endedOn: "2026-10-31",
    });

    expect(campaignForm(null)).toEqual({
      name: "",
      kind: "manual",
      keyword: "",
      budget: "",
      currency: "CNY",
      startedOn: "",
      endedOn: "",
    });
  });

  it("refuses an unnamed batch, a bad budget and a backwards window", () => {
    const base = campaignForm(null);
    expect(formError(base)).toBe("name");
    expect(formError({ ...base, name: "Batch" })).toBeNull();
    expect(formError({ ...base, name: "Batch", budget: "-1" })).toBe("amount");
    expect(
      formError({
        ...base,
        name: "Batch",
        startedOn: "2026-11-10",
        endedOn: "2026-11-09",
      }),
    ).toBe("window");
    // The same day is not backwards: the server's rule is `ended_on < started_on`.
    expect(
      formError({ ...base, name: "Batch", startedOn: "2026-11-10", endedOn: "2026-11-10" }),
    ).toBeNull();
  });

  it("tells an empty field from a typo", () => {
    expect(parseMoneyField("")).toEqual({ ok: true, value: null });
    expect(parseMoneyField("5000.555")).toEqual({ ok: true, value: 5000.56 });
    expect(parseMoneyField("-1")).toEqual({ ok: false });
    expect(parseMoneyField("五千")).toEqual({ ok: false });
  });

  it("trims what it sends and clears what was emptied", () => {
    const form = {
      ...campaignForm(null),
      name: "  Autumn  ",
      keyword: "  护肤  ",
      budget: "5000",
      startedOn: "2026-10-01",
    };
    expect(campaignFields(form)).toEqual({
      name: "Autumn",
      kind: "manual",
      budget_amount: 5000,
      currency: "CNY",
      started_on: "2026-10-01",
      ended_on: null,
      source_keyword: "护肤",
    });
  });

  it("never sends the cached creator count", () => {
    const request = createCampaignRequest({ ...campaignForm(null), name: "Batch" });
    expect(Object.keys(request).sort()).toEqual([
      "budget_amount",
      "currency",
      "ended_on",
      "kind",
      "name",
      "source_keyword",
      "started_on",
    ]);
    expect(updateCampaignRequest({ ...campaignForm(null), name: "Batch" })).toEqual(request);
  });
});
