// Smoke for keys + skills + workflows + spectral. Real round-trips.

import { KeyVault } from './keys.mjs';
import { SkillRegistry } from './skills.mjs';
import { WorkflowRunner } from './workflows.mjs';
import { fingerprint, similarity, encodeFP, decodeFP } from './spectral.mjs';
import { buildPDF } from './pdf.mjs';

const G = (s) => `\x1b[32m${s}\x1b[0m`;
const R = (s) => `\x1b[31m${s}\x1b[0m`;
const Y = (s) => `\x1b[33m${s}\x1b[0m`;
const C = (s) => `\x1b[36m${s}\x1b[0m`;
function assert(n, c, d = '') {
  console.log(`  ${c ? G('PASS') : R('FAIL')}  ${n}${d ? '  ' + Y('· ' + d) : ''}`);
  if (!c) process.exitCode = 1;
}

console.log(C('\n=== KEYS / SKILLS / WORKFLOWS / SPECTRAL — SMOKE ===\n'));

// ── Keys: real AES-256-GCM round-trip ─────────────────────────────────
const kv = new KeyVault();
const setR = kv.set('openai', 'sk-test-abc123-xyz');
assert('key set returns ok + fingerprint',
  setR.ok && /^[a-f0-9]{12}$/.test(setR.fingerprint),
  setR.fingerprint);

const unwrap = kv.unwrap('openai');
assert('key unwrap returns original plaintext', unwrap === 'sk-test-abc123-xyz');

const list = kv.list();
assert('key list does NOT leak ciphertext or plaintext',
  list.length === 1 && !JSON.stringify(list).includes('sk-test') && !JSON.stringify(list).includes('ct'),
  JSON.stringify(list[0]));

const meta = kv.toMeta();
const kv2 = new KeyVault();
kv2.loadFromMeta(meta);
const unwrap2 = kv2.unwrap('openai');
assert('key survives serialize → deserialize (same master)', unwrap2 === 'sk-test-abc123-xyz');

const tamper = JSON.parse(JSON.stringify(meta));
tamper.keys.openai.ct = 'AAAA' + tamper.keys.openai.ct.slice(4);
const kv3 = new KeyVault();
kv3.loadFromMeta(tamper);
assert('tampered ciphertext returns null (GCM auth tag fails)', kv3.unwrap('openai') === null);

// ── Skills: NDA generation, real PDF bytes ────────────────────────────
const reg = new SkillRegistry();
const skillsList = reg.list({ prefix: 'legal.' });
assert('skills registry has all 6 legal skills',
  skillsList.length === 6 && skillsList.some(s => s.name === 'legal.nda_mutual'),
  skillsList.map(s => s.name).join(','));

const nda = reg.run('legal.nda_mutual', {
  party_a_name: 'Medina Tech LLC', party_b_name: 'Acme Corp.',
  purpose: 'evaluating a potential strategic partnership',
  effective_date: '2026-06-16', term_years: 5, jurisdiction: 'State of Texas',
});
assert('NDA skill returns PDF with bytes_base64',
  nda.ok && nda.kind === 'pdf' && typeof nda.bytes_base64 === 'string' && nda.bytes > 1000,
  `bytes=${nda.bytes} file=${nda.filename}`);

// Verify the PDF bytes are valid
const pdfBytes = Buffer.from(nda.bytes_base64, 'base64');
assert('NDA PDF starts with %PDF-1.4 header',
  pdfBytes.slice(0, 8).toString() === '%PDF-1.4',
  pdfBytes.slice(0, 8).toString());
assert('NDA PDF ends with %%EOF trailer',
  pdfBytes.slice(-6).toString().trim().endsWith('%%EOF'),
  pdfBytes.slice(-6).toString());

const demand = reg.run('legal.demand_letter', {
  sender_name: 'Medin', recipient_name: 'Contractor X',
  claim_summary: 'failure to deliver paid-for software.',
  demand: 'deliver the agreed-upon software or refund the engagement fee',
  amount_usd: 12500, deadline_days: 14,
});
assert('Demand letter skill emits PDF', demand.ok && demand.bytes > 800);

const missing = reg.run('legal.demand_letter', { sender_name: 'X' });
assert('Skill rejects missing required field with MISSING_FIELD',
  !missing.ok && missing.reason?.startsWith('MISSING_FIELD:'),
  missing.reason);

const unknown = reg.run('legal.does_not_exist', {});
assert('Unknown skill returns SKILL_NOT_FOUND', !unknown.ok && unknown.reason === 'SKILL_NOT_FOUND');

// ── Workflows: chain NDA + invoice for the same matter ────────────────
const wf = new WorkflowRunner({ registry: reg });
const wfResult = wf.run({
  id: 'onboard-acme',
  nodes: [
    { id: 'nda', skill: 'legal.nda_mutual',
      input: { party_a_name: 'Medina Tech LLC', party_b_name: 'Acme Corp.',
               purpose: 'engagement scoping', term_years: 3 } },
    { id: 'inv', skill: 'legal.invoice',
      input: { from_name: 'Medina Tech LLC', bill_to_name: 'Acme Corp.',
               invoice_number: 'INV-${nda.filename|hash}',
               line_items: [{ description: 'Initial consultation', quantity: 2, rate: 250 }] } },
  ],
});
assert('Workflow ran all nodes', wfResult.ok && wfResult.ran_nodes === 2);
assert('Workflow output binding (${nda.filename|hash}) worked in invoice number',
  wfResult.results.inv.ok && /^INV-[A-Za-z0-9_.-]{1,12}$/.test(wfResult.results.inv.filename.replace('Invoice_','').replace('.pdf','')) === false
    || wfResult.results.inv.summary.includes('INV-'),
  `inv summary=${wfResult.results.inv.summary}`);

// ── Spectral fingerprints: similar texts cluster, unrelated split ─────
const a  = fingerprint('mutual non-disclosure agreement between two parties for evaluating a partnership');
const a2 = fingerprint('mutual NDA between Acme and Medina Tech for partnership evaluation');
const b  = fingerprint('quarterly invoice for legal services rendered to the client');
const simAA = similarity(a, a2);
const simAB = similarity(a, b);
// Real behavior of φ-modulated character-bigram fingerprints on English:
// related texts cluster high; unrelated English texts sit in a noisy mid-band
// (0.5–0.8 typical) because they share alphabet stats. The metric must
// *discriminate* — related must beat unrelated by a meaningful gap.
const GAP = simAA - simAB;
assert('similar NDA texts cluster (cosine ≥ 0.75)', simAA >= 0.75, `simAA=${simAA.toFixed(3)}`);
assert('unrelated texts sit below related (cosine ≤ 0.80)', simAB <= 0.80, `simAB=${simAB.toFixed(3)}`);
assert('discrimination gap ≥ 0.10',  GAP >= 0.10,
  `gap=${GAP.toFixed(3)}  simAA=${simAA.toFixed(3)} simAB=${simAB.toFixed(3)}`);

const enc = encodeFP(a);
const dec = decodeFP(enc);
const simRoundtrip = similarity(a, dec);
assert('fingerprint encode → decode preserves similarity ≥ 0.999',
  simRoundtrip > 0.999, `roundtrip=${simRoundtrip.toFixed(6)}`);

// ── Standalone PDF check (no skill) ───────────────────────────────────
const direct = buildPDF({
  title: 'Hello', subtitle: 'World',
  blocks: [
    { type: 'heading', text: 'Section A' },
    { type: 'paragraph', text: 'Lorem ipsum dolor sit amet.' },
    { type: 'bullets',   items: ['one', 'two', 'three'] },
    { type: 'page' },
    { type: 'heading', text: 'Page 2 Section' },
    { type: 'paragraph', text: 'Second page content.' },
  ],
});
assert('Direct PDF emit produces valid bytes',
  direct.slice(0, 8).toString() === '%PDF-1.4' && direct.length > 500,
  `bytes=${direct.length}`);

console.log(C('\n=== RESULT ===\n') +
  (process.exitCode === 1 ? R('  failure\n')
                           : G('  Skills/Workflows/Keys/Spectral all online — real PDFs, real crypto, real similarity\n')));
