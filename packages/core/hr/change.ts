import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { useWorkspaceId } from "../hooks";
import { workbenchKeys } from "../crm/queries";
import { hrKeys } from "./queries";
import type {
  CreateHrEmployeeChangeRequest,
  HrEmployeeChangeListFilters,
  UpdateHrEmployeeChangeRequest,
} from "../types/change";

/**
 * Employee file change stream hooks (docs/engineering/WORKBENCH-API.md §16).
 *
 * Its own module rather than more of `queries.ts` / `mutations.ts`: the 异动 tab is
 * an append-only event list, and its invalidation rule differs from the rest of HR
 * in one specific way —
 *
 *   **the stream is written by the profile PATCH, not by a route of its own.**
 *
 * So an edit here also refreshes `employees`: a manual `salary` row and a
 * `department_id` PATCH both change what the person's file page shows, and a
 * client that refreshed only the list would leave the roster stale.
 *
 * No optimistic writes, for the reason the rest of the workbench states: the
 * server assigns the row, the `kind` of an automatic entry, and (for a PATCH) the
 * one editable field, so a predicted row would be a guess to reconcile.
 *
 * Key shape, verbatim:
 *
 *   ["change", wsId, "changes", filters]
 *
 * There is no detail key: a change has no `GET` of its own (§16.3) — the row is
 * read from the list it belongs to, and the only write that opens a single row is
 * the note edit.
 */

export const changeKeys = {
  all: (wsId: string) => ["change", wsId] as const,
  /** The changes resource prefix, so one invalidation refreshes every filter. */
  resource: (wsId: string) => [...changeKeys.all(wsId), "changes"] as const,
  list: <F extends object>(wsId: string, filters: F) =>
    [...changeKeys.resource(wsId), filters] as const,
};

export function hrEmployeeChangeListOptions(
  wsId: string,
  filters: HrEmployeeChangeListFilters = {},
) {
  return queryOptions({
    queryKey: changeKeys.list(wsId, filters),
    queryFn: () => api.listHrEmployeeChanges(filters),
    enabled: !!wsId,
  });
}

/**
 * Invalidate this domain, the employee files it hangs off, and the workbench
 * aggregates — a new row changes what the roster page shows for that person.
 */
function useInvalidateChanges() {
  const qc = useQueryClient();
  const wsId = useWorkspaceId();
  return () => {
    void qc.invalidateQueries({ queryKey: changeKeys.all(wsId) });
    void qc.invalidateQueries({ queryKey: hrKeys.resource(wsId, "employees") });
    void qc.invalidateQueries({ queryKey: workbenchKeys.all(wsId) });
  };
}

/** The manual entry: the salary adjustment the profile has no column for. */
export function useCreateHrEmployeeChange() {
  const invalidate = useInvalidateChanges();
  return useMutation({
    mutationFn: (data: CreateHrEmployeeChangeRequest) => api.createHrEmployeeChange(data),
    onSuccess: invalidate,
  });
}

/** `note` is the only editable field; the server rejects anything else. */
export function useUpdateHrEmployeeChange() {
  const invalidate = useInvalidateChanges();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & UpdateHrEmployeeChangeRequest) =>
      api.updateHrEmployeeChange(id, data),
    onSuccess: invalidate,
  });
}

/** Soft delete: a row recorded by mistake stops being part of the answer. */
export function useDeleteHrEmployeeChange() {
  const invalidate = useInvalidateChanges();
  return useMutation({
    mutationFn: (id: string) => api.deleteHrEmployeeChange(id),
    onSuccess: invalidate,
  });
}
