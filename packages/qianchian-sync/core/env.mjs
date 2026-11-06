// 凭证与惰性 token + 引擎配置（SYNC-ENGINE §15）
// 2026-11-06 v2：修复 #1-#4/#9/#13/#14 — 双Z/超时/竞态/循环外token/SHOP_ID/时区
import { readFileSync, writeFileSync, renameSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const PKG = join(dirname(fileURLToPath(import.meta.url)), "..");
export const ROOT = join(PKG, "..", "..");
const ENV_PATH = join(ROOT, ".env.local");

const REFRESH_TIMEOUT_MS = 30_000;
const TOKEN_FRESH_MS = 2 * 3600 * 1000;
const TOKEN_MAX_AGE_MS = 20 * 3600 * 1000;

// ── 配置（修复 #13 SHOP_ID / #14 时区 / #10 节流可配）──
export function getConfig() {
  const env = readEnv();
  return {
    shopId: Number(env.QIANCHUAN_SHOP_ID || 59589091),
    timezone: env.SYNC_TIMEZONE || "Asia/Shanghai",
    throttleMs: Number(env.SYNC_THROTTLE_MS || 600),
    maxStateEntries: Number(env.SYNC_MAX_STATE_ENTRIES || 2000),
  };
}

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

// ── 时区安全的"今天"（修复 #14）──
export function todayInTz(tz) {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: tz, dateStyle: "short" }).format(new Date());
  } catch {
    return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
  }
}

export function minusDaysInTz(ds, n) {
  const d = new Date(ds + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

let cached = null;
let refreshing = null;

function parseTs(s) {
  if (!s) return 0;
  const t = Date.parse(s);
  return Number.isNaN(t) ? 0 : t;
}

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
  const updated = parseTs(cached.updated);
  if (cached.access && updated && Date.now() - updated < TOKEN_MAX_AGE_MS - TOKEN_FRESH_MS) {
    return cached.access;
  }
  if (refreshing) return refreshing;
  refreshing = (async () => {
    try {
      if (!cached.refresh) throw new Error("无 QC_REFRESH_TOKEN——需人工重新授权");
      const res = await fetch("https://open.oceanengine.com/open_api/oauth2/refresh_token/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ app_id: Number(cached.app_id), secret: cached.secret, grant_type: "refresh_token", refresh_token: cached.refresh }),
        signal: AbortSignal.timeout(REFRESH_TIMEOUT_MS),
      });
      const body = await res.json();
      if (body.code !== 0 || !body.data?.refresh_token) {
        throw new Error(`token 刷新失败 code=${body.code} ${body.message}（需人工重新授权）`);
      }
      cached.access = body.data.access_token;
      cached.refresh = body.data.refresh_token;
      cached.updated = new Date().toISOString();
      const env = readEnv();
      env.QC_ACCESS_TOKEN = cached.access;
      env.QC_REFRESH_TOKEN = cached.refresh;
      env.QC_ACCESS_TOKEN_UPDATED = cached.updated;
      writeEnv(env);
      return cached.access;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}
