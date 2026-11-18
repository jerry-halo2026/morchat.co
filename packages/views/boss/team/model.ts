/**
 * What the team page states, computed once and drawn by its three blocks
 * (`/{slug}/boss/team`).
 *
 * The page is read-only: people and their HR files come from two ledgers
 * (`/members` and `/hr/employees`) and this file only joins and classifies them.
 * Nothing here writes, and nothing here invents a person: a member without an HR
 * file is a row that says so, not a row with a guessed hire date.
 *
 * Two rules are shared with the overview rather than re-stated here:
 *  - department attribution (`memberDepartmentId`) and the "this month" counts
 *    (`teamSummary`, `monthOf`) come from `boss/home/model`;
 *  - the dashboard's `largestDepartments` is a top-N summary, so the full
 *    distribution is `departmentShares` below — same attribution rule, every
 *    department, plus the unassigned band, with the share each one holds.
 *
 * Kept DOM-free so the employment matrix below is pinned by plain assertions.
 */

import type { Department, HrEmployeeProfile, MemberWithUser } from "@morechat/core/types";
import { memberDepartmentId } from "../../departments/lib";

/**
 * Five states a row can be in, of which one is "the HR ledger has nothing on this
 * person yet". That one is not a lifecycle state — it is the absence of an answer —
 * and the table prints it as 没有人事档案 rather than as a status.
 */
export type EmploymentStatus = "missing" | "pending" | "probation" | "active" | "left";

export const EMPLOYMENT_STATUSES: readonly EmploymentStatus[] = [
  "missing",
  "pending",
  "probation",
  "active",
  "left",
];

/** `YYYY-MM-DD` of a local date: the format the HR date columns store (C7). */
export function localDayOf(date: Date): string {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return `${date.getFullYear()}-${month < 10 ? "0" : ""}${month}-${
    day < 10 ? "0" : ""
  }${day}`;
}

/**
 * Where one person is in their employment, from the three HR dates.
 *
 * Read in this order, and each step is a decision:
 *
 *  1. **No HR file** → `missing`. The person exists (they are a member), the file
 *     does not; that is an answer about the ledger, not about them.
 *  2. **A leave day that has arrived** → `left`, whatever the other dates say. A
 *     later `regular_date` on a departed person is a data artefact.
 *  3. **No hire day** → `active`. They are on the roster and nobody wrote down
 *     when they started; "待入职" would claim a start that has not happened, and a
 *     trial period has no anchor without a hire day.
 *  4. **A hire day still in the future** → `pending` (待入职).
 *  5. **A regular day that has arrived** → `active` (在职).
 *  6. Otherwise → `probation` (试用期): hired, not confirmed.
 *
 * A leave day in the *future* keeps the person in their current state: the roster
 * of today has not lost them yet. `today` is a local `YYYY-MM-DD`, compared as a
 * string — the columns are calendar days, so no time zone enters the comparison.
 */
export function employmentStatus(
  employee: HrEmployeeProfile | null | undefined,
  today: string,
): EmploymentStatus {
  if (!employee) return "missing";
  if (employee.leave_date !== null && employee.leave_date <= today) return "left";
  if (employee.hire_date === null) return "active";
  if (employee.hire_date > today) return "pending";
  if (employee.regular_date !== null && employee.regular_date <= today) return "active";
  return "probation";
}

export interface ScoreTag {
  key: string;
  value: number;
}

/**
 * A scored JSONB map as its strongest keys: highest score first, ties by key so
 * the order never depends on object insertion.
 *
 * A zero is not a strength and is left out — the page draws these as "what this
 * person is good at", and a 0 says nothing.
 */
function topScores(scores: Record<string, number>, limit: number): ScoreTag[] {
  return Object.entries(scores)
    .filter(([, value]) => value > 0)
    .sort(([aKey, aValue], [bKey, bValue]) => bValue - aValue || aKey.localeCompare(bKey))
    .slice(0, limit)
    .map(([key, value]) => ({ key, value }));
}

/** 能力标签: the first three of `ability` by score (the brief's "前 3 个键"). */
export function abilityTags(ability: Record<string, number>, limit = 3): ScoreTag[] {
  return topScores(ability, limit);
}

/**
 * 性格标签: the dominant DISC style only.
 *
 * One tag, because the column answers "how does this person work", and four
 * numbers side by side would be a chart in a table cell.
 */
export function discTags(disc: Record<string, number>, limit = 1): ScoreTag[] {
  return topScores(disc, limit);
}

export interface TeamRow {
  member: MemberWithUser;
  employee: HrEmployeeProfile | null;
  status: EmploymentStatus;
  departmentId: string | null;
  ability: ScoreTag[];
  disc: ScoreTag[];
}

/**
 * Members joined to their HR file by `member_id`, one row per member.
 *
 * `employees === null` means the HR read did not answer: the rows still render
 * (the roster is the member list) with an empty file, which the table draws as the
 * dash. A member whose file exists twice keeps the first row the server returned
 * rather than the last — the order is stable, so the page does not flicker between
 * two files for the same person.
 */
export function buildTeamRows(
  members: readonly MemberWithUser[],
  employees: readonly HrEmployeeProfile[] | null,
  today: string,
): TeamRow[] {
  const byMember = new Map<string, HrEmployeeProfile>();
  for (const employee of employees ?? []) {
    if (!byMember.has(employee.member_id)) byMember.set(employee.member_id, employee);
  }
  return [...members]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((member) => {
      const employee = byMember.get(member.id) ?? null;
      return {
        member,
        employee,
        status: employmentStatus(employee, today),
        departmentId: memberDepartmentId(member),
        ability: abilityTags(employee?.ability ?? {}),
        disc: discTags(employee?.disc ?? {}),
      };
    });
}

export interface DepartmentShare {
  /** `null` is the unassigned band. */
  departmentId: string | null;
  name: string | null;
  members: number;
  /** Rounded percentage of the roster; 0 when there is nobody to divide by. */
  percent: number;
}

/**
 * 部门分布: every department that holds someone, largest first.
 *
 * Same attribution as the overview (`memberDepartmentId`, and a department the
 * workspace no longer has counted as unassigned), so the two screens cannot
 * disagree about which unit a person is in. Only non-empty departments are listed —
 * a department card with "0 people" belongs to department management, not to a
 * distribution — and an empty roster yields no rows rather than a division by zero.
 */
export function departmentShares(
  members: readonly MemberWithUser[],
  departments: readonly Department[],
): DepartmentShare[] {
  const nameById = new Map(departments.map((department) => [department.id, department.name]));
  const counts = new Map<string | null, number>();
  for (const member of members) {
    const id = memberDepartmentId(member);
    const key = id && nameById.has(id) ? id : null;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const total = members.length;
  return [...counts.entries()]
    .map(([departmentId, count]) => ({
      departmentId,
      name: departmentId === null ? null : (nameById.get(departmentId) ?? null),
      members: count,
      percent: total === 0 ? 0 : Math.round((count / total) * 100),
    }))
    .sort(
      (a, b) =>
        b.members - a.members ||
        // The unassigned band sorts after every named department on a tie: it is
        // a residue of attribution, not a unit of the company.
        (a.departmentId === null ? 1 : 0) - (b.departmentId === null ? 1 : 0) ||
        (a.name ?? "").localeCompare(b.name ?? "") ||
        (a.departmentId ?? "").localeCompare(b.departmentId ?? ""),
    );
}

export interface TeamFilters {
  query?: string;
  /** `all`, `none` (the unassigned band) or a department id. */
  department?: string;
  status?: EmploymentStatus | "all";
}

/** Every department's name, for the search that also matches a department. */
export type DepartmentNameOf = (departmentId: string | null) => string | null;

/**
 * The filters, all client-side: two ledgers, one roster.
 *
 * Search covers the things a reader types when looking for a person — name, the
 * role words, the department, and the two tag sets — and the two selects narrow by
 * the same attribution the distribution uses. `none` is the unassigned band, which
 * is a real answer rather than "no filter".
 */
export function filterTeamRows(
  rows: readonly TeamRow[],
  filters: TeamFilters,
  departmentNameOf: DepartmentNameOf,
): TeamRow[] {
  const needle = (filters.query ?? "").trim().toLowerCase();
  return rows.filter((row) => {
    if (filters.status && filters.status !== "all" && row.status !== filters.status) return false;
    if (filters.department && filters.department !== "all") {
      if (filters.department === "none") {
        if (row.departmentId !== null) return false;
      } else if (row.departmentId !== filters.department) {
        return false;
      }
    }
    if (needle === "") return true;
    const department = departmentNameOf(row.departmentId) ?? "";
    const haystack = [
      row.member.name,
      row.member.email,
      row.employee?.job_title ?? "",
      department,
      ...row.ability.map((tag) => tag.key),
      ...row.disc.map((tag) => tag.key),
    ];
    return haystack.some((value) => value.toLowerCase().includes(needle));
  });
}
