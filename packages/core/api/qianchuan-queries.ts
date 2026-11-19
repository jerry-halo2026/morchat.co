import { queryOptions } from "@tanstack/react-query";
import { api } from "./index";
import type { AdsBasis, AdsSummaryFilters } from "../types";

/**
 * 千川投放的 query key 与六个只读读法（WORKBENCH-API §25）。
 *
 * 与 `qianchuan.ts`（zod schema）分开的原因只有一个：schema 被 `api/client.ts` 引用，
 * 而这里的 query options 引用 `api` 单例。放在同一个文件里就成了「client → 本文件 →
 * client」的循环。两个文件合起来仍然是「千川域没有 mutation」这句话。
 *
 * **`basis` 在 key 里。** 1h 的汇总和 7d 的汇总是两个数，不是同一个数的两种画法；
 * 把它们放在同一个缓存条目里，切一次口径就会先看到上一口径的数字。
 */

export const adsKeys = {
  all: (wsId: string) => ["ads", wsId] as const,
  summary: (wsId: string, filters: AdsSummaryFilters) =>
    [...adsKeys.all(wsId), "summary", filters] as const,
  accounts: (wsId: string) => [...adsKeys.all(wsId), "accounts"] as const,
  plans: (wsId: string, filters: AdsListFilters) =>
    [...adsKeys.all(wsId), "plans", filters] as const,
  materials: (wsId: string, filters: AdsListFilters) =>
    [...adsKeys.all(wsId), "materials", filters] as const,
  violations: (wsId: string, filters: AdsListFilters) =>
    [...adsKeys.all(wsId), "violations", filters] as const,
  recon: (wsId: string, filters: AdsListFilters) =>
    [...adsKeys.all(wsId), "recon", filters] as const,
};

/** The list filters the four list endpoints take; each ignores the keys it does not know. */
export interface AdsListFilters {
  account_id?: string;
  status?: string;
  type?: string;
}

export function adsSummaryOptions(wsId: string, filters: AdsSummaryFilters = {}) {
  return queryOptions({
    queryKey: adsKeys.summary(wsId, filters),
    queryFn: () => api.getAdsSummary(filters),
    enabled: !!wsId,
  });
}

export function adsAccountListOptions(wsId: string) {
  return queryOptions({
    queryKey: adsKeys.accounts(wsId),
    queryFn: () => api.listAdsAccounts(),
    enabled: !!wsId,
  });
}

export function adsPlanListOptions(wsId: string, filters: AdsListFilters = {}) {
  return queryOptions({
    queryKey: adsKeys.plans(wsId, filters),
    queryFn: () => api.listAdsPlans(filters),
    enabled: !!wsId,
  });
}

export function adsMaterialListOptions(wsId: string, filters: AdsListFilters = {}) {
  return queryOptions({
    queryKey: adsKeys.materials(wsId, filters),
    queryFn: () => api.listAdsMaterials(filters),
    enabled: !!wsId,
  });
}

export function adsViolationListOptions(wsId: string, filters: AdsListFilters = {}) {
  return queryOptions({
    queryKey: adsKeys.violations(wsId, filters),
    queryFn: () => api.listAdsViolations(filters),
    enabled: !!wsId,
  });
}

export function adsReconListOptions(wsId: string, filters: AdsListFilters = {}) {
  return queryOptions({
    queryKey: adsKeys.recon(wsId, filters),
    queryFn: () => api.listAdsRecon(filters),
    enabled: !!wsId,
  });
}

/** The five settlement windows, in the order a picker shows them. */
export const ADS_BASIS_OPTIONS: readonly AdsBasis[] = [
  "settle_1h",
  "settle_7d",
  "settle_14d",
  "settle_30d",
  "settle_90d",
];
