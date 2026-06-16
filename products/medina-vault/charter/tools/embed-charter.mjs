#!/usr/bin/env node
// embed-charter.mjs — read charter.mjs, inject pricing block into README.
//
// The charter is the single source of truth. The README has marker
// comments where this script writes a generated pricing table. If the
// charter changes and this script isn't run, release-gate.mjs gate_c
// will fail. The artifact guards itself.

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { TIERS, ENTERPRISE, chartManifest } from '../charter.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const PRODUCT_ROOT = join(here, '..', '..');
const README = join(PRODUCT_ROOT, 'README.md');

const START = '<!-- PRICING:START -->';
const END   = '<!-- PRICING:END -->';

function renderPricingBlock() {
  const lines = [];
  lines.push(START);
  lines.push('');
  lines.push('## Tiers');
  lines.push('');
  lines.push('| Tier | Price / mo | Fibonacci | Includes |');
  lines.push('|---|---:|:---:|---|');
  for (const t of Object.values(TIERS)) {
    const price = t.price_monthly === 0 ? 'free' : `$${t.price_monthly}`;
    const include0 = t.includes[0] || '';
    lines.push(`| **${t.name}** | ${price} | F(${t.fib_index}) | ${t.description} |`);
    for (const line of t.includes) lines.push(`| | | | · ${line}`);
  }
  lines.push(`| **ENTERPRISE** | $${ENTERPRISE.price_per_seat_monthly}/seat | F(${ENTERPRISE.fib_index}) | min ${ENTERPRISE.min_seats} seats — ${ENTERPRISE.contact} |`);
  lines.push('');
  lines.push('*Pricing is Fibonacci-anchored to the same scale as the Medina runtime: φ, 873ms, fib(n).*');
  lines.push('*Charter version: ' + chartManifest().charter_version + ' · runtime-embedded — edit `charter/charter.mjs` to change.*');
  lines.push('');
  lines.push(END);
  return lines.join('\n');
}

async function main() {
  let readme;
  try {
    readme = await readFile(README, 'utf8');
  } catch {
    console.error(`[charter] README not found: ${README}`);
    process.exit(1);
  }

  const block = renderPricingBlock();
  let next;

  if (readme.includes(START) && readme.includes(END)) {
    const re = new RegExp(`${START}[\\s\\S]*?${END}`, 'm');
    next = readme.replace(re, block);
  } else {
    // Insert before the License section if present, else append at end.
    const licenseIdx = readme.indexOf('## License');
    if (licenseIdx >= 0) {
      next = readme.slice(0, licenseIdx) + block + '\n\n' + readme.slice(licenseIdx);
    } else {
      next = readme.trimEnd() + '\n\n' + block + '\n';
    }
  }

  if (next === readme) {
    console.log('[charter] README already up to date.');
    return;
  }

  await writeFile(README, next, 'utf8');
  console.log('[charter] embedded pricing block into README.md');
}

main().catch((e) => { console.error('[charter] error:', e.message); process.exit(1); });
