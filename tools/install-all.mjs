#!/usr/bin/env node
// install-all.mjs — wire ALL three Medina MCP servers (vault + council + signal)
// into every MCP client on this machine. One command, three nodes, all five clients.
//
// Run: node tools/install-all.mjs            (write)
// Run: node tools/install-all.mjs --dry-run  (report only)

import { promises as fs } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { homedir, platform } from 'node:os';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '..');
const OPERATOR = process.env.MEDINA_OPERATOR_ID
              ?? process.env.USER ?? process.env.USERNAME ?? 'operator';
const MEDINA_HOME = process.env.MEDINA_HOME ?? join(homedir(), '.medina');

const SERVERS = [
  { name: 'loom',         path: join(ROOT, 'products/medina-vault/src/server.mjs'),
    env: { MEDINA_OPERATOR_ID: OPERATOR, MEDINA_VAULT_PATH: join(MEDINA_HOME, 'vault.json') } },
  { name: 'loom-council', path: join(ROOT, 'products/medina-council/src/server.mjs'),
    env: { MEDINA_OPERATOR_ID: OPERATOR } },
  { name: 'loom-signal',  path: join(ROOT, 'products/medina-signal/src/server.mjs'),
    env: { MEDINA_OPERATOR_ID: OPERATOR, MEDINA_SIGNAL_PATH: join(MEDINA_HOME, 'signal.json') } },
];

// Legacy server names to clean up from existing client configs.
const LEGACY_NAMES = ['medina-vault', 'medina-council', 'medina-signal'];

const G = s => `\x1b[32m${s}\x1b[0m`, Y = s => `\x1b[33m${s}\x1b[0m`,
      R = s => `\x1b[31m${s}\x1b[0m`, C = s => `\x1b[36m${s}\x1b[0m`,
      D = s => `\x1b[2m${s}\x1b[0m`;
const DRY = process.argv.includes('--dry-run');

function candidatePaths() {
  const plat = platform(), home = homedir(), appdata = process.env.APPDATA;
  const e = (name, paths) => ({ name, paths });
  if (plat === 'win32') return [
    e('claude-desktop', [appdata && join(appdata,'Claude','claude_desktop_config.json')].filter(Boolean)),
    e('cursor',         [join(home,'.cursor','mcp.json')]),
    e('cline',          [appdata && join(appdata,'Code','User','globalStorage','saoudrizwan.claude-dev','settings','cline_mcp_settings.json')].filter(Boolean)),
    e('continue',       [join(home,'.continue','mcpServers')]),
    e('zed',            [appdata && join(appdata,'Zed','settings.json')].filter(Boolean)),
  ];
  if (plat === 'darwin') return [
    e('claude-desktop', [join(home,'Library/Application Support/Claude/claude_desktop_config.json')]),
    e('cursor',         [join(home,'.cursor','mcp.json')]),
    e('cline',          [join(home,'Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json')]),
    e('continue',       [join(home,'.continue','mcpServers')]),
    e('zed',            [join(home,'.config/zed/settings.json')]),
  ];
  return [
    e('claude-desktop', [join(home,'.config/Claude/claude_desktop_config.json')]),
    e('cursor',         [join(home,'.cursor','mcp.json')]),
    e('cline',          [join(home,'.config/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json')]),
    e('continue',       [join(home,'.continue','mcpServers')]),
    e('zed',            [join(home,'.config/zed/settings.json')]),
  ];
}

const exists = async p => { try { await fs.access(p); return true; } catch { return false; } };
const ensure = async p => fs.mkdir(dirname(p), { recursive: true });

async function backupOnce(p) {
  if (DRY) return;
  const bak = `${p}.medina-bak`;
  if (await exists(p) && !(await exists(bak))) await fs.copyFile(p, bak);
}

function jsonSnippet(srv) {
  return { command: 'node', args: [srv.path], env: srv.env };
}
function yamlSnippet(srv) {
  return [
    `name: ${srv.name}`,
    'command: node',
    `args: ["${srv.path.replace(/\\/g, '\\\\')}"]`,
    'env:',
    ...Object.entries(srv.env).map(([k,v]) => `  ${k}: "${String(v).replace(/\\/g, '\\\\')}"`),
    '',
  ].join('\n');
}

async function writeJsonMcp(p, rootKey) {
  let obj = {};
  if (await exists(p)) { try { obj = JSON.parse(await fs.readFile(p,'utf8')) || {}; } catch {} }
  obj[rootKey] = obj[rootKey] || {};
  let changed = false;
  // Remove legacy server entries (medina-* renamed to loom*)
  for (const legacy of LEGACY_NAMES) {
    if (obj[rootKey][legacy]) { delete obj[rootKey][legacy]; changed = true; }
  }
  for (const srv of SERVERS) {
    const before = JSON.stringify(obj[rootKey][srv.name] || null);
    obj[rootKey][srv.name] = jsonSnippet(srv);
    if (before !== JSON.stringify(obj[rootKey][srv.name])) changed = true;
  }
  if (!changed) return { changed: false };
  if (DRY) return { changed: true, dry: true };
  await ensure(p); await backupOnce(p);
  await fs.writeFile(p, JSON.stringify(obj, null, 2) + '\n', 'utf8');
  return { changed: true };
}

async function writeContinueDir(dirPath) {
  let any = false;
  for (const srv of SERVERS) {
    const filePath = join(dirPath, `${srv.name}.yaml`);
    const body = yamlSnippet(srv);
    if (await exists(filePath)) {
      const cur = await fs.readFile(filePath, 'utf8');
      if (cur.trim() === body.trim()) continue;
    }
    any = true;
    if (DRY) continue;
    await ensure(filePath);
    await backupOnce(filePath);
    await fs.writeFile(filePath, body, 'utf8');
  }
  return { changed: any, dry: DRY };
}

async function main() {
  console.log(C('\n=== medina · install all three nodes into every client ===\n'));
  console.log(D(`operator    : ${OPERATOR}`));
  console.log(D(`medina home : ${MEDINA_HOME}`));
  console.log(D(`servers     : ${SERVERS.map(s => s.name).join(', ')}`));
  console.log(D(`mode        : ${DRY ? 'DRY-RUN (no writes)' : 'WRITE'}\n`));

  const candidates = candidatePaths();
  for (const { name, paths } of candidates) {
    let target = null;
    for (const p of paths) { if (await exists(p)) { target = p; break; } }
    if (!target && paths.length) target = paths[0];
    if (!target) continue;

    let res;
    try {
      if (name === 'continue')     res = await writeContinueDir(target);
      else if (name === 'zed')     res = await writeJsonMcp(target, 'context_servers');
      else                          res = await writeJsonMcp(target, 'mcpServers');
    } catch (e) { res = { changed: false, error: e.message }; }

    const tag = res.error ? R('ERROR')
              : res.changed ? (res.dry ? Y('WOULD-WRITE') : G('WROTE  '))
              : D('UP-TO-DATE');
    console.log(`  ${tag}  ${name.padEnd(16)} ${D('→ ' + target)}`);
    if (res.error) console.log(D('             ' + res.error));
  }
  console.log(C('\n=== done ===') + '\n' +
    (DRY ? D('  Re-run without --dry-run to apply.\n')
         : D('  Restart each app. Backups: <config>.medina-bak.\n')));
}

main().catch(e => { console.error('install error:', e.message); process.exit(1); });
