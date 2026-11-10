// probe4.mjs — idempotency / duplicate behaviour for re-import
import fs from 'node:fs';
import path from 'node:path';
const API = 'http://127.0.0.1:8080';
const ROOT = 'D:/dev/morchat.co/.local/p0/preset-smoke';
const LOG = path.join(ROOT, 'run.log');
const state = JSON.parse(fs.readFileSync(path.join(ROOT, 'state.json'), 'utf8'));
const WS = state.workspace.id, token = state.token;

async function call(method, url, { body, tag } = {}) {
  const headers = { Authorization: `Bearer ${token}`, 'X-Workspace-ID': WS };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(API + url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let json = null; try { json = text ? JSON.parse(text) : null; } catch { /* raw */ }
  fs.appendFileSync(LOG, JSON.stringify({ tag, method, url, req: body === undefined ? undefined : { name: body.name }, status: res.status, resp: json ?? text.slice(0, 300) }) + '\n');
  return { status: res.status, json, text };
}

const dupSkill = await call('POST', '/api/skills', { tag: '9a.skills.duplicate', body: { name: 'ai-engineer--agent-browser-core', description: 'dup', content: '# dup' } });
const dupAgent = await call('POST', '/api/agents', {
  tag: '9b.agents.duplicate-name',
  body: {
    name: state.readback.agent.name,
    description: 'dup name check',
    instructions: 'dup',
    runtime_id: state.runtime.id,
    skill_ids: [],
  },
});
const agentSkills = await call('PUT', `/api/agents/${state.agent.id}/skills`, { tag: '9c.agents.skills.put', body: { skill_ids: state.skillIds.slice(0, 2) } });
const agentSkillsBack = await call('PUT', `/api/agents/${state.agent.id}/skills`, { tag: '9d.agents.skills.put-restore', body: { skill_ids: state.skillIds } });

console.log(JSON.stringify({
  dupSkill: { status: dupSkill.status, body: dupSkill.json ?? dupSkill.text.slice(0, 160) },
  dupAgent: { status: dupAgent.status, id: dupAgent.json?.id ?? null, name: dupAgent.json?.name },
  putSkills: { status: agentSkills.status, len: agentSkills.json?.length ?? (agentSkills.json?.skills?.length ?? null) },
  restore: { status: agentSkillsBack.status, len: agentSkillsBack.json?.length ?? (agentSkillsBack.json?.skills?.length ?? null) },
}, null, 2));
