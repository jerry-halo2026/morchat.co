export {
  bdKeys,
  bdActivityDetailOptions,
  bdActivityListOptions,
  bdCampaignDetailOptions,
  bdCampaignListOptions,
  bdPipelineOptions,
  bdQuoteDetailOptions,
  bdQuoteListOptions,
  type BdResource,
} from "./queries";
export {
  useCreateBdActivity,
  useCreateBdCampaign,
  useCreateBdQuote,
  useDeleteBdActivity,
  useDeleteBdCampaign,
  useDeleteBdQuote,
  useOpenBdQuoteThread,
  useUpdateBdActivity,
  useUpdateBdCampaign,
  useUpdateBdQuote,
} from "./mutations";

// Performance over a date range (WORKBENCH-API §22): the windowed counterpart of
// the cockpit. Read-only — every number comes from the ledgers above and from
// `crm`/`affiliate`, so there is no mutation to hang off it.
export {
  EMPTY_BD_PERFORMANCE,
  BdPerformanceSchema,
  bdPerformanceKey,
  bdPerformanceOptions,
} from "./performance";
export type {
  BdPerformance,
  BdPerformanceAffiliateBlock,
  BdPerformanceFilters,
  BdPerformanceFollowupsBlock,
  BdPerformanceMemberRow,
  BdPerformanceMonthRow,
  BdPerformanceQuotesBlock,
  BdPerformanceSignedBlock,
  BdPerformanceTotals,
  BdPerformanceVolumeBlock,
} from "../types/bd";
