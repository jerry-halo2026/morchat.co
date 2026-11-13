/**
 * Department rendering helpers (docs/engineering/ORG-MODEL.md §3).
 *
 * A department is attribution: which unit a member belongs to and which unit a
 * project is filed under. Nothing here decides visibility — the server owns
 * access — so these functions only answer "which unit is this filed under" and
 * "does it match this filter".
 */

import type { Department, MemberWithUser, Project } from "@morechat/core/types";

/**
 * Option value for "unassigned". Department ids are UUIDs, so a sentinel that
 * starts with neither a digit nor a letter cannot collide with one.
 */
export const NO_DEPARTMENT = "none";

/** Option value for "every department" in the member filter. */
export const ALL_DEPARTMENTS = "all";

export interface DepartmentOption {
  value: string;
  label: string;
}

/**
 * The member's department id, or null. A backend that predates departments
 * omits the field entirely, and both that and an empty string mean "unassigned".
 */
export function memberDepartmentId(
  member: Pick<MemberWithUser, "department_id">,
): string | null {
  const id = member.department_id?.trim();
  return id ? id : null;
}

/**
 * The project's department id, or null. Optional on the payload and read
 * defensively: the field is not served yet, and a card without it renders no
 * tag rather than an empty one.
 */
export function projectDepartmentId(project: Project): string | null {
  const id = (project as Project & { department_id?: string | null }).department_id;
  return typeof id === "string" && id.trim() ? id.trim() : null;
}

/** The department's name, or null when the id is unset or unknown. */
export function departmentName(
  departments: readonly Department[],
  id: string | null | undefined,
): string | null {
  if (!id) return null;
  return departments.find((department) => department.id === id)?.name ?? null;
}

/** Departments as select options, in the order the server lists them. */
export function departmentOptions(
  departments: readonly Department[],
): DepartmentOption[] {
  return departments.map((department) => ({
    value: department.id,
    label: department.name,
  }));
}

/**
 * The member filter's test. `filter` is {@link ALL_DEPARTMENTS},
 * {@link NO_DEPARTMENT}, or a department id.
 */
export function memberMatchesDepartment(
  member: Pick<MemberWithUser, "department_id">,
  filter: string,
): boolean {
  if (filter === ALL_DEPARTMENTS) return true;
  const id = memberDepartmentId(member);
  return filter === NO_DEPARTMENT ? id === null : id === filter;
}

/**
 * How many projects a move touched. The server answers with project ids, not
 * counts, because which projects changed matters more than how many.
 */
export function departmentMoveCounts(change: {
  added_projects: string[];
  removed_projects: string[];
}): { added: number; removed: number } {
  return {
    added: change.added_projects.length,
    removed: change.removed_projects.length,
  };
}
