#!/usr/bin/env node
// qianchuan-sync CLI（v3：修复 #6 依赖过期 / #14 时区）
import { readFileSync, existsSync, writeFileSync, unlinkSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { PKG, todayInTz, minusDaysInTz, getConfig } from "./core/env.mjs";
import { runCalls, loadState, saveState } from "./core/runner.mjs";
import { pickRows } from "./core/client.mjs";

const PLUGIN_DIR = join(PKG, "plugins");
const SOURCES = ["accounts", "anchors", "plans", "uni_image", "uni_video", "uni_live", "balance", "violations"];

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
  const catalogRaw = JSON.parse(readFileSync(join(PKG, "data", "qc-uni-config-20261104.json"), "utf8"));
  const catalog = {};
  for (const c of catalogRaw.data.custom_config_datas) {
    catalog[c.data_topic] = {
      metrics: (c.metrics || []).map((m) => m.field),
      dimensions: (c.dimensions || []).map((d) => d.field),
    };
  }
  const window = mode === "backfill"
    ? { from: minusDaysInTz(day, 178), to: day }
    : { from: minusDaysInTz(day, 8), to: day };
  return { day, window, catalog };
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
  const args = process.argv.slice(2);
  const plugins = await loadPlugins();
  const { timezone } = getConfig();

  if (args.includes("--list")) {
    for (const s of SOURCES) console.log(`${s.padEnd(12)} requires: [${plugins[s].recipe.requires.join(",")}]`);
    return;
  }
  const mode = args.includes("--backfill") ? "backfill" : "daily";
  const dayArg = args.find((a) => a.startsWith("--date="))?.slice(7) || todayInTz(timezone);
  const only = args.includes("--source") ? args[args.indexOf("--source") + 1] : null;
  const order = only ? [only] : SOURCES;
  // --refetch <a,b,...>：旁路断点续传，强制重拉指定 source（用于修复静默坏文件）
  const refetchIdx = args.indexOf("--refetch");
  const refetchSet = new Set(refetchIdx >= 0 ? String(args[refetchIdx + 1] || "").split(",").filter(Boolean) : []);

  const day = dayArg;
  const state = loadState(day);
  const ctx = buildCtx(day, mode);

  console.log(`== qianchuan-sync ${mode} window=${ctx.window.from}..${ctx.window.to} day=${day} tz=${timezone} ==`);
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
    if (!ctx.anchorMap && ctx.accounts.length > 0 && (s === "uni_live" || order.includes("uni_live"))) {
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
