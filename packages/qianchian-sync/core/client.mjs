// 拉取核心：主机白名单 · envelope 判定 · 令牌桶 · 失败重试 · 翻页（SYNC-ENGINE §2）
// 2026-11-06 v2：修复 #4 token循环内 / #5 翻页 / #10 节流可配
import { ensureToken, getConfig, invalidateToken } from "./env.mjs";

const ALLOWED_HOSTS = new Set(["open.oceanengine.com", "ad.oceanengine.com"]);
let lastCallAt = 0;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function throttle() {
  const { throttleMs } = getConfig();
  const wait = lastCallAt + throttleMs - Date.now();
  if (wait > 0) await sleep(wait);
  lastCallAt = Date.now();
}

export async function callOE(urlStr, params = {}, { retries = 2 } = {}) {
  const u = new URL(urlStr);
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error(`协议禁止: ${urlStr}`);
  if (!ALLOWED_HOSTS.has(u.hostname)) throw new Error(`主机不在白名单: ${u.hostname}`);
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    u.searchParams.set(k, typeof v === "string" ? v : JSON.stringify(v));
  }
  let lastErr = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const token = await ensureToken();
    await throttle();
    const t0 = Date.now();
    try {
      const res = await fetch(u, { headers: { "Access-Token": token } });
      const text = await res.text();
      let body;
      try { body = JSON.parse(text); } catch { body = { code: -1, message: text.slice(0, 200) }; }
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
  const KEYS = ["list", "rows", "ad_list", "adv_score_event", "adv_id_list", "authorization_infos"];
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

export async function callOEPaged(urlStr, params = {}, { retries = 2, maxPages = 0 } = {}) {
  // 修复 #22：maxPages 曾硬编码 50 → 3 个 uni_video 文件截断丢 ~13,800 行
  // 现默认跟随接口 total_page 翻完；SYNC_MAX_PAGES 仅作异常兜底（默认 1000 页 = 20 万行）
  if (!maxPages) maxPages = getConfig().maxPages;
  const allRows = [];
  let totalPage = 1;
  for (let page = 1; page <= Math.min(totalPage, maxPages); page++) {
    const { body } = await callOE(urlStr, { ...params, page }, { retries });
    if (body.code !== 0) {
      return { rows: allRows, body, ms: 0, request_id: "", pagesFetched: page - 1, truncated: false };
    }
    const data = body.data || {};
    allRows.push(...pickRows(data)); // 修复 #17/#21/#23：键名各异 + 空数组不可遮蔽真行键
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
