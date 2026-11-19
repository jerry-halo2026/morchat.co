/**
 * What the general manager's overview states, computed once and drawn by each
 * block (`/boss`).
 *
 * Four sources, four rules, and one thing none of them does: invent a number.
 * A goal's progress is a stored figure divided by the goal's own target, a
 * signal's order is its cut, a team's counts are rows, and money is the
 * difference of two figures that both have to exist. Where an input is missing
 * the summary carries `null` and the block prints the dash — the same rule the
 * workbench's money block follows (`docs/METRICS.md` §1 rule 3), because a
 * summary that quietly answers 0 answers a different question.
 *
 * Kept DOM-free so the thresholds below are pinned by plain unit assertions
 * rather than by reading a rendered bar.
 */

import type {
  Department,
  GoalKeyResult,
  HrEmployeeProfile,
  MarketSignal,
  MarketSignalCut,
  MemberWithUser,
  WorkbenchFinanceMonth,
} from "@morechat/core/types";
import { memberDepartmentId } from "../../departments/lib";

/** The three colour states this page draws. */
export type Tone = "success" | "warning" | "neutral";

/** The two signal statuses the radar block still counts as open. */
export const OPEN_SIGNAL_STATUSES = ["new", "reviewing"] as const;

/** How many goals, signals and department rows a block draws. */
export const GOAL_LIMIT = 3;
export const SIGNAL_LIMIT = 5;
export const DEPARTMENT_LIMIT = 3;

/**
 * The signal page the block reads before narrowing.
 *
 * `marketSignalListFilters.status` is a single value (the server rejects a list:
 * `mediaEnumInvalid`), so "new or reviewing" has to be an intersection done
 * here. The read asks for the server's maximum page — the queue is ordered hot
 * first, so the open rows sit at its head — and the two open statuses are taken
 * out of it: one request and one key, instead of a key per status.
 */
export const SIGNAL_SCAN_LIMIT = 200;

/** 达成色: met wins before any ratio; under half is at risk; the rest is on track. */
export function keyResultProgress(
  kr: Pick<GoalKeyResult, "current" | "target">,
): { percent: number; tone: Tone; measured: boolean } {
  const { current, target } = kr;
  // A result whose number is not decided yet has no ratio. Drawing a full or an
  // empty bar would both be a claim about it.
  if (target === null || target === undefined) {
    return { percent: 0, tone: "neutral", measured: false };
  }
  // `>=` first: a target of 0 divides by zero, and 0 of 0 is met, not complete.
  if (current >= target) return { percent: 100, tone: "success", measured: true };
  const ratio = target > 0 ? Math.min(Math.max(current / target, 0), 1) : 0;
  return {
    percent: Math.round(ratio * 100),
    tone: ratio < 0.5 ? "warning" : "neutral",
    measured: true,
  };
}

/** Cut order: hot first, cold last. */
export const CUT_RANK: Record<MarketSignalCut, number> = { hot: 0, warm: 1, cold: 2 };

/**
 * The open signals, most urgent first.
 *
 * Cut is the block's sort key — a cold signal with a high score is still not
 * what the reader has to look at first — with the relevance score and then the
 * newest row breaking ties. A signal nobody scored sorts after the scored ones
 * of its own cut rather than being dropped: "unscored" is a state, not a gap.
 */
export function openSignals(
  signals: readonly MarketSignal[],
  limit = SIGNAL_LIMIT,
): MarketSignal[] {
  return signals
    .filter(
      (signal) =>
        signal.status === OPEN_SIGNAL_STATUSES[0] || signal.status === OPEN_SIGNAL_STATUSES[1],
    )
    .sort(compareSignals)
    .slice(0, limit);
}

function compareSignals(a: MarketSignal, b: MarketSignal): number {
  const byCut = CUT_RANK[a.cut] - CUT_RANK[b.cut];
  if (byCut !== 0) return byCut;
  const byScore = (b.score ?? -1) - (a.score ?? -1);
  if (byScore !== 0) return byScore;
  return b.created_at.localeCompare(a.created_at);
}

/** `YYYY-MM` of a local date: the key `hr_employee_profile` dates are compared against. */
export function monthOf(date: Date): string {
  const month = date.getMonth() + 1;
  return `${date.getFullYear()}-${month < 10 ? "0" : ""}${month}`;
}

export interface TeamSummary {
  members: number;
  /** Members whose HR file exists; `null` once the HR read failed. */
  withProfile: number | null;
  joinedThisMonth: number | null;
  leftThisMonth: number | null;
}

/**
 * The four numbers, of which the three that come from HR may be unknown.
 *
 * `employees: null` means the HR read did not answer — distinct from `[]`,
 * which is "nobody has an HR file yet". Both leave the three counts
 * unstatable, and the block draws the member count alone instead of a row of
 * confident zeros.
 */
export function teamSummary(
  members: readonly MemberWithUser[],
  employees: readonly HrEmployeeProfile[] | null,
  month: string,
): TeamSummary {
  if (employees === null) {
    return { members: members.length, withProfile: null, joinedThisMonth: null, leftThisMonth: null };
  }
  const inMonth = (day: string | null) => !!day && day.startsWith(month);
  return {
    members: members.length,
    withProfile: employees.length,
    joinedThisMonth: employees.filter((employee) => inMonth(employee.hire_date)).length,
    leftThisMonth: employees.filter((employee) => inMonth(employee.leave_date)).length,
  };
}

export interface DepartmentShare {
  /** `null` is the unassigned band; it is listed when it is one of the largest. */
  departmentId: string | null;
  name: string | null;
  members: number;
}

/**
 * The departments holding the most members, largest first.
 *
 * A member with no department (or with one the workspace no longer has) is
 * counted in the unassigned band rather than dropped: the counts have to add up
 * to the member total the block prints above them.
 */
export function largestDepartments(
  members: readonly MemberWithUser[],
  departments: readonly Department[],
  limit = DEPARTMENT_LIMIT,
): DepartmentShare[] {
  const nameById = new Map(departments.map((department) => [department.id, department.name]));
  const counts = new Map<string | null, number>();
  for (const member of members) {
    const id = memberDepartmentId(member);
    const key = id && nameById.has(id) ? id : null;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([departmentId, count]) => ({
      departmentId,
      name: departmentId === null ? null : (nameById.get(departmentId) ?? null),
      members: count,
    }))
    .sort((a, b) => b.members - a.members)
    .slice(0, limit);
}

/** A figure that is either stated or missing; `gap` names why it is missing. */
export type MoneyGap = "signed" | "paid" | "cost" | "margin";

export interface MoneySummary {
  signed: number | null;
  paid: number | null;
  cost: number | null;
  /** 已回款 − 成本, and only when both sides exist. */
  margin: number | null;
  month: string;
}

/** This month's entry: `WorkbenchFinanceMonth.month` is the first day of the month. */
export function monthEntry(
  months: readonly WorkbenchFinanceMonth[] | undefined,
  month: string,
): WorkbenchFinanceMonth | null {
  if (!month) return null;
  return months?.find((entry) => entry.month.startsWith(month)) ?? null;
}

/**
 * The month's cost, or null.
 *
 * `PUT /workbench/finance/months` stores "not recorded" as null, and the two
 * halves are entered independently — so one half is a cost, both halves are
 * their sum, and neither is "no cost" rather than "cost 0".
 */
export function monthCost(entry: WorkbenchFinanceMonth | null): number | null {
  if (!entry) return null;
  const halves = [entry.fixed_cost, entry.variable_cost].filter(
    (value): value is number => typeof value === "number",
  );
  if (halves.length === 0) return null;
  return halves.reduce((sum, value) => sum + value, 0);
}

/**
 * 本月已签 / 本月回款 / 本月成本 / 本月毛利.
 *
 * All four share one window. The first two come from the money block, which
 * states the calendar month it describes; the cost is that same month's entry.
 * Mixing a cumulative revenue figure with one month's cost would produce a
 * subtraction that is not a margin at all, so the pipeline totals are not used
 * here even though they are the "sales" numbers.
 *
 * Any missing side leaves the margin null: a margin over one known figure is
 * arithmetic that looks like an answer.
 */
export function moneySummary(
  finance: { signed: number | null; collected: number | null } | null,
  entry: WorkbenchFinanceMonth | null,
  month: string,
): MoneySummary {
  const signed = finance?.signed ?? null;
  const paid = finance?.collected ?? null;
  const cost = monthCost(entry);
  return {
    signed,
    paid,
    cost,
    margin: paid !== null && cost !== null ? paid - cost : null,
    month,
  };
}

/** Why the margin has no number: the more specific missing side wins. */
export function marginGap(summary: MoneySummary): MoneyGap | null {
  if (summary.margin !== null) return null;
  if (summary.cost === null) return "cost";
  return summary.paid === null ? "paid" : "margin";
}
