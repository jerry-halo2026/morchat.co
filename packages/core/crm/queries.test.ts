import { describe, expect, it } from "vitest";
import {
  crmBriefListOptions,
  crmClientListOptions,
  crmCollabListOptions,
  crmKeys,
  crmSettlementListOptions,
  workbenchCountsOptions,
  workbenchKeys,
  workbenchOverviewOptions,
} from "./queries";

/** True when `key` is inside the cache subtree rooted at `prefix`. */
function isUnder(key: readonly unknown[], prefix: readonly unknown[]): boolean {
  return prefix.every((part, index) => Object.is(part, key[index]));
}

describe("workbench query keys (contract §5)", () => {
  it("writes the documented shapes verbatim", () => {
    expect(workbenchKeys.overview("ws-1")).toEqual(["workbench", "ws-1", "overview", "all"]);
    expect(workbenchKeys.counts("ws-1")).toEqual(["workbench", "ws-1", "counts", "all"]);
    expect(workbenchKeys.overview("ws-1", "dept-1")).toEqual([
      "workbench",
      "ws-1",
      "overview",
      "dept-1",
    ]);
    expect(workbenchKeys.counts("ws-1", "dept-1")).toEqual([
      "workbench",
      "ws-1",
      "counts",
      "dept-1",
    ]);
  });

  it("keeps 'the whole workspace' and 'this department' in different cache entries", () => {
    expect(workbenchKeys.overview("ws-1", null)).not.toEqual(workbenchKeys.overview("ws-1", "dept-1"));
    expect(workbenchKeys.overview("ws-1", null)).toEqual(workbenchKeys.overview("ws-1"));
  });

  it("scopes every key to one workspace", () => {
    for (const key of [
      workbenchKeys.overview("ws-1"),
      workbenchKeys.counts("ws-1"),
      crmKeys.list("ws-1", "clients", {}),
      crmKeys.detail("ws-1", "briefs", "b-1"),
    ]) {
      expect(key[1]).toBe("ws-1");
    }
  });

  it("nests both aggregates under workbenchKeys.all so one invalidation refreshes them", () => {
    const prefix = workbenchKeys.all("ws-1");
    expect(prefix).toEqual(["workbench", "ws-1"]);
    expect(isUnder(workbenchKeys.overview("ws-1"), prefix)).toBe(true);
    expect(isUnder(workbenchKeys.counts("ws-1", "dept-1"), prefix)).toBe(true);
    // Another workspace's aggregates are NOT under this prefix.
    expect(isUnder(workbenchKeys.counts("ws-2"), prefix)).toBe(false);
  });
});

describe("crm query keys (contract §5)", () => {
  it("writes ['crm', wsId, resource, filters] for every ledger", () => {
    expect(crmKeys.list("ws-1", "clients", {})).toEqual(["crm", "ws-1", "clients", {}]);
    expect(crmKeys.list("ws-1", "briefs", { status: "open" })).toEqual([
      "crm",
      "ws-1",
      "briefs",
      { status: "open" },
    ]);
    expect(crmKeys.list("ws-1", "collabs", { stage: "confirmed" })).toEqual([
      "crm",
      "ws-1",
      "collabs",
      { stage: "confirmed" },
    ]);
    expect(crmKeys.list("ws-1", "settlements", { paid: false })).toEqual([
      "crm",
      "ws-1",
      "settlements",
      { paid: false },
    ]);
  });

  it("keeps detail reads inside the same resource prefix", () => {
    expect(crmKeys.detail("ws-1", "collabs", "c-1")).toEqual(["crm", "ws-1", "collabs", { id: "c-1" }]);
    expect(isUnder(crmKeys.detail("ws-1", "collabs", "c-1"), crmKeys.resource("ws-1", "collabs"))).toBe(
      true,
    );
    expect(isUnder(crmKeys.list("ws-1", "briefs", {}), crmKeys.all("ws-1"))).toBe(true);
    expect(isUnder(crmKeys.list("ws-2", "briefs", {}), crmKeys.all("ws-1"))).toBe(false);
  });

  it("builds options on those keys, with the filters carried through", () => {
    expect(crmClientListOptions("ws-1", { q: "acme" }).queryKey).toEqual([
      "crm",
      "ws-1",
      "clients",
      { q: "acme" },
    ]);
    expect(crmBriefListOptions("ws-1").queryKey).toEqual(["crm", "ws-1", "briefs", {}]);
    expect(crmCollabListOptions("ws-1", { stage: "published" }).queryKey).toEqual([
      "crm",
      "ws-1",
      "collabs",
      { stage: "published" },
    ]);
    expect(crmSettlementListOptions("ws-1", { collab_id: "c-1" }).queryKey).toEqual([
      "crm",
      "ws-1",
      "settlements",
      { collab_id: "c-1" },
    ]);
    expect(workbenchOverviewOptions("ws-1").queryKey).toEqual([
      "workbench",
      "ws-1",
      "overview",
      "all",
    ]);
    expect(workbenchCountsOptions("ws-1", "dept-1").queryKey).toEqual([
      "workbench",
      "ws-1",
      "counts",
      "dept-1",
    ]);
  });

  it("stays disabled until a workspace is known", () => {
    expect(workbenchOverviewOptions("").enabled).toBe(false);
    expect(crmClientListOptions("").enabled).toBe(false);
    expect(workbenchOverviewOptions("ws-1").enabled).toBe(true);
  });
});
