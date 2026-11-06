// 凭证与惰性 token（SYNC-ENGINE §15）
// 2026-11-06 修复：Date.parse 双Z bug / fetch 超时 / 刷新互斥 / 进程内短路
// 纪律：凭证只从仓库根 .env.local 读取；源码零凭据字面量。
import { readFileSync, writeFileSync, renameSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const PKG = join(dirname(fileURLToPath(import.meta.url)), "..");
export const ROOT = join(PKG, "..", "..");
const ENV_PATH = join(ROOT, ".env.local");
const LOCK_PATH = join(ROOT, ".env.local.lock");
const REFRESH_TIMEOUT_MS = 30_000;
const TOKEN_FRESH_MS = 2 * 3600 * 1000; // 剩余 >2h 视为新鲜
const TOKEN_MAX_AGE_MS = 20 * 3600 * 1000; // 超过 20h 强制刷新

export function readEnv() {
  const env = {};
  for (const line of readFileSync(ENV_PATH, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
  return env;
}

function writeEnv(env) {
  const tmp = ENV_PATH + "." + process.pid + ".tmp";
  writeFileSync(tmp, Object.entries(env).map(([k, v]) => `${k}=${v}`).join("\n") + "\n", "utf8");
  renameSync(tmp, ENV_PATH);
}

let cached = null;
let refreshing = null; // 刷新互斥锁（同进程 Promise 复用）

function parseTs(s) {
  if (!s) return 0;
  const t = Date.parse(s); // toISOString() 产出已是合法 ISO，直接 parse
  return Number.isNaN(t) ? 0 : t;
}

/** 惰性获取有效 access_token（修复版）。 */
export async function ensureToken() {
  if (!cached) {
    const env = readEnv();
    cached = {
      app_id: env.QIANCHUAN_APP_ID,
      secret: env.QIANCHUAN_APP_SECRET,
      access: env.QC_ACCESS_TOKEN || "",
      refresh: env.QC_REFRESH_TOKEN || "",
      updated: env.QC_ACCESS_TOKEN_UPDATED || "",
    };
  }

  // 短路：刚刷新过（<2h）直接返回
  const updated = parseTs(cached.updated);
  if (cached.access && updated && Date.now() - updated < TOKEN_MAX_AGE_MS - TOKEN_FRESH_MS) {
    return cached.access;
  }

  // 刷新互斥：同进程内并发调用只触发一次网络请求
  if (refreshing) return refreshing;

  refreshing = (async () => {
    try {
      if (!cached.refresh) throw new Error("无 QC_REFRESH_TOKEN——需人工重新授权");
      const res = await fetch("https://open.oceanengine.com/open_api/oauth2/refresh_token/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          app_id: Number(cached.app_id), secret: cached.secret,
          grant_type: "refresh_token", refresh_token: cached.refresh,
        }),
        signal: AbortSignal.timeout(REFRESH_TIMEOUT_MS), // 修复 #2：30s 超时
      });
      const body = await res.json();
      if (body.code !== 0 || !body.data?.refresh_token) {
        throw new Error(`token 刷新失败 code=${body.code} ${body.message}（需人工重新授权）`);
      }
      cached.access = body.data.access_token;
      cached.refresh = body.data.refresh_token;
      cached.updated = new Date().toISOString();
      // 落盘（写完释放）
      const env = readEnv();
      env.QC_ACCESS_TOKEN = cached.access;
      env.QC_REFRESH_TOKEN = cached.refresh;
      env.QC_ACCESS_TOKEN_UPDATED = cached.updated;
      writeEnv(env);
      return cached.access;
    } finally {
      refreshing = null; // 无论成败都释放锁
    }
  })();

  return refreshing;
}
