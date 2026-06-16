// ─────────────────────────────────────────────────────────────────────────
// laws.mjs — Medina runtime laws compiled into the request path.
//
// MEANING:     RECITAL_PLUS_ONE, DUAL_READ, φ-DECAY are not documentation
//              and not opt-in middleware. Every vault operation passes
//              through this file. There is no bypass path.
// MODEL:       Pure functions over (request, entry, head, time) → decision.
// COMPUTATION: See protocol/MEDINA-PROTOCOL-0.1.md §LAYER 3.
// EXECUTION:   Imported by vault.mjs at the top of every public method.
//
// MIT — Architecture: Alfredo Medina Hernandez. Implementation: Claude
// (Opus 4.7), under the Creator's License.
// ─────────────────────────────────────────────────────────────────────────

import { createHash } from 'node:crypto';

// ── Constants the protocol fixes ─────────────────────────────────────────

/** φ-decay rate per tier (per hour). PROTOCOL/0.1 §LAYER 1.3 */
export const DECAY_RATE = {
  PUBLIC:    0.05,
  SHARED:    0.02,
  PRIVATE:   0.01,
  SOVEREIGN: 0.00,
};

/** Default TTL per tier (ms). */
export const DEFAULT_TTL = {
  PUBLIC:    24 * 60 * 60 * 1000,
  SHARED:    7 * 24 * 60 * 60 * 1000,
  PRIVATE:   30 * 24 * 60 * 60 * 1000,
  SOVEREIGN: Infinity,
};

/** Below this strength an entry is gone. */
export const DECAY_THRESHOLD = 0.05;

/** Hash sentinel for genesis recital (first write of a key). */
export const EMPTY_RECITAL = '0'.repeat(64);

/** Allowed tiers, in privilege order. */
export const TIER_ORDER = ['PUBLIC', 'SHARED', 'PRIVATE', 'SOVEREIGN'];

// ── Pure law functions ──────────────────────────────────────────────────

/** sha256 hex of a stable JSON-serialized entry head. */
export function hashEntry(entry) {
  if (!entry) return EMPTY_RECITAL;
  // Stable shape — only the fields a recital must witness.
  const witness = JSON.stringify({
    key:        entry.key,
    value:      entry.value,
    tier:       entry.tier,
    ownerId:    entry.ownerId,
    createdAt:  entry.createdAt,
    lineageLen: entry.lineage?.length ?? 0,
  });
  return createHash('sha256').update(witness).digest('hex');
}

/** φ-decay strength of an entry at time t (ms). */
export function strength(entry, now = Date.now()) {
  if (!entry || entry.decayRate === 0) return 1;
  const ageHours = (now - entry.createdAt) / 3_600_000;
  return Math.exp(-entry.decayRate * ageHours);
}

/** TTL still alive? */
export function ttlAlive(entry, now = Date.now()) {
  return now <= entry.expiresAt;
}

/**
 * DUAL_READ — semantic key match AND tier authorization.
 * Returns { ok, reason? }. Failure modes are explicit, never silent.
 */
export function dualRead(entry, requesterId, now = Date.now()) {
  if (!entry)                      return { ok: false, reason: 'NOT_FOUND' };
  if (!ttlAlive(entry, now))       return { ok: false, reason: 'EXPIRED' };
  if (strength(entry, now) < DECAY_THRESHOLD)
                                   return { ok: false, reason: 'DECAYED' };

  switch (entry.tier) {
    case 'PUBLIC':    return { ok: true };
    case 'SHARED':    return { ok: true };
    case 'PRIVATE':
      if (entry.ownerId === requesterId)              return { ok: true };
      if (entry.sharedWith?.includes(requesterId))    return { ok: true };
      return { ok: false, reason: 'TIER_FORBIDDEN' };
    case 'SOVEREIGN':
      return entry.ownerId === requesterId
        ? { ok: true }
        : { ok: false, reason: 'SOVEREIGN_OWNER_ONLY' };
    default:
      return { ok: false, reason: 'UNKNOWN_TIER' };
  }
}

/**
 * RECITAL_PLUS_ONE — verify a write recites the current head.
 *
 *   genesis:  head == null  AND  request.prior_hash == EMPTY_RECITAL
 *   update:   head exists   AND  request.prior_hash == hash(head)
 *
 * No prior_hash? Auto-recite if the writer is the owner (convenience
 * for single-AI sessions), but stamp the lineage so any drift is
 * later visible. Mismatch is REJECTED — no override.
 */
export function recital(request, currentHead) {
  const computedHead = hashEntry(currentHead);

  // First write of a key — genesis.
  if (currentHead == null) {
    if (request.prior_hash == null || request.prior_hash === EMPTY_RECITAL) {
      return { ok: true, kind: 'GENESIS', head: EMPTY_RECITAL };
    }
    return { ok: false, reason: 'GENESIS_EXPECTED_EMPTY_PRIOR' };
  }

  // Update — must witness the current head.
  if (request.prior_hash == null) {
    // Caller didn't witness — only the owner may auto-recite.
    if (request.ownerId !== currentHead.ownerId) {
      return { ok: false, reason: 'PRIOR_HASH_REQUIRED_FOR_NON_OWNER' };
    }
    return { ok: true, kind: 'AUTO_RECITE', head: computedHead };
  }

  if (request.prior_hash !== computedHead) {
    return { ok: false, reason: 'RECITAL_MISMATCH' };
  }
  return { ok: true, kind: 'RECITED', head: computedHead };
}

/** Validate tier name. */
export function isTier(t) {
  return TIER_ORDER.includes(t);
}

/** Stable JSON for files & hashing. Sorted keys, no whitespace surprises. */
export function stableStringify(obj) {
  return JSON.stringify(obj, Object.keys(obj).sort());
}
