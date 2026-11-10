// 拉取核心：主机白名单 · envelope 判定 · 令牌桶 · 失败重试 · 翻页（SYNC-ENGINE §2）
// 2026-11-06 v2：修复 #4 token循环内 / #5 翻页 / #10 节流可配
import { ensureToken, getConfig, invalidateToken } from "./env.mjs";

const ALLOWED_HOSTS = new Set(["open.oceanengine.com", "ad.oceanengine.com"]);
let lastCallAt = 0;

// ── 精度保护（2026-11-07）─────────────────────────────────────────────
// 千川的 ID（material_id / ad_id / product_id / aweme_id）是 19 位整数，
// 远超 JS 安全整数上限 9007199254740991（16 位）。直接 JSON.parse 会把
//   7705286888558821386 → 7705286888558821000
// 静默失真：不报错、不告警，但两个不同素材可能被舍入成同一个值。
//
// 报表接口用 ValueStr 返回 ID，所以库里 dim_id 一直是精确的；素材库接口
// 用数字返回，就会失真 —— 两边 ID 对不上，join 必然失败。必须在 parse
// 之前把超长整数改写成字符串。
//
// 用状态机而不是正则：正则 /:(\d{16,})/ 会误伤字符串字面量里的数字。
export function safeJsonParse(text) {
  if (typeof text !== "string" || text.length === 0) return JSON.parse(text);
  let out = "";
  let i = 0;
  let inStr = false;
  const n = text.length;
  while (i < n) {
    const ch = text[i];
    if (inStr) {
      out += ch;
      if (ch === "\\") { out += text[i + 1] ?? ""; i += 2; continue; }
      if (ch === '"') inStr = false;
      i++;
      continue;
    }
    if (ch === '"') { inStr = true; out += ch; i++; continue; }
    if (ch === "-" || (ch >= "0" && ch <= "9")) {
      // 必须把整个 JSON number 一次吞掉（符号 + 整数 + 小数 + 指数），
      // 否则 "ratio":0.5622720166753518 里的小数部分会被当成独立整数再进一次
      // 本分支，因 17 位 ≥ 16 被加引号，拼出 0."5622..." 这种非法 JSON。
      let j = i;
      if (text[j] === "-") j++;
      const ds = j;
      while (j < n && text[j] >= "0" && text[j] <= "9") j++;
      const intLen = j - ds;
      let isFloat = false;
      if (text[j] === ".") {
        isFloat = true;
        j++;
        while (j < n && text[j] >= "0" && text[j] <= "9") j++;
      }
      if (text[j] === "e" || text[j] === "E") {
        isFloat = true;
        j++;
        if (text[j] === "+" || text[j] === "-") j++;
        while (j < n && text[j] >= "0" && text[j] <= "9") j++;
      }
      const numStr = text.slice(i, j);
      if (!isFloat && intLen >= 16) out += '"' + numStr + '"';
      else out += numStr;
      i = j;
      continue;
    }
    out += ch;
    i++;
  }
  return JSON.parse(out);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function throttle() {
  const { throttleMs } = getConfig();
  const wait = lastCallAt + throttleMs - Date.now();
  if (wait > 0) await sleep(wait);
  lastCallAt = Date.now();
}

export async function callOE(urlStr, params = {}, { retries = 2, timeoutMs = 0 } = {}) {
  const u = new URL(urlStr);
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error(`协议禁止: ${urlStr}`);
  if (!ALLOWED_HOSTS.has(u.hostname)) throw new Error(`主机不在白名单: ${u.hostname}`);
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    u.searchParams.set(k, typeof v === "string" ? v : JSON.stringify(v));
  }
  // 修复 #27：此前 fetch 没有任何超时 —— 单个请求挂住就会把整轮同步拖死。
  // 证据：2026-11-06 全量跑里出现过 2984 秒（50 分钟）的调用间隔，全程无报错。
  if (!timeoutMs) timeoutMs = getConfig().requestTimeoutMs;
  let lastErr = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const token = await ensureToken();
    await throttle();
    const t0 = Date.now();
    try {
      const res = await fetch(u, { headers: { "Access-Token": token }, signal: AbortSignal.timeout(timeoutMs) });
      const text = await res.text();
      let body;
      try { body = safeJsonParse(text); } catch { body = { code: -1, message: text.slice(0, 200) }; }
      const ms = Date.now() - t0;
      if (!res.ok && res.status >= 500 && attempt < retries) { lastErr = `HTTP ${res.status}`; await sleep(1000 * (attempt + 1)); continue; }
      if (body.code === undefined && text.startsWith("<")) { body = { code: -2, message: "非 JSON 响应(HTML)", raw: text.slice(0, 120) }; }
      // 40105 = token 已被吊销（典型：另一进程刷新过）→ 强制刷新后重试
      if (body.code === 40105 && attempt < retries) {
        lastErr = `40105: ${body.message}`;
        invalidateToken();
        await sleep(2000);
        continue;
      }
      if (body.code !== 0 && /频率超限|rate.?limit/i.test(String(body.message)) && attempt < retries) {
        lastErr = `频控: ${body.message}`;
        await sleep(65000);
        continue;
      }
      return { body, ms, url: u.toString(), request_id: body.request_id || "" };
    } catch (e) {
      lastErr = String(e.message || e);
      if (attempt < retries) { await sleep(1000 * (attempt + 1)); continue; }
    }
  }
  return { body: { code: -3, message: `网络失败: ${lastErr}` }, ms: 0, url: u.toString(), request_id: "" };
}

// 修复 #23：行数组提取统一入口（Ethan 发现于 export-flat，收编为唯一实现）
// 两个陷阱：
// 1) 空数组 [] 是 truthy，`a || b || c` 回退链会提前命中空表；
// 2) accounts 接口的 data.list 是裸 ID 数组，带名字的对象在 data.adv_id_list——
//    必须跳过非对象数组，否则 r.adv_id 全是 undefined（account_name 全空的根因）。
export function pickRows(data = {}) {
  const KEYS = ["list", "rows", "ad_list", "adv_score_event", "adv_id_list", "authorization_infos", "logs", "carousels", "product_list"];
  for (const k of KEYS) {
    const a = data[k];
    if (Array.isArray(a) && a.length > 0 && typeof a[0] === "object" && a[0] !== null) return a;
  }
  for (const k of KEYS) {
    const a = data[k];
    if (Array.isArray(a) && a.length === 0) return a; // 合法空结果
  }
  return [];
}

export async function callOEPaged(urlStr, params = {}, { retries = 2, maxPages = 0, stopWhen = null } = {}) {
  // 修复 #22：maxPages 曾硬编码 50 → 3 个 uni_video 文件截断丢 ~13,800 行
  // 现默认跟随接口 total_page 翻完；SYNC_MAX_PAGES 仅作异常兜底（默认 1000 页 = 20 万行）
  // stopWhen(rows)：每页拉完后回调，返回 true 则主动停止（如「整页素材都早于 cutoff」），
  // 返回 stopped=true 区别于 truncated（截断=可能丢数据，停止=确认无新数据）。
  if (!maxPages) maxPages = getConfig().maxPages;
  const allRows = [];
  let totalPage = 1;
  for (let page = 1; page <= Math.min(totalPage, maxPages); page++) {
    const { body } = await callOE(urlStr, { ...params, page }, { retries });
    if (body.code !== 0) {
      // 中途失败不该把已拉到的数据全丢掉。
      // 实例：video/get 有「最多只能请求前 10000 条」的硬限制，素材库 14,743 个的账户
      // 翻到第 101 页必报 40000 —— 旧逻辑连前 100 页（=10000 条）一起丢弃，该户归零。
      if (allRows.length > 0) {
        console.log(`  ⚠️ 第 ${page} 页失败(code=${body.code}: ${String(body.message || "").slice(0, 40)})，保留已拉 ${allRows.length} 行`);
        return {
          rows: allRows, body: { code: 0, partial: true }, ms: 0, request_id: "",
          pagesFetched: page - 1, totalPage, truncated: true, partial: true, lastError: body.message,
        };
      }
      return { rows: allRows, body, ms: 0, request_id: "", pagesFetched: page - 1, truncated: false };
    }
    const data = body.data || {};
    allRows.push(...pickRows(data)); // 修复 #17/#21/#23：键名各异 + 空数组不可遮蔽真行键
    if (stopWhen && allRows.length > 0 && stopWhen(allRows)) {
      return { rows: allRows, body: { code: 0 }, ms: 0, request_id: "", pagesFetched: page, totalPage, truncated: false, stopped: true };
    }
    const pi = data.page_info || data.pagination || {};
    totalPage = pi.total_page || pi.totalPage || 1;
    if (page === 1 && totalPage > 1) {
      console.log(`  ⚠️ 翻页: total_page=${totalPage}`);
    }
  }
  const truncated = totalPage > maxPages;
  if (truncated) console.log(`  ⚠️ 达到 maxPages=${maxPages}，可能仍有数据`);
  return { rows: allRows, body: { code: 0 }, ms: 0, request_id: "", pagesFetched: Math.min(totalPage, maxPages), totalPage, truncated };
}
