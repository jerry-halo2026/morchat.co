import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { useWorkspaceId } from "../hooks";
import { workbenchKeys } from "../crm/queries";
import { goalKeys } from "./queries";
import type {
  AttachGoalIssueRequest,
  ConvertMarketSignalRequest,
  CreateGoalKeyResultRequest,
  CreateGoalPackageRequest,
  CreateGoalRequest,
  CreateMarketSignalRequest,
  UpdateGoalKeyResultRequest,
  UpdateGoalPackageRequest,
  UpdateGoalRequest,
  UpdateMarketSignalRequest,
} from "../types";

/**
 * General manager workbench mutations (docs/engineering/WORKBENCH-API.md §13).
 *
 * No optimistic row writes, same reasoning as the ledgers: every one of these rows
 * carries a server-decided value the client cannot predict — a goal's embedded
 * children, the issue a converted signal created, the `converted_*` pointer that
 * makes a second convert a 409 — so a guessed row would have to be reconciled a
 * moment later.
 *
 * Every write invalidates the whole `["goal", wsId]` prefix rather than one list.
 * One convert is the reason: it changes the signal *and* creates a goal (or an
 * issue), and a partial invalidation would leave the radar showing a signal whose
 * objective already exists. `["workbench", wsId]` is invalidated too, because the
 * MCP/overview surface reads the same rows on the server.
 */

function useInvalidateGoalDomain() {
  const qc = useQueryClient();
  const wsId = useWorkspaceId();
  return () => {
    void qc.invalidateQueries({ queryKey: goalKeys.all(wsId) });
    void qc.invalidateQueries({ queryKey: workbenchKeys.all(wsId) });
  };
}

export function useCreateGoal() {
  const invalidate = useInvalidateGoalDomain();
  return useMutation({
    mutationFn: (data: CreateGoalRequest) => api.createGoal(data),
    onSuccess: invalidate,
  });
}

export function useUpdateGoal() {
  const invalidate = useInvalidateGoalDomain();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & UpdateGoalRequest) =>
      api.updateGoal(id, data),
    onSuccess: invalidate,
  });
}

/** Soft delete: the goal's key results and packages are archived with it. */
export function useDeleteGoal() {
  const invalidate = useInvalidateGoalDomain();
  return useMutation({
    mutationFn: (id: string) => api.deleteGoal(id),
    onSuccess: invalidate,
  });
}

export function useCreateGoalKeyResult() {
  const invalidate = useInvalidateGoalDomain();
  return useMutation({
    mutationFn: ({ goalId, ...data }: { goalId: string } & CreateGoalKeyResultRequest) =>
      api.createGoalKeyResult(goalId, data),
    onSuccess: invalidate,
  });
}

/**
 * Records a key result's figure. `current` is stored as sent — the server never
 * clamps it to `target`, because over-achievement is a real outcome.
 */
export function useUpdateGoalKeyResult() {
  const invalidate = useInvalidateGoalDomain();
  return useMutation({
    mutationFn: ({
      goalId,
      keyResultId,
      ...data
    }: { goalId: string; keyResultId: string } & UpdateGoalKeyResultRequest) =>
      api.updateGoalKeyResult(goalId, keyResultId, data),
    onSuccess: invalidate,
  });
}

export function useDeleteGoalKeyResult() {
  const invalidate = useInvalidateGoalDomain();
  return useMutation({
    mutationFn: ({ goalId, keyResultId }: { goalId: string; keyResultId: string }) =>
      api.deleteGoalKeyResult(goalId, keyResultId),
    onSuccess: invalidate,
  });
}

export function useCreateGoalPackage() {
  const invalidate = useInvalidateGoalDomain();
  return useMutation({
    mutationFn: ({ goalId, ...data }: { goalId: string } & CreateGoalPackageRequest) =>
      api.createGoalPackage(goalId, data),
    onSuccess: invalidate,
  });
}

export function useUpdateGoalPackage() {
  const invalidate = useInvalidateGoalDomain();
  return useMutation({
    mutationFn: ({
      goalId,
      packageId,
      ...data
    }: { goalId: string; packageId: string } & UpdateGoalPackageRequest) =>
      api.updateGoalPackage(goalId, packageId, data),
    onSuccess: invalidate,
  });
}

export function useDeleteGoalPackage() {
  const invalidate = useInvalidateGoalDomain();
  return useMutation({
    mutationFn: ({ goalId, packageId }: { goalId: string; packageId: string }) =>
      api.deleteGoalPackage(goalId, packageId),
    onSuccess: invalidate,
  });
}

/** Attaches an issue to a goal; a 409 means it already belongs to one. */
export function useAttachGoalIssue() {
  const invalidate = useInvalidateGoalDomain();
  return useMutation({
    mutationFn: ({ goalId, ...data }: { goalId: string } & AttachGoalIssueRequest) =>
      api.attachGoalIssue(goalId, data),
    onSuccess: invalidate,
  });
}

/** Clears `issue.goal_id`; the task stays in its project. */
export function useDetachGoalIssue() {
  const invalidate = useInvalidateGoalDomain();
  return useMutation({
    mutationFn: ({ goalId, issueId }: { goalId: string; issueId: string }) =>
      api.detachGoalIssue(goalId, issueId),
    onSuccess: invalidate,
  });
}

export function useCreateMarketSignal() {
  const invalidate = useInvalidateGoalDomain();
  return useMutation({
    mutationFn: (data: CreateMarketSignalRequest) => api.createMarketSignal(data),
    onSuccess: invalidate,
  });
}

export function useUpdateMarketSignal() {
  const invalidate = useInvalidateGoalDomain();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & UpdateMarketSignalRequest) =>
      api.updateMarketSignal(id, data),
    onSuccess: invalidate,
  });
}

export function useDeleteMarketSignal() {
  const invalidate = useInvalidateGoalDomain();
  return useMutation({
    mutationFn: (id: string) => api.deleteMarketSignal(id),
    onSuccess: invalidate,
  });
}

/**
 * Turns a signal into work. The response names the created goal or issue, so the
 * caller can navigate to it; a second convert of the same signal is a 409.
 */
export function useConvertMarketSignal() {
  const invalidate = useInvalidateGoalDomain();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & ConvertMarketSignalRequest) =>
      api.convertMarketSignal(id, data),
    onSuccess: invalidate,
  });
}
