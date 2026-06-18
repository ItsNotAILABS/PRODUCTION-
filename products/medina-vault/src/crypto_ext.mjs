// crypto_ext.mjs — real cryptographic hashing, computed locally.
// node:crypto only. No API calls. SHA-256 + SHA3-256 + HMAC + multi-hash.
//
// THE PROBLEM with using only SHA-256: it's a single algorithm. Any future
// weakness in SHA-2 breaks every chain we built. We mitigate by computing
// in parallel:
//
//   sha256       — Node built-in
//   sha3_256     — Node built-in (Keccak family, different internal structure)
//   combined     — sha256(sha256_hex || '|' || sha3_hex)
//
// An attacker would need to break BOTH families to forge a combined hash.
//
// Plus HMAC-SHA-256 for keyed integrity (gateway tokens, root chain).

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export function sha256(text) {
  return createHash('sha256').update(typeof text === 'string' ? text : JSON.stringify(text)).digest('hex');
}

export function sha3_256(text) {
  return createHash('sha3-256').update(typeof text === 'string' ? text : JSON.stringify(text)).digest('hex');
}

/**
 * Multi-hash: compute SHA-256 and SHA3-256 in parallel, then combine.
 * Returns { sha256, sha3_256, combined } where combined is the canonical
 * hash to store/compare. Breaking the chain requires breaking both families.
 */
export function multiHash(text) {
  const a = sha256(text);
  const b = sha3_256(text);
  const combined = createHash('sha256').update(a + '|' + b).digest('hex');
  return { sha256: a, sha3_256: b, combined };
}

/**
 * Chain hash for the next entry. Includes prev_hash so any tamper of earlier
 * entries propagates forward and is detected.
 */
export function chainHash({ prev_hash, payload }) {
  const m = multiHash(prev_hash + '||' + JSON.stringify(payload));
  return m.combined;
}

/** HMAC-SHA-256. Used for gateway bearer-token integrity, etc. */
export function hmac(key, text) {
  return createHmac('sha256', key)
    .update(typeof text === 'string' ? text : JSON.stringify(text))
    .digest('hex');
}

/** Verify HMAC in constant time. */
export function hmacVerify(key, text, expected) {
  const got = hmac(key, text);
  if (got.length !== expected.length) return false;
  try { return timingSafeEqual(Buffer.from(got, 'hex'), Buffer.from(expected, 'hex')); }
  catch { return false; }
}

/** Strong random token. */
export function randomToken(bytes = 24) {
  return randomBytes(bytes).toString('base64url');
}

/** Strong key (raw bytes for HMAC). */
export function randomKey(bytes = 32) {
  return randomBytes(bytes);
}

/**
 * Verify a multi-hash chain. Each entry must have { prev_hash, payload, hash }.
 * Returns { ok, length } or { ok: false, first_broken_index }.
 */
export function verifyChain(entries, { genesis }) {
  let prev = genesis;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (e.prev_hash !== prev) return { ok: false, first_broken_index: i, reason: 'PREV_HASH_MISMATCH' };
    const expected = chainHash({ prev_hash: prev, payload: e.payload });
    if (e.hash !== expected) return { ok: false, first_broken_index: i, reason: 'HASH_MISMATCH', expected, actual: e.hash };
    prev = e.hash;
  }
  return { ok: true, length: entries.length, head_hash: prev };
}

/** Genesis hash for a named chain. */
export function genesisFor(label) {
  return multiHash('LOOM-CHAIN-GENESIS|' + label).combined;
}
