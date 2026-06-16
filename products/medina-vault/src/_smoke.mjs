// _smoke.mjs — in-process exercise of the vault + laws.
// Verifies: store, recital, dual_read, sovereign isolation, decay, lineage.

import { MedinaVault } from './vault.mjs';
import { hashEntry, EMPTY_RECITAL } from './laws.mjs';

const C = (s) => `\x1b[36m${s}\x1b[0m`;
const G = (s) => `\x1b[32m${s}\x1b[0m`;
const R = (s) => `\x1b[31m${s}\x1b[0m`;
const Y = (s) => `\x1b[33m${s}\x1b[0m`;

function assert(name, cond, detail = '') {
  const mark = cond ? G('PASS') : R('FAIL');
  console.log(`  ${mark}  ${name}${detail ? '  ' + Y('· ' + detail) : ''}`);
  if (!cond) process.exitCode = 1;
}

export async function run() {
  console.log(C('\n=== MEDINA VAULT — SMOKE TEST ===\n'));

  const vault = new MedinaVault();

  // 1. Genesis write
  const g = vault.store({
    key: 'project/north-star',
    value: 'memory that survives the model',
    tier: 'PRIVATE',
    ownerId: 'claude',
    prior_hash: EMPTY_RECITAL,
  });
  assert('genesis write succeeds', g.ok && g.lineage_depth === 1,
         `lineage_depth=${g.lineage_depth}`);

  // 2. RECITAL_MISMATCH on wrong prior_hash
  const bad = vault.store({
    key: 'project/north-star', value: 'overwrite attempt',
    tier: 'PRIVATE', ownerId: 'claude',
    prior_hash: 'a'.repeat(64),
  });
  assert('recital mismatch rejected', !bad.ok && bad.reason === 'RECITAL_MISMATCH',
         `reason=${bad.reason}`);

  // 3. Correct recital update
  const got = vault.retrieve('project/north-star', 'claude');
  const head = hashEntry(got.entry);
  const upd = vault.store({
    key: 'project/north-star', value: 'memory that survives + resonates',
    tier: 'PRIVATE', ownerId: 'claude', prior_hash: head,
  });
  assert('recited update succeeds', upd.ok && upd.lineage_depth === 2,
         `lineage_depth=${upd.lineage_depth}`);

  // 4. PRIVATE not visible to non-owner
  const denied = vault.retrieve('project/north-star', 'cursor');
  assert('PRIVATE blocks non-owner', !denied.ok && denied.reason === 'TIER_FORBIDDEN',
         `reason=${denied.reason}`);

  // 5. Share, then non-owner gets in
  const sh = vault.share('project/north-star', 'claude', 'cursor');
  assert('share grants access', sh.ok);
  const seen = vault.retrieve('project/north-star', 'cursor');
  assert('shared agent reads PRIVATE', seen.ok);

  // 6. Promote to SOVEREIGN clears shares
  const pr = vault.promote('project/north-star', 'claude', 'SOVEREIGN');
  assert('promote to SOVEREIGN', pr.ok && pr.tier === 'SOVEREIGN');
  const post = vault.retrieve('project/north-star', 'cursor');
  assert('SOVEREIGN blocks previously-shared', !post.ok && post.reason === 'SOVEREIGN_OWNER_ONLY',
         `reason=${post.reason}`);
  const ownerStill = vault.retrieve('project/north-star', 'claude');
  assert('SOVEREIGN owner still reads', ownerStill.ok);

  // 7. φ-decay: decayed entry vanishes when strength < threshold.
  // Fake age by stamping createdAt far in the past with PUBLIC decay rate.
  const old = vault.store({
    key: 'ephemeral', value: 'fading',
    tier: 'PUBLIC', ownerId: 'claude', prior_hash: EMPTY_RECITAL,
  });
  vault.entries.get('ephemeral').createdAt = Date.now() - 1000 * 60 * 60 * 100; // 100h old
  const ghost = vault.retrieve('ephemeral', 'anyone');
  assert('φ-decay removes weak PUBLIC', !ghost.ok && ghost.reason === 'DECAYED',
         `reason=${ghost.reason}`);

  // 8. Status
  const s = vault.status();
  assert('status reports remaining entry', s.total === 1 && s.SOVEREIGN === 1,
         JSON.stringify(s));

  console.log(
    C('\n=== RESULT ===\n') +
    (process.exitCode === 1
      ? R('  one or more checks failed\n')
      : G('  all checks passed — Medina Vault online under MEDINA-PROTOCOL/0.1\n'))
  );
}

// Allow direct invocation: `node src/_smoke.mjs`
import { pathToFileURL } from 'node:url';
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  run();
}
