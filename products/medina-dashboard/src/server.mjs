#!/usr/bin/env node
// Medina Dashboard — single-file local HTTP server.
// Reads ~/.medina/vault.json + ~/.medina/signal.json + council state,
// serves one HTML page at http://localhost:8731 that shows everything.
//
// Zero deps. Node 20+. No build step. Run: `node src/server.mjs`

import { createServer } from 'node:http';
import { promises as fs } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.MEDINA_DASHBOARD_PORT || 8731);
const MEDINA_HOME = process.env.MEDINA_HOME || join(homedir(), '.medina');
const VAULT_PATH  = process.env.MEDINA_VAULT_PATH  || join(MEDINA_HOME, 'vault.json');
const SIGNAL_PATH = process.env.MEDINA_SIGNAL_PATH || join(MEDINA_HOME, 'signal.json');

const PHI = 1.618033988749895;
const DECAY_THRESHOLD = 0.05;

async function readJsonSafe(p) {
  try { return JSON.parse(await fs.readFile(p, 'utf8')); }
  catch { return null; }
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
      value_preview: typeof e.value === 'string'
        ? e.value.slice(0, 200)
        : JSON.stringify(e.value).slice(0, 200),
    });
  }
  entries.sort((a, b) => b.strength - a.strength);
  return { total: entries.length, tiers, entries };
}

function signalStats(snapshot) {
  if (!snapshot?.signals) return { total: 0, roles: [], recent: [] };
  return {
    total: snapshot.signals.length,
    roles: snapshot.roles || [],
    recent: snapshot.signals.slice(-20).reverse(),
  };
}

async function gatherState() {
  const [vault, signal] = await Promise.all([
    readJsonSafe(VAULT_PATH),
    readJsonSafe(SIGNAL_PATH),
  ]);
  return {
    operator: process.env.MEDINA_OPERATOR_ID || process.env.USERNAME || process.env.USER || 'operator',
    medina_home: MEDINA_HOME,
    protocol: 'MEDINA-PROTOCOL/0.1',
    phi: PHI,
    heartbeat_ms: 873,
    vault: { path: VAULT_PATH, ...vaultStats(vault) },
    signal: { path: SIGNAL_PATH, ...signalStats(signal) },
    timestamp: new Date().toISOString(),
  };
}

const HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Medina Mesh · Dashboard</title>
<style>
  :root {
    --bg: #07090e; --panel: #0d111a; --line: #1a2233;
    --ink: #e5e8ef; --dim: #6b7280; --gold: #d4a843; --green: #34d399;
    --pri: #6366f1; --sov: #ef4444; --sha: #06b6d4; --pub: #94a3b8;
    --mono: ui-monospace, SFMono-Regular, "JetBrains Mono", Consolas, monospace;
  }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 32px; background: var(--bg); color: var(--ink);
         font: 14px/1.5 var(--mono); }
  header { display: flex; align-items: baseline; gap: 16px; margin-bottom: 24px; }
  header h1 { margin: 0; font-size: 18px; letter-spacing: 0.12em; }
  header .sub { color: var(--dim); font-size: 12px; }
  header .live { color: var(--green); font-size: 12px; margin-left: auto; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  @media (max-width: 900px) { .grid { grid-template-columns: 1fr; } }
  .panel { background: var(--panel); border: 1px solid var(--line); border-radius: 4px;
           padding: 16px; }
  .panel h2 { margin: 0 0 12px; font-size: 12px; color: var(--gold);
              text-transform: uppercase; letter-spacing: 0.18em; }
  .stats { display: flex; gap: 16px; flex-wrap: wrap; margin-bottom: 12px; }
  .stat { display: flex; flex-direction: column; }
  .stat .n { font-size: 20px; color: var(--ink); }
  .stat .l { font-size: 10px; color: var(--dim); text-transform: uppercase; letter-spacing: 0.1em; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--line); }
  th { color: var(--dim); font-weight: normal; font-size: 10px;
       text-transform: uppercase; letter-spacing: 0.1em; }
  td.preview { color: var(--dim); max-width: 320px; overflow: hidden;
               text-overflow: ellipsis; white-space: nowrap; }
  .tier { display: inline-block; padding: 2px 6px; border-radius: 2px; font-size: 10px;
          letter-spacing: 0.08em; }
  .tier-PUBLIC    { background: #1e293b; color: var(--pub); }
  .tier-SHARED    { background: #0e3a4c; color: var(--sha); }
  .tier-PRIVATE   { background: #1e1b4b; color: var(--pri); }
  .tier-SOVEREIGN { background: #4c1d1d; color: var(--sov); }
  .pri { font-size: 10px; color: var(--gold); }
  .empty { color: var(--dim); padding: 16px 8px; text-align: center; font-style: italic; }
  .bar { height: 4px; background: var(--line); border-radius: 2px; overflow: hidden;
         margin-top: 4px; }
  .bar > i { display: block; height: 100%; background: var(--green); }
  footer { color: var(--dim); font-size: 11px; margin-top: 24px;
           border-top: 1px solid var(--line); padding-top: 12px; }
  code { color: var(--gold); }
</style>
</head>
<body>
<header>
  <h1>𓂀 MEDINA MESH</h1>
  <span class="sub">protocol <code>MEDINA-PROTOCOL/0.1</code> · φ=1.618 · heartbeat 873ms</span>
  <span class="live">● live · auto-refresh every 5s</span>
</header>

<div id="root"></div>

<footer id="footer"></footer>

<script>
const TIERS = ['SOVEREIGN','PRIVATE','SHARED','PUBLIC'];

async function load() {
  try {
    const res = await fetch('/state');
    const s = await res.json();
    render(s);
  } catch (e) {
    document.getElementById('root').innerHTML =
      '<div class="panel"><h2>error</h2><div class="empty">'+e.message+'</div></div>';
  }
}

function tier(t) { return '<span class="tier tier-'+t+'">'+t+'</span>'; }

function render(s) {
  const root = document.getElementById('root');
  const v = s.vault, sg = s.signal;

  const vaultRows = v.entries.length === 0
    ? '<tr><td colspan="5" class="empty">vault is empty — your AIs haven\\'t written anything yet</td></tr>'
    : v.entries.slice(0, 50).map(e => \`
      <tr>
        <td>\${tier(e.tier)}</td>
        <td><code>\${e.key}</code></td>
        <td>\${e.owner}</td>
        <td><span title="lineage depth">⛓ \${e.lineage_depth}</span></td>
        <td class="preview" title="\${escape(e.value_preview)}">\${escape(e.value_preview)}</td>
      </tr>\`).join('');

  const signalRows = sg.recent.length === 0
    ? '<tr><td colspan="5" class="empty">no signals yet — AIs haven\\'t talked to each other</td></tr>'
    : sg.recent.map(x => \`
      <tr>
        <td><span class="pri">\${x.priority}</span></td>
        <td>\${x.type}</td>
        <td>\${x.from}\${x.to ? ' → '+x.to : ''}</td>
        <td><code>\${escape(x.subject)}</code></td>
        <td class="preview">\${escape(typeof x.payload === 'string' ? x.payload : JSON.stringify(x.payload ?? ''))}</td>
      </tr>\`).join('');

  const tierBars = TIERS.map(t => {
    const n = v.tiers[t] || 0;
    const pct = v.total ? Math.round((n / v.total) * 100) : 0;
    return \`<div style="flex:1">
      <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--dim)">
        <span>\${t}</span><span>\${n}</span>
      </div>
      <div class="bar"><i style="width:\${pct}%"></i></div>
    </div>\`;
  }).join('');

  const rolesList = sg.roles.length === 0
    ? '<span class="empty" style="padding:0;font-size:11px">no agents registered</span>'
    : sg.roles.map(([a,r]) => \`<code>\${a}</code><span style="color:var(--dim)">·\${r}</span>\`).join(' &nbsp; ');

  root.innerHTML = \`
    <div class="grid">
      <div class="panel">
        <h2>vault</h2>
        <div class="stats">
          <div class="stat"><div class="n">\${v.total}</div><div class="l">live entries</div></div>
          <div class="stat"><div class="n">\${(v.entries.reduce((s,e)=>s+e.lineage_depth,0)) || 0}</div><div class="l">lineage Σ</div></div>
          <div class="stat" style="flex:1"><div class="l">tiers</div><div style="display:flex;gap:8px;margin-top:4px">\${tierBars}</div></div>
        </div>
        <table>
          <thead><tr><th>tier</th><th>key</th><th>owner</th><th>depth</th><th>value</th></tr></thead>
          <tbody>\${vaultRows}</tbody>
        </table>
        <div style="font-size:10px;color:var(--dim);margin-top:8px">📁 \${v.path}</div>
      </div>

      <div class="panel">
        <h2>signal bus</h2>
        <div class="stats">
          <div class="stat"><div class="n">\${sg.total}</div><div class="l">signals</div></div>
          <div class="stat"><div class="n">\${sg.roles.length}</div><div class="l">agents</div></div>
        </div>
        <div style="font-size:11px;margin-bottom:8px">\${rolesList}</div>
        <table>
          <thead><tr><th>pri</th><th>type</th><th>from→to</th><th>subject</th><th>payload</th></tr></thead>
          <tbody>\${signalRows}</tbody>
        </table>
        <div style="font-size:10px;color:var(--dim);margin-top:8px">📁 \${sg.path}</div>
      </div>
    </div>\`;

  document.getElementById('footer').innerHTML =
    'operator <code>'+s.operator+'</code> · home <code>'+s.medina_home+'</code> · ' +
    'updated '+new Date(s.timestamp).toLocaleTimeString();
}

function escape(s) {
  return String(s ?? '').replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
}

load();
setInterval(load, 5000);
</script>
</body>
</html>`;

const server = createServer(async (req, res) => {
  if (req.url === '/state') {
    const state = await gatherState();
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(state));
    return;
  }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(HTML);
});

server.listen(PORT, () => {
  console.log(`\n  Medina Dashboard — http://localhost:${PORT}\n`);
  console.log(`  vault  : ${VAULT_PATH}`);
  console.log(`  signal : ${SIGNAL_PATH}`);
  console.log(`  Open the URL in your browser. Page auto-refreshes every 5 seconds.\n`);
});
