// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { CreatorPostMetric, CreatorVideo } from "@morechat/core/types";
import {
  fieldCoverage,
  figureState,
  latestSnapshot,
  METRIC_FIELDS,
  metricCoverage,
  numberOrNull,
  sortSnapshots,
  todayKey,
  VIDEO_COUNTER_FIELDS,
  videoCoverage,
  videoTitle,
} from "./model";

/**
 * The two rules the data page turns on, tested without a renderer.
 *
 * 1. **NULL ≠ 0** (WORKBENCH-DATA-CONTRACT §2). Three states, and a cell that
 *    prints the same thing for a missing reading and a real zero would erase the
 *    difference the contract was written to protect.
 * 2. **A measure no row answers for is not a column.** It is dropped and named
 *    instead, so the absence stays a fact instead of a wall of placeholders.
 */

const WS = "ws-1";

function metric(
  overrides: Partial<CreatorPostMetric> & Pick<CreatorPostMetric, "id" | "captured_on">,
): CreatorPostMetric {
  return {
    workspace_id: WS,
    post_id: "post-1",
    play: null,
    likes: null,
    comments: null,
    shares: null,
    clicks: null,
    converts: null,
    gmv_amount: null,
    currency: "CNY",
    source: "manual",
    created_at: "2026-11-18T02:00:00Z",
    updated_at: "2026-11-18T02:00:00Z",
    ...overrides,
  };
}

function video(
  overrides: Partial<CreatorVideo> & Pick<CreatorVideo, "id">,
): CreatorVideo {
  return {
    workspace_id: WS,
    creator_id: "c-1",
    aweme_id: overrides.id,
    desc_text: null,
    topics: [],
    create_time: "2026-11-01T09:00:00Z",
    duration_ms: null,
    digg_count: null,
    comment_count: null,
    share_count: null,
    play_count: null,
    cover_url: null,
    video_url: null,
    stats_collected_at: null,
    source_system: null,
    source_id: null,
    created_at: "2026-11-01T09:00:00Z",
    updated_at: "2026-11-01T09:00:00Z",
    archived_at: null,
    ...overrides,
  };
}

describe("figureState", () => {
  it("keeps a missing reading, a zero and a number apart", () => {
    expect(figureState(null)).toBe("insufficient_data");
    expect(figureState(undefined)).toBe("insufficient_data");
    expect(figureState(0)).toBe("zero");
    expect(figureState(1)).toBe("value");
    expect(figureState(12_345)).toBe("value");
  });

  it("treats a value that is not a number as missing, not as a reading", () => {
    expect(figureState(Number.NaN)).toBe("insufficient_data");
    expect(figureState(Number.POSITIVE_INFINITY)).toBe("insufficient_data");
  });
});

describe("metricCoverage", () => {
  it("keeps a column that some day answers for, even when most days do not", () => {
    const coverage = metricCoverage([
      metric({ id: "m-1", captured_on: "2026-11-17", play: 1200, likes: 0 }),
      metric({ id: "m-2", captured_on: "2026-11-18", play: 1500 }),
    ]);

    expect(coverage.columns).toEqual(["play", "likes"]);
    expect(coverage.missing).toEqual(["comments", "shares", "clicks", "converts"]);
  });

  it("drops every column when nothing was collected yet", () => {
    const coverage = metricCoverage([metric({ id: "m-1", captured_on: "2026-11-18" })]);

    expect(coverage.columns).toEqual([]);
    expect(coverage.missing).toEqual([...METRIC_FIELDS]);
  });

  it("names a field the response never carries at all as missing", () => {
    // An older response: the key is absent rather than null. `undefined` is not
    // a reading, so the column is dropped — the page prints a dash, not a zero.
    const coverage = fieldCoverage<{ play: number; likes?: number | null }, "play" | "likes">(
      [{ play: 40 }],
      ["play", "likes"],
      (row, field) => row[field],
    );

    expect(coverage.columns).toEqual(["play"]);
    expect(coverage.missing).toEqual(["likes"]);
  });

  it("does not count a zero as an unanswered column", () => {
    const coverage = fieldCoverage(
      [{ play: 0 }, { play: null }],
      ["play"] as const,
      (row) => row.play,
    );

    expect(coverage.columns).toEqual(["play"]);
    expect(coverage.missing).toEqual([]);
  });
});

describe("videoCoverage", () => {
  it("keeps the four counters when the mirror carries them", () => {
    const coverage = videoCoverage([
      video({ id: "v-1", play_count: 900, digg_count: 12, comment_count: 0, share_count: 1 }),
    ]);

    expect(coverage.columns).toEqual([...VIDEO_COUNTER_FIELDS]);
    expect(coverage.missing).toEqual([]);
  });

  it("reports plays as missing for a mirror that never collected them", () => {
    const coverage = videoCoverage([
      video({ id: "v-1", digg_count: 12, comment_count: 3, share_count: 1 }),
      video({ id: "v-2", digg_count: 4, comment_count: 0, share_count: 0 }),
    ]);

    expect(coverage.columns).toEqual(["digg_count", "comment_count", "share_count"]);
    expect(coverage.missing).toEqual(["play_count"]);
  });
});

describe("sortSnapshots", () => {
  it("runs the series oldest day first", () => {
    const ordered = sortSnapshots([
      metric({ id: "m-3", captured_on: "2026-11-18" }),
      metric({ id: "m-1", captured_on: "2026-11-16" }),
      metric({ id: "m-2", captured_on: "2026-11-17" }),
    ]);

    expect(ordered.map((row) => row.id)).toEqual(["m-1", "m-2", "m-3"]);
    expect(latestSnapshot(ordered)?.id).toBe("m-3");
    expect(latestSnapshot([])).toBeNull();
  });
});

describe("form helpers", () => {
  it("stores a blank field as not collected, never as zero", () => {
    expect(numberOrNull("")).toBeNull();
    expect(numberOrNull("   ")).toBeNull();
    expect(numberOrNull("nope")).toBeNull();
    expect(numberOrNull("0")).toBe(0);
    expect(numberOrNull(" 1200 ")).toBe(1200);
  });

  it("names a work by its description's first line, else by its aweme id", () => {
    expect(videoTitle(video({ id: "v-1", desc_text: "今天聊三个坑\n第二行" }))).toBe(
      "今天聊三个坑",
    );
    expect(videoTitle(video({ id: "v-2", aweme_id: "7449", desc_text: "   " }))).toBe("7449");
  });

  it("reads today from the viewer's clock", () => {
    expect(todayKey(new Date(2026, 10, 18, 23, 30))).toBe("2026-11-18");
  });
});
