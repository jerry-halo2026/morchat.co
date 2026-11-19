// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { BdActivity, Creator } from "@morechat/core/types";
import {
  creatorMonthCounts,
  dueFollowups,
  inSameMonth,
  monthClock,
  overdueDays,
} from "./model";

/**
 * The cockpit's three rules, pinned without a renderer:
 *
 *   - 本月 is the reader's local calendar month, including the hours a UTC
 *     comparison would move into the neighbouring month;
 *   - 逾期 is a difference of local calendar days, so a follow-up due at 23:00
 *     yesterday is one day late at 00:30 today;
 *   - a follow-up obligation is the newest row per creator.
 */

const NOW = new Date(2026, 10, 18, 15, 0, 0);

function activity(overrides: Partial<BdActivity> & Pick<BdActivity, "id" | "creator_id">): BdActivity {
  return {
    workspace_id: "ws-1",
    kind: "dm",
    happened_at: "2026-11-17T02:00:00Z",
    summary: "s",
    outcome: null,
    next_follow_at: null,
    owner_member_id: null,
    created_by: null,
    created_at: "2026-11-17T02:00:00Z",
    updated_at: "2026-11-17T02:00:00Z",
    ...overrides,
  };
}

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
    created_at: "2026-10-01T02:00:00Z",
    updated_at: "2026-10-01T02:00:00Z",
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

describe("monthClock", () => {
  it("says which day of the month it is and how many are left", () => {
    expect(monthClock(NOW)).toEqual({ dayOfMonth: 18, daysLeft: 12 });
    expect(monthClock(new Date(2026, 10, 30, 23, 59))).toEqual({ dayOfMonth: 30, daysLeft: 0 });
    expect(monthClock(new Date(2024, 1, 1, 0, 0))).toEqual({ dayOfMonth: 1, daysLeft: 28 });
  });
});

describe("inSameMonth", () => {
  it("reads the timestamp in the reader's month, not in UTC", () => {
    // 2026-11-01T00:30+08:00 is still October in UTC; a Shanghai reader's
    // November starts here.
    expect(inSameMonth("2026-10-31T16:30:00Z", NOW)).toBe(true);
    expect(inSameMonth("2026-10-31T15:30:00Z", NOW)).toBe(false);
    expect(inSameMonth("not a date", NOW)).toBe(false);
  });
});

describe("overdueDays", () => {
  it("counts local calendar days, so a late-evening due date is one day old", () => {
    expect(overdueDays(new Date(2026, 10, 18, 9, 0).toISOString(), NOW)).toBe(0);
    expect(overdueDays(new Date(2026, 10, 17, 23, 0).toISOString(), NOW)).toBe(1);
    expect(overdueDays(new Date(2026, 10, 15, 0, 1).toISOString(), NOW)).toBe(3);
  });
});

describe("dueFollowups", () => {
  it("takes the newest row per creator and drops the answered older one", () => {
    const rows = dueFollowups(
      [
        // Older row of the same creator: still says "call again on the 16th",
        // answered by the row below.
        activity({
          id: "a-old",
          creator_id: "c-1",
          happened_at: "2026-11-10T02:00:00Z",
          next_follow_at: new Date(2026, 10, 16, 10, 0).toISOString(),
        }),
        activity({
          id: "a-new",
          creator_id: "c-1",
          happened_at: "2026-11-17T02:00:00Z",
          next_follow_at: new Date(2026, 10, 18, 10, 0).toISOString(),
        }),
        // Scheduled ahead: not due.
        activity({
          id: "a-later",
          creator_id: "c-2",
          next_follow_at: new Date(2026, 10, 20, 10, 0).toISOString(),
        }),
        // A note with no next call.
        activity({ id: "a-note", creator_id: "c-3", next_follow_at: null }),
      ],
      NOW,
    );

    expect(rows.map((row) => row.activity.id)).toEqual(["a-new"]);
    expect(rows[0]!.overdueDays).toBe(0);
  });

  it("orders the queue by how late it is, newest first inside a day", () => {
    const rows = dueFollowups(
      [
        activity({
          id: "a-1",
          creator_id: "c-1",
          happened_at: "2026-11-16T02:00:00Z",
          next_follow_at: new Date(2026, 10, 17, 10, 0).toISOString(),
        }),
        activity({
          id: "a-2",
          creator_id: "c-2",
          happened_at: "2026-11-14T02:00:00Z",
          next_follow_at: new Date(2026, 10, 14, 10, 0).toISOString(),
        }),
        activity({
          id: "a-3",
          creator_id: "c-3",
          happened_at: "2026-11-15T02:00:00Z",
          next_follow_at: new Date(2026, 10, 17, 10, 0).toISOString(),
        }),
      ],
      NOW,
    );

    // c-2 is four days late, then the two one-day-late creators in the order
    // their newest rows were logged.
    expect(rows.map((row) => row.activity.id)).toEqual(["a-2", "a-1", "a-3"]);
    expect(rows.map((row) => row.overdueDays)).toEqual([4, 1, 1]);
  });
});

describe("creatorMonthCounts", () => {
  it("counts this month's joins and this month's signed/deal creators", () => {
    const counts = creatorMonthCounts(
      [
        creator({
          id: "c-1",
          created_at: "2026-11-02T02:00:00Z",
          cooperation_intent: "signed",
          updated_at: "2026-11-05T02:00:00Z",
        }),
        creator({ id: "c-2", created_at: "2026-11-10T02:00:00Z" }),
        creator({
          id: "c-3",
          created_at: "2026-10-02T02:00:00Z",
          cooperation_intent: "deal",
          updated_at: "2026-10-30T02:00:00Z",
        }),
        creator({
          id: "c-4",
          cooperation_intent: "quoted",
          updated_at: "2026-11-11T02:00:00Z",
        }),
      ],
      NOW,
      true,
    );

    expect(counts).toEqual({ newThisMonth: 2, signedThisMonth: 1 });
  });

  it("answers null rather than a partial count when the ledger was not fully read", () => {
    expect(creatorMonthCounts([creator({ id: "c-1" })], NOW, false)).toEqual({
      newThisMonth: null,
      signedThisMonth: null,
    });
  });

  it("counts a settled zero when the whole ledger is empty", () => {
    expect(creatorMonthCounts([], NOW, true)).toEqual({ newThisMonth: 0, signedThisMonth: 0 });
  });
});
