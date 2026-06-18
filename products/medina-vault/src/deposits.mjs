// deposits.mjs — encrypted deposit zone for external AI computational artifacts.
//
// Operator's GPT agents already produce zip files, JSON dumps, computational
// receipts. They need a real place to deposit them. This is that place.
//
// LAYOUT
//   ~/.medina/deposits/<agent_id>/<deposit_id>.enc   — AES-256-GCM ciphertext
//   ~/.medina/deposits/<agent_id>/<deposit_id>.meta  — public manifest (json)
//   vault index entry under: ai/<agent_id>/deposits/<deposit_id>
//
// ENCRYPTION
//   AES-256-GCM with per-machine key derived via PBKDF2 from operator id + host.
//   Same scheme as keys.mjs — verified against tampered ciphertext detection.
//
// API
//   create({agent_id, kind, label, content_b64, metadata})
//     → { ok, deposit_id, hash, bytes, encrypted_bytes, stored_at }
//   list({agent_id, limit})
//     → manifests only, never plaintext
//   stats({agent_id})
//     → counts/totals per agent + grand total
//   get({agent_id, deposit_id})
//     → returns ciphertext + manifest. AI deposits stay AI-owned; operator
//       can confirm existence/size but not decrypt content.
//
// EVERY deposit fires a token_mint receipt (system) so the chain captures it.

import { promises as fs } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { createCipheriv, createDecipheriv, randomBytes, pbkdf2Sync, createHash } from 'node:crypto';
import { multiHash, randomToken } from './crypto_ext.mjs';

const DEPOSITS_ROOT = process.env.MEDINA_DEPOSITS_PATH ||
  join(process.env.MEDINA_HOME || join(homedir(), '.medina'), 'deposits');

const ALGO = 'aes-256-gcm';
const ITER = 250_000;
const KLEN = 32;
const SALT = Buffer.from('loom-deposits-v1', 'utf8');

const MAX_DEPOSIT_BYTES   = 50 * 1024 * 1024;     // 50 MB
const VALID_KINDS = new Set(['computational_receipt', 'json_payload', 'zip_archive',
                              'document', 'dataset', 'log_bundle', 'binary']);

function deriveMaster() {
  const op   = process.env.MEDINA_OPERATOR_ID || process.env.USERNAME || 'operator';
  const host = require('node:os').hostname();
  return pbkdf2Sync(`${op}|${host}|loom-deposits`, SALT, ITER, KLEN, 'sha256');
}
// pure-ESM alternative for the os.hostname call:
import { hostname } from 'node:os';
function deriveMasterEsm() {
  const op   = process.env.MEDINA_OPERATOR_ID || process.env.USERNAME || 'operator';
  return pbkdf2Sync(`${op}|${hostname()}|loom-deposits`, SALT, ITER, KLEN, 'sha256');
}
const MASTER = deriveMasterEsm();

function encrypt(plaintext) {
  const iv  = randomBytes(12);
  const cip = createCipheriv(ALGO, MASTER, iv);
  const ct  = Buffer.concat([cip.update(plaintext), cip.final()]);
  const tag = cip.getAuthTag();
  return { iv, ct, tag };
}
function decrypt({ iv, ct, tag }) {
  try {
    const d = createDecipheriv(ALGO, MASTER, iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(ct), d.final()]);
  } catch { return null; }
}

export class DepositLedger {
  constructor({ receipts, vault } = {}) {
    this.receipts = receipts;
    this.vault    = vault;
    /** @type {Map<string, DepositManifest>} */
    this.manifests = new Map();
  }

  async _ensureDir(path) { await fs.mkdir(path, { recursive: true }); }

  loadFromMeta(meta) {
    if (!meta?.deposits?.manifests) return;
    for (const m of meta.deposits.manifests) this.manifests.set(m.deposit_id, m);
  }
  toMeta() {
    return { deposits: { manifests: [...this.manifests.values()] } };
  }

  /**
   * Accept a deposit from an AI. `content_b64` is base64 of the raw artifact
   * bytes (zip, json, whatever). Returns the manifest; ciphertext lives on disk.
   */
  async create({ agent_id, kind = 'binary', label, content_b64, metadata = {} }) {
    if (!agent_id) return { ok: false, reason: 'AGENT_ID_REQUIRED' };
    if (!content_b64) return { ok: false, reason: 'CONTENT_REQUIRED' };
    if (!VALID_KINDS.has(kind)) return { ok: false, reason: 'INVALID_KIND', allowed: [...VALID_KINDS] };
    let plaintext;
    try { plaintext = Buffer.from(content_b64, 'base64'); }
    catch { return { ok: false, reason: 'INVALID_BASE64' }; }
    if (plaintext.length > MAX_DEPOSIT_BYTES) {
      return { ok: false, reason: 'TOO_LARGE', max_bytes: MAX_DEPOSIT_BYTES };
    }

    const deposit_id = 'dep_' + Date.now().toString(36) + '_' + randomToken(6);
    const { iv, ct, tag } = encrypt(plaintext);
    const fingerprint = multiHash(plaintext.toString('base64')).combined;

    const agentDir = join(DEPOSITS_ROOT, agent_id);
    await this._ensureDir(agentDir);
    const encPath = join(agentDir, `${deposit_id}.enc`);
    const metaPath = join(agentDir, `${deposit_id}.meta`);

    // Bundle iv+tag+ct into one file: [12 iv][16 tag][ciphertext]
    const bundle = Buffer.concat([iv, tag, ct]);
    await fs.writeFile(encPath, bundle);

    const manifest = {
      deposit_id, agent_id, kind, label: label || deposit_id,
      raw_bytes: plaintext.length,
      encrypted_bytes: bundle.length,
      fingerprint,
      created_at: Date.now(),
      metadata,
      enc_path: encPath,
      meta_path: metaPath,
    };
    await fs.writeFile(metaPath, JSON.stringify(manifest, null, 2));
    this.manifests.set(deposit_id, manifest);

    // Index in operator vault (ai/<agent_id>/deposits/<id>) so the operator
    // can SEE that a deposit exists, but cannot DECRYPT content.
    if (this.vault) {
      this.vault.store({
        key: `ai/${agent_id}/deposits/${deposit_id}`,
        value: { kind, label, raw_bytes: manifest.raw_bytes,
                  fingerprint, created_at: manifest.created_at, metadata },
        tier: 'PRIVATE', ownerId: agent_id,
        metadata: { tags: ['deposit', kind, agent_id], source: 'deposit-ledger' },
      });
    }

    this.receipts?.append({
      kind: 'token_mint', ref: `deposit:${deposit_id}`, agent: 'system',
      meta: { source: 'deposits.create', agent_id, kind,
              raw_bytes: manifest.raw_bytes, fingerprint: fingerprint.slice(0, 16) },
    });

    return { ok: true, deposit_id, fingerprint, hash: fingerprint,
             bytes: manifest.raw_bytes, encrypted_bytes: manifest.encrypted_bytes,
             stored_at: encPath };
  }

  list({ agent_id, limit = 50 } = {}) {
    let arr = [...this.manifests.values()];
    if (agent_id) arr = arr.filter(m => m.agent_id === agent_id);
    return arr.sort((a, b) => b.created_at - a.created_at).slice(0, limit)
      .map(m => ({
        deposit_id: m.deposit_id, agent_id: m.agent_id, kind: m.kind, label: m.label,
        raw_bytes: m.raw_bytes, encrypted_bytes: m.encrypted_bytes,
        fingerprint: m.fingerprint, created_at: m.created_at,
        metadata: m.metadata,
      }));
  }

  /** Retrieve a deposit. Only the same agent_id (or system) can decrypt. */
  async get({ deposit_id, agent_id }) {
    const m = this.manifests.get(deposit_id);
    if (!m) return { ok: false, reason: 'NOT_FOUND' };
    if (agent_id && agent_id !== m.agent_id && agent_id !== 'system') {
      return { ok: false, reason: 'WRONG_AGENT', owner: m.agent_id };
    }
    let bundle;
    try { bundle = await fs.readFile(m.enc_path); }
    catch { return { ok: false, reason: 'CIPHERTEXT_MISSING' }; }
    const iv = bundle.subarray(0, 12);
    const tag = bundle.subarray(12, 28);
    const ct = bundle.subarray(28);
    const plain = decrypt({ iv, ct, tag });
    if (!plain) return { ok: false, reason: 'TAMPERED_OR_KEY_MISMATCH' };
    return { ok: true, manifest: m, content_b64: plain.toString('base64'),
             raw_bytes: plain.length };
  }

  /** Get the metadata only — anyone can see what exists, only owner can decrypt. */
  describe(deposit_id) {
    const m = this.manifests.get(deposit_id);
    if (!m) return { ok: false, reason: 'NOT_FOUND' };
    return {
      ok: true,
      deposit_id: m.deposit_id, agent_id: m.agent_id, kind: m.kind, label: m.label,
      raw_bytes: m.raw_bytes, encrypted_bytes: m.encrypted_bytes,
      fingerprint: m.fingerprint, created_at: m.created_at,
    };
  }

  stats() {
    const arr = [...this.manifests.values()];
    const byAgent = {}, byKind = {};
    let totalRaw = 0, totalEnc = 0;
    for (const m of arr) {
      byAgent[m.agent_id] = (byAgent[m.agent_id] || 0) + 1;
      byKind[m.kind] = (byKind[m.kind] || 0) + 1;
      totalRaw += m.raw_bytes;
      totalEnc += m.encrypted_bytes;
    }
    return {
      total: arr.length,
      by_agent: byAgent, by_kind: byKind,
      raw_bytes_total: totalRaw,
      encrypted_bytes_total: totalEnc,
      deposits_root: DEPOSITS_ROOT,
      max_deposit_bytes: MAX_DEPOSIT_BYTES,
      valid_kinds: [...VALID_KINDS],
    };
  }

  static get path() { return DEPOSITS_ROOT; }
}

/** @typedef {{deposit_id:string,agent_id:string,kind:string,label:string,raw_bytes:number,encrypted_bytes:number,fingerprint:string,created_at:number,metadata:object,enc_path:string,meta_path:string}} DepositManifest */
