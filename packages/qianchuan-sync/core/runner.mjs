// 运行器：执行插件的 call 列表 → raw 落盘 + 状态记录 + 失败隔离（SYNC-ENGINE §8）
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { PKG } from "./env.mjs";
import { callOE } from "./client.mjs";

const RAW_DIR = join(PKG, "data", "raw");
const STATE_DIR = join(PKG, "data", "state");

function statePath(day) { return join(STATE_DIR, `sync-${day}.json`); }

export function loadState(day) {
  const p = statePath(day);
  if (existsSync(p)) return JSON.parse(readFileSync(p, "utf8"));
  return { day, started_at: new Date().toISOString(), pulls: [], issues: [] };
}

export function saveState(state) {
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(statePath(state.day), JSON.stringify(state, null, 1), "utf8");
}

/**
 * 执行一个插件。calls: [{name, url, params, meta?}]
 * 每个 call 独立容错（毒丸隔离）；raw 存 data/raw/<source>/<name>.json
 */
export async function runCalls(source, calls, state, { onPage = null } = {}) {
  let ok = 0, fail = 0, rows = 0;
  mkdirSync(join(RAW_DIR, source), { recursive: true });
  for (const c of calls) {
    const { body, ms, request_id } = await callOE(c.url, c.params);
    const entry = { source, name: c.name, code: body.code, ms, request_id, ts: new Date().toISOString() };
    if (body.code === 0) {
      ok++;
      writeFileSync(join(RAW_DIR, source, `${c.name}.json`), JSON.stringify(body, null, 1), "utf8");
      const data = body.data || {};
      const list = data.list || data.rows || data.adv_id_list || data.ad_list || data.authorization_infos || data.adv_score_event || [];
      if (Array.isArray(list)) rows += list.length;
      entry.rows = list.length;
    } else {
      fail++;
      entry.message = String(body.message || "").slice(0, 200);
      state.issues.push(entry);
    }
    state.pulls.push(entry);
    process.stdout.write(`  [${source}] ${c.name} → ${body.code === 0 ? "OK" : "FAIL " + entry.message} (${ms}ms)\n`);
  }
  return { ok, fail, rows, total: calls.length };
}
