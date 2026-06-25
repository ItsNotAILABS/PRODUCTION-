// zip_ingest.mjs — Real ZIP extraction + vault indexing.
//
// Pure Node.js, zero deps. Supports stored (method 0) and deflated (method 8).
// Reads the central directory at EOF for authoritative file/size/offset data,
// then follows local header offsets to extract each file.
//
// API:
//   ingestDeposit({ dep_id, agent_id, vault_prefix?, tier? })
//     → decrypt zip_archive deposit, extract all files into vault entries
//   ingestBuffer({ content_b64, agent_id, vault_prefix?, tier?, label? })
//     → extract raw ZIP bytes (base64) into vault entries
//   listContents({ content_b64?, dep_id?, agent_id? })
//     → list what's inside a ZIP without extracting (no vault writes)

import { inflateRaw } from 'node:zlib';
import { promisify }  from 'node:util';

const inflateRawP = promisify(inflateRaw);

// ── ZIP format constants ─────────────────────────────────────────────────────
const LOCAL_SIG   = 0x04034b50;  // PK\x03\x04
const CENTRAL_SIG = 0x02014b50;  // PK\x01\x02
const EOCD_SIG    = 0x06054b50;  // PK\x05\x06
const METHOD_STORE   = 0;
const METHOD_DEFLATE = 8;
const FLAG_UTF8 = 0x0800;

// ── Central directory parser ─────────────────────────────────────────────────

function findEOCD(buf) {
  // EOCD record is minimum 22 bytes; comment can push it back from EOF.
  // Scan backwards — last match is the real EOCD.
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65558); i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) {
      return {
        cd_count:  buf.readUInt16LE(i + 10),
        cd_size:   buf.readUInt32LE(i + 12),
        cd_offset: buf.readUInt32LE(i + 16),
      };
    }
  }
  return null;
}

function parseCentralDirectory(buf, cd_offset, cd_count) {
  const entries = [];
  let pos = cd_offset;
  for (let n = 0; n < cd_count; n++) {
    if (pos + 46 > buf.length) break;
    if (buf.readUInt32LE(pos) !== CENTRAL_SIG) break;
    const gp_flag   = buf.readUInt16LE(pos + 8);
    const method    = buf.readUInt16LE(pos + 10);
    const comp_size = buf.readUInt32LE(pos + 20);
    const ucomp_sz  = buf.readUInt32LE(pos + 24);
    const fn_len    = buf.readUInt16LE(pos + 28);
    const extra_len = buf.readUInt16LE(pos + 30);
    const cmt_len   = buf.readUInt16LE(pos + 32);
    const lh_offset = buf.readUInt32LE(pos + 42);
    const enc       = (gp_flag & FLAG_UTF8) ? 'utf8' : 'latin1';
    const filename  = buf.subarray(pos + 46, pos + 46 + fn_len).toString(enc);
    entries.push({ filename, method, comp_size, ucomp_sz, lh_offset });
    pos += 46 + fn_len + extra_len + cmt_len;
  }
  return entries;
}

async function extractEntry(buf, entry) {
  const lh = entry.lh_offset;
  if (buf.length < lh + 30 || buf.readUInt32LE(lh) !== LOCAL_SIG)
    throw new Error('BAD_LOCAL_HEADER');
  const fn_len    = buf.readUInt16LE(lh + 26);
  const extra_len = buf.readUInt16LE(lh + 28);
  const data_off  = lh + 30 + fn_len + extra_len;
  const compressed = buf.subarray(data_off, data_off + entry.comp_size);
  if (entry.method === METHOD_STORE)   return Buffer.from(compressed);
  if (entry.method === METHOD_DEFLATE) return inflateRawP(compressed);
  throw new Error(`UNSUPPORTED_METHOD:${entry.method}`);
}

// Heuristic: ≤30% non-printable bytes in first 512 bytes → treat as text
function looksLikeText(buf) {
  const sample = buf.subarray(0, Math.min(512, buf.length));
  let nprint = 0;
  for (const b of sample) {
    if (b < 9 || (b > 13 && b < 32) || b === 127) nprint++;
  }
  return sample.length === 0 || nprint / sample.length < 0.30;
}

// ── ZipIngest ────────────────────────────────────────────────────────────────

export class ZipIngest {
  constructor({ vault, deposits } = {}) {
    this.vault    = vault;
    this.deposits = deposits;
  }

  // ── Ingest a deposit that has kind=zip_archive ──────────────────────────
  async ingestDeposit({ dep_id, agent_id, vault_prefix, tier = 'PRIVATE', label } = {}) {
    if (!dep_id)        return { ok: false, reason: 'DEP_ID_REQUIRED' };
    if (!this.deposits) return { ok: false, reason: 'NO_DEPOSIT_LEDGER' };

    const dep = await this.deposits.get({ deposit_id: dep_id, agent_id });
    if (!dep.ok) return dep;
    if (dep.manifest?.kind !== 'zip_archive')
      return { ok: false, reason: 'NOT_ZIP', kind: dep.manifest?.kind,
               hint: 'Deposit must have kind=zip_archive. Use deposit_create with kind="zip_archive".' };

    let rawBuf;
    try { rawBuf = Buffer.from(dep.content_b64, 'base64'); }
    catch { return { ok: false, reason: 'INVALID_BASE64_IN_DEPOSIT' }; }

    const prefix = vault_prefix || `zip/${dep_id}`;
    return this._ingest(rawBuf, {
      agent_id, prefix, tier,
      source: `deposit:${dep_id}`,
      label:  label || dep.manifest?.label || dep_id,
    });
  }

  // ── Ingest a raw ZIP passed as base64 ──────────────────────────────────
  async ingestBuffer({ content_b64, agent_id, vault_prefix = 'zip/direct', tier = 'PRIVATE', label } = {}) {
    if (!content_b64) return { ok: false, reason: 'CONTENT_REQUIRED' };
    let buf;
    try { buf = Buffer.from(content_b64, 'base64'); }
    catch { return { ok: false, reason: 'INVALID_BASE64' }; }
    return this._ingest(buf, { agent_id, prefix: vault_prefix, tier, source: 'direct', label });
  }

  // ── List contents without extracting ───────────────────────────────────
  async listContents({ content_b64, dep_id, agent_id } = {}) {
    let buf;
    if (content_b64) {
      try { buf = Buffer.from(content_b64, 'base64'); }
      catch { return { ok: false, reason: 'INVALID_BASE64' }; }
    } else if (dep_id && this.deposits) {
      const dep = await this.deposits.get({ deposit_id: dep_id, agent_id });
      if (!dep.ok) return dep;
      buf = Buffer.from(dep.content_b64, 'base64');
    } else {
      return { ok: false, reason: 'CONTENT_OR_DEP_ID_REQUIRED' };
    }
    return this._listOnly(buf);
  }

  _listOnly(buf) {
    const eocd = findEOCD(buf);
    if (!eocd) return { ok: false, reason: 'NOT_A_ZIP', size_bytes: buf.length };
    const all    = parseCentralDirectory(buf, eocd.cd_offset, eocd.cd_count);
    const dirs   = all.filter(e => e.filename.endsWith('/'));
    const files  = all.filter(e => !e.filename.endsWith('/'));
    const total_compressed = files.reduce((s, e) => s + e.comp_size, 0);
    const total_bytes      = files.reduce((s, e) => s + e.ucomp_sz, 0);
    return {
      ok: true,
      total_files: files.length,
      total_dirs:  dirs.length,
      total_bytes,
      total_compressed_bytes: total_compressed,
      ratio: total_bytes ? Math.round((1 - total_compressed / total_bytes) * 1000) / 10 : 0,
      files: files.map(e => ({
        path:       e.filename,
        bytes:      e.ucomp_sz,
        compressed: e.comp_size,
        method:     e.method === 8 ? 'deflated' : e.method === 0 ? 'stored' : `method:${e.method}`,
      })),
    };
  }

  async _ingest(buf, { agent_id, prefix, tier, source, label }) {
    const eocd = findEOCD(buf);
    if (!eocd) return { ok: false, reason: 'NOT_A_ZIP', source, size_bytes: buf.length };

    const all      = parseCentralDirectory(buf, eocd.cd_offset, eocd.cd_count);
    const results  = [];
    const errors   = [];
    const skipped  = [];

    for (const entry of all) {
      if (entry.filename.endsWith('/')) { skipped.push(entry.filename); continue; }
      try {
        const content  = await extractEntry(buf, entry);
        const isText   = looksLikeText(content);
        const value    = isText
          ? content.toString('utf8')
          : { _binary: true, base64: content.toString('base64'), size: content.length };
        const vaultKey = `${prefix}/${entry.filename}`;

        this.vault?.store({
          key:      vaultKey,
          value,
          tier,
          ownerId:  agent_id || 'system',
          metadata: {
            tags:    ['zip_ingest', source],
            source,
            binary:  !isText,
            size:    content.length,
            zip_path: entry.filename,
          },
        });

        results.push({
          path:      entry.filename,
          vault_key: vaultKey,
          bytes:     content.length,
          binary:    !isText,
        });
      } catch (e) {
        errors.push({ path: entry.filename, error: e.message });
      }
    }

    return {
      ok:              true,
      source,
      label:           label || prefix,
      vault_prefix:    prefix,
      tier,
      agent_id:        agent_id || 'system',
      files_extracted: results.length,
      files_skipped:   skipped.length,
      files_failed:    errors.length,
      results,
      ...(errors.length ? { errors } : {}),
    };
  }
}
