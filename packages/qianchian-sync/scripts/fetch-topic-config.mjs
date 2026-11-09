#!/usr/bin/env node
// 拉取「全域报表主题」的权威配置（维度/指标/必填约束），落 data/report-topics.json
//
// 背景（2026-11-07）：
//   此接口传非法 data_topic 时会把「允许值全集」列在报错里 —— 由此确认官方共 19 个主题，
//   而本地 qc-uni-config-20261104.json 只抓到 10 个。差集里包含
//   OVERALL_ROI_LIVE_MATERIAL_VIDEO / SITE_PROMOTION_POST_DATA_OTHER 等关键口径。
//
// 用法：node scripts/fetch-topic-config.mjs
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { PKG } from "../core/env.mjs";
import { callOE } from "../core/client.mjs";

const U = "https://open.oceanengine.com/open_api/v1.0/qianchuan/report/uni_promotion/config/get/";
const ADV = Number(process.env.PROBE_ADV || 1786139492330569);

// 全集来源：非法 data_topic 的报错 message（官方允许值清单）
export const ALL_TOPICS = [
  "OVERALL_ROI_LIVE_AWEME",
  "OVERALL_ROI_LIVE_MATERIAL_LIVE",
  "OVERALL_ROI_LIVE_MATERIAL_VIDEO",
  "OVERALL_ROI_PRODUCT_AWEME",
  "OVERALL_ROI_PRODUCT_MATERIAL",
  "OVERALL_ROI_PRODUCT_PRODUCT",
  "OVERALL_ROI_PRODUCT_PROJECT",
  "ROI2_IMAGE_AGG_MATERIAL_ANALYSIS",
  "SITE_PROMOTION_POST_DATA_LIVE",
  "SITE_PROMOTION_POST_DATA_OTHER",
  "SITE_PROMOTION_POST_DATA_TITLE",
  "SITE_PROMOTION_POST_DATA_VIDEO",
  "SITE_PROMOTION_PRODUCT_AD",
  "SITE_PROMOTION_PRODUCT_POST_ASSIST_TASK",
  "SITE_PROMOTION_PRODUCT_POST_DATA_IMAGE",
  "SITE_PROMOTION_PRODUCT_POST_DATA_OTHER",
  "SITE_PROMOTION_PRODUCT_POST_DATA_TITLE",
  "SITE_PROMOTION_PRODUCT_POST_DATA_VIDEO",
  "SITE_PROMOTION_PRODUCT_PRODUCT",
];

const { body } = await callOE(U, { advertiser_id: ADV, data_topics: ALL_TOPICS }, { retries: 2 });
if (body.code !== 0) {
  console.error("拉取失败:", body.code, body.message);
  process.exit(1);
}

const topics = {};
for (const c of body.data.custom_config_datas || []) {
  const dims = (c.dimensions || []).map((d) => ({
    field: d.field,
    name: d.name,
    required: !!d.is_required,
    filterable: !!d.filterable,
    filter_only: !!d.filter_only,
    filter_required: !!d.filter_config?.filter_required,
    // 注意：官方 range_values 的 label 是「数字码」、value 才是中文；过滤要传 label
    range_values: (d.filter_config?.range_values || []).map((r) => ({ code: String(r.label), name: String(r.value) })),
    filter_codes: (d.filter_config?.range_values || []).map((r) => String(r.label)),
  }));
  const metrics = (c.metrics || []).map((m) => ({ field: m.field, name: m.name, unit: m.unit, sortable: !!m.sortable }));
  topics[c.data_topic] = {
    dims,
    metrics,
    required_dims: dims.filter((d) => d.required).map((d) => d.field),
    filter_required: dims.filter((d) => d.filter_required).map((d) => d.field),
  };
}

const out = {
  generated_at: new Date().toISOString(),
  adv: ADV,
  count: Object.keys(topics).length,
  topics,
};
writeFileSync(join(PKG, "data", "report-topics.json"), JSON.stringify(out, null, 1), "utf8");

console.log(`拿到 ${out.count} 个主题配置\n`);
for (const [t, v] of Object.entries(topics)) {
  console.log(`${t.padEnd(38)} dims=${String(v.dims.length).padStart(2)} metrics=${String(v.metrics.length).padStart(3)} 必填维度=[${v.required_dims.join(",")}] 必填过滤=[${v.filter_required.join(",")}]`);
}
