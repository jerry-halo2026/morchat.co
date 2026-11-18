import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, isStaleWrite } from "../api";
import { useWorkspaceId } from "../hooks";
import { bdKeys } from "./queries";
import type {
  BdActivity,
  BdQuote,
  CreateBdActivityRequest,
  CreateBdCampaignRequest,
  CreateBdQuoteRequest,
  UpdateBdActivityRequest,
  UpdateBdCampaignRequest,
  UpdateBdQuoteRequest,
} from "../types";

/**
 * BD pipeline mutations (follow-up log, quotes, collection campaigns).
 *
 * No optimistic row writes, for the same reason as the CRM ledgers: the owner, the
 * currency default and (for a quote) the 400 rules on `commission_rate` and
 * `valid_until` are server-decided, so a predicted row would be another guess to
 * reconcile.
 *
 * Every write invalidates `["bd", wsId]`, which covers both the resource subtree
 * and the cockpit: a new follow-up moves `followups.due_today`, a sent quote moves
 * `quotes.open` and `creators.quoted`, and a new campaign changes nothing in the
 * cockpit today but shares the prefix so a future counter does not need a second
 * invalidation wired in.
 */
function useInvalidateBd() {
  const qc = useQueryClient();
  const wsId = useWorkspaceId();
  return (resource?: "activities" | "quotes" | "campaigns") => {
    void qc.invalidateQueries({
      queryKey: resource ? bdKeys.resource(wsId, resource) : bdKeys.all(wsId),
    });
    void qc.invalidateQueries({ queryKey: bdKeys.all(wsId) });
  };
}

export function useCreateBdActivity() {
  const invalidate = useInvalidateBd();
  return useMutation({
    mutationFn: (data: CreateBdActivityRequest) => api.createBdActivity(data),
    onSuccess: () => invalidate("activities"),
  });
}

export function useUpdateBdActivity() {
  const invalidate = useInvalidateBd();
  const qc = useQueryClient();
  const wsId = useWorkspaceId();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & UpdateBdActivityRequest) =>
      api.updateBdActivity(id, data),
    onSuccess: () => invalidate("activities"),
    // 409 `stale_write`: put the server's row into the cache and re-read the
    // ledger, so the editor shows what changed instead of retrying the write
    // (COLLAB-MODEL §3).
    onError: (error, variables) => {
      if (!isStaleWrite<BdActivity>(error)) return;
      qc.setQueryData(bdKeys.detail(wsId, "activities", variables.id), error.current);
      invalidate("activities");
    },
  });
}

/** Soft delete: the row leaves every answer, the record that it was written does not. */
export function useDeleteBdActivity() {
  const invalidate = useInvalidateBd();
  return useMutation({
    mutationFn: (id: string) => api.deleteBdActivity(id),
    onSuccess: () => invalidate(),
  });
}

export function useCreateBdQuote() {
  const invalidate = useInvalidateBd();
  return useMutation({
    mutationFn: (data: CreateBdQuoteRequest) => api.createBdQuote(data),
    onSuccess: () => invalidate("quotes"),
  });
}

/**
 * The one write that can be refused rather than patched: a `commission_rate`
 * outside 0–1 or a `valid_until` before `quoted_at` answers 400, and the row is
 * not touched (§20.4). Callers surface the error; the cache keeps the stored row.
 */
export function useUpdateBdQuote() {
  const invalidate = useInvalidateBd();
  const qc = useQueryClient();
  const wsId = useWorkspaceId();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & UpdateBdQuoteRequest) =>
      api.updateBdQuote(id, data),
    onSuccess: () => invalidate("quotes"),
    onError: (error, variables) => {
      if (!isStaleWrite<BdQuote>(error)) return;
      qc.setQueryData(bdKeys.detail(wsId, "quotes", variables.id), error.current);
      invalidate("quotes");
    },
  });
}

export function useDeleteBdQuote() {
  const invalidate = useInvalidateBd();
  return useMutation({
    mutationFn: (id: string) => api.deleteBdQuote(id),
    onSuccess: () => invalidate(),
  });
}

export function useCreateBdCampaign() {
  const invalidate = useInvalidateBd();
  return useMutation({
    mutationFn: (data: CreateBdCampaignRequest) => api.createBdCampaign(data),
    onSuccess: () => invalidate("campaigns"),
  });
}

/** A rename onto an existing name answers 409; the row keeps its old name. */
export function useUpdateBdCampaign() {
  const invalidate = useInvalidateBd();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & UpdateBdCampaignRequest) =>
      api.updateBdCampaign(id, data),
    onSuccess: () => invalidate("campaigns"),
  });
}

export function useDeleteBdCampaign() {
  const invalidate = useInvalidateBd();
  return useMutation({
    mutationFn: (id: string) => api.deleteBdCampaign(id),
    onSuccess: () => invalidate(),
  });
}
