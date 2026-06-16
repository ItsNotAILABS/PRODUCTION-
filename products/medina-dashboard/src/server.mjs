#!/usr/bin/env node
// Medina Dashboard — local app shell for the entire vault surface.
// Sidebar: Vault · Skills · Workflows · Keys · Tokens · Protocols.
// Skills + Workflows can be RUN from the UI; PDFs download in-browser.
// Reads ~/.medina/vault.json directly; loads SkillRegistry from medina-vault.

import { createServer } from 'node:http';
import { promises as fs } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const VAULT_SRC = resolve(__dirname, '..', '..', 'medina-vault', 'src');

const { SkillRegistry }    = await import(pathToFileURL(join(VAULT_SRC, 'skills.mjs')).href);
const { WorkflowRunner }   = await import(pathToFileURL(join(VAULT_SRC, 'workflows.mjs')).href);
const { WORKFLOW_LIBRARY, listWorkflows } =
  await import(pathToFileURL(join(VAULT_SRC, 'skills/workflows_library.mjs')).href);
const { MedinaVault }      = await import(pathToFileURL(join(VAULT_SRC, 'vault.mjs')).href);

const PORT = Number(process.env.MEDINA_DASHBOARD_PORT || 8731);
const MEDINA_HOME = process.env.MEDINA_HOME || join(homedir(), '.medina');
const VAULT_PATH  = process.env.MEDINA_VAULT_PATH  || join(MEDINA_HOME, 'vault.json');
const SIGNAL_PATH = process.env.MEDINA_SIGNAL_PATH || join(MEDINA_HOME, 'signal.json');

const PHI = 1.618033988749895;
const DECAY_THRESHOLD = 0.05;

// Live vault for memory.* skills + DUAL_READ semantics.
const vault    = new MedinaVault({ operatorId: process.env.MEDINA_OPERATOR_ID || process.env.USERNAME || 'operator' });
const skills   = new SkillRegistry({ vault });
const workflows = new WorkflowRunner({ registry: skills });

async function readJsonSafe(p) {
  try { return JSON.parse(await fs.readFile(p, 'utf8')); } catch { return null; }
}

function vaultStats(snapshot) {
  if (!snapshot?.entries) return { total: 0, tiers: {}, entries: [] };
  const now = Date.now();
  const tiers = { PUBLIC: 0, SHARED: 0, PRIVATE: 0, SOVEREIGN: 0 };
  const entries = [];
  for (const [, e] of snapshot.entries) {
    tiers[e.tier] = (tiers[e.tier] || 0) + 1;
    const ageHours = (now - e.createdAt) / 3_600_000;
    const strength = e.decayRate === 0 ? 1 : Math.exp(-e.decayRate * ageHours);
    if (strength < DECAY_THRESHOLD) continue;
    entries.push({
      key: e.key, tier: e.tier, owner: e.ownerId,
      strength: Math.round(strength * 1000) / 1000,
      lineage_depth: (e.lineage || []).length,
      created: new Date(e.createdAt).toISOString(),
      tags: e.metadata?.tags || [],
      value_preview: typeof e.value === 'string'
        ? e.value.slice(0, 240)
        : JSON.stringify(e.value).slice(0, 240),
    });
  }
  entries.sort((a, b) => b.strength - a.strength);
  return { total: entries.length, tiers, entries };
}

function metaStats(snapshot) {
  const meta = snapshot?._meta || {};
  return {
    keys:   Object.entries(meta.keys || {}).map(([name, v]) => ({
      name, fingerprint: v.fingerprint, addedAt: v.addedAt,
      lastUsedAt: v.lastUsedAt, usageCount: v.usageCount,
    })),
    tokens: Object.entries(meta.tokens || {}).map(([agent, balance]) => ({ agent, balance })),
    custos: meta.custos || null,
  };
}

function signalStats(snapshot) {
  if (!snapshot?.signals) return { total: 0, roles: [], recent: [] };
  return { total: snapshot.signals.length, roles: snapshot.roles || [], recent: snapshot.signals.slice(-20).reverse() };
}

async function gatherState() {
  const [v, s] = await Promise.all([readJsonSafe(VAULT_PATH), readJsonSafe(SIGNAL_PATH)]);
  return {
    operator:    process.env.MEDINA_OPERATOR_ID || process.env.USERNAME || process.env.USER || 'operator',
    medina_home: MEDINA_HOME,
    protocol:    'MEDINA-PROTOCOL/0.2',
    phi: PHI, heartbeat_ms: 873,
    vault:  { path: VAULT_PATH,  ...vaultStats(v) },
    signal: { path: SIGNAL_PATH, ...signalStats(s) },
    meta:   metaStats(v),
    counts: { skills: skills.list().length, workflows: Object.keys(WORKFLOW_LIBRARY).length,
              domains: skills.domains().length },
    timestamp: new Date().toISOString(),
  };
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return {}; }
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    if (req.method === 'GET' && url.pathname === '/state') return json(res, await gatherState());

    if (req.method === 'GET' && url.pathname === '/api/skills')
      return json(res, { skills: skills.list(), domains: skills.domains() });

    if (req.method === 'POST' && url.pathname === '/api/skills/run') {
      const body = await readBody(req);
      return json(res, skills.run(body.name, body.input || {}, { agent_id: 'dashboard' }));
    }

    if (req.method === 'GET' && url.pathname === '/api/workflows')
      return json(res, { library: listWorkflows() });

    if (req.method === 'POST' && url.pathname === '/api/workflows/run') {
      const body = await readBody(req);
      const def = WORKFLOW_LIBRARY[body.id];
      if (!def) return json(res, { ok: false, reason: 'WORKFLOW_NOT_FOUND' });
      const filled = JSON.parse(JSON.stringify(def, (k, v) =>
        typeof v === 'string' ? v.replace(/\$\{([^}|.]+)\}/g, (_, k2) => body.vars?.[k2] ?? `\${${k2}}`) : v
      ));
      return json(res, workflows.run(filled, { agent_id: 'dashboard' }));
    }

    if (req.method === 'GET' && url.pathname === '/api/runs')
      return json(res, { skill_runs: skills.history({ limit: 30 }),
                         workflow_runs: workflows.status({ limit: 10 }) });

    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(HTML);
  } catch (e) {
    res.writeHead(500, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: e.message }));
  }
});

function json(res, body) {
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

server.listen(PORT, () => {
  console.log(`\n  Medina Dashboard — http://localhost:${PORT}`);
  console.log(`  ${skills.list().length} skills · ${Object.keys(WORKFLOW_LIBRARY).length} workflows · MEDINA-PROTOCOL/0.2\n`);
});

// ──────────────────────────────────────────────────────────────────────────
// HTML — single-file app shell
// ──────────────────────────────────────────────────────────────────────────

const HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Medina Mesh</title>
<style>
:root{
  --bg:#07090e; --panel:#0d111a; --panel2:#11161f; --line:#1a2233;
  --ink:#e5e8ef; --ink-dim:#9aa3b2; --dim:#6b7280;
  --gold:#d4a843; --green:#34d399; --red:#ef4444; --blue:#60a5fa;
  --pri:#6366f1; --sov:#ef4444; --sha:#06b6d4; --pub:#94a3b8;
  --mono: ui-monospace, "JetBrains Mono", Consolas, monospace;
  --sans: -apple-system, "Segoe UI", system-ui, sans-serif;
}
*{box-sizing:border-box}
html,body{height:100%;margin:0;background:var(--bg);color:var(--ink);font:13px/1.5 var(--mono)}
a{color:var(--blue);text-decoration:none}
button{font:inherit;cursor:pointer;background:var(--panel2);color:var(--ink);border:1px solid var(--line);padding:6px 12px;border-radius:3px}
button:hover{background:var(--panel);border-color:var(--gold)}
button.primary{background:var(--gold);color:#0b0b0b;border-color:var(--gold);font-weight:600}
button.primary:hover{filter:brightness(1.1)}
input,textarea,select{font:inherit;background:var(--bg);color:var(--ink);border:1px solid var(--line);padding:6px 8px;border-radius:3px;width:100%}
input:focus,textarea:focus,select:focus{outline:none;border-color:var(--gold)}
code{color:var(--gold)}
.app{display:grid;grid-template-columns:240px 1fr;height:100vh;overflow:hidden}
/* ── sidebar ── */
.side{background:#04060a;border-right:1px solid var(--line);display:flex;flex-direction:column}
.brand{padding:18px 16px;border-bottom:1px solid var(--line)}
.brand h1{margin:0;font-size:14px;letter-spacing:.2em;color:var(--gold)}
.brand .sub{font-size:10px;color:var(--dim);margin-top:4px;letter-spacing:.1em}
.nav{flex:1;padding:8px 0;overflow:auto}
.nav button{display:flex;align-items:center;gap:10px;width:100%;text-align:left;border:none;border-left:2px solid transparent;background:none;color:var(--ink-dim);padding:10px 16px;border-radius:0;font-size:12px;letter-spacing:.05em}
.nav button:hover{background:#0a0e16;color:var(--ink)}
.nav button.active{background:#0a0e16;border-left-color:var(--gold);color:var(--gold)}
.nav .icon{font-size:14px;width:18px;text-align:center}
.nav .count{margin-left:auto;font-size:10px;color:var(--dim);background:var(--panel);padding:2px 6px;border-radius:8px}
.side .foot{padding:12px 16px;border-top:1px solid var(--line);font-size:10px;color:var(--dim)}
.live{display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--green);margin-right:6px;vertical-align:middle;animation:pulse 1.4s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
/* ── main ── */
.main{overflow:auto;padding:24px 32px}
.head{display:flex;align-items:center;gap:16px;margin-bottom:20px}
.head h2{margin:0;font-size:20px;letter-spacing:.05em;color:var(--ink)}
.head .pill{font-size:10px;color:var(--gold);background:#1f1605;border:1px solid #3a2a06;padding:3px 8px;border-radius:10px;letter-spacing:.1em}
.stats{display:flex;gap:24px;margin-bottom:20px;flex-wrap:wrap}
.stat{background:var(--panel);border:1px solid var(--line);border-radius:4px;padding:14px 18px;min-width:120px}
.stat .n{font-size:22px;color:var(--gold);font-weight:600}
.stat .l{font-size:10px;color:var(--dim);text-transform:uppercase;letter-spacing:.12em;margin-top:2px}
.cards{display:grid;grid-template-columns:repeat(auto-fill, minmax(280px,1fr));gap:12px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:4px;padding:14px;cursor:pointer;transition:all .12s}
.card:hover{border-color:var(--gold);background:var(--panel2);transform:translateY(-1px)}
.card .name{color:var(--gold);font-size:12px;margin-bottom:4px}
.card .desc{color:var(--ink-dim);font-size:11px;line-height:1.45;height:48px;overflow:hidden}
.card .meta{display:flex;justify-content:space-between;margin-top:8px;font-size:10px;color:var(--dim)}
.domain-pill{display:inline-block;padding:2px 6px;border-radius:2px;font-size:9px;letter-spacing:.1em;text-transform:uppercase;background:var(--bg);color:var(--ink-dim);border:1px solid var(--line)}
table{width:100%;border-collapse:collapse;font-size:12px}
th,td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--line);vertical-align:top}
th{color:var(--dim);font-weight:normal;font-size:10px;text-transform:uppercase;letter-spacing:.1em;background:var(--panel2);position:sticky;top:0}
.tier{display:inline-block;padding:1px 6px;border-radius:2px;font-size:9px;letter-spacing:.1em}
.tier-PUBLIC{background:#1e293b;color:var(--pub)}
.tier-SHARED{background:#0e3a4c;color:var(--sha)}
.tier-PRIVATE{background:#1e1b4b;color:var(--pri)}
.tier-SOVEREIGN{background:#4c1d1d;color:var(--sov)}
.preview{color:var(--ink-dim);max-width:480px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.empty{color:var(--dim);padding:32px;text-align:center;font-style:italic}
.toolbar{display:flex;gap:8px;margin-bottom:16px;align-items:center}
.toolbar input{max-width:280px}
/* ── modal / drawer ── */
.drawer{position:fixed;top:0;right:0;width:540px;max-width:95vw;height:100vh;background:var(--panel);border-left:1px solid var(--gold);box-shadow:-8px 0 32px rgba(0,0,0,.6);transform:translateX(100%);transition:transform .18s;z-index:10;display:flex;flex-direction:column}
.drawer.open{transform:translateX(0)}
.drawer .dh{padding:16px 20px;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:12px}
.drawer .dh h3{margin:0;font-size:14px;color:var(--gold);flex:1}
.drawer .dh button.close{padding:4px 10px}
.drawer .db{padding:16px 20px;flex:1;overflow:auto}
.drawer .df{padding:12px 20px;border-top:1px solid var(--line);display:flex;gap:8px;justify-content:flex-end;background:var(--panel2)}
.field{margin-bottom:12px}
.field label{display:block;font-size:10px;color:var(--dim);text-transform:uppercase;letter-spacing:.1em;margin-bottom:4px}
.field .help{font-size:10px;color:var(--dim);margin-top:2px}
.result{background:var(--bg);border:1px solid var(--line);border-radius:3px;padding:12px;font-size:11px;white-space:pre-wrap;word-break:break-word;max-height:340px;overflow:auto;color:var(--green)}
.result.err{color:var(--red)}
.tag{display:inline-block;padding:1px 6px;font-size:9px;color:var(--ink-dim);background:var(--bg);border:1px solid var(--line);border-radius:2px;margin-right:4px}
</style>
</head>
<body>
<div class="app">
  <aside class="side">
    <div class="brand">
      <h1>𓂀 MEDINA MESH</h1>
      <div class="sub">MEDINA-PROTOCOL/0.2 · <span class="live"></span>φ=1.618</div>
    </div>
    <nav class="nav" id="nav"></nav>
    <div class="foot">
      operator <code id="op">…</code><br>
      <span id="opath">…</span>
    </div>
  </aside>
  <main class="main" id="main">
    <div class="empty">loading…</div>
  </main>
</div>

<div class="drawer" id="drawer">
  <div class="dh">
    <h3 id="dtitle">—</h3>
    <button class="close" onclick="closeDrawer()">×</button>
  </div>
  <div class="db" id="dbody"></div>
  <div class="df" id="dfoot"></div>
</div>

<script>
const TABS = [
  { id:'vault',     label:'Vault',     icon:'⟁' },
  { id:'skills',    label:'Skills',    icon:'✦' },
  { id:'workflows', label:'Workflows', icon:'⇄' },
  { id:'keys',      label:'Keys',      icon:'⚷' },
  { id:'tokens',    label:'Tokens',    icon:'◈' },
  { id:'signal',    label:'Signal',    icon:'⇋' },
  { id:'runs',      label:'Activity',  icon:'⏱' },
];
let STATE = null, SKILLS = [], DOMAINS = [], WFS = [], CURRENT = 'vault';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

async function fetchAll() {
  const [state, sks, wfs] = await Promise.all([
    fetch('/state').then(r=>r.json()),
    fetch('/api/skills').then(r=>r.json()),
    fetch('/api/workflows').then(r=>r.json()),
  ]);
  STATE = state; SKILLS = sks.skills; DOMAINS = sks.domains; WFS = wfs.library;
  $('op').textContent = state.operator;
  $('opath').textContent = state.medina_home;
  renderNav();
  render(CURRENT);
}

function renderNav() {
  const counts = {
    vault:     STATE.vault.total,
    skills:    SKILLS.length,
    workflows: WFS.length,
    keys:      STATE.meta.keys.length,
    tokens:    STATE.meta.tokens.length,
    signal:    STATE.signal.total,
    runs:      '',
  };
  $('nav').innerHTML = TABS.map(t =>
    \`<button class="\${CURRENT===t.id?'active':''}" onclick="go('\${t.id}')">
      <span class="icon">\${t.icon}</span><span>\${t.label}</span>
      <span class="count">\${counts[t.id] ?? ''}</span>
    </button>\`).join('');
}

function go(tab) { CURRENT = tab; renderNav(); render(tab); }

function render(tab) {
  const m = $('main');
  if (tab === 'vault')     m.innerHTML = renderVault();
  else if (tab === 'skills')    m.innerHTML = renderSkills();
  else if (tab === 'workflows') m.innerHTML = renderWorkflows();
  else if (tab === 'keys')      m.innerHTML = renderKeys();
  else if (tab === 'tokens')    m.innerHTML = renderTokens();
  else if (tab === 'signal')    m.innerHTML = renderSignal();
  else if (tab === 'runs')      { m.innerHTML = '<div class="empty">loading…</div>'; loadRuns(); }
}

// ── VAULT ─────────────────────────────────────────────────────────
function renderVault() {
  const v = STATE.vault;
  const rows = v.entries.length === 0
    ? '<tr><td colspan="6" class="empty">vault is empty — your AIs haven\\'t written yet</td></tr>'
    : v.entries.slice(0, 200).map(e => \`
      <tr>
        <td><span class="tier tier-\${e.tier}">\${e.tier}</span></td>
        <td><code>\${esc(e.key)}</code></td>
        <td>\${esc(e.owner)}</td>
        <td>⛓ \${e.lineage_depth}</td>
        <td>\${e.strength.toFixed(2)}</td>
        <td class="preview" title="\${esc(e.value_preview)}">\${esc(e.value_preview)}</td>
      </tr>\`).join('');
  return \`
    <div class="head"><h2>Vault</h2><span class="pill">\${STATE.protocol}</span></div>
    <div class="stats">
      <div class="stat"><div class="n">\${v.total}</div><div class="l">live entries</div></div>
      <div class="stat"><div class="n">\${v.tiers.SOVEREIGN||0}</div><div class="l">sovereign</div></div>
      <div class="stat"><div class="n">\${v.tiers.PRIVATE||0}</div><div class="l">private</div></div>
      <div class="stat"><div class="n">\${v.tiers.SHARED||0}</div><div class="l">shared</div></div>
      <div class="stat"><div class="n">\${v.tiers.PUBLIC||0}</div><div class="l">public</div></div>
    </div>
    <table><thead><tr><th>tier</th><th>key</th><th>owner</th><th>depth</th><th>φ-strength</th><th>preview</th></tr></thead>
    <tbody>\${rows}</tbody></table>\`;
}

// ── SKILLS ────────────────────────────────────────────────────────
function renderSkills() {
  const cards = SKILLS.map(s => \`
    <div class="card" onclick='openSkill(\${JSON.stringify(s.name)})'>
      <div class="name">\${esc(s.name)}</div>
      <div class="desc">\${esc(s.description||'')}</div>
      <div class="meta"><span class="domain-pill">\${esc(s.domain)}</span><span>\${s.template?'template':'native'}</span></div>
    </div>\`).join('');
  const domBar = DOMAINS.map(d => \`<span class="tag">\${esc(d.domain)} <code>\${d.count}</code></span>\`).join('');
  return \`
    <div class="head"><h2>Skills</h2><span class="pill">\${SKILLS.length} skills · \${DOMAINS.length} domains</span></div>
    <div style="margin-bottom:12px">\${domBar}</div>
    <div class="toolbar">
      <input id="sf" placeholder="filter skills…" oninput="filterSkills(this.value)" />
    </div>
    <div class="cards" id="skill-cards">\${cards}</div>\`;
}

function filterSkills(q) {
  q = q.toLowerCase();
  const cards = $('skill-cards').children;
  for (const c of cards) c.style.display = c.textContent.toLowerCase().includes(q) ? '' : 'none';
}

function openSkill(name) {
  const skill = SKILLS.find(s => s.name === name);
  if (!skill) return;
  const schema = skill.inputSchema || { properties: {} };
  const props = schema.properties || {};
  const required = schema.required || [];
  const fields = Object.entries(props).map(([k, p]) => {
    const req = required.includes(k);
    const desc = p.description ? \`<div class="help">\${esc(p.description)}</div>\` : '';
    const def = p.default !== undefined ? \` (default: \${esc(JSON.stringify(p.default))})\` : '';
    let input;
    if (p.enum) {
      input = \`<select name="\${esc(k)}">\${p.enum.map(o => \`<option>\${esc(o)}</option>\`).join('')}</select>\`;
    } else if (p.type === 'array') {
      input = \`<textarea name="\${esc(k)}" data-type="array" rows="3" placeholder='[ "item1", "item2" ]'></textarea>\`;
    } else if (p.type === 'object') {
      input = \`<textarea name="\${esc(k)}" data-type="object" rows="4" placeholder='{ "field": "value" }'></textarea>\`;
    } else if (p.type === 'number') {
      input = \`<input name="\${esc(k)}" type="number" data-type="number" />\`;
    } else if (p.type === 'boolean') {
      input = \`<select name="\${esc(k)}" data-type="boolean"><option>false</option><option>true</option></select>\`;
    } else {
      input = \`<input name="\${esc(k)}" type="text" />\`;
    }
    return \`<div class="field"><label>\${esc(k)}\${req?' *':''}\${esc(def)}</label>\${input}\${desc}</div>\`;
  }).join('');
  openDrawer(skill.name, \`
    <div style="color:var(--ink-dim);margin-bottom:14px;font-size:12px">\${esc(skill.description||'')}</div>
    <form id="sform" onsubmit="event.preventDefault(); runSkill();">\${fields}</form>
    <div id="sres"></div>\`,
    \`<button onclick="closeDrawer()">Cancel</button>
     <button class="primary" onclick="runSkill()">Run skill</button>\`);
}

async function runSkill() {
  const skillName = $('dtitle').textContent;
  const form = $('sform');
  const input = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    const t = el.getAttribute('data-type');
    let v = el.value;
    if (v === '') continue;
    try {
      if (t === 'array' || t === 'object') v = JSON.parse(v);
      else if (t === 'number') v = Number(v);
      else if (t === 'boolean') v = (v === 'true');
    } catch (e) { v = el.value; }
    input[el.name] = v;
  }
  $('sres').innerHTML = '<div class="result">running…</div>';
  const r = await fetch('/api/skills/run', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: skillName, input }),
  }).then(x => x.json());
  let html;
  if (r.ok) {
    html = '<div class="result">' + esc(JSON.stringify(r, null, 2)) + '</div>';
    if (r.bytes_base64 && r.filename) {
      html += \`<div style="margin-top:10px"><button class="primary" onclick='downloadB64(\${JSON.stringify(r.filename)}, \${JSON.stringify(r.bytes_base64)})'>⇩ Download \${esc(r.filename)}</button></div>\`;
    }
  } else {
    html = '<div class="result err">' + esc(JSON.stringify(r, null, 2)) + '</div>';
  }
  $('sres').innerHTML = html;
}

function downloadB64(filename, b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const blob = new Blob([bytes], { type: filename.endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// ── WORKFLOWS ─────────────────────────────────────────────────────
function renderWorkflows() {
  const cards = WFS.map(w => \`
    <div class="card" onclick='openWorkflow(\${JSON.stringify(w.id)})'>
      <div class="name">\${esc(w.id)}</div>
      <div class="desc">\${esc(w.description||'')}</div>
      <div class="meta"><span>\${w.nodes.length} nodes</span><span>\${w.required_vars.length} vars</span></div>
    </div>\`).join('');
  return \`
    <div class="head"><h2>Workflows</h2><span class="pill">\${WFS.length} prebuilt</span></div>
    <div class="cards">\${cards}</div>\`;
}

function openWorkflow(id) {
  const wf = WFS.find(w => w.id === id);
  if (!wf) return;
  const nodeList = wf.nodes.map(n => \`<div class="tag">\${esc(n.id)} → <code>\${esc(n.skill)}</code></div>\`).join('');
  const fields = wf.required_vars.map(v =>
    \`<div class="field"><label>\${esc(v)} *</label><textarea name="\${esc(v)}" rows="2" placeholder="JSON or plain text"></textarea></div>\`).join('');
  openDrawer(wf.id, \`
    <div style="color:var(--ink-dim);margin-bottom:10px;font-size:12px">\${esc(wf.description||'')}</div>
    <div style="margin-bottom:14px">\${nodeList}</div>
    <form id="wform" onsubmit="event.preventDefault(); runWorkflow();">\${fields || '<div class="empty">no variables needed</div>'}</form>
    <div id="wres"></div>\`,
    \`<button onclick="closeDrawer()">Cancel</button>
     <button class="primary" onclick="runWorkflow()">Run workflow</button>\`);
}

async function runWorkflow() {
  const wfId = $('dtitle').textContent;
  const form = $('wform');
  const vars = {};
  if (form) {
    for (const el of form.elements) {
      if (!el.name) continue;
      let v = el.value;
      if (v === '') continue;
      try { v = JSON.parse(v); } catch {}
      vars[el.name] = v;
    }
  }
  $('wres').innerHTML = '<div class="result">running…</div>';
  const r = await fetch('/api/workflows/run', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: wfId, vars }),
  }).then(x => x.json());
  $('wres').innerHTML = '<div class="result' + (r.ok?'':' err') + '">' + esc(JSON.stringify(r, null, 2)) + '</div>';
}

// ── KEYS / TOKENS / SIGNAL / RUNS ─────────────────────────────────
function renderKeys() {
  const m = STATE.meta;
  const rows = m.keys.length === 0
    ? '<tr><td colspan="4" class="empty">no API keys yet — call keys_set from any MCP client</td></tr>'
    : m.keys.map(k => \`<tr><td><code>\${esc(k.name)}</code></td><td><code>\${esc(k.fingerprint||'')}</code></td><td>\${k.usageCount||0}</td><td>\${k.lastUsedAt?new Date(k.lastUsedAt).toLocaleString():'—'}</td></tr>\`).join('');
  return \`
    <div class="head"><h2>API Keys</h2><span class="pill">AES-256-GCM</span></div>
    <div style="color:var(--ink-dim);font-size:11px;margin-bottom:14px">
      Keys are encrypted at rest in the vault file. Plaintext never leaves the local process.
      Master key derived per-machine from operator id + host via PBKDF2 (250,000 iterations).
      Tampered ciphertext fails the GCM auth tag and returns null.
    </div>
    <table><thead><tr><th>name</th><th>fingerprint</th><th>uses</th><th>last used</th></tr></thead><tbody>\${rows}</tbody></table>\`;
}
function renderTokens() {
  const m = STATE.meta;
  const rows = m.tokens.length === 0
    ? '<tr><td colspan="3" class="empty">no balances yet — every vault_store earns tokens</td></tr>'
    : m.tokens.slice().sort((a,b)=>b.balance-a.balance).map((t,i)=>\`<tr><td>\${i+1}</td><td><code>\${esc(t.agent)}</code></td><td>\${t.balance.toFixed(2)} MX</td></tr>\`).join('');
  return \`
    <div class="head"><h2>Memory Tokens</h2><span class="pill">F(1) F(3) F(5) F(7)</span></div>
    <div style="color:var(--ink-dim);font-size:11px;margin-bottom:14px">
      Each store earns tier × (1 + lineage·φ⁻¹). Tier weights are Fibonacci:
      PUBLIC=1, SHARED=2, PRIVATE=5, SOVEREIGN=13. Lineage rewards continuity.
    </div>
    <table><thead><tr><th>rank</th><th>agent</th><th>balance</th></tr></thead><tbody>\${rows}</tbody></table>\`;
}
function renderSignal() {
  const sg = STATE.signal;
  const rows = sg.recent.length === 0
    ? '<tr><td colspan="5" class="empty">no signals — AIs haven\\'t talked to each other yet</td></tr>'
    : sg.recent.map(x => \`<tr><td>\${x.priority}</td><td>\${esc(x.type)}</td><td>\${esc(x.from)}\${x.to?' → '+esc(x.to):''}</td><td><code>\${esc(x.subject)}</code></td><td class="preview">\${esc(typeof x.payload==='string'?x.payload:JSON.stringify(x.payload??''))}</td></tr>\`).join('');
  return \`
    <div class="head"><h2>Signal Bus</h2><span class="pill">\${sg.total} signals · \${sg.roles.length} agents</span></div>
    <table><thead><tr><th>pri</th><th>type</th><th>from→to</th><th>subject</th><th>payload</th></tr></thead><tbody>\${rows}</tbody></table>\`;
}
async function loadRuns() {
  const r = await fetch('/api/runs').then(x => x.json());
  const skillRows = (r.skill_runs || []).length === 0
    ? '<tr><td colspan="5" class="empty">no skill runs yet</td></tr>'
    : r.skill_runs.map(s => \`<tr><td>\${new Date(s.ts).toLocaleTimeString()}</td><td><code>\${esc(s.name)}</code></td><td>\${s.ok?'<span style="color:var(--green)">ok</span>':'<span style="color:var(--red)">'+esc(s.reason||'fail')+'</span>'}</td><td>\${s.ms}ms</td><td>\${esc(s.agent_id||'')}</td></tr>\`).join('');
  const wfRows = (r.workflow_runs || []).length === 0
    ? '<tr><td colspan="4" class="empty">no workflow runs yet</td></tr>'
    : r.workflow_runs.map(w => \`<tr><td>\${new Date(w.ts).toLocaleTimeString()}</td><td><code>\${esc(w.id)}</code></td><td>\${w.ran_nodes}</td><td>\${w.ok?'<span style="color:var(--green)">ok</span>':'<span style="color:var(--red)">partial</span>'}</td></tr>\`).join('');
  $('main').innerHTML = \`
    <div class="head"><h2>Activity</h2></div>
    <h3 style="font-size:11px;color:var(--gold);letter-spacing:.15em;text-transform:uppercase">Skill runs</h3>
    <table><thead><tr><th>time</th><th>skill</th><th>status</th><th>ms</th><th>agent</th></tr></thead><tbody>\${skillRows}</tbody></table>
    <h3 style="font-size:11px;color:var(--gold);letter-spacing:.15em;text-transform:uppercase;margin-top:24px">Workflow runs</h3>
    <table><thead><tr><th>time</th><th>workflow</th><th>nodes</th><th>status</th></tr></thead><tbody>\${wfRows}</tbody></table>\`;
}

function openDrawer(title, body, footer) {
  $('dtitle').textContent = title;
  $('dbody').innerHTML = body;
  $('dfoot').innerHTML = footer || '';
  $('drawer').classList.add('open');
}
function closeDrawer() { $('drawer').classList.remove('open'); }
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDrawer(); });

fetchAll();
setInterval(() => { if (CURRENT === 'vault' || CURRENT === 'tokens' || CURRENT === 'keys' || CURRENT === 'signal') fetchAll(); }, 5000);
</script>
</body>
</html>`;
