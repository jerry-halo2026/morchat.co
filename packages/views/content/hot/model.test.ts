// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { MediaHot, MediaTopic } from "@morechat/core/types";
import {
  adoptedTopicIndex,
  adoptHotDraft,
  adoptHotPayload,
  compareHot,
  createHotPayload,
  emptyHotDraft,
  groupHotByDay,
  hotDraftFrom,
  localDay,
  parseCount,
  updateHotPayload,
} from "./model";

/**
 * The radar's pure half. Three behaviours are pinned here because none of them is
 * visible in a screenshot and each of them is a contract rather than a taste:
 *
 * - the day bands run newest-first, and a day's rows are ordered rank-then-heat;
 * - the order is **total**, so a list re-read from the same rows cannot reshuffle;
 * - `null` survives the round trip: an unranked / unmeasured capture is never
 *   written back as 0, and clearing a column sends `null` (which the endpoint
 *   reads as "clear"), not an omission (which reads as "keep").
 */

function hot(overrides: Partial<MediaHot> = {}): MediaHot {
  return {
    id: "h-1",
    workspace_id: "ws-1",
    title: "打工人用 AI 写周报被领导发现",
    platform: "douyin",
    url: null,
    rank: 1,
    heat_value: 3200000,
    category: "职场",
    captured_on: "2026-11-18",
    source: "manual",
    note: null,
    owner_member_id: null,
    created_by: null,
    created_at: "2026-11-18T02:00:00Z",
    updated_at: "2026-11-18T02:00:00Z",
    archived_at: null,
    ...overrides,
  };
}

function topic(overrides: Partial<MediaTopic> = {}): MediaTopic {
  return {
    id: "t-1",
    workspace_id: "ws-1",
    ip_id: "ip-a",
    title: "周报这件小事",
    source: "hot",
    scores: { pain: 0, save: 0, debate: 0, susp: 0, fit: 0 },
    status: "pool",
    hot_id: null,
    note: null,
    owner_member_id: null,
    created_by: null,
    created_at: "2026-11-18T03:00:00Z",
    updated_at: "2026-11-18T03:00:00Z",
    archived_at: null,
    ...overrides,
  };
}

describe("groupHotByDay", () => {
  it("bands by capture day with the newest day first", () => {
    const groups = groupHotByDay([
      hot({ id: "h-old", captured_on: "2026-11-16" }),
      hot({ id: "h-new", captured_on: "2026-11-18" }),
      hot({ id: "h-mid", captured_on: "2026-11-17" }),
      hot({ id: "h-new-2", captured_on: "2026-11-18", rank: 2 }),
    ]);

    expect(groups.map((group) => group.day)).toEqual([
      "2026-11-18",
      "2026-11-17",
      "2026-11-16",
    ]);
    expect(groups[0]?.rows.map((row) => row.id)).toEqual(["h-new", "h-new-2"]);
    expect(groups[2]?.rows.map((row) => row.id)).toEqual(["h-old"]);
  });

  it("orders a day by rank, then by heat", () => {
    const groups = groupHotByDay([
      hot({ id: "rank-3", rank: 3, heat_value: 900 }),
      hot({ id: "rank-1-cold", rank: 1, heat_value: 100 }),
      hot({ id: "rank-1-hot", rank: 1, heat_value: 5000 }),
      hot({ id: "rank-2", rank: 2, heat_value: 4000 }),
    ]);

    expect(groups[0]?.rows.map((row) => row.id)).toEqual([
      "rank-1-hot",
      "rank-1-cold",
      "rank-2",
      "rank-3",
    ]);
  });

  it("puts an unranked capture after every ranked one, and an unmeasured one after every measured one", () => {
    const groups = groupHotByDay([
      hot({ id: "no-rank", rank: null, heat_value: 99999999 }),
      hot({ id: "ranked", rank: 9, heat_value: null }),
      hot({ id: "ranked-heat", rank: 10, heat_value: 10 }),
    ]);

    expect(groups[0]?.rows.map((row) => row.id)).toEqual([
      "ranked",
      "ranked-heat",
      "no-rank",
    ]);
    // The unranked row is last even though its heat is the largest number here:
    // rank is the primary order, and "no position" is not "position 0".
    expect(groups[0]?.rows.at(-1)?.id).toBe("no-rank");
  });
});

describe("compareHot", () => {
  it("breaks a full tie on the capture time, then on the id", () => {
    const early = hot({ id: "b", rank: 1, heat_value: 10, created_at: "2026-11-18T01:00:00Z" });
    const late = hot({ id: "a", rank: 1, heat_value: 10, created_at: "2026-11-18T02:00:00Z" });
    const sameTime = hot({ id: "c", rank: 1, heat_value: 10, created_at: "2026-11-18T02:00:00Z" });

    expect(compareHot(early, late)).toBeLessThan(0);
    expect(compareHot(late, sameTime)).toBeLessThan(0);
    expect(compareHot(sameTime, sameTime)).toBe(0);
  });

  it("is a total order: any input order gives the same result", () => {
    const rows = [
      hot({ id: "c", rank: 2, heat_value: 10 }),
      hot({ id: "a", rank: 2, heat_value: 10 }),
      hot({ id: "b", rank: 1, heat_value: 5 }),
      hot({ id: "d", rank: 2, heat_value: 10, created_at: "2026-11-18T01:00:00Z" }),
      hot({ id: "e", rank: null, heat_value: null }),
    ];
    const expected = ["b", "d", "a", "c", "e"];

    const forwards = [...rows].sort(compareHot).map((row) => row.id);
    const backwards = [...rows].reverse().sort(compareHot).map((row) => row.id);

    expect(forwards).toEqual(expected);
    expect(backwards).toEqual(expected);
  });
});

describe("adoptedTopicIndex", () => {
  it("indexes only topics adopted from the radar, by their hot id", () => {
    const index = adoptedTopicIndex([
      topic({ id: "t-1", hot_id: "h-1", ip_id: "ip-a" }),
      // Not from the radar: no hot id to key on.
      topic({ id: "t-2", source: "manual", hot_id: null }),
      // From the radar, but the source row is gone: still a real topic.
      topic({ id: "t-3", hot_id: "h-gone", ip_id: "ip-b" }),
    ]);

    expect(index.get("h-1")).toEqual({ topicId: "t-1", ipId: "ip-a" });
    expect(index.get("h-gone")).toEqual({ topicId: "t-3", ipId: "ip-b" });
    expect(index.has("")).toBe(false);
    expect(index.size).toBe(2);
  });

  it("keeps the first topic when one capture was adopted twice", () => {
    const index = adoptedTopicIndex([
      topic({ id: "t-old", hot_id: "h-1" }),
      topic({ id: "t-new", hot_id: "h-1", ip_id: "ip-b" }),
    ]);

    expect(index.get("h-1")).toEqual({ topicId: "t-old", ipId: "ip-a" });
  });
});

describe("the form payloads", () => {
  it("reads an empty or unparseable count as not collected", () => {
    expect(parseCount("")).toBeNull();
    expect(parseCount("   ")).toBeNull();
    expect(parseCount("abc")).toBeNull();
    expect(parseCount("-3")).toBeNull();
    expect(parseCount(" 42 ")).toBe(42);
  });

  it("creates a capture without inventing a rank or a heat figure", () => {
    const draft = { ...emptyHotDraft("2026-11-18"), title: "  立冬吃饺子 ", platform: "xiaohongshu" };

    expect(createHotPayload(draft)).toEqual({
      title: "立冬吃饺子",
      platform: "xiaohongshu",
      url: null,
      rank: null,
      heat_value: null,
      captured_on: "2026-11-18",
    });
  });

  it("refuses a capture with no title or no platform", () => {
    expect(createHotPayload({ ...emptyHotDraft("2026-11-18"), platform: "douyin" })).toBeNull();
    expect(createHotPayload({ ...emptyHotDraft("2026-11-18"), title: "x" })).toBeNull();
  });

  it("sends only the fields that changed, and clears a column with null", () => {
    const row = hot({ rank: 4, heat_value: 1200, url: "https://example.test/hot", note: "旧备注" });
    const draft = {
      ...hotDraftFrom(row),
      // Emptied boxes: the operator is saying the platform published none.
      rank: "",
      heat: "",
      url: "",
      note: "",
    };

    expect(updateHotPayload(draft, row)).toEqual({
      url: null,
      rank: null,
      heat_value: null,
      note: "",
    });
    expect(hotDraftFrom(row).rank).toBe("4");
  });

  it("sends nothing when nothing changed", () => {
    const row = hot({ note: "记一笔" });
    expect(updateHotPayload(hotDraftFrom(row), row)).toEqual({});
  });
});

describe("adopting", () => {
  it("opens on the capture's own title and the page's IP", () => {
    expect(adoptHotDraft(hot({ title: "周报" }), "ip-a")).toEqual({ ipId: "ip-a", title: "周报" });
    expect(adoptHotDraft(hot({ title: "周报" }), null)).toEqual({ ipId: "", title: "周报" });
  });

  it("omits a title the operator left alone, and sends a rewritten one", () => {
    const row = hot({ title: "周报被领导发现" });

    expect(adoptHotPayload(row, { ipId: "ip-a", title: "周报被领导发现" })).toEqual({
      ip_id: "ip-a",
    });
    expect(adoptHotPayload(row, { ipId: "ip-a", title: " 周报这件小事 " })).toEqual({
      ip_id: "ip-a",
      title: "周报这件小事",
    });
  });

  it("cannot adopt without an IP or a title", () => {
    const row = hot();
    expect(adoptHotPayload(row, { ipId: "", title: "x" })).toBeNull();
    expect(adoptHotPayload(row, { ipId: "ip-a", title: "   " })).toBeNull();
  });
});

describe("localDay", () => {
  it("reads the calendar day off the reader's clock", () => {
    expect(localDay(new Date(2026, 10, 8, 23, 30))).toBe("2026-11-08");
    expect(localDay(new Date(2026, 0, 1, 0, 5))).toBe("2026-01-01");
  });
});
