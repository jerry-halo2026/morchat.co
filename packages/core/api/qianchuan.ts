import { z } from "zod";
import type {
  AdsAccountListResponse,
  AdsMaterialListResponse,
  AdsMoney,
  AdsNumber,
  AdsPlanListResponse,
  AdsReconListResponse,
  AdsSummary,
  AdsTotals,
  AdsViolationListResponse,
} from "../types";

/**
 * 千川投放的读面（WORKBENCH-API §25）：六个只读端点、一套 query key。
 *
 * 这个模块放在 `api/` 而不是 `crm/`、`bd/` 那样的一等领域目录里，是因为千川
 * **没有 mutation**：写入口只有 `server/cmd/qianchuan-sync`。一个只有读的域不需要
 * 一个 `mutations.ts`，把 schema、key 和 query options 放在一起就不会有人顺手加
 * 一个 `useCreateAdsPlan`。
 *
 * 三条读法跟着 schema 走：
 *
 *   - **金额三态。** `amount: null` + `empty: "insufficient_data"` 是「没有行可加」，
 *     不是 0 元；schema 缺字段时**退化成这个状态**而不是 0（`ADS_EMPTY_MONEY`）。
 *   - **一个窗口一种钱。** `summary` 的每个请求都带 `basis`，`basis` 是 query key
 *     的一部分：两个窗口是两个缓存条目，不会是同一份数据换个标签。
 *   - **未知值不炸整页。** `basis` / `kind` / `status` 在响应里保持字符串（`z.string()`），
 *     平台加了新枚举时页面画原值，而不是让整张表解析失败。
 */

const adsEmptyState = z.enum(["zero", "insufficient_data"]);

const adsMoneySchema = z
  .object({
    amount: z.number().nullable().default(null),
    currency: z.string().default("CNY"),
    sample_count: z.number().default(0),
    empty: adsEmptyState.default("insufficient_data"),
  })


const adsNumberSchema = z
  .object({
    value: z.number().nullable().default(null),
    sample_count: z.number().default(0),
    empty: adsEmptyState.default("zero"),
  })


/** 一个三态金额的「没有数」形态：缺字段时退化成它，而不是退化成 0。 */
export const ADS_EMPTY_MONEY: AdsMoney = {
  amount: null,
  currency: "CNY",
  sample_count: 0,
  empty: "insufficient_data",
};

const adsEmptyNumber: AdsNumber = { value: null, sample_count: 0, empty: "zero" };

const adsTotalsSchema = z
  .object({
    spend: adsMoneySchema.default(() => ({ ...ADS_EMPTY_MONEY })),
    gmv: adsMoneySchema.default(() => ({ ...ADS_EMPTY_MONEY })),
    refund: adsMoneySchema.default(() => ({ ...ADS_EMPTY_MONEY })),
    settle: adsMoneySchema.default(() => ({ ...ADS_EMPTY_MONEY })),
    orders: adsNumberSchema.default(() => ({ ...adsEmptyNumber })),
  })


/** 缺一组数字时，五格全部退化成「没有数」—— 不补 0。 */
const ADS_EMPTY_TOTALS: AdsTotals = {
  spend: { ...ADS_EMPTY_MONEY },
  gmv: { ...ADS_EMPTY_MONEY },
  refund: { ...ADS_EMPTY_MONEY },
  settle: { ...ADS_EMPTY_MONEY },
  orders: { ...adsEmptyNumber },
};

export const AdsSummarySchema = z
  .object({
    from: z.string().default(""),
    to: z.string().default(""),
    basis: z.string().default("settle_7d"),
    currency: z.string().default("CNY"),
    empty: adsEmptyState.default("insufficient_data"),
    totals: adsTotalsSchema.default(() => ({ ...ADS_EMPTY_TOTALS })),
    previous: adsTotalsSchema.default(() => ({ ...ADS_EMPTY_TOTALS })),
    basis_options: z.array(z.string()).default([]),
  })
  .loose();

export const EMPTY_ADS_SUMMARY: AdsSummary = {
  from: "",
  to: "",
  basis: "settle_7d",
  currency: "CNY",
  empty: "insufficient_data",
  totals: ADS_EMPTY_TOTALS,
  previous: ADS_EMPTY_TOTALS,
  basis_options: [],
};

const adsAccountSchema = z
  .object({
    account_id: z.string().default(""),
    account_name: z.string().default(""),
    currency: z.string().default("CNY"),
    unit: z.string().default("fen"),
    balance: z.number().nullable().default(null),
    cash: z.number().nullable().default(null),
    valid_grant: z.number().nullable().default(null),
    captured_at: z.string().nullable().default(null),
    spend_to_date: z.number().nullable().default(null),
  })
  .loose();

export const AdsAccountListSchema = z
  .object({
    accounts: z.array(adsAccountSchema).default([]),
    total: z.number().default(0),
  })
  .loose();

export const EMPTY_ADS_ACCOUNTS: AdsAccountListResponse = { accounts: [], total: 0 };

const adsPlanSchema = z
  .object({
    plan_id: z.string().default(""),
    account_id: z.string().default(""),
    account_name: z.string().default(""),
    name: z.string().default(""),
    marketing_goal: z.string().nullable().default(null),
    status: z.string().nullable().default(null),
    opt_status: z.string().nullable().default(null),
    budget: z.number().nullable().default(null),
    budget_mode: z.string().nullable().default(null),
    roi2_goal: z.number().nullable().default(null),
    smart_bid_type: z.string().nullable().default(null),
    updated_at: z.string().default(""),
  })
  .loose();

export const AdsPlanListSchema = z
  .object({
    plans: z.array(adsPlanSchema).default([]),
    total: z.number().default(0),
  })
  .loose();

export const EMPTY_ADS_PLANS: AdsPlanListResponse = { plans: [], total: 0 };

const adsMaterialSchema = z
  .object({
    kind: z.string().default(""),
    material_id: z.string().default(""),
    account_id: z.string().default(""),
    account_name: z.string().default(""),
    filename: z.string().nullable().default(null),
    video_id: z.string().nullable().default(null),
    image_id: z.string().nullable().default(null),
    duration: z.number().nullable().default(null),
    size_bytes: z.number().nullable().default(null),
    is_ai_create: z.boolean().nullable().default(null),
    is_inefficient: z.boolean().nullable().default(null),
    is_original: z.boolean().nullable().default(null),
    media_script_id: z.string().nullable().default(null),
    captured_at: z.string().default(""),
  })
  .loose();

export const AdsMaterialListSchema = z
  .object({
    materials: z.array(adsMaterialSchema).default([]),
    total: z.number().default(0),
  })
  .loose();

export const EMPTY_ADS_MATERIALS: AdsMaterialListResponse = { materials: [], total: 0 };

const adsViolationSchema = z
  .object({
    event_id: z.string().default(""),
    account_id: z.string().default(""),
    account_name: z.string().default(""),
    ad_id: z.string().nullable().default(null),
    create_time: z.string().nullable().default(null),
    illegal_type: z.string().nullable().default(null),
    score: z.number().nullable().default(null),
    status: z.string().nullable().default(null),
    reject_reason: z.string().nullable().default(null),
  })
  .loose();

export const AdsViolationListSchema = z
  .object({
    violations: z.array(adsViolationSchema).default([]),
    total: z.number().default(0),
  })
  .loose();

export const EMPTY_ADS_VIOLATIONS: AdsViolationListResponse = { violations: [], total: 0 };

const adsReconSchema = z
  .object({
    account_id: z.string().default(""),
    goal: z.string().default(""),
    account_name: z.string().default(""),
    currency: z.string().default("CNY"),
    platform: adsTotalsSchema.default(() => ({ ...ADS_EMPTY_TOTALS })),
    ledger: adsTotalsSchema.default(() => ({ ...ADS_EMPTY_TOTALS })),
    diff_cost: z.number().nullable().default(null),
    diff_gmv: z.number().nullable().default(null),
    diff_orders: z.number().nullable().default(null),
    captured_at: z.string().nullable().default(null),
  })
  .loose();

export const AdsReconListSchema = z
  .object({
    recon: z.array(adsReconSchema).default([]),
    total: z.number().default(0),
  })
  .loose();

export const EMPTY_ADS_RECON: AdsReconListResponse = { recon: [], total: 0 };
