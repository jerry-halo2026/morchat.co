#!/usr/bin/env node
// 缺口归因：对每个缺口账户，逐一试探「未接入的主题」，看谁能补上缺口。
// 用法：node scripts/diagnose-gap.mjs --from=2026-10-30 --to=2026-11-07 --top=8
//
// 目的：把剩余缺口分成三类 ——
//   ① 未授权抖音号（代码取不到，只能运营补授权）
//   ② 主题没接（可以补，属于我们的漏）
//   ③ 历史日期没拉（重跑即可）
import { callOE } from "../core/client.mjs";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const PKG = join(dirname(fileURLToPath(import.meta.url)), "..");
const FLAT = join(PKG, "data", "flat");
const args = process.argv.slice(2);
const arg = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const FROM = arg("--from", "2026-10-30"), TO = arg("--to", "2026-11-07");
const TOPN = Number(arg("--top", "8"));

function parseCsv(txt) {
  const rows = [];
  let row = [], f = "", q = false;
  for (let i = 0; i < txt.length; i++) {
    const ch = txt[i];
    if (q) { if (ch === '"') { if (txt[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += ch; }
    else if (ch === '"') q = true;
    else if (ch === ",") { row.push(f); f = ""; }
    else if (ch === "\n") { row.push(f); rows.push(row); row = []; f = ""; }
    else if (ch !== "\r") f += ch;
  }
  if (f.length || row.length) { row.push(f); rows.push(row); }
  const head = rows.shift() || [];
  return rows.filter((r) => r.length).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])));
}
const load = (f) => parseCsv(readFileSync(join(FLAT, f), "utf8"));
const num = (x) => { const n = Number(x); return Number.isFinite(n) ? n : 0; };

// ── 已接入口径，算素材侧合计 ──
const mat = new Map();
for (const [f, cf] of [["uni_live", "stat_cost_for_roi2_fork"], ["live_video", "stat_cost_for_roi2"], ["uni_video", "stat_cost_for_roi2"], ["uni_image", "stat_cost_for_roi2"]]) {
  for (const r of load(`${f}.csv`)) {
    if (r.stat_date < FROM || r.stat_date > TO) continue;
    mat.set(r.account_id, (mat.get(r.account_id) || 0) + num(r[cf]));
  }
}
// overall 只取 p-product + l-aweme（三种切法不可相加）
for (const r of load("overall.csv")) {
  if (r.stat_date < FROM || r.stat_date > TO) continue;
  if (r.topic_tag !== "p-product" && r.topic_tag !== "l-aweme") continue;
  mat.set(r.account_id, (mat.get(r.account_id) || 0) + num(r.stat_cost_for_overall_roi2));
}
// 账户口径
const acct = new Map();
for (const r of load("recon.csv")) {
  if (r.goal !== "ALL") continue;
  acct.set(r.account_id, { name: r.account_name, v: num(r.acct_cost) });
}
// 授权主播
const anchorsBy = new Map();
for (const r of load("anchors.csv")) {
  const k = r.account_id;
  anchorsBy.set(k, (anchorsBy.get(k) || 0) + 1);
}
// 有消耗的主播数
const liveAnchorsBy = new Map();
for (const r of load("uni_live.csv")) {
  if (r.stat_date < FROM || r.stat_date > TO) continue;
  if (num(r.stat_cost_for_roi2_fork) <= 0) continue;
  const k = r.account_id;
  if (!liveAnchorsBy.has(k)) liveAnchorsBy.set(k, new Set());
  liveAnchorsBy.get(k).add(r.dim_id);
}

const gaps = [...acct.entries()]
  .map(([id, v]) => ({ id, name: v.name, acct: v.v, mat: mat.get(id) || 0, gap: v.v - (mat.get(id) || 0) }))
  .filter((x) => x.gap > 100)
  .sort((a, b) => b.gap - a.gap)
  .slice(0, TOPN);

console.log(`# 缺口归因  窗口 ${FROM} .. ${TO}`);
console.log(`# 账户口径合计 ${[...acct.values()].reduce((s, x) => s + x.v, 0).toFixed(2)}`);
console.log(`# 缺口 >100 的账户 ${[...acct.entries()].filter(([id, v]) => v.v - (mat.get(id) || 0) > 100).length} 个，下面诊断 Top ${gaps.length}\n`);

const cfg = JSON.parse(readFileSync(join(PKG, "data", "report-topics.json"), "utf8")).topics;
const URL_ = "https://open.oceanengine.com/open_api/v1.0/qianchuan/report/uni_promotion/data/get/";

// 可查的未接入主题（无 anchor_id 必填）
// 注意 overall 系（OVERALL_ROI_*）互相之间是「同一批消耗的不同切法」，数值接近但不可相加。
const CAND = [
  { tag: "OVERALL_ROI_PRODUCT_PROJECT", cost: "stat_cost_for_overall_roi2", group: "overall" },
  { tag: "OVERALL_ROI_PRODUCT_MATERIAL", cost: "stat_cost_for_overall_roi2", group: "overall", filter: { field: "roi2_material_type_v3", values: ["1", "2", "3", "4", "5", "6"] } },
  { tag: "OVERALL_ROI_LIVE_MATERIAL_VIDEO", cost: "stat_cost_for_overall_roi2", group: "overall", filter: { field: "roi2_material_type_v3", values: ["3"] } },
  { tag: "OVERALL_ROI_LIVE_MATERIAL_LIVE", cost: "stat_cost_for_overall_roi2", group: "overall" },
  { tag: "ROI2_IMAGE_AGG_MATERIAL_ANALYSIS", cost: "stat_cost_for_overall_roi2", group: "overall" },
  // 标题素材：roi2_title_material_v3 是必填「维度」（req=true 且不可过滤），必须放进 dimensions
  { tag: "SITE_PROMOTION_PRODUCT_POST_DATA_TITLE", cost: "stat_cost_for_overall_roi2", group: "title", extraDims: ["roi2_title_material_v3"] },
  { tag: "SITE_PROMOTION_PRODUCT_POST_ASSIST_TASK", cost: "stat_cost_for_roi2_assist", group: "assist", filter: { field: "assist_task_scene", values: ["1", "2", "3", "4", "6"] } },
];

async function probe(adv, c) {
  if (!c.cost) return null;
  const avail = cfg[c.tag]?.metrics?.map((m) => m.field) || [];
  if (!avail.includes(c.cost)) return null;
  const params = {
    advertiser_id: Number(adv),
    data_topic: c.tag,
    dimensions: ["stat_time_day", ...(c.extraDims || [])],
    metrics: [c.cost],
    filters: c.filter ? [{ field: c.filter.field, operator: 7, values: c.filter.values }] : [],
    order_by: [{ field: c.cost, type: 2 }],
    start_time: `${FROM} 00:00:00`,
    end_time: `${TO} 23:59:59`,
    page: 1,
    page_size: 100,
  };
  try {
    const r = await callOE(URL_, params, { retries: 1 });
    if (r.body.code !== 0) return { err: `${r.body.code}:${String(r.body.message || "").slice(0, 40)}` };
    const rows = r.body.data?.rows || [];
    const sum = rows.reduce((s, x) => s + (x.metrics?.[c.cost]?.Value ?? 0), 0);
    return { sum, n: rows.length };
  } catch (e) {
    return { err: e.message?.slice(0, 40) };
  }
}

for (const g of gaps) {
  const an = anchorsBy.get(g.id) || 0;
  const live = liveAnchorsBy.get(g.id)?.size || 0;
  console.log(`\n=== ${g.name} (${g.id}) ===`);
  console.log(`    账户 ${g.acct.toFixed(0)} | 素材侧 ${g.mat.toFixed(0)} | 缺口 ${g.gap.toFixed(0)} (${((g.gap / g.acct) * 100).toFixed(0)}%)`);
  console.log(`    授权抖音号 ${an} 个 | 其中真有消耗 ${live} 个`);
  const hits = [];
  for (const c of CAND) {
    const res = await probe(g.id, c);
    if (!res || res.err) { if (res?.err) console.log(`      ${c.tag.padEnd(42)} ERR ${res.err}`); continue; }
    if (res.sum > 0.5) {
      hits.push([c.tag, res.sum]);
      console.log(`      ${c.tag.padEnd(42)} 可补 ${res.sum.toFixed(0).padStart(7)}  [${c.group}]`);
    }
  }
  if (!hits.length) {
    const verdict = an === 0 ? "无任何授权抖音号 → 运营补授权" : "所有未接主题均为 0 → 消耗不在这些主题里";
    console.log(`      → 无可补主题；${verdict}`);
  } else {
    // overall 系互斥：只取最大值，不能累加
    const ov = hits.filter(([t]) => t.startsWith("OVERALL_ROI")).map(([, v]) => v);
    const nonOv = hits.filter(([t]) => !t.startsWith("OVERALL_ROI")).reduce((s, [, v]) => s + v, 0);
    const best = ov.length ? Math.max(...ov) : 0;
    console.log(`      → overall 系互斥，取最大 ${best.toFixed(0)}；非 overall 主题合计 ${nonOv.toFixed(0)}；相加上限 ${(best + nonOv).toFixed(0)} vs 缺口 ${g.gap.toFixed(0)}`);
  }
}
