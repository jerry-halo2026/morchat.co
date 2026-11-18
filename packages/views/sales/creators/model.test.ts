// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { Creator } from "@morechat/core/types";
import {
  activeFilterCount,
  bandFacets,
  fansBand,
  filterCreators,
  followupTiming,
  latestFollowups,
  NO_CREATOR_FILTERS,
  profileUrl,
  quoteBounds,
  regionFacets,
  type CreatorFilters,
} from "./model";

/**
 * The ledger's arithmetic, without a renderer.
 *
 * Three rules are worth pinning because they are off-by-one traps rather than
 * preferences: a follower band is half-open at its bottom edge, `quoteBounds` is one
 * figure when both ends agree, and "newest follow-up per creator" is the first row the
 * server's `happened_at DESC` order offers — not the row with the largest
 * `next_follow_at`.
 */

function creator(overrides: Partial<Creator> & Pick<Creator, "id">): Creator {
  return {
    workspace_id: "ws-1",
    kind: "external",
    display_name: overrides.id,
    platform: "douyin",
    handle: overrides.id,
    url: null,
    fans: 0,
    fans_d7: 0,
    avg_play: 0,
    engagement_rate: null,
    category: null,
    audience_note: null,
    region: null,
    price_note: null,
    score: null,
    risk_flag: false,
    blacklist_reason: null,
    owner_member_id: null,
    media_ip_project_id: null,
    created_by: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    archived_at: null,
    sec_uid: null,
    douyin_id: null,
    dy_uid: null,
    fans_display: null,
    quote_min: null,
    quote_max: null,
    cooperation_intent: null,
    lead_status: null,
    last_dm_at: null,
    likes_total: null,
    following_count: null,
    verify_type: null,
    tags: [],
    source_type: null,
    source_keyword: null,
    source_rank: null,
    source_system: null,
    source_id: null,
    ...overrides,
  };
}

function filters(overrides: Partial<CreatorFilters>): CreatorFilters {
  return { ...NO_CREATOR_FILTERS, ...overrides };
}

describe("fansBand", () => {
  it("puts each boundary in the band that starts there", () => {
    expect(fansBand(9_999)).toBe("under_10k");
    expect(fansBand(10_000)).toBe("from_10k");
    expect(fansBand(99_999)).toBe("from_10k");
    expect(fansBand(100_000)).toBe("from_100k");
    expect(fansBand(499_999)).toBe("from_100k");
    expect(fansBand(500_000)).toBe("from_500k");
  });
});

describe("filterCreators", () => {
  const rows = [
    creator({ id: "a", fans: 26_000, cooperation_intent: "signed", region: "杭州" }),
    creator({ id: "b", fans: 800, cooperation_intent: "not_contacted", region: "杭州" }),
    creator({ id: "c", fans: 120_000, lead_status: "LEAD_NEW" }),
  ];

  it("never excludes a row whose dimension is unset", () => {
    // `c` has no region and no cooperation stage; both are "unknown", and an
    // unfiltered view must still show it.
    expect(filterCreators(rows, NO_CREATOR_FILTERS, "").map((row) => row.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("narrows on one dimension at a time", () => {
    expect(filterCreators(rows, filters({ intent: "signed" }), "").map((row) => row.id)).toEqual([
      "a",
    ]);
    expect(filterCreators(rows, filters({ band: "from_100k" }), "").map((row) => row.id)).toEqual([
      "c",
    ]);
    expect(filterCreators(rows, filters({ region: "杭州" }), "").map((row) => row.id)).toEqual([
      "a",
      "b",
    ]);
  });

  it("searches the identifiers a BD person pastes, not just the name", () => {
    const messy = [
      creator({ id: "d", display_name: "Zheng Ting", douyin_id: "dy_777" }),
      creator({ id: "e", display_name: "Other", sec_uid: "MS4wLjABAAAA" }),
      creator({ id: "f", display_name: "Third", source_keyword: "母婴 好物" }),
    ];
    expect(filterCreators(messy, NO_CREATOR_FILTERS, "dy_777").map((row) => row.id)).toEqual(["d"]);
    expect(filterCreators(messy, NO_CREATOR_FILTERS, "ms4wljab").map((row) => row.id)).toEqual([
      "e",
    ]);
    expect(filterCreators(messy, NO_CREATOR_FILTERS, " 好物 ").map((row) => row.id)).toEqual(["f"]);
  });

  it("counts the dimensions that are on", () => {
    expect(activeFilterCount(NO_CREATOR_FILTERS)).toBe(0);
    expect(activeFilterCount(filters({ intent: "signed", band: "from_10k" }))).toBe(2);
  });
});

describe("facets", () => {
  it("counts every known token, including the ones nobody carries", () => {
    const rows = [
      creator({ id: "a", fans: 26_000 }),
      creator({ id: "b", fans: 26_000, cooperation_intent: "signed" }),
    ];
    const bands = bandFacets(rows);
    expect(bands).toHaveLength(4);
    expect(bands.find((band) => band.value === "from_10k")?.count).toBe(2);
    expect(bands.find((band) => band.value === "from_500k")?.count).toBe(0);
  });

  it("lists regions by how many creators carry them", () => {
    const rows = [
      creator({ id: "a", region: "上海" }),
      creator({ id: "b", region: "杭州" }),
      creator({ id: "c", region: "杭州" }),
      creator({ id: "d", region: null }),
    ];
    expect(regionFacets(rows)).toEqual([
      { value: "杭州", count: 2 },
      { value: "上海", count: 1 },
    ]);
  });
});

describe("followupTiming", () => {
  const now = new Date(2026, 10, 18, 15, 0, 0);

  it("separates late, today and later by local calendar day", () => {
    expect(followupTiming(new Date(2026, 10, 17, 9, 0, 0).toISOString(), now)).toEqual({
      kind: "overdue",
      days: 1,
    });
    expect(followupTiming(new Date(2026, 10, 18, 8, 0, 0).toISOString(), now)).toEqual({
      kind: "due_today",
    });
    expect(followupTiming(new Date(2026, 10, 20, 9, 0, 0).toISOString(), now)).toEqual({
      kind: "upcoming",
      days: 2,
    });
    expect(followupTiming(null, now)).toBeNull();
    expect(followupTiming("not a date", now)).toBeNull();
  });
});

describe("latestFollowups", () => {
  it("keeps the first row the server offered per creator", () => {
    const newest = {
      id: "a-2",
      creator_id: "a",
      happened_at: "2026-11-17T00:00:00Z",
      next_follow_at: null,
    } as never;
    const older = {
      id: "a-1",
      creator_id: "a",
      happened_at: "2026-11-01T00:00:00Z",
      next_follow_at: "2026-11-30T00:00:00Z",
    } as never;
    const map = latestFollowups([newest, older]);
    expect(map.get("a")).toBe(newest);
    expect(map.size).toBe(1);
  });
});

describe("quoteBounds", () => {
  it("is one figure when both ends agree, and nothing when both are empty", () => {
    expect(quoteBounds(creator({ id: "a", quote_min: 3000, quote_max: 3000 }))).toEqual([3000]);
    expect(quoteBounds(creator({ id: "b", quote_min: 1000, quote_max: 5000 }))).toEqual([
      1000, 5000,
    ]);
    expect(quoteBounds(creator({ id: "c" }))).toBeNull();
  });
});

describe("profileUrl", () => {
  it("prefers the mirrored url and falls back to the sec_uid profile path", () => {
    expect(profileUrl(creator({ id: "a", url: "https://example.test/x" }))).toBe(
      "https://example.test/x",
    );
    expect(profileUrl(creator({ id: "b", sec_uid: "MS4w" }))).toBe(
      "https://www.douyin.com/user/MS4w",
    );
    expect(profileUrl(creator({ id: "c", douyin_id: "only_handle" }))).toBeNull();
  });
});
