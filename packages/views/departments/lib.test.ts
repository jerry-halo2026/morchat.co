// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { Department, MemberWithUser, Project } from "@morechat/core/types";
import {
  ALL_DEPARTMENTS,
  NO_DEPARTMENT,
  departmentMoveCounts,
  departmentName,
  departmentOptions,
  memberDepartmentId,
  memberMatchesDepartment,
  projectDepartmentId,
} from "./lib";

const PLATFORM = "11111111-1111-4111-8111-111111111111";
const SALES = "22222222-2222-4222-8222-222222222222";

function department(id: string, name: string): Department {
  return {
    id,
    workspace_id: "ws",
    name,
    lead_user_id: null,
    system_key: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

const DEPARTMENTS = [department(PLATFORM, "Platform"), department(SALES, "Sales")];

function member(departmentId?: string | null): Pick<MemberWithUser, "department_id"> {
  return { department_id: departmentId };
}

describe("department labels", () => {
  it("resolves a department name and treats a missing or unknown id as none", () => {
    expect(departmentName(DEPARTMENTS, PLATFORM)).toBe("Platform");
    expect(departmentName(DEPARTMENTS, null)).toBeNull();
    expect(departmentName(DEPARTMENTS, "unknown")).toBeNull();
  });

  it("lists departments as select options in server order", () => {
    expect(departmentOptions(DEPARTMENTS)).toEqual([
      { value: PLATFORM, label: "Platform" },
      { value: SALES, label: "Sales" },
    ]);
  });
});

describe("member department attribution", () => {
  it("treats an absent, null, or blank department as unassigned", () => {
    expect(memberDepartmentId(member(undefined))).toBeNull();
    expect(memberDepartmentId(member(null))).toBeNull();
    expect(memberDepartmentId(member("  "))).toBeNull();
    expect(memberDepartmentId(member(` ${PLATFORM} `))).toBe(PLATFORM);
  });

  it("filters by department, by unassigned, and by all", () => {
    expect(memberMatchesDepartment(member(PLATFORM), ALL_DEPARTMENTS)).toBe(true);
    expect(memberMatchesDepartment(member(PLATFORM), PLATFORM)).toBe(true);
    expect(memberMatchesDepartment(member(PLATFORM), SALES)).toBe(false);
    expect(memberMatchesDepartment(member(PLATFORM), NO_DEPARTMENT)).toBe(false);
    expect(memberMatchesDepartment(member(undefined), NO_DEPARTMENT)).toBe(true);
    expect(memberMatchesDepartment(member(null), PLATFORM)).toBe(false);
  });
});

describe("project department tag", () => {
  const project = { id: "p1", title: "Inbox" } as Project;

  it("reads the optional field without inventing one", () => {
    expect(projectDepartmentId(project)).toBeNull();
    expect(
      projectDepartmentId({ ...project, department_id: PLATFORM } as Project),
    ).toBe(PLATFORM);
    expect(
      projectDepartmentId({ ...project, department_id: "  " } as Project),
    ).toBeNull();
    expect(
      projectDepartmentId({ ...project, department_id: null } as Project),
    ).toBeNull();
  });
});

describe("department move counts", () => {
  it("counts the project ids the move added and removed", () => {
    expect(
      departmentMoveCounts({ added_projects: ["a", "b"], removed_projects: [] }),
    ).toEqual({ added: 2, removed: 0 });
    expect(
      departmentMoveCounts({ added_projects: [], removed_projects: ["c"] }),
    ).toEqual({ added: 0, removed: 1 });
  });
});
