// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { Goal, GoalIssue, GoalKeyResult, GoalPackage } from "@morechat/core/types";
import {
  attachCandidates,
  bucketGoals,
  goalProgress,
  goalTone,
  keyResultProgress,
  keyResultRatio,
  keyResultStanding,
  packageSummary,
  packageTotals,
  sortGoals,
} from "./model";

/**
 * The goal page's arithmetic, pinned without a DOM.
 *
 * The two rules that matter most are the ones a reader would challenge: a goal's
 * percentage is the mean of its key results' own ratios (not a sum of targets, not
 * a count of tasks), and a key result's colour comes from the owner's status
 * before it comes from the number.
 */

const WS = "ws-1";

function keyResult(overrides: Partial<GoalKeyResult> = {}): GoalKeyResult {
  return {
    id: "kr-1",
    workspace_id: WS,
    goal_id: "goal-1",
    title: "Signed deals",
    target: 30,
    current: 12,
    unit: "deals",
    position: 0,
    status: "on_track",
    created_by: null,
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
    archived_at: null,
    ...overrides,
  };
}

function pkg(overrides: Partial<GoalPackage> = {}): GoalPackage {
  return {
    id: "pkg-1",
    workspace_id: WS,
    goal_id: "goal-1",
    department_id: "dept-design",
    title: "Signed deals — design",
    owner_member_id: "member-1",
    status: "active",
    position: 0,
    created_by: null,
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
    archived_at: null,
    ...overrides,
  };
}

function goal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: "goal-1",
    workspace_id: WS,
    cycle: "2026Q4",
    title: "Grow the creator bench",
    description: null,
    owner_member_id: "member-1",
    department_id: null,
    status: "active",
    due_date: "2026-12-31",
    priority: "P1",
    created_by: null,
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
    archived_at: null,
    key_results: [],
    packages: [],
    ...overrides,
  };
}

function attached(id: string): GoalIssue {
  return { id, number: 1, title: "Task", status: "todo", goal_id: "goal-1" };
}

describe("key result progress", () => {
  it("divides by the result's own target and leaves an undecided target unmeasured", () => {
    expect(keyResultRatio({ current: 12, target: 30 })).toBeCloseTo(0.4);
    // Over-achievement keeps its ratio; the bar caps, the figure does not.
    expect(keyResultProgress({ current: 45, target: 30 })).toEqual({
      percent: 100,
      measured: true,
      tone: "success",
    });
    // 0 of 0 is met, not a division by zero.
    expect(keyResultProgress({ current: 0, target: 0 })).toEqual({
      percent: 100,
      measured: true,
      tone: "success",
    });
    expect(keyResultProgress({ current: 7, target: null })).toEqual({
      percent: 0,
      measured: false,
      tone: "neutral",
    });
    // Under half is the only ratio-driven warning.
    expect(keyResultProgress({ current: 14, target: 30 }).tone).toBe("warning");
    expect(keyResultProgress({ current: 15, target: 30 }).tone).toBe("neutral");
  });

  it("lets the owner's status outrank the number", () => {
    expect(keyResultStanding(keyResult({ status: "done", current: 3, target: 30 }))).toMatchObject({
      percent: 100,
      tone: "success",
    });
    expect(keyResultStanding(keyResult({ status: "off_track" })).tone).toBe("danger");
    expect(keyResultStanding(keyResult({ status: "at_risk" })).tone).toBe("warning");
    // "On track" is a judgement: a slow bar is drawn neutral, never as a warning.
    expect(keyResultStanding(keyResult({ status: "on_track", current: 2, target: 30 }))).toMatchObject(
      { percent: 7, tone: "neutral" },
    );
  });
});

describe("goal progress", () => {
  it("averages the measurable key results and ignores the ones with no target", () => {
    const progress = goalProgress(
      goal({
        key_results: [
          keyResult({ id: "kr-1", current: 15, target: 30 }), // 50%
          keyResult({ id: "kr-2", current: 2, target: 4 }), // 50%
          keyResult({ id: "kr-3", current: 9, target: null }), // not measurable
        ],
      }),
    );
    expect(progress).toEqual({ percent: 50, measured: true, keyResults: 3 });
  });

  it("clamps an over-achieved result to its own 100% before averaging", () => {
    const progress = goalProgress(
      goal({
        key_results: [
          keyResult({ id: "kr-1", current: 60, target: 30 }), // 200% → 100%
          keyResult({ id: "kr-2", current: 0, target: 10 }), // 0%
        ],
      }),
    );
    expect(progress.percent).toBe(50);
  });

  it("reports nothing measurable rather than 0%", () => {
    expect(goalProgress(goal({ key_results: [] }))).toEqual({
      percent: 0,
      measured: false,
      keyResults: 0,
    });
    expect(
      goalProgress(goal({ key_results: [keyResult({ target: null })] })).measured,
    ).toBe(false);
  });

  it("colours the bar by status first, ratio second", () => {
    expect(goalTone(goal({ status: "cancelled", key_results: [keyResult()] }))).toBe("neutral");
    expect(goalTone(goal({ status: "done", key_results: [] }))).toBe("success");
    expect(
      goalTone(goal({ key_results: [keyResult({ current: 3, target: 30 })] })),
    ).toBe("warning");
    expect(
      goalTone(goal({ key_results: [keyResult({ current: 30, target: 30 })] })),
    ).toBe("success");
  });
});

describe("department packages", () => {
  it("sums a department's packages into one line", () => {
    const totals = packageTotals([
      pkg({ id: "pkg-1", department_id: "dept-design", status: "active" }),
      pkg({ id: "pkg-2", department_id: "dept-design", status: "done" }),
      pkg({ id: "pkg-3", department_id: "dept-ops", status: "active" }),
    ]);
    expect(totals).toEqual([
      { departmentId: "dept-design", total: 2, active: 1, done: 1 },
      { departmentId: "dept-ops", total: 1, active: 1, done: 0 },
    ]);
    // Largest group first; the summary counts the rows, not the groups.
    expect(packageSummary([pkg({ id: "a" }), pkg({ id: "b" })])).toEqual({ active: 2, total: 2 });
  });
});

describe("the list's order and buckets", () => {
  it("puts P0 first, then the earlier deadline, then the newer cycle", () => {
    const rows = sortGoals([
      goal({ id: "p2", priority: "P2", due_date: "2026-11-01" }),
      goal({ id: "p0-late", priority: "P0", due_date: "2026-12-31" }),
      goal({ id: "p0-early", priority: "P0", due_date: "2026-11-30" }),
      goal({ id: "p1", priority: "P1", due_date: null }),
    ]);
    expect(rows.map((row) => row.id)).toEqual(["p0-early", "p0-late", "p1", "p2"]);
  });

  it("keeps a paused goal among the open ones", () => {
    const buckets = bucketGoals([
      goal({ id: "draft", status: "draft" }),
      goal({ id: "paused", status: "paused" }),
      goal({ id: "done", status: "done" }),
      goal({ id: "cancelled", status: "cancelled" }),
    ]);
    expect(buckets.draft.map((row) => row.id)).toEqual(["draft"]);
    expect(buckets.open.map((row) => row.id)).toEqual(["paused"]);
    expect(buckets.closed.map((row) => row.id)).toEqual(["done", "cancelled"]);
  });
});

describe("attach candidates", () => {
  const issue = (id: string, identifier: string, title: string) => ({
    id,
    identifier,
    title,
    status: "todo",
  });

  it("drops what is already attached and honours the search", () => {
    const issues = [
      issue("i-1", "MUL-1", "Draft the brief"),
      issue("i-2", "MUL-2", "Call the studio"),
      issue("i-3", "MUL-3", "Book the shoot"),
    ];
    expect(attachCandidates(issues, [attached("i-2")]).map((row) => row.id)).toEqual(["i-1", "i-3"]);
    expect(attachCandidates(issues, [], "studio").map((row) => row.id)).toEqual(["i-2"]);
    expect(attachCandidates(issues, [], "mul-3").map((row) => row.id)).toEqual(["i-3"]);
    expect(attachCandidates(issues, [], "", 1).map((row) => row.id)).toEqual(["i-1"]);
  });
});
