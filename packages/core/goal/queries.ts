import { queryOptions } from "@tanstack/react-query";
import { api } from "../api";
import type { GoalListFilters, MarketSignalListFilters } from "../types";

/**
 * Query keys for the general manager workbench (docs/engineering/WORKBENCH-API.md
 * §13).
 *
 * Shape, verbatim:
 *   ["goal", wsId, resource, filters]
 *   ["goal", wsId, resource, { id }]
 *
 * `resource ∈ goals|signals`. `wsId` sits in position 1 like every other
 * workspace-scoped key, and the detail read nests under the same resource prefix
 * so one invalidation refreshes a list and the rows it opened.
 *
 * One key covers both halves of the contract because they are one screen: a
 * signal converts into a goal, and a mutation on either side invalidates the
 * domain (see `mutations.ts`). There is no summary key — the OKR board's numbers
 * come from the goals themselves (`key_results[].current`), not from an aggregate
 * endpoint — and a key nobody fetches would be a hook that looks supported and
 * returns nothing.
 */
export type GoalResource = "goals" | "signals";

export const goalKeys = {
  all: (wsId: string) => ["goal", wsId] as const,
  resource: (wsId: string, resource: GoalResource) =>
    [...goalKeys.all(wsId), resource] as const,
  list: <F extends object>(wsId: string, resource: GoalResource, filters: F) =>
    [...goalKeys.all(wsId), resource, filters] as const,
  detail: (wsId: string, resource: GoalResource, id: string) =>
    [...goalKeys.all(wsId), resource, { id }] as const,
};

/**
 * One cycle's goals, each with its key results and packages already embedded.
 * `cycle` and `status` are the two filters the board uses; omitting them reads
 * every live goal in the workspace.
 */
export function goalListOptions(wsId: string, filters: GoalListFilters = {}) {
  return queryOptions({
    queryKey: goalKeys.list(wsId, "goals", filters),
    queryFn: () => api.listGoals(filters),
    enabled: !!wsId,
  });
}

/**
 * One goal plus the issues attached to it. This is the only read that answers
 * "which tasks are moving this objective", because `issue.goal_id` is a column on
 * the issue, not a separate resource.
 */
export function goalDetailOptions(wsId: string, id: string) {
  return queryOptions({
    queryKey: goalKeys.detail(wsId, "goals", id),
    queryFn: () => api.getGoal(id),
    enabled: !!wsId && !!id,
  });
}

/** The radar queue. `cut`, `status` and `category` are independent filters. */
export function marketSignalListOptions(wsId: string, filters: MarketSignalListFilters = {}) {
  return queryOptions({
    queryKey: goalKeys.list(wsId, "signals", filters),
    queryFn: () => api.listMarketSignals(filters),
    enabled: !!wsId,
  });
}
