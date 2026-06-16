#!/usr/bin/env node
// release-gate.mjs — gate_a + gate_b + gate_c. All three or no ship.
//
// gate_a: vault smoke (laws compile into runtime) — 11/11 PASS
// gate_b: MCP wire smoke (server speaks the protocol) — 7/7 PASS
// gate_c: charter embedded into README — PRICING markers up to date
//
// Exit non-zero if any gate fails. Wired into `npm run ship:alpha`.

import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { TIERS, ENTERPRISE } from '../charter.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const PRODUCT_ROOT = join(here, '..', '..');

const G = (s) => `\x1b[32m${s}\x1b[0m`;
const R = (s) => `\x1b[31m${s}\x1b[0m`;
const Y = (s) => `\x1b[33m${s}\x1b[0m`;
const C = (s) => `\x1b[36m${s}\x1b[0m`;

function runNode(scriptRelPath, label) {
  const r = spawnSync(process.execPath, [join(PRODUCT_ROOT, scriptRelPath)], {
    encoding: 'utf8',
    stdio: 'pipe',
  });
  const ok = r.status === 0;
  const passCount = (r.stdout.match(/PASS/g) || []).length;
  const failCount = (r.stdout.match(/FAIL/g) || []).length;
  return { ok, passCount, failCount, output: r.stdout + r.stderr, label };
}

async function gateC() {
  const readme = await readFile(join(PRODUCT_ROOT, 'README.md'), 'utf8');
  const hasMarkers = readme.includes('<!-- PRICING:START -->') &&
                     readme.includes('<!-- PRICING:END -->');
  if (!hasMarkers) {
    return { ok: false, reason: 'PRICING markers missing — run embed-charter.mjs' };
  }
  // Each declared tier's name and price must appear in the block.
  const block = readme.split('<!-- PRICING:START -->')[1].split('<!-- PRICING:END -->')[0];
  const missing = [];
  for (const t of Object.values(TIERS)) {
    if (!block.includes(t.name)) missing.push(t.name);
    if (t.price_monthly > 0 && !block.includes(`$${t.price_monthly}`)) missing.push(`$${t.price_monthly}`);
  }
  if (!block.includes(`$${ENTERPRISE.price_per_seat_monthly}`)) missing.push(`$${ENTERPRISE.price_per_seat_monthly}`);
  if (missing.length) {
    return { ok: false, reason: 'README out of sync with charter: missing ' + missing.join(', ') };
  }
  return { ok: true };
}

async function main() {
  console.log(C('\n=== RELEASE GATE — Medina Vault ===\n'));

  // gate_a — laws compile into runtime
  const a = runNode('src/_smoke.mjs', 'gate_a · laws compile (smoke)');
  console.log(`  ${a.ok ? G('PASS') : R('FAIL')}  ${a.label}  · ${a.passCount} pass / ${a.failCount} fail`);

  // gate_b — MCP wire green
  const b = runNode('src/_mcp_smoke.mjs', 'gate_b · MCP wire (mcp smoke)');
  console.log(`  ${b.ok ? G('PASS') : R('FAIL')}  ${b.label}  · ${b.passCount} pass / ${b.failCount} fail`);

  // gate_c — charter embedded in README
  const c = await gateC();
  console.log(`  ${c.ok ? G('PASS') : R('FAIL')}  gate_c · charter embedded${c.reason ? '  ' + Y('· ' + c.reason) : ''}`);

  const all = a.ok && b.ok && c.ok;
  console.log(C('\n=== VERDICT ===\n'));
  if (all) {
    console.log(G('  SHIP_ALPHA  · all three gates green · MEDINA-PROTOCOL/0.1 ready for release\n'));
    process.exit(0);
  } else {
    console.log(R('  HOLD  · one or more gates failed · do not ship\n'));
    if (!a.ok) console.log(Y('---- gate_a output ----\n') + a.output);
    if (!b.ok) console.log(Y('---- gate_b output ----\n') + b.output);
    process.exit(1);
  }
}

main().catch((e) => { console.error('release-gate error:', e); process.exit(1); });
