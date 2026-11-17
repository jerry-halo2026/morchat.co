import { describe, expect, it } from "vitest";
import {
  EMPTY_MEDIA_IP_ACCOUNT,
  EMPTY_MEDIA_SCRIPT,
  EMPTY_MEDIA_SHOOT,
  MediaIPDetailSchema,
  MediaScriptSchema,
  MediaShootSchema,
  MediaTopicSchema,
} from "../api/schemas";
import {
  mediaIPDetailOptions,
  mediaIPListOptions,
  mediaKeys,
  mediaScriptListOptions,
  mediaShootListOptions,
  mediaTopicListOptions,
} from "./queries";

function isUnder(key: readonly unknown[], prefix: readonly unknown[]): boolean {
  return prefix.every((part, index) => Object.is(part, key[index]));
}

describe("content workbench query keys (contract §12)", () => {
  it("writes ['media', wsId, resource, filters]", () => {
    expect(mediaKeys.list("ws-1", "ips", {})).toEqual(["media", "ws-1", "ips", {}]);
    expect(mediaKeys.list("ws-1", "topics", { ip_id: "ip-1" })).toEqual([
      "media",
      "ws-1",
      "topics",
      { ip_id: "ip-1" },
    ]);
    expect(mediaKeys.list("ws-1", "shoots", { from: "2026-11-01", to: "2026-11-30" })).toEqual([
      "media",
      "ws-1",
      "shoots",
      { from: "2026-11-01", to: "2026-11-30" },
    ]);
  });

  it("keeps the four resources apart", () => {
    expect(mediaKeys.list("ws-1", "topics", { ip_id: "ip-1" })).not.toEqual(
      mediaKeys.list("ws-1", "scripts", { topic_id: "ip-1" }),
    );
    expect(mediaTopicListOptions("ws-1", { ip_id: "ip-1" }).queryKey).not.toEqual(
      mediaScriptListOptions("ws-1", { topic_id: "ip-1" }).queryKey,
    );
  });

  it("nests detail reads under the domain prefix the mutations invalidate", () => {
    expect(mediaKeys.detail("ws-1", "ips", "ip-1")).toEqual([
      "media",
      "ws-1",
      "ips",
      { id: "ip-1" },
    ]);
    for (const key of [
      mediaKeys.list("ws-1", "scripts", {}),
      mediaKeys.detail("ws-1", "shoots", "sh-1"),
    ]) {
      expect(isUnder(key, mediaKeys.all("ws-1"))).toBe(true);
    }
    expect(isUnder(mediaKeys.list("ws-2", "ips", {}), mediaKeys.all("ws-1"))).toBe(false);
  });

  it("stays disabled until the workspace (and the id) is known", () => {
    expect(mediaIPListOptions("").enabled).toBe(false);
    expect(mediaShootListOptions("").enabled).toBe(false);
    expect(mediaIPDetailOptions("", "ip-1").enabled).toBe(false);
    expect(mediaIPDetailOptions("ws-1", "").enabled).toBe(false);
    expect(mediaIPDetailOptions("ws-1", "ip-1").enabled).toBe(true);
  });
});

describe("content workbench schema defaults (contract §12)", () => {
  it("normalises a topic's score card to all five dimensions", () => {
    const topic = MediaTopicSchema.parse({ id: "t-1", ip_id: "ip-1", title: "选题" });
    // All five axes must exist even when the payload carries none of them: the
    // radar chart draws five axes, and a 0 is the only honest default.
    expect(topic.scores).toEqual({ pain: 0, save: 0, debate: 0, susp: 0, fit: 0 });

    const partial = MediaTopicSchema.parse({
      id: "t-2",
      ip_id: "ip-1",
      title: "半张卡",
      scores: { pain: 80, fit: 55 },
    });
    expect(partial.scores).toEqual({ pain: 80, save: 0, debate: 0, susp: 0, fit: 55 });
  });

  it("reads an omitted script status as draft and tags as an empty line", () => {
    const script = MediaScriptSchema.parse({ id: "s-1", topic_id: "t-1" });
    expect(script.version).toBe(1);
    expect(script.status).toBe("draft");
    expect(script.tags).toEqual([]);
    expect(script.publish_at).toBeNull();
    expect(EMPTY_MEDIA_SCRIPT.version).toBe(1);
  });

  it("keeps a shot list document intact and reads an unplanned one as {}", () => {
    const shotList = {
      schema_version: "shotlist.v1",
      title: "三秒钩子",
      duration_ms: 15000,
      aspect_ratio: "9:16",
      shots: [
        {
          index: 0,
          start_ms: 0,
          end_ms: 3000,
          shot_size: "close-up",
          scene: "indoor",
          rhythm: "fast-cut",
          selling_points: ["price", "pain-point"],
        },
      ],
    };
    const planned = MediaShootSchema.parse({
      id: "sh-1",
      script_id: "s-1",
      shoot_date: "2026-11-20",
      shots: shotList,
      checklist: { 灯光: true, 收音: false },
    });
    // The artifact is passed through untouched — `shotlist.v1` is frozen by
    // contracts/library, and a second validator here would be a second copy of it.
    expect(planned.shots).toEqual(shotList);
    expect(planned.checklist).toEqual({ 灯光: true, 收音: false });

    const unplanned = MediaShootSchema.parse({
      id: "sh-2",
      script_id: "s-1",
      shoot_date: "2026-11-21",
    });
    expect(unplanned.shots).toEqual({});
    expect(unplanned.checklist).toEqual({});
    expect(unplanned.status).toBe("planned");
    expect(EMPTY_MEDIA_SHOOT.status).toBe("planned");
  });

  it("degrades an IP without an account list to an empty one", () => {
    const detail = MediaIPDetailSchema.parse({ id: "ip-1", name: "小美" });
    expect(detail.accounts).toEqual([]);
    expect(detail.status).toBe("active");
    expect(detail.week_goal).toBe(0);

    // An account row keeps its platform identity and its nullable reach fields.
    expect(EMPTY_MEDIA_IP_ACCOUNT).toMatchObject({ platform: "", fans: 0, url: null });
  });
});
