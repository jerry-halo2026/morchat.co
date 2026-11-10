#!/usr/bin/env node
// qianchian-sync CLI（v3：修复 #6 依赖过期 / #14 时区）
import { readFileSync, existsSync, writeFileSync, unlinkSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { PKG, todayInTz, minusDaysInTz, getConfig } from "./core/env.mjs";
import { runCalls, loadState, saveState } from "./core/runner.mjs";
import { pickRows } from "./core/client.mjs";

const PLUGIN_DIR = join(PKG, "plugins");
const SOURCES = ["accounts", "anchors", "plans", "uni_image", "uni_video", "uni_live", "live_video", "prod_dim", "product_dim", "overall", "oplog", "material_meta", "material_flag", "recon", "balance", "violations"];

// ── 进程互斥锁（防双进程互相吊销 token，2026-11-06 40105 风暴根因）──
const LOCK_PATH = join(PKG, "data", "sync.lock");
function pidAlive(pid) {
  try { process.kill(pid, 0); return true; }
  catch (e) { return e.code === "EPERM"; }
}
function acquireLock() {
  if (existsSync(LOCK_PATH)) {
    const pid = Number(readFileSync(LOCK_PATH, "utf8").trim());
    if (Number.isFinite(pid) && pid > 0 && pid !== process.pid && pidAlive(pid)) {
      console.error(`[LOCK] 已有同步进程 PID=${pid} 在运行，退出。双进程会互相吊销 token。`);
      process.exit(1);
    }
  }
  mkdirSync(join(PKG, "data"), { recursive: true });
  writeFileSync(LOCK_PATH, String(process.pid));
}
function releaseLock() {
  try { if (existsSync(LOCK_PATH)) unlinkSync(LOCK_PATH); } catch { /* 尽力而为 */ }
}

function readRaw(source, name) {
  const p = join(PKG, "data", "raw", source, `${name}.json`);
  return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null;
}

async function loadPlugins() {
  const plugins = {};
  for (const s of SOURCES) {
    const mod = await import(pathToFileURL(join(PLUGIN_DIR, s, "index.mjs")).href);
    plugins[s] = mod;
  }
  return plugins;
}

function buildCtx(day, mode) {
  // 指标词表的权威来源（2026-11-07 改）：
  //   此前读 qc-uni-config-20261104.json —— 那是从后台抓的，只有 10 个主题，
  //   而官方 config 接口的实际主题是 19 个（含 OVERALL_ROI_* 与 *_OTHER/ *_TITLE）。
  //   现改为优先读 scripts/fetch-topic-config.mjs 落下的 report-topics.json（官方权威）。
  const catalog = {};
  const authoritative = join(PKG, "data", "report-topics.json");
  if (existsSync(authoritative)) {
    const t = JSON.parse(readFileSync(authoritative, "utf8")).topics || {};
    for (const [topic, v] of Object.entries(t)) {
      catalog[topic] = {
        metrics: (v.metrics || []).map((m) => (typeof m === "string" ? m : m.field)),
        dimensions: (v.dims || []).map((d) => (typeof d === "string" ? d : d.field)),
      };
    }
  }
  // 兜底：老配置（若 report-topics.json 缺失或某主题未覆盖，用老词表补，不覆盖已有）
  const catalogRaw = JSON.parse(readFileSync(join(PKG, "data", "qc-uni-config-20261104.json"), "utf8"));
  for (const c of catalogRaw.data.custom_config_datas) {
    if (catalog[c.data_topic]) continue;
    catalog[c.data_topic] = {
      metrics: (c.metrics || []).map((m) => m.field),
      dimensions: (c.dimensions || []).map((d) => d.field),
    };
  }
  const extraPath = join(PKG, "data", "uni-config-extra.json");
  if (existsSync(extraPath)) {
    const extra = JSON.parse(readFileSync(extraPath, "utf8"));
    for (const [topic, v] of Object.entries(extra)) {
      if (!catalog[topic]) catalog[topic] = { metrics: v.metrics || [], dimensions: v.dimensions || [] };
    }
  }
  // 全域报表 max_day=180（qc-uni-config query_limit），超过就查不到 —— 180 是硬顶
  const full = { from: minusDaysInTz(day, 178), to: day };
  // 增量：只回看 7 天，覆盖大促期间的历史回溯修正（归因漂移多在 T+1~T+7）
  const near = { from: minusDaysInTz(day, 7), to: day };
  let window, reportWindow;
  if (mode === "backfill") {
    window = full; reportWindow = full;
  } else if (mode === "incremental") {
    // 计划清单要全窗口，否则近 7 天没消耗的老计划会从 plans 表里消失
    window = full; reportWindow = near;
  } else {
    window = { from: minusDaysInTz(day, 8), to: day }; reportWindow = window;
  }
  return { day, mode, window, reportWindow, catalog };
}

function buildAccounts() {
  const accounts = [];
  for (let p = 1; p <= 3; p++) {
    const r = readRaw("accounts", `accounts-p${p}`);
    if (r?.code === 0) for (const x of r.data.adv_id_list || []) accounts.push({ advertiser_id: x.adv_id, name: x.adv_name });
  }
  return accounts;
}

function buildAnchorMap(accounts) {
  const map = {};
  const seen = new Set();
  for (const a of accounts) {
    for (let p = 1; p <= 10; p++) {
      const r = readRaw("anchors", `anchors-${a.advertiser_id}-p${p}`);
      if (!r || r.code !== 0) continue;
      const infos = pickRows(r.data || {});
      for (const info of infos) {
        const key = `${a.advertiser_id}:${info.aweme_id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        (map[a.advertiser_id] ||= []).push({ aweme_id: info.aweme_id, aweme_name: info.aweme_name });
      }
    }
  }
  return { map, count: seen.size };
}

async function main() {
  // 参数归一化：--k=v → --k v（此前 --date=2026-11-07 会静默走默认值）
  const args = process.argv.slice(2).flatMap((a) =>
    a.startsWith("--") && a.includes("=")
      ? [a.slice(0, a.indexOf("=")), a.slice(a.indexOf("=") + 1)]
      : [a]);
  const plugins = await loadPlugins();
  const { timezone } = getConfig();

  if (args.includes("--list")) {
    for (const s of SOURCES) console.log(`${s.padEnd(12)} requires: [${plugins[s].recipe.requires.join(",")}]`);
    return;
  }
  const mode = args.includes("--backfill")
    ? "backfill"
    : args.includes("--incremental")
      ? "incremental"
      : "daily";
  // 注意：上面的归一化已把 --date=xxx 拆成 ["--date","xxx"]，所以这里不能再找 "--date=" 前缀，
  // 否则 find() 恒为空、--date 静默失效（归一化引入的连带 bug）。
  const dayIdx = args.findIndex((a) => a === "--date" || a.startsWith("--date="));
  const dayArg = dayIdx >= 0
    ? (args[dayIdx].includes("=") ? args[dayIdx].slice(7) : args[dayIdx + 1]) || todayInTz(timezone)
    : todayInTz(timezone);
  // 同时支持 --source xx 与 --source=xx（此前只认前者，传等号形式会静默跑全量 12 个源）
  const only = args.includes("--source")
    ? args[args.indexOf("--source") + 1]
    : (args.find((a) => a.startsWith("--source="))?.slice(9) || null);
  const order = only ? [only] : SOURCES;
  // --refetch <a,b,...>：旁路断点续传，强制重拉指定 source（用于修复静默坏文件）
  const refetchIdx = args.indexOf("--refetch");
  const refetchSet = new Set(refetchIdx >= 0 ? String(args[refetchIdx + 1] || "").split(",").filter(Boolean) : []);
  // --accounts <id,id,...>：只跑指定账户（用于定向回填，如素材库深度补拉）
  const accIdx = args.indexOf("--accounts");
  const onlyAccounts = accIdx >= 0 ? new Set(String(args[accIdx + 1] || "").split(",").filter(Boolean)) : null;
  if (onlyAccounts) console.log(`[filter] 仅账户: ${[...onlyAccounts].join(",")}`);

  const day = dayArg;
  const state = loadState(day);
  const ctx = buildCtx(day, mode);
  // 定向回填：预置过滤后的账户列表，后续依赖注入不会覆盖
  if (onlyAccounts) {
    ctx.accounts = buildAccounts().filter((a) => onlyAccounts.has(String(a.advertiser_id)));
    if (!ctx.accounts.length) { console.error("[filter] 没有匹配的账户，退出"); process.exit(1); }
  }

  console.log(`== qianchian-sync ${mode} plans_window=${ctx.window.from}..${ctx.window.to} report_window=${ctx.reportWindow.from}..${ctx.reportWindow.to} day=${day} tz=${timezone} ==`);
  const report = {};

  for (const s of order) {
    // 依赖注入（修复 #6：--source uni_live 单独跑时自动检查并先跑 anchors）
    if (!ctx.accounts) {
      ctx.accounts = buildAccounts();
      if (ctx.accounts.length === 0 && s !== "accounts") {
        console.log(`[deps] accounts 为空，先跑 accounts…`);
        const { calls } = await plugins.accounts.build(ctx);
        await runCalls("accounts", calls, state);
        ctx.accounts = buildAccounts();
      }
      console.log(`[deps] ${ctx.accounts.length} 账户`);
    }
    if (!ctx.anchorMap && ctx.accounts.length > 0 && (s === "uni_live" || s === "live_video" || s === "product_dim" || order.includes("uni_live") || order.includes("live_video") || order.includes("product_dim"))) {
      const { map, count } = buildAnchorMap(ctx.accounts);
      if (count === 0 && s !== "anchors") {
        console.log(`[deps] anchorMap 为空，先跑 anchors…`);
        const gen = await plugins.anchors.build(ctx);
        await runCalls("anchors", gen, state);
        const rebuilt = buildAnchorMap(ctx.accounts);
        ctx.anchorMap = rebuilt.map;
        console.log(`  → anchorMap: ${Object.keys(rebuilt.map).length} 户 / ${rebuilt.count} 主播对`);
      } else {
        ctx.anchorMap = map;
        console.log(`[deps] anchorMap: ${Object.keys(map).length} 户 / ${count} 主播对`);
      }
    }

    const result = await plugins[s].build(ctx);
    const calls = result?.calls ?? result; // 兼容 {calls:[...]} 返回和生成器/数组直返
    const callCount = typeof calls?.[Symbol.asyncIterator] === "function" ? "?" : calls?.length ?? 0;
    console.log(`[${s}] ${callCount} calls${refetchSet.has(s) ? " (refetch)" : ""}`);
    const res = await runCalls(s, calls, state, { refetch: refetchSet.has(s) });
    report[s] = res;

    // accounts/anchors 跑完后刷新 ctx
    if (s === "accounts") {
      ctx.accounts = buildAccounts();
      console.log(`  → ${ctx.accounts.length} 账户`);
    }
    if (s === "anchors") {
      const { map, count } = buildAnchorMap(ctx.accounts);
      ctx.anchorMap = map;
      console.log(`  → anchorMap: ${Object.keys(map).length} 户 / ${count} 主播对`);
    }
    saveState(state);
  }
  state.finished_at = new Date().toISOString();
  state.report = report;
  saveState(state);
  const totalOk = Object.values(report).reduce((x, r) => x + r.ok, 0);
  const totalFail = Object.values(report).reduce((x, r) => x + r.fail, 0);
  console.log(`\n== 完成: OK ${totalOk} / FAIL ${totalFail} ==`);
  writeFileSync(join(PKG, "data", "state", `report-${day}-${mode}.json`), JSON.stringify(report, null, 1), "utf8");
}

acquireLock();
main()
  .then(() => releaseLock())
  .catch((e) => { releaseLock(); console.error("[FATAL]", e); process.exit(1); });
