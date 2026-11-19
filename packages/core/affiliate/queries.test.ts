import { describe, expect, it } from "vitest";
import {
  AffiliatePickSchema,
  AffiliateProductSchema,
  AffiliateSettlementSchema,
  AffiliateSummaryResponseSchema,
  EMPTY_AFFILIATE_PICK,
  EMPTY_AFFILIATE_PRODUCT,
  EMPTY_AFFILIATE_SETTLEMENT,
} from "../api/schemas";
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

// The labels 725–727 add decide whether money is ours, so the schema defaults are
// part of the contract, not cosmetics: a server (or a cached payload) that omits
// them must read as the only thing those rows could have meant before the
// migrations — `client_brand` and `agency` — never as the opposite.
describe("affiliate ownership and settlement recipient defaults (contract §11.2)", () => {
  it("reads an omitted ownership as client_brand and keeps a null seller nullable", () => {
    const product = AffiliateProductSchema.parse({
      id: "p-1",
      platform: "douyin",
      platform_product_id: "3712345678901",
      title: "Fixture",
      client_id: null,
    });
    expect(product.ownership).toBe("client_brand");
    expect(product.client_id).toBeNull();

    // An own-brand row: no seller, and the label survives the parse.
    const own = AffiliateProductSchema.parse({
      id: "p-2",
      ownership: "own_brand",
      platform: "douyin",
      platform_product_id: "own-sku",
      title: "Own brand",
    });
    expect(own.ownership).toBe("own_brand");
    expect(own.client_id).toBeNull();

    expect(EMPTY_AFFILIATE_PRODUCT.ownership).toBe("client_brand");
    expect(EMPTY_AFFILIATE_PRODUCT.client_id).toBeNull();
  });

  it("keeps the pick's split and service fee nullable, not zero", () => {
    const pick = AffiliatePickSchema.parse({
      id: "k-1",
      product_id: "p-1",
      creator_id: "c-1",
    });
    // "Not an internal split" and "no fee agreed" are absences, and a 0 would
    // claim we settled on a zero share / waived a fee.
    expect(pick.agency_share_rate).toBeNull();
    expect(pick.service_fee_amount).toBeNull();
    expect(pick.commission_rate).toBeNull();
    expect(EMPTY_AFFILIATE_PICK.agency_share_rate).toBeNull();
    expect(EMPTY_AFFILIATE_PICK.service_fee_amount).toBeNull();
  });

  it("reads an omitted settled_to as agency, the pocket we were paid into", () => {
    const statement = AffiliateSettlementSchema.parse({
      id: "s-1",
      period_start: "2026-11-01",
      period_end: "2026-11-15",
      net_amount: 895,
    });
    expect(statement.settled_to).toBe("agency");
    expect(EMPTY_AFFILIATE_SETTLEMENT.settled_to).toBe("agency");

    const direct = AffiliateSettlementSchema.parse({
      id: "s-2",
      period_start: "2026-11-01",
      period_end: "2026-11-15",
      net_amount: 60,
      settled_to: "creator",
    });
    expect(direct.settled_to).toBe("creator");
  });

  it("degrades the three income blocks to the gap block when an old server omits them", () => {
    const summary = AffiliateSummaryResponseSchema.parse({
      window: { month: "2026-11" },
      gmv: { value: 2000, sample_count: 3, empty: "zero" },
    });
    for (const block of [
      summary.commission_agency,
      summary.commission_creator,
      summary.agency_share_income,
    ]) {
      expect(block.value).toBeNull();
      expect(block.empty).toBe("insufficient_data");
    }
  });
});
