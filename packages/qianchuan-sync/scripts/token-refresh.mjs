#!/usr/bin/env node
// 千川 token 轮换刷新器（零依赖，Node 20+）——支持多套 token（QC_ / QC2_ / QC3_…）
// 用法: node scripts/qc-token-refresh.mjs
// 纪律: 刷新返回新 refresh_token（轮换制）——先原子写盘再退出；失败绝不覆盖旧值。
import { readFileSync, writeFileSync, renameSync, appendFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// 仓库根（packages/qianchuan-sync/scripts/ 向上三级）；包目录（日志与数据归档处）
const PKG = join(dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = join(PKG, "..", "..");
const ENV_PATH = join(ROOT, ".env.local");
const LOG_PATH = join(PKG, "data", "token-refresh.log.jsonl");

function readEnv() {
  const env = {};
  for (const line of readFileSync(ENV_PATH, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
  return env;
}

function writeEnv(env) {
  const tmp = ENV_PATH + ".tmp";
  const lines = Object.entries(env).map(([k, v]) => `${k}=${v}`);
  writeFileSync(tmp, lines.join("\n") + "\n", "utf8");
  renameSync(tmp, ENV_PATH); // 原子替换
}

function log(entry) {
  appendFileSync(LOG_PATH, JSON.stringify({ ts: new Date().toISOString(), ...entry }) + "\n", "utf8");
}

const env = readEnv();
const prefixes = [...new Set(Object.keys(env)
  .filter((k) => /^QC[0-9]*_REFRESH_TOKEN$/.test(k))
  .map((k) => k.replace(/_REFRESH_TOKEN$/, "")))];

if (prefixes.length === 0) {
  console.error("[FATAL] .env.local 无任何 QC*_REFRESH_TOKEN");
  process.exit(2);
}

let failures = 0;
for (const P of prefixes) {
  const APP_ID = env.QIANCHUAN_APP_ID;
  const SECRET = env.QIANCHUAN_APP_SECRET;
  const REFRESH = env[`${P}_REFRESH_TOKEN`];
  if (!APP_ID || !SECRET || !REFRESH) {
    console.error(`[${P}] 缺凭证，跳过`);
    failures++;
    continue;
  }
  try {
    const res = await fetch("https://open.oceanengine.com/open_api/oauth2/refresh_token/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ app_id: Number(APP_ID), secret: SECRET, grant_type: "refresh_token", refresh_token: REFRESH }),
    });
    const body = await res.json();
    if (body.code !== 0 || !body.data?.refresh_token) {
      log({ set: P, ok: false, code: body.code, message: body.message });
      console.error(`[${P}] FAIL code=${body.code} ${body.message}（旧 refresh 可能失效，需人工重新授权）`);
      failures++;
      continue;
    }
    const { access_token, refresh_token, expires_in, refresh_token_expires_in } = body.data;
    env[`${P}_ACCESS_TOKEN`] = access_token;
    env[`${P}_REFRESH_TOKEN`] = refresh_token;
    env[`${P}_ACCESS_TOKEN_UPDATED`] = new Date().toISOString();
    env[`${P}_ACCESS_TOKEN_EXPIRES`] = String(expires_in);
    env[`${P}_REFRESH_TOKEN_EXPIRES`] = String(refresh_token_expires_in);
    writeEnv(env);
    log({ set: P, ok: true, accessExpiresIn: expires_in, refreshExpiresIn: refresh_token_expires_in });
    console.log(`[${P}] OK access ${Math.round(expires_in / 3600)}h · refresh ${Math.round(refresh_token_expires_in / 86400)}d`);
  } catch (e) {
    log({ set: P, ok: false, error: String(e) });
    console.error(`[${P}] 异常 ${e.message}`);
    failures++;
  }
}
process.exit(failures ? 1 : 0);
