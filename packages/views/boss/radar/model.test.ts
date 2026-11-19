// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { MarketSignal } from "@morechat/core/types";
import {
  allowedTransitions,
  canConvert,
  convertedTarget,
  filterSignals,
  hasActiveFilters,
  sortSignals,
} from "./model";

/**
 * The radar's rules, pinned without a DOM.
 *
 * The one that protects the data: `converted` is never a PATCH target, and a
 * signal carrying a landing pointer is never convertible again — that is what the
 * server's 409 means, and the page has to agree with it before the click.
 */

const WS = "ws-1";

function signal(overrides: Partial<MarketSignal> = {}): MarketSignal {
  return {
    id: "s-1",
    workspace_id: WS,
    title: "Cross-border sellers need weekend support",
    category: "market",
    source: "manual",
    url: null,
    summary: null,
    cut: "warm",
    score: 70,
    urgency: "medium",
    status: "new",
    converted_goal_id: null,
    converted_issue_id: null,
    note: null,
    owner_member_id: null,
    created_by: null,
    created_at: "2026-11-10T00:00:00Z",
    updated_at: "2026-11-10T00:00:00Z",
    archived_at: null,
    ...overrides,
  };
}

describe("status transitions", () => {
  it("offers 观察 → 验证 → 放弃 and never `converted`", () => {
    expect(allowedTransitions("new")).toEqual(["reviewing", "dismissed"]);
    expect(allowedTransitions("reviewing")).toEqual(["dismissed"]);
    expect(allowedTransitions("dismissed")).toEqual([]);
    expect(allowedTransitions("converted")).toEqual([]);
    for (const status of ["new", "reviewing", "dismissed", "converted"] as const) {
      expect(allowedTransitions(status)).not.toContain("converted");
    }
  });
});

describe("convert", () => {
  it("is available only while the signal has no landing and is not converted", () => {
    expect(canConvert(signal())).toBe(true);
    expect(canConvert(signal({ status: "reviewing" }))).toBe(true);
    // The pointer alone is enough: it is what makes a second convert a 409.
    expect(canConvert(signal({ converted_goal_id: "goal-9" }))).toBe(false);
    expect(canConvert(signal({ converted_issue_id: "issue-9" }))).toBe(false);
    expect(canConvert(signal({ status: "converted", converted_issue_id: "issue-9" }))).toBe(false);
    expect(canConvert(signal({ status: "dismissed" }))).toBe(true);
  });

  it("names the landing, goal first", () => {
    expect(convertedTarget(signal())).toBeNull();
    expect(convertedTarget(signal({ converted_goal_id: "goal-9" }))).toEqual({
      kind: "goal",
      id: "goal-9",
    });
    expect(convertedTarget(signal({ converted_issue_id: "issue-9" }))).toEqual({
      kind: "issue",
      id: "issue-9",
    });
  });
});

describe("queue order", () => {
  it("orders open first, then cut, urgency, relevance and recency", () => {
    const rows = sortSignals([
      signal({ id: "cold", cut: "cold", urgency: "high", score: 99 }),
      signal({ id: "dismissed", status: "dismissed", cut: "hot", urgency: "high", score: 99 }),
      signal({ id: "warm-low", cut: "warm", urgency: "low", score: 80 }),
      signal({ id: "hot", cut: "hot", urgency: "medium", score: 40 }),
      signal({ id: "warm-high", cut: "warm", urgency: "high", score: 50 }),
    ]);
    expect(rows.map((row) => row.id)).toEqual([
      "hot",
      "warm-high",
      "warm-low",
      "cold",
      "dismissed",
    ]);
  });
});

describe("filters", () => {
  const rows = [
    signal({ id: "a", title: "Policy change", category: "policy", cut: "hot", urgency: "high", status: "new" }),
    signal({ id: "b", title: "Rival launch", category: "competitor", cut: "warm", urgency: "low", status: "reviewing" }),
    signal({ id: "c", title: "Channel deal", category: "channel", cut: "cold", urgency: "medium", status: "dismissed", summary: "Wholesale pricing shift" }),
  ];

  it("narrows by each enum and by text over title, summary and note", () => {
    expect(filterSignals(rows, { category: "policy" }).map((row) => row.id)).toEqual(["a"]);
    expect(filterSignals(rows, { cut: "warm" }).map((row) => row.id)).toEqual(["b"]);
    expect(filterSignals(rows, { urgency: "medium" }).map((row) => row.id)).toEqual(["c"]);
    expect(filterSignals(rows, { status: "reviewing" }).map((row) => row.id)).toEqual(["b"]);
    expect(filterSignals(rows, { query: "wholesale" }).map((row) => row.id)).toEqual(["c"]);
    expect(filterSignals(rows, { query: "RIVAL" }).map((row) => row.id)).toEqual(["b"]);
  });

  it("treats `all` and an empty query as no narrowing, and says when something does narrow", () => {
    expect(filterSignals(rows, { status: "all", cut: "all", category: "all" })).toHaveLength(3);
    expect(filterSignals(rows, { query: "   " })).toHaveLength(3);
    expect(hasActiveFilters({ query: "", status: "all", cut: "all", category: "all" })).toBe(false);
    expect(hasActiveFilters({ status: "new" })).toBe(true);
    expect(hasActiveFilters({ query: "x" })).toBe(true);
  });
});
