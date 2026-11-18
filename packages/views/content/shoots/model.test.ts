// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { MediaShoot, MediaShotList } from "@morechat/core/types";
import {
  DEFAULT_ASPECT_RATIO,
  SHOOT_STATUSES,
  buildShotsValue,
  checklistEntries,
  checklistProgress,
  checklistTogglePayload,
  dayLabel,
  groupShootsByDay,
  localDay,
  newShotRow,
  readShotDocument,
  readShotRows,
  secondsValue,
  startOfWeek,
  weekWindow,
  type ShotRow,
} from "./model";

/**
 * 拍摄排期's model (§12.5): `shots` is a frozen `shotlist.v1` document or `{}`.
 *
 * The reader has to survive everything a column can hold — the empty object, a
 * document, the key-mapped shape an older build wrote, and plain junk — because a
 * screen that throws on one row takes the whole week down. The writer has to do
 * the opposite: one document, renumbered and laid end to end, replacing whatever
 * was there.
 */

function row(overrides: Partial<ShotRow> = {}): ShotRow {
  return { ...newShotRow(), text: "出镜讲产品", seconds: "3", ...overrides };
}

function shoot(overrides: Partial<MediaShoot> = {}): MediaShoot {
  return {
    id: "sh-1",
    workspace_id: "ws-1",
    script_id: "s-1",
    shoot_date: "2026-11-18",
    location: null,
    shots: {},
    checklist: {},
    status: "planned",
    owner_member_id: null,
    created_by: null,
    created_at: "2026-11-10T02:00:00Z",
    updated_at: "2026-11-10T02:00:00Z",
    archived_at: null,
    ...overrides,
  };
}

function document(overrides: Partial<MediaShotList> = {}): MediaShotList {
  return {
    schema_version: "shotlist.v1",
    title: "租房避坑",
    duration_ms: 6000,
    aspect_ratio: "9:16",
    shots: [
      { index: 1, start_ms: 0, end_ms: 3000, shot_size: "medium", scene: "indoor", rhythm: "steady" },
      { index: 2, start_ms: 3000, end_ms: 6000, shot_size: "close-up", scene: "studio", rhythm: "fast-cut" },
    ],
    ...overrides,
  };
}

describe("readShotDocument · 空对象", () => {
  it("reads the column default as no rows and no header", () => {
    expect(readShotDocument({})).toEqual({ title: null, aspectRatio: null, rows: [] });
    expect(readShotRows({})).toEqual([]);
  });
});

describe("readShotDocument · shotlist.v1", () => {
  it("reads the document's rows, size, scene and rhythm", () => {
    const read = readShotDocument(document());
    expect(read.title).toBe("租房避坑");
    expect(read.aspectRatio).toBe("9:16");
    expect(read.rows.map((item) => [item.text, item.shotSize, item.scene, item.rhythm, item.seconds])).toEqual([
      ["", "medium", "indoor", "steady", "3"],
      ["", "close-up", "studio", "fast-cut", "3"],
    ]);
  });

  it("keeps an item's text and selling points, and defaults the missing fields", () => {
    // Handed over as `unknown`: the column is a `z.unknown()` passthrough, so a
    // stored document can hold a selling point this build does not know.
    const read = readShotDocument({
      schema_version: "shotlist.v1",
      title: "外景",
      duration_ms: 12000,
      aspect_ratio: "9:16",
      shots: [
        {
          index: 1,
          start_ms: 0,
          end_ms: 12000,
          shot_size: "wide",
          scene: "outdoor",
          rhythm: "slow",
          text: "外景开场",
          selling_points: ["price", "not-a-point"],
          product_ref: "SKU-1",
        },
      ],
    });
    const first = read.rows[0]!;
    expect(first.text).toBe("外景开场");
    expect(first.seconds).toBe("12");
    // An unknown selling point is dropped, not carried into the next write.
    expect(first.sellingPoints).toEqual(["price"]);
    expect(first.productRef).toBe("SKU-1");
  });

  it("keeps a document that lost its schema_version readable", () => {
    const read = readShotDocument({ title: "旧文档", shots: [{ start_ms: 0, end_ms: 2000 }] });
    expect(read.rows).toHaveLength(1);
    expect(read.aspectRatio).toBe(DEFAULT_ASPECT_RATIO);
  });
});

describe("readShotDocument · 乱序键（旧形态）", () => {
  it("sorts 序号-like keys numerically, not as strings", () => {
    const rows = readShotRows({
      "10": { desc: "第十镜", shot_type: "wide", duration_ms: 2000 },
      "2": { desc: "第二镜", shot_type: "close-up", duration_ms: 1000 },
      "1": { desc: "第一镜", shot_type: "medium", duration_ms: 3000 },
    });
    expect(rows.map((item) => item.text)).toEqual(["第一镜", "第二镜", "第十镜"]);
    expect(rows.map((item) => item.seconds)).toEqual(["3", "1", "2"]);
  });

  it("skips a keyed entry that is not an object and keeps the neighbours", () => {
    const rows = readShotRows({
      "1": { desc: "留下", shot_type: "medium", duration_ms: 2000 },
      "2": "脏值",
      "3": null,
    });
    expect(rows.map((item) => item.text)).toEqual(["留下"]);
  });

  it("reads an entry whose duration is not a number as the default length", () => {
    const rows = readShotRows({ "1": { desc: "无时长", duration_ms: "很久" } });
    expect(rows[0]!.seconds).toBe("3");
  });
});

describe("readShotDocument · 非对象脏值", () => {
  it.each([null, undefined, [], ["a"], "shots", 42, true])(
    "answers an empty document for %p",
    (value) => {
      expect(readShotDocument(value)).toEqual({ title: null, aspectRatio: null, rows: [] });
    },
  );

  it("answers an empty document for an object with no shot-like keys", () => {
    expect(readShotDocument({ title: "只有标题" })).toEqual({
      title: null,
      aspectRatio: null,
      rows: [],
    });
  });
});

describe("readShotDocument · 缺字段", () => {
  it("fills a missing duration, size, scene and rhythm rather than dropping the shot", () => {
    const rows = readShotRows({ shots: [{ index: 1, start_ms: 0, end_ms: 0 }] });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.seconds).toBe("1");
    expect(rows[0]!.shotSize).toBe("medium");
    expect(rows[0]!.scene).toBe("indoor");
    expect(rows[0]!.rhythm).toBe("steady");
  });

  it("floors a zero-length shot at one second, because end_ms must be positive", () => {
    const rows = readShotRows({ shots: [{ index: 1, start_ms: 500, end_ms: 500 }] });
    expect(rows[0]!.seconds).toBe("1");
  });

  it("drops an item that is not an object", () => {
    expect(readShotRows({ shots: [{ index: 1 }, "x"] })).toHaveLength(1);
  });
});

describe("buildShotsValue", () => {
  it("writes the empty object when no shot is planned", () => {
    expect(buildShotsValue({ title: "标题", aspectRatio: "9:16", rows: [] })).toEqual({});
  });

  it("lays the rows end to end, renumbered from 1", () => {
    const value = buildShotsValue({
      title: "  租房避坑  ",
      aspectRatio: "1:1",
      rows: [
        row({ text: " 开场 ", seconds: "2", shotSize: "wide", scene: "outdoor", rhythm: "slow" }),
        row({ text: "特写", seconds: "4" }),
      ],
    }) as MediaShotList;

    expect(value.schema_version).toBe("shotlist.v1");
    expect(value.title).toBe("租房避坑");
    expect(value.aspect_ratio).toBe("1:1");
    expect(value.duration_ms).toBe(6000);
    expect(value.shots).toEqual([
      {
        index: 1,
        start_ms: 0,
        end_ms: 2000,
        shot_size: "wide",
        scene: "outdoor",
        rhythm: "slow",
        text: "开场",
      },
      {
        index: 2,
        start_ms: 2000,
        end_ms: 6000,
        shot_size: "medium",
        scene: "indoor",
        rhythm: "steady",
        text: "特写",
      },
    ]);
  });

  it("replaces the document: a row the editor dropped is absent from the write", () => {
    const before = readShotRows(document());
    const kept = buildShotsValue({
      title: "标题",
      aspectRatio: "9:16",
      rows: [before[1]!],
    }) as MediaShotList;
    expect(kept.shots).toHaveLength(1);
    expect(kept.shots[0]!.index).toBe(1);
    // The surviving row's timing is recomputed from the table, not copied.
    expect(kept.shots[0]!.start_ms).toBe(0);
    expect(kept.duration_ms).toBe(3000);
  });

  it("clamps the document duration into the contract's window", () => {
    const tiny = buildShotsValue({
      title: "标题",
      aspectRatio: "9:16",
      rows: [row({ seconds: "0.4" })],
    }) as MediaShotList;
    expect(tiny.duration_ms).toBe(1000);

    const long = buildShotsValue({
      title: "标题",
      aspectRatio: "9:16",
      rows: Array.from({ length: 12 }, () => row({ seconds: "600" })),
    }) as MediaShotList;
    expect(long.duration_ms).toBe(600000);
  });

  it("cuts the title to the contract's 120 characters", () => {
    const value = buildShotsValue({
      title: "长".repeat(200),
      aspectRatio: "9:16",
      rows: [row()],
    }) as MediaShotList;
    expect(value.title).toHaveLength(120);
  });

  it("round-trips through the reader", () => {
    const rows = [row({ text: "第一镜", seconds: "2" }), row({ text: "第二镜", seconds: "5" })];
    const value = buildShotsValue({ title: "标题", aspectRatio: "9:16", rows });
    const read = readShotDocument(value);
    expect(read.rows.map((item) => [item.text, item.seconds])).toEqual([
      ["第一镜", "2"],
      ["第二镜", "5"],
    ]);
  });
});

describe("durations", () => {
  it("reads a typed length as whole seconds inside the allowed range", () => {
    expect(secondsValue("12")).toBe(12);
    expect(secondsValue(" 7.6 ")).toBe(8);
    expect(secondsValue("")).toBe(1);
    expect(secondsValue("abc")).toBe(1);
    expect(secondsValue("-5")).toBe(1);
    expect(secondsValue("9999")).toBe(600);
  });
});

describe("the week window", () => {
  it("runs Monday to Sunday and moves by whole weeks", () => {
    const anchor = new Date(2026, 10, 18, 15, 0); // a Wednesday
    const week = weekWindow(anchor);
    expect(week.start).toBe("2026-11-16");
    expect(week.end).toBe("2026-11-22");
    expect(week.days).toHaveLength(7);
    expect(week.days[0]).toBe("2026-11-16");
    expect(week.days[6]).toBe("2026-11-22");

    expect(weekWindow(anchor, 1).start).toBe("2026-11-23");
    expect(weekWindow(anchor, -1).end).toBe("2026-11-15");
  });

  it("treats Sunday as the end of the week it closes", () => {
    expect(localDay(startOfWeek(new Date(2026, 10, 22)))).toBe("2026-11-16");
    expect(localDay(startOfWeek(new Date(2026, 10, 16)))).toBe("2026-11-16");
  });

  it("labels a day on the reader's calendar", () => {
    expect(dayLabel("2026-11-18", "en")).toBe("Wed, Nov 18");
    expect(dayLabel("not-a-day", "en")).toBe("not-a-day");
  });
});

describe("groupShootsByDay", () => {
  it("keeps the week's days in order and leaves empty days out", () => {
    const week = weekWindow(new Date(2026, 10, 18));
    const buckets = groupShootsByDay(
      [
        shoot({ id: "b", shoot_date: "2026-11-20" }),
        shoot({ id: "a", shoot_date: "2026-11-18" }),
        // Outside the window: the page never asked for it.
        shoot({ id: "far", shoot_date: "2026-12-01" }),
      ],
      week,
    );
    expect(buckets.map((bucket) => bucket.day)).toEqual(["2026-11-18", "2026-11-20"]);
    expect(buckets[0]!.shoots.map((item) => item.id)).toEqual(["a"]);
  });

  it("puts the shoot still ahead of the one already done, within a day", () => {
    const week = weekWindow(new Date(2026, 10, 18));
    const buckets = groupShootsByDay(
      [
        shoot({ id: "done", status: "done" }),
        shoot({ id: "planned", status: "planned" }),
        shoot({ id: "cancelled", status: "cancelled" }),
      ],
      week,
    );
    expect(buckets[0]!.shoots.map((item) => item.id)).toEqual(["planned", "done", "cancelled"]);
  });

  it("answers nothing for a week with no shoot", () => {
    expect(groupShootsByDay([], weekWindow(new Date(2026, 10, 18)))).toEqual([]);
  });

  it("names every status the contract allows", () => {
    expect(SHOOT_STATUSES).toEqual(["planned", "shooting", "editing", "done", "cancelled"]);
  });
});

describe("checklist", () => {
  it("sends only the ticked key, so one box never clears the rest", () => {
    expect(checklistTogglePayload({ 灯: true, 麦: false }, "麦", true)).toEqual({
      灯: true,
      麦: true,
    });
  });

  it("reads the ticked state as rows and as a progress pair", () => {
    const checklist = { 灯: true, 麦: false, 电池: true };
    expect(checklistEntries(checklist).map((entry) => entry.name)).toEqual(["灯", "麦", "电池"]);
    expect(checklistProgress(checklist)).toEqual({ done: 2, total: 3 });
    expect(checklistProgress({})).toEqual({ done: 0, total: 0 });
  });
});
