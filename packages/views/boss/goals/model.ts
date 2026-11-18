/**
 * What the goal page states, computed once and drawn by its blocks
 * (`/{slug}/boss/goals`).
 *
 * Two decisions live here rather than in the components:
 *
 *   1. **A goal's progress is a stored figure divided by its own targets.** The
 *      page never derives a number from tasks: `issue.goal_id` links work to an
 *      objective, but which finished task counts towards which key result is a
 *      judgement the owner makes, so the API stores `current` and this file only
 *      divides it (WORKBENCH-API §13.5). A goal whose key results have no target
 *      yet reports `measured: false` and the block prints a dash — 0% would be a
 *      claim about a number nobody set.
 *   2. **Each measurable key result weighs the same, regardless of target size.**
 *      Weighting by `target` would make one 万元 result swallow a 30-家 result;
 *      the units differ, so the only common denominator is "how much of its own
 *      target it reached".
 *
 * Kept DOM-free so the thresholds below are pinned by plain unit assertions
 * rather than by reading a rendered bar.
 */

import type {
  Goal,
  GoalIssue,
  GoalKeyResult,
  GoalKeyResultStatus,
  GoalPackage,
  GoalStatus,
} from "@morechat/core/types";

/** Rows the goal board reads at once: `/goals` caps `limit` at 200 (§13.3). */
export const GOAL_SCAN_LIMIT = 200;

/** How many unattached issues the picker offers before you have to search. */
export const ATTACH_CANDIDATE_LIMIT = 8;

/** The four colour states these pages draw. */
export type Tone = "success" | "warning" | "danger" | "neutral";

export interface Measured {
  percent: number;
  /** False when there is no target to measure against. */
  measured: boolean;
  tone: Tone;
}

/**
 * 完成率 of one key result, or `null` when nobody has set its target.
 *
 * `target = 0` is a real assertion ("this one is already missed"), so it is
 * measured rather than skipped: 0 of 0 counts as met, and `current > 0` against a
 * zero target is the over-achievement the contract stores rather than clamps.
 */
export function keyResultRatio(
  keyResult: Pick<GoalKeyResult, "current" | "target">,
): number | null {
  const { current, target } = keyResult;
  if (target === null || target === undefined) return null;
  // A zero target is a claim that it is already missed, so nothing can be below
  // it: 0 of 0 is met, and 3 of 0 is the over-achievement the contract stores.
  if (target <= 0) return current >= target ? 1 : 0;
  return current / target;
}

/** One key result's ratio as a bar: met wins, under half is at risk. */
export function keyResultProgress(
  keyResult: Pick<GoalKeyResult, "current" | "target">,
): Measured {
  const ratio = keyResultRatio(keyResult);
  if (ratio === null) return { percent: 0, measured: false, tone: "neutral" };
  if (ratio >= 1) return { percent: 100, measured: true, tone: "success" };
  const percent = Math.round(Math.max(ratio, 0) * 100);
  return { percent, measured: true, tone: percent < 50 ? "warning" : "neutral" };
}

/**
 * The bar a key result is drawn with: the human's `status` wins over the ratio.
 *
 * `on_track` never draws the warning colour — the owner has looked at the number
 * and called it fine, so a low bar is "slow but intended", not "at risk". The
 * three other statuses are explicit judgments and are drawn as such.
 */
export function keyResultStanding(keyResult: GoalKeyResult): Measured {
  const progress = keyResultProgress(keyResult);
  switch (keyResult.status) {
    case "done":
      return { ...progress, percent: 100, tone: "success" };
    case "off_track":
      return { ...progress, tone: "danger" };
    case "at_risk":
      return { ...progress, tone: "warning" };
    case "on_track":
      return { ...progress, tone: progress.tone === "warning" ? "neutral" : progress.tone };
  }
}

export interface GoalProgress {
  percent: number;
  /** False when no key result has a target yet. */
  measured: boolean;
  /** How many key results the goal has, measured or not. */
  keyResults: number;
}

/** 整体进度: the mean of the measurable key results' own ratios. */
export function goalProgress(goal: Pick<Goal, "key_results">): GoalProgress {
  const ratios = goal.key_results
    .map((keyResult) => keyResultRatio(keyResult))
    .filter((ratio): ratio is number => ratio !== null);
  if (ratios.length === 0) {
    return { percent: 0, measured: false, keyResults: goal.key_results.length };
  }
  const capped = ratios.map((ratio) => Math.min(Math.max(ratio, 0), 1));
  const total = capped.reduce((sum, ratio) => sum + ratio, 0);
  return {
    percent: Math.round((total / capped.length) * 100),
    measured: true,
    keyResults: goal.key_results.length,
  };
}

/**
 * The tone a goal's bar is drawn in: the status first, then the ratio.
 *
 * A cancelled goal is neutral whatever its numbers say; a done one is green even
 * if a key result never got its target; an undecided number is never red. Only a
 * live goal below half of what it promised is drawn in the warning colour.
 */
export function goalTone(goal: Goal): Tone {
  if (goal.status === "cancelled") return "neutral";
  if (goal.status === "done") return "success";
  const progress = goalProgress(goal);
  if (!progress.measured) return "neutral";
  if (progress.percent >= 100) return "success";
  return progress.percent < 50 ? "warning" : "neutral";
}

export interface PackageTotal {
  departmentId: string;
  total: number;
  active: number;
  done: number;
}

/**
 * 包分组合计: the packages of one goal, summed per department.
 *
 * A department can hold more than one package (two separate splits of the same
 * objective), so the rows are grouped rather than assumed unique. Largest group
 * first, then by department id so the order never depends on insertion order.
 */
export function packageTotals(packages: readonly GoalPackage[]): PackageTotal[] {
  const byDepartment = new Map<string, PackageTotal>();
  for (const pkg of packages) {
    const entry = byDepartment.get(pkg.department_id) ?? {
      departmentId: pkg.department_id,
      total: 0,
      active: 0,
      done: 0,
    };
    entry.total += 1;
    if (pkg.status === "active") entry.active += 1;
    if (pkg.status === "done") entry.done += 1;
    byDepartment.set(pkg.department_id, entry);
  }
  return [...byDepartment.values()].sort(
    (a, b) => b.total - a.total || a.departmentId.localeCompare(b.departmentId),
  );
}

/** `{{active}} of {{total}} in progress` for the packages heading. */
export function packageSummary(packages: readonly GoalPackage[]): {
  active: number;
  total: number;
} {
  return {
    active: packages.filter((pkg) => pkg.status === "active").length,
    total: packages.length,
  };
}

const PRIORITY_RANK: Record<Goal["priority"], number> = { P0: 0, P1: 1, P2: 2 };

/**
 * The board's order: what has to be looked at first.
 *
 * Priority, then the due day, then the newer cycle, then the title. A paused goal
 * keeps its place among the open ones — it still owns its numbers, which is why
 * the server has no separate "archived" status for it.
 */
export function sortGoals(goals: readonly Goal[]): Goal[] {
  return [...goals].sort((a, b) => {
    const byPriority = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (byPriority !== 0) return byPriority;
    const byDue = (a.due_date ?? "9999-12-31").localeCompare(b.due_date ?? "9999-12-31");
    if (byDue !== 0) return byDue;
    const byCycle = b.cycle.localeCompare(a.cycle);
    if (byCycle !== 0) return byCycle;
    return a.title.localeCompare(b.title);
  });
}

export interface GoalBuckets {
  /** Not yet committed: `draft`. */
  draft: Goal[];
  /** Moving, or deliberately on hold: `active` + `paused`. */
  open: Goal[];
  /** Closed either way: `done` + `cancelled`. */
  closed: Goal[];
}

export function bucketGoals(goals: readonly Goal[]): GoalBuckets {
  const buckets: GoalBuckets = { draft: [], open: [], closed: [] };
  for (const goal of goals) {
    if (goal.status === "draft") buckets.draft.push(goal);
    else if (goal.status === "done" || goal.status === "cancelled") buckets.closed.push(goal);
    else buckets.open.push(goal);
  }
  return buckets;
}

export interface AttachCandidate {
  id: string;
  identifier: string;
  title: string;
  status: string;
}

/** The four fields the picker reads off an issue; `Issue` satisfies this. */
export interface AttachSource {
  id: string;
  identifier: string;
  title: string;
  status: string;
}

/**
 * Issues that can still be hung on a goal: everything the workspace list
 * returned minus what is already attached, narrowed by the picker's search.
 *
 * The read is one page of the issue list (the only workspace-wide issue read this
 * batch gets), so a task beyond that page cannot be attached here yet — the
 * picker says it narrowed, rather than pretending the list is complete.
 */
export function attachCandidates(
  issues: readonly AttachSource[],
  attached: readonly GoalIssue[],
  query = "",
  limit = ATTACH_CANDIDATE_LIMIT,
): AttachCandidate[] {
  const taken = new Set(attached.map((issue) => issue.id));
  const needle = query.trim().toLowerCase();
  return issues
    .filter((issue) => !taken.has(issue.id))
    .filter((issue) => {
      if (needle === "") return true;
      return (
        issue.title.toLowerCase().includes(needle) ||
        issue.identifier.toLowerCase().includes(needle)
      );
    })
    .slice(0, limit)
    .map((issue) => ({
      id: issue.id,
      identifier: issue.identifier,
      title: issue.title,
      status: issue.status,
    }));
}

/** Every status the key-result contract allows, in the order a board reads them. */
export const KEY_RESULT_STATUSES: readonly GoalKeyResultStatus[] = [
  "on_track",
  "at_risk",
  "off_track",
  "done",
];

/** Every status a goal can be PATCHed into. */
export const GOAL_STATUSES: readonly GoalStatus[] = [
  "draft",
  "active",
  "paused",
  "done",
  "cancelled",
];

export const GOAL_PRIORITIES: readonly Goal["priority"][] = ["P0", "P1", "P2"];
