import { describe, expect, it } from "vitest";
import {
  affiliateDailyOptions,
  affiliateKeys,
  affiliatePickDetailOptions,
  affiliatePickListOptions,
  affiliateProductDetailOptions,
  affiliateProductListOptions,
  affiliateSettlementListOptions,
  affiliateSummaryOptions,
} from "./queries";

function isUnder(key: readonly unknown[], prefix: readonly unknown[]): boolean {
  return prefix.every((part, index) => Object.is(part, key[index]));
}

describe("affiliate query keys (contract §11)", () => {
  it("writes ['affiliate', wsId, resource, filters]", () => {
    expect(affiliateKeys.list("ws-1", "products", {})).toEqual([
      "affiliate",
      "ws-1",
      "products",
      {},
    ]);
    expect(affiliateKeys.list("ws-1", "picks", { creator_id: "cr-1" })).toEqual([
      "affiliate",
      "ws-1",
      "picks",
      { creator_id: "cr-1" },
    ]);
    expect(affiliateKeys.list("ws-1", "settlements", { status: "pending" })).toEqual([
      "affiliate",
      "ws-1",
      "settlements",
      { status: "pending" },
    ]);
  });

  it("keeps the four resources apart: a pick list never shares a key with a product list", () => {
    expect(affiliateKeys.list("ws-1", "products", { limit: 10 })).not.toEqual(
      affiliateKeys.list("ws-1", "picks", { limit: 10 }),
    );
    // `daily` is a resource name, not the filters of another resource.
    expect(affiliateDailyOptions("ws-1", { pick_id: "p-1" }).queryKey).not.toEqual(
      affiliatePickListOptions("ws-1", { product_id: "p-1" }).queryKey,
    );
  });

  it("nests detail reads under the domain prefix the mutations invalidate", () => {
    expect(affiliateKeys.detail("ws-1", "products", "p-1")).toEqual([
      "affiliate",
      "ws-1",
      "products",
      { id: "p-1" },
    ]);

    for (const key of [
      affiliateKeys.list("ws-1", "products", {}),
      affiliateKeys.detail("ws-1", "picks", "k-1"),
      affiliateKeys.summary("ws-1", "2026-11", null),
    ]) {
      expect(isUnder(key, affiliateKeys.all("ws-1"))).toBe(true);
    }
    expect(isUnder(affiliateKeys.summary("ws-2", null, null), affiliateKeys.all("ws-1"))).toBe(
      false,
    );
  });

  it("puts the month and the department in the summary key, with fixed arity", () => {
    expect(affiliateKeys.summary("ws-1", null, null)).toEqual([
      "affiliate",
      "ws-1",
      "summary",
      "current",
      "all",
    ]);
    expect(affiliateKeys.summary("ws-1", "2026-11", "dept-1")).toEqual([
      "affiliate",
      "ws-1",
      "summary",
      "2026-11",
      "dept-1",
    ]);
    // Two scopes are two keys: switching month must not show the old numbers.
    expect(affiliateKeys.summary("ws-1", "2026-11", null)).not.toEqual(
      affiliateKeys.summary("ws-1", "2026-10", null),
    );
  });

  it("builds options on those keys, with wsId in position 1", () => {
    expect(affiliateProductListOptions("ws-1", { status: "on_shelf" }).queryKey).toEqual([
      "affiliate",
      "ws-1",
      "products",
      { status: "on_shelf" },
    ]);
    expect(affiliateSummaryOptions("ws-1", { month: "2026-11" }).queryKey).toEqual([
      "affiliate",
      "ws-1",
      "summary",
      "2026-11",
      "all",
    ]);
    expect(affiliateSettlementListOptions("ws-1").queryKey[1]).toBe("ws-1");
  });

  it("stays disabled until both the workspace and the row id are known", () => {
    expect(affiliateProductListOptions("").enabled).toBe(false);
    expect(affiliateSummaryOptions("").enabled).toBe(false);
    expect(affiliateProductDetailOptions("", "p-1").enabled).toBe(false);
    expect(affiliateProductDetailOptions("ws-1", "").enabled).toBe(false);
    expect(affiliatePickDetailOptions("ws-1", "k-1").enabled).toBe(true);
    expect(affiliateDailyOptions("ws-1", { pick_id: "k-1" }).enabled).toBe(true);
  });
});
