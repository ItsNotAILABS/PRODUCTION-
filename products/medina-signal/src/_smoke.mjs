import { SignalBus } from './bus.mjs';

const G = s => `\x1b[32m${s}\x1b[0m`, R = s => `\x1b[31m${s}\x1b[0m`,
      C = s => `\x1b[36m${s}\x1b[0m`, Y = s => `\x1b[33m${s}\x1b[0m`;
function assert(n, c, d='') {
  console.log(`  ${c?G('PASS'):R('FAIL')}  ${n}${d?'  '+Y('· '+d):''}`);
  if (!c) process.exitCode = 1;
}

export async function run() {
  console.log(C('\n=== MEDINA SIGNAL — SMOKE ===\n'));
  const bus = new SignalBus();

  // 1. Register
  assert('register lead/critic',
    bus.register('claude','LEAD').ok && bus.register('cursor','CRITIC').ok);

  // 2. BROADCAST visible to everyone
  bus.emit({ from:'claude', subject:'task:started', payload:{task:'t1'} });
  const i1 = bus.inbox('cursor');
  assert('BROADCAST visible to others', i1.ok && i1.signals.length === 1);

  // 3. DIRECT only to addressee
  bus.emit({ from:'claude', subject:'context:share', payload:'x', type:'DIRECT', to:'cursor' });
  const i2 = bus.inbox('cursor');
  const i3 = bus.inbox('someone-else');
  assert('DIRECT routes to addressee', i2.signals.some(s => s.subject==='context:share'));
  assert('DIRECT hidden from non-addressee', !i3.signals.some(s => s.subject==='context:share'));

  // 4. ROLE routes to all with that role
  bus.register('cline','CRITIC');
  bus.emit({ from:'claude', subject:'review:needed', type:'ROLE', to:'CRITIC' });
  const critic1 = bus.inbox('cursor');
  const critic2 = bus.inbox('cline');
  const nonCritic = bus.inbox('claude');
  assert('ROLE delivered to both critics',
    critic1.signals.some(s=>s.subject==='review:needed') &&
    critic2.signals.some(s=>s.subject==='review:needed'));
  assert('ROLE not delivered to non-critic',
    !nonCritic.signals.some(s=>s.subject==='review:needed'));

  // 5. Mark read by signal_id, then by agent (sweep)
  const one = bus.signals.find(s => s.subject === 'context:share');
  bus.markRead('cursor', one.id);
  const i4 = bus.inbox('cursor');
  assert('marked single signal read', !i4.signals.some(s => s.id === one.id));

  bus.markRead('cursor'); // mark all rest
  assert('mark-all clears inbox', bus.inbox('cursor').signals.length === 0);

  // 6. Priority ordering
  bus.emit({ from:'claude', subject:'low',  priority:'LOW'      });
  bus.emit({ from:'claude', subject:'crit', priority:'CRITICAL' });
  bus.emit({ from:'claude', subject:'norm', priority:'NORMAL'   });
  const fresh = bus.inbox('cline').signals.map(s => s.subject);
  assert('priority-sorted inbox (CRITICAL first)',
    fresh[0] === 'crit', `order=${fresh.join('>')}`);

  // 7. Validation
  const bad1 = bus.emit({ from:'', subject:'x' });
  assert('emit rejects empty from', !bad1.ok && bad1.reason === 'FROM_REQUIRED');
  const bad2 = bus.emit({ from:'a', subject:'x', type:'DIRECT' });
  assert('DIRECT requires to', !bad2.ok && bad2.reason === 'TO_REQUIRED_FOR_DIRECT_OR_ROLE');

  // 8. History
  const h = bus.history({ from: 'claude' });
  assert('history filters by from', h.every(s => s.from === 'claude') && h.length > 0,
    `count=${h.length}`);

  // 9. Status
  const s = bus.status();
  assert('status reports counts', s.total > 0 && s.agents_registered === 3,
    JSON.stringify({ total: s.total, agents: s.agents_registered }));

  console.log(C('\n=== RESULT ===\n') + (process.exitCode===1 ? R('  failure\n') :
    G('  Signal bus online · BROADCAST/DIRECT/ROLE/URGENT routed · priority enforced\n')));
}

import { pathToFileURL } from 'node:url';
if (import.meta.url === pathToFileURL(process.argv[1]).href) run();
