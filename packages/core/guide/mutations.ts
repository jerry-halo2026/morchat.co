import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { useWorkspaceId } from "../hooks";
import { workbenchKeys } from "../crm/queries";
import { guideKeys, type GuideResource } from "./queries";
import type {
  CreateHrInterviewGuideRequest,
  CreateHrQuestionRequest,
  HrGuideGenerateRequest,
  HrGuideGenerateResponse,
  HrGuideItem,
  UpdateHrGuideItemRequest,
  UpdateHrInterviewGuideRequest,
  UpdateHrQuestionRequest,
} from "../types";

/**
 * Interview question and guide mutations (docs/engineering/WORKBENCH-API.md §14).
 *
 * No optimistic row writes, same reasoning as the other workbench ledgers: these
 * rows carry server-decided values a client cannot predict — the moment an outline
 * was last edited, the `usage_count` a save bumps, the renumbering a deleted item
 * causes — so a guessed row would have to be reconciled a moment later.
 *
 * Invalidation is domain-wide (`["guide", wsId]`) rather than per resource, because
 * the halves are coupled: saving a guide increments the bank's `usage_count`, and the
 * item routes all rewrite the same `items` document. `["workbench", wsId]` is
 * invalidated alongside it for `/overview` and `/counts`, which read these tables.
 */
function useInvalidateGuideDomain() {
  const qc = useQueryClient();
  const wsId = useWorkspaceId();
  return (resource?: GuideResource) => {
    void qc.invalidateQueries({
      queryKey: resource ? guideKeys.resource(wsId, resource) : guideKeys.all(wsId),
    });
    void qc.invalidateQueries({ queryKey: workbenchKeys.all(wsId) });
  };
}

export function useCreateHrQuestion() {
  const invalidate = useInvalidateGuideDomain();
  return useMutation({
    mutationFn: (data: CreateHrQuestionRequest) => api.createHrQuestion(data),
    // A bank write can land on the same sentence twice, which answers 409; the error
    // surfaces to the form rather than being retried.
    onSuccess: () => invalidate("questions"),
  });
}

export function useUpdateHrQuestion() {
  const invalidate = useInvalidateGuideDomain();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & UpdateHrQuestionRequest) =>
      api.updateHrQuestion(id, data),
    onSuccess: () => invalidate("questions"),
  });
}

/** Soft delete. Outlines that already snapshot the question keep it (§14). */
export function useDeleteHrQuestion() {
  const invalidate = useInvalidateGuideDomain();
  return useMutation({
    mutationFn: (id: string) => api.deleteHrQuestion(id),
    onSuccess: () => invalidate("questions"),
  });
}

export function useCreateHrInterviewGuide() {
  const invalidate = useInvalidateGuideDomain();
  return useMutation({
    mutationFn: (data: CreateHrInterviewGuideRequest) => api.createHrInterviewGuide(data),
    onSuccess: () => invalidate(),
  });
}

export function useUpdateHrInterviewGuide() {
  const invalidate = useInvalidateGuideDomain();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & UpdateHrInterviewGuideRequest) =>
      api.updateHrInterviewGuide(id, data),
    onSuccess: () => invalidate(),
  });
}

export function useDeleteHrInterviewGuide() {
  const invalidate = useInvalidateGuideDomain();
  return useMutation({
    mutationFn: (id: string) => api.deleteHrInterviewGuide(id),
    onSuccess: () => invalidate(),
  });
}

/**
 * Append one snapshot entry — the picker's write. The response is the whole outline,
 * so the caller can replace its cached row instead of refetching it.
 */
export function useAppendHrGuideItem() {
  const invalidate = useInvalidateGuideDomain();
  return useMutation({
    mutationFn: ({ guideId, item }: { guideId: string; item: HrGuideItem }) =>
      api.appendHrGuideItem(guideId, item),
    onSuccess: () => invalidate(),
  });
}

/** Tick / note / score one entry, by position. */
export function useUpdateHrGuideItem() {
  const invalidate = useInvalidateGuideDomain();
  return useMutation({
    mutationFn: ({
      guideId,
      index,
      ...data
    }: { guideId: string; index: number } & UpdateHrGuideItemRequest) =>
      api.updateHrGuideItem(guideId, index, data),
    onSuccess: () => invalidate(),
  });
}

/** Remove one entry; the response is the renumbered outline. */
export function useDeleteHrGuideItem() {
  const invalidate = useInvalidateGuideDomain();
  return useMutation({
    mutationFn: ({ guideId, index }: { guideId: string; index: number }) =>
      api.deleteHrGuideItem(guideId, index),
    onSuccess: () => invalidate(),
  });
}

/**
 * Draft an outline without saving it.
 *
 * This is a mutation, not a query: it is an explicit action with a request body, it
 * changes nothing server-side, and its result belongs to the screen that asked for it.
 * Invalidating nothing is deliberate — a discarded draft must not refresh the lists.
 * The screen that keeps the draft in local state decides when to
 * `useCreateHrInterviewGuide` it.
 */
export function useGenerateHrInterviewGuide() {
  return useMutation<HrGuideGenerateResponse, Error, HrGuideGenerateRequest>({
    mutationFn: (data: HrGuideGenerateRequest) => api.generateHrInterviewGuide(data),
  });
}
