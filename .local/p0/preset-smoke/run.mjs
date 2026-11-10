// run.mjs — P1 preset import smoke: workspace → skills → agent → squad → readback
import fs from 'node:fs';
import path from 'node:path';

const API = process.env.API ?? 'http://127.0.0.1:8080';
const REPO = 'D:/dev/morechat-assistant';
const ROOT = 'D:/dev/morchat.co/.local/p0/preset-smoke';
const LOG = path.join(ROOT, 'run.log');
const STATE_FILE = path.join(ROOT, 'state.json');
const EMAIL = 'p1.preset.smoke@local.test';
const AVATAR = 'cap:blob:amber';

fs.mkdirSync(ROOT, { recursive: true });
fs.writeFileSync(LOG, '');
fs.writeFileSync(STATE_FILE, '{}');

const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
function save() { fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2)); }

function log(entry) {
  fs.appendFileSync(LOG, JSON.stringify(entry) + '\n');
}

async function call(method, url, { token, body, tag, trim = 600 } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const t0 = Date.now();
  const res = await fetch(API + url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* raw */ }
  const summary = json === null ? text.slice(0, trim) : summarize(json, trim);
  log({ tag, method, url, req: body === undefined ? undefined : shrink(body), status: res.status, ms: Date.now() - t0, resp: summary });
  return { status: res.status, json, text };
}

function summarize(v, trim) {
  const s = JSON.stringify(v);
  if (s && s.length > 4000) return JSON.parse(s.slice(0, 4000) + '"}');
  return v;
}
function shrink(body) {
  const clone = JSON.parse(JSON.stringify(body));
  for (const k of ['content', 'instructions']) if (typeof clone[k] === 'string') clone[k] = `«${clone[k].length} chars»`;
  if (Array.isArray(clone.files)) clone.files = clone.files.map((f) => ({ path: f.path, content: `«${f.content.length} chars»` }));
  return clone;
}

// ---------- helpers on the content repo ----------
function read(p) { return fs.readFileSync(p, 'utf8'); }
function readJson(p) { return JSON.parse(read(p)); }
function stripFrontmatter(md) {
  if (!md.startsWith('---')) return md;
  const end = md.indexOf('\n---', 3);
  if (end < 0) return md;
  const nl = md.indexOf('\n', end + 1);
  return nl < 0 ? '' : md.slice(nl + 1).replace(/^\s*\n/, '');
}
function parseFrontmatter(md) {
  const out = {};
  if (!md.startsWith('---')) return out;
  const end = md.indexOf('\n---', 3);
  if (end < 0) return out;
  for (const line of md.slice(3, end).split(/\r?\n/)) {
    const m = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
  }
  return out;
}
const TEXT_EXT = new Set(['.md', '.txt', '.py', '.js', '.mjs', '.ts', '.json', '.yaml', '.yml', '.sh', '.csv', '.html', '.css', '.toml', '.ini', '.sql']);
function collectFiles(dir, base = dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue;
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) { collectFiles(abs, base, acc); continue; }
    if (!TEXT_EXT.has(path.extname(e.name).toLowerCase())) continue;
    acc.push({ path: path.relative(base, abs).split(path.sep).join('/'), content: fs.readFileSync(abs, 'utf8') });
  }
  return acc;
}

// ---------- 1. login ----------
const send = await call('POST', '/auth/send-code', { tag: '1.auth.send-code', body: { email: EMAIL } });
const verify = await call('POST', '/auth/verify-code', { tag: '1.auth.verify-code', body: { email: EMAIL, code: '123456' } });
const token = verify.json?.token;
if (!token) { console.error('login failed', verify.status, verify.text); process.exit(1); }
state.login = { sendCode: send.status, verifyCode: verify.status, userId: verify.json.user.id, token: `${token.slice(0, 20)}...` };
save();

// ---------- 2. workspace ----------
let list = await call('GET', '/api/workspaces', { token, tag: '2.workspaces.list' });
let ws = Array.isArray(list.json) ? list.json[0] : null;
if (!ws) {
  const created = await call('POST', '/api/workspaces', {
    token, tag: '2.workspaces.create',
    body: { name: 'P1 Preset Smoke', slug: 'p1-preset-smoke' },
  });
  if (created.status >= 300) { console.error('workspace create failed', created.status, created.text); process.exit(1); }
  ws = created.json;
}
state.workspace = { id: ws.id, slug: ws.slug, name: ws.name };
save();
const WS = ws.id;
console.log('workspace', WS);
