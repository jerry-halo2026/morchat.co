export {
  affiliateKeys,
  affiliateDailyOptions,
  affiliatePickDetailOptions,
  affiliatePickListOptions,
  affiliateProductDetailOptions,
  affiliateProductListOptions,
  affiliateSettlementListOptions,
  affiliateSummaryOptions,
} from "./queries";
export type { AffiliateResource } from "./queries";
export {
  useCreateAffiliatePick,
  useCreateAffiliateProduct,
  useCreateAffiliateSettlement,
  useDeleteAffiliatePick,
  useDeleteAffiliateProduct,
  useUpdateAffiliatePick,
  useUpdateAffiliateProduct,
  useUpdateAffiliateSettlement,
  useUpsertAffiliateDaily,
} from "./mutations";
