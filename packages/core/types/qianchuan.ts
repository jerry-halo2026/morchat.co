/**
 * 千川投放的只读响应（WORKBENCH-API §25）。
 *
 * 写入口只有 `server/cmd/qianchuan-sync`：这里没有任何请求类型，因为界面从来不写
 * 投放数据（不建计划、不改预算、不申诉违规）。六个端点都是读。
 *
 * 三条口径落在类型里：
 *
 *   - **一个窗口一种钱。** 每个金额都是 `{amount, currency, sample_count, empty}`，
 *     且 `summary` 顶层的 `basis` 说明这些金额属于哪个结算窗口。**没有跨窗口的字段，
 *     也没有「总花费」**：1h / 7d / 14d / 30d / 90d 相加得到的数没有业务含义（§25.2）。
 *   - **没有数不是 0。** `amount: null` + `empty: "insufficient_data"` 说的是「没有
 *     可加的行」，计数器 `value: 0` + `empty: "zero"` 说的才是「真的是 0」。
 *   - **单位是数据。** 报表金额是元，账户余额是分（`unit: "fen"`）；两者都在字段上
 *     写清楚，读方不需要记住哪张表是哪种。
 */

/** 五个结算窗口。展示默认 `settle_7d`，切换必须显式（§25.2）。 */
export type AdsBasis = "settle_1h" | "settle_7d" | "settle_14d" | "settle_30d" | "settle_90d";

/** 服务端列出的可选项，页面不需要内置一份常量。 */
export const ADS_BASES: readonly AdsBasis[] = [
  "settle_1h",
  "settle_7d",
  "settle_14d",
  "settle_30d",
  "settle_90d",
];

/** §25.2 的默认口径。 */
export const ADS_DEFAULT_BASIS: AdsBasis = "settle_7d";

export type AdsEmptyState = "zero" | "insufficient_data";

/** 金额 + 币种 + 三态。`amount: null` 表示没有行可加，不是 0 元。 */
export interface AdsMoney {
  amount: number | null;
  currency: string;
  /** 背后有多少行真的带了数。`0` 就是 `amount: null`。 */
  sample_count: number;
  empty: AdsEmptyState;
}

/** 计数器：`value` 永远是数字（空库就是 0），`empty` 说明这个 0 是不是真的。 */
export interface AdsNumber {
  value: number | null;
  sample_count: number;
  empty: AdsEmptyState;
}

/** 一个窗口的五组数字。`settle` 属于响应顶层的 `basis`，不是五个窗口的和。 */
export interface AdsTotals {
  spend: AdsMoney;
  gmv: AdsMoney;
  refund: AdsMoney;
  settle: AdsMoney;
  orders: AdsNumber;
}

export interface AdsSummary {
  /** 实际使用的闭区间（服务端回显），页面据此标注，不自己重算。 */
  from: string;
  to: string;
  /** 本次汇总用的结算窗口。换 basis 是另一个数，不是另一个精度。 */
  basis: AdsBasis;
  currency: string;
  /** 窗口自身的状态：窗口内一条事实都没有 → `insufficient_data`。 */
  empty: AdsEmptyState;
  totals: AdsTotals;
  /** 紧邻在 `from` 之前的等长窗口，同 basis —— 环比只能同口径相比。 */
  previous: AdsTotals;
  basis_options: AdsBasis[];
}

export interface AdsAccount {
  account_id: string;
  account_name: string;
  currency: string;
  /** 余额相关字段的单位：`fen`（平台口径），展示层换算成元。 */
  unit: string;
  balance: number | null;
  cash: number | null;
  valid_grant: number | null;
  captured_at: string | null;
  /** 台账里这个账户累计的花费（元）。 */
  spend_to_date: number | null;
}

export interface AdsAccountListResponse {
  accounts: AdsAccount[];
  total: number;
}

export interface AdsPlan {
  plan_id: string;
  account_id: string;
  account_name: string;
  name: string;
  marketing_goal: string | null;
  status: string | null;
  opt_status: string | null;
  budget: number | null;
  budget_mode: string | null;
  roi2_goal: number | null;
  smart_bid_type: string | null;
  updated_at: string;
}

export interface AdsPlanListResponse {
  plans: AdsPlan[];
  total: number;
}

/** 素材形态：视频 / 图片 / 图文。 */
export type AdsMaterialKind = "video" | "image" | "carousel";

export interface AdsMaterial {
  kind: string;
  material_id: string;
  account_id: string;
  account_name: string;
  filename: string | null;
  video_id: string | null;
  image_id: string | null;
  duration: number | null;
  size_bytes: number | null;
  is_ai_create: boolean | null;
  is_inefficient: boolean | null;
  is_original: boolean | null;
  /** 挂到内容侧脚本（`media_script`）上的桥；null 表示还没挂。 */
  media_script_id: string | null;
  captured_at: string;
}

export interface AdsMaterialListResponse {
  materials: AdsMaterial[];
  total: number;
}

export interface AdsViolation {
  event_id: string;
  account_id: string;
  account_name: string;
  ad_id: string | null;
  create_time: string | null;
  illegal_type: string | null;
  score: number | null;
  status: string | null;
  reject_reason: string | null;
}

export interface AdsViolationListResponse {
  violations: AdsViolation[];
  total: number;
}

/**
 * 对账：平台侧是最近一次快照，台账侧是**快照当天**的日报合计。
 *
 * 两侧口径不同（平台的 `acct_*` 是支付口径），所以这里**不带 basis**，`diff_*`
 * 只说明这两列数差多少，不暗示资产层面的应收应付。
 */
export interface AdsReconRow {
  account_id: string;
  goal: string;
  account_name: string;
  currency: string;
  platform: AdsTotals;
  ledger: AdsTotals;
  diff_cost: number | null;
  diff_gmv: number | null;
  diff_orders: number | null;
  captured_at: string | null;
}

export interface AdsReconListResponse {
  recon: AdsReconRow[];
  total: number;
}

export interface AdsSummaryFilters {
  /** 闭区间自然日 `YYYY-MM-DD`；省略时服务端给「本月至今」。 */
  from?: string;
  to?: string;
  /** 省略时服务端用 `settle_7d`。 */
  basis?: AdsBasis;
}
