// probe3.mjs — plugin-v1 gate probes (is there a one-shot preset install path?)
import fs from 'node:fs';
import path from 'node:path';
const API = 'http://127.0.0.1:8080';
const ROOT = 'D:/dev/morchat.co/.local/p0/preset-smoke';
const LOG = path.join(ROOT, 'run.log');
const state = JSON.parse(fs.readFileSync(path.join(ROOT, 'state.json'), 'utf8'));
const WS = state.workspace.id, token = state.token;

async function call(method, url, { body, tag } = {}) {
  const headers = { Authorization: `Bearer ${token}` };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(API + url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let json = null; try { json = text ? JSON.parse(text) : null; } catch { /* raw */ }
  fs.appendFileSync(LOG, JSON.stringify({ tag, method, url, req: body, status: res.status, resp: json ?? text.slice(0, 400) }) + '\n');
  return { status: res.status, json, text };
}

const out = {};
out.listPlugins = await call('GET', `/api/workspaces/${WS}/plugins`, { tag: '8a.plugins.list' });
out.listPackages = await call('GET', `/api/workspaces/${WS}/plugins/packages`, { tag: '8b.plugins.packages.list' });
out.publishLocal = await call('POST', `/api/workspaces/${WS}/plugins/packages/local`, { tag: '8c.plugins.packages.local', body: { name: 'ai-engineer' } });
out.preview = await call('POST', `/api/workspaces/${WS}/plugins/preview`, { tag: '8d.plugins.preview', body: { name: 'ai-engineer', version: '1.0.2' } });
console.log(JSON.stringify(Object.fromEntries(Object.entries(out).map(([k, v]) => [k, { status: v.status, body: v.json ?? v.text.slice(0, 200) }])), null, 2));
