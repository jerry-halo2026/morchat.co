// 运行器：执行插件的 call 列表 → raw 落盘 + 状态记录 + 失败隔离（SYNC-ENGINE §8）
// 2026-11-06 修复：翻页支持 / 版本化存储 / 插件支持生成器模式（修复 #5 #7 #8）
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { PKG } from "./env.mjs";
import { callOE, callOEPaged } from "./client.mjs";

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
 * 执行一个插件。支持两种模式：
 * 1. calls 数组（兼容旧插件）：[{name, url, params, paged?}]
 * 2. 生成器（新插件）：yield {name, url, params, paged?} — 可根据前一个结果动态决定后续调用
 *
 * paged: true 时自动翻页（修复 #5）
 */
export async function runCalls(source, callsOrGenerator, state) {
  let ok = 0, fail = 0, rows = 0;
  const isGen = typeof callsOrGenerator?.[Symbol.asyncIterator] === "function";
  const items = isGen ? callsOrGenerator : callsOrGenerator;

  mkdirSync(join(RAW_DIR, source), { recursive: true });
  const verDir = join(RAW_DIR, source, "versions");
  mkdirSync(verDir, { recursive: true });

  let callSpec = null;
  const iterator = isGen ? items[Symbol.asyncIterator]() : null;
  let arrayIdx = 0;
  const array = isGen ? null : items;

  while (true) {
    // 取下一个 call spec
    if (isGen) {
      const { value, done } = await iterator.next();
      if (done) break;
      callSpec = value;
    } else {
      if (arrayIdx >= array.length) break;
      callSpec = array[arrayIdx++];
    }
    if (!callSpec) break;
    const c = callSpec;

    // 执行（支持翻页）
    let result;
    if (c.paged) {
      result = await callOEPaged(c.url, c.params);
      if (result.body.code === 0) {
        // 翻页成功：合并行写入一个文件
        const fakeBody = { code: 0, message: "OK", data: { rows: result.rows, pagesFetched: result.pagesFetched, totalPage: result.totalPage } };
        writeResult(source, c.name, fakeBody, verDir);
        ok++;
        rows += result.rows.length;
        state.pulls.push({ source, name: c.name, code: 0, ms: 0, rows: result.rows.length, pages: result.pagesFetched, truncated: result.truncated, ts: new Date().toISOString() });
        process.stdout.write(`  [${source}] ${c.name} → OK (${result.rows.length}行, ${result.pagesFetched}页${result.truncated ? ', 截断!' : ''})\n`);
        continue;
      }
    }

    const { body, ms, request_id } = await callOE(c.url, c.params);
    const entry = { source, name: c.name, code: body.code, ms, request_id, ts: new Date().toISOString() };
    if (body.code === 0) {
      ok++;
      const ts = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 15);
      writeFileSync(join(verDir, `${c.name}--${ts}.json`), JSON.stringify(body, null, 1), "utf8");
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
  return { ok, fail, rows, total: ok + fail };
}

function writeResult(source, name, body, verDir) {
  const ts = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 15);
  writeFileSync(join(verDir, `${name}--${ts}.json`), JSON.stringify(body, null, 1), "utf8");
  writeFileSync(join(RAW_DIR, source, `${name}.json`), JSON.stringify(body, null, 1), "utf8");
}
