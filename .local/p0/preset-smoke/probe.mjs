// probe.mjs — login + capability discovery, logs every call
import fs from 'node:fs';
import path from 'node:path';

const API = 'http://127.0.0.1:8080';
const LOG_DIR = path.resolve('.local/p0/preset-smoke');
const LOG = path.join(LOG_DIR, 'probe.log');
const EMAIL = 'p1.preset.smoke@local.test';

function log(obj) {
  const line = typeof obj === 'string' ? obj : JSON.stringify(obj);
  fs.appendFileSync(LOG, line + '\n');
  console.log(line);
}

async function call(method, url, { token, body, tag } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const started = Date.now();
  const res = await fetch(API + url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* keep raw */ }
  const entry = {
    tag, method, url, status: res.status, ms: Date.now() - started,
    setCookie: res.headers.getSetCookie(),
    reqBody: body, respBody: json ?? text.slice(0, 800),
  };
  log(entry);
  return { status: res.status, json, text, headers: res.headers };
}

const out = {};

// 1. send-code
const send = await call('POST', '/auth/send-code', { tag: 'auth.send-code', body: { email: EMAIL } });
out.sendCode = send.status;

// 1b. verify-code
const verify = await call('POST', '/auth/verify-code', { tag: 'auth.verify-code', body: { email: EMAIL, code: '123456' } });
out.verifyCode = verify.status;
const token = verify.json?.token;
out.tokenPrefix = token ? token.slice(0, 12) + '...' : null;
if (!token) { log('NO TOKEN — abort'); process.exit(1); }

// me
const me = await call('GET', '/api/me', { token, tag: 'auth.me' });
out.me = { status: me.status, id: me.json?.id, email: me.json?.email };

// workspaces
const ws = await call('GET', '/api/workspaces', { token, tag: 'workspaces.list' });
out.workspaces = { status: ws.status, data: ws.json };

fs.writeFileSync(path.join(LOG_DIR, 'probe-summary.json'), JSON.stringify(out, null, 2));
