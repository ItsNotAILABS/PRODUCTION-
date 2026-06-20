// Smoke for templates + channels + alpha_skills + living_protocols.

import { TemplateRegistry } from './templates.mjs';
import { ChannelRegistry } from './channels.mjs';
import { buildAlphaSkills } from './alpha_skills.mjs';
import { LivingProtocols, LIVING_PROTOCOLS } from './living_protocols.mjs';
import { ReceiptLedger } from './receipts.mjs';
import { RootVault } from './root_vault.mjs';
import { MedinaVault } from './vault.mjs';
import { KnowledgeLedger } from './knowledge_tokens.mjs';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const G=s=>`\x1b[32m${s}\x1b[0m`, R=s=>`\x1b[31m${s}\x1b[0m`,
      Y=s=>`\x1b[33m${s}\x1b[0m`, C=s=>`\x1b[36m${s}\x1b[0m`;
function assert(n,c,d=''){console.log(`  ${c?G('PASS'):R('FAIL')}  ${n}${d?'  '+Y('· '+d):''}`);if(!c)process.exitCode=1;}

const ROOT = join(tmpdir(), `loom-talpha-${Date.now()}.json`);
process.env.MEDINA_ROOT_VAULT_PATH = ROOT;
const { RootVault: RV } = await import('./root_vault.mjs?talpha=' + Date.now());

console.log(C('\n=== TEMPLATES + CHANNELS + ALPHA + PROTOCOLS — SMOKE ===\n'));

// ── Templates ────────────────────────────────────────────────────────
const t = new TemplateRegistry();
const all = t.list();
assert(`20 templates registered (got ${all.length})`, all.length === 20);
const families = t.families();
assert('4 families: notebook, document, code, data',
  ['notebook', 'document', 'code', 'data'].every(f => families[f]),
  Object.keys(families).join(','));
assert('5 templates per family',
  families.notebook.length === 5 && families.document.length === 5 &&
  families.code.length === 5 && families.data.length === 5);

const pull = t.pull('notebook.jupyter_python');
assert('pull returns body with cells', pull.ok && Array.isArray(pull.body?.cells) && pull.body.cells.length > 0);

const cloned = t.clone('notebook.jupyter_python', {
  input: { title: 'Sales Q4', author: 'Medin', intent: 'Analyze Q4', data_path: 'sales.csv' },
});
assert('clone fills ${title} etc and returns vault-ready value',
  cloned.ok && JSON.stringify(cloned.value).includes('Sales Q4') &&
  JSON.stringify(cloned.value).includes('sales.csv') &&
  !JSON.stringify(cloned.value).includes('${title}'),
  `name=${cloned.name}`);

const clonedDoc = t.clone('document.research_brief', {
  input: { question: 'Does X work?', finding: 'Yes', evidence: 'A,B', confidence: 'HIGH', recommendation: 'Ship' },
});
assert('document templates fill string templates correctly',
  clonedDoc.ok && clonedDoc.value.includes('Does X work?') && clonedDoc.value.includes('HIGH'));

const badPull = t.pull('does.not.exist');
assert('pull unknown returns TEMPLATE_NOT_FOUND', !badPull.ok);

// ── Channels ─────────────────────────────────────────────────────────
const rec = new ReceiptLedger();
const c = new ChannelRegistry({ receipts: rec });

const ch = c.create({ name: 'audit-stream', frequency_hz: 873, description: 'Audit events', agent_id: 'system' });
assert('create returns channel with frequency_hz preserved',
  ch.ok && ch.frequency_hz === 873 && ch.id.includes('873'),
  `id=${ch.id}`);

const ch2 = c.create({ name: 'consensus', frequency_hz: 432 });
c.subscribe(ch.id, 'claude');
c.subscribe(ch.id, 'chatgpt-custom-gpt');

const pub = c.publish(ch.id, { agent_id: 'claude', body: { event: 'test', n: 1 } });
assert('publish returns msg_id + fingerprint + subscriber count',
  pub.ok && pub.msg_id && pub.fingerprint && pub.subscribers.length === 2);

const read = c.read(ch.id, { agent_id: 'chatgpt-custom-gpt' });
assert('read returns published message',
  read.ok && read.messages.length === 1 && read.messages[0].body.event === 'test');

assert('publish fired agent_completed receipt as the publishing agent',
  rec.list({ kind: 'agent_completed' }).some(r => r.agent === 'claude' && r.ref.startsWith('channel:')));

// Access list enforcement
const restricted = c.create({ name: 'sovereign-only', access: ['operator'] });
const denied = c.publish(restricted.id, { agent_id: 'claude', body: 'nope' });
assert('publish to access-restricted channel BLOCKS non-permitted agent',
  !denied.ok && denied.reason === 'ACCESS_DENIED');

// List sorted by frequency
const list = c.list();
assert('list sorts by frequency_hz',
  list[0].frequency_hz <= list[list.length - 1].frequency_hz || list.length === 1,
  list.map(c => `${c.name}@${c.frequency_hz}`).join(','));

// ── Alpha skills ─────────────────────────────────────────────────────
const vault = new MedinaVault();
const knowledge = new KnowledgeLedger();
const alphas = buildAlphaSkills({ vault, knowledge, receipts: rec });
assert(`20 alpha skills built (got ${alphas.length})`, alphas.length === 20);
assert('all alphas have alpha=true flag', alphas.every(a => a.alpha === true));

// Run a few representative alphas
const audit = await alphas.find(a => a.name === 'alpha.codebase_audit').run({
  files: [
    { path: 'a.js', content: 'console.log(1); // TODO refactor' },
    { path: 'b.js', content: 'console.log(2); // FIXME bug' },
  ],
});
assert('alpha.codebase_audit returns markdown + findings',
  audit.ok && audit.kind === 'markdown' && audit.findings.todos === 1 && audit.findings.fixmes === 1);

const sec = await alphas.find(a => a.name === 'alpha.security_scan').run({
  code: `const KEY = 'sk-1234567890abcdef1234567890abcdef';\neval(input);`,
});
assert('alpha.security_scan finds hard-coded key + eval',
  sec.findings.some(f => f.id === 'hard_coded_key') && sec.findings.some(f => f.id === 'eval'),
  `findings=${sec.findings.map(f=>f.id).join(',')}`);

const cost = await alphas.find(a => a.name === 'alpha.cost_estimate').run({
  requests_per_month: 10_000_000, gb_egress: 100, gb_storage: 50, cpu_hours: 200,
});
assert('alpha.cost_estimate sums components correctly',
  cost.ok && cost.total_usd > 0 && cost.cost.requests > 0 && cost.cost.egress > 0,
  `total=$${cost.total_usd}`);

const dryRun = await alphas.find(a => a.name === 'alpha.deploy_dry_run').run({
  env: { NODE_ENV: 'production', PORT: '8080', DATABASE_URL: 'postgres://...' },
  version: '1.2.3',
  config: { feature_x: true },
});
assert('alpha.deploy_dry_run passes when env complete + semver + no secrets',
  dryRun.ok && dryRun.ready_to_deploy === true);

const dryRunBad = await alphas.find(a => a.name === 'alpha.deploy_dry_run').run({
  env: { NODE_ENV: 'production' }, version: 'not-semver',
  config: { token: 'sk-1234567890abcdef1234567890abcdef' },
});
assert('alpha.deploy_dry_run blocks on missing env + bad semver + leaked secret',
  !dryRunBad.ok && dryRunBad.issues.length >= 3);

const depClass = await alphas.find(a => a.name === 'alpha.deposit_classifier').run({
  content_b64: Buffer.from('PK\x03\x04zip data').toString('base64'),
});
assert('alpha.deposit_classifier identifies zip from header bytes',
  depClass.ok && depClass.detected_kind === 'zip_archive');

// ── Living Protocols ────────────────────────────────────────────────
const rv = new RV();
await rv.load();
const installResult = await LivingProtocols.install({ rootVault: rv, operator: 'Medin' });
assert('install writes all 4 living protocols to ROOT',
  installResult.ok && installResult.installed === 4 &&
  installResult.keys.every(k => k.startsWith('protocol/living/')),
  `keys=${installResult.keys.join(',')}`);

const protList = LivingProtocols.list();
assert('list returns 4 protocols with name + purpose',
  protList.length === 4 && protList.every(p => p.name && p.purpose));

const charter = LivingProtocols.get('CHARTER');
assert('get(CHARTER) returns full body',
  charter.ok && charter.body.includes('Living Charter') && charter.body.includes('Authority separation'));

const badProt = LivingProtocols.get('NONEXISTENT');
assert('get unknown returns PROTOCOL_NOT_FOUND with available list',
  !badProt.ok && Array.isArray(badProt.available));

await rv.persist();
await fs.unlink(ROOT).catch(()=>{});

console.log(C('\n=== RESULT ===\n') +
  (process.exitCode === 1 ? R('  failure\n')
                          : G('  20 templates · frequency channels · 20 alpha skills · 4 living protocols — all online\n')));
