export {
  ApiClient,
  ApiError,
  clientErrorMessage,
  dispatchReasonCode,
  errorCode,
  PreviewTooLargeError,
  PreviewUnsupportedError,
} from "./client";
export type {
  ApiClientOptions,
  ClientRuntimeSnapshot,
  ClientUsageRequest,
} from "./client";
export { parseWithFallback, setSchemaLogger } from "./schema";
export type { ParseOptions } from "./schema";
export { DuplicateIssueErrorBodySchema } from "./schemas";
export type { DuplicateIssueErrorBody } from "./schemas";
export { WSClient } from "./ws-client";

import type { ApiClient as ApiClientType } from "./client";

/** Module-level singleton — set once at app boot via `setApiInstance()`. */
let _api: ApiClientType | null = null;

export function setApiInstance(instance: ApiClientType) {
  _api = instance;
}

/** Returns the shared ApiClient singleton. Throws if not yet initialised. */
export function getApi(): ApiClientType {
  if (!_api) throw new Error("ApiClient not initialised — call setApiInstance() first");
  return _api;
}

/**
 * Convenience re-export: a proxy that forwards every property access to the
 * singleton so existing call-sites (`api.listIssues(...)`) keep working.
 */
export const api = new Proxy({} as ApiClientType, {
  get(_target, prop, receiver) {
    // Allow property inspection (HMR/React Refresh) before initialisation
    if (!_api) return undefined;
    const value = Reflect.get(_api, prop, receiver);
    return typeof value === "function" ? value.bind(_api) : value;
  },
});

// 千川投放 (WORKBENCH-API §25): zod parses live in `./qianchuan`, the query keys and
// read options in `./qianchuan-queries`. Two files because the client imports the
// schemas and the options import the client — one file would be a cycle.
export {
  AdsSummarySchema,
  EMPTY_ADS_SUMMARY,
  AdsAccountListSchema,
  EMPTY_ADS_ACCOUNTS,
  AdsPlanListSchema,
  EMPTY_ADS_PLANS,
  AdsMaterialListSchema,
  EMPTY_ADS_MATERIALS,
  AdsViolationListSchema,
  EMPTY_ADS_VIOLATIONS,
  AdsReconListSchema,
  EMPTY_ADS_RECON,
} from "./qianchuan";
export {
  adsKeys,
  adsSummaryOptions,
  adsAccountListOptions,
  adsPlanListOptions,
  adsMaterialListOptions,
  adsViolationListOptions,
  adsReconListOptions,
  ADS_BASIS_OPTIONS,
  type AdsListFilters,
} from "./qianchuan-queries";
