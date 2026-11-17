import { queryOptions } from "@tanstack/react-query";
import { api } from "../api";
import type {
  CrmBriefListFilters,
  CrmClientListFilters,
  CrmCollabListFilters,
  CrmSettlementListFilters,
} from "../types";

/**
 * Workbench aggregates (docs/engineering/WORKBENCH-API.md §5).
 *
 * Shape, verbatim:
 *   ["workbench", wsId, "overview", departmentId ?? "all"]
 *   ["workbench", wsId, "counts",   departmentId ?? "all"]
 *
 * `departmentId ?? "all"` is part of the key, not a missing filter: "the whole
 * workspace" and "this department" are different numbers, and the sentinel keeps
 * the key's arity fixed so `workbenchKeys.all(wsId)` invalidates both scopes at
 * once.
 *
 * These keys live here rather than in a `workbench/` module because the two
 * aggregates are read by the CRM/creator screens that own this block, and the
 * package exports this module already (see package.json). The overview itself is
 * defined by `../metrics/response`.
 */
export const workbenchKeys = {
  all: (wsId: string) => ["workbench", wsId] as const,
  overview: (wsId: string, departmentId: string | null = null) =>
    [...workbenchKeys.all(wsId), "overview", departmentId ?? "all"] as const,
  counts: (wsId: string, departmentId: string | null = null) =>
    [...workbenchKeys.all(wsId), "counts", departmentId ?? "all"] as const,
  /** The money block shares the `["workbench", wsId, …]` prefix, so the ledger
   *  events that already invalidate `workbenchKeys.all` refresh it too: a new
   *  settlement moves both the count and the collected figure. */
  finance: (wsId: string, departmentId: string | null = null) =>
    [...workbenchKeys.all(wsId), "finance", departmentId ?? "all"] as const,
  /**
   * The month entries that feed the money block's cost side (707). A separate
   * segment from `finance` because it is a different resource with its own write
   * — and `all(wsId)` still covers both, so one invalidation after a save
   * refreshes the entry and the figures it moves.
   */
  financeMonths: (wsId: string, month: string | null = null) =>
    [...workbenchKeys.all(wsId), "finance_months", month ?? "all"] as const,
};

/**
 * Every contract metric for one department scope. The server owns the numbers;
 * this hook only names the scope. A department change is a different key, so the
 * previous department's numbers are never shown while the new ones load.
 */
export function workbenchOverviewOptions(wsId: string, departmentId: string | null = null) {
  return queryOptions({
    queryKey: workbenchKeys.overview(wsId, departmentId),
    queryFn: () => api.getWorkbenchOverview({ department_id: departmentId }),
    enabled: !!wsId,
  });
}

/** Sidebar counts: rows, open collabs, pending settlements. */
export function workbenchCountsOptions(wsId: string, departmentId: string | null = null) {
  return queryOptions({
    queryKey: workbenchKeys.counts(wsId, departmentId),
    queryFn: () => api.getWorkbenchCounts({ department_id: departmentId }),
    enabled: !!wsId,
  });
}

/**
 * The money block (signed / collected / margin / receivable) for one scope.
 *
 * Same scoping rule as the other two aggregates: the department is part of the
 * key, so switching departments never shows the previous one's money while the
 * new figures load.
 */
export function workbenchFinanceOptions(wsId: string, departmentId: string | null = null) {
  return queryOptions({
    queryKey: workbenchKeys.finance(wsId, departmentId),
    queryFn: () => api.getWorkbenchFinance({ department_id: departmentId }),
    enabled: !!wsId,
  });
}

/**
 * The month entries behind the margin's cost side and the cash floor (707).
 *
 * `month` is the `YYYY-MM` label: with it the read is the one row the entry dialog
 * pre-fills from, without it the whole history. The month is part of the key, so a
 * save on one month cannot leave another month's form showing stale numbers.
 */
export function workbenchFinanceMonthsOptions(wsId: string, month: string | null = null) {
  return queryOptions({
    queryKey: workbenchKeys.financeMonths(wsId, month),
    queryFn: () => api.listWorkbenchFinanceMonths({ month }),
    enabled: !!wsId,
  });
}

/** The four ledger resources. Their names are part of the key, so keep them. */
export type CrmResource = "clients" | "briefs" | "collabs" | "settlements";

/**
 * Query keys for the CRM ledgers (docs/engineering/WORKBENCH-API.md §5).
 *
 * Shape, verbatim:
 *   ["crm", wsId, resource, filters]
 *
 * with `resource ∈ clients|briefs|collabs|settlements`. Detail reads reuse the
 * same shape — the fourth segment is `{ id }` — so a detail query and its list
 * sit under one prefix and a single invalidation refreshes both:
 *   ["crm", wsId, "clients", { id }]
 */
export const crmKeys = {
  all: (wsId: string) => ["crm", wsId] as const,
  resource: (wsId: string, resource: CrmResource) => [...crmKeys.all(wsId), resource] as const,
  list: <F extends object>(wsId: string, resource: CrmResource, filters: F) =>
    [...crmKeys.all(wsId), resource, filters] as const,
  detail: (wsId: string, resource: CrmResource, id: string) =>
    [...crmKeys.all(wsId), resource, { id }] as const,
};

export function crmClientListOptions(wsId: string, filters: CrmClientListFilters = {}) {
  return queryOptions({
    queryKey: crmKeys.list(wsId, "clients", filters),
    queryFn: () => api.listCrmClients(filters),
    enabled: !!wsId,
  });
}

export function crmClientDetailOptions(wsId: string, id: string) {
  return queryOptions({
    queryKey: crmKeys.detail(wsId, "clients", id),
    queryFn: () => api.getCrmClient(id),
    enabled: !!wsId && !!id,
  });
}

export function crmBriefListOptions(wsId: string, filters: CrmBriefListFilters = {}) {
  return queryOptions({
    queryKey: crmKeys.list(wsId, "briefs", filters),
    queryFn: () => api.listCrmBriefs(filters),
    enabled: !!wsId,
  });
}

export function crmBriefDetailOptions(wsId: string, id: string) {
  return queryOptions({
    queryKey: crmKeys.detail(wsId, "briefs", id),
    queryFn: () => api.getCrmBrief(id),
    enabled: !!wsId && !!id,
  });
}

/**
 * Collabs are also the fulfilment board (contract §6): the same list, filtered
 * by `stage`. One key shape means the board columns and the ledger table cannot
 * disagree about a row.
 */
export function crmCollabListOptions(wsId: string, filters: CrmCollabListFilters = {}) {
  return queryOptions({
    queryKey: crmKeys.list(wsId, "collabs", filters),
    queryFn: () => api.listCrmCollabs(filters),
    enabled: !!wsId,
  });
}

export function crmCollabDetailOptions(wsId: string, id: string) {
  return queryOptions({
    queryKey: crmKeys.detail(wsId, "collabs", id),
    queryFn: () => api.getCrmCollab(id),
    enabled: !!wsId && !!id,
  });
}

/** The money ledger has no detail read (contract §3): it is always listed by
 *  `collab_id` or by `paid`. */
export function crmSettlementListOptions(wsId: string, filters: CrmSettlementListFilters = {}) {
  return queryOptions({
    queryKey: crmKeys.list(wsId, "settlements", filters),
    queryFn: () => api.listCrmSettlements(filters),
    enabled: !!wsId,
  });
}
