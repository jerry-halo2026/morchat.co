// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { Department, HrEmployeeProfile, MemberWithUser } from "@morechat/core/types";
import {
  abilityTags,
  buildTeamRows,
  departmentShares,
  discTags,
  employmentStatus,
  filterTeamRows,
  localDayOf,
} from "./model";

/**
 * The team page's classification, pinned without a DOM.
 *
 * The matrix below is the whole point of the page: a person's state comes from
 * three HR dates, each of which can be missing, and every combination has one
 * answer. "No HR file" is an answer about the ledger, never a state invented for
 * the person.
 */

const WS = "ws-1";
const TODAY = "2026-11-18";

function member(
  id: string,
  name: string,
  overrides: Partial<MemberWithUser> = {},
): MemberWithUser {
  return {
    id,
    workspace_id: WS,
    user_id: `user-${id}`,
    role: "member",
    created_at: "2026-01-01T00:00:00Z",
    name,
    email: `${id}@acme.test`,
    avatar_url: null,
    department_id: "dept-design",
    ...overrides,
  };
}

function employee(overrides: Partial<HrEmployeeProfile> = {}): HrEmployeeProfile {
  return {
    id: "emp-1",
    workspace_id: WS,
    member_id: "member-1",
    department_id: null,
    job_title: null,
    grade: null,
    hire_date: "2026-01-05",
    regular_date: "2026-04-05",
    contract_end: null,
    leave_date: null,
    ability: {},
    disc: {},
    owner_member_id: null,
    created_by: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    archived_at: null,
    ...overrides,
  };
}

const departments: Department[] = [
  {
    id: "dept-design",
    workspace_id: WS,
    name: "Design",
    lead_user_id: null,
    system_key: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "dept-ops",
    workspace_id: WS,
    name: "Ops",
    lead_user_id: null,
    system_key: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
];

describe("employment status", () => {
  it("reads the three dates in order", () => {
    // No file at all: a statement about the HR ledger, not about the person.
    expect(employmentStatus(null, TODAY)).toBe("missing");
    // On the roster, start day never written down.
    expect(employmentStatus(employee({ hire_date: null }), TODAY)).toBe("active");
    // A start day that has not arrived.
    expect(employmentStatus(employee({ hire_date: "2026-12-01" }), TODAY)).toBe("pending");
    // Hired, not confirmed.
    expect(employmentStatus(employee({ regular_date: null }), TODAY)).toBe("probation");
    expect(employmentStatus(employee({ regular_date: "2026-12-01" }), TODAY)).toBe("probation");
    // Confirmed.
    expect(employmentStatus(employee(), TODAY)).toBe("active");
    // A departure that has happened wins over everything else.
    expect(employmentStatus(employee({ leave_date: "2026-10-31" }), TODAY)).toBe("left");
    expect(
      employmentStatus(
        employee({ hire_date: "2026-12-01", leave_date: "2026-10-31" }),
        TODAY,
      ),
    ).toBe("left");
    // A departure still ahead keeps today's state.
    expect(employmentStatus(employee({ leave_date: "2026-12-31" }), TODAY)).toBe("active");
    expect(
      employmentStatus(employee({ regular_date: null, leave_date: "2026-12-31" }), TODAY),
    ).toBe("probation");
  });

  it("compares calendar days, not instants", () => {
    expect(localDayOf(new Date(2026, 10, 18, 23, 30))).toBe("2026-11-18");
    expect(localDayOf(new Date(2026, 0, 5, 0, 5))).toBe("2026-01-05");
    // The day itself counts as arrived.
    expect(employmentStatus(employee({ leave_date: TODAY }), TODAY)).toBe("left");
    expect(employmentStatus(employee({ regular_date: TODAY }), TODAY)).toBe("active");
  });
});

describe("tag extraction", () => {
  it("keeps the three strongest abilities and drops the zeroes", () => {
    const tags = abilityTags({ react: 9, ops: 4, comm: 7, legal: 0, design: 6 });
    expect(tags).toEqual([
      { key: "react", value: 9 },
      { key: "comm", value: 7 },
      { key: "design", value: 6 },
    ]);
    // Ties break on the key, so the order never depends on JSONB ordering.
    expect(abilityTags({ b: 5, a: 5 }).map((tag) => tag.key)).toEqual(["a", "b"]);
    expect(abilityTags({})).toEqual([]);
  });

  it("keeps the dominant working style only", () => {
    expect(discTags({ d: 8, i: 3, s: 1, c: 0 })).toEqual([{ key: "d", value: 8 }]);
    expect(discTags({})).toEqual([]);
  });
});

describe("department distribution", () => {
  it("counts each department, keeps the unassigned band, and rounds the share", () => {
    const shares = departmentShares(
      [
        member("m-1", "Lin Wei"),
        member("m-2", "Zhou Min"),
        member("m-3", "Qiao", { department_id: "dept-ops" }),
        member("m-4", "He Yuan", { department_id: null }),
        // A department the workspace no longer has is counted as unassigned.
        member("m-5", "Song", { department_id: "dept-gone" }),
      ],
      departments,
    );

    expect(shares.map((share) => [share.name, share.members, share.percent])).toEqual([
      ["Design", 2, 40],
      [null, 2, 40],
      ["Ops", 1, 20],
    ]);
  });

  it("returns nothing for an empty roster instead of dividing by zero", () => {
    expect(departmentShares([], departments)).toEqual([]);
  });

  it("lists only departments that hold someone", () => {
    const shares = departmentShares([member("m-1", "Lin Wei")], departments);
    expect(shares).toHaveLength(1);
    expect(shares[0]?.departmentId).toBe("dept-design");
    expect(shares[0]?.percent).toBe(100);
  });
});

describe("rows", () => {
  it("joins the file by member_id and leaves the rest empty", () => {
    const rows = buildTeamRows(
      [member("member-2", "Zhou Min"), member("member-1", "Lin Wei")],
      [employee({ member_id: "member-1", ability: { react: 9 }, disc: { d: 6 } })],
      TODAY,
    );

    expect(rows.map((row) => row.member.name)).toEqual(["Lin Wei", "Zhou Min"]);
    expect(rows[0]?.status).toBe("active");
    expect(rows[0]?.ability).toEqual([{ key: "react", value: 9 }]);
    // No file: missing, and no invented tags.
    expect(rows[1]?.employee).toBeNull();
    expect(rows[1]?.status).toBe("missing");
    expect(rows[1]?.ability).toEqual([]);
  });

  it("treats a failed HR read as no files rather than as no people", () => {
    const rows = buildTeamRows([member("member-1", "Lin Wei")], null, TODAY);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe("missing");
  });

  it("filters by state, by department (including none) and by text", () => {
    const rows = buildTeamRows(
      [
        member("m-1", "Lin Wei", { role: "owner" }),
        member("m-2", "Zhou Min", { department_id: null }),
        member("m-3", "Qiao", { department_id: "dept-ops" }),
      ],
      [
        employee({ member_id: "m-1", job_title: "Designer", ability: { react: 9 } }),
        employee({ member_id: "m-2", hire_date: "2026-12-01" }),
      ],
      TODAY,
    );
    const departmentNameOf = (id: string | null) =>
      departments.find((department) => department.id === id)?.name ?? null;

    expect(filterTeamRows(rows, { status: "pending" }, departmentNameOf)).toHaveLength(1);
    expect(filterTeamRows(rows, { status: "missing" }, departmentNameOf)).toHaveLength(1);
    expect(
      filterTeamRows(rows, { department: "none" }, departmentNameOf).map(
        (row) => row.member.name,
      ),
    ).toEqual(["Zhou Min"]);
    expect(filterTeamRows(rows, { department: "dept-ops" }, departmentNameOf)).toHaveLength(1);
    // Search reaches the department name, the job title and the tag keys.
    expect(filterTeamRows(rows, { query: "ops" }, departmentNameOf)).toHaveLength(1);
    expect(filterTeamRows(rows, { query: "designer" }, departmentNameOf)).toHaveLength(1);
    expect(filterTeamRows(rows, { query: "react" }, departmentNameOf)).toHaveLength(1);
    expect(filterTeamRows(rows, { query: "nobody" }, departmentNameOf)).toEqual([]);
    expect(filterTeamRows(rows, {}, departmentNameOf)).toHaveLength(3);
  });
});
