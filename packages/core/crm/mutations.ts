import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { useWorkspaceId } from "../hooks";
import { crmKeys, workbenchKeys } from "./queries";
import type {
  CreateCrmBriefRequest,
  CreateCrmClientRequest,
  CreateCrmCollabRequest,
  CreateCrmSettlementRequest,
  UpdateCrmBriefRequest,
  UpdateCrmClientRequest,
  UpdateCrmCollabRequest,
  UpdateCrmSettlementRequest,
} from "../types";

/**
 * CRM ledger mutations (client → brief → collab → settlement).
 *
 * No optimistic row writes anywhere, for the same reason as the creator ledger:
 * a row's money fields, stage timestamps and owner are server-decided, so a
 * predicted row would be another guess to reconcile. Writes invalidate the
 * domain list subtree and `["workbench", wsId]` (overview + counts), because
 * every one of these tables feeds at least one contract metric — a new collab
 * moves the weighted pipeline, a settlement that turns paid moves collected
 * revenue.
 */
function useInvalidateCrm() {
  const qc = useQueryClient();
  const wsId = useWorkspaceId();
  return (resource?: "clients" | "briefs" | "collabs" | "settlements") => {
    void qc.invalidateQueries({
      queryKey: resource ? crmKeys.resource(wsId, resource) : crmKeys.all(wsId),
    });
    void qc.invalidateQueries({ queryKey: workbenchKeys.all(wsId) });
  };
}

export function useCreateCrmClient() {
  const invalidate = useInvalidateCrm();
  return useMutation({
    mutationFn: (data: CreateCrmClientRequest) => api.createCrmClient(data),
    onSuccess: () => invalidate("clients"),
  });
}

export function useUpdateCrmClient() {
  const invalidate = useInvalidateCrm();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & UpdateCrmClientRequest) =>
      api.updateCrmClient(id, data),
    onSuccess: () => invalidate("clients"),
  });
}

/** Soft delete. Deleting a client leaves its briefs in place (no cascades). */
export function useDeleteCrmClient() {
  const invalidate = useInvalidateCrm();
  return useMutation({
    mutationFn: (id: string) => api.deleteCrmClient(id),
    onSuccess: () => invalidate(),
  });
}

export function useCreateCrmBrief() {
  const invalidate = useInvalidateCrm();
  return useMutation({
    mutationFn: (data: CreateCrmBriefRequest) => api.createCrmBrief(data),
    onSuccess: () => invalidate("briefs"),
  });
}

export function useUpdateCrmBrief() {
  const invalidate = useInvalidateCrm();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & UpdateCrmBriefRequest) =>
      api.updateCrmBrief(id, data),
    onSuccess: () => invalidate("briefs"),
  });
}

export function useDeleteCrmBrief() {
  const invalidate = useInvalidateCrm();
  return useMutation({
    mutationFn: (id: string) => api.deleteCrmBrief(id),
    onSuccess: () => invalidate(),
  });
}

export function useCreateCrmCollab() {
  const invalidate = useInvalidateCrm();
  return useMutation({
    mutationFn: (data: CreateCrmCollabRequest) => api.createCrmCollab(data),
    onSuccess: () => invalidate("collabs"),
  });
}

/**
 * Moving a collab between stages is the fulfilment board's main write. The
 * server stamps `confirmed_at` / `published_at` / `accepted_at` from the new
 * stage, so the response — not the request — says what the row became; the
 * invalidate then re-reads the board column it moved into.
 */
export function useUpdateCrmCollab() {
  const invalidate = useInvalidateCrm();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & UpdateCrmCollabRequest) =>
      api.updateCrmCollab(id, data),
    onSuccess: () => invalidate("collabs"),
  });
}

export function useDeleteCrmCollab() {
  const invalidate = useInvalidateCrm();
  return useMutation({
    mutationFn: (id: string) => api.deleteCrmCollab(id),
    onSuccess: () => invalidate(),
  });
}

export function useCreateCrmSettlement() {
  const invalidate = useInvalidateCrm();
  return useMutation({
    mutationFn: (data: CreateCrmSettlementRequest) => api.createCrmSettlement(data),
    onSuccess: () => invalidate("settlements"),
  });
}

/** Marking a settlement paid is a `paid_at` write; it moves collected revenue. */
export function useUpdateCrmSettlement() {
  const invalidate = useInvalidateCrm();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & UpdateCrmSettlementRequest) =>
      api.updateCrmSettlement(id, data),
    onSuccess: () => invalidate("settlements"),
  });
}

export function useDeleteCrmSettlement() {
  const invalidate = useInvalidateCrm();
  return useMutation({
    mutationFn: (id: string) => api.deleteCrmSettlement(id),
    onSuccess: () => invalidate(),
  });
}
