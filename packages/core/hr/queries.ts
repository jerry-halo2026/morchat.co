import { queryOptions } from "@tanstack/react-query";
import { api } from "../api";
import type {
  HrCandidateListFilters,
  HrEmployeeProfileListFilters,
  HrInterviewListFilters,
  HrJobListFilters,
  HrScorecardListFilters,
} from "../types/workbench";

/**
 * Query keys for the HR block (docs/engineering/WORKBENCH-API.md §10.6).
 *
 * Shape, verbatim:
 *   ["hr", wsId, resource, filters]
 *   ["hr", wsId, resource, { id }]
 *
 * with `resource ∈ jobs|candidates|interviews|scorecards|employees`. Detail
 * reads reuse the list shape with `{ id }` in the fourth segment, so a detail
 * query sits under its resource prefix and one invalidation refreshes both.
 *
 * `wsId` is the second segment for the same reason as every other workbench key:
 * a workspace switch must not read the previous workspace's rows out of the
 * cache, and `hrKeys.all(wsId)` is the whole-domain prefix the realtime layer
 * and the mutations invalidate.
 *
 * The aggregates are *not* here. §10.6 keeps `/overview` and `/counts` on
 * `["workbench", wsId, …]`; `workbenchKeys` (in `../crm/queries`) owns those, and
 * every HR mutation invalidates them alongside this domain.
 */

/** The five HR resources. Their names are part of the key, so keep them. */
export type HrResource = "jobs" | "candidates" | "interviews" | "scorecards" | "employees";

export const hrKeys = {
  all: (wsId: string) => ["hr", wsId] as const,
  resource: (wsId: string, resource: HrResource) => [...hrKeys.all(wsId), resource] as const,
  list: <F extends object>(wsId: string, resource: HrResource, filters: F) =>
    [...hrKeys.all(wsId), resource, filters] as const,
  detail: (wsId: string, resource: HrResource, id: string) =>
    [...hrKeys.all(wsId), resource, { id }] as const,
};

export function hrJobListOptions(wsId: string, filters: HrJobListFilters = {}) {
  return queryOptions({
    queryKey: hrKeys.list(wsId, "jobs", filters),
    queryFn: () => api.listHrJobs(filters),
    enabled: !!wsId,
  });
}

export function hrJobDetailOptions(wsId: string, id: string) {
  return queryOptions({
    queryKey: hrKeys.detail(wsId, "jobs", id),
    queryFn: () => api.getHrJob(id),
    enabled: !!wsId && !!id,
  });
}

/** The pipeline board reads this list filtered by `stage` (one key shape, so a
 *  column and the candidate table cannot disagree about a row). */
export function hrCandidateListOptions(wsId: string, filters: HrCandidateListFilters = {}) {
  return queryOptions({
    queryKey: hrKeys.list(wsId, "candidates", filters),
    queryFn: () => api.listHrCandidates(filters),
    enabled: !!wsId,
  });
}

export function hrCandidateDetailOptions(wsId: string, id: string) {
  return queryOptions({
    queryKey: hrKeys.detail(wsId, "candidates", id),
    queryFn: () => api.getHrCandidate(id),
    enabled: !!wsId && !!id,
  });
}

export function hrInterviewListOptions(wsId: string, filters: HrInterviewListFilters = {}) {
  return queryOptions({
    queryKey: hrKeys.list(wsId, "interviews", filters),
    queryFn: () => api.listHrInterviews(filters),
    enabled: !!wsId,
  });
}

export function hrInterviewDetailOptions(wsId: string, id: string) {
  return queryOptions({
    queryKey: hrKeys.detail(wsId, "interviews", id),
    queryFn: () => api.getHrInterview(id),
    enabled: !!wsId && !!id,
  });
}

/**
 * Scorecards have no single-row read (§10.3): a scorecard is listed by
 * `interview_id` and shown with its interview, exactly like B0's settlements.
 */
export function hrScorecardListOptions(wsId: string, filters: HrScorecardListFilters = {}) {
  return queryOptions({
    queryKey: hrKeys.list(wsId, "scorecards", filters),
    queryFn: () => api.listHrScorecards(filters),
    enabled: !!wsId,
  });
}

export function hrEmployeeListOptions(wsId: string, filters: HrEmployeeProfileListFilters = {}) {
  return queryOptions({
    queryKey: hrKeys.list(wsId, "employees", filters),
    queryFn: () => api.listHrEmployees(filters),
    enabled: !!wsId,
  });
}

export function hrEmployeeDetailOptions(wsId: string, id: string) {
  return queryOptions({
    queryKey: hrKeys.detail(wsId, "employees", id),
    queryFn: () => api.getHrEmployee(id),
    enabled: !!wsId && !!id,
  });
}
