#!/usr/bin/env node
// qianchuan-sync CLI 入口（SYNC-ENGINE §5）
// 用法:
//   node run.mjs --list
//   node run.mjs --source accounts [--date 2026-11-05]
//   node run.mjs --all                    # 全部源（今日窗口）
//   node run.mjs --backfill               # 180 天窗口全量
import { readdirSync, readFileSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { PKG } from "./core/env.mjs";
import { runCalls, loadState, saveState } from "./core/runner.mjs";

const PLUGIN_DIR = join(PKG, "plugins");
const SOURCES = ["accounts", "anchors", "plans", "uni_image", "uni_video", "uni_live", "balance", "violations"];

function todayStr() {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10); // Asia/Shanghai
}
function minusDays(ds, n) {
  const d = new Date(ds + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
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
  // 词表目录：uni config 存档（指标全集）
  const catalogRaw = JSON.parse(readFileSync(join(PKG, "data", "qc-uni-config-20261104.json"), "utf8"));
  const catalog = {};
  for (const c of catalogRaw.data.custom_config_datas) {
    catalog[c.data_topic] = {
      metrics: (c.metrics || []).map((m) => m.field),
      dimensions: (c.dimensions || []).map((d) => d.field),
    };
  }
  const window = mode === "backfill"
    ? { from: minusDays(day, 178), to: day }   // 180 天窗内留安全余量
    : { from: minusDays(day, 8), to: day };    // 日常=漂移 8 天窗
  return { day, window, catalog };
}

async function main() {
  const args = process.argv.slice(2);
  const plugins = await loadPlugins();

  if (args.includes("--list")) {
    for (const s of SOURCES) console.log(`${s.padEnd(12)} requires: [${plugins[s].recipe.requires.join(",")}]  schedule: ${plugins[s].recipe.schedule}`);
    return;
  }
  const mode = args.includes("--backfill") ? "backfill" : "daily";
  const dayArg = args.find((a) => a.startsWith("--date="))?.slice(7) || todayStr();
  const only = args.includes("--source") ? args[args.indexOf("--source") + 1] : null;
  const order = only ? [only] : SOURCES;

  const day = dayArg;
  const state = loadState(day);
  const ctx = buildCtx(day, mode);

  console.log(`== qianchuan-sync ${mode} window=${ctx.window.from}..${ctx.window.to} day=${day} ==`);
  const report = {};
  for (const s of order) {
    // 依赖数据注入（accounts 归一化：adv_id → advertiser_id）
    if (!ctx.accounts) {
      ctx.accounts = [];
      for (let p = 1; p <= 3; p++) {
        const r = readRaw("accounts", `accounts-p${p}`);
        if (r?.code === 0) for (const x of r.data.adv_id_list || []) ctx.accounts.push({ advertiser_id: x.adv_id, name: x.adv_name });
      }
    }
    if (!ctx.anchorMap && ctx.accounts) {
      ctx.anchorMap = {};
      const seen = new Set();
      for (const a of ctx.accounts) {
        for (let p = 1; p <= 4; p++) {
          const r = readRaw("anchors", `anchors-${a.advertiser_id}-p${p}`);
          if (!r || r.code !== 0) continue;
          for (const info of r.data.authorization_infos || []) {
            const key = `${a.advertiser_id}:${info.aweme_id}`;
            if (seen.has(key)) continue;
            seen.add(key);
            (ctx.anchorMap[a.advertiser_id] ||= []).push({ aweme_id: info.aweme_id, aweme_name: info.aweme_name });
          }
        }
      }
    }
    if (s === "accounts" && !ctx.accounts) {
      // 先跑 accounts 自身
    }
    const { calls } = await plugins[s].build(ctx);
    console.log(`[${s}] ${calls.length} calls`);
    const res = await runCalls(s, calls, state);
    report[s] = res;
    // accounts 跑完立即注入 ctx（供后续源）
    if (s === "accounts") {
      ctx.accounts = [];
      for (let p = 1; p <= 3; p++) {
        const r = readRaw("accounts", `accounts-p${p}`);
        if (r?.code === 0) for (const x of r.data.adv_id_list || []) ctx.accounts.push({ advertiser_id: x.adv_id, name: x.adv_name });
      }
      console.log(`  → ${ctx.accounts.length} 账户`);
    }
    if (s === "anchors") {
      // anchors 跑完立即构建 anchorMap（防止空对象被缓存）
      ctx.anchorMap = {};
      const seen = new Set();
      for (const a of ctx.accounts || []) {
        for (let p = 1; p <= 4; p++) {
          const r = readRaw("anchors", `anchors-${a.advertiser_id}-p${p}`);
          if (!r || r.code !== 0) continue;
          for (const info of r.data.authorization_infos || []) {
            const key = `${a.advertiser_id}:${info.aweme_id}`;
            if (seen.has(key)) continue;
            seen.add(key);
            (ctx.anchorMap[a.advertiser_id] ||= []).push({ aweme_id: info.aweme_id, aweme_name: info.aweme_name });
          }
        }
      }
      console.log(`  → anchorMap: ${Object.keys(ctx.anchorMap).length} 户 / ${seen.size} 主播对`);
    }
    saveState(state);
  }
  state.finished_at = new Date().toISOString();
  state.report = report;
  saveState(state);
  const totalOk = Object.values(report).reduce((x, r) => x + r.ok, 0);
  const totalFail = Object.values(report).reduce((x, r) => x + r.fail, 0);
  console.log(`\n== 完成: OK ${totalOk} / FAIL ${totalFail}，issues=${state.issues.length} ==`);
  writeFileSync(join(PKG, "data", "state", `report-${day}-${mode}.json`), JSON.stringify(report, null, 1), "utf8");
}

main().catch((e) => { console.error("[FATAL]", e); process.exit(1); });
