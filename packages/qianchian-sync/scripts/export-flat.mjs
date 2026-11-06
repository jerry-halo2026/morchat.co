#!/usr/bin/env node
// 拍平导出：raw 版本链 → 单源单 CSV（分析友好）
// 用法：
//   node scripts/export-flat.mjs                          # 用最新副本（latest）
//   node scripts/export-flat.mjs --as-of 20261106080000   # 按版本链回放到指定时刻（UTC）
// 输出：data/flat/<source>.csv + README
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { pickRows } from "../core/client.mjs";

const PKG = join(dirname(fileURLToPath(import.meta.url)), "..");
const RAW = join(PKG, "data", "raw");
const OUT = join(PKG, "data", "flat");

const args = process.argv.slice(2);
const asOf = args.includes("--as-of") ? args[args.indexOf("--as-of") + 1] : null;

function readSnapshot(source, name) {
  if (asOf) {
    const dir = join(RAW, source, "versions");
    if (existsSync(dir)) {
      const cands = readdirSync(dir)
        .map(f => { const m = f.match(new RegExp(`^${name.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}--(\\d{14})\\.\\.json$`)); return m ? { ts: m[1], file: join(dir, f) } : null; })
        .filter(Boolean).sort((a, b) => a.ts.localeCompare(b.ts))
        .filter(v => !asOf || v.ts <= asOf);
      if (cands.length) return JSON.parse(readFileSync(cands[cands.length - 1].file, "utf8"));
    }
    return null;
  }
  const p = join(RAW, source, `${name}.json`);
  return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null;
}
function listCalls(source) {
  if (asOf) {
    const dir = join(RAW, source, "versions");
    const s = new Set();
    for (const f of readdirSync(dir)) { const m = f.match(/^(.*)--\d{14}\.\.json$/); if (m) s.add(m[1]); }
    return [...s];
  }
  return readdirSync(join(RAW, source)).filter(f => f.endsWith(".json")).map(f => f.slice(0, -5));
}
// 行提取统一走 core/client.mjs pickRows（陷阱注释见彼处）
const rowsOf = (j) => pickRows(j?.data || {});

// ── 维表：账户名 / 主播名 ──
const acctName = {}, anchorName = {};
{
  for (let p = 1; p <= 3; p++) {
    const j = readSnapshot("accounts", `accounts-p${p}`);
    for (const r of rowsOf(j || {})) acctName[r.adv_id] = r.adv_name;
  }
  for (const c of listCalls("anchors")) {
    const j = readSnapshot("anchors", c);
    for (const r of rowsOf(j || {})) if (r.aweme_name) anchorName[r.aweme_id] = r.aweme_name;
  }
}

function csvEscape(v) {
  if (v === undefined || v === null) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function writeCsv(name, header, rows) {
  const lines = [header.join(",")];
  for (const r of rows) lines.push(r.map(csvEscape).join(","));
  writeFileSync(join(OUT, name), lines.join("\n") + "\n", "utf8");
  console.log(`${name.padEnd(22)} ${rows.length} 行`);
}

mkdirSync(OUT, { recursive: true });
const stamp = asOf ? `as-of ${asOf}Z` : "latest";
console.log(`# 拍平导出（${stamp}）\n`);

// ── uni 报表三件套：date, account, dim, [name], 全指标 ──
for (const [source, dimField, nameField] of [
  ["uni_live", "anchor_id", null],
  ["uni_video", "material_id", "roi2_material_video_name"],
  ["uni_image", "material_id", "roi2_material_image_name"],
]) {
  const rows = [];
  for (const c of listCalls(source)) {
    const j = readSnapshot(source, c);
    if (!j || j.code !== 0) continue;
    const acct = Number(c.split("-")[1]);
    for (const r of rowsOf(j)) {
      const dims = r.dimensions || {}, mets = r.metrics || {};
      const out = {
        stat_date: dims.stat_time_day?.ValueStr || "",
        account_id: acct,
        account_name: acctName[acct] || "",
        dim_id: dims[dimField]?.ValueStr ?? dims[dimField]?.Value ?? "",
        dim_name: nameField ? (dims[nameField]?.ValueStr || "") : (anchorName[dims[dimField]?.ValueStr] || ""),
      };
      for (const [k, v] of Object.entries(mets)) out[k] = v.Value ?? 0;
      rows.push(out);
    }
  }
  if (rows.length) {
    const header = Object.keys(rows[0]);
    writeCsv(`${source}.csv`, header, rows.map(r => header.map(h => r[h])));
  }
}

// ── plans：一计划一行 ──
{
  const rows = [];
  for (const c of listCalls("plans")) {
    const j = readSnapshot("plans", c);
    if (!j || j.code !== 0) continue;
    const acct = Number(c.split("-")[1]);
    for (const r of rowsOf(j)) {
      const a = r.ad_info || {};
      rows.push([a.id, acct, acctName[acct] || "", a.name, a.marketing_goal, a.status, a.opt_status, a.budget, a.budget_mode, a.roi2_goal, a.smart_bid_type, a.create_time, a.start_time, a.end_time, a.modify_time]);
    }
  }
  writeCsv("plans.csv", ["plan_id","account_id","account_name","name","marketing_goal","status","opt_status","budget","budget_mode","roi2_goal","smart_bid_type","create_time","start_time","end_time","modify_time"], rows);
}

// ── anchors：授权主播维表 ──
{
  const rows = [];
  for (const c of listCalls("anchors")) {
    const acct = Number(c.split("-")[1]);
    const j = readSnapshot("anchors", c);
    for (const r of rowsOf(j || {})) rows.push([acct, acctName[acct] || "", r.aweme_id, r.aweme_name || anchorName[r.aweme_id] || ""]);
  }
  writeCsv("anchors.csv", ["account_id","account_name","aweme_id","aweme_name"], rows);
}

// ── accounts / balance / violations ──
{
  const rows = [];
  for (let p = 1; p <= 3; p++) {
    const j = readSnapshot("accounts", `accounts-p${p}`);
    for (const r of rowsOf(j || {})) rows.push([r.adv_id, r.adv_name]);
  }
  writeCsv("accounts.csv", ["account_id","account_name"], rows);
}
{
  const j = readSnapshot("balance", "balance-batch-1");
  const rows = rowsOf(j || {}).map(r => [r.account_id, acctName[r.account_id] || "", r.balance, r.cash, r.common_grant, r.valid_grant ?? r["valid_grant"]]);
  writeCsv("balance.csv", ["account_id","account_name","balance","cash","common_grant","valid_grant"], rows);
}
{
  const rows = [];
  for (const c of listCalls("violations")) {
    const j = readSnapshot("violations", c);
    if (!j || j.code !== 0) continue;
    for (const r of rowsOf(j)) rows.push([r.event_id, r.advertiser_id, acctName[r.advertiser_id] || "", r.ad_id, r.create_time, r.illegal_type, r.score, r.status, r.reject_reason]);
  }
  writeCsv("violations.csv", ["event_id","account_id","account_name","ad_id","create_time","illegal_type","score","status","reject_reason"], rows);
}

console.log(`\n导出目录: ${OUT}`);
