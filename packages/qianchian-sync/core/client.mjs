// 拉取核心：主机白名单 · envelope 判定 · 令牌桶 · 失败重试（SYNC-ENGINE §2）
// 2026-11-06 修复：token 在 retry 循环内获取（修复 #4）
import { ensureToken } from "./env.mjs";

const ALLOWED_HOSTS = new Set(["open.oceanengine.com", "ad.oceanengine.com"]);
const MIN_INTERVAL_MS = 600;
let lastCallAt = 0;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function throttle() {
  const wait = lastCallAt + MIN_INTERVAL_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastCallAt = Date.now();
}

/**
 * GET 调用（自动 urlencode）。
 * 修复 #4：token 在 retry 循环内每次重新获取——长时间退避后 token 可能已过期。
 */
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
    // 修复 #4：每次重试重新获取 token（ensureToken 内部有短路，不会重复刷新）
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
      // 频控惩罚：退避 65s 重试
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

/**
 * 带翻页的调用（修复 #5：静默数据丢失）。
 * 自动跟随 page_info 直到 total_page，每页调用一次 callOE。
 * 返回合并后的所有行。
 */
export async function callOEPaged(urlStr, params = {}, { retries = 2, maxPages = 20 } = {}) {
  const allRows = [];
  let totalPage = 1;
  for (let page = 1; page <= Math.min(totalPage, maxPages); page++) {
    const { body, ms, request_id } = await callOE(urlStr, { ...params, page }, { retries });
    if (body.code !== 0) {
      return { rows: allRows, body, ms, request_id, pagesFetched: page - 1, truncated: false };
    }
    const data = body.data || {};
    const list = data.list || data.rows || [];
    allRows.push(...list);
    const pi = data.page_info || data.pagination || {};
    totalPage = pi.total_page || pi.totalPage || 1;
    if (page === 1 && totalPage > 1) {
      console.log(`  ⚠️ 翻页: total_page=${totalPage}，继续拉取…`);
    }
  }
  const truncated = totalPage > maxPages;
  if (truncated) console.log(`  ⚠️ 达到 maxPages=${maxPages}，可能仍有未拉取数据`);
  return {
    rows: allRows, body: { code: 0 }, ms: 0, request_id: "",
    pagesFetched: Math.min(totalPage, maxPages), totalPage, truncated,
  };
}
