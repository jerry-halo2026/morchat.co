import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { useWorkspaceId } from "../hooks";
import { workbenchKeys } from "../crm/queries";
import { affiliateKeys } from "./queries";
import type {
  CreateAffiliatePickRequest,
  CreateAffiliateProductRequest,
  CreateAffiliateSettlementRequest,
  UpdateAffiliatePickRequest,
  UpdateAffiliateProductRequest,
  UpdateAffiliateSettlementRequest,
  UpsertAffiliateDailyRequest,
} from "../types";

/**
 * Affiliate ledger mutations (docs/engineering/WORKBENCH-API.md §11).
 *
 * No optimistic row writes, same reasoning as the creator and CRM ledgers: these
 * rows carry server-decided defaults (currency, status, the pick's own binding
 * time, the platform's net amount) that a client cannot predict, so a guessed row
 * would have to be reconciled a moment later. Every write invalidates the whole
 * `["affiliate", wsId]` prefix — the four lists, the details and the summary —
 * because a product or a pick moves the summary's counts and a daily fact moves
 * its money, and a partial invalidation would leave the strip describing a ledger
 * that no longer exists.
 *
 * `["workbench", wsId]` is invalidated too: the counts and overview strip read
 * these rows on the server, and the global staleTime is Infinity, so a delivery
 * gap on the socket must not be able to strand the aggregates.
 */

function useInvalidateAffiliateLedger() {
  const qc = useQueryClient();
  const wsId = useWorkspaceId();
  return () => {
    void qc.invalidateQueries({ queryKey: affiliateKeys.all(wsId) });
    void qc.invalidateQueries({ queryKey: workbenchKeys.all(wsId) });
  };
}

export function useCreateAffiliateProduct() {
  const invalidate = useInvalidateAffiliateLedger();
  return useMutation({
    mutationFn: (data: CreateAffiliateProductRequest) => api.createAffiliateProduct(data),
    onSuccess: invalidate,
  });
}

export function useUpdateAffiliateProduct() {
  const invalidate = useInvalidateAffiliateLedger();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & UpdateAffiliateProductRequest) =>
      api.updateAffiliateProduct(id, data),
    onSuccess: invalidate,
  });
}

/** Soft delete: the row keeps its data and stops appearing in lists. */
export function useDeleteAffiliateProduct() {
  const invalidate = useInvalidateAffiliateLedger();
  return useMutation({
    mutationFn: (id: string) => api.deleteAffiliateProduct(id),
    onSuccess: invalidate,
  });
}

export function useCreateAffiliatePick() {
  const invalidate = useInvalidateAffiliateLedger();
  return useMutation({
    mutationFn: (data: CreateAffiliatePickRequest) => api.createAffiliatePick(data),
    onSuccess: invalidate,
  });
}

export function useUpdateAffiliatePick() {
  const invalidate = useInvalidateAffiliateLedger();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & UpdateAffiliatePickRequest) =>
      api.updateAffiliatePick(id, data),
    onSuccess: invalidate,
  });
}

export function useDeleteAffiliatePick() {
  const invalidate = useInvalidateAffiliateLedger();
  return useMutation({
    mutationFn: (id: string) => api.deleteAffiliatePick(id),
    onSuccess: invalidate,
  });
}

/**
 * One day of one pick, upserted on `(pick_id, stat_date)`.
 *
 * The body carries the key rather than closing over a row, because the same hook
 * serves the per-day editor and a bulk import that writes many days in one pass;
 * and the write replaces the day, so the caller must send the whole reported day
 * rather than a diff.
 */
export function useUpsertAffiliateDaily() {
  const invalidate = useInvalidateAffiliateLedger();
  return useMutation({
    mutationFn: (data: UpsertAffiliateDailyRequest) => api.upsertAffiliateDaily(data),
    onSuccess: invalidate,
  });
}

/** There is no delete: a settlement statement is a platform fact. */
export function useCreateAffiliateSettlement() {
  const invalidate = useInvalidateAffiliateLedger();
  return useMutation({
    mutationFn: (data: CreateAffiliateSettlementRequest) => api.createAffiliateSettlement(data),
    onSuccess: invalidate,
  });
}

export function useUpdateAffiliateSettlement() {
  const invalidate = useInvalidateAffiliateLedger();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & UpdateAffiliateSettlementRequest) =>
      api.updateAffiliateSettlement(id, data),
    onSuccess: invalidate,
  });
}
