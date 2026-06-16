// receipts.mjs — Merkle-chained append-only ledger of every meaningful event.
//
// Each receipt: { seq, ts, kind, ref, agent, meta, prev_hash, hash }
// hash = sha256(seq || ts || kind || ref || agent || JSON(meta) || prev_hash)
// prev_hash of receipt 0 = sha256("MEDINA-PROTOCOL/0.2-GENESIS").
//
// verify() recomputes the full chain. Any altered receipt breaks the chain at
// that point; first-broken seq is reported. Tampering is not silent.

import { createHash } from 'node:crypto';

const GENESIS = createHash('sha256').update('MEDINA-PROTOCOL/0.2-GENESIS').digest('hex');

const RECEIPT_KINDS = new Set([
  'vault_store', 'vault_share', 'vault_promote',
  'skill_run', 'workflow_run',
  'token_mint', 'token_unwrap',
  'key_set', 'key_use', 'key_delete',
  'sandbox_test', 'sandbox_promote',
]);

export class ReceiptLedger {
  constructor() {
    /** @type {Receipt[]} */
    this.receipts = [];
  }

  loadFromMeta(meta) {
    if (!meta?.receipts) return;
    this.receipts = meta.receipts.slice(); // replace, not append
  }
  toMeta() { return { receipts: this.receipts }; }

  append({ kind, ref, agent = 'operator', meta = {} }) {
    if (!RECEIPT_KINDS.has(kind)) return { ok: false, reason: 'INVALID_KIND', kind };
    const seq = this.receipts.length;
    const ts = Date.now();
    const prev_hash = seq === 0 ? GENESIS : this.receipts[seq - 1].hash;
    const payload = `${seq}|${ts}|${kind}|${ref}|${agent}|${JSON.stringify(meta)}|${prev_hash}`;
    const hash = createHash('sha256').update(payload).digest('hex');
    const r = { seq, ts, kind, ref, agent, meta, prev_hash, hash };
    this.receipts.push(r);
    return { ok: true, receipt: r };
  }

  list({ kind, agent, limit = 50 } = {}) {
    let r = this.receipts;
    if (kind)  r = r.filter(x => x.kind  === kind);
    if (agent) r = r.filter(x => x.agent === agent);
    return r.slice(-limit).reverse();
  }

  /** Recompute the entire chain. Returns first-broken seq or { ok: true } if intact. */
  verify() {
    let prev_hash = GENESIS;
    for (let i = 0; i < this.receipts.length; i++) {
      const r = this.receipts[i];
      const expected = createHash('sha256').update(
        `${r.seq}|${r.ts}|${r.kind}|${r.ref}|${r.agent}|${JSON.stringify(r.meta)}|${prev_hash}`
      ).digest('hex');
      if (expected !== r.hash || r.prev_hash !== prev_hash) {
        return { ok: false, reason: 'CHAIN_BROKEN', first_broken_seq: i,
                 expected, actual: r.hash };
      }
      prev_hash = r.hash;
    }
    return { ok: true, length: this.receipts.length, head_hash: prev_hash };
  }

  stats() {
    const byKind = {}, byAgent = {};
    for (const r of this.receipts) {
      byKind[r.kind]   = (byKind[r.kind]   || 0) + 1;
      byAgent[r.agent] = (byAgent[r.agent] || 0) + 1;
    }
    return {
      total: this.receipts.length,
      head_hash: this.receipts.length ? this.receipts[this.receipts.length - 1].hash : GENESIS,
      by_kind: byKind, by_agent: byAgent,
      genesis: GENESIS.slice(0, 16) + '…',
    };
  }
}

/** @typedef {{seq:number,ts:number,kind:string,ref:string,agent:string,meta:object,prev_hash:string,hash:string}} Receipt */
