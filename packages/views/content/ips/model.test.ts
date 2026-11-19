// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { MediaIP, MediaIPDetail, MediaTopic, MemberRole } from "@morechat/core/types";
import { weekWindow } from "../studio/model";
import {
  accountsFor,
  canCreateIp,
  canWriteIp,
  createPayload,
  doneThisWeek,
  draftChanged,
  draftFromIp,
  emptyDraft,
  indexAccounts,
  isKnownIpStatus,
  parseGoal,
  updatePayload,
  visibleIps,
} from "./model";

/**
 * The IP page's model.
 *
 * Three behaviours carry the page and are pinned here: the week a card counts
 * (only topics that *entered* `done` this week), the two write bodies (a create
 * that omits what is empty, a patch that sends only what changed — including
 * `""` to clear a column), and who may write a row.
 */

const NOW = new Date(2026, 10, 18, 12); // Wednesday 2026-11-18, local
const WEEK = weekWindow(NOW);

function stamp(date: Date): string {
  return date.toISOString();
}

function insideWeek(): string {
  return stamp(new Date(2026, 10, 17, 10));
}

function beforeWeek(): string {
  return stamp(new Date(2026, 10, 9, 10));
}

function ip(id: string, extra: Partial<MediaIP> = {}): MediaIP {
  return {
    id,
    workspace_id: "ws-1",
    name: `IP ${id}`,
    persona: null,
    track: null,
    audience: null,
    color: null,
    week_goal: 0,
    status: "active",
    owner_member_id: null,
    created_by: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    archived_at: null,
    ...extra,
  };
}

function topic(id: string, ipId: string, extra: Partial<MediaTopic> = {}): MediaTopic {
  return {
    id,
    workspace_id: "ws-1",
    ip_id: ipId,
    title: `Topic ${id}`,
    source: "manual",
    scores: { pain: 0, save: 0, debate: 0, susp: 0, fit: 0 },
    status: "pool",
    hot_id: null,
    note: null,
    owner_member_id: null,
    created_by: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: insideWeek(),
    archived_at: null,
    ...extra,
  };
}

function detail(id: string, accountIds: readonly string[]): MediaIPDetail {
  return {
    ...ip(id),
    accounts: accountIds.map((accountId) => ({
      id: accountId,
      media_ip_id: id,
      kind: "owned",
      display_name: accountId,
      platform: "douyin",
      handle: `@${accountId}`,
      url: null,
      fans: 0,
      avg_play: 0,
      owner_member_id: null,
      created_at: "2026-01-01T00:00:00Z",
    })),
  };
}

describe("the week a card counts", () => {
  it("counts the topics that entered done this week, per IP", () => {
    const counts = doneThisWeek(
      [
        topic("t-1", "ip-a", { status: "done" }),
        topic("t-2", "ip-a", { status: "done", updated_at: beforeWeek() }),
        topic("t-3", "ip-a", { status: "pool" }),
        topic("t-4", "ip-a", { status: "done", archived_at: beforeWeek() }),
        topic("t-5", "ip-b", { status: "done" }),
      ],
      WEEK,
    );
    expect(counts.get("ip-a")).toBe(1);
    expect(counts.get("ip-b")).toBe(1);
  });

  it("counts an old topic that only finished today", () => {
    // The row was created in March and finished this week: the week is decided
    // by `updated_at`, which is when it entered `done`.
    const counts = doneThisWeek(
      [topic("t-1", "ip-a", { status: "done", created_at: "2026-03-01T00:00:00Z" })],
      WEEK,
    );
    expect(counts.get("ip-a")).toBe(1);
  });

  it("answers nothing for an IP with no finished topic", () => {
    expect(doneThisWeek([], WEEK).size).toBe(0);
  });
});

describe("accounts", () => {
  it("keeps an unanswered detail read apart from an empty one", () => {
    const byIp = indexAccounts([detail("ip-a", ["c-1"]), undefined, detail("ip-b", [])]);
    expect(accountsFor(byIp, "ip-a")?.map((account) => account.id)).toEqual(["c-1"]);
    // An IP with no accounts answers an empty list; one whose read has not
    // answered answers null, and the card draws no number for it at all.
    expect(accountsFor(byIp, "ip-b")).toEqual([]);
    expect(accountsFor(byIp, "ip-c")).toBeNull();
  });
});

describe("the scope", () => {
  it("shows every IP when nothing is scoped", () => {
    const ips = [ip("ip-a"), ip("ip-b")];
    expect(visibleIps(ips, null)).toEqual({ cards: ips, scopeMissing: false });
  });

  it("narrows to the scoped IP", () => {
    const { cards, scopeMissing } = visibleIps([ip("ip-a"), ip("ip-b")], "ip-b");
    expect(cards.map((row) => row.id)).toEqual(["ip-b"]);
    expect(scopeMissing).toBe(false);
  });

  it("reports a scope whose IP is gone", () => {
    expect(visibleIps([ip("ip-a")], "ip-z")).toEqual({ cards: [], scopeMissing: true });
  });
});

describe("status", () => {
  it("labels the three statuses it knows and keeps any other", () => {
    expect(isKnownIpStatus("active")).toBe(true);
    expect(isKnownIpStatus("paused")).toBe(true);
    expect(isKnownIpStatus("ended")).toBe(true);
    expect(isKnownIpStatus("archived")).toBe(false);
  });
});

describe("the weekly goal", () => {
  it("reads a positive whole number and nothing else", () => {
    expect(parseGoal("3")).toBe(3);
    expect(parseGoal(" 4 ")).toBe(4);
    expect(parseGoal("2.7")).toBe(2);
    expect(parseGoal("0")).toBe(0);
    expect(parseGoal("-2")).toBe(0);
    expect(parseGoal("abc")).toBe(0);
    expect(parseGoal("")).toBe(0);
  });
});

describe("the create body", () => {
  it("refuses a blank name", () => {
    expect(createPayload(emptyDraft())).toBeNull();
    expect(createPayload({ ...emptyDraft(), name: "   " })).toBeNull();
  });

  it("trims what it sends and omits what is empty", () => {
    const payload = createPayload({
      ...emptyDraft(),
      name: "  Kitchen Notes ",
      persona: " a persona ",
      track: "  ",
      weekGoal: "5",
    });
    expect(payload).toEqual({ name: "Kitchen Notes", persona: "a persona", status: "active", week_goal: 5 });
    expect(payload && "track" in payload).toBe(false);
    expect(payload && "color" in payload).toBe(false);
  });

  it("leaves the goal out when there is none", () => {
    const payload = createPayload({ ...emptyDraft(), name: "Outdoor Lab", weekGoal: "0" });
    expect(payload).toEqual({ name: "Outdoor Lab", status: "active" });
  });
});

describe("the patch body", () => {
  const stored = ip("ip-a", {
    name: "Kitchen Notes",
    persona: "a persona",
    track: "food",
    week_goal: 3,
  });

  it("sends nothing when the draft changes nothing", () => {
    const draft = draftFromIp(stored);
    expect(updatePayload(draft, stored)).toEqual({});
    expect(draftChanged(draft, stored)).toBe(false);
  });

  it("sends only the field that changed", () => {
    const draft = { ...draftFromIp(stored), name: "Kitchen Notes 2" };
    expect(updatePayload(draft, stored)).toEqual({ name: "Kitchen Notes 2" });
    expect(draftChanged(draft, stored)).toBe(true);
  });

  it("clears a text field with an empty string rather than dropping it", () => {
    const draft = { ...draftFromIp(stored), persona: "  " };
    expect(updatePayload(draft, stored)).toEqual({ persona: "" });
  });

  it("sends the goal and the status when they move", () => {
    const draft = { ...draftFromIp(stored), weekGoal: "6", status: "paused" as const };
    expect(updatePayload(draft, stored)).toEqual({ week_goal: 6, status: "paused" });
  });
});

describe("writing rights", () => {
  const owned = ip("ip-a", { owner_member_id: "user-1" });

  it("lets an owner or an admin write any row", () => {
    const cases: MemberRole[] = ["owner", "admin"];
    for (const role of cases) expect(canWriteIp(role, "user-9", owned)).toBe(true);
  });

  it("lets a member write what it owns and nothing else", () => {
    expect(canWriteIp("member", "user-1", owned)).toBe(true);
    expect(canWriteIp("member", "user-2", owned)).toBe(false);
    expect(canWriteIp("member", null, owned)).toBe(false);
    // An unknown role is not permission of its own, but ownership still is: the
    // server reads the same two signals.
    expect(canWriteIp(null, "user-1", owned)).toBe(true);
    expect(canWriteIp(null, null, owned)).toBe(false);
  });

  it("lets any member create, because the server hands them the row", () => {
    expect(canCreateIp("member")).toBe(true);
    expect(canCreateIp(null)).toBe(false);
  });
});
