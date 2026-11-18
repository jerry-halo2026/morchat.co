import { describe, expect, it } from "vitest";
import {
  creatorHealthDetailOptions,
  creatorHealthOptions,
  creatorDetailOptions,
  creatorKeys,
  creatorListOptions,
  creatorPostMetricsOptions,
  creatorPostsOptions,
} from "./queries";

function isUnder(key: readonly unknown[], prefix: readonly unknown[]): boolean {
  return prefix.every((part, index) => Object.is(part, key[index]));
}

describe("creator query keys (contract §5)", () => {
  it("writes ['creator', wsId, filters]", () => {
    expect(creatorKeys.list("ws-1", {})).toEqual(["creator", "ws-1", {}]);
    expect(creatorKeys.list("ws-1", { kind: "external", q: "one" })).toEqual([
      "creator",
      "ws-1",
      { kind: "external", q: "one" },
    ]);
  });

  it("writes ['creator', wsId, 'posts', filters]", () => {
    expect(creatorKeys.posts("ws-1", {})).toEqual(["creator", "ws-1", "posts", {}]);
    expect(creatorKeys.posts("ws-1", { creator_id: "c-1", from: "2026-01-01" })).toEqual([
      "creator",
      "ws-1",
      "posts",
      { creator_id: "c-1", from: "2026-01-01" },
    ]);
  });

  it("keeps the two filters apart: a post list never shares a key with a creator list", () => {
    expect(creatorKeys.list("ws-1", { q: "one" })).not.toEqual(
      creatorKeys.posts("ws-1", { creator_id: "c-1" }),
    );
  });

  it("nests detail and metric reads under the domain prefix the mutations invalidate", () => {
    expect(creatorKeys.detail("ws-1", "c-1")).toEqual(["creator", "ws-1", { id: "c-1" }]);
    expect(creatorKeys.postMetrics("ws-1", "p-1")).toEqual([
      "creator",
      "ws-1",
      "posts",
      { post_id: "p-1" },
      "metrics",
    ]);

    for (const key of [
      creatorKeys.list("ws-1", {}),
      creatorKeys.detail("ws-1", "c-1"),
      creatorKeys.posts("ws-1", {}),
      creatorKeys.postMetrics("ws-1", "p-1"),
    ]) {
      expect(isUnder(key, creatorKeys.all("ws-1"))).toBe(true);
    }
    expect(isUnder(creatorKeys.postMetrics("ws-2", "p-1"), creatorKeys.all("ws-1"))).toBe(false);
  });

  it("builds options on those keys, with wsId in position 1", () => {
    expect(creatorListOptions("ws-1", { kind: "owned" }).queryKey).toEqual([
      "creator",
      "ws-1",
      { kind: "owned" },
    ]);
    expect(creatorDetailOptions("ws-1", "c-1").queryKey[1]).toBe("ws-1");
    expect(creatorPostsOptions("ws-1", { creator_id: "c-1" }).queryKey).toEqual([
      "creator",
      "ws-1",
      "posts",
      { creator_id: "c-1" },
    ]);
    expect(creatorPostMetricsOptions("ws-1", "p-1").queryKey).toEqual([
      "creator",
      "ws-1",
      "posts",
      { post_id: "p-1" },
      "metrics",
    ]);
  });

  it("stays disabled until both the workspace and the row id are known", () => {
    expect(creatorListOptions("").enabled).toBe(false);
    expect(creatorDetailOptions("", "c-1").enabled).toBe(false);
    expect(creatorDetailOptions("ws-1", "").enabled).toBe(false);
    expect(creatorPostMetricsOptions("ws-1", "").enabled).toBe(false);
    expect(creatorPostMetricsOptions("ws-1", "p-1").enabled).toBe(true);
  });

  it("nests content health under the same domain prefix (contract §19)", () => {
    expect(creatorKeys.health("ws-1", { sort: "engagement" })).toEqual([
      "creator",
      "ws-1",
      "health",
      { sort: "engagement" },
    ]);
    expect(creatorKeys.healthDetail("ws-1", "c-1")).toEqual(["creator", "ws-1", { id: "c-1" }, "health"]);

    for (const key of [
      creatorKeys.health("ws-1", {}),
      creatorKeys.healthDetail("ws-1", "c-1"),
    ]) {
      expect(isUnder(key, creatorKeys.all("ws-1"))).toBe(true);
    }
    // A board key must not collide with a creator-list key: the list filters are
    // objects too, and sharing a cache entry between them would show health rows
    // on the creator screen.
    expect(creatorKeys.health("ws-1", {})).not.toEqual(creatorKeys.list("ws-1", {}));
    expect(creatorHealthOptions("ws-1", {}).enabled).toBe(true);
    expect(creatorHealthOptions("").enabled).toBe(false);
    expect(creatorHealthDetailOptions("ws-1", "").enabled).toBe(false);
  });
});
