// 全域口径报表：OVERALL_ROI_PRODUCT_* / OVERALL_ROI_LIVE_*
//
// 为什么必须有这一套（2026-11-07 实测）：
//   「投手-陈小苗」11/05–11/06 账户消耗 921.02 元，四条素材线（A/B）全部为 0，
//   而 OVERALL_ROI_PRODUCT_PRODUCT 正好 921.02 —— 这户的消耗只存在于这套口径里。
//   所以 OVERALL_ROI_* 不是 SITE_PROMOTION_* 的马甲，是**互补的独立体系**。
//
// 与已有数据的关系（重要，别相加）：
//   · 欧海涵-商品卡：素材线 15,589.83 + D 全域商品 1,019.03 ≈ 账户 15,854.85 → 互补
//   · 但同一户 SITE_PROMOTION_PRODUCT_PRODUCT 也是 14,835.82，与 D 有 754 元重叠
//   · 结论：D 只用于「补 A/B 覆盖不到的账户」，不做全量叠加；落表时单独存，分析层按口径选
//
// 实测硬约束：filters 必填、order_by 必填、page_size ∈ {10,20,50,100,200}
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PKG } from "../../core/env.mjs";

export const recipe = { id: "overall", schedule: "manual", requires: ["accounts"] };

// 只取「有实际数据」的 4 个（LIVE_MATERIAL_* 需按 6 类素材逐个过滤，成本高且实测无数据，暂不接）
// 注意：不要把 qianchuan_product_name 塞进 dimensions —— 一旦加名称维度，单请求耗时从 1.5s 涨到 7s
// （返回体暴涨，实测被拖到 400153 限流），商品名改由 dim_product 维表回填。
const TOPICS = [
  { topic: "OVERALL_ROI_PRODUCT_PRODUCT", dims: ["stat_time_day", "qianchuan_product_id"], cost: ["stat_cost_for_roi2", "stat_cost_for_roi2_fork", "stat_cost_for_overall_roi2", "stat_cost"], tag: "p-product", label: "全域-商品" },
  { topic: "OVERALL_ROI_PRODUCT_PROJECT", dims: ["stat_time_day", "ad_id"], cost: ["stat_cost_for_roi2", "stat_cost_for_roi2_fork", "stat_cost_for_overall_roi2", "stat_cost"], tag: "p-plan", label: "全域-计划" },
  { topic: "OVERALL_ROI_PRODUCT_AWEME", dims: ["stat_time_day", "anchor_id"], cost: ["stat_cost_for_roi2", "stat_cost_for_roi2_fork", "stat_cost_for_overall_roi2", "stat_cost"], tag: "p-aweme", label: "全域-商品抖音号" },
  { topic: "OVERALL_ROI_LIVE_AWEME", dims: ["stat_time_day", "anchor_id"], cost: ["stat_cost_for_roi2", "stat_cost_for_roi2_fork", "stat_cost_for_overall_roi2", "stat_cost"], tag: "l-aweme", label: "全域-直播抖音号" },
];

function catalog() {
  const p = join(PKG, "data", "report-topics.json");
  if (!existsSync(p)) return {};
  const raw = JSON.parse(readFileSync(p, "utf8")).topics || {};
  const out = {};
  for (const [t, v] of Object.entries(raw)) out[t] = (v.metrics || []).map((m) => m.field);
  return out;
}

export async function build(ctx) {
  const cat = catalog();
  const win = ctx.reportWindow || ctx.window;
  const calls = [];
  for (const a of ctx.accounts || []) {
    for (const t of TOPICS) {
      const metrics = cat[t.topic];
      if (!metrics || !metrics.length) continue;
      const costField = t.cost.find((f) => metrics.includes(f));
      if (!costField) continue;
      calls.push({
        name: `overall-${a.advertiser_id}-${t.tag}`,
        url: "https://open.oceanengine.com/open_api/v1.0/qianchuan/report/uni_promotion/data/get/",
        params: {
          advertiser_id: Number(a.advertiser_id),
          data_topic: t.topic,
          dimensions: t.dims,
          metrics,
          filters: [],
          order_by: [{ field: costField, type: 2 }],
          start_time: `${win.from} 00:00:00`,
          end_time: `${win.to} 23:59:59`,
          page_size: 200,
        },
        paged: true,
      });
    }
  }
  return { calls };
}
