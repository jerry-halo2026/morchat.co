// 拉取核心：主机白名单 · envelope 判定 · 令牌桶 · 失败重试（SYNC-ENGINE §2）
import { ensureToken } from "./env.mjs";

const ALLOWED_HOSTS = new Set(["open.oceanengine.com", "ad.oceanengine.com"]); // 仅公网官方域，禁内网/环回
const MIN_INTERVAL_MS = 600; // 全局串行 ~3.5 QPS（保守起步，计数实测后调）
let lastCallAt = 0;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function throttle() {
  const wait = lastCallAt + MIN_INTERVAL_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastCallAt = Date.now();
}

/** GET 调用（自动 urlencode）。返回完整 envelope。重试：网络错误/5xx 各退避一次；code!=0 不盲重试。 */
export async function callOE(urlStr, params = {}, { retries = 2 } = {}) {
  const u = new URL(urlStr);
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error(`协议禁止: ${urlStr}`);
  if (!ALLOWED_HOSTS.has(u.hostname)) throw new Error(`主机不在白名单: ${u.hostname}`);
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    u.searchParams.set(k, typeof v === "string" ? v : JSON.stringify(v));
  }
  const token = await ensureToken();
  let lastErr = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
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
      // 频控惩罚：官方规则=超分钟上限罚 5 分钟——退避 65s 重试
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
