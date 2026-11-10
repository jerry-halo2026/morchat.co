// 运行器：插件执行 → raw 版本化落盘 + 状态 + 失败隔离 + 状态压缩 + 空页停止
// 2026-11-06 v3：修复 #5 翻页 / #7 空页停止 / #8 生成器 / #11 状态压缩
// 2026-11-07 v5（磁盘治理）：无缩进序列化 + 剥离签名 URL + 版本滚动保留 + latest 硬链接
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, statSync, unlinkSync, linkSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { PKG, getConfig } from "./env.mjs";
import { callOE, callOEPaged, pickRows } from "./client.mjs";

const RAW_DIR = join(PKG, "data", "raw");
const STATE_DIR = join(PKG, "data", "state");

/** 断点续传：检查已有数据是否覆盖当前请求的时间窗口 */
// 2026-11-07 v4（修复 #24）：原实现 `return Array.isArray(pickRows(...))` 恒为 true ——
// 只要文件存在就 SKIP，daily/incremental 模式实际永远拉不到新数据（"增量"是假的）。
// 现改为真新鲜度判定：数据里最大的 stat_time_day >= 请求窗口 end_time 才认为已覆盖。
function lastStatDate(j) {
  const rows = pickRows(j?.data || {});
  let max = "";
  for (const r of rows) {
    const d = r?.dimensions?.stat_time_day;
    const s = d?.ValueStr ?? d?.Value;
    if (typeof s === "string" && s.length >= 10 && s > max) max = s.slice(0, 10);
  }
  return max;
}

function isWithinWindow(existing, params) {
  // 无时间参数（accounts/anchors/balance/violations）：靠 c.noCache 决定是否强制刷新
  // 注意：报表类插件用 start_time/end_time，而对账接口（recon）用 start_date/end_date。
  // 只认前者会让后者恒判「已覆盖」，90 个调用永久 SKIP —— 必须两种都识别。
  const from = params?.start_time ?? params?.start_date;
  if (!from) return true;
  const endDate = String(params?.end_time ?? params?.end_date ?? "").slice(0, 10);
  if (!endDate) return true;
  const last = lastStatDate(existing);
  // 无日期维度（plans）或窗口内本就无数据 → 视为未覆盖，重拉
  return !!last && last >= endDate;
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
  writeFileSync(statePath(state.day), JSON.stringify(state), "utf8");
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

    // ── 断点续传：已有文件且窗口已覆盖 → 跳过（--refetch 可旁路）──
    const latestPath = join(RAW_DIR, source, `${c.name}.json`);
    if (!opts.refetch && !c.noCache && existsSync(latestPath)) {
      try {
        const existing = JSON.parse(readFileSync(latestPath, "utf8"));
        // 修复 #22 配套：截断文件（truncated:true）不算完成，下轮自动重拉
        if (existing.code === 0 && !existing.data?.truncated) {
          // 检查数据时间戳是否在当前窗口内（增量模式下旧数据要重拉）
          const hasRange = c.params?.start_time || c.params?.start_date;
          if (!hasRange || isWithinWindow(existing, c.params)) {
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
      // 部分接口单页上限很小（操作日志 page_size ≤ 20）、总量巨大（单计划可 700+ 条），
      // 允许调用方用 maxPages 封顶，避免一个调用打几十页。
      const result = await callOEPaged(c.url, c.params, c.maxPages || c.stopWhen ? { maxPages: c.maxPages, stopWhen: c.stopWhen } : {});
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
  // 2026-11-07 v5：原 ts 用 slice(0,15) 会带上 toISOString 的小数点 → 文件名成了
  // `xxx--20261107105428..json`（双点）。改成 14 位秒级，文件名干净。
  const ts = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
  const cfg = getConfig();
  let payload = body;
  // 签名 URL（x-expires/x-signature）过期即废：素材库 6.3 万条 × 约 1KB ≈ 60MB 纯垃圾。
  // 只对超长字符串做特征判定，避免为 100 万行报表付遍历成本。
  if (cfg.stripSignedUrls) {
    try { stripSigned(payload); } catch { /* 结构异常则按原样落盘 */ }
  }
  try {
    const verPath = join(verDir, `${name}--${ts}.json`);
    writeFileSync(verPath, JSON.stringify(payload), "utf8");
    // latest 优先用硬链接指向版本文件：同一 inode 不占额外空间。
    // 原实现是完整再写一遍，等于每份数据存两遍（根目录 1.37G 与 versions 最新份完全重复）。
    linkOrCopy(verPath, join(RAW_DIR, source, `${name}.json`));
    pruneVersions(verDir, name, cfg.keepVersions);
  } catch (e) {
    console.error(`  ⚠️ 写盘失败 [${source}/${name}]: ${e.message}`);
  }
}

/** 原地剥离签名 URL 字符串（带 x-expires / x-signature 特征且超长的） */
function stripSigned(node) {
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) {
      const v = node[i];
      if (typeof v === "string") {
        if (v.length > 200 && (v.includes("x-expires=") || v.includes("x-signature="))) {
          node[i] = `[signed-url-omitted:${v.length}B]`;
        }
      } else if (v && typeof v === "object") stripSigned(v);
    }
    return;
  }
  if (node && typeof node === "object") {
    for (const k of Object.keys(node)) {
      const v = node[k];
      if (typeof v === "string") {
        if (v.length > 200 && (v.includes("x-expires=") || v.includes("x-signature="))) {
          node[k] = `[signed-url-omitted:${v.length}B]`;
        }
      } else if (v && typeof v === "object") stripSigned(v);
    }
  }
}

/** 硬链接优先，跨卷/权限不足时降级为复制 */
function linkOrCopy(src, dst) {
  try {
    if (existsSync(dst)) unlinkSync(dst);
    linkSync(src, dst);
  } catch {
    copyFileSync(src, dst);
  }
}

/** 版本滚动保留：同一 name 只留最近 keep 份，超出按 mtime 从旧到新删除 */
function pruneVersions(verDir, name, keep) {
  if (keep <= 0) return;
  try {
    const prefix = `${name}--`;
    const files = readdirSync(verDir).filter((f) => f.startsWith(prefix) && f.endsWith(".json"));
    if (files.length <= keep) return;
    const sorted = files
      .map((f) => ({ f, m: statSync(join(verDir, f)).mtimeMs }))
      .sort((a, b) => b.m - a.m);
    for (const { f } of sorted.slice(keep)) {
      try { unlinkSync(join(verDir, f)); } catch { /* 已被并发删除 */ }
    }
  } catch { /* 目录不可读则跳过，不影响主流程 */ }
}
