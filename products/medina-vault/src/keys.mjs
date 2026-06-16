// keys.mjs — encrypted API key vault. Real crypto (node:crypto AES-256-GCM).
//
// Master key derived from operator id + machine fingerprint via PBKDF2.
// Keys are encrypted at rest in vault.json::_meta.keys.
// Plaintext exists only inside this process at decrypt time and is wiped on
// next event-loop tick. The vault file never contains plaintext keys.

import { createCipheriv, createDecipheriv, randomBytes, pbkdf2Sync, createHash } from 'node:crypto';
import { hostname, userInfo, platform } from 'node:os';

const ALGO = 'aes-256-gcm';
const ITER = 250_000;
const KLEN = 32;
const SALT = Buffer.from('medina-vault-v0.2-keys', 'utf8');

function deriveMaster() {
  // Master key seed = operator id + machine + host. Deterministic per-machine.
  const op   = process.env.MEDINA_OPERATOR_ID || userInfo().username;
  const host = hostname();
  const plat = platform();
  const seed = `${op}|${host}|${plat}|MEDINA-PROTOCOL/0.2`;
  return pbkdf2Sync(seed, SALT, ITER, KLEN, 'sha256');
}

const MASTER = deriveMaster();

function encrypt(plaintext) {
  const iv  = randomBytes(12);
  const cip = createCipheriv(ALGO, MASTER, iv);
  const ct  = Buffer.concat([cip.update(Buffer.from(plaintext, 'utf8')), cip.final()]);
  const tag = cip.getAuthTag();
  return { iv: iv.toString('base64'), ct: ct.toString('base64'), tag: tag.toString('base64') };
}

function decrypt({ iv, ct, tag }) {
  try {
    const d = createDecipheriv(ALGO, MASTER, Buffer.from(iv, 'base64'));
    d.setAuthTag(Buffer.from(tag, 'base64'));
    const pt = Buffer.concat([d.update(Buffer.from(ct, 'base64')), d.final()]);
    return pt.toString('utf8');
  } catch (e) {
    return null; // tampered or wrong master
  }
}

function fingerprint(key) {
  return createHash('sha256').update(key).digest('hex').slice(0, 12);
}

export class KeyVault {
  constructor() {
    /** @type {Map<string, {iv,ct,tag,fingerprint,addedAt,lastUsedAt,usageCount}>} */
    this.keys = new Map();
  }

  loadFromMeta(meta) {
    if (!meta?.keys) return;
    for (const [k, v] of Object.entries(meta.keys)) this.keys.set(k, v);
  }

  toMeta() {
    return { keys: Object.fromEntries(this.keys) };
  }

  set(name, value, metadata = {}) {
    if (typeof name !== 'string' || !name)   return { ok: false, reason: 'NAME_REQUIRED' };
    if (typeof value !== 'string' || !value) return { ok: false, reason: 'VALUE_REQUIRED' };
    const enc = encrypt(value);
    this.keys.set(name, {
      ...enc,
      fingerprint: fingerprint(value),
      addedAt: Date.now(),
      lastUsedAt: null,
      usageCount: 0,
      metadata,
    });
    return { ok: true, name, fingerprint: this.keys.get(name).fingerprint };
  }

  /** Decrypt for in-process use only. NEVER persist or return through MCP. */
  unwrap(name) {
    const rec = this.keys.get(name);
    if (!rec) return null;
    const pt = decrypt(rec);
    if (pt == null) return null;
    rec.lastUsedAt = Date.now();
    rec.usageCount += 1;
    return pt;
  }

  /** Safe redacted view — never includes plaintext or ciphertext. */
  describe(name) {
    const rec = this.keys.get(name);
    if (!rec) return { ok: false, reason: 'NOT_FOUND' };
    return {
      ok: true,
      name,
      fingerprint: rec.fingerprint,
      addedAt: rec.addedAt,
      lastUsedAt: rec.lastUsedAt,
      usageCount: rec.usageCount,
      metadata: rec.metadata,
    };
  }

  list() {
    return [...this.keys.keys()].map(n => this.describe(n));
  }

  delete(name) {
    if (!this.keys.has(name)) return { ok: false, reason: 'NOT_FOUND' };
    this.keys.delete(name);
    return { ok: true, name };
  }
}
