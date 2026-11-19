// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parseWithFallback } from "../api/schema";
import {
  EMPTY_HR_EMPLOYEE_CHANGE,
  EMPTY_HR_EMPLOYEE_CHANGE_LIST_RESPONSE,
  HrEmployeeChangeListResponseSchema,
  HrEmployeeChangeSchema,
} from "../api/schemas";
import { changeKeys, hrEmployeeChangeListOptions } from "./change";

/** True when `key` is inside the cache subtree rooted at `prefix`. */
function isUnder(key: readonly unknown[], prefix: readonly unknown[]): boolean {
  return prefix.every((part, index) => Object.is(part, key[index]));
}

describe("change stream query keys (contract §16.7)", () => {
  it("writes ['change', wsId, 'changes', filters] for the list", () => {
    expect(changeKeys.list("ws-1", {})).toEqual(["change", "ws-1", "changes", {}]);
    expect(changeKeys.list("ws-1", { kind: "salary", employee_id: "emp-1" })).toEqual([
      "change",
      "ws-1",
      "changes",
      { kind: "salary", employee_id: "emp-1" },
    ]);
  });

  it("keeps every key inside the workspace's domain prefix", () => {
    const all = changeKeys.all("ws-1");
    expect(all).toEqual(["change", "ws-1"]);
    expect(isUnder(changeKeys.list("ws-1", { kind: "move" }), all)).toBe(true);
    // Another workspace's rows are NOT under this prefix.
    expect(isUnder(changeKeys.list("ws-2", {}), all)).toBe(false);
  });

  it("builds options on those keys, with the filters carried through", () => {
    expect(hrEmployeeChangeListOptions("ws-1").queryKey).toEqual([
      "change",
      "ws-1",
      "changes",
      {},
    ]);
    expect(
      hrEmployeeChangeListOptions("ws-1", { employee_id: "emp-1", from: "2026-01-01" }).queryKey,
    ).toEqual(["change", "ws-1", "changes", { employee_id: "emp-1", from: "2026-01-01" }]);
  });

  it("stays disabled until a workspace is known", () => {
    expect(hrEmployeeChangeListOptions("").enabled).toBe(false);
    expect(hrEmployeeChangeListOptions("ws-1").enabled).toBe(true);
  });
});

// One row as docs/engineering/WORKBENCH-API.md §16.2 defines it, kept to the
// fields a client cannot render without.
const record = {
  id: "chg-1",
  workspace_id: "ws",
  employee_id: "emp-1",
  kind: "move",
  effective_on: "2026-04-01",
  created_at: "2026-04-02T00:00:00Z",
};

describe("change stream schemas (contract §16.3)", () => {
  it("defaults the optional columns and leaves every from/to pair null", () => {
    const parsed = HrEmployeeChangeSchema.parse(record);
    expect(parsed).toMatchObject({
      kind: "move",
      effective_on: "2026-04-01",
      from_department_id: null,
      to_department_id: null,
      from_grade: null,
      to_grade: null,
      from_amount: null,
      to_amount: null,
      currency: "",
      note: null,
      archived_at: null,
    });
  });

  it("keeps an unknown kind rather than relabelling it", () => {
    // A kind this build does not know must still render as what the row says:
    // folding it into `other` would rewrite somebody's history on screen.
    const parsed = HrEmployeeChangeSchema.parse({ ...record, kind: "probation_extended" });
    expect(parsed.kind).toBe("probation_extended");
  });

  it("carries a salary row's amounts as numbers and its from/to pair", () => {
    const parsed = HrEmployeeChangeSchema.parse({
      ...record,
      kind: "salary",
      from_amount: 20000,
      to_amount: 24000.5,
      currency: "CNY",
      note: "年度调薪",
    });
    expect(parsed.from_amount).toBe(20000);
    expect(parsed.to_amount).toBe(24000.5);
    expect(parsed.currency).toBe("CNY");
  });

  it("defaults the envelope rather than failing a drifted payload", () => {
    expect(HrEmployeeChangeListResponseSchema.parse({})).toEqual({
      changes: [],
      total: 0,
    });
    const malformed = parseWithFallback(
      { changes: "not an array" },
      HrEmployeeChangeListResponseSchema,
      EMPTY_HR_EMPLOYEE_CHANGE_LIST_RESPONSE,
      { endpoint: "change-test" },
    );
    expect(malformed).toEqual(EMPTY_HR_EMPLOYEE_CHANGE_LIST_RESPONSE);
    // The row default is a readable empty row, not an exception.
    expect(EMPTY_HR_EMPLOYEE_CHANGE.kind).toBe("other");
    expect(EMPTY_HR_EMPLOYEE_CHANGE.to_amount).toBeNull();
  });
});
