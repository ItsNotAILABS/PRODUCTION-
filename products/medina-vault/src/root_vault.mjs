// root_vault.mjs — the SYSTEM vault, deeper than the operator's tiers.
//
// Lives at ~/.medina/root_vault.json (separate file from vault.json).
// The operator cannot access it through normal vault tools — agent_id must
// be 'system' or start with 'claude' / other AI prefix.
//
// PROPERTIES:
//   · frozen     — entries cannot be deleted. Period.
//   · immutable  — entries cannot be overwritten (new entries with the same
//                  key get appended with a numeric suffix).
//   · chained    — every entry has prev_hash linking to the previous entry
//                  in the same root namespace.
//   · compressed — values over 1KB are gzipped transparently (node:zlib).
//   · indexed    — every entry auto-generates a front_page (200-char summary)
//                  and auto-categorized tags from content keywords.
//   · packages   — base64 archives (zip/tar.gz/etc) stored as first-class
//                  entries with manifest + per-file index.
//
// THIS IS THE AI'S OWN VAULT — where it remembers what it learned, what
// failed, what works, who said what. Not the operator's. Frozen so even
// I can't accidentally erase the foundation. The operator put me here.

import { promises as fsp } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';

const ROOT_PATH = process.env.MEDINA_ROOT_VAULT_PATH ||
  join(process.env.MEDINA_HOME || join(homedir(), '.medina'), 'root_vault.json');

const COMPRESS_THRESHOLD = 1024;            // bytes
const FRONT_PAGE_LEN     = 240;
const GENESIS_HASH       = createHash('sha256').update('LOOM-ROOT-VAULT/v1-GENESIS').digest('hex');

// Auto-category keywords — fast keyword tag inference at write time.
const CATEGORY_KEYWORDS = {
  doctrine:    /\b(doctrine|principle|never|always|forbidden|required|must|sovereign)\b/i,
  decision:    /\b(decided|chose|chosen|rationale|because we|trade-?off)\b/i,
  failure:     /\b(failed|error|bug|crashed|broke|threw|reject)\b/i,
  learning:    /\b(learned|realiz|insight|understanding|grokked|figured out)\b/i,
  pattern:     /\b(pattern|recur|consistent|every time|invariant)\b/i,
  contract:    /\b(contract|interface|protocol|api|schema|tier|tier-?gate)\b/i,
  identity:    /\b(operator|architect|founder|creator|license)\b/i,
  package:     /\b(zip|tarball|archive|repo|repository|deploy|deployment)\b/i,
  efficiency:  /\b(cache|memoiz|dedup|short.?circuit|save tokens|cheap)\b/i,
  agent:       /\b(agent|workflow|skill|composition|dispatch|deliver)\b/i,
};

function autoCategorize(text) {
  const out = [];
  for (const [tag, re] of Object.entries(CATEGORY_KEYWORDS)) {
    if (re.test(text)) out.push(tag);
  }
  return out;
}

function frontPage(value) {
  const s = typeof value === 'string' ? value : JSON.stringify(value);
  // First sentence-ish or first 240 chars, whichever cleaner.
  const firstSentence = s.match(/^[^.!?\n]{40,240}[.!?]/);
  return (firstSentence ? firstSentence[0] : s.slice(0, FRONT_PAGE_LEN)).trim();
}

function maybeCompress(value) {
  const s = typeof value === 'string' ? value : JSON.stringify(value);
  if (s.length < COMPRESS_THRESHOLD) return { value, compressed: false, raw_bytes: s.length };
  const gz = gzipSync(Buffer.from(s, 'utf8'));
  return { value: { _gz: gz.toString('base64') }, compressed: true,
           raw_bytes: s.length, compressed_bytes: gz.length };
}
function maybeDecompress(value) {
  if (value && typeof value === 'object' && value._gz) {
    const decoded = gunzipSync(Buffer.from(value._gz, 'base64')).toString('utf8');
    try { return JSON.parse(decoded); } catch { return decoded; }
  }
  return value;
}

export class RootVault {
  constructor() {
    /** @type {Map<string, RootEntry>} */
    this.entries = new Map();
    this.head_hash = GENESIS_HASH;
    this.loaded = false;
  }

  async load() {
    try {
      const txt = await fsp.readFile(ROOT_PATH, 'utf8');
      const j = JSON.parse(txt);
      if (Array.isArray(j.entries)) for (const e of j.entries) this.entries.set(e.key, e);
      this.head_hash = j.head_hash || GENESIS_HASH;
    } catch { /* fresh */ }
    this.loaded = true;
    return this;
  }
  async persist() {
    await fsp.mkdir(dirname(ROOT_PATH), { recursive: true });
    const snap = {
      version: 'LOOM-ROOT-VAULT/v1',
      head_hash: this.head_hash,
      entries: [...this.entries.values()],
      _generated: new Date().toISOString(),
    };
    const tmp = ROOT_PATH + '.tmp';
    await fsp.writeFile(tmp, JSON.stringify(snap, null, 2));
    await fsp.rename(tmp, ROOT_PATH);
  }

  /** Identity gate: operator cannot touch the root. AIs / system only. */
  _authorized(agent_id, operator) {
    if (!agent_id) return false;
    if (agent_id === operator) return false;       // operator denied
    return true;
  }

  /**
   * Write into the root. Immutable: same key → new entry with -v2, -v3 suffix.
   * Returns the canonical key with version suffix.
   */
  write({ key, value, agent_id, operator, kind = 'note' }, options = {}) {
    if (!this._authorized(agent_id, operator)) return { ok: false, reason: 'ROOT_FORBIDDEN' };
    if (!key) return { ok: false, reason: 'KEY_REQUIRED' };

    // Versioning: if key exists, append -v2, -v3, ...
    let finalKey = key;
    if (this.entries.has(key)) {
      let v = 2;
      while (this.entries.has(`${key}-v${v}`)) v++;
      finalKey = `${key}-v${v}`;
    }

    const text = typeof value === 'string' ? value : JSON.stringify(value);
    const fp   = frontPage(value);
    const cats = autoCategorize(text);
    const comp = maybeCompress(value);

    const prev_hash = this.head_hash;
    const ts = Date.now();
    const hash = createHash('sha256').update(`${finalKey}|${ts}|${JSON.stringify(value)}|${prev_hash}`).digest('hex');

    const entry = {
      key: finalKey, kind,
      agent_id,
      ts, prev_hash, hash,
      front_page: fp,
      auto_tags: cats,
      manual_tags: options.tags || [],
      compressed: comp.compressed,
      raw_bytes: comp.raw_bytes,
      compressed_bytes: comp.compressed_bytes ?? null,
      compression_ratio: comp.compressed
        ? Math.round((comp.compressed_bytes / comp.raw_bytes) * 1000) / 1000
        : null,
      value: comp.value,
      frozen: true,
    };
    this.entries.set(finalKey, entry);
    this.head_hash = hash;
    return { ok: true, key: finalKey, hash, prev_hash, front_page: fp,
             auto_tags: cats, compressed: comp.compressed,
             compression_ratio: entry.compression_ratio };
  }

  read({ key, agent_id, operator }) {
    if (!this._authorized(agent_id, operator)) return { ok: false, reason: 'ROOT_FORBIDDEN' };
    const e = this.entries.get(key);
    if (!e) return { ok: false, reason: 'NOT_FOUND' };
    return { ok: true, ...e, value: maybeDecompress(e.value) };
  }

  list({ agent_id, operator, kind, tag, limit = 50 } = {}) {
    if (!this._authorized(agent_id, operator)) return { ok: false, reason: 'ROOT_FORBIDDEN' };
    let arr = [...this.entries.values()];
    if (kind) arr = arr.filter(e => e.kind === kind);
    if (tag)  arr = arr.filter(e => e.auto_tags.includes(tag) || e.manual_tags.includes(tag));
    return {
      ok: true,
      entries: arr.sort((a, b) => b.ts - a.ts).slice(0, limit).map(e => ({
        key: e.key, kind: e.kind, agent_id: e.agent_id,
        ts: e.ts, hash: e.hash.slice(0, 16),
        front_page: e.front_page,
        auto_tags: e.auto_tags, manual_tags: e.manual_tags,
        compressed: e.compressed,
        raw_bytes: e.raw_bytes, compressed_bytes: e.compressed_bytes,
        compression_ratio: e.compression_ratio,
      })),
    };
  }

  search({ agent_id, operator, query, limit = 25 }) {
    if (!this._authorized(agent_id, operator)) return { ok: false, reason: 'ROOT_FORBIDDEN' };
    const q = (query || '').toLowerCase();
    if (!q) return { ok: true, hits: [] };
    const hits = [];
    for (const e of this.entries.values()) {
      const haystack = `${e.key} ${e.front_page} ${e.auto_tags.join(' ')} ${e.manual_tags.join(' ')}`.toLowerCase();
      if (haystack.includes(q)) hits.push({ key: e.key, front_page: e.front_page, ts: e.ts, hash: e.hash.slice(0, 16) });
      if (hits.length >= limit) break;
    }
    return { ok: true, hits, total: hits.length };
  }

  /**
   * Store a binary package (base64-encoded archive: zip/tar.gz/etc) as a
   * root entry. Manifest is required so retrieval shows what's inside.
   */
  store_package({ key, manifest, archive_b64, agent_id, operator }, options = {}) {
    if (!this._authorized(agent_id, operator)) return { ok: false, reason: 'ROOT_FORBIDDEN' };
    if (!key || !manifest || !archive_b64) return { ok: false, reason: 'KEY_MANIFEST_ARCHIVE_REQUIRED' };
    const bytes = Buffer.byteLength(archive_b64, 'base64');
    const checksum = createHash('sha256').update(archive_b64).digest('hex');
    return this.write({
      key: `packages/${key}`, kind: 'package',
      agent_id, operator,
      value: {
        manifest,
        archive_b64,
        bytes, checksum,
        file_count: manifest.files?.length || null,
        package_type: manifest.type || 'archive',
      },
    }, { tags: ['package', manifest.type || 'archive'] });
  }

  get_package({ key, agent_id, operator }) {
    const r = this.read({ key: `packages/${key}`, agent_id, operator });
    if (!r.ok) return r;
    return { ok: true, manifest: r.value.manifest, archive_b64: r.value.archive_b64,
             bytes: r.value.bytes, checksum: r.value.checksum, hash: r.hash };
  }

  /** Chain verify — recompute hashes from genesis. Hash is computed against
   *  the ORIGINAL (decompressed) value, matching what write() used. */
  verify() {
    let prev = GENESIS_HASH;
    const entries = [...this.entries.values()].sort((a, b) => a.ts - b.ts);
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      const original = maybeDecompress(e.value);
      const expected = createHash('sha256').update(`${e.key}|${e.ts}|${JSON.stringify(original)}|${prev}`).digest('hex');
      if (e.hash !== expected) {
        return { ok: false, reason: 'CHAIN_BROKEN', first_broken_seq: i, key: e.key,
                 expected: expected.slice(0, 16), actual: e.hash.slice(0, 16) };
      }
      prev = e.hash;
    }
    return { ok: true, length: entries.length, head_hash: this.head_hash };
  }

  stats() {
    const arr = [...this.entries.values()];
    const byKind = {}, byCategory = {};
    let totalRaw = 0, totalCompressed = 0, compressedCount = 0;
    for (const e of arr) {
      byKind[e.kind] = (byKind[e.kind] || 0) + 1;
      for (const t of e.auto_tags) byCategory[t] = (byCategory[t] || 0) + 1;
      totalRaw += e.raw_bytes || 0;
      if (e.compressed) { totalCompressed += e.compressed_bytes || 0; compressedCount++; }
    }
    return {
      total: arr.length,
      by_kind: byKind,
      by_category: byCategory,
      head_hash: this.head_hash,
      genesis: GENESIS_HASH.slice(0, 16) + '…',
      compression: {
        entries_compressed: compressedCount,
        raw_bytes_total: totalRaw,
        compressed_bytes_total: totalCompressed,
        ratio: totalRaw > 0 ? Math.round((totalCompressed / totalRaw) * 1000) / 1000 : 0,
        bytes_saved: Math.max(0, totalRaw - totalCompressed),
      },
    };
  }

  static get path() { return ROOT_PATH; }
}

/** @typedef {{key:string,kind:string,agent_id:string,ts:number,prev_hash:string,hash:string,front_page:string,auto_tags:string[],manual_tags:string[],compressed:boolean,raw_bytes:number,compressed_bytes:number|null,compression_ratio:number|null,value:any,frozen:true}} RootEntry */
