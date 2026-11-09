#!/usr/bin/env node
// 投放效果分析（2026-11-09 新增）
//
// 目标：一次跑出「钱花得对不对」的完整答案 —— 大盘趋势、账户效率、素材优劣、商品结构。
// 口径统一用全域推广（roi2）：消耗 stat_cost_for_*，成交 total_order_settle_amount_for_roi2_1h
// （1 小时结算口径，与千川后台「成交金额」一致），订单 total_order_settle_count_for_roi2_1h。
//
// 数据源：data/flat/*.csv（由 scripts/export-flat.mjs 产出）
// 用法：node scripts/analyze-kpi.mjs [--days 14] [--json]

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const PKG = join(dirname(fileURLToPath(import.meta.url)), "..");
const FLAT = join(PKG, "data", "flat");

const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (!a.startsWith("--")) continue;
  const eq = a.indexOf("=");
  if (eq > -1) args[a.slice(2, eq)] = a.slice(eq + 1);
  else if (process.argv[i + 1] && !process.argv[i + 1].startsWith("--")) { args[a.slice(2)] = process.argv[i + 1]; i++; }
  else args[a.slice(2)] = true;
}

const DAYS = Number(args.days || 14);

/** 健壮 CSV 解析：支持引号内逗号与换行（素材文件名里两者都有） */
function parseCsv(text) {
  const rows = [];
  let row = [], cur = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; } else q = false;
      } else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cur); cur = ""; }
    else if (c === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
    else if (c === "\r") { /* 忽略 */ }
    else cur += c;
  }
  if (cur !== "" || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

function load(name) {
  const p = join(FLAT, name);
  if (!existsSync(p)) return [];
  const rows = parseCsv(readFileSync(p, "utf8"));
  if (!rows.length) return [];
  const head = rows[0];
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r.length || (r.length === 1 && !r[0])) continue;
    const o = {};
    for (let j = 0; j < head.length; j++) o[head[j]] = r[j] ?? "";
    out.push(o);
  }
  return out;
}

const n = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
const wan = (v) => (v / 1e4).toFixed(1);
const pct = (v) => (v * 100).toFixed(1) + "%";

// ── 口径适配（2026-11-09 实测校正）──
// 直播表的真实消耗是 stat_cost_for_roi2_fork（180 天 250.9 万），
// stat_cost_for_overall_roi2 只是 4.7 万的辅助口径 —— 用错会让 ROI 虚高 50 倍。
// 短视频表用 stat_cost_for_roi2（134.6 万）。
const COST_PRIORITY = ["stat_cost_for_roi2", "stat_cost_for_roi2_fork", "basic_stat_cost_for_roi2_v2_fork", "stat_cost_for_overall_roi2"];
function costOf(r) {
  for (const k of COST_PRIORITY) { const v = n(r[k]); if (v) return v; }
  return 0;
}
function gmvOf(r) { return n(r.total_order_settle_amount_for_roi2_1h); }
function orderOf(r) { return n(r.total_order_settle_count_for_roi2_1h); }

const live = load("uni_live.csv");
const video = load("uni_video.csv");
const matVideo = load("material_video.csv");
const matImage = load("material_image.csv");
const products = load("products.csv");
const flags = load("material_flag.csv");

// ── 按日聚合（直播 + 短视频两套口径相加）──
const byDay = new Map();
function addDay(d, cost, gmv, ord, src) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return;
  let x = byDay.get(d);
  if (!x) { x = { cost: 0, gmv: 0, ord: 0, live: 0, video: 0 }; byDay.set(d, x); }
  x.cost += cost; x.gmv += gmv; x.ord += ord;
  x[src] = (x[src] || 0) + cost;
}
for (const r of live) addDay(r.stat_date, costOf(r), gmvOf(r), orderOf(r), "live");
for (const r of video) addDay(r.stat_date, costOf(r), gmvOf(r), orderOf(r), "video");

const days = [...byDay.keys()].sort();
const recent = days.slice(-DAYS);
const lastDay = days[days.length - 1];

// 完整日（排除当天未跑完的数据，避免误判"断崖下跌"）
const completeDays = days.filter((d) => d < lastDay);

console.log(`\n${"═".repeat(62)}`);
console.log(`  千川投放效果分析   数据截至 ${lastDay}   覆盖 ${days[0]} ~ ${lastDay}`);
console.log(`${"═".repeat(62)}\n`);

// ── 1. 大盘趋势 ──
console.log("【一】按日大盘（直播 + 短视频合计）\n");
console.log("  日期          消耗(万)   成交(万)    ROI    订单   直播占比");
console.log("  " + "─".repeat(58));
for (const d of recent.slice(-10)) {
  const x = byDay.get(d);
  const roi = x.cost > 0 ? x.gmv / x.cost : 0;
  const liveShare = x.cost > 0 ? x.live / x.cost : 0;
  const mark = d === lastDay ? " ←今日未完整" : "";
  console.log(
    `  ${d}  ${wan(x.cost).padStart(8)}  ${wan(x.gmv).padStart(8)}  ${roi.toFixed(2).padStart(5)}  ` +
    `${String(Math.round(x.ord)).padStart(6)}  ${pct(liveShare).padStart(7)}${mark}`
  );
}

// ── 2. 环比（近 7 天 vs 前 7 天，均用完整日）──
function sumRange(list) {
  const t = { cost: 0, gmv: 0, ord: 0 };
  for (const d of list) { const x = byDay.get(d); if (!x) continue; t.cost += x.cost; t.gmv += x.gmv; t.ord += x.ord; }
  return t;
}
const cur7 = sumRange(completeDays.slice(-7));
const prev7 = sumRange(completeDays.slice(-14, -7));
const dlt = (a, b) => (b > 0 ? ((a - b) / b) * 100 : 0);

console.log("\n【二】近 7 天 vs 前 7 天\n");
console.log("  指标        本期        上期        变化");
console.log("  " + "─".repeat(48));
console.log(`  消耗     ${wan(cur7.cost).padStart(8)}万  ${wan(prev7.cost).padStart(8)}万  ${dlt(cur7.cost, prev7.cost).toFixed(1).padStart(7)}%`);
console.log(`  成交     ${wan(cur7.gmv).padStart(8)}万  ${wan(prev7.gmv).padStart(8)}万  ${dlt(cur7.gmv, prev7.gmv).toFixed(1).padStart(7)}%`);
console.log(`  订单     ${String(Math.round(cur7.ord)).padStart(9)}  ${String(Math.round(prev7.ord)).padStart(9)}  ${dlt(cur7.ord, prev7.ord).toFixed(1).padStart(7)}%`);
const r1 = cur7.cost > 0 ? cur7.gmv / cur7.cost : 0;
const r0 = prev7.cost > 0 ? prev7.gmv / prev7.cost : 0;
console.log(`  ROI      ${r1.toFixed(2).padStart(9)}  ${r0.toFixed(2).padStart(9)}  ${((r1 - r0) / (r0 || 1) * 100).toFixed(1).padStart(7)}%`);

// ── 3. 账户效率 ──
const byAcct = new Map();
for (const r of [...live, ...video]) {
  if (!completeDays.includes(r.stat_date)) continue;
  const k = r.account_id;
  let a = byAcct.get(k);
  if (!a) { a = { name: r.account_name, cost: 0, gmv: 0, ord: 0 }; byAcct.set(k, a); }
  a.cost += costOf(r); a.gmv += gmvOf(r); a.ord += orderOf(r);
}
// 分源统计直播/短视频消耗
const liveCostByAcct = new Map(), videoCostByAcct = new Map();
for (const r of live) { if (!completeDays.includes(r.stat_date)) continue; liveCostByAcct.set(r.account_id, (liveCostByAcct.get(r.account_id) || 0) + costOf(r)); }
for (const r of video) { if (!completeDays.includes(r.stat_date)) continue; videoCostByAcct.set(r.account_id, (videoCostByAcct.get(r.account_id) || 0) + costOf(r)); }

const acctList = [...byAcct.entries()]
  .map(([id, a]) => ({ id, ...a, roi: a.cost > 0 ? a.gmv / a.cost : 0, liveCost: liveCostByAcct.get(id) || 0, videoCost: videoCostByAcct.get(id) || 0 }))
  .filter((a) => a.cost > 0)
  .sort((a, b) => b.cost - a.cost);

console.log(`\n【三】账户效率（近 7 完整日，共 ${acctList.length} 个有消耗账户）\n`);
console.log("  账户                    消耗(万)  成交(万)   ROI   直播占");
console.log("  " + "─".repeat(60));
for (const a of acctList.slice(0, 12)) {
  const ls = a.cost > 0 ? a.liveCost / a.cost : 0;
  console.log(`  ${(a.name || a.id).slice(0, 20).padEnd(22)} ${wan(a.cost).padStart(7)} ${wan(a.gmv).padStart(9)}  ${a.roi.toFixed(2).padStart(5)}  ${pct(ls).padStart(6)}`);
}
const totalCost = acctList.reduce((s, a) => s + a.cost, 0);
const top5cost = acctList.slice(0, 5).reduce((s, a) => s + a.cost, 0);
console.log(`\n  集中度：Top5 账户占 ${pct(top5cost / totalCost)} 消耗`);

// 高耗低效（消耗前 30% 但 ROI 低于整体 80%）
const overallRoi = cur7.cost > 0 ? cur7.gmv / cur7.cost : 0;
const inefficient = acctList.slice(0, Math.max(3, Math.ceil(acctList.length * 0.3)))
  .filter((a) => a.roi < overallRoi * 0.8);
if (inefficient.length) {
  console.log(`\n  ⚠️ 高耗低效账户（ROI < 大盘 ${overallRoi.toFixed(2)} 的 80%）：`);
  for (const a of inefficient) {
    console.log(`     ${(a.name || a.id).slice(0, 18)}  消耗 ${wan(a.cost)} 万  ROI ${a.roi.toFixed(2)}  缺口 ${wan(a.cost * (overallRoi - a.roi))} 万`);
  }
}

// ── 4. 素材效率 ──
// 素材指标在 uni_video / uni_live 的 dim_id 上，按 material_id join 元数据
const matMeta = new Map();
for (const m of matVideo) if (m.material_id) matMeta.set(String(m.material_id), { ...m, kind: "视频" });
for (const m of matImage) if (m.material_id) matMeta.set(String(m.material_id), { ...m, kind: "图片" });
const origSet = new Set(flags.filter((f) => f.is_original === "1").map((f) => f.account_id + ":" + f.material_id));
const badSet = new Set(flags.filter((f) => f.is_inefficient === "1").map((f) => f.account_id + ":" + f.material_id));

// 近 7 天完整窗口（素材消耗按此统计；活跃天数仍看全量，用于判断素材生命周期）
const winDays = new Set(completeDays.slice(-7));
const matDays = new Map();
for (const r of video) {
  if (!r.dim_id || r.dim_id === "null" || !r.stat_date) continue;
  let s = matDays.get(r.account_id + ":" + r.dim_id);
  if (!s) { s = new Set(); matDays.set(r.account_id + ":" + r.dim_id, s); }
  s.add(r.stat_date);
}

const byMat = new Map();
// 素材维度只能用 uni_video（dim_id = material_id）。
// 直播表的 dim_id 是主播 aweme_id，混进来会把主播当素材，产出垃圾结论。
for (const r of video) {
  if (!r.dim_id || r.dim_id === "null") continue;
  if (!winDays.has(r.stat_date)) continue;
  const k = r.account_id + ":" + r.dim_id;
  let a = byMat.get(k);
  if (!a) { a = { account: r.account_name, role: r.dim_name, cost: 0, gmv: 0, ord: 0 }; byMat.set(k, a); }
  a.cost += costOf(r); a.gmv += gmvOf(r); a.ord += orderOf(r);
}

const matRows = [...byMat.entries()]
  .filter(([, a]) => a.cost > 0)
  .map(([k, a]) => {
    const mid = k.split(":")[1];
    const meta = matMeta.get(mid);
    return {
      key: k, material_id: mid, account: a.account,
      // 同名素材（如「AIGC动态创意视频素材集合」）靠 ID 尾号区分
      name: meta?.filename || a.role || mid,
      duration: meta ? n(meta.duration) : null,
      isAi: meta?.is_ai_create === "true" || meta?.is_ai_create === "1",
      kind: meta?.kind || "未知",
      cost: a.cost, gmv: a.gmv, ord: a.ord,
      roi: a.cost > 0 ? a.gmv / a.cost : 0,
      activeDays: (matDays.get(k) || new Set()).size,
      isOriginal: origSet.has(k),
      isInefficient: badSet.has(k),
    };
  })
  .sort((a, b) => b.cost - a.cost);

const matTotal = matRows.reduce((s, m) => s + m.cost, 0);
console.log(`\n【四】素材效率（近 7 完整日有消耗素材 ${matRows.length.toLocaleString()} 条，合计 ${wan(matTotal)} 万）\n`);
console.log("  Top 10 消耗素材");
console.log("  " + "─".repeat(76));
for (const m of matRows.slice(0, 10)) {
  const nm = (m.name || "").replace(/\s+/g, " ").slice(0, 20);
  console.log(`  ${nm.padEnd(22)}${m.material_id.slice(-6)} ${m.kind.padEnd(3)} 耗${wan(m.cost).padStart(5)}万 ROI${m.roi.toFixed(2).padStart(5)} 活跃${m.activeDays}天`);
}
const top100 = matRows.slice(0, 100).reduce((s, m) => s + m.cost, 0);
console.log(`\n  集中度：Top100 素材占 ${pct(top100 / matTotal)} 消耗`);

// 效率分层
const tiers = [
  { name: "高效 (ROI≥3)", f: (m) => m.roi >= 3 },
  { name: "达标 (2-3)", f: (m) => m.roi >= 2 && m.roi < 3 },
  { name: "偏低 (1-2)", f: (m) => m.roi >= 1 && m.roi < 2 },
  { name: "亏损 (<1)", f: (m) => m.roi < 1 },
];
console.log("\n  素材效率分层");
console.log("  " + "─".repeat(62));
for (const t of tiers) {
  const g = matRows.filter(t.f);
  const c = g.reduce((s, m) => s + m.cost, 0);
  const v = g.reduce((s, m) => s + m.gmv, 0);
  console.log(`  ${t.name.padEnd(14)} ${String(g.length).padStart(6)} 条  耗 ${wan(c).padStart(7)} 万 (${pct(c / matTotal).padStart(6)})  成交 ${wan(v).padStart(7)} 万  ROI ${(c > 0 ? v / c : 0).toFixed(2)}`);
}

// 首发素材
const origs = matRows.filter((m) => m.isOriginal);
if (origs.length) {
  const oc = origs.reduce((s, m) => s + m.cost, 0), ov = origs.reduce((s, m) => s + m.gmv, 0);
  const nc = matTotal - oc, nv = matRows.reduce((s, m) => s + m.gmv, 0) - ov;
  console.log(`\n  首发素材 vs 其他：首发 ${origs.length} 条 耗 ${wan(oc)} 万 ROI ${(oc > 0 ? ov / oc : 0).toFixed(2)} ｜ 其他 耗 ${wan(nc)} 万 ROI ${(nc > 0 ? nv / nc : 0).toFixed(2)}`);
}

// 素材生命周期：跑过多少天
const lifeBins = [[1, 1], [2, 3], [4, 7], [8, 14], [15, 30], [31, 9999]];
console.log("\n  素材活跃天数分布（越久越稳）");
console.log("  " + "─".repeat(62));
for (const [lo, hi] of lifeBins) {
  const g = matRows.filter((m) => m.activeDays >= lo && m.activeDays <= hi);
  if (!g.length) continue;
  const c = g.reduce((s, m) => s + m.cost, 0), v = g.reduce((s, m) => s + m.gmv, 0);
  const label = hi === 9999 ? `${lo}天+` : lo === hi ? `${lo}天` : `${lo}-${hi}天`;
  console.log(`  ${label.padEnd(10)} ${String(g.length).padStart(6)} 条  耗 ${wan(c).padStart(7)} 万 (${pct(c / matTotal).padStart(6)})  ROI ${(c > 0 ? v / c : 0).toFixed(2)}`);
}

// ── 4.5 主播维度（uni_live 的 dim_id = 主播 aweme_id）──
const byAnchor = new Map();
for (const r of live) {
  if (!completeDays.includes(r.stat_date)) continue;
  const aid = r.dim_id;
  if (!aid || aid === "null") continue;
  const k = r.account_id + ":" + aid;
  let a = byAnchor.get(k);
  if (!a) { a = { name: r.dim_name, account: r.account_name, cost: 0, gmv: 0 }; byAnchor.set(k, a); }
  a.cost += costOf(r); a.gmv += gmvOf(r);
}
const anchorList = [...byAnchor.values()].filter((a) => a.cost > 0).sort((a, b) => b.cost - a.cost);
if (anchorList.length) {
  const ac = anchorList.reduce((s, a) => s + a.cost, 0);
  console.log(`\n【三·补】主播维度（直播，${anchorList.length} 个有消耗主播，合计 ${wan(ac)} 万）\n`);
  console.log("  主播 / 账号                     消耗(万)  成交(万)   ROI");
  console.log("  " + "─".repeat(58));
  for (const a of anchorList.slice(0, 8)) {
    const nm = `${(a.name || "").slice(0, 12)}／${(a.account || "").slice(0, 10)}`;
    console.log(`  ${nm.padEnd(28)} ${wan(a.cost).padStart(7)} ${wan(a.gmv).padStart(9)}  ${(a.cost > 0 ? a.gmv / a.cost : 0).toFixed(2).padStart(5)}`);
  }
  const top3 = anchorList.slice(0, 3).reduce((s, a) => s + a.cost, 0);
  console.log(`\n  集中度：Top3 主播占 ${pct(top3 / ac)} 直播消耗`);
}

// ── 5. 商品结构（prod_dim 的 dim_id = 商品 ID）──
const prodName = new Map(products.map((p) => [p.product_id, p.product_name]));
const prodRowsRaw = load("prod_dim.csv");
const byProd = new Map();
for (const r of prodRowsRaw) {
  if (!completeDays.includes(r.stat_date)) continue;
  const pid = r.dim_id;
  if (!pid || pid === "null") continue;
  let a = byProd.get(pid);
  if (!a) { a = { name: prodName.get(pid) || r.dim_name || pid, cost: 0, gmv: 0, ord: 0 }; byProd.set(pid, a); }
  a.cost += n(r.stat_cost) || costOf(r);
  a.gmv += gmvOf(r);
  a.ord += orderOf(r);
}
const prodList = [...byProd.values()].filter((p) => p.cost > 0).sort((a, b) => b.cost - a.cost);
if (prodList.length) {
  const pc = prodList.reduce((s, p) => s + p.cost, 0);
  console.log(`\n【五】商品结构（近 7 完整日，${prodList.length} 个有消耗商品，合计 ${wan(pc)} 万）`);
  console.log(`     注：商品维度仅覆盖商品卡投放，直播/短视频的消耗不在此表\n`);
  console.log("  商品                          消耗(万)  成交(万)   ROI   占比");
  console.log("  " + "─".repeat(64));
  for (const p of prodList.slice(0, 8)) {
    console.log(`  ${(p.name || "").slice(0, 24).padEnd(26)} ${wan(p.cost).padStart(7)} ${wan(p.gmv).padStart(9)}  ${(p.cost > 0 ? p.gmv / p.cost : 0).toFixed(2).padStart(5)}  ${pct(p.cost / pc).padStart(6)}`);
  }
} else {
  console.log("\n【五】商品维度：窗口内无消耗记录，跳过");
}

// ── 6. 异常与建议 ──
console.log(`\n【六】异常与判断\n`);
const issues = [];
// 6.1 近 3 天 ROI 趋势
const last3 = completeDays.slice(-3).map((d) => ({ d, ...byDay.get(d) })).map((x) => ({ d: x.d, roi: x.cost > 0 ? x.gmv / x.cost : 0, cost: x.cost }));
if (last3.length >= 3) {
  const trend = last3[2].roi - last3[0].roi;
  if (Math.abs(trend) > 0.3) {
    issues.push(`ROI ${trend > 0 ? "回升" : "下滑"} ${Math.abs(trend).toFixed(2)}：${last3.map((x) => `${x.d.slice(5)}=${x.roi.toFixed(2)}`).join(" → ")}`);
  }
}
// 6.2 零成交但高消耗
const zeroGmv = matRows.filter((m) => m.cost > 500 && m.gmv === 0);
if (zeroGmv.length) {
  const zc = zeroGmv.reduce((s, m) => s + m.cost, 0);
  issues.push(`${zeroGmv.length} 条素材消耗 ${wan(zc)} 万但零成交（单条>500元）`);
}
// 6.3 低效标记素材仍在大投
const badActive = matRows.filter((m) => m.isInefficient && m.cost > 300);
if (badActive.length) {
  issues.push(`${badActive.length} 条「低效」标记素材仍在消耗（合计 ${wan(badActive.reduce((s, m) => s + m.cost, 0))} 万）`);
}
// 6.4 单素材依赖
if (matRows[0] && matRows[0].cost / matTotal > 0.05) {
  issues.push(`单条素材占比 ${pct(matRows[0].cost / matTotal)}（${(matRows[0].name || "").slice(0, 20)}），依赖度偏高`);
}
if (!issues.length) issues.push("未发现明显异常");
for (const i of issues) console.log(`  • ${i}`);

console.log(`\n${"─".repeat(62)}`);
console.log(`  分析完成｜口径：全域推广 roi2，成交取 1h 结算金额`);
console.log(`${"─".repeat(62)}\n`);

if (args.json) {
  console.log(JSON.stringify({ lastDay, days: recent, byDay: Object.fromEntries(byDay), cur7, prev7, accounts: acctList, materials: matRows.slice(0, 200) }, null, 1));
}
