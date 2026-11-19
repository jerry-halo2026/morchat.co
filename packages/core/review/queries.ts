import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { useWorkspaceId } from "../hooks";
import type {
  RejectReviewRequest,
  ReviewDomain,
  ReviewQueueFilters,
  ReviewQueueResponse,
} from "../types";

/**
 * The review queue's reads and writes (docs/engineering/WORKBENCH-API.md §26).
 *
 * Key shape follows every other workbench resource — `["review", wsId, filters]`
 * — so a verdict can invalidate the queue with one prefix, and `["workbench",
 * wsId]` rides along because the two rates in the overview are computed from the
 * verdicts this file writes. A queue that told the reviewer "0 left" while the
 * cockpit still counted the same rows would be two answers to one question.
 */
export const reviewKeys = {
  all: (wsId: string) => ["review", wsId] as const,
  queue: (wsId: string, filters: ReviewQueueFilters) =>
    [...reviewKeys.all(wsId), "queue", filters] as const,
};

export function reviewQueueOptions(wsId: string, filters: ReviewQueueFilters = {}) {
  return queryOptions({
    queryKey: reviewKeys.queue(wsId, filters),
    queryFn: () => api.listReviewQueue(filters),
    enabled: !!wsId,
  });
}

/**
 * Every queue and the two workbench aggregates — never one filter's page: a
 * verdict removes a row from *all* of them (the domain filters are views of one
 * queue), and the rates in `/overview` move with it.
 */
function useInvalidateReview() {
  const qc = useQueryClient();
  const wsId = useWorkspaceId();
  return () => {
    void qc.invalidateQueries({ queryKey: reviewKeys.all(wsId) });
    void qc.invalidateQueries({ queryKey: ["workbench", wsId] });
  };
}

/** One row, both verdicts. The server decides the state; nothing is optimistic. */
export function useAcceptReview() {
  const invalidate = useInvalidateReview();
  return useMutation({
    mutationFn: ({ domain, id }: { domain: ReviewDomain | string; id: string }) =>
      api.acceptReview(domain, id),
    onSuccess: invalidate,
  });
}

export function useRejectReview() {
  const invalidate = useInvalidateReview();
  return useMutation({
    mutationFn: ({
      domain,
      id,
      ...data
    }: { domain: ReviewDomain | string; id: string } & RejectReviewRequest) =>
      api.rejectReview(domain, id, data),
    onSuccess: invalidate,
  });
}

/** The queue as the page holds it: rows out of a response, still un-flattened. */
export function reviewRows(response: ReviewQueueResponse | undefined) {
  return response?.rows ?? [];
}
