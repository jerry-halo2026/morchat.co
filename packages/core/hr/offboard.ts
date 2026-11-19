import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { useWorkspaceId } from "../hooks";
import { workbenchKeys } from "../crm/queries";
import { hrKeys } from "./queries";
import type {
  CreateHrOffboardingRequest,
  HrHandoverItem,
  HrOffboardingListFilters,
  UpdateHrHandoverItemRequest,
  UpdateHrOffboardingRequest,
} from "../types/offboard";

/**
 * Offboarding hooks (docs/engineering/WORKBENCH-API.md §15).
 *
 * Its own module rather than more of `queries.ts` / `mutations.ts`: an exit record
 * is a state machine, and every write here either moves it (`advance` / `cancel`)
 * or edits a document (`handover`), so the invalidation rules differ from the
 * rest of HR in one specific way —
 *
 *   **reaching `done` writes `hr_employee_profile.leave_date`.**
 *
 * That is why every mutation here invalidates the `employees` resource as well as
 * this domain: refreshing only the exit list would leave the roster showing
 * somebody who has left as still employed.
 *
 * No optimistic writes, for the reason the rest of the workbench states: the
 * server decides the next segment, assigns checklist keys, and writes the leave
 * date, so a predicted row would be a guess to reconcile.
 *
 * Key shape, verbatim:
 *
 *   ["offboard", wsId, "offboardings", filters]
 *   ["offboard", wsId, "offboardings", { id }]
 */

export const offboardKeys = {
  all: (wsId: string) => ["offboard", wsId] as const,
  /** The offboardings resource prefix: list and detail both sit under it, so one
   *  invalidation refreshes the panel and the row it opened. */
  resource: (wsId: string) => [...offboardKeys.all(wsId), "offboardings"] as const,
  list: <F extends object>(wsId: string, filters: F) =>
    [...offboardKeys.resource(wsId), filters] as const,
  detail: (wsId: string, id: string) =>
    [...offboardKeys.resource(wsId), { id }] as const,
};

export function hrOffboardingListOptions(wsId: string, filters: HrOffboardingListFilters = {}) {
  return queryOptions({
    queryKey: offboardKeys.list(wsId, filters),
    queryFn: () => api.listHrOffboardings(filters),
    enabled: !!wsId,
  });
}

export function hrOffboardingDetailOptions(wsId: string, id: string) {
  return queryOptions({
    queryKey: offboardKeys.detail(wsId, id),
    queryFn: () => api.getHrOffboarding(id),
    enabled: !!wsId && !!id,
  });
}

/**
 * Invalidate this domain, the employee files it writes to, and the workbench
 * aggregates — a record reaching `done` changes what `/counts` says about the
 * headcount as well.
 */
function useInvalidateOffboarding() {
  const qc = useQueryClient();
  const wsId = useWorkspaceId();
  return () => {
    void qc.invalidateQueries({ queryKey: offboardKeys.all(wsId) });
    void qc.invalidateQueries({ queryKey: hrKeys.resource(wsId, "employees") });
    void qc.invalidateQueries({ queryKey: workbenchKeys.all(wsId) });
  };
}

export function useCreateHrOffboarding() {
  const invalidate = useInvalidateOffboarding();
  return useMutation({
    mutationFn: (data: CreateHrOffboardingRequest) => api.createHrOffboarding(data),
    onSuccess: invalidate,
  });
}

/** Ordinary edits only: `status` moves through `advance` / `cancel`. */
export function useUpdateHrOffboarding() {
  const invalidate = useInvalidateOffboarding();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & UpdateHrOffboardingRequest) =>
      api.updateHrOffboarding(id, data),
    onSuccess: invalidate,
  });
}

/** Soft delete. A done record's `leave_date` stays on the employee file. */
export function useDeleteHrOffboarding() {
  const invalidate = useInvalidateOffboarding();
  return useMutation({
    mutationFn: (id: string) => api.deleteHrOffboarding(id),
    onSuccess: invalidate,
  });
}

/**
 * One step forward: `apply → handover → done`. 409 when the record already moved
 * (a stale page, or a second operator), which the mutation surfaces rather than
 * retrying.
 */
export function useAdvanceHrOffboarding() {
  const invalidate = useInvalidateOffboarding();
  return useMutation({
    mutationFn: (id: string) => api.advanceHrOffboarding(id),
    onSuccess: invalidate,
  });
}

/** The way out, while the exit is still in flight. */
export function useCancelHrOffboarding() {
  const invalidate = useInvalidateOffboarding();
  return useMutation({
    mutationFn: (id: string) => api.cancelHrOffboarding(id),
    onSuccess: invalidate,
  });
}

export function useAppendHrOffboardingHandoverItem() {
  const invalidate = useInvalidateOffboarding();
  return useMutation({
    mutationFn: ({
      id,
      item,
    }: {
      id: string;
      item: Partial<HrHandoverItem> & { label: string };
    }) => api.appendHrOffboardingHandoverItem(id, item),
    onSuccess: invalidate,
  });
}

export function useUpdateHrOffboardingHandoverItem() {
  const invalidate = useInvalidateOffboarding();
  return useMutation({
    mutationFn: ({
      id,
      index,
      ...data
    }: { id: string; index: number } & UpdateHrHandoverItemRequest) =>
      api.updateHrOffboardingHandoverItem(id, index, data),
    onSuccess: invalidate,
  });
}

export function useDeleteHrOffboardingHandoverItem() {
  const invalidate = useInvalidateOffboarding();
  return useMutation({
    mutationFn: ({ id, index }: { id: string; index: number }) =>
      api.deleteHrOffboardingHandoverItem(id, index),
    onSuccess: invalidate,
  });
}
