// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { Goal, GoalDetail, GoalIssue } from "@morechat/core/types";
import {
  buildTaskGroups,
  filterTaskGroups,
  nonEmptyGroups,
  taskCount,
  type IssueJoin,
} from "./model";

/**
 * 任务派发's grouping, pinned without a DOM: which goal a task belongs to, what a
 * goal with no task looks like, and what the page does with a task the issue-list
 * join could not see.
 */

const WS = "ws-1";

function goal(id: string, title: string, overrides: Partial<Goal> = {}): Goal {
  return {
    id,
    workspace_id: WS,
    cycle: "2026Q4",
    title,
    description: null,
    owner_member_id: "member-1",
    department_id: null,
    status: "active",
    due_date: null,
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

function issue(id: string, number: number, title: string, status = "todo"): GoalIssue {
  return { id, number, title, status, goal_id: "goal-1" };
}

function detail(base: Goal, issues: GoalIssue[]): GoalDetail {
  return { ...base, issues };
}

function join(id: string, identifier: string, updatedAt: string, ownerId: string | null): IssueJoin {
  return {
    id,
    identifier,
    assignee_type: ownerId === null ? null : "member",
    assignee_id: ownerId,
    updated_at: updatedAt,
  };
}

describe("buildTaskGroups", () => {
  it("groups by goal, keeps a goal with no task, and joins owner and update time", () => {
    const withWork = goal("goal-1", "Grow the bench");
    const empty = goal("goal-2", "Open the second studio");
    const groups = buildTaskGroups(
      [withWork, empty],
      [
        detail(withWork, [issue("i-1", 11, "Draft the brief"), issue("i-2", 12, "Call the studio")]),
        detail(empty, []),
      ],
      [join("i-1", "MUL-11", "2026-11-10T00:00:00Z", "member-2")],
    );

    expect(groups.map((group) => group.goal.id)).toEqual(["goal-1", "goal-2"]);
    expect(groups[0]?.tasks).toHaveLength(2);
    expect(groups[0]?.tasks[0]).toMatchObject({
      id: "i-1",
      identifier: "MUL-11",
      ownerId: "member-2",
      updatedAt: "2026-11-10T00:00:00Z",
    });
    // The join did not carry this one: identity from the goal side, no guess.
    expect(groups[0]?.tasks[1]).toMatchObject({
      id: "i-2",
      identifier: null,
      ownerId: null,
      updatedAt: null,
    });
    expect(groups[1]?.tasks).toEqual([]);
  });

  it("orders each group's tasks newest first", () => {
    const base = goal("goal-1", "Grow the bench");
    const groups = buildTaskGroups(
      [base],
      [
        detail(base, [
          issue("old", 1, "Old"),
          issue("new", 2, "New"),
          issue("never", 3, "Never seen"),
        ]),
      ],
      [
        join("old", "MUL-1", "2026-10-01T00:00:00Z", null),
        join("new", "MUL-2", "2026-11-15T00:00:00Z", null),
      ],
    );

    expect(groups[0]?.tasks.map((task) => task.id)).toEqual(["new", "old", "never"]);
  });

  it("treats an unresolved detail as an empty group, not a missing goal", () => {
    const first = goal("goal-1", "First");
    const second = goal("goal-2", "Second");
    const groups = buildTaskGroups([first, second], [detail(first, [issue("i-1", 1, "A")])], []);

    expect(groups).toHaveLength(2);
    expect(groups.find((group) => group.goal.id === "goal-2")?.tasks).toEqual([]);
  });

  it("counts only the groups that hold work", () => {
    const first = goal("goal-1", "First");
    const second = goal("goal-2", "Second");
    const groups = buildTaskGroups(
      [first, second],
      [detail(first, [issue("i-1", 1, "A"), issue("i-2", 2, "B")]), detail(second, [])],
      [],
    );

    expect(nonEmptyGroups(groups).map((group) => group.goal.id)).toEqual(["goal-1"]);
    expect(taskCount(groups)).toBe(2);
  });
});

describe("filterTaskGroups", () => {
  const first = goal("goal-1", "Grow the bench");
  const second = goal("goal-2", "Open the second studio");
  const groups = buildTaskGroups(
    [first, second],
    [
      detail(first, [issue("i-1", 11, "Draft the brief"), issue("i-2", 12, "Call the studio")]),
      detail(second, [issue("i-3", 13, "Sign the lease")]),
    ],
    [
      join("i-1", "MUL-11", "2026-11-10T00:00:00Z", "member-2"),
      join("i-2", "MUL-12", "2026-11-11T00:00:00Z", "member-3"),
      join("i-3", "MUL-13", "2026-11-12T00:00:00Z", null),
    ],
  );

  const ownerNameOf = (ownerId: string | null): string | null => {
    if (ownerId === "member-2") return "Lin Wei";
    if (ownerId === "member-3") return "Zhou Min";
    return null;
  };

  it("keeps every task of a goal whose title matched", () => {
    const visible = filterTaskGroups(groups, "second studio", ownerNameOf);
    expect(visible).toHaveLength(1);
    expect(visible[0]?.tasks).toHaveLength(1);
  });

  it("narrows to the matching tasks when the goal title did not match", () => {
    const visible = filterTaskGroups(groups, "call", ownerNameOf);
    expect(visible.map((group) => group.goal.id)).toEqual(["goal-1"]);
    expect(visible[0]?.tasks.map((task) => task.id)).toEqual(["i-2"]);
  });

  it("matches on identifier and on the owner's name", () => {
    expect(filterTaskGroups(groups, "MUL-13", ownerNameOf)[0]?.tasks[0]?.id).toBe("i-3");
    expect(filterTaskGroups(groups, "Lin Wei", ownerNameOf)[0]?.tasks[0]?.id).toBe("i-1");
    expect(filterTaskGroups(groups, "nobody", ownerNameOf)).toEqual([]);
  });

  it("returns every group for an empty query", () => {
    expect(filterTaskGroups(groups, "   ", ownerNameOf)).toHaveLength(2);
  });
});
