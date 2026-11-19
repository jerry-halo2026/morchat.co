// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parseWithFallback } from "../api/schema";
import {
  EMPTY_HR_OFFBOARDING,
  EMPTY_HR_OFFBOARDING_ADVANCE_RESPONSE,
  EMPTY_HR_OFFBOARDING_LIST_RESPONSE,
  HrOffboardingAdvanceResponseSchema,
  HrOffboardingListResponseSchema,
  HrOffboardingSchema,
} from "../api/schemas";
import {
  hrOffboardingDetailOptions,
  hrOffboardingListOptions,
  offboardKeys,
} from "./offboard";

/** True when `key` is inside the cache subtree rooted at `prefix`. */
function isUnder(key: readonly unknown[], prefix: readonly unknown[]): boolean {
  return prefix.every((part, index) => Object.is(part, key[index]));
}

describe("offboarding query keys (contract §15.7)", () => {
  it("writes ['offboard', wsId, 'offboardings', filters] for the list", () => {
    expect(offboardKeys.list("ws-1", {})).toEqual(["offboard", "ws-1", "offboardings", {}]);
    expect(offboardKeys.list("ws-1", { status: "handover" })).toEqual([
      "offboard",
      "ws-1",
      "offboardings",
      { status: "handover" },
    ]);
  });

  it("writes ['offboard', wsId, 'offboardings', { id }] for a detail read", () => {
    expect(offboardKeys.detail("ws-1", "off-1")).toEqual([
      "offboard",
      "ws-1",
      "offboardings",
      { id: "off-1" },
    ]);
  });

  it("keeps every key inside the workspace's domain prefix", () => {
    const all = offboardKeys.all("ws-1");
    expect(all).toEqual(["offboard", "ws-1"]);
    expect(isUnder(offboardKeys.list("ws-1", { status: "apply" }), all)).toBe(true);
    expect(isUnder(offboardKeys.detail("ws-1", "off-1"), all)).toBe(true);
    // Another workspace's rows are NOT under this prefix.
    expect(isUnder(offboardKeys.list("ws-2", {}), all)).toBe(false);
  });

  it("keeps a detail read inside its own resource prefix so invalidation reaches both", () => {
    expect(
      isUnder(offboardKeys.detail("ws-1", "off-1"), offboardKeys.resource("ws-1")),
    ).toBe(true);
  });

  it("builds options on those keys, with the filters carried through", () => {
    expect(hrOffboardingListOptions("ws-1").queryKey).toEqual([
      "offboard",
      "ws-1",
      "offboardings",
      {},
    ]);
    expect(hrOffboardingListOptions("ws-1", { status: "done", employee_id: "emp-1" }).queryKey).toEqual([
      "offboard",
      "ws-1",
      "offboardings",
      { status: "done", employee_id: "emp-1" },
    ]);
    expect(hrOffboardingDetailOptions("ws-1", "off-1").queryKey).toEqual([
      "offboard",
      "ws-1",
      "offboardings",
      { id: "off-1" },
    ]);
  });

  it("stays disabled until a workspace (and, for detail, an id) is known", () => {
    expect(hrOffboardingListOptions("").enabled).toBe(false);
    expect(hrOffboardingListOptions("ws-1").enabled).toBe(true);
    expect(hrOffboardingDetailOptions("ws-1", "").enabled).toBe(false);
    expect(hrOffboardingDetailOptions("ws-1", "off-1").enabled).toBe(true);
  });
});

// One record as docs/engineering/WORKBENCH-API.md §15.2 defines it, kept to the
// fields a client cannot render without.
const record = {
  id: "off-1",
  workspace_id: "ws",
  employee_id: "emp-1",
  status: "handover",
  last_day: "2026-12-31",
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-02T00:00:00Z",
};

describe("offboarding schemas (contract §15.3)", () => {
  it("defaults the optional columns and always yields a checklist array", () => {
    const parsed = HrOffboardingSchema.parse(record);
    expect(parsed).toMatchObject({
      status: "handover",
      last_day: "2026-12-31",
      reason: null,
      kind: "voluntary",
      handover: [],
      cert_done: false,
      note: null,
      owner_member_id: null,
      archived_at: null,
    });
  });

  it("keeps an unknown status rather than rewriting it", () => {
    // A segment this build does not know must still render as what the row says:
    // collapsing it to `apply` would show a finished exit as just started.
    const parsed = HrOffboardingSchema.parse({ ...record, status: "probation_handover" });
    expect(parsed.status).toBe("probation_handover");
  });

  it("keeps a checklist entry's tick and note, and defaults a sparse one", () => {
    const parsed = HrOffboardingSchema.parse({
      ...record,
      handover: [{ key: "ho-1", label: "权限回收", done: true, note: "已完成" }, { label: "客户对接人" }],
    });
    expect(parsed.handover).toHaveLength(2);
    expect(parsed.handover[0]).toEqual({
      key: "ho-1",
      label: "权限回收",
      done: true,
      note: "已完成",
    });
    expect(parsed.handover[1]).toMatchObject({ key: "", label: "客户对接人", done: false, note: "" });
  });

  it("carries leave_date on the employee the done transition answers", () => {
    const parsed = HrOffboardingAdvanceResponseSchema.parse({
      offboarding: { ...record, status: "done" },
      employee: {
        id: "emp-1",
        workspace_id: "ws",
        member_id: "user-1",
        leave_date: "2026-12-31",
      },
    });
    expect(parsed.offboarding.status).toBe("done");
    expect(parsed.employee?.leave_date).toBe("2026-12-31");
    // The rest of the profile keeps its schema defaults, so the roster panel can
    // read an advance answer without a second fetch.
    expect(parsed.employee?.ability).toEqual({});
  });

  it("answers a null employee for the step that does not move the file", () => {
    const parsed = HrOffboardingAdvanceResponseSchema.parse({
      offboarding: { ...record, status: "handover" },
      employee: null,
    });
    expect(parsed.employee).toBeNull();
  });

  it("defaults both envelopes rather than failing a drifted payload", () => {
    expect(HrOffboardingListResponseSchema.parse({})).toEqual({
      offboardings: [],
      total: 0,
    });
    const malformed = parseWithFallback(
      { offboardings: "not an array" },
      HrOffboardingListResponseSchema,
      EMPTY_HR_OFFBOARDING_LIST_RESPONSE,
      { endpoint: "offboard-test" },
    );
    expect(malformed).toEqual(EMPTY_HR_OFFBOARDING_LIST_RESPONSE);

    const bodylessAdvance = parseWithFallback(
      {},
      HrOffboardingAdvanceResponseSchema,
      EMPTY_HR_OFFBOARDING_ADVANCE_RESPONSE,
      { endpoint: "offboard-test" },
    );
    expect(bodylessAdvance).toEqual(EMPTY_HR_OFFBOARDING_ADVANCE_RESPONSE);
    expect(EMPTY_HR_OFFBOARDING.status).toBe("apply");
  });
});
