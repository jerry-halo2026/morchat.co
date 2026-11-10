// probe2.mjs — extra capability probes (URL import, skill files, agent skill shape)
import fs from 'node:fs';
import path from 'node:path';
const API = 'http://127.0.0.1:8080';
const ROOT = 'D:/dev/morchat.co/.local/p0/preset-smoke';
const LOG = path.join(ROOT, 'run.log');
const state = JSON.parse(fs.readFileSync(path.join(ROOT, 'state.json'), 'utf8'));
const WS = state.workspace.id;
const token = state.token;

async function call(method, url, { body, tag } = {}) {
  const headers = { 'X-Workspace-ID': WS, Authorization: `Bearer ${token}` };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(API + url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let json = null; try { json = text ? JSON.parse(text) : null; } catch { /* raw */ }
  fs.appendFileSync(LOG, JSON.stringify({ tag, method, url, req: body, status: res.status, resp: json ?? text.slice(0, 500) }) + '\n');
  return { status: res.status, json, text };
}

const out = {};
out.importLocalPath = await call('POST', '/api/skills/import', { tag: '7a.skills.import(file-url)', body: { url: 'file:///D:/dev/morechat-assistant/catalog/packages/agent/ai-engineer/skills/ai-engineer--fullstack-dev' } });
out.importBarePath = await call('POST', '/api/skills/import', { tag: '7b.skills.import(bare-path)', body: { url: 'D:/dev/morechat-assistant/catalog/packages/agent/ai-engineer/skills/ai-engineer--fullstack-dev' } });
out.files = await call('GET', `/api/skills/${state.skillIds[0]}/files`, { tag: '7c.skills.files' });
out.skillDetail = await call('GET', `/api/skills/${state.skillIds[0]}`, { tag: '7d.skills.detail' });
out.agentDetail = await call('GET', `/api/agents/${state.agent.id}`, { tag: '7e.agents.detail' });

const summary = {
  importFileUrl: out.importLocalPath.status,
  importFileUrlBody: out.importLocalPath.json ?? out.importLocalPath.text.slice(0, 200),
  importBarePath: out.importBarePath.status,
  importBarePathBody: out.importBarePath.json ?? out.importBarePath.text.slice(0, 200),
  skillFiles: Array.isArray(out.files.json) ? out.files.json.map((f) => f.path ?? f.file_path) : out.files.json,
  skillDetailKeys: out.skillDetail.json ? Object.keys(out.skillDetail.json) : null,
  skillContentLen: out.skillDetail.json?.content?.length ?? out.skillDetail.json?.skill?.content?.length ?? null,
  agentSkillsShape: (out.agentDetail.json?.skills ?? []).slice(0, 2),
  agentRuntimeBound: out.agentDetail.json?.runtime_bound,
};
fs.writeFileSync(path.join(ROOT, 'probe2.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
