// 运行器：插件执行 → raw 版本化落盘 + 状态 + 失败隔离 + 状态压缩 + 空页停止
// 2026-11-06 v3：修复 #5 翻页 / #7 空页停止 / #8 生成器 / #11 状态压缩
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { PKG, getConfig } from "./env.mjs";
import { callOE, callOEPaged, pickRows } from "./client.mjs";

const RAW_DIR = join(PKG, "data", "raw");
const STATE_DIR = join(PKG, "data", "state");

/** 断点续传：检查已有数据是否覆盖当前请求的时间窗口 */
function isWithinWindow(existing, params) {
  // 无时间参数的调用（如 balance、accounts）始终跳过
  if (!params?.start_time) return true;
  // 有时间参数：检查已有数据的最后时间戳是否 >= 请求的 start_time
  // 简化处理：如果有行数组（含合法空结果），视为有效（精确窗口比对留给 fact 层）
  return Array.isArray(pickRows(existing.data || {}));
}

function statePath(day) { return join(STATE_DIR, `sync-${day}.json`); }

export function loadState(day) {
  const p = statePath(day);
  if (existsSync(p)) return JSON.parse(readFileSync(p, "utf8"));
  return { day, started_at: new Date().toISOString(), pulls: [], issues: [] };
}

export function saveState(state) {
  // 修复 #11：压缩 pulls 数组，只保留最近 N 条
  const { maxStateEntries } = getConfig();
  if (state.pulls.length > maxStateEntries) {
    const dropped = state.pulls.length - maxStateEntries;
    state.pulls = state.pulls.slice(-maxStateEntries);
    state.pullsCompacted = (state.pullsCompacted || 0) + dropped;
  }
  if (state.issues.length > 200) {
    state.issues = state.issues.slice(-200);
  }
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(statePath(state.day), JSON.stringify(state, null, 1), "utf8");
}

export async function runCalls(source, callsOrGenerator, state, opts = {}) {
  let ok = 0, fail = 0, rows = 0;
  const isGen = typeof callsOrGenerator?.[Symbol.asyncIterator] === "function";

  mkdirSync(join(RAW_DIR, source), { recursive: true });
  const verDir = join(RAW_DIR, source, "versions");
  mkdirSync(verDir, { recursive: true });

  const iterator = isGen ? callsOrGenerator[Symbol.asyncIterator]() : null;
  const array = isGen ? null : callsOrGenerator;
  let arrayIdx = 0;
  let skipUntilNextAccount = false; // 空页停止标记
  let currentAccountPrefix = "";

  while (true) {
    let c;
    if (isGen) {
      const { value, done } = await iterator.next();
      if (done) break;
      c = value;
    } else {
      if (arrayIdx >= array.length) break;
      c = array[arrayIdx++];
    }
    if (!c) break;

    // ── 断点续传：已有文件且同窗口 → 跳过（--refetch 可旁路）──
    const latestPath = join(RAW_DIR, source, `${c.name}.json`);
    if (!opts.refetch && existsSync(latestPath)) {
      try {
        const existing = JSON.parse(readFileSync(latestPath, "utf8"));
        // 修复 #22 配套：截断文件（truncated:true）不算完成，下轮自动重拉
        if (existing.code === 0 && !existing.data?.truncated) {
          // 检查数据时间戳是否在当前窗口内（增量模式下旧数据要重拉）
          if (!c.params?.start_time || isWithinWindow(existing, c.params)) {
            ok++;
            const data = existing.data || {};
            const list = pickRows(data);
            rows += Array.isArray(list) ? list.length : 0;
            process.stdout.write(`  [${source}] ${c.name} → SKIP (已有)\n`);
            continue;
          }
        }
      } catch { /* 文件损坏则重拉 */ }
    }

    // 空页停止逻辑（修复 #7）：如果上一页为空且当前调用标记了 stopIfEmpty，检查是否同户
    if (skipUntilNextAccount && c.name) {
      const accountPart = c.name.split("-").slice(0, 2).join("-");
      if (accountPart === currentAccountPrefix) {
        continue; // 跳过同户后续页
      }
      skipUntilNextAccount = false; // 换户了，重置
    }
    if (c.name) currentAccountPrefix = c.name.split("-").slice(0, 2).join("-");

    // 翻页调用（修复 #5）
    if (c.paged) {
      const result = await callOEPaged(c.url, c.params);
      if (result.body.code === 0) {
        const fakeBody = { code: 0, message: "OK", data: { rows: result.rows, pagesFetched: result.pagesFetched, totalPage: result.totalPage, truncated: result.truncated } };
        writeResult(source, c.name, fakeBody, verDir);
        ok++; rows += result.rows.length;
        state.pulls.push({ source, name: c.name, code: 0, rows: result.rows.length, pages: result.pagesFetched, truncated: result.truncated, ts: new Date().toISOString() });
        process.stdout.write(`  [${source}] ${c.name} → OK (${result.rows.length}行, ${result.pagesFetched}页${result.truncated ? ", 截断!" : ""})\n`);
      } else {
        fail++;
        state.issues.push({ source, name: c.name, code: result.body.code, message: String(result.body.message || "").slice(0, 200), ts: new Date().toISOString() });
      }
      continue;
    }

    // 普通调用
    const { body, ms, request_id } = await callOE(c.url, c.params);
    const entry = { source, name: c.name, code: body.code, ms, request_id, ts: new Date().toISOString() };
    if (body.code === 0) {
      ok++;
      writeResult(source, c.name, body, verDir);
      const data = body.data || {};
      const list = pickRows(data);
      const rowCount = Array.isArray(list) ? list.length : 0;
      rows += rowCount;
      entry.rows = rowCount;
      // 空页停止检查（修复 #7）
      if (c.stopIfEmpty && rowCount === 0) {
        skipUntilNextAccount = true;
      }
    } else {
      fail++;
      entry.message = String(body.message || "").slice(0, 200);
      state.issues.push(entry);
    }
    state.pulls.push(entry);
    process.stdout.write(`  [${source}] ${c.name} → ${body.code === 0 ? `OK(${entry.rows ?? ''})` : "FAIL " + entry.message} (${ms}ms)\n`);
  }
  return { ok, fail, rows, total: ok + fail };
}

function writeResult(source, name, body, verDir) {
  const ts = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 15);
  try {
    writeFileSync(join(verDir, `${name}--${ts}.json`), JSON.stringify(body, null, 1), "utf8");
    writeFileSync(join(RAW_DIR, source, `${name}.json`), JSON.stringify(body, null, 1), "utf8");
  } catch (e) {
    console.error(`  ⚠️ 写盘失败 [${source}/${name}]: ${e.message}`);
  }
}
