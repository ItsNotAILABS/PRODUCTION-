#!/usr/bin/env node
// install.mjs — detect MCP clients on this machine and write the
// medina-vault server config into each. Idempotent. Backs up before
// writing. Reports what changed.
//
// Run: `node src/install.mjs`            (writes)
// Run: `node src/install.mjs --dry-run`  (reports only)

import { promises as fs } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { homedir, platform } from 'node:os';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SERVER_PATH = resolve(here, 'server.mjs');
const VAULT_PATH  = process.env.MEDINA_VAULT_PATH
                 ?? join(homedir(), '.medina', 'vault.json');
const OPERATOR    = process.env.MEDINA_OPERATOR_ID
                 ?? process.env.USER ?? process.env.USERNAME ?? 'operator';

const G = (s) => `\x1b[32m${s}\x1b[0m`;
const Y = (s) => `\x1b[33m${s}\x1b[0m`;
const R = (s) => `\x1b[31m${s}\x1b[0m`;
const C = (s) => `\x1b[36m${s}\x1b[0m`;
const D = (s) => `\x1b[2m${s}\x1b[0m`;

const DRY_RUN = process.argv.includes('--dry-run');

// ── Detect candidate config paths per MCP client ────────────────────────

function candidatePaths() {
  const plat = platform();
  const home = homedir();
  const appdata = process.env.APPDATA;

  // Helper for client entries.
  const entry = (name, paths) => ({ name, paths });

  // Per-client config locations. Each path is checked in order; first
  // that exists is treated as the active config.
  if (plat === 'win32') {
    return [
      entry('claude-desktop', [
        appdata && join(appdata, 'Claude', 'claude_desktop_config.json'),
      ].filter(Boolean)),
      entry('cursor', [
        join(home, '.cursor', 'mcp.json'),
      ]),
      entry('cline', [
        appdata && join(appdata, 'Code', 'User', 'globalStorage', 'saoudrizwan.claude-dev', 'settings', 'cline_mcp_settings.json'),
      ].filter(Boolean)),
      entry('continue', [
        join(home, '.continue', 'mcpServers', 'medina-vault.yaml'),
      ]),
      entry('zed', [
        appdata && join(appdata, 'Zed', 'settings.json'),
      ].filter(Boolean)),
    ];
  }
  if (plat === 'darwin') {
    return [
      entry('claude-desktop', [
        join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json'),
      ]),
      entry('cursor', [ join(home, '.cursor', 'mcp.json') ]),
      entry('cline', [
        join(home, 'Library', 'Application Support', 'Code', 'User', 'globalStorage', 'saoudrizwan.claude-dev', 'settings', 'cline_mcp_settings.json'),
      ]),
      entry('continue', [ join(home, '.continue', 'mcpServers', 'medina-vault.yaml') ]),
      entry('zed', [ join(home, '.config', 'zed', 'settings.json') ]),
    ];
  }
  // linux
  return [
    entry('claude-desktop', [
      join(home, '.config', 'Claude', 'claude_desktop_config.json'),
    ]),
    entry('cursor', [ join(home, '.cursor', 'mcp.json') ]),
    entry('cline', [
      join(home, '.config', 'Code', 'User', 'globalStorage', 'saoudrizwan.claude-dev', 'settings', 'cline_mcp_settings.json'),
    ]),
    entry('continue', [ join(home, '.continue', 'mcpServers', 'medina-vault.yaml') ]),
    entry('zed', [ join(home, '.config', 'zed', 'settings.json') ]),
  ];
}

// ── Snippets per client ─────────────────────────────────────────────────

function jsonSnippet() {
  return {
    command: 'node',
    args: [SERVER_PATH],
    env: {
      MEDINA_OPERATOR_ID: OPERATOR,
      MEDINA_VAULT_PATH:  VAULT_PATH,
    },
  };
}

function yamlSnippet() {
  return [
    'name: medina-vault',
    'command: node',
    `args: ["${SERVER_PATH.replace(/\\/g, '\\\\')}"]`,
    'env:',
    `  MEDINA_OPERATOR_ID: "${OPERATOR}"`,
    `  MEDINA_VAULT_PATH:  "${VAULT_PATH.replace(/\\/g, '\\\\')}"`,
    '',
  ].join('\n');
}

// ── Read/merge/write JSON configs ───────────────────────────────────────

async function fileExists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

async function ensureDir(p) { await fs.mkdir(dirname(p), { recursive: true }); }

async function backupOnce(p) {
  if (DRY_RUN) return null;
  const bak = `${p}.medina-bak`;
  if (await fileExists(p) && !(await fileExists(bak))) {
    await fs.copyFile(p, bak);
    return bak;
  }
  return null;
}

async function writeJsonMcp(p, key /* "mcpServers" | "mcp.servers" */ = 'mcpServers') {
  let existing = {};
  if (await fileExists(p)) {
    try { existing = JSON.parse(await fs.readFile(p, 'utf8')) || {}; }
    catch { /* leave as {}, will be overwritten with merged shape */ }
  }
  // Cursor and Cline both use { mcpServers: { name: {...} } } at the root.
  // Claude Desktop is the same. Zed uses { "context_servers": { ... } } but
  // we'll just try `mcpServers` as the modern key and let the user adjust.
  const root = existing;
  root[key] = root[key] || {};
  const before = JSON.stringify(root[key]['medina-vault'] || null);
  root[key]['medina-vault'] = jsonSnippet();
  const after = JSON.stringify(root[key]['medina-vault']);
  if (before === after) return { changed: false };

  if (DRY_RUN) return { changed: true, dry: true };
  await ensureDir(p);
  await backupOnce(p);
  await fs.writeFile(p, JSON.stringify(root, null, 2) + '\n', 'utf8');
  return { changed: true };
}

async function writeYamlContinue(p) {
  const content = yamlSnippet();
  if (await fileExists(p)) {
    const cur = await fs.readFile(p, 'utf8');
    if (cur.trim() === content.trim()) return { changed: false };
  }
  if (DRY_RUN) return { changed: true, dry: true };
  await ensureDir(p);
  await backupOnce(p);
  await fs.writeFile(p, content, 'utf8');
  return { changed: true };
}

// ── Main ────────────────────────────────────────────────────────────────

async function main() {
  console.log(C('\n=== medina-vault install ===\n'));
  console.log(D(`server path : ${SERVER_PATH}`));
  console.log(D(`vault path  : ${VAULT_PATH}`));
  console.log(D(`operator    : ${OPERATOR}`));
  console.log(D(`mode        : ${DRY_RUN ? 'DRY-RUN (no writes)' : 'WRITE'}\n`));

  const candidates = candidatePaths();
  const summary = [];

  for (const { name, paths } of candidates) {
    let configPath = null;
    for (const p of paths) {
      if (await fileExists(p)) { configPath = p; break; }
    }
    // If none exist, take the first as the install target.
    if (!configPath && paths.length) configPath = paths[0];
    if (!configPath) continue;

    let res;
    try {
      if (name === 'continue')         res = await writeYamlContinue(configPath);
      else if (name === 'zed')         res = await writeJsonMcp(configPath, 'context_servers');
      else                              res = await writeJsonMcp(configPath, 'mcpServers');
    } catch (e) {
      res = { changed: false, error: e.message };
    }

    const tag = res.error
      ? R('ERROR')
      : res.changed
        ? (res.dry ? Y('WOULD-WRITE') : G('WROTE  '))
        : D('UP-TO-DATE');
    console.log(`  ${tag}  ${name.padEnd(16)} ${D('→ ' + configPath)}`);
    if (res.error) console.log(D('             ' + res.error));
    summary.push({ name, path: configPath, ...res });
  }

  const wrote = summary.filter(s => s.changed && !s.dry).length;
  const would = summary.filter(s => s.changed &&  s.dry).length;
  console.log(C('\n=== result ===\n'));
  if (DRY_RUN) {
    console.log(`  ${would} client(s) would be configured. Re-run without --dry-run to apply.\n`);
  } else {
    console.log(`  ${G(String(wrote))} client(s) configured. Restart each app to pick up the vault.\n`);
    console.log(D('  Backups: <config>.medina-bak (only created on first write).\n'));
  }
}

main().catch((e) => { console.error('install error:', e.message); process.exit(1); });
