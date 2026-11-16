import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { useWorkspaceId } from "../hooks";
import { workbenchKeys } from "../crm/queries";
import { creatorKeys } from "./queries";
import type {
  CreateCreatorRequest,
  CreateCreatorPostRequest,
  CreatorPost,
  UpdateCreatorPostRequest,
  UpdateCreatorRequest,
  UpsertCreatorPostMetricRequest,
} from "../types";

/**
 * Creator ledger mutations.
 *
 * No optimistic row writes. A ledger row carries a dozen nullable money and
 * metric fields whose server-side defaults (currency, stage timestamps, owner)
 * a client cannot predict, so a guessed row would have to be reconciled against
 * the authoritative one a moment later. The list is small and re-reads fast, so
 * every write invalidates the domain and lets the refetch be the row.
 *
 * Every write also invalidates `["workbench", wsId]`, which covers both
 * aggregate endpoints: a creator row moves `creators` in /counts and the
 * repeat-rate and ROI metrics in /overview. The server emits the same
 * invalidation over the websocket; doing it here too means a delivery gap cannot
 * leave the aggregates wrong until the next event (the global staleTime is
 * Infinity).
 */

function useInvalidateCreatorLedger() {
  const qc = useQueryClient();
  const wsId = useWorkspaceId();
  return () => {
    void qc.invalidateQueries({ queryKey: creatorKeys.all(wsId) });
    void qc.invalidateQueries({ queryKey: workbenchKeys.all(wsId) });
  };
}

export function useCreateCreator() {
  const invalidate = useInvalidateCreatorLedger();
  return useMutation({
    mutationFn: (data: CreateCreatorRequest) => api.createCreator(data),
    onSuccess: invalidate,
  });
}

export function useUpdateCreator() {
  const invalidate = useInvalidateCreatorLedger();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & UpdateCreatorRequest) =>
      api.updateCreator(id, data),
    onSuccess: invalidate,
  });
}

/** Soft delete: the row keeps its data and stops appearing in lists. */
export function useDeleteCreator() {
  const invalidate = useInvalidateCreatorLedger();
  return useMutation({
    mutationFn: (id: string) => api.deleteCreator(id),
    onSuccess: invalidate,
  });
}

export function useCreateCreatorPost() {
  const invalidate = useInvalidateCreatorLedger();
  return useMutation({
    mutationFn: (data: CreateCreatorPostRequest) => api.createCreatorPost(data),
    onSuccess: invalidate,
  });
}

export function useUpdateCreatorPost() {
  const invalidate = useInvalidateCreatorLedger();
  return useMutation({
    mutationFn: ({
      id,
      ...data
    }: { id: string } & UpdateCreatorPostRequest): Promise<CreatorPost> =>
      api.updateCreatorPost(id, data),
    onSuccess: invalidate,
  });
}

export function useDeleteCreatorPost() {
  const invalidate = useInvalidateCreatorLedger();
  return useMutation({
    mutationFn: (id: string) => api.deleteCreatorPost(id),
    onSuccess: invalidate,
  });
}

/**
 * One day's snapshot, upserted on `(post_id, captured_on)`.
 *
 * The mutation takes the post id explicitly rather than closing over a
 * component's post: the same hook is used by the per-post backfill row and by
 * the bulk-import sheet, which writes many posts in one pass.
 */
export function useUpsertCreatorPostMetric() {
  const invalidate = useInvalidateCreatorLedger();
  return useMutation({
    mutationFn: ({
      postId,
      ...data
    }: { postId: string } & UpsertCreatorPostMetricRequest) =>
      api.upsertCreatorPostMetric(postId, data),
    onSuccess: invalidate,
  });
}
