#!/usr/bin/env node
// 归因回溯 diff：对比同一调用在不同时间点的两个版本快照，量化历史数值漂移
// 用法：
//   node scripts/attribution-diff.mjs                          # 全部 source，最早 vs 最新版本
//   node scripts/attribution-diff.mjs --source uni_video       # 单 source
//   node scripts/attribution-diff.mjs --from 20261106070000 --to 20261106090000  # 按时间界选取
// 输出：data/analysis/attribution-drift-<from>-<to>.json + 控制台 markdown 摘要
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { pickRows } from "../core/client.mjs";

const PKG = join(dirname(fileURLToPath(import.meta.url)), "..");
const RAW = join(PKG, "data", "raw");
const SOURCES = ["uni_image", "uni_video", "uni_live", "plans", "accounts", "anchors", "violations"];

// 参数归一化：把 --k=v 展开成 --k v。
// 此前多数脚本只认空格写法，用 --day=2026-11-06 会静默走默认值 —— 与 --source=xx 是同一类 bug。
const args = process.argv.slice(2).flatMap((a) =>
  a.startsWith("--") && a.includes("=")
    ? [a.slice(0, a.indexOf("=")), a.slice(a.indexOf("=") + 1)]
    : [a]);
const only = args.includes("--source") ? args[args.indexOf("--source") + 1] : null;
const fromArg = args.includes("--from") ? args[args.indexOf("--from") + 1] : null;
const toArg = args.includes("--to") ? args[args.indexOf("--to") + 1] : null;

// ── 版本发现：name--YYYYMMDDHHMMSS..json ──
function scanVersions(source) {
  const dir = join(RAW, source, "versions");
  if (!existsSync(dir)) return {};
  const byCall = {};
  for (const f of readdirSync(dir)) {
    const m = f.match(/^(.*)--(\d{14})\.\.json$/);
    if (!m) continue;
    (byCall[m[1]] ||= []).push({ ts: m[2], file: join(dir, f) });
  }
  for (const k of Object.keys(byCall)) byCall[k].sort((a, b) => a.ts.localeCompare(b.ts));
  return byCall;
}
function pick(vers, bound, wantLatest) {
  if (!vers.length) return null;
  if (!bound) return wantLatest ? vers[vers.length - 1] : vers[0];
  const before = vers.filter(v => v.ts <= bound);
  const pool = before.length ? before : vers;
  return wantLatest ? pool[pool.length - 1] : pool[0];
}

// ── 行归一化：统一为 Map<key, {fields}> ──
function loadRows(source, file) {
  const j = JSON.parse(readFileSync(file, "utf8"));
  if (j.code !== 0) return { rows: new Map(), meta: {} };
  const d = j.data || {};
  const raw = pickRows(d);
  const map = new Map();
  if (source.startsWith("uni_")) {
    // 维度键：stat_time_day + 其余维度（material_id / anchor_id / roi2_*_name）
    for (const r of raw || []) {
      const dims = r.dimensions || {};
      const parts = Object.keys(dims).sort().map(k => `${k}=${dims[k].ValueStr ?? dims[k].Value}`);
      const metrics = {};
      for (const [k, v] of Object.entries(r.metrics || {})) metrics[k] = Number(v.Value ?? 0);
      map.set(parts.join("|"), { metrics, _date: dims.stat_time_day?.ValueStr || "" });
    }
  } else if (source === "plans") {
    for (const r of raw || []) {
      const a = r.ad_info || {};
      map.set(`plan:${a.id}`, {
        metrics: { name: a.name, status: a.status, opt_status: a.opt_status, budget: a.budget, roi2_goal: a.roi2_goal },
        _date: a.modify_time || "",
      });
    }
  } else if (source === "accounts") {
    for (const r of raw || []) map.set(`adv:${r.adv_id}`, { metrics: { name: r.adv_name }, _date: "" });
  } else if (source === "anchors") {
    for (const r of raw || []) map.set(`aweme:${r.aweme_id}`, { metrics: { name: r.aweme_name }, _date: "" });
  } else if (source === "violations") {
    for (const r of raw || []) map.set(`event:${r.event_id}`, { metrics: { score: r.score, status: r.status }, _date: r.create_time || "" });
  }
  return { rows: map, meta: { total: (raw || []).length } };
}

// ── diff ──
function diffSource(source) {
  const byCall = scanVersions(source);
  const calls = Object.keys(byCall).filter(k => byCall[k].length >= 2);
  if (!calls.length) return { source, comparable: 0, note: "无 ≥2 个版本（需再拉一轮产生 T2）" };
  const out = { source, comparable: calls.length, changedTuples: 0, added: 0, removed: 0, metricDrift: {}, dateHistogram: {}, accountDrift: {}, samples: [], planEvents: { deleted: [], added: [], modified: [] } };

  for (const name of calls) {
    const vFrom = pick(byCall[name], fromArg, false);
    const vTo = pick(byCall[name], toArg, true);
    if (vFrom.ts === vTo.ts) continue;
    const A = loadRows(source, vFrom.file), B = loadRows(source, vTo.file);
    const account = name.split("-")[1] || name;
    let acctChanged = 0;

    for (const key of A.rows.keys()) {
      if (!B.rows.has(key)) { out.removed++; acctChanged++; continue; }
      const a = A.rows.get(key), b = B.rows.get(key);
      for (const m of Object.keys(a.metrics)) {
        const av = a.metrics[m], bv = b.metrics[m];
        if (av === bv) continue;
        out.changedTuples++; acctChanged++;
        out.metricDrift[m] = (out.metricDrift[m] || 0) + 1;
        const day = (b._date || a._date || "").slice(0, 10);
        out.dateHistogram[day] = (out.dateHistogram[day] || 0) + 1;
        if (source === "plans") {
          out.planEvents.modified.push({ plan: key, field: m, from: String(av).slice(0, 40), to: String(bv).slice(0, 40), account });
        } else if (out.samples.length < 40) {
          out.samples.push({ key, metric: m, from: av, to: bv, delta: bv - av, day, account });
        }
      }
    }
    for (const key of B.rows.keys()) {
      if (!A.rows.has(key)) {
        out.added++; acctChanged++;
        if (source === "plans") out.planEvents.added.push({ plan: key, name: B.rows.get(key).metrics.name, account });
      }
    }
    if (source === "plans") {
      for (const key of A.rows.keys()) if (!B.rows.has(key)) out.planEvents.deleted.push({ plan: key, account });
    }
    if (acctChanged) out.accountDrift[account] = (out.accountDrift[account] || 0) + acctChanged;
  }
  return out;
}

// ── 汇总输出 ──
const sources = only ? [only] : SOURCES;
const results = sources.map(diffSource);
mkdirSync(join(PKG, "data", "analysis"), { recursive: true });

let fromLabel = fromArg, toLabel = toArg;
if (!fromLabel || !toLabel) {
  const any = scanVersions("plans"); const first = Object.values(any)[0];
  if (first) { fromLabel ||= first[0].ts; toLabel ||= first[first.length - 1].ts; }
}
const outFile = join(PKG, "data", "analysis", `attribution-drift-${fromLabel || "t1"}-${toLabel || "t2"}.json`);
writeFileSync(outFile, JSON.stringify({ generated_at: new Date().toISOString(), from: fromLabel, to: toLabel, results }, null, 1), "utf8");

console.log(`# 归因回溯 ${fromLabel} → ${toLabel}\n`);
for (const r of results) {
  if (r.note) { console.log(`## ${r.source}: ${r.note}`); continue; }
  console.log(`## ${r.source}: ${r.comparable} 个调用可比 · 变动 ${r.changedTuples} · 新增 ${r.added} · 消失 ${r.removed}`);
  const topMetrics = Object.entries(r.metricDrift).sort((a, b) => b[1] - a[1]).slice(0, 5);
  if (topMetrics.length) console.log(`  漂移指标 Top5: ${topMetrics.map(([m, n]) => `${m}(${n})`).join(", ")}`);
  const topDates = Object.entries(r.dateHistogram).sort().slice(-8);
  if (topDates.length) console.log(`  按日期: ${topDates.map(([d, n]) => `${d}:${n}`).join(" ")}`);
  const topAcct = Object.entries(r.accountDrift).sort((a, b) => b[1] - a[1]).slice(0, 5);
  if (topAcct.length) console.log(`  按账户: ${topAcct.map(([a, n]) => `${a}(${n})`).join(", ")}`);
  if (r.source === "plans") {
    const pe = r.planEvents;
    console.log(`  计划生命周期: 删除 ${pe.deleted.length} · 新建 ${pe.added.length} · 字段变动 ${pe.modified.length}`);
    for (const d of pe.deleted.slice(0, 5)) console.log(`    [删除] ${d.plan} @${d.account}`);
    for (const m of pe.modified.slice(0, 5)) console.log(`    [改动] ${m.plan}.${m.field}: ${m.from} → ${m.to} @${m.account}`);
  }
  console.log("");
}
console.log(`明细: ${outFile}`);
