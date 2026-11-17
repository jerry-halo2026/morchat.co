import { queryOptions } from "@tanstack/react-query";
import { api } from "../api";
import type { HrGuideListFilters, HrQuestionListFilters } from "../types";

/**
 * Query keys for interview questions and per-round guides
 * (docs/engineering/WORKBENCH-API.md §14).
 *
 * Shape, verbatim:
 *   ["guide", wsId, resource, filters]
 *   ["guide", wsId, resource, { id }]
 *
 * `resource ∈ questions|guides`. `wsId` is the second segment for the same reason as
 * every other workbench key: a workspace switch must not read the previous
 * workspace's rows out of the cache, and `guideKeys.all(wsId)` is the whole-domain
 * prefix the mutations invalidate.
 *
 * The two halves share one prefix because they are one screen and one write flow: a
 * bank row is picked into an outline, and saving the outline bumps that row's
 * `usage_count` — so a mutation on either side can move the other's list.
 *
 * There is no key for the generator. `POST /guides/generate` writes nothing and its
 * result is a draft the user may throw away, which is mutation-shaped state, not
 * server data: caching it under a key would make a discarded draft look like a row.
 */

/** The two guide-domain resources. Their names are part of the key, so keep them. */
export type GuideResource = "questions" | "guides";

export const guideKeys = {
  all: (wsId: string) => ["guide", wsId] as const,
  resource: (wsId: string, resource: GuideResource) =>
    [...guideKeys.all(wsId), resource] as const,
  list: <F extends object>(wsId: string, resource: GuideResource, filters: F) =>
    [...guideKeys.all(wsId), resource, filters] as const,
  detail: (wsId: string, resource: GuideResource, id: string) =>
    [...guideKeys.all(wsId), resource, { id }] as const,
};

/**
 * The question bank. `job_id` / `dimension` / `q` are independent filters: a
 * requisition scopes the list, a dimension groups it, `q` searches the text.
 */
export function hrQuestionListOptions(wsId: string, filters: HrQuestionListFilters = {}) {
  return queryOptions({
    queryKey: guideKeys.list(wsId, "questions", filters),
    queryFn: () => api.listHrQuestions(filters),
    enabled: !!wsId,
  });
}

export function hrQuestionDetailOptions(wsId: string, id: string) {
  return queryOptions({
    queryKey: guideKeys.detail(wsId, "questions", id),
    queryFn: () => api.getHrQuestion(id),
    enabled: !!wsId && !!id,
  });
}

/**
 * A candidate's (or a round's) outlines. `candidate_id` and `interview_id` are the
 * two reads the UI makes: "what is prepared for this person" and "what do I open from
 * this booking".
 */
export function hrGuideListOptions(wsId: string, filters: HrGuideListFilters = {}) {
  return queryOptions({
    queryKey: guideKeys.list(wsId, "guides", filters),
    queryFn: () => api.listHrInterviewGuides(filters),
    enabled: !!wsId,
  });
}

export function hrGuideDetailOptions(wsId: string, id: string) {
  return queryOptions({
    queryKey: guideKeys.detail(wsId, "guides", id),
    queryFn: () => api.getHrInterviewGuide(id),
    enabled: !!wsId && !!id,
  });
}
