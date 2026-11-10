// import.mjs — steps 3-6: skills → agent → squad → readback. Resumable via state.json
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const API = process.env.API ?? 'http://127.0.0.1:8080';
const REPO = 'D:/dev/morechat-assistant';
const ROOT = 'D:/dev/morchat.co/.local/p0/preset-smoke';
const LOG = path.join(ROOT, 'run.log');
const STATE_FILE = path.join(ROOT, 'state.json');
const EMAIL = 'p1.preset.smoke@local.test';
const AVATAR = 'cap:blob:amber';

const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
const WS = state.workspace?.id;
if (!WS) { console.error('no workspace in state'); process.exit(1); }
function save() { fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2)); }

function log(entry) { fs.appendFileSync(LOG, JSON.stringify(entry) + '\n'); }
function shrink(body) {
  const c = JSON.parse(JSON.stringify(body ?? {}));
  for (const k of ['content', 'instructions']) if (typeof c[k] === 'string') c[k] = `«${c[k].length} chars»`;
  if (Array.isArray(c.files)) c.files = c.files.map((f) => ({ path: f.path, content: `«${f.content.length} chars»` }));
  return c;
}
async function call(method, url, { token, body, tag } = {}) {
  const headers = { 'X-Workspace-ID': WS };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const t0 = Date.now();
  const res = await fetch(API + url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* raw */ }
  log({ tag, method, url, req: body === undefined ? undefined : shrink(body), status: res.status, ms: Date.now() - t0, resp: json ?? text.slice(0, 600) });
  return { status: res.status, json, text };
}

// ---------- repo helpers ----------
const read = (p) => fs.readFileSync(p, 'utf8');
const readJson = (p) => JSON.parse(read(p));
function stripFrontmatter(md) {
  if (!md.startsWith('---')) return md;
  const end = md.indexOf('\n---', 3);
  if (end < 0) return md;
  const nl = md.indexOf('\n', end + 1);
  return nl < 0 ? '' : md.slice(nl + 1).replace(/^\s*\n/, '');
}
function frontmatter(md) {
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
    if (path.basename(abs).toUpperCase() === 'SKILL.MD') continue; // body travels in `content`
    acc.push({ path: path.relative(base, abs).split(path.sep).join('/'), content: fs.readFileSync(abs, 'utf8') });
  }
  return acc;
}

// ---------- 0. token ----------
async function acquireToken() {
  if (state.token) {
    const me = await call('GET', '/api/me', { token: state.token, tag: '0.auth.reuse-token' });
    if (me.status === 200) return state.token;
  }
  for (let attempt = 1; attempt <= 3; attempt++) {
    const send = await call('POST', '/auth/send-code', { tag: `0.auth.send-code#${attempt}`, body: { email: EMAIL } });
    if (send.status === 429) { await new Promise((r) => setTimeout(r, 65000)); continue; }
    const verify = await call('POST', '/auth/verify-code', { tag: `0.auth.verify-code#${attempt}`, body: { email: EMAIL, code: '123456' } });
    if (verify.status === 200 && verify.json?.token) {
      state.token = verify.json.token;
      state.userId = verify.json.user.id;
      save();
      return state.token;
    }
    await new Promise((r) => setTimeout(r, 65000));
  }
  console.error('login failed');
  process.exit(1);
}
const token = await acquireToken();

// ---------- 3a. runtime prerequisite ----------
const rt = await call('GET', '/api/runtimes', { token, tag: '3a.runtimes.list' });
let runtimeId = Array.isArray(rt.json) ? rt.json[0]?.id : null;
if (!runtimeId) {
  console.log('NO_RUNTIME');
  process.exit(42);
}
state.runtime = { id: runtimeId, provider: rt.json[0].provider };
save();

// ---------- 3b. skills ----------
const PKG = `${REPO}/catalog/packages/agent/ai-engineer`;
const plugin = readJson(`${PKG}/plugin.json`);
// plugin.json declares ./skills/<name> but the on-disk dirs are namespaced <pkg>--<name>.
const declared = plugin.skills.map((p) => p.replace(/^\.\/skills\//, ''));
state.skillDirMismatch = declared.filter((d) => !fs.existsSync(`${PKG}/skills/${d}`));
state.skills = state.skills ?? {};
for (const rel of declared) {
  const ns = `${plugin.name}--${rel}`;
  const abs = `${PKG}/skills/${ns}`;
  if (!fs.existsSync(abs)) { log({ tag: '3b.skills.missing', ns, abs }); continue; }
  if (state.skills[ns]?.id) continue;
  const skillMd = read(`${abs}/SKILL.md`);
  const fm = frontmatter(skillMd);
  const body = {
    name: ns,
    description: (fm.description || '').slice(0, 240),
    content: skillMd,
    files: collectFiles(abs),
    config: { preset_source: 'morechat-assistant', package: plugin.name, package_version: plugin.version, skill_ns: ns, upstream_name: fm.name },
  };
  const res = await call('POST', '/api/skills', { token, tag: `3b.skills.create:${ns}`, body });
  if (res.status >= 300) { state.skills[ns] = { error: res.status, detail: res.text.slice(0, 400) }; save(); continue; }
  state.skills[ns] = { id: res.json.id, name: res.json.name, files: body.files.length };
  save();
  console.log('skill', ns, res.status, res.json.id);
}
save();

// ---------- 4. agent from preset ----------
const skillIds = Object.values(state.skills).filter((s) => s?.id).map((s) => s.id);
state.skillIds = skillIds;
save();
console.log('skillIds', skillIds.length);

const agentMdPath = `${PKG}/agents/ai-engineer.md`;
const agentMd = read(agentMdPath);
const starters = (plugin.quickPrompts ?? []).slice(0, 3).map((qp) => ({
  label: (qp.zh ?? qp.en).slice(0, 40),
  prompt: qp.zh ?? qp.en,
}));
const agentBody = {
  name: plugin.displayName.zh,
  description: plugin.displayDescription.zh,
  instructions: stripFrontmatter(agentMd),
  conversation_starters: starters,
  avatar_url: AVATAR,
  runtime_id: runtimeId,
  skill_ids: skillIds,
  visibility: 'workspace',
  template: 'preset_import_smoke',
};
if (!state.agent) {
  const res = await call('POST', '/api/agents', { token, tag: '4.agents.create', body: agentBody });
  if (res.status >= 300) { console.error('agent create failed', res.status, res.text.slice(0, 500)); process.exit(1); }
  state.agent = { id: res.json.id, status: res.status, name: res.json.name, avatar_url: res.json.avatar_url, skills: res.json.skills?.length };
  save();
  console.log('agent', res.status, res.json.id, res.json.name);
}

// ---------- 5. squad from team preset ----------
const TEAM = `${REPO}/catalog/packages/team/opc-team`;
const teamPlugin = readJson(`${TEAM}/plugin.json`);
const memberMeta = Object.fromEntries((teamPlugin.members ?? []).map((m) => [m.id, m]));
const wantAgents = ['opc-team-lead', 'opc-resource-auditor', 'opc-niche-strategist'];
state.teamAgents = state.teamAgents ?? {};
for (const id of wantAgents) {
  if (state.teamAgents[id]?.id) continue;
  const md = read(`${TEAM}/agents/${id}.md`);
  const meta = memberMeta[id];
  const body = {
    name: meta?.name?.zh ?? id,
    description: meta?.profession?.zh ?? '',
    instructions: stripFrontmatter(md),
    conversation_starters: [],
    avatar_url: AVATAR,
    runtime_id: runtimeId,
    skill_ids: [],
    visibility: 'workspace',
    template: 'preset_import_smoke',
  };
  const res = await call('POST', '/api/agents', { token, tag: `5.agents.create:${id}`, body });
  if (res.status >= 300) { state.teamAgents[id] = { error: res.status, detail: res.text.slice(0, 300) }; save(); continue; }
  state.teamAgents[id] = { id: res.json.id };
  save();
  console.log('team agent', id, res.status, res.json.id);
}

const squadBody = {
  name: teamPlugin.displayName.zh,
  description: teamPlugin.displayDescription.zh,
  leader_id: state.teamAgents['opc-team-lead']?.id,
  instructions: '你是「一人公司专家团」的首席编排师易牧。先做资源盘点，再定利基，最后按阶段推进并复盘。',
  avatar_url: AVATAR,
};
if (!state.squad) {
  const res = await call('POST', '/api/squads', { token, tag: '5.squads.create', body: squadBody });
  if (res.status >= 300) { console.error('squad create failed', res.status, res.text.slice(0, 500)); process.exit(1); }
  state.squad = { id: res.json.id, status: res.status, leader_id: res.json.leader_id, instructions: res.json.instructions, member_count: res.json.member_count };
  save();
  console.log('squad', res.status, res.json.id, 'member_count=', res.json.member_count, 'instructions.len=', (res.json.instructions ?? '').length);
}

for (const id of ['opc-resource-auditor', 'opc-niche-strategist']) {
  const agentId = state.teamAgents[id]?.id;
  if (!agentId) continue;
  const already = (state.squadMembers ?? []).some((m) => m.member_id === agentId);
  if (already) continue;
  const res = await call('POST', `/api/squads/${state.squad.id}/members`, {
    token, tag: `5.squads.addMember:${id}`,
    body: { member_type: 'agent', member_id: agentId, role: 'member' },
  });
  state.squadMembers = state.squadMembers ?? [];
  if (res.status < 300) state.squadMembers.push({ member_id: agentId, role: 'member', status: res.status });
  save();
  console.log('squad member', id, res.status);
}

// ---------- 5b. squad instructions need PUT (create ignores the field) ----------
if (state.squad && state.squad.instructions === '' && !state.squadInstructionsPut) {
  const res = await call('PUT', `/api/squads/${state.squad.id}`, {
    token, tag: '5b.squads.update-instructions',
    body: { instructions: squadBody.instructions },
  });
  state.squadInstructionsPut = { status: res.status, instructions_len: (res.json?.instructions ?? '').length };
  save();
  console.log('squad PUT instructions', res.status, 'len=', state.squadInstructionsPut.instructions_len);
}

// ---------- 6. readback ----------
const rb = {};
rb.skills = await call('GET', '/api/skills', { token, tag: '6.readback.skills' });
rb.agents = await call('GET', '/api/agents', { token, tag: '6.readback.agents' });
rb.agent = await call('GET', `/api/agents/${state.agent.id}`, { token, tag: '6.readback.agent' });
rb.agentSkills = await call('GET', `/api/agents/${state.agent.id}/skills`, { token, tag: '6.readback.agent-skills' });
rb.squads = await call('GET', '/api/squads', { token, tag: '6.readback.squads' });
rb.squad = await call('GET', `/api/squads/${state.squad.id}`, { token, tag: '6.readback.squad' });
rb.squadMembers = await call('GET', `/api/squads/${state.squad.id}/members`, { token, tag: '6.readback.squad-members' });
rb.skillOne = await call('GET', `/api/skills/${state.skillIds[0]}`, { token, tag: '6.readback.skill-detail' });

const squad = rb.squad.json ?? {};
const readback = {
  skills_total: Array.isArray(rb.skills.json) ? rb.skills.json.length : null,
  skills_expected: Object.keys(state.skills).length,
  skills_names: Array.isArray(rb.skills.json) ? rb.skills.json.map((s) => s.name) : null,
  agent_count: Array.isArray(rb.agents.json) ? rb.agents.json.length : null,
  agent: {
    id: rb.agent.json?.id,
    name: rb.agent.json?.name,
    avatar_url: rb.agent.json?.avatar_url,
    description: rb.agent.json?.description,
    instructions_len: (rb.agent.json?.instructions ?? '').length,
    starters: rb.agent.json?.conversation_starters?.length,
    runtime_id: rb.agent.json?.runtime_id,
    status: rb.agent.json?.status,
    skills_field: rb.agent.json?.skills?.length ?? null,
    skill_ids_field: rb.agent.json?.skill_ids?.length ?? null,
  },
  agent_skills_count: Array.isArray(rb.agentSkills.json) ? rb.agentSkills.json.length : (rb.agentSkills.json?.skills?.length ?? null),
  squad: {
    id: squad.id,
    leader_id: squad.leader_id,
    expected_leader: state.teamAgents['opc-team-lead']?.id,
    member_count: squad.member_count,
    instructions_len: (squad.instructions ?? '').length,
    avatar_url: squad.avatar_url,
  },
  squad_members: Array.isArray(rb.squadMembers.json) ? rb.squadMembers.json.map((m) => ({ type: m.member_type, id: m.member_id, role: m.role })) : null,
  skill_detail_files: (rb.skillOne.json?.files ?? rb.skillOne.json?.skill?.files ?? []).length,
};
state.readback = readback;
save();
fs.writeFileSync(`${ROOT}/readback.json`, JSON.stringify(readback, null, 2));
console.log(JSON.stringify(readback, null, 2));
