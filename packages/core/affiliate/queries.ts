import { queryOptions } from "@tanstack/react-query";
import { api } from "../api";
import type {
  AffiliateDailyListFilters,
  AffiliatePickListFilters,
  AffiliateProductListFilters,
  AffiliateSettlementListFilters,
  AffiliateSummaryFilters,
} from "../types";

/**
 * Query keys for 精选联盟 分销 (docs/engineering/WORKBENCH-API.md §11).
 *
 * Shape, verbatim:
 *   ["affiliate", wsId, resource, filters]
 *   ["affiliate", wsId, "summary", { month, departmentId }]
 *
 * `resource ∈ products|picks|daily|settlements`. Detail reads reuse the same
 * shape with `{ id }` as the fourth segment, so a detail query and its list sit
 * under one prefix and one invalidation refreshes both. `wsId` is in position 1
 * like every other workspace-scoped key.
 *
 * The summary is a separate segment from the four resources because it is a
 * different read (a month of aggregates over all of them), but it shares the
 * `["affiliate", wsId]` prefix: an event or a mutation that invalidates `all`
 * refreshes the strip and the ledgers it is computed from together.
 */
export type AffiliateResource = "products" | "picks" | "daily" | "settlements";

export const affiliateKeys = {
  all: (wsId: string) => ["affiliate", wsId] as const,
  resource: (wsId: string, resource: AffiliateResource) =>
    [...affiliateKeys.all(wsId), resource] as const,
  list: <F extends object>(wsId: string, resource: AffiliateResource, filters: F) =>
    [...affiliateKeys.all(wsId), resource, filters] as const,
  detail: (wsId: string, resource: AffiliateResource, id: string) =>
    [...affiliateKeys.all(wsId), resource, { id }] as const,
  /**
   * `month`/`departmentId` are part of the key rather than missing filters:
   * "this month" and "last month", and "this department" and "the whole
   * workspace", are different numbers, and the sentinels keep the arity fixed so
   * `affiliateKeys.all(wsId)` still invalidates every scope at once.
   */
  summary: (wsId: string, month: string | null, departmentId: string | null) =>
    [...affiliateKeys.all(wsId), "summary", month ?? "current", departmentId ?? "all"] as const,
};

export function affiliateSummaryOptions(
  wsId: string,
  filters: AffiliateSummaryFilters = {},
) {
  const month = filters.month ?? null;
  const departmentId = filters.department_id ?? null;
  return queryOptions({
    queryKey: affiliateKeys.summary(wsId, month, departmentId),
    queryFn: () => api.getAffiliateSummary({ month, department_id: departmentId }),
    enabled: !!wsId,
  });
}

export function affiliateProductListOptions(
  wsId: string,
  filters: AffiliateProductListFilters = {},
) {
  return queryOptions({
    queryKey: affiliateKeys.list(wsId, "products", filters),
    queryFn: () => api.listAffiliateProducts(filters),
    enabled: !!wsId,
  });
}

export function affiliateProductDetailOptions(wsId: string, id: string) {
  return queryOptions({
    queryKey: affiliateKeys.detail(wsId, "products", id),
    queryFn: () => api.getAffiliateProduct(id),
    enabled: !!wsId && !!id,
  });
}

export function affiliatePickListOptions(wsId: string, filters: AffiliatePickListFilters = {}) {
  return queryOptions({
    queryKey: affiliateKeys.list(wsId, "picks", filters),
    queryFn: () => api.listAffiliatePicks(filters),
    enabled: !!wsId,
  });
}

export function affiliatePickDetailOptions(wsId: string, id: string) {
  return queryOptions({
    queryKey: affiliateKeys.detail(wsId, "picks", id),
    queryFn: () => api.getAffiliatePick(id),
    enabled: !!wsId && !!id,
  });
}

/**
 * The reported days. `pick_id` narrows it to one promotion plan; `from`/`to` are
 * inclusive calendar days, which is what the day snapshot is keyed by.
 */
export function affiliateDailyOptions(wsId: string, filters: AffiliateDailyListFilters = {}) {
  return queryOptions({
    queryKey: affiliateKeys.list(wsId, "daily", filters),
    queryFn: () => api.listAffiliateDaily(filters),
    enabled: !!wsId,
  });
}

/** The platform's statements. There is no detail read: a statement is one row. */
export function affiliateSettlementListOptions(
  wsId: string,
  filters: AffiliateSettlementListFilters = {},
) {
  return queryOptions({
    queryKey: affiliateKeys.list(wsId, "settlements", filters),
    queryFn: () => api.listAffiliateSettlements(filters),
    enabled: !!wsId,
  });
}
