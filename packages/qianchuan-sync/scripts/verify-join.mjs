// 素材元数据 / 商品维表的 join 覆盖率验证（2026-11-07）
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PKG } from "../core/env.mjs";

function load(name) {
  const p = join(PKG, "data", "flat", name);
  const lines = readFileSync(p, "utf8").split("\n").filter(Boolean);
  const head = lines[0].split(",");
  return lines.slice(1).map((l) => {
    // 简单 CSV 解析：字段里可能含逗号（文件名），用引号规则
    const cells = [];
    let cur = "", q = false;
    for (let i = 0; i < l.length; i++) {
      const c = l[i];
      if (q) { if (c === '"' && l[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
      else if (c === '"') q = true;
      else if (c === ",") { cells.push(cur); cur = ""; }
      else cur += c;
    }
    cells.push(cur);
    const o = {};
    head.forEach((k, i) => (o[k] = cells[i]));
    return o;
  });
}

// ── 1. 视频素材：库内 vs 投放 ──
const mv = load("material_video.csv");
const uv = load("uni_video.csv");
const libV = new Map();
for (const r of mv) if (r.material_id) libV.set(r.account_id + ":" + r.material_id, r);
const usedV = new Map();
for (const r of uv) {
  if (!r.dim_id || r.dim_id === "null" || r.dim_id === "-") continue;
  const k = r.account_id + ":" + r.dim_id;
  usedV.set(k, (usedV.get(k) || 0) + (Number(r.stat_cost_for_roi2) || 0));
}
let hit = 0, miss = 0, missCost = 0, hitCost = 0;
for (const [k, cost] of usedV) {
  if (libV.has(k)) { hit++; hitCost += cost; } else { miss++; missCost += cost; }
}
console.log("=== 视频素材 ===");
console.log("素材库", libV.size, "个 | 投放过", usedV.size, "个");
console.log(`join 命中 ${hit} / 未命中 ${miss} → ${(hit / usedV.size * 100).toFixed(1)}%`);
console.log(`消耗覆盖 ${hitCost.toFixed(0)} / ${(hitCost + missCost).toFixed(0)} 元 = ${(hitCost / (hitCost + missCost) * 100).toFixed(1)}%`);
const never = libV.size - hit;
console.log(`库里从未投放的素材: ${never} 个 (${(never / libV.size * 100).toFixed(1)}%)`);

// ── 2. 素材属性分布（仅取有投放的）──
let withDur = 0, durSum = 0, aiCount = 0, vertCount = 0, tot = 0;
const buckets = {};
for (const [k] of usedV) {
  const r = libV.get(k);
  if (!r) continue;
  tot++;
  const d = Number(r.duration);
  if (d > 0) {
    withDur++; durSum += d;
    const b = d <= 15 ? "≤15秒" : d <= 30 ? "16-30秒" : d <= 60 ? "31-60秒" : d <= 120 ? "61-120秒" : ">120秒";
    buckets[b] = (buckets[b] || 0) + 1;
  }
  if (r.is_ai_create === "1") aiCount++;
  if ((r.image_mode || "").includes("VERTICAL")) vertCount++;
}
if (tot) {
  console.log(`\n有投放的素材 ${tot} 个 | 平均时长 ${(durSum / withDur).toFixed(1)} 秒`);
  console.log("时长分布:", Object.entries(buckets).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(", "));
  console.log(`AI 生成 ${aiCount} 个 (${(aiCount / tot * 100).toFixed(1)}%) | 竖屏 ${vertCount} 个 (${(vertCount / tot * 100).toFixed(1)}%)`);
}

// ── 3. 商品维表 ──
const pd = load("products.csv");
const pdd = load("prod_dim.csv");
const prodName = new Map();
for (const r of pd) if (r.product_id) prodName.set(r.account_id + ":" + r.product_id, r);
let phit = 0, pmiss = 0, pmissCost = 0, phitCost = 0;
const seenP = new Map();
for (const r of pdd) {
  if (r.topic_tag !== "product") continue;
  if (!r.dim_id || r.dim_id === "null") continue;
  const k = r.account_id + ":" + r.dim_id;
  seenP.set(k, (seenP.get(k) || 0) + (Number(r.stat_cost) || 0));
}
for (const [k, cost] of seenP) {
  if (prodName.has(k)) { phit++; phitCost += cost; } else { pmiss++; pmissCost += cost; }
}
console.log("\n=== 商品维表 ===");
console.log("商品维表", prodName.size, "个 | prod_dim 用到的商品", seenP.size, "个");
console.log(`join 命中 ${phit} / 未命中 ${pmiss} → ${(phit / (phit + pmiss) * 100).toFixed(1)}%`);
console.log(`消耗覆盖 ${phitCost.toFixed(0)} / ${(phitCost + pmissCost).toFixed(0)} 元`);
if (pmiss) {
  const missList = [...seenP.keys()].filter((k) => !prodName.has(k)).slice(0, 3);
  console.log("未命中样例:", missList);
}
