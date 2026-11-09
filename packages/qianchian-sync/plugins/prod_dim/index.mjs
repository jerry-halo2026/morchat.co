// 商品维 / 计划维报表：SITE_PROMOTION_PRODUCT_PRODUCT + SITE_PROMOTION_PRODUCT_AD
//
// 为什么单独建源（2026-11-07）：
//   此前只有「素材维度」（uni_video / uni_image），能回答"哪条素材有效"，
//   但回答不了"哪个商品在花钱、哪条计划在花钱" —— 商品全域的消耗无法归到商品和计划上。
//   这套主题是账户级（不需要 anchor_id），一次请求就覆盖全户，成本极低。
//
// 实测硬约束：
//   1) 消耗字段是 stat_cost（不是 stat_cost_for_roi2，更不是 stat_cost_for_overall_roi2 —— 后者恒为 0）
//   2) filters 必填，没有过滤条件也要传 []
//   3) order_by 必填
//   4) page_size 只能是 10/20/50/100/200
//   5) 返回 {dimensions:{}, metrics:{}} 嵌套结构
//   6) PRODUCT_PRODUCT 与 PRODUCT_AD 是同一份消耗的两个视角（商品 / 计划），相加会翻倍
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PKG } from "../../core/env.mjs";

export const recipe = { id: "prod_dim", schedule: "manual", requires: ["accounts"] };

const TOPICS = [
  { topic: "SITE_PROMOTION_PRODUCT_PRODUCT", dims: ["stat_time_day", "qianchuan_product_id"], cost: ["stat_cost", "stat_cost_for_roi2", "stat_cost_for_overall_roi2", "stat_cost_for_roi2_fork"], tag: "product", label: "商品维" },
  { topic: "SITE_PROMOTION_PRODUCT_AD", dims: ["stat_time_day", "ad_id"], cost: ["stat_cost", "stat_cost_for_roi2", "stat_cost_for_overall_roi2", "stat_cost_for_roi2_fork"], tag: "plan", label: "计划维" },
];

/** 权威指标表：report-topics.json 由 scripts/fetch-topic-config.mjs 从官方 config 接口拉取 */
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
      if (!metrics || !metrics.length) continue; // 配置缺失则跳过，不猜字段
      // 各主题的消耗字段名不同（OVERALL_ROI_LIVE_AWEME 就没有 stat_cost_for_roi2），
      // 且 order_by 必须引用「真实存在于该主题指标里的字段」，否则 40000。
      const costField = t.cost.find((f) => metrics.includes(f));
      if (!costField) continue;
      calls.push({
        name: `prod_dim-${a.advertiser_id}-${t.tag}`,
        url: "https://open.oceanengine.com/open_api/v1.0/qianchuan/report/uni_promotion/data/get/",
        params: {
          advertiser_id: Number(a.advertiser_id),
          data_topic: t.topic,
          dimensions: t.dims,
          metrics,
          filters: [],              // 必填，即使为空
          order_by: [{ field: costField, type: 2 }],
          start_time: `${win.from} 00:00:00`,
          end_time: `${win.to} 23:59:59`,
          page_size: 200,           // 仅 10/20/50/100/200 合法
        },
        paged: true,
      });
    }
  }
  return { calls };
}
