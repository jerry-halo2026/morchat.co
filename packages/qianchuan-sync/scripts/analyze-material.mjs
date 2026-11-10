// 素材效果分析（2026-11-07）
// 有了元数据，「什么素材有效」才第一次能落到可计算的结论上。
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PKG } from "../core/env.mjs";

function parseCsvLine(l) {
  const cells = []; let cur = "", q = false;
  for (let i = 0; i < l.length; i++) {
    const c = l[i];
    if (q) { if (c === '"' && l[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true;
    else if (c === ",") { cells.push(cur); cur = ""; }
    else cur += c;
  }
  cells.push(cur); return cells;
}
function load(name) {
  const lines = readFileSync(join(PKG, "data", "flat", name), "utf8").split("\n").filter(Boolean);
  const head = lines[0].split(",");
  return lines.slice(1).map((l) => { const c = parseCsvLine(l); const o = {}; head.forEach((k, i) => (o[k] = c[i])); return o; });
}

const mv = load("material_video.csv");
const uv = load("uni_video.csv");

// 素材ID → 元数据
const meta = new Map();
for (const r of mv) if (r.material_id) meta.set(r.account_id + ":" + r.material_id, r);

// 素材ID → 累计消耗 / 成交 / 出现天数
const COST = "stat_cost_for_roi2";
const GMV = "total_order_settle_amount_for_roi2_1h";
const agg = new Map();
for (const r of uv) {
  if (!r.dim_id || r.dim_id === "null" || r.dim_id === "-") continue;
  const k = r.account_id + ":" + r.dim_id;
  let a = agg.get(k);
  if (!a) { a = { cost: 0, gmv: 0, days: 0, account: r.account_id }; agg.set(k, a); }
  a.cost += Number(r[COST]) || 0;
  a.gmv += Number(r[GMV]) || 0;
  if ((Number(r[COST]) || 0) > 0) a.days++;
}

const rows = [];
for (const [k, a] of agg) {
  const m = meta.get(k);
  rows.push({ ...a, key: k, dur: m ? Number(m.duration) || 0 : null, height: m ? Number(m.height) || 0 : 0, width: m ? Number(m.width) || 0 : 0, matched: !!m });
}
console.log("素材总数", rows.length, "| 有元数据", rows.filter((r) => r.matched).length);

// ── 1. 按时长分组 ──
const buckets = [
  ["≤15秒", 0, 15], ["16-30秒", 15, 30], ["31-60秒", 30, 60], ["61-120秒", 60, 120], [">120秒", 120, 1e9],
];
console.log("\n=== 按时长分组（仅统计已 join 上的素材）===");
console.log("时长段".padEnd(10), "素材数".padStart(6), "消耗".padStart(12), "成交".padStart(12), "ROI".padStart(7), "单素材均耗".padStart(10));
for (const [label, lo, hi] of buckets) {
  const g = rows.filter((r) => r.matched && r.dur > lo && r.dur <= hi);
  if (!g.length) continue;
  const cost = g.reduce((s, r) => s + r.cost, 0);
  const gmv = g.reduce((s, r) => s + r.gmv, 0);
  const roi = cost > 0 ? gmv / cost : 0;
  console.log(
    label.padEnd(10),
    String(g.length).padStart(6),
    cost.toFixed(0).padStart(12),
    gmv.toFixed(0).padStart(12),
    roi.toFixed(2).padStart(7),
    (cost / g.length).toFixed(0).padStart(10)
  );
}

// ── 2. 投放持续性 ──
console.log("\n=== 投放持续性（有消耗的天数）===");
const dayBuckets = [["1天", 1, 1], ["2-7天", 2, 7], ["8-30天", 8, 30], [">30天", 31, 1e9]];
for (const [label, lo, hi] of dayBuckets) {
  const g = rows.filter((r) => r.days >= lo && r.days <= hi);
  if (!g.length) continue;
  const cost = g.reduce((s, r) => s + r.cost, 0);
  const gmv = g.reduce((s, r) => s + r.gmv, 0);
  console.log(
    label.padEnd(8),
    "素材", String(g.length).padStart(5),
    "| 消耗", cost.toFixed(0).padStart(10),
    "| 占比", ((cost / rows.reduce((s, r) => s + r.cost, 0)) * 100).toFixed(1) + "%",
    "| ROI", (cost > 0 ? gmv / cost : 0).toFixed(2)
  );
}

// ── 3. 头部集中度 ──
const sorted = [...rows].sort((a, b) => b.cost - a.cost);
const totalCost = sorted.reduce((s, r) => s + r.cost, 0);
for (const n of [10, 50, 100, 500]) {
  const top = sorted.slice(0, n).reduce((s, r) => s + r.cost, 0);
  console.log(`Top ${String(n).padStart(3)} 素材贡献消耗 ${(top / totalCost * 100).toFixed(1)}%`);
}

// ── 4. 按账户命中率（找出元数据缺失的账户）──
console.log("\n=== 元数据缺口最大的账户（素材数≥50）===");
const byAcct = {};
for (const r of rows) {
  const a = (byAcct[r.account] = byAcct[r.account] || { n: 0, hit: 0, cost: 0, costHit: 0 });
  a.n++; a.cost += r.cost;
  if (r.matched) { a.hit++; a.costHit += r.cost; }
}
const worst = Object.entries(byAcct)
  .filter(([, v]) => v.n >= 50)
  .map(([k, v]) => [k, v, v.hit / v.n])
  .sort((a, b) => a[2] - b[2])
  .slice(0, 6);
for (const [acct, v, rate] of worst) {
  console.log(`  ${acct} | 素材 ${v.n} | 命中 ${(rate * 100).toFixed(1)}% | 消耗 ${v.cost.toFixed(0)} 元（元数据覆盖 ${(v.costHit / v.cost * 100).toFixed(1)}%）`);
}
