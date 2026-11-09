#!/usr/bin/env node
// 全账户口径对账：账户口径 vs 已接素材线，定位每一分钱缺口
//
// 为什么必须做（2026-11-07）：
//   过去只接 4 条素材线（直播画面/直播视频/商品视频/商品图文），对账靠抽样推断"缺口是未授权抖音号"。
//   实测发现缺口还有第二个来源：OVERALL_ROI_* 这套「全域」主题与 SITE_PROMOTION_* 是互补关系，
//   商品卡户 11/05–11/06 账户 15,854.85 = 素材线 14,835.72 + OVERALL_ROI_PRODUCT_PRODUCT 1,019.03。
//   所以"缺口"必须先按主题切分归属，再谈是不是授权问题。
//
// 用法：node scripts/full-recon.mjs --from=2026-11-05 --to=2026-11-06 [--adv=xxx] [--save]
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { PKG } from "../core/env.mjs";
import { callOE } from "../core/client.mjs";

const ARG = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] ?? true] : [a, true];
}));
const FROM = ARG.from || "2026-11-05";
const TO = ARG.to || "2026-11-06";
const SAVE = !!ARG.save;
const ACCT_URL = "https://open.oceanengine.com/open_api/v1.0/qianchuan/report/uni_promotion/get/";
const RPT_URL = "https://open.oceanengine.com/open_api/v1.0/qianchuan/report/uni_promotion/data/get/";

function readCsv(p) {
  if (!existsSync(p)) return [];
  const lines = readFileSync(p, "utf8").split("\n").filter(Boolean);
  const h = lines[0].split(",");
  return lines.slice(1).map((l) => { const c = l.split(","); const o = {}; h.forEach((k, i) => (o[k] = c[i])); return o; });
}
const num = (v) => (v === null || v === undefined ? 0 : typeof v === "object" ? Number(v.Value ?? 0) || 0 : Number(v) || 0);

const accts = readCsv(join(PKG, "data", "flat", "accounts.csv"));
const advList = ARG.adv ? String(ARG.adv).split(",") : accts.map((a) => a.account_id);

// 已接素材线：文件名 → 消耗字段
const LINES = [
  ["uni_live.csv", "stat_cost_for_roi2_fork", "直播画面"],
  ["live_video.csv", "stat_cost_for_roi2", "直播视频"],
  ["uni_video.csv", "stat_cost_for_roi2", "商品视频"],
  ["uni_image.csv", "stat_cost_for_roi2", "商品图文"],
];
const flatRows = {};
for (const [f] of LINES) flatRows[f] = readCsv(join(PKG, "data", "flat", f));

function lineSum(file, field, adv) {
  return flatRows[file]
    .filter((r) => r.stat_date >= FROM && r.stat_date <= TO && String(r.account_id) === String(adv))
    .reduce((s, r) => s + (Number(r[field]) || 0), 0);
}

// 补位主题：每户按需探测，看能否解释缺口
const FILLERS = [
  { topic: "OVERALL_ROI_PRODUCT_PRODUCT", dims: ["stat_time_day", "qianchuan_product_id"], cost: "stat_cost_for_roi2", label: "全域-商品(旧口径)" },
  { topic: "OVERALL_ROI_PRODUCT_PROJECT", dims: ["stat_time_day", "ad_id"], cost: "stat_cost_for_roi2", label: "全域-计划" },
  { topic: "OVERALL_ROI_PRODUCT_MATERIAL", dims: ["stat_time_day", "material_id", "roi2_material_type_v3"], cost: "stat_cost_for_roi2", label: "全域-商品素材", filterTypes: true },
  { topic: "OVERALL_ROI_LIVE_AWEME", dims: ["stat_time_day", "anchor_id"], cost: "stat_cost_for_roi2", label: "全域-直播抖音号" },
  { topic: "OVERALL_ROI_LIVE_MATERIAL_VIDEO", dims: ["stat_time_day", "material_id", "roi2_material_type_v3"], cost: "stat_cost_for_roi2", label: "全域-直播素材", filterTypes: true },
  { topic: "SITE_PROMOTION_PRODUCT_PRODUCT", dims: ["stat_time_day", "qianchuan_product_id"], cost: "stat_cost", label: "商品全域-商品" },
  { topic: "SITE_PROMOTION_PRODUCT_AD", dims: ["stat_time_day", "ad_id"], cost: "stat_cost", label: "商品全域-计划" },
];

async function sumTopic(f, adv) {
  let sum = 0, rows = 0;
  let page = 1, total = 1;
  do {
    const filters = [];
    if (f.filterTypes) filters.push({ field: "roi2_material_type_v3", operator: 7, values: ["1", "2", "3", "4", "5", "6"] });
    const { body } = await callOE(RPT_URL, {
      advertiser_id: Number(adv), data_topic: f.topic, dimensions: f.dims, metrics: [f.cost],
      filters, order_by: [{ field: f.cost, type: 2 }],
      start_time: `${FROM} 00:00:00`, end_time: `${TO} 23:59:59`,
      page, page_size: 200,
    }, { retries: 0 });
    if (body.code !== 0) return { sum: null, rows: 0, err: `${body.code}:${String(body.message).slice(0, 40)}` };
    const list = body.data?.rows || [];
    rows += list.length;
    for (const r of list) sum += num(r.metrics?.[f.cost] ?? r[f.cost]);
    total = body.data?.page_info?.total_page || 1;
    page++;
  } while (page <= total && page <= 30);
  return { sum, rows, err: null };
}

const results = [];
console.log(`对账窗口 ${FROM}..${TO}，${advList.length} 户\n`);
console.log("账户".padEnd(34) + "账户口径".padStart(12) + "素材线".padStart(12) + "缺口".padStart(11) + "  缺口率");
for (const adv of advList) {
  const name = accts.find((a) => a.account_id === adv)?.account_name || "";
  const { body } = await callOE(ACCT_URL, {
    advertiser_id: Number(adv), start_date: `${FROM} 00:00:00`, end_date: `${TO} 23:59:59`,
    marketing_goal: "ALL", order_platform: "QIANCHUAN",
    fields: ["stat_cost", "total_pay_order_gmv_for_roi2", "total_pay_order_count_for_roi2"],
  }, { retries: 1 });
  if (body.code !== 0) { console.log(`${(adv + " " + name).slice(0, 33).padEnd(34)} ERR ${body.code} ${String(body.message).slice(0, 40)}`); continue; }
  const acct = num(body.data?.stat_cost);
  const acctGmv = num(body.data?.total_pay_order_gmv_for_roi2);
  const acctOrd = num(body.data?.total_pay_order_count_for_roi2);

  const perLine = LINES.map(([f, field, label]) => [label, lineSum(f, field, adv)]);
  const lineSumAll = perLine.reduce((s, [, v]) => s + v, 0);
  const gap = acct - lineSumAll;
  const rate = acct > 0 ? gap / acct : 0;

  const rec = { adv, name, acct, acctGmv, acctOrd, perLine: Object.fromEntries(perLine), lineSum: lineSumAll, gap, rate, fillers: {} };

  // 只对缺口 > 0.5% 或缺口 > 100 元的账户做补位探测
  if (acct > 0 && (rate > 0.005 || gap > 100)) {
    for (const f of FILLERS) {
      const r = await sumTopic(f, adv);
      if (r.err) continue;
      rec.fillers[f.label] = Math.round(r.sum * 100) / 100;
    }
  }
  results.push(rec);

  const flag = Math.abs(rate) > 0.03 ? "⚠️" : Math.abs(rate) > 0.005 ? "·" : "✅";
  console.log(`${flag} ${(adv + " " + name).slice(0, 31).padEnd(32)}${acct.toFixed(2).padStart(12)}${lineSumAll.toFixed(2).padStart(12)}${gap.toFixed(2).padStart(11)}  ${(rate * 100).toFixed(1)}%`);
  if (Object.keys(rec.fillers).length) {
    const fstr = Object.entries(rec.fillers).filter(([, v]) => v > 1).map(([k, v]) => `${k}=${v}`).join("  ");
    if (fstr) console.log(`    补位候选: ${fstr}`);
  }
}

// 汇总
const totAcct = results.reduce((s, r) => s + r.acct, 0);
const totLine = results.reduce((s, r) => s + r.lineSum, 0);
const bad = results.filter((r) => Math.abs(r.rate) > 0.03);
console.log(`\n=== 合计 账户口径 ${totAcct.toFixed(2)} / 素材线 ${totLine.toFixed(2)} / 缺口 ${(totAcct - totLine).toFixed(2)} (${((totAcct - totLine) / totAcct * 100).toFixed(2)}%) ===`);
console.log(`缺口>3% 的账户 ${bad.length} 个：${bad.map((r) => `${r.name}(${(r.gap).toFixed(0)})`).join("、") || "无"}`);

if (SAVE) {
  const p = join(PKG, "data", `full-recon-${FROM}_${TO}.json`);
  writeFileSync(p, JSON.stringify({ generated_at: new Date().toISOString(), from: FROM, to: TO, total: { acct: totAcct, line: totLine }, results }, null, 1), "utf8");
  console.log(`\n→ ${p}`);
}
