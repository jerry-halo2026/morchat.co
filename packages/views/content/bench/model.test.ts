// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { MediaBench } from "@morechat/core/types";
import {
  adoptBenchDraft,
  adoptBenchPayload,
  benchDraftFrom,
  createBenchPayload,
  emptyBenchDraft,
  formatMetricValue,
  isAdoptable,
  isBenchMetricKey,
  metricEntries,
  metricsText,
  parseMetricsText,
  sortBench,
  updateBenchPayload,
} from "./model";

/**
 * The teardown's pure half. The behaviours pinned here are the two loose columns
 * (`metrics` is free-form JSONB, `follower_count` is nullable) plus the write
 * shapes: an unknown metric key is listed and never dropped, a missing follower
 * count stays `null`, and `metrics` is replaced whole rather than merged.
 */

function bench(overrides: Partial<MediaBench> = {}): MediaBench {
  return {
    id: "b-1",
    workspace_id: "ws-1",
    ip_id: "ip-a",
    platform: "xiaohongshu",
    name: "厨房笔记",
    url: "https://www.xiaohongshu.com/user/profile/abc",
    follower_count: 128000,
    metrics: { plays: 52000, likes: 1200, favorites: 800, comments: 96 },
    captured_on: "2026-11-18",
    note: null,
    owner_member_id: null,
    created_by: null,
    created_at: "2026-11-18T02:00:00Z",
    updated_at: "2026-11-18T02:00:00Z",
    archived_at: null,
    ...overrides,
  };
}

describe("metricEntries", () => {
  it("leads with the keys this build names, in reading order", () => {
    const entries = metricEntries({ comments: 3, likes: 10, plays: 1000 });

    expect(entries.map((entry) => entry.key)).toEqual(["plays", "likes", "comments"]);
    expect(entries.map((entry) => entry.label)).toEqual(["plays", "likes", "comments"]);
  });

  it("lists an unknown key raw, after the known ones", () => {
    const entries = metricEntries({ zhang: 40, likes: 10, plays: "52000" });

    expect(entries.map((entry) => entry.key)).toEqual(["plays", "likes", "zhang"]);
    expect(entries[2]).toEqual({ key: "zhang", label: null, value: 40 });
  });

  it("skips a key with no value instead of drawing an empty cell", () => {
    const entries = metricEntries({ plays: null, likes: 10, shares: undefined });
    expect(entries.map((entry) => entry.key)).toEqual(["likes"]);
  });

  it("is empty for an account nothing was measured on", () => {
    expect(metricEntries({})).toEqual([]);
  });

  it("knows exactly the five keys it has a label for", () => {
    expect(isBenchMetricKey("plays")).toBe(true);
    expect(isBenchMetricKey("collects")).toBe(false);
  });
});

describe("formatMetricValue", () => {
  it("groups a number, and leaves a string alone", () => {
    expect(formatMetricValue(52000, "en")).toBe("52,000");
    expect(formatMetricValue("52k", "en")).toBe("52k");
    expect(formatMetricValue(true, "en")).toBe("true");
  });
});

describe("metrics text", () => {
  it("round-trips through the textarea", () => {
    const metrics = { plays: 52000, likes: 1200, note: "偏收藏型" };
    expect(parseMetricsText(metricsText(metrics))).toEqual(metrics);
  });

  it("coerces a number, keeps the rest as text, and skips a line with no key", () => {
    expect(parseMetricsText("plays: 52000\nlikes=1200\nweird\n\nrate: 3.5%")).toEqual({
      plays: 52000,
      likes: 1200,
      rate: "3.5%",
    });
  });
});

describe("the form payloads", () => {
  it("creates an account, sending an empty follower count as null", () => {
    const draft = {
      ...emptyBenchDraft("2026-11-18", "ip-a"),
      name: " 厨房笔记 ",
      platform: "xiaohongshu",
      metrics: "plays: 52000",
    };

    expect(createBenchPayload(draft)).toEqual({
      name: "厨房笔记",
      platform: "xiaohongshu",
      ip_id: "ip-a",
      url: null,
      follower_count: null,
      metrics: { plays: 52000 },
      captured_on: "2026-11-18",
    });
  });

  it("leaves ip_id off for an industry-wide benchmark", () => {
    const draft = { ...emptyBenchDraft("2026-11-18", ""), name: "A", platform: "douyin" };
    expect(createBenchPayload(draft)).not.toHaveProperty("ip_id");
  });

  it("refuses an account with no name or no platform", () => {
    expect(createBenchPayload({ ...emptyBenchDraft("2026-11-18", ""), platform: "douyin" })).toBeNull();
  });

  it("replaces metrics whole, and sends only what changed", () => {
    const row = bench();
    const draft = { ...benchDraftFrom(row), metrics: "plays: 61000\nlikes: 1200\nfavorites: 800\ncomments: 96" };

    expect(updateBenchPayload(draft, row)).toEqual({
      metrics: { plays: 61000, likes: 1200, favorites: 800, comments: 96 },
    });
  });

  it("clears followers with null and a note with an empty string", () => {
    const row = bench({ note: "旧备注" });
    const draft = { ...benchDraftFrom(row), followers: "", note: "" };

    expect(updateBenchPayload(draft, row)).toEqual({ follower_count: null, note: "" });
  });

  it("never sends ip_id to detach a benchmark that already has one", () => {
    const row = bench();
    const draft = { ...benchDraftFrom(row), ipId: "" };
    // The request type has no null for `ip_id`, so a cleared select keeps the IP.
    expect(updateBenchPayload(draft, row)).toEqual({});
  });
});

describe("sortBench", () => {
  it("puts the newest capture first, then sorts by name for one day", () => {
    const rows = [
      bench({ id: "b", name: "Beta", captured_on: "2026-11-18" }),
      bench({ id: "a", name: "Alpha", captured_on: "2026-11-18" }),
      bench({ id: "old", name: "Zeta", captured_on: "2026-11-16" }),
    ];

    expect(sortBench(rows).map((row) => row.id)).toEqual(["a", "b", "old"]);
  });
});

describe("adopting", () => {
  it("opens on the account's name and its own IP", () => {
    expect(adoptBenchDraft(bench({ name: "厨房笔记", ip_id: "ip-b" }), "ip-a")).toEqual({
      ipId: "ip-b",
      title: "厨房笔记",
    });
    // An industry-wide benchmark falls back to the page's IP.
    expect(adoptBenchDraft(bench({ ip_id: null }), "ip-a")).toEqual({
      ipId: "ip-a",
      title: "厨房笔记",
    });
  });

  it("omits an untouched title, sends a rewritten one", () => {
    const row = bench({ name: "厨房笔记" });

    expect(adoptBenchPayload(row, { ipId: "ip-a", title: "厨房笔记" })).toEqual({ ip_id: "ip-a" });
    expect(adoptBenchPayload(row, { ipId: "ip-a", title: " 一锅出三种吃法 " })).toEqual({
      ip_id: "ip-a",
      title: "一锅出三种吃法",
    });
  });

  it("cannot adopt without an IP or a title", () => {
    const row = bench();
    expect(adoptBenchPayload(row, { ipId: "", title: "x" })).toBeNull();
    expect(adoptBenchPayload(row, { ipId: "ip-a", title: " " })).toBeNull();
  });

  it("stops offering adoption once this session adopted the row", () => {
    const row = bench();
    expect(isAdoptable(row, null)).toBe(true);
    expect(isAdoptable(row, { topicId: "t-1", ipId: "ip-a" })).toBe(false);
  });
});
