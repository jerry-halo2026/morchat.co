// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parseWithFallback } from "../api/schema";
import {
  EMPTY_HR_EMPLOYEE_REWARD,
  EMPTY_HR_EMPLOYEE_REWARD_LIST_RESPONSE,
  HrEmployeeRewardListResponseSchema,
  HrEmployeeRewardSchema,
} from "../api/schemas";
import { hrEmployeeRewardListOptions, rewardKeys } from "./reward";

/** True when `key` is inside the cache subtree rooted at `prefix`. */
function isUnder(key: readonly unknown[], prefix: readonly unknown[]): boolean {
  return prefix.every((part, index) => Object.is(part, key[index]));
}

describe("reward query keys (contract §17.7)", () => {
  it("writes ['reward', wsId, 'rewards', filters] for the list", () => {
    expect(rewardKeys.list("ws-1", {})).toEqual(["reward", "ws-1", "rewards", {}]);
    expect(rewardKeys.list("ws-1", { kind: "discipline", employee_id: "emp-1" })).toEqual([
      "reward",
      "ws-1",
      "rewards",
      { kind: "discipline", employee_id: "emp-1" },
    ]);
  });

  it("keeps every key inside the workspace's domain prefix", () => {
    const all = rewardKeys.all("ws-1");
    expect(all).toEqual(["reward", "ws-1"]);
    expect(isUnder(rewardKeys.list("ws-1", { kind: "reward" }), all)).toBe(true);
    // Another workspace's rows are NOT under this prefix.
    expect(isUnder(rewardKeys.list("ws-2", {}), all)).toBe(false);
  });

  it("builds options on those keys, with the filters carried through", () => {
    expect(hrEmployeeRewardListOptions("ws-1").queryKey).toEqual(["reward", "ws-1", "rewards", {}]);
    expect(
      hrEmployeeRewardListOptions("ws-1", { employee_id: "emp-1", from: "2026-01-01" }).queryKey,
    ).toEqual(["reward", "ws-1", "rewards", { employee_id: "emp-1", from: "2026-01-01" }]);
  });

  it("stays disabled until a workspace is known", () => {
    expect(hrEmployeeRewardListOptions("").enabled).toBe(false);
    expect(hrEmployeeRewardListOptions("ws-1").enabled).toBe(true);
  });
});

// One row as docs/engineering/WORKBENCH-API.md §17.2 defines it, kept to the
// fields a client cannot render without.
const record = {
  id: "rwd-1",
  workspace_id: "ws",
  employee_id: "emp-1",
  kind: "reward",
  reason: "连续三个月交付无延误",
  decided_on: "2026-03-01",
  created_at: "2026-03-02T00:00:00Z",
};

describe("reward schemas (contract §17.3)", () => {
  it("defaults the optional columns and leaves the money null", () => {
    const parsed = HrEmployeeRewardSchema.parse(record);
    expect(parsed).toMatchObject({
      kind: "reward",
      reason: "连续三个月交付无延误",
      decided_on: "2026-03-01",
      category: null,
      // Null is "no money attached", which is not the same as 0.
      amount: null,
      currency: "CNY",
      note: null,
      owner_member_id: null,
      archived_at: null,
    });
  });

  it("keeps an unknown kind rather than relabelling it", () => {
    // A kind this build does not know must still render as what the row says:
    // folding it into `reward` would relabel somebody's 处分 on screen.
    const parsed = HrEmployeeRewardSchema.parse({ ...record, kind: "probation_notice" });
    expect(parsed.kind).toBe("probation_notice");
  });

  it("carries a fine as a positive number on a discipline row", () => {
    const parsed = HrEmployeeRewardSchema.parse({
      ...record,
      kind: "discipline",
      category: "考勤",
      amount: 500.5,
      currency: "CNY",
      note: "首次提醒",
    });
    expect(parsed.amount).toBe(500.5);
    expect(parsed.kind).toBe("discipline");
    // The sign lives in `kind`, never in the number.
    expect(parsed.amount).toBeGreaterThan(0);
  });

  it("keeps a zero amount distinct from no money at all", () => {
    expect(HrEmployeeRewardSchema.parse({ ...record, amount: 0 }).amount).toBe(0);
    expect(HrEmployeeRewardSchema.parse({ ...record, amount: null }).amount).toBeNull();
  });

  it("defaults the envelope rather than failing a drifted payload", () => {
    expect(HrEmployeeRewardListResponseSchema.parse({})).toEqual({
      rewards: [],
      total: 0,
    });
    const malformed = parseWithFallback(
      { rewards: "not an array" },
      HrEmployeeRewardListResponseSchema,
      EMPTY_HR_EMPLOYEE_REWARD_LIST_RESPONSE,
      { endpoint: "reward-test" },
    );
    expect(malformed).toEqual(EMPTY_HR_EMPLOYEE_REWARD_LIST_RESPONSE);
    // The row default is a readable empty row, not an exception.
    expect(EMPTY_HR_EMPLOYEE_REWARD.kind).toBe("reward");
    expect(EMPTY_HR_EMPLOYEE_REWARD.amount).toBeNull();
    expect(EMPTY_HR_EMPLOYEE_REWARD.currency).toBe("CNY");
  });
});
