import { describe, expect, it } from "vitest";
import {
  EMPTY_GOAL,
  EMPTY_GOAL_KEY_RESULT,
  EMPTY_MARKET_SIGNAL,
  GoalDetailSchema,
  GoalSchema,
  MarketSignalConvertResponseSchema,
  MarketSignalSchema,
} from "../api/schemas";
import {
  goalDetailOptions,
  goalKeys,
  goalListOptions,
  marketSignalListOptions,
} from "./queries";

function isUnder(key: readonly unknown[], prefix: readonly unknown[]): boolean {
  return prefix.every((part, index) => Object.is(part, key[index]));
}

describe("general manager workbench query keys (contract §13)", () => {
  it("writes ['goal', wsId, resource, filters]", () => {
    expect(goalKeys.list("ws-1", "goals", {})).toEqual(["goal", "ws-1", "goals", {}]);
    expect(goalKeys.list("ws-1", "goals", { cycle: "2026Q4", status: "active" })).toEqual([
      "goal",
      "ws-1",
      "goals",
      { cycle: "2026Q4", status: "active" },
    ]);
    expect(goalKeys.list("ws-1", "signals", { cut: "hot", status: "new" })).toEqual([
      "goal",
      "ws-1",
      "signals",
      { cut: "hot", status: "new" },
    ]);
  });

  it("keeps goals and signals apart", () => {
    expect(goalKeys.list("ws-1", "goals", { cycle: "2026Q4" })).not.toEqual(
      goalKeys.list("ws-1", "signals", { cycle: "2026Q4" }),
    );
    expect(goalListOptions("ws-1", { status: "active" }).queryKey).not.toEqual(
      marketSignalListOptions("ws-1", { status: "active" }).queryKey,
    );
  });

  it("nests detail reads under the domain prefix the mutations invalidate", () => {
    expect(goalKeys.detail("ws-1", "goals", "goal-1")).toEqual([
      "goal",
      "ws-1",
      "goals",
      { id: "goal-1" },
    ]);
    for (const key of [
      goalKeys.list("ws-1", "goals", {}),
      goalKeys.detail("ws-1", "goals", "goal-1"),
      goalKeys.list("ws-1", "signals", {}),
    ]) {
      expect(isUnder(key, goalKeys.all("ws-1"))).toBe(true);
    }
    expect(isUnder(goalKeys.list("ws-2", "goals", {}), goalKeys.all("ws-1"))).toBe(false);
  });

  it("stays disabled until the workspace (and the id) is known", () => {
    expect(goalListOptions("").enabled).toBe(false);
    expect(marketSignalListOptions("").enabled).toBe(false);
    expect(goalDetailOptions("", "goal-1").enabled).toBe(false);
    expect(goalDetailOptions("ws-1", "").enabled).toBe(false);
    expect(goalDetailOptions("ws-1", "goal-1").enabled).toBe(true);
  });
});

describe("general manager workbench schema defaults (contract §13)", () => {
  it("degrades a goal without children to empty lists, not nulls", () => {
    const goal = GoalSchema.parse({ id: "goal-1", title: "提升内容产能" });
    // The server always embeds both lists; a payload that omits them must still
    // render as a goal with no progress rather than blanking the board.
    expect(goal.key_results).toEqual([]);
    expect(goal.packages).toEqual([]);
    expect(goal.status).toBe("draft");
    expect(goal.priority).toBe("P2");
    expect(goal.cycle).toBe("");
    expect(EMPTY_GOAL.key_results).toEqual([]);
  });

  it("keeps an undecided target distinct from zero", () => {
    const undecided = EMPTY_GOAL_KEY_RESULT;
    expect(undecided.target).toBeNull();
    expect(undecided.current).toBe(0);

    const overAchieved = GoalSchema.parse({
      id: "goal-2",
      title: "超额目标",
      key_results: [{ id: "kr-1", title: "签约金额", target: 100, current: 130.5, unit: "万元" }],
    });
    const [keyResult] = overAchieved.key_results;
    expect(keyResult?.target).toBe(100);
    expect(keyResult?.current).toBe(130.5);
    // `current > target` is a stored fact, never a parse error.
    expect(keyResult?.current).toBeGreaterThan(keyResult?.target ?? 0);
  });

  it("degrades a goal detail without an issue list to an empty one", () => {
    const detail = GoalDetailSchema.parse({ id: "goal-3", title: "带任务的目标" });
    expect(detail.issues).toEqual([]);
  });

  it("reads an unprocessed signal as new with both landing pointers null", () => {
    const signal = MarketSignalSchema.parse({ id: "sig-1", title: "竞品降价" });
    expect(signal.status).toBe("new");
    expect(signal.cut).toBe("warm");
    expect(signal.urgency).toBe("medium");
    expect(signal.category).toBe("other");
    expect(signal.source).toBe("manual");
    expect(signal.score).toBeNull();
    expect(signal.converted_goal_id).toBeNull();
    expect(signal.converted_issue_id).toBeNull();
    expect(EMPTY_MARKET_SIGNAL.score).toBeNull();
  });

  it("carries exactly one landing point on a convert response", () => {
    const toGoal = MarketSignalConvertResponseSchema.parse({
      signal: {
        id: "sig-2",
        title: "渠道规则变更",
        status: "converted",
        converted_goal_id: "goal-9",
      },
      goal: { id: "goal-9", title: "渠道规则变更", cycle: "2026Q4" },
    });
    expect(toGoal.goal?.id).toBe("goal-9");
    expect(toGoal.issue).toBeUndefined();
    expect(toGoal.signal.status).toBe("converted");

    const toIssue = MarketSignalConvertResponseSchema.parse({
      signal: { id: "sig-3", title: "客户抱怨", status: "converted", converted_issue_id: "iss-1" },
      issue: { id: "iss-1", number: 12, title: "客户抱怨", status: "todo" },
    });
    expect(toIssue.issue?.id).toBe("iss-1");
    expect(toIssue.goal).toBeUndefined();
  });
});
