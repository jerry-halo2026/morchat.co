/**
 * 任务页's grouping (`/{slug}/boss/tasks`).
 *
 * The only workspace-wide read of "which task moves which objective" is the goal
 * side: `issue.goal_id` is a column, so `GET /goals/{id}` returns `issues[]` and
 * there is no `GET /tasks?goal=` (§13.8). This module therefore takes the goals,
 * the details that came back for them, and the one page of the issue list it can
 * also afford, and produces rows grouped by objective.
 *
 * Two consequences are deliberate:
 *
 *   - **A goal with no task is a real group.** "This objective has nothing moving
 *     it" is exactly what the page exists to show, so `buildTaskGroups` keeps the
 *     empty group and the page draws a sentence for it. `nonEmptyGroups` is the
 *     narrow helper the summary line counts with.
 *   - **A missing issue row is not a missing task.** `issues[]` carries id, number,
 *     title and status only; the owner and the update time come from the issue
 *     list, which is one page. A task beyond that page keeps its identity from the
 *     goal side and leaves owner/time blank (`null`) rather than guessing.
 */

import type { Goal, GoalDetail, GoalIssue } from "@morechat/core/types";
import { sortGoals } from "../goals/model";

/**
 * The issue fields this page joins in; `Issue` satisfies this, and a fixture does
 * not have to spell out thirty fields to describe a row.
 */
export interface IssueJoin {
  id: string;
  identifier: string;
  assignee_type: string | null;
  assignee_id: string | null;
  updated_at: string;
}

export interface TaskRow {
  id: string;
  number: number;
  /** `MUL-123` when the issue list resolved it, else null. */
  identifier: string | null;
  title: string;
  status: string;
  /** The member who answers for it; agent and squad assignees are not members. */
  ownerId: string | null;
  /** `updated_at` of the issue, or null when this page could not see the row. */
  updatedAt: string | null;
}

export interface GoalTaskGroup {
  goal: Goal;
  /** Sorted newest first; may be empty. */
  tasks: TaskRow[];
}

function taskRowOf(issue: GoalIssue, found: IssueJoin | undefined): TaskRow {
  return {
    id: issue.id,
    number: issue.number,
    identifier: found?.identifier ?? null,
    title: issue.title,
    status: issue.status,
    ownerId: found && found.assignee_type === "member" ? found.assignee_id : null,
    updatedAt: found?.updated_at ?? null,
  };
}

/**
 * Rows grouped by objective, in the goal board's order.
 *
 * `details` is positionally aligned with `goals` (that is what `useQueries`
 * returns). A detail that has not answered yet contributes an empty group rather
 * than dropping the goal, so the block's own loading state is what shows through.
 */
export function buildTaskGroups(
  goals: readonly Goal[],
  details: readonly (GoalDetail | undefined)[],
  issues: readonly IssueJoin[],
): GoalTaskGroup[] {
  const issueById = new Map(issues.map((issue) => [issue.id, issue]));
  const detailById = new Map<string, GoalDetail>();
  goals.forEach((goal, index) => {
    const detail = details[index];
    if (detail) detailById.set(goal.id, detail);
  });

  return sortGoals(goals).map((goal) => ({
    goal,
    tasks: (detailById.get(goal.id)?.issues ?? [])
      .map((issue) => taskRowOf(issue, issueById.get(issue.id)))
      .sort(compareTasks),
  }));
}

function compareTasks(a: TaskRow, b: TaskRow): number {
  const byUpdated = (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "");
  if (byUpdated !== 0) return byUpdated;
  return a.number - b.number;
}

/** The groups that actually hold work; the summary line counts with this. */
export function nonEmptyGroups(groups: readonly GoalTaskGroup[]): GoalTaskGroup[] {
  return groups.filter((group) => group.tasks.length > 0);
}

export function taskCount(groups: readonly GoalTaskGroup[]): number {
  return groups.reduce((sum, group) => sum + group.tasks.length, 0);
}

/**
 * The search narrowed to what matches: a goal whose title matches keeps all its
 * tasks (you asked for that objective), otherwise only the matching tasks stay.
 */
export function filterTaskGroups(
  groups: readonly GoalTaskGroup[],
  query: string,
  ownerNameOf: (ownerId: string | null) => string | null,
): GoalTaskGroup[] {
  const needle = query.trim().toLowerCase();
  if (needle === "") return [...groups];
  return groups.flatMap((group) => {
    if (group.goal.title.toLowerCase().includes(needle)) return [group];
    const tasks = group.tasks.filter((task) => {
      const owner = ownerNameOf(task.ownerId);
      return (
        task.title.toLowerCase().includes(needle) ||
        (task.identifier ?? "").toLowerCase().includes(needle) ||
        (owner !== null && owner.toLowerCase().includes(needle))
      );
    });
    return tasks.length > 0 ? [{ goal: group.goal, tasks }] : [];
  });
}
