import type { HrEmployeeProfile } from "@morechat/core/types";

/**
 * What the roster derives from an employee profile, as pure functions.
 *
 * `hr_employee_profile` carries dates rather than a status column, so the four
 * states the roster sorts by are read off those dates instead of invented:
 *
 *   left           — `archived_at` is set; the profile is a former employee.
 *   pending_leave  — the contract has already run out and nothing renewed it.
 *   regular        — `regular_date` is set: the probation review happened.
 *   probation      — hired, not yet confirmed.
 *
 * The order matters (a left employee whose contract also lapsed is `left`, not
 * `pending_leave`), so the checks run top to bottom. A real `status` column
 * would replace this derivation without touching anything else here.
 */

export type RosterStatus = "regular" | "probation" | "pending_leave" | "left";

/** Filter-menu order: the two current states first, then the way out. */
export const ROSTER_STATUSES: readonly RosterStatus[] = [
  "regular",
  "probation",
  "pending_leave",
  "left",
];

/** A contract ending within this many days is drawn in the warning colour. */
export const CONTRACT_WARNING_DAYS = 60;

const DAY_MS = 86_400_000;

/**
 * A `YYYY-MM-DD` column as local midnight.
 *
 * `new Date("2026-03-01")` is UTC midnight and lands on the previous day west of
 * Greenwich; an employment date must not move with the reader's time zone, so the
 * parts are read directly.
 */
export function parseDay(value: string | null | undefined): Date | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  const [, year, month, day] = match;
  const parsed = new Date(Number(year), Number(month) - 1, Number(day));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** A calendar day, printed as stored: `2026-03-01T00:00:00Z` → `2026-03-01`. */
export function formatDay(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.length > 10 ? value.slice(0, 10) : value;
}

/** Today as a `YYYY-MM-DD` day in the reader's zone — what a write stores. */
export function todayDay(today: Date): string {
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
}

/** Whole calendar days from `today` until `day`; negative once it has passed. */
export function daysUntil(day: string | null | undefined, today: Date): number | null {
  const target = parseDay(day);
  if (!target) return null;
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((target.getTime() - start.getTime()) / DAY_MS);
}

export function rosterStatus(profile: HrEmployeeProfile, today: Date): RosterStatus {
  if (profile.archived_at) return "left";
  const left = daysUntil(profile.contract_end, today);
  if (left !== null && left <= 0) return "pending_leave";
  if (profile.regular_date) return "regular";
  return "probation";
}

/**
 * A contract's urgency, for the one place that colours it: `expired` (already
 * past), `due` (ends today), `warning` (inside {@link CONTRACT_WARNING_DAYS}),
 * `ok`, and `none` for a profile with no end date at all — which is not the same
 * statement as a contract that is fine.
 */
export type ContractState = "none" | "expired" | "due" | "warning" | "ok";

export interface ContractSummary {
  state: ContractState;
  /** Days until the end date; negative once past, null when there is none. */
  days: number | null;
}

export function contractSummary(
  contractEnd: string | null | undefined,
  today: Date,
): ContractSummary {
  const days = daysUntil(contractEnd, today);
  if (days === null) return { state: "none", days: null };
  if (days < 0) return { state: "expired", days };
  if (days === 0) return { state: "due", days };
  if (days <= CONTRACT_WARNING_DAYS) return { state: "warning", days };
  return { state: "ok", days };
}

/** One employee, with every cross-table name resolved and both derived axes. */
export interface RosterRow {
  profile: HrEmployeeProfile;
  memberName: string | null;
  memberEmail: string | null;
  departmentName: string | null;
  status: RosterStatus;
  contract: ContractSummary;
}

/**
 * The roster's text search: name, role, grade, department, and the member's id —
 * the only identifier an employee row carries, since the ledger has no employee
 * number column. Every whitespace-separated term has to appear somewhere, so
 * "ada 设计" narrows instead of widening.
 */
export function matchesSearch(row: RosterRow, query: string): boolean {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const haystack = [
    row.memberName ?? "",
    row.profile.job_title ?? "",
    row.profile.grade ?? "",
    row.departmentName ?? "",
    row.profile.member_id,
  ]
    .join(" ")
    .toLowerCase();
  return terms.every((term) => haystack.includes(term));
}

export type RosterSortField = "hire_date" | "department" | "grade";

export const ROSTER_SORT_FIELDS: readonly RosterSortField[] = [
  "hire_date",
  "department",
  "grade",
];

export type SortDirection = "asc" | "desc";

/** Nulls sort last in both directions: a missing date is not "earliest". */
function compareText(a: string | null, b: string | null, direction: SortDirection): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  const order = a.localeCompare(b, undefined, { numeric: true });
  return direction === "asc" ? order : -order;
}

export function sortRoster(
  rows: readonly RosterRow[],
  field: RosterSortField,
  direction: SortDirection,
): RosterRow[] {
  const sorted = [...rows];
  sorted.sort((a, b) => {
    if (field === "hire_date") {
      const aDay = parseDay(a.profile.hire_date)?.getTime() ?? null;
      const bDay = parseDay(b.profile.hire_date)?.getTime() ?? null;
      if (aDay === null && bDay === null) return compareNames(a, b);
      if (aDay === null) return 1;
      if (bDay === null) return -1;
      return (aDay - bDay) * (direction === "asc" ? 1 : -1) || compareNames(a, b);
    }
    if (field === "department") {
      return (
        compareText(a.departmentName, b.departmentName, direction) || compareNames(a, b)
      );
    }
    return compareText(a.profile.grade, b.profile.grade, direction) || compareNames(a, b);
  });
  return sorted;
}

function compareNames(a: RosterRow, b: RosterRow): number {
  return (a.memberName ?? "").localeCompare(b.memberName ?? "", undefined, {
    numeric: true,
  });
}

/** The dimensions of the ability matrix, in the order the profile stores them. */
export function abilityAxes(
  ability: Record<string, number>,
): { key: string; label: string; value: number }[] {
  return Object.entries(ability).map(([key, value]) => ({
    key,
    label: key,
    value: Number.isFinite(value) ? value : 0,
  }));
}

/** DISC's four axes, in their canonical order, then anything else stored. */
export const DISC_AXES = ["d", "i", "s", "c"] as const;

export function discAxes(
  disc: Record<string, number>,
): { key: string; label: string; value: number }[] {
  const order = [
    ...DISC_AXES.filter((axis) => axis in disc),
    ...Object.keys(disc).filter((axis) => !(DISC_AXES as readonly string[]).includes(axis)),
  ];
  return order.map((axis) => ({
    key: axis,
    label: axis,
    value: Number.isFinite(disc[axis]) ? (disc[axis] as number) : 0,
  }));
}
