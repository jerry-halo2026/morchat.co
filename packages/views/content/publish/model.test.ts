// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { Creator, CreatorPost, MediaScript } from "@morechat/core/types";
import {
  approvedScripts,
  creatorNameIndex,
  groupByPublishDay,
  localDateTimeValue,
  parseLocalDateTime,
  publishInstant,
  scriptTitle,
  sortPublished,
  sortScheduled,
  startOfLocalDay,
  UNSCHEDULED_KEY,
  urlHost,
} from "./model";

/**
 * The publish queue's rules, without a renderer.
 *
 * Three of them are the reason this file exists: the day grouping (a script with
 * a `publish_at` belongs to the reader's local day, and one without belongs to
 * nothing), the status filter (only an approved script is publishable), and the
 * `datetime-local` round trip (what the edit control shows and what the API is
 * sent are two different strings for the same instant).
 */

const WS = "ws-1";

function script(overrides: Partial<MediaScript> & Pick<MediaScript, "id">): MediaScript {
  return {
    workspace_id: WS,
    topic_id: `topic-${overrides.id}`,
    ip_id: null,
    version: 1,
    hook: null,
    body: null,
    cta: null,
    cover_note: null,
    tags: [],
    status: "approved",
    publish_at: null,
    owner_member_id: null,
    created_by: null,
    created_at: "2026-11-01T02:00:00Z",
    updated_at: "2026-11-01T02:00:00Z",
    archived_at: null,
    ...overrides,
  };
}

/** A local wall-clock instant, so a test states the day it means. */
function localAt(month: number, day: number, hour: number, minute = 0): string {
  return new Date(2026, month - 1, day, hour, minute, 0).toISOString();
}

function post(overrides: Partial<CreatorPost> & Pick<CreatorPost, "id">): CreatorPost {
  return {
    workspace_id: WS,
    creator_id: "c-1",
    collab_id: null,
    content_issue_id: null,
    product_id: null,
    pick_id: null,
    platform: "douyin",
    title: "One post",
    url: "https://www.douyin.com/video/1",
    published_at: "2026-11-10T10:00:00Z",
    source: "manual",
    created_by: null,
    created_at: "2026-11-10T10:00:00Z",
    updated_at: "2026-11-10T10:00:00Z",
    archived_at: null,
    ...overrides,
  };
}

function creator(id: string, displayName: string): Creator {
  return {
    id,
    workspace_id: WS,
    kind: "owned",
    display_name: displayName,
    platform: "douyin",
    handle: id,
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
  };
}

describe("groupByPublishDay", () => {
  it("puts each script on its local day, earliest day first", () => {
    const groups = groupByPublishDay([
      script({ id: "b", publish_at: localAt(11, 21, 18) }),
      script({ id: "a", publish_at: localAt(11, 19, 9) }),
      script({ id: "c", publish_at: localAt(11, 19, 21) }),
    ]);

    expect(groups.map((group) => group.key)).toEqual(["2026-11-19", "2026-11-21"]);
    // Two scripts on one day share the group, in time order.
    expect(groups[0]?.rows.map((row) => row.id)).toEqual(["a", "c"]);
    expect(groups[0]?.at).toEqual(startOfLocalDay(new Date(2026, 10, 19)));
  });

  it("keeps the scripts with no publish_at in one last group, never as a day", () => {
    const groups = groupByPublishDay([
      script({ id: "undated-1", updated_at: "2026-11-02T00:00:00Z" }),
      script({ id: "dated", publish_at: localAt(11, 25, 12) }),
      script({ id: "undated-2", updated_at: "2026-11-12T00:00:00Z" }),
    ]);

    expect(groups.map((group) => group.key)).toEqual(["2026-11-25", UNSCHEDULED_KEY]);
    const undated = groups[1];
    expect(undated?.at).toBeNull();
    // Most recently touched first: the row someone was just editing leads.
    expect(undated?.rows.map((row) => row.id)).toEqual(["undated-2", "undated-1"]);
  });

  it("treats an unparsable publish_at as unscheduled instead of inventing a day", () => {
    const groups = groupByPublishDay([script({ id: "bad", publish_at: "not a date" })]);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.key).toBe(UNSCHEDULED_KEY);
    expect(publishInstant(script({ id: "bad", publish_at: "not a date" }))).toBeNull();
    expect(groups[0]?.rows.map((row) => row.id)).toEqual(["bad"]);
  });

  it("returns no groups at all for an empty queue", () => {
    expect(groupByPublishDay([])).toEqual([]);
  });
});

describe("sortScheduled", () => {
  it("orders dated rows by instant and sinks the undated ones", () => {
    const ordered = sortScheduled([
      script({ id: "undated" }),
      script({ id: "late", publish_at: localAt(11, 30, 8) }),
      script({ id: "early", publish_at: localAt(11, 18, 8) }),
    ]);

    expect(ordered.map((row) => row.id)).toEqual(["early", "late", "undated"]);
  });
});

describe("approvedScripts", () => {
  it("drops every script that is not approved, even if the server returned it", () => {
    const kept = approvedScripts([
      script({ id: "a", status: "approved" }),
      script({ id: "d", status: "draft" }),
      script({ id: "r", status: "review" }),
      script({ id: "x", status: "archived" }),
    ]);

    expect(kept.map((row) => row.id)).toEqual(["a"]);
  });
});

describe("datetime-local round trip", () => {
  it("reads a stored instant as the viewer's wall clock", () => {
    const instant = localAt(11, 20, 18, 30);

    expect(localDateTimeValue(instant)).toBe("2026-11-20T18:30");
    // …and parses that wall clock back to the same instant.
    expect(parseLocalDateTime("2026-11-20T18:30")).toBe(instant);
  });

  it("answers '' and null for the cases the control cannot show", () => {
    expect(localDateTimeValue(null)).toBe("");
    expect(localDateTimeValue("nonsense")).toBe("");
    expect(parseLocalDateTime("")).toBeNull();
    expect(parseLocalDateTime("2026-11-20")).not.toBeNull();
  });
});

describe("scriptTitle", () => {
  it("prefers the hook, then the body's first line, then the cover note", () => {
    expect(scriptTitle(script({ id: "a", hook: " 打开就后悔 ", body: "正文" }))).toBe("打开就后悔");
    expect(scriptTitle(script({ id: "b", body: "\n第一行\n第二行" }))).toBe("第一行");
    expect(scriptTitle(script({ id: "c", cover_note: "封面大字" }))).toBe("封面大字");
    expect(scriptTitle(script({ id: "d" }))).toBeNull();
  });
});

describe("the published side", () => {
  it("lists the newest post first", () => {
    const ordered = sortPublished([
      post({ id: "old", published_at: "2026-11-01T10:00:00Z" }),
      post({ id: "new", published_at: "2026-11-15T10:00:00Z" }),
    ]);

    expect(ordered.map((row) => row.id)).toEqual(["new", "old"]);
  });

  it("resolves a post's creator name from the ledger, and leaves an unknown id out", () => {
    const names = creatorNameIndex([creator("c-1", "Lin")]);

    expect(names.get("c-1")).toBe("Lin");
    // A post whose creator is archived away from the ledger prints a dash: the
    // page never invents a name for an id it cannot resolve.
    expect(names.get("gone")).toBeUndefined();
  });

  it("prints the host of a link, and the raw string when it is not a URL", () => {
    expect(urlHost("https://www.douyin.com/video/7")).toBe("www.douyin.com");
    expect(urlHost("douyin.com/video/7")).toBe("douyin.com/video/7");
  });
});
