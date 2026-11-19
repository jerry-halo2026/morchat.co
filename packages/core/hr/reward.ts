import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { useWorkspaceId } from "../hooks";
import { workbenchKeys } from "../crm/queries";
import { hrKeys } from "./queries";
import type {
  CreateHrEmployeeRewardRequest,
  HrEmployeeRewardListFilters,
  UpdateHrEmployeeRewardRequest,
} from "../types/reward";

/**
 * Employee rewards and disciplines hooks (docs/engineering/WORKBENCH-API.md §17).
 *
 * Its own module rather than more of `queries.ts` / `mutations.ts`, for the reason
 * §16 keeps one: these rows hang off the employee file, so their invalidation
 * rule differs from the rest of HR in one specific way —
 *
 *   **a reward row changes what the person's file page shows.**
 *
 * A new 奖励 and an edited one both invalidate `employees` alongside the list, so
 * the roster cannot go stale behind the tab.
 *
 * No optimistic writes, for the reason the rest of the workbench states: the
 * server assigns the row, its owner (the employee profile's owner, not the
 * caller) and the `updated_at`, so a predicted row would be a guess to reconcile.
 *
 * Key shape, verbatim:
 *
 *   ["reward", wsId, "rewards", filters]
 *
 * There is no detail key: a reward has no `GET` of its own (§17.3) — the row is
 * read from the list it belongs to.
 */

export const rewardKeys = {
  all: (wsId: string) => ["reward", wsId] as const,
  /** The rewards resource prefix, so one invalidation refreshes every filter. */
  resource: (wsId: string) => [...rewardKeys.all(wsId), "rewards"] as const,
  list: <F extends object>(wsId: string, filters: F) =>
    [...rewardKeys.resource(wsId), filters] as const,
};

export function hrEmployeeRewardListOptions(
  wsId: string,
  filters: HrEmployeeRewardListFilters = {},
) {
  return queryOptions({
    queryKey: rewardKeys.list(wsId, filters),
    queryFn: () => api.listHrEmployeeRewards(filters),
    enabled: !!wsId,
  });
}

/**
 * Invalidate this domain, the employee files the rows hang off, and the workbench
 * aggregates — a new 奖惩 row changes what the roster page shows for that person.
 */
function useInvalidateRewards() {
  const qc = useQueryClient();
  const wsId = useWorkspaceId();
  return () => {
    void qc.invalidateQueries({ queryKey: rewardKeys.all(wsId) });
    void qc.invalidateQueries({ queryKey: hrKeys.resource(wsId, "employees") });
    void qc.invalidateQueries({ queryKey: workbenchKeys.all(wsId) });
  };
}

/** Record one reward or discipline for a profile the caller owns. */
export function useCreateHrEmployeeReward() {
  const invalidate = useInvalidateRewards();
  return useMutation({
    mutationFn: (data: CreateHrEmployeeRewardRequest) => api.createHrEmployeeReward(data),
    onSuccess: invalidate,
  });
}

/** The six descriptive columns; `employee_id` / `kind` are a 400 server-side. */
export function useUpdateHrEmployeeReward() {
  const invalidate = useInvalidateRewards();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & UpdateHrEmployeeRewardRequest) =>
      api.updateHrEmployeeReward(id, data),
    onSuccess: invalidate,
  });
}

/** Soft delete: a row recorded by mistake stops being part of the answer. */
export function useDeleteHrEmployeeReward() {
  const invalidate = useInvalidateRewards();
  return useMutation({
    mutationFn: (id: string) => api.deleteHrEmployeeReward(id),
    onSuccess: invalidate,
  });
}
