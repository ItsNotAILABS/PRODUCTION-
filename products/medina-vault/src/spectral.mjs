// spectral.mjs — φ-spectral fingerprints for vault entries.
//
// Real math, no API. Each value is reduced to a 64-dim normalized vector
// derived from character n-gram counts modulated by φ-spaced harmonics.
// Cosine similarity between fingerprints approximates semantic similarity
// (well enough for "find related" within a single operator's vault; not a
// replacement for real embeddings, but real, deterministic, and free).
//
// When PRO is licensed, vault_similar can delegate into MESIE's spectral
// embedding for the higher-fidelity version. The wire shape is the same.

const PHI = 1.618033988749895;
const PHI_INV = 1 / PHI;
const DIM = 64;

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz 0123456789';
const ALPHA_IDX = Object.fromEntries([...ALPHABET].map((c, i) => [c, i]));

/** Reduce text to a stable string of allowed characters. */
function normalize(text) {
  return String(text).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** φ-spectral fingerprint — 64 dims, L2-normalized. */
export function fingerprint(text) {
  const t = normalize(text);
  const vec = new Float64Array(DIM);
  if (!t) return vec;

  // Character bigram counts modulated by φ-spaced harmonics.
  for (let i = 0; i < t.length - 1; i++) {
    const a = ALPHA_IDX[t[i]];
    const b = ALPHA_IDX[t[i + 1]];
    if (a == null || b == null) continue;
    const idx = (a * ALPHABET.length + b) % DIM;
    // Position weight decays by φ⁻¹ deeper into the string.
    const w = Math.exp(-PHI_INV * (i / Math.max(1, t.length)));
    vec[idx] += w;
  }
  // Word-length harmonics — modulate even/odd dims with φ harmonics.
  const words = t.split(' ');
  for (let k = 0; k < words.length; k++) {
    const len = words[k].length;
    const harm = Math.sin(2 * Math.PI * len * PHI / DIM);
    vec[(k * 7) % DIM] += harm;
  }

  // L2 normalize.
  let n = 0;
  for (let i = 0; i < DIM; i++) n += vec[i] * vec[i];
  n = Math.sqrt(n) || 1;
  for (let i = 0; i < DIM; i++) vec[i] /= n;
  return vec;
}

/** Cosine similarity of two fingerprints (both unit-norm) in [-1, 1]. */
export function similarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

/** Serialize a fingerprint to a compact base64 of float32 (256 bytes). */
export function encodeFP(vec) {
  const f32 = new Float32Array(vec);
  return Buffer.from(f32.buffer).toString('base64');
}

/** Deserialize. */
export function decodeFP(b64) {
  if (typeof b64 !== 'string') return null;
  const buf = Buffer.from(b64, 'base64');
  const f32 = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
  return new Float64Array(f32);
}

/**
 * Compute similar entries to `text`, scored by fingerprint cosine × φ-decayed
 * strength. Caller passes the candidate set (already DUAL_READ-authorized).
 */
export function rankBySimilarity(text, candidates, { limit = 10, minScore = 0.15 } = {}) {
  const query = fingerprint(text);
  const scored = [];
  for (const c of candidates) {
    const fp = c.fingerprint
      ? (typeof c.fingerprint === 'string' ? decodeFP(c.fingerprint) : c.fingerprint)
      : fingerprint(typeof c.value === 'string' ? c.value : JSON.stringify(c.value ?? ''));
    const sim = similarity(query, fp);
    if (sim < minScore) continue;
    scored.push({ ...c, similarity: Math.round(sim * 1000) / 1000 });
  }
  scored.sort((a, b) => (b.similarity * (b.strength ?? 1)) - (a.similarity * (a.strength ?? 1)));
  return scored.slice(0, limit);
}
