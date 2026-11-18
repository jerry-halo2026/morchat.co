// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { MediaTopic, MemberWithUser } from "@morechat/core/types";
import { MEDIA_SCORE_DIMENSIONS } from "@morechat/core/types/media";
import {
  boardOf,
  cameFromHot,
  changedScores,
  createTopicPayload,
  draftFromTopic,
  draftScores,
  emptyTopicDraft,
  isKnownTopicSource,
  isKnownTopicStatus,
  memberNames,
  ownerName,
  scoreEntries,
  scoreTotal,
  scoreValue,
  sortTopics,
  statusPatch,
  TOPIC_STATUS_ORDER,
  updateTopicPayload,
} from "./model";

/**
 * The topic board's model.
 *
 * The interesting half is the score card: it is a JSONB object, so it arrives
 * with values nobody typed (strings, nulls, out-of-range numbers) and possibly
 * with dimensions this build has never heard of. Reading must survive all of it,
 * and writing must touch only the five known dimensions — the merge on the server
 * is what keeps the rest.
 */

function topic(id: string, extra: Partial<MediaTopic> = {}): MediaTopic {
  return {
    id,
    workspace_id: "ws-1",
    ip_id: "ip-a",
    title: `Topic ${id}`,
    source: "manual",
    scores: { pain: 0, save: 0, debate: 0, susp: 0, fit: 0 },
    status: "pool",
    hot_id: null,
    note: null,
    owner_member_id: null,
    created_by: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    archived_at: null,
    ...extra,
  };
}

/**
 * A row carrying a stage this build does not know.
 *
 * `media_topic.status` is a free string on the wire (`MediaTopicSchema` parses it
 * with `z.string()`), so a row written by a newer server can hold one; the type
 * is the narrow view, and widening it here is how the test models that row.
 */
function topicWithRawStatus(id: string, status: string): MediaTopic {
  return { ...topic(id), status: status as MediaTopic["status"] };
}

describe("a stored score value", () => {
  it("normalises whatever the column holds to a whole 0–100 number", () => {
    expect(scoreValue(70)).toBe(70);
    expect(scoreValue("70")).toBe(70);
    expect(scoreValue(72.6)).toBe(73);
    expect(scoreValue(-5)).toBe(0);
    expect(scoreValue(150)).toBe(100);
    expect(scoreValue(null)).toBe(0);
    expect(scoreValue("abc")).toBe(0);
    expect(scoreValue(undefined)).toBe(0);
  });
});

describe("the stored card, as drawn", () => {
  it("always lists the five known dimensions, even for an empty object", () => {
    const entries = scoreEntries({});
    expect(entries.map((entry) => entry.key)).toEqual([...MEDIA_SCORE_DIMENSIONS]);
    expect(entries.every((entry) => entry.known)).toBe(true);
    expect(entries.every((entry) => entry.value === 0)).toBe(true);
  });

  it("keeps a dimension this build does not know, after the five", () => {
    const entries = scoreEntries({ pain: 40, zhang: 12, extra: "9", bad: null });
    expect(entries.slice(0, 5).map((entry) => entry.key)).toEqual([...MEDIA_SCORE_DIMENSIONS]);
    expect(entries.filter((entry) => !entry.known)).toEqual([
      { key: "bad", value: 0, known: false },
      { key: "extra", value: 9, known: false },
      { key: "zhang", value: 12, known: false },
    ]);
    expect(entries[0]).toEqual({ key: "pain", value: 40, known: true });
  });

  it("survives a value that is not an object at all", () => {
    expect(scoreEntries(null).length).toBe(5);
    expect(scoreEntries("scores").length).toBe(5);
    expect(scoreEntries([1, 2]).length).toBe(5);
  });

  it("totals the five known dimensions only", () => {
    expect(scoreTotal({ pain: 10, save: 20, zhang: 90 })).toBe(30);
    expect(scoreTotal({})).toBe(0);
  });
});

describe("the score patch", () => {
  it("sends nothing when the draft matches what is stored", () => {
    expect(changedScores({ pain: "40" }, { pain: 40 })).toEqual({});
  });

  it("sends only the dimensions that moved", () => {
    const stored = { pain: 40, save: 10, debate: 0, susp: 0, fit: 0 };
    expect(changedScores({ ...stored, pain: 90 }, stored)).toEqual({ pain: 90 });
  });

  it("never sends a dimension this build does not know", () => {
    // The server answers 400 for an unknown key; the stored one survives because
    // it is absent from the patch, not because it is echoed back.
    const patch = changedScores({ pain: 10, zhang: 99 }, {});
    expect(patch).toEqual({ pain: 10 });
    expect(Object.keys(patch)).not.toContain("zhang");
  });

  it("reads a cleared field as zero", () => {
    expect(changedScores({ pain: "" }, { pain: 40 })).toEqual({ pain: 0 });
  });

  it("fills all five for a create", () => {
    expect(draftScores({ pain: "80" })).toEqual({ pain: 80, save: 0, debate: 0, susp: 0, fit: 0 });
  });
});

describe("the board", () => {
  it("draws every pipeline column even when nothing is in it", () => {
    const columns = boardOf([]);
    expect(columns.map((column) => column.status)).toEqual([...TOPIC_STATUS_ORDER]);
    expect(columns.every((column) => column.topics.length === 0)).toBe(true);
  });

  it("puts each row in its own column", () => {
    const columns = boardOf([
      topic("t-1", { status: "pool" }),
      topic("t-2", { status: "scripting" }),
      topic("t-3", { status: "pool" }),
    ]);
    const byStatus = new Map(columns.map((column) => [column.status, column.topics.length]));
    expect(byStatus.get("pool")).toBe(2);
    expect(byStatus.get("scripting")).toBe(1);
    expect(byStatus.get("done")).toBe(0);
  });

  it("keeps a status this build does not know as its own column", () => {
    const columns = boardOf([topicWithRawStatus("t-1", "reviewing")]);
    const extra = columns.find((column) => column.status === "reviewing");
    expect(extra?.topics.map((row) => row.id)).toEqual(["t-1"]);
  });

  it("ranks a column by score, then by the newest touch", () => {
    const rows = [
      topic("low", { scores: { pain: 1, save: 0, debate: 0, susp: 0, fit: 0 } }),
      topic("high-old", {
        scores: { pain: 90, save: 0, debate: 0, susp: 0, fit: 0 },
        updated_at: "2026-01-01T00:00:00Z",
      }),
      topic("high-new", {
        scores: { pain: 90, save: 0, debate: 0, susp: 0, fit: 0 },
        updated_at: "2026-02-01T00:00:00Z",
      }),
    ];
    expect(sortTopics(rows).map((row) => row.id)).toEqual(["high-new", "high-old", "low"]);
  });
});

describe("where a topic came from", () => {
  it("counts a hot topic and a dangling hot_id alike", () => {
    expect(cameFromHot(topic("t-1", { source: "hot" }))).toBe(true);
    expect(cameFromHot(topic("t-2", { hot_id: "hot-1" }))).toBe(true);
    expect(cameFromHot(topic("t-3", { source: "bench" }))).toBe(false);
  });

  it("knows the four sources and the six stages", () => {
    expect(isKnownTopicSource("bench")).toBe(true);
    expect(isKnownTopicSource("import")).toBe(false);
    expect(isKnownTopicStatus("dropped")).toBe(true);
    expect(isKnownTopicStatus("reviewing")).toBe(false);
  });
});

describe("the owner line", () => {
  const members = [
    { id: "m-1", name: "Ada" },
    { id: "m-2", name: "Bo" },
  ] as MemberWithUser[];

  it("resolves a member id to a name, and an absent owner to null", () => {
    const names = memberNames(members);
    expect(ownerName(names, "m-2")).toBe("Bo");
    expect(ownerName(names, "m-9")).toBeNull();
    expect(ownerName(names, null)).toBeNull();
  });
});

describe("the draft", () => {
  const stored = topic("t-1", {
    title: "Why meetings rot",
    scores: { pain: 80, save: 10, debate: 0, susp: 0, fit: 5 },
    status: "scripting",
  });

  it("opens on the stored row, with zeroes shown as empty fields", () => {
    const draft = draftFromTopic(stored);
    expect(draft.title).toBe("Why meetings rot");
    expect(draft.ipId).toBe("ip-a");
    expect(draft.status).toBe("scripting");
    expect(draft.scores).toEqual({ pain: "80", save: "10", debate: "", susp: "", fit: "5" });
  });

  it("starts a new topic on the IP it was opened from", () => {
    expect(emptyTopicDraft("ip-b")).toEqual({
      title: "",
      ipId: "ip-b",
      source: "manual",
      status: "pool",
      scores: { pain: "", save: "", debate: "", susp: "", fit: "" },
    });
  });
});

describe("the create body", () => {
  it("refuses a blank title or a missing IP", () => {
    expect(createTopicPayload(emptyTopicDraft("ip-a"))).toBeNull();
    expect(createTopicPayload({ ...emptyTopicDraft("ip-a"), title: "  " })).toBeNull();
    expect(createTopicPayload({ ...emptyTopicDraft(""), title: "An idea" })).toBeNull();
  });

  it("sends all five dimensions and a known source", () => {
    const payload = createTopicPayload({
      ...emptyTopicDraft("ip-a"),
      title: "  An idea ",
      source: "hot",
      scores: { pain: "70", save: "1" },
    });
    expect(payload).toEqual({
      ip_id: "ip-a",
      title: "An idea",
      source: "hot",
      scores: { pain: 70, save: 1, debate: 0, susp: 0, fit: 0 },
    });
  });

  it("falls back to manual for a source it cannot vouch for", () => {
    const payload = createTopicPayload({ ...emptyTopicDraft("ip-a"), title: "x", source: "import" });
    expect(payload?.source).toBe("manual");
  });
});

describe("the patch body", () => {
  const stored = topic("t-1", {
    title: "Why meetings rot",
    scores: { pain: 80, save: 10, debate: 0, susp: 0, fit: 5 },
  });

  it("sends nothing when the draft changes nothing", () => {
    expect(updateTopicPayload(draftFromTopic(stored), stored)).toEqual({});
  });

  it("sends the title, the source and the stage only when they move", () => {
    const draft = draftFromTopic(stored);
    expect(updateTopicPayload({ ...draft, title: "A better title" }, stored)).toEqual({
      title: "A better title",
    });
    expect(updateTopicPayload({ ...draft, source: "bench" }, stored)).toEqual({ source: "bench" });
    expect(updateTopicPayload({ ...draft, status: "shooting" }, stored)).toEqual({
      status: "shooting",
    });
  });

  it("sends only the scores that changed, and never an unknown key", () => {
    const draft = draftFromTopic(stored);
    const patch = updateTopicPayload(
      { ...draft, scores: { ...draft.scores, pain: "95", zhang: "60" } },
      stored,
    );
    expect(patch).toEqual({ scores: { pain: 95 } });
  });

  it("carries a status move as one field", () => {
    expect(statusPatch("done")).toEqual({ status: "done" });
  });
});
