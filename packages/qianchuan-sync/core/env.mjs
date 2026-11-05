// 凭证与惰性 token（SYNC-ENGINE §15）
// 纪律：凭证只从仓库根 .env.local 读取；源码零凭据字面量。
import { readFileSync, writeFileSync, renameSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const PKG = join(dirname(fileURLToPath(import.meta.url)), "..");
export const ROOT = join(PKG, "..", "..");
const ENV_PATH = join(ROOT, ".env.local");

export function readEnv() {
  const env = {};
  for (const line of readFileSync(ENV_PATH, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
  return env;
}

function writeEnv(env) {
  const tmp = ENV_PATH + ".tmp";
  writeFileSync(tmp, Object.entries(env).map(([k, v]) => `${k}=${v}`).join("\n") + "\n", "utf8");
  renameSync(tmp, ENV_PATH);
}

let cached = null;

/** 惰性获取有效 access_token：剩余寿命 >2h 直接用，否则刷新（轮换落盘）。 */
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
  const freshMs = 2 * 3600 * 1000;
  const updated = cached.updated ? Date.parse(cached.updated.replace(" ", "T") + "Z") : 0;
  const ageOk = cached.access && updated && Date.now() - updated < 20 * 3600 * 1000;
  if (ageOk && Date.now() - updated < 20 * 3600 * 1000 - freshMs) return cached.access;
  if (!cached.refresh) throw new Error("无 QC_REFRESH_TOKEN——需人工重新授权");
  const res = await fetch("https://open.oceanengine.com/open_api/oauth2/refresh_token/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ app_id: Number(cached.app_id), secret: cached.secret, grant_type: "refresh_token", refresh_token: cached.refresh }),
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
}
