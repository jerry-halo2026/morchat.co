import { describe, expect, it } from "vitest";
import {
  bdActivityListOptions,
  bdCampaignListOptions,
  bdKeys,
  bdPipelineOptions,
  bdQuoteListOptions,
} from "./queries";

/** True when `key` is inside the cache subtree rooted at `prefix`. */
function isUnder(key: readonly unknown[], prefix: readonly unknown[]): boolean {
  return prefix.every((part, index) => Object.is(part, key[index]));
}

describe("bd query keys (contract §20.5)", () => {
  it("writes the documented shapes verbatim", () => {
    expect(bdKeys.pipeline("ws-1")).toEqual(["bd", "ws-1", "pipeline"]);
    expect(bdKeys.list("ws-1", "activities", {})).toEqual(["bd", "ws-1", "activities", {}]);
    expect(bdKeys.list("ws-1", "quotes", { status: "sent" })).toEqual([
      "bd",
      "ws-1",
      "quotes",
      { status: "sent" },
    ]);
    expect(bdKeys.list("ws-1", "campaigns", { kind: "search" })).toEqual([
      "bd",
      "ws-1",
      "campaigns",
      { kind: "search" },
    ]);
  });

  it("keeps the detail read inside its resource prefix", () => {
    expect(bdKeys.detail("ws-1", "quotes", "q-1")).toEqual(["bd", "ws-1", "quotes", { id: "q-1" }]);
    expect(isUnder(bdKeys.detail("ws-1", "quotes", "q-1"), bdKeys.resource("ws-1", "quotes"))).toBe(
      true,
    );
    // A detail read is a different cache entry from the list's default filters.
    expect(bdKeys.detail("ws-1", "quotes", "q-1")).not.toEqual(bdKeys.list("ws-1", "quotes", {}));
  });

  it("nests the cockpit and every ledger under one prefix, so one invalidation moves them", () => {
    const prefix = bdKeys.all("ws-1");
    expect(prefix).toEqual(["bd", "ws-1"]);
    expect(isUnder(bdKeys.pipeline("ws-1"), prefix)).toBe(true);
    expect(isUnder(bdKeys.list("ws-1", "activities", {}), prefix)).toBe(true);
    expect(isUnder(bdKeys.detail("ws-1", "campaigns", "c-1"), prefix)).toBe(true);
    // Another workspace's BD cache is not under this prefix.
    expect(isUnder(bdKeys.pipeline("ws-2"), prefix)).toBe(false);
  });

  it("scopes every key to one workspace", () => {
    for (const key of [
      bdKeys.pipeline("ws-1"),
      bdKeys.list("ws-1", "activities", {}),
      bdKeys.detail("ws-1", "quotes", "q-1"),
    ]) {
      expect(key[1]).toBe("ws-1");
    }
  });

  it("builds options on those keys, with the filters carried through", () => {
    expect(bdPipelineOptions("ws-1").queryKey).toEqual(["bd", "ws-1", "pipeline"]);
    expect(bdActivityListOptions("ws-1", { creator_id: "cr-1" }).queryKey).toEqual([
      "bd",
      "ws-1",
      "activities",
      { creator_id: "cr-1" },
    ]);
    expect(bdQuoteListOptions("ws-1").queryKey).toEqual(["bd", "ws-1", "quotes", {}]);
    expect(bdCampaignListOptions("ws-1", { kind: "comment" }).queryKey).toEqual([
      "bd",
      "ws-1",
      "campaigns",
      { kind: "comment" },
    ]);
  });

  it("stays disabled until a workspace is known", () => {
    expect(bdPipelineOptions("").enabled).toBe(false);
    expect(bdActivityListOptions("").enabled).toBe(false);
    expect(bdPipelineOptions("ws-1").enabled).toBe(true);
  });
});
