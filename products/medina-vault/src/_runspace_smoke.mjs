// Smoke for runspace.mjs + crypto_ext.mjs — local sandboxed execution +
// upgraded multi-hash, all computed locally.

import { Runspace } from './runspace.mjs';
import { multiHash, sha256, sha3_256, hmac, hmacVerify, verifyChain, chainHash,
         randomToken, genesisFor } from './crypto_ext.mjs';
import { ReceiptLedger } from './receipts.mjs';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const G=s=>`\x1b[32m${s}\x1b[0m`, R=s=>`\x1b[31m${s}\x1b[0m`,
      Y=s=>`\x1b[33m${s}\x1b[0m`, C=s=>`\x1b[36m${s}\x1b[0m`;
function assert(n,c,d=''){console.log(`  ${c?G('PASS'):R('FAIL')}  ${n}${d?'  '+Y('· '+d):''}`);if(!c)process.exitCode=1;}

// Isolate runspace + root
const TMP = join(tmpdir(), `loom-runspace-test-${Date.now()}`);
process.env.MEDINA_RUNSPACE_PATH = TMP;
const { Runspace: RS } = await import('./runspace.mjs?fresh=' + Date.now());

console.log(C('\n=== CRYPTO_EXT — SMOKE ===\n'));

// ── Multi-hash deterministic + non-collision with SHA-256 alone ──────
const m1 = multiHash('hello world');
const m2 = multiHash('hello world');
assert('multiHash is deterministic — same input → same output',
  m1.combined === m2.combined && m1.sha3_256 === m2.sha3_256);
assert('sha256 and sha3_256 produce DIFFERENT digests (different families)',
  m1.sha256 !== m1.sha3_256 &&
  /^[a-f0-9]{64}$/.test(m1.sha256) &&
  /^[a-f0-9]{64}$/.test(m1.sha3_256),
  `sha256=${m1.sha256.slice(0,16)} sha3=${m1.sha3_256.slice(0,16)}`);
assert('combined hash is also 64 hex chars',
  /^[a-f0-9]{64}$/.test(m1.combined));

const m3 = multiHash('hello world!');
assert('different input → different combined hash', m1.combined !== m3.combined);

// ── HMAC ─────────────────────────────────────────────────────────────
const key = 'super-secret-key';
const mac = hmac(key, 'message');
assert('HMAC produces hex digest', /^[a-f0-9]{64}$/.test(mac));
assert('HMAC verify succeeds with correct key', hmacVerify(key, 'message', mac));
assert('HMAC verify fails with wrong key', !hmacVerify('wrong-key', 'message', mac));
assert('HMAC verify fails with tampered text', !hmacVerify(key, 'tampered', mac));

// ── Chain verification ──────────────────────────────────────────────
const genesis = genesisFor('test-chain');
const entries = [];
let prev = genesis;
for (let i = 0; i < 4; i++) {
  const payload = { i, note: `entry ${i}` };
  const h = chainHash({ prev_hash: prev, payload });
  entries.push({ prev_hash: prev, payload, hash: h });
  prev = h;
}
const v = verifyChain(entries, { genesis });
assert('verifyChain says ok=true for a clean chain', v.ok && v.length === 4,
  JSON.stringify({ok: v.ok, length: v.length}));

// Tamper one
entries[2].payload.note = 'tampered';
const vBroken = verifyChain(entries, { genesis });
assert('verifyChain detects tampered entry at first_broken_index',
  !vBroken.ok && vBroken.first_broken_index === 2,
  `idx=${vBroken.first_broken_index}`);

// Random tokens
const tok = randomToken(24);
assert('randomToken produces ≥32-char base64url',
  /^[A-Za-z0-9_-]{32,}$/.test(tok), `len=${tok.length}`);
const tok2 = randomToken(24);
assert('two random tokens differ', tok !== tok2);

console.log(C('\n=== RUNSPACE — SMOKE ===\n'));

const rec = new ReceiptLedger();
const rs = new RS({ receipts: rec });

// Create a job
const job = await rs.createJob({ label: 'hello-test' });
assert('createJob returns { id, path }',
  job.ok && job.id.startsWith('job_') && job.path.includes(TMP),
  `id=${job.id} path=${job.path}`);

// Receipt fired
assert('createJob fires runspace_job_created via agent_dispatched receipt',
  rec.list({ kind: 'agent_dispatched' }).some(r => r.ref.startsWith('runspace:')));

// Write a file
const w = await rs.writeFile(job.id, {
  path: 'hello.js',
  content: 'console.log("hello from runspace " + (1+1));',
});
assert('writeFile inside the job folder succeeds',
  w.ok && w.bytes > 0 && /^[a-f0-9]{64}$/.test(w.hash),
  `bytes=${w.bytes}`);

// Path traversal blocked
const escape = await rs.writeFile(job.id, { path: '../escape.txt', content: 'bad' });
assert('path traversal (../) is BLOCKED',
  !escape.ok && escape.reason === 'PATH_ESCAPE_DENIED');

// Execute node command — disallowed command rejected
const badCmd = await rs.exec(job.id, { command: 'rm', args: ['-rf', '/'] });
assert('disallowed command rejected with allowed list',
  !badCmd.ok && badCmd.reason === 'COMMAND_NOT_ALLOWED' && Array.isArray(badCmd.allowed));

// Real node execution — captures stdout
const run = await rs.exec(job.id, { command: 'node', args: ['hello.js'], timeout_ms: 5000 });
assert('node execution returns ok + exit_code=0 + stdout',
  run.ok && run.exit_code === 0 && run.stdout.includes('hello from runspace 2'),
  `stdout="${run.stdout.trim()}"`);

assert('exec fires agent_completed receipt with exit_code in meta',
  rec.list({ kind: 'agent_completed' }).some(r =>
    r.ref.startsWith('runspace:') && r.meta?.exit_code === 0));

// Timeout test
await rs.writeFile(job.id, {
  path: 'slow.js',
  content: 'setInterval(() => {}, 100); console.log("started");',
});
const slowRun = await rs.exec(job.id, { command: 'node', args: ['slow.js'], timeout_ms: 500 });
assert('runaway process killed by timeout',
  !slowRun.ok && slowRun.timed_out === true && slowRun.ms < 2000,
  `timed_out=${slowRun.timed_out} ms=${slowRun.ms}`);

// Collect lists script-created files
await rs.writeFile(job.id, {
  path: 'creator.js',
  content: `import { writeFileSync } from 'node:fs'; writeFileSync('created.txt', 'output by script');`,
});
const createRun = await rs.exec(job.id, { command: 'node', args: ['--input-type=module', '-e',
  `import {writeFileSync} from 'node:fs'; writeFileSync('created.txt', 'output');`] });
assert('inline script that creates a file succeeds', createRun.ok, `stderr=${createRun.stderr?.slice(0,80)}`);

const collected = await rs.collect(job.id);
assert('collect lists files written by both vault and script',
  collected.ok && collected.files.some(f => f.path === 'hello.js') &&
  collected.files.some(f => f.path === 'created.txt'),
  collected.files.map(f => f.path).join(','));

// Cleanup
const cleanup = await rs.cleanup(job.id);
assert('cleanup removes the job folder', cleanup.ok);

try { await fs.access(job.path); assert('job folder removed after cleanup', false); }
catch { assert('job folder removed after cleanup', true); }

// Stats
const stats = rs.stats();
assert('stats report allowed_commands list and limits',
  stats.allowed_commands.includes('node') && stats.allowed_commands.includes('python') &&
  stats.limits.default_timeout_ms === 30_000);

// Cleanup tmp root
try { await fs.rm(TMP, { recursive: true, force: true }); } catch {}

console.log(C('\n=== RESULT ===\n') +
  (process.exitCode === 1 ? R('  failure\n')
                          : G('  Runspace online · sandboxed exec with timeout + allow-list · multi-hash SHA-256 + SHA3-256 + HMAC verified\n')));
