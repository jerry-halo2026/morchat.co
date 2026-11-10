#!/usr/bin/env node
// #9 僵尸预算排查：plans.csv → 状态分布 / SYSTEM_DISABLE 按账户 / 时间分布
// 用法：node scripts/analyze-plans.mjs
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const PKG = join(dirname(fileURLToPath(import.meta.url)), "..");
const lines = readFileSync(join(PKG, "data", "flat", "plans.csv"), "utf8").split("\n").filter(Boolean);
const head = lines[0].split(",");
function parseLine(l) {
  const cells = [];
  let cur = "", inQ = false;
  for (const ch of l) {
    if (ch === '"') { inQ = !inQ; continue; }
    if (ch === "," && !inQ) { cells.push(cur); cur = ""; continue; }
    cur += ch;
  }
  cells.push(cur);
  const o = {};
  head.forEach((h, i) => o[h] = cells[i] ?? "");
  return o;
}
const rows = lines.slice(1).map(parseLine);
const num = (v) => Number(v) || 0;

console.log("计划总数:", rows.length);
const byStatus = {};
for (const r of rows) {
  (byStatus[r.status] ||= { n: 0, budget: 0 });
  byStatus[r.status].n++;
  byStatus[r.status].budget += num(r.budget);
}
console.log("\n状态分布:");
for (const [s, v] of Object.entries(byStatus).sort((a, b) => b[1].n - a[1].n)) {
  console.log(`  ${s.padEnd(22)} ${String(v.n).padStart(4)} 个   预算 ${(v.budget / 1e8).toFixed(2)} 亿`);
}

const z = rows.filter(r => r.status === "SYSTEM_DISABLE");
const byAcct = {};
for (const r of z) {
  const k = (r.account_name || r.account_id).slice(0, 22);
  byAcct[k] = (byAcct[k] || 0) + num(r.budget);
}
console.log("\nSYSTEM_DISABLE 预算 Top10 账户:");
for (const [a, b] of Object.entries(byAcct).sort((x, y) => y[1] - x[1]).slice(0, 10)) {
  console.log(`  ${a.padEnd(24)} ${(b / 1e8).toFixed(2)} 亿`);
}

const active = rows.filter(r => r.status === "DELIVERY_OK");
console.log(`\n在投 ${active.length} 个 · 预算合计 ${(active.reduce((s, r) => s + num(r.budget), 0) / 1e8).toFixed(3)} 亿`);
console.log(`SYSTEM_DISABLE ${z.length} 个 · 预算合计 ${(z.reduce((s, r) => s + num(r.budget), 0) / 1e8).toFixed(2)} 亿`);

const byMonth = {};
for (const r of z) byMonth[(r.create_time || "").slice(0, 7)] = (byMonth[(r.create_time || "").slice(0, 7)] || 0) + 1;
console.log("\nSYSTEM_DISABLE 创建月份分布:");
for (const [m, n] of Object.entries(byMonth).sort()) console.log(`  ${m}: ${n}`);

const byGoal = {};
for (const r of z) byGoal[r.marketing_goal] = (byGoal[r.marketing_goal] || 0) + 1;
console.log("\nSYSTEM_DISABLE 按目标:", JSON.stringify(byGoal));
