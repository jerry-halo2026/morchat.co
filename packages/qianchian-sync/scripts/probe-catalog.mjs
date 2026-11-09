#!/usr/bin/env node
// 接口/主题缺口探针：一次性问 config 接口「每个 data_topic 有没有权限、有哪些维度指标」
// 用法: node scripts/probe-catalog.mjs [advertiser_id]
// 输出: data/catalog-audit-<day>.json + 控制台摘要
import { callOE } from "../core/client.mjs";
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PKG, todayInTz, getConfig } from "../core/env.mjs";

const advId = Number(process.argv[2] || 1742478706540547);

// 千川全域报表 config 接口支持的数据主题（来源：open.oceanengine.com/docs/1823296280645708）
const ALL_TOPICS = [
  // ── 商品全域 ──
  "SITE_PROMOTION_PRODUCT_AD",              // 计划数据
  "SITE_PROMOTION_PRODUCT_PRODUCT",         // 商品数据
  "SITE_PROMOTION_PRODUCT_POST_ASSIST_TASK",// 调控数据
  "SITE_PROMOTION_PRODUCT_POST_DATA_IMAGE", // 素材-图片
  "SITE_PROMOTION_PRODUCT_POST_DATA_VIDEO", // 素材-视频
  "SITE_PROMOTION_PRODUCT_POST_DATA_TITLE", // 素材-标题
  "SITE_PROMOTION_PRODUCT_POST_DATA_OTHER", // 素材-其他创意
  // ── 直播全域 ──
  "SITE_PROMOTION_POST_DATA_LIVE",          // 素材-直播间画面
  "SITE_PROMOTION_POST_DATA_VIDEO",         // 素材-视频
  "SITE_PROMOTION_POST_DATA_TITLE",         // 素材-标题
  "SITE_PROMOTION_POST_DATA_OTHER",         // 素材-其他创意
  // ── 全域数据聚合 ──
  "ROI2_IMAGE_AGG_MATERIAL_ANALYSIS",
  // ── 乘方 ──
  "OVERALL_ROI_PRODUCT_PROJECT",
  "OVERALL_ROI_PRODUCT_AWEME",
  "OVERALL_ROI_PRODUCT_PRODUCT",
  "OVERALL_ROI_PRODUCT_MATERIAL",
  "OVERALL_ROI_LIVE_AWEME",
  "OVERALL_ROI_LIVE_MATERIAL_LIVE",
  "OVERALL_ROI_LIVE_MATERIAL_VIDEO",
];

const CHUNK = 6;
const out = {};
let used = new Set();
if (existsSync(join(PKG, "data", "qc-uni-config-20261104.json"))) {
  try {
    const old = JSON.parse(readFileSync(join(PKG, "data", "qc-uni-config-20261104.json"), "utf8"));
    for (const c of old.data?.custom_config_datas || []) used.add(c.data_topic);
  } catch { /* ignore */ }
}

for (let i = 0; i < ALL_TOPICS.length; i += CHUNK) {
  const batch = ALL_TOPICS.slice(i, i + CHUNK);
  const { body } = await callOE(
    "https://open.oceanengine.com/open_api/v1.0/qianchuan/report/uni_promotion/config/get/",
    { advertiser_id: advId, data_topics: JSON.stringify(batch) }
  );
  if (body.code !== 0) {
    console.log(`batch ${i / CHUNK + 1} ❌ code=${body.code} ${String(body.message).slice(0, 120)}`);
    for (const t of batch) out[t] = { available: false, error: `${body.code}:${body.message}` };
    continue;
  }
  const got = new Set();
  for (const c of body.data?.custom_config_datas || []) {
    got.add(c.data_topic);
    out[c.data_topic] = {
      available: true,
      metrics: (c.metrics || []).length,
      dimensions: (c.dimensions || []).map((d) => d.field),
      query_limit: c.query_limit || null,
      in_use: used.has(c.data_topic),
    };
  }
  for (const t of batch) if (!got.has(t)) out[t] = { available: false, error: "未返回（多半无权限点或主题不适用）" };
}

const day = todayInTz(getConfig().timezone);
mkdirSync(join(PKG, "data"), { recursive: true });
writeFileSync(join(PKG, "data", `catalog-audit-${day}.json`), JSON.stringify(out, null, 1), "utf8");

console.log("\n=== 数据主题可用性 ===");
console.log("状态  主题                                        指标   维度");
for (const t of ALL_TOPICS) {
  const v = out[t] || {};
  const mark = v.available ? (v.in_use ? "已用 " : "可用 ") : "缺失 ";
  console.log(`${mark} ${t.padEnd(42)} ${String(v.metrics ?? "-").padStart(4)}   ${(v.dimensions || []).slice(0, 4).join(",")}`);
}
const avail = ALL_TOPICS.filter((t) => out[t]?.available);
const missing = ALL_TOPICS.filter((t) => !out[t]?.available);
console.log(`\n可用 ${avail.length} / 探测 ${ALL_TOPICS.length}；其中已接入 ${avail.filter((t) => used.has(t)).length} 个`);
console.log(`未接入但可用: ${avail.filter((t) => !used.has(t)).join(", ") || "无"}`);
console.log(`不可用: ${missing.join(", ") || "无"}`);
