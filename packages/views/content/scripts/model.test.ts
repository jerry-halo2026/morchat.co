// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { MediaScript } from "@morechat/core/types";
import {
  SCRIPT_STATUSES,
  createVersionRequest,
  draftFrom,
  duplicateVersion,
  fromDatetimeLocal,
  groupScriptsByTopic,
  nextVersion,
  parseTags,
  scriptExcerpt,
  statusRequest,
  tagsText,
  timestampLabel,
  toDatetimeLocal,
} from "./model";

/**
 * 文案工坊's model (§12.4): a row is a version, versions are numbered per topic,
 * and rewriting the copy is a POST rather than a PATCH. The cases here are the
 * ones a page can get wrong — which row is "the latest", what a chain holding two
 * v2 looks like, and whether a save that only moves the status says so in the
 * request.
 */

let seq = 0;

function script(overrides: Partial<MediaScript> = {}): MediaScript {
  seq += 1;
  return {
    id: `s-${seq}`,
    workspace_id: "ws-1",
    topic_id: "t-1",
    ip_id: null,
    version: 1,
    hook: null,
    body: null,
    cta: null,
    cover_note: null,
    tags: [],
    status: "draft",
    publish_at: null,
    owner_member_id: "m-1",
    created_by: "m-1",
    created_at: "2026-11-01T02:00:00Z",
    updated_at: "2026-11-01T02:00:00Z",
    archived_at: null,
    ...overrides,
  };
}

const TITLES = new Map([
  ["t-1", "租房避坑三件事"],
  ["t-2", "洗衣机怎么选"],
]);

describe("groupScriptsByTopic", () => {
  it("puts every version of one topic in one group, newest version first", () => {
    const groups = groupScriptsByTopic(
      [
        script({ id: "a", topic_id: "t-1", version: 1 }),
        script({ id: "c", topic_id: "t-1", version: 3 }),
        script({ id: "b", topic_id: "t-1", version: 2 }),
      ],
      TITLES,
    );

    expect(groups).toHaveLength(1);
    expect(groups[0]!.versions.map((row) => row.version)).toEqual([3, 2, 1]);
    expect(groups[0]!.latest.id).toBe("c");
    expect(groups[0]!.title).toBe("租房避坑三件事");
  });

  it("picks the latest by version number, not by when the row was created", () => {
    // A backfilled v1 created after v2 must still be the *older* version.
    const groups = groupScriptsByTopic(
      [
        script({ id: "old", version: 1, created_at: "2026-11-10T02:00:00Z" }),
        script({ id: "new", version: 2, created_at: "2026-11-02T02:00:00Z" }),
      ],
      TITLES,
    );
    expect(groups[0]!.latest.id).toBe("new");
  });

  it("orders two rows of the same number by creation time and reports the collision", () => {
    const groups = groupScriptsByTopic(
      [
        script({ id: "fresh", version: 2, created_at: "2026-11-05T02:00:00Z" }),
        script({ id: "stale", version: 2, created_at: "2026-11-01T02:00:00Z" }),
        script({ id: "v1", version: 1 }),
      ],
      TITLES,
    );

    expect(groups[0]!.versions.map((row) => row.id)).toEqual(["fresh", "stale", "v1"]);
    // Two live v2 rows: 739's unique index only covers unarchived rows.
    expect(groups[0]!.conflict).toBe(2);
    expect(groups[0]!.latest.id).toBe("fresh");
  });

  it("reports no collision for a clean chain", () => {
    const groups = groupScriptsByTopic(
      [script({ version: 1 }), script({ version: 2 })],
      TITLES,
    );
    expect(groups[0]!.conflict).toBeNull();
  });

  it("orders groups by the topic touched last, and names an unknown topic as null", () => {
    const groups = groupScriptsByTopic(
      [
        script({ id: "a", topic_id: "t-1", updated_at: "2026-11-02T02:00:00Z" }),
        script({ id: "b", topic_id: "t-9", updated_at: "2026-11-09T02:00:00Z" }),
      ],
      TITLES,
    );

    expect(groups.map((group) => group.topicId)).toEqual(["t-9", "t-1"]);
    // t-9 is not in the page of topics this screen read; the group still renders.
    expect(groups[0]!.title).toBeNull();
  });

  it("answers an empty list for an empty page", () => {
    expect(groupScriptsByTopic([], TITLES)).toEqual([]);
  });
});

describe("version numbering", () => {
  it("labels the next version MAX + 1, and v1 for a topic with nothing yet", () => {
    expect(nextVersion([])).toBe(1);
    expect(nextVersion([script({ version: 1 }), script({ version: 4 })])).toBe(5);
  });

  it("has no duplicate to report when every version appears once", () => {
    expect(duplicateVersion([script({ version: 3 }), script({ version: 1 })])).toBeNull();
  });
});

describe("createVersionRequest", () => {
  it("carries the copy it was given, trimmed, and mints under the same topic", () => {
    const request = createVersionRequest("t-1", {
      hook: "  月租 3000 也能住好  ",
      body: "第一，看采光\n第二，看隔音",
      cta: "你踩过哪个坑？",
      coverNote: "  避坑清单  ",
      tags: "租房 避坑  租房",
      status: "draft",
      publishAt: "",
    });

    expect(request).toEqual({
      topic_id: "t-1",
      hook: "月租 3000 也能住好",
      body: "第一，看采光\n第二，看隔音",
      cta: "你踩过哪个坑？",
      cover_note: "避坑清单",
      tags: ["租房", "避坑"],
      status: "draft",
    });
    // No time typed: the field is absent, not "" — an empty publish_at would mean
    // "clear the schedule".
    expect("publish_at" in request).toBe(false);
  });

  it("sends an emptied field as an empty string so the new version drops it", () => {
    const request = createVersionRequest("t-1", {
      ...draftFrom(script({ hook: "旧的钩子", body: "旧的正文" })),
      hook: "   ",
    });
    expect(request.hook).toBe("");
    expect(request.body).toBe("旧的正文");
  });

  it("sends the picked publish time as an instant", () => {
    const local = "2026-11-20T09:30";
    const request = createVersionRequest("t-1", {
      ...draftFrom(null),
      publishAt: local,
    });
    expect(request.publish_at).toBe(new Date(local).toISOString());
  });
});

describe("statusRequest", () => {
  it("sends only the pipeline fields, which is what keeps a review in place", () => {
    expect(statusRequest({ status: "approved", publishAt: "" })).toEqual({
      status: "approved",
      publish_at: "",
    });
    expect(Object.keys(statusRequest({ status: "review", publishAt: "" }))).toEqual([
      "status",
      "publish_at",
    ]);
  });

  it("keeps a scheduled time as an instant", () => {
    const local = "2026-11-20T09:30";
    expect(statusRequest({ status: "review", publishAt: local }).publish_at).toBe(
      new Date(local).toISOString(),
    );
  });
});

describe("editable fields", () => {
  it("seeds the editor from the version it is written on top of", () => {
    const draft = draftFrom(
      script({
        hook: "钩子",
        body: "正文",
        cta: "结尾",
        cover_note: "封面",
        tags: ["a", "b"],
        status: "review",
        publish_at: new Date(2026, 10, 20, 9, 30).toISOString(),
      }),
    );
    expect(draft).toEqual({
      hook: "钩子",
      body: "正文",
      cta: "结尾",
      coverNote: "封面",
      tags: "a b",
      status: "review",
      publishAt: "2026-11-20T09:30",
    });
  });

  it("seeds an empty draft when there is no version yet", () => {
    expect(draftFrom(null)).toEqual({
      hook: "",
      body: "",
      cta: "",
      coverNote: "",
      tags: "",
      status: "draft",
      publishAt: "",
    });
  });

  it("round-trips a local wall clock through the datetime field", () => {
    const iso = new Date(2026, 10, 18, 9, 5).toISOString();
    expect(toDatetimeLocal(iso)).toBe("2026-11-18T09:05");
    expect(fromDatetimeLocal("2026-11-18T09:05")).toBe(iso);
    expect(toDatetimeLocal(null)).toBe("");
    expect(fromDatetimeLocal("")).toBeNull();
    expect(fromDatetimeLocal("not a date")).toBeNull();
    expect(toDatetimeLocal("nonsense")).toBe("");
  });

  it("prints a scheduled instant, or nothing when unscheduled", () => {
    expect(timestampLabel(null, "en")).toBeNull();
    // Built from local parts, so the day printed is the day typed whatever zone
    // the suite runs in.
    const local = new Date(2026, 10, 20, 9, 30).toISOString();
    expect(timestampLabel(local, "en")).toBe("Nov 20, 09:30 AM");
    // A value that is not a date is shown as it stands rather than blanked.
    expect(timestampLabel("收工后", "en")).toBe("收工后");
  });
});

describe("copy details", () => {
  it("splits 标签 on any separator the operator used and keeps their order", () => {
    expect(parseTags("租房,避坑 #干货  租房，省钱")).toEqual(["租房", "避坑", "干货", "省钱"]);
    expect(tagsText(["a", "b"])).toBe("a b");
  });

  it("excerpts the first written line of a version", () => {
    expect(scriptExcerpt(script({ hook: null, body: "\n  第二行才是正文  \n再一行" }))).toBe(
      "第二行才是正文",
    );
    expect(scriptExcerpt(script({ hook: "开头", body: "正文" }))).toBe("开头");
    expect(scriptExcerpt(script({}))).toBeNull();
    expect(scriptExcerpt(script({ hook: "字".repeat(200) }), 10)).toBe(`${"字".repeat(9)}…`);
  });

  it("names every status the contract allows", () => {
    expect(SCRIPT_STATUSES).toEqual(["draft", "review", "approved", "archived"]);
  });
});
