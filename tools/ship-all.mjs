#!/usr/bin/env node
// ship-all.mjs — repo-level release gate.
// Runs both smoke suites for every product. Exits non-zero on any failure.

import { spawnSync } from 'node:child_process';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PRODUCTS = ['medina-vault', 'medina-council', 'medina-signal'];

const G = s => `\x1b[32m${s}\x1b[0m`, R = s => `\x1b[31m${s}\x1b[0m`,
      C = s => `\x1b[36m${s}\x1b[0m`, Y = s => `\x1b[33m${s}\x1b[0m`;

function run(label, cmd, args, cwd) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', cwd });
  const ok = r.status === 0;
  const pass = (r.stdout.match(/PASS/g) || []).length;
  const fail = (r.stdout.match(/FAIL/g) || []).length;
  console.log(`  ${ok ? G('PASS') : R('FAIL')}  ${label}  · ${pass} pass / ${fail} fail`);
  if (!ok) console.log(Y('    ---- output ----\n') + r.stdout + r.stderr);
  return ok;
}

console.log(C('\n=== SHIP ALL · MEDINA-PROTOCOL/0.2 ===\n'));
let allOk = true;
for (const p of PRODUCTS) {
  const cwd = join(ROOT, 'products', p);
  console.log(C(`\n[ ${p} ]`));
  allOk = run(`${p} · unit smoke`, process.execPath, ['src/_smoke.mjs'], cwd) && allOk;
  allOk = run(`${p} · MCP wire`,    process.execPath, ['src/_mcp_smoke.mjs'], cwd) && allOk;
  // Vault has a third suite: skills + keys + workflows + spectral
  if (p === 'medina-vault') {
    allOk = run(`${p} · skills/keys/workflows/spectral`,
                process.execPath, ['src/_skills_smoke.mjs'], cwd) && allOk;
    allOk = run(`${p} · graph/knowledge/sandbox/receipts/integrations`,
                process.execPath, ['src/_layer_smoke.mjs'], cwd) && allOk;
    allOk = run(`${p} · workspace/plans/context/consolidation/reinforcement`,
                process.execPath, ['src/_workspace_smoke.mjs'], cwd) && allOk;
    allOk = run(`${p} · efficiency (cache/budget/context-delta)`,
                process.execPath, ['src/_efficiency_smoke.mjs'], cwd) && allOk;
    allOk = run(`${p} · efficiency engine (20 models, autonomous receipts)`,
                process.execPath, ['src/_engine_smoke.mjs'], cwd) && allOk;
    allOk = run(`${p} · failure registry (pattern detection, auto-fix proposal)`,
                process.execPath, ['src/_failures_smoke.mjs'], cwd) && allOk;
    allOk = run(`${p} · embedded agents (5 native, async dispatch)`,
                process.execPath, ['src/_agents_smoke.mjs'], cwd) && allOk;
  }
}

// Vault's charter gate
console.log(C('\n[ charter ]'));
allOk = run('charter · release-gate', process.execPath,
  ['charter/tools/release-gate.mjs'], join(ROOT, 'products', 'medina-vault')) && allOk;

console.log(C('\n=== VERDICT ===\n'));
console.log(allOk
  ? G('  SHIP_ALL · every node green · MEDINA-PROTOCOL/0.1 fully covered\n')
  : R('  HOLD · one or more checks failed\n'));
process.exit(allOk ? 0 : 1);
