// Council smoke — verify voting + thresholds + veto.
import { Council } from './council.mjs';

const G = (s) => `\x1b[32m${s}\x1b[0m`;
const R = (s) => `\x1b[31m${s}\x1b[0m`;
const C = (s) => `\x1b[36m${s}\x1b[0m`;
const Y = (s) => `\x1b[33m${s}\x1b[0m`;

function assert(name, cond, detail = '') {
  console.log(`  ${cond ? G('PASS') : R('FAIL')}  ${name}${detail ? '  ' + Y('· ' + detail) : ''}`);
  if (!cond) process.exitCode = 1;
}

export async function run() {
  console.log(C('\n=== MEDINA COUNCIL — SMOKE ===\n'));

  const c = new Council();

  // 1. Open
  const o = c.open('t1', 'Ship feature X?', 'operator');
  assert('open task', o.ok && o.taskId === 't1');

  // 2. Reopening rejected
  const o2 = c.open('t1', 'dup', 'op');
  assert('duplicate open rejected', !o2.ok && o2.reason === 'TASK_ALREADY_OPEN');

  // 3. Cast votes
  const v1 = c.vote({ taskId: 't1', agentId: 'lead',    role: 'LEAD',        content: 'ship', confidence: 0.9 });
  const v2 = c.vote({ taskId: 't1', agentId: 'analyst', role: 'ANALYST',     content: 'ship', confidence: 0.85 });
  const v3 = c.vote({ taskId: 't1', agentId: 'synth',   role: 'SYNTHESIZER', content: 'ship', confidence: 0.8 });
  assert('three votes accepted', v1.ok && v2.ok && v3.ok && v3.totalVotes === 3);

  // 4. Idempotent vote update
  const v1b = c.vote({ taskId: 't1', agentId: 'lead', role: 'LEAD', content: 'ship', confidence: 0.95 });
  assert('vote update is idempotent', v1b.ok && v1b.totalVotes === 3, `total=${v1b.totalVotes}`);

  // 5. Resolve approves
  const r = c.resolve('t1');
  assert('approval clears φ⁻¹ threshold', r.approved && r.approvalRatio >= 0.618,
         `ratio=${r.approvalRatio}`);
  assert('winner is highest-weighted approver', r.winner?.agentId === 'lead',
         `winner=${r.winner?.agentId}`);

  // 6. Caching — second resolve returns cached result
  const r2 = c.resolve('t1');
  assert('second resolve returns cached', r2.cached === true);

  // 7. Veto path
  c.open('t2', 'Touch the prod database?', 'op');
  c.vote({ taskId: 't2', agentId: 'lead', role: 'LEAD', content: 'go', confidence: 0.9 });
  c.vote({ taskId: 't2', agentId: 'sov',  role: 'SOVEREIGN', content: 'no', confidence: 0.1 }); // below floor → veto
  const rv = c.resolve('t2');
  assert('SOVEREIGN below-floor vetoes', rv.vetoed && !rv.approved);

  // 8. Rejection path — high confidence but ratio below threshold (all low-weight roles dissent)
  c.open('t3', 'risky', 'op');
  c.vote({ taskId: 't3', agentId: 'r1', role: 'RESEARCHER', content: 'yes', confidence: 0.9 });
  c.vote({ taskId: 't3', agentId: 'l1', role: 'LEAD',       content: 'no',  confidence: 0.1 });
  c.vote({ taskId: 't3', agentId: 's1', role: 'SYNTHESIZER',content: 'no',  confidence: 0.1 });
  const r3 = c.resolve('t3');
  assert('rejection: ratio below threshold, no veto', !r3.approved && !r3.vetoed,
         `ratio=${r3.approvalRatio}`);

  // 9. Status
  const st = c.status();
  assert('status counts cover all tasks',
         st.total === 3 && st.APPROVED === 1 && st.VETOED === 1 && st.REJECTED === 1,
         JSON.stringify(st));

  console.log(C('\n=== RESULT ===\n') +
    (process.exitCode === 1 ? R('  failure\n') : G('  Council online · ratio ≥ φ⁻¹ enforced · veto enforced\n')));
}

import { pathToFileURL } from 'node:url';
if (import.meta.url === pathToFileURL(process.argv[1]).href) run();
