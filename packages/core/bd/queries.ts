import { queryOptions } from "@tanstack/react-query";
import { api } from "../api";
import type {
  BdActivityListFilters,
  BdCampaignListFilters,
  BdQuoteListFilters,
} from "../types";

/**
 * Query keys for the BD pipeline (docs/engineering/WORKBENCH-API.md §20).
 *
 * Shape, verbatim:
 *   ["bd", wsId, "pipeline"]
 *   ["bd", wsId, resource, filters]      resource ∈ activities|quotes|campaigns
 *   ["bd", wsId, resource, { id }]
 *
 * The pipeline sits under the same `["bd", wsId]` prefix as the ledgers because
 * every one of them moves one of its numbers: recording a follow-up changes
 * `followups`, sending a quote changes `quotes`, and a collaboration stage change
 * (written through the CRM module) changes `orders`. One invalidation therefore
 * refreshes the cockpit and the list it was edited from, and the detail read
 * shares its resource prefix so a drawer row and its list cannot disagree.
 */
export const bdKeys = {
  all: (wsId: string) => ["bd", wsId] as const,
  pipeline: (wsId: string) => [...bdKeys.all(wsId), "pipeline"] as const,
  resource: (wsId: string, resource: BdResource) =>
    [...bdKeys.all(wsId), resource] as const,
  list: <F extends object>(wsId: string, resource: BdResource, filters: F) =>
    [...bdKeys.all(wsId), resource, filters] as const,
  detail: (wsId: string, resource: BdResource, id: string) =>
    [...bdKeys.all(wsId), resource, { id }] as const,
};

/** The three ledgers. `orders` is not one of them: a collaboration is `crm`. */
export type BdResource = "activities" | "quotes" | "campaigns";

/**
 * The 驾驶舱. One key, one request: the four blocks are read together because a
 * BD screen draws them together, and splitting them would make four loading
 * states where the page wants one.
 */
export function bdPipelineOptions(wsId: string) {
  return queryOptions({
    queryKey: bdKeys.pipeline(wsId),
    queryFn: () => api.getBdPipeline(),
    enabled: !!wsId,
  });
}

/** A creator's follow-up history, or the workspace timeline when `creator_id` is
 *  omitted. Ordered `happened_at DESC` by the server, not by the caller. */
export function bdActivityListOptions(wsId: string, filters: BdActivityListFilters = {}) {
  return queryOptions({
    queryKey: bdKeys.list(wsId, "activities", filters),
    queryFn: () => api.listBdActivities(filters),
    enabled: !!wsId,
  });
}

export function bdActivityDetailOptions(wsId: string, id: string) {
  return queryOptions({
    queryKey: bdKeys.detail(wsId, "activities", id),
    queryFn: () => api.getBdActivity(id),
    enabled: !!wsId && !!id,
  });
}

/** Offers for one creator, or one status segment of the quote ledger. */
export function bdQuoteListOptions(wsId: string, filters: BdQuoteListFilters = {}) {
  return queryOptions({
    queryKey: bdKeys.list(wsId, "quotes", filters),
    queryFn: () => api.listBdQuotes(filters),
    enabled: !!wsId,
  });
}

export function bdQuoteDetailOptions(wsId: string, id: string) {
  return queryOptions({
    queryKey: bdKeys.detail(wsId, "quotes", id),
    queryFn: () => api.getBdQuote(id),
    enabled: !!wsId && !!id,
  });
}

/** Collection batches, optionally one `kind` (search / comment / manual). */
export function bdCampaignListOptions(wsId: string, filters: BdCampaignListFilters = {}) {
  return queryOptions({
    queryKey: bdKeys.list(wsId, "campaigns", filters),
    queryFn: () => api.listBdCampaigns(filters),
    enabled: !!wsId,
  });
}

export function bdCampaignDetailOptions(wsId: string, id: string) {
  return queryOptions({
    queryKey: bdKeys.detail(wsId, "campaigns", id),
    queryFn: () => api.getBdCampaign(id),
    enabled: !!wsId && !!id,
  });
}
