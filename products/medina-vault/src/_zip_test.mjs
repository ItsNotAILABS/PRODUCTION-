// _zip_test.mjs — Comprehensive ZipIngest tests.
// Creates real ZIP buffers in memory and verifies extraction, vault storage,
// error handling, and listContents. No smoke-only shortcuts.

import { ZipIngest } from './zip_ingest.mjs';
import { MedinaVault } from './vault.mjs';
import { createHash } from 'node:crypto';
import { deflateRawSync } from 'node:zlib';

const G = s => `\x1b[32m${s}\x1b[0m`, R = s => `\x1b[31m${s}\x1b[0m`,
      Y = s => `\x1b[33m${s}\x1b[0m`, C = s => `\x1b[36m${s}\x1b[0m`;

let pass = 0, fail = 0;
function t(name, cond, detail = '') {
  if (cond) { console.log(`  ${G('PASS')}  ${name}${detail ? ' ' + Y('· ' + detail) : ''}`); pass++; }
  else       { console.log(`  ${R('FAIL')}  ${name}${detail ? ' ' + Y('· ' + detail) : ''}`); fail++; process.exitCode = 1; }
}

// ── Minimal ZIP builder ──────────────────────────────────────────────────────
// Enough to create real ZIP files in memory for testing.

function crc32(buf) {
  const CRC_TABLE = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    CRC_TABLE[i] = c;
  }
  let crc = 0xFFFFFFFF;
  for (const byte of buf) crc = CRC_TABLE[(crc ^ byte) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function localHeader(filename, method, compData, origData) {
  const fn  = Buffer.from(filename, 'utf8');
  const crc = crc32(origData);
  const h   = Buffer.alloc(30 + fn.length);
  h.writeUInt32LE(0x04034b50, 0);     // signature
  h.writeUInt16LE(20,         4);     // version needed
  h.writeUInt16LE(0x0800,     6);     // gp flag (UTF-8)
  h.writeUInt16LE(method,     8);     // compression method
  h.writeUInt16LE(0,          10);    // mod time
  h.writeUInt16LE(0,          12);    // mod date
  h.writeUInt32LE(crc,        14);    // CRC-32
  h.writeUInt32LE(compData.length, 18); // compressed size
  h.writeUInt32LE(origData.length, 22); // uncompressed size
  h.writeUInt16LE(fn.length,  26);    // filename length
  h.writeUInt16LE(0,          28);    // extra field length
  fn.copy(h, 30);
  return h;
}

function centralDir(filename, method, compData, origData, localOffset) {
  const fn  = Buffer.from(filename, 'utf8');
  const crc = crc32(origData);
  const h   = Buffer.alloc(46 + fn.length);
  h.writeUInt32LE(0x02014b50, 0);     // signature
  h.writeUInt16LE(20,         4);     // version made
  h.writeUInt16LE(20,         6);     // version needed
  h.writeUInt16LE(0x0800,     8);     // gp flag
  h.writeUInt16LE(method,     10);    // method
  h.writeUInt16LE(0,          12);    // mod time
  h.writeUInt16LE(0,          14);    // mod date
  h.writeUInt32LE(crc,        16);    // crc
  h.writeUInt32LE(compData.length, 20); // compressed
  h.writeUInt32LE(origData.length, 24); // uncompressed
  h.writeUInt16LE(fn.length,  28);    // fn length
  h.writeUInt16LE(0,          30);    // extra length
  h.writeUInt16LE(0,          32);    // comment length
  h.writeUInt16LE(0,          34);    // disk start
  h.writeUInt16LE(0,          36);    // internal attr
  h.writeUInt32LE(0,          38);    // external attr
  h.writeUInt32LE(localOffset, 42);   // local header offset
  fn.copy(h, 46);
  return h;
}

function eocd(fileCount, cdSize, cdOffset) {
  const h = Buffer.alloc(22);
  h.writeUInt32LE(0x06054b50, 0);
  h.writeUInt16LE(0,          4);  // disk number
  h.writeUInt16LE(0,          6);  // start disk
  h.writeUInt16LE(fileCount,  8);  // entries on disk
  h.writeUInt16LE(fileCount,  10); // total entries
  h.writeUInt32LE(cdSize,     12);
  h.writeUInt32LE(cdOffset,   16);
  h.writeUInt16LE(0,          20); // comment length
  return h;
}

function buildZip(files) {
  // files: [{ name, content: Buffer, method: 0|8 }]
  const localParts = [];
  let offset = 0;
  const metas = [];

  for (const f of files) {
    const orig = Buffer.isBuffer(f.content) ? f.content : Buffer.from(f.content, 'utf8');
    const comp = f.method === 8 ? deflateRawSync(orig) : orig;
    const lh   = localHeader(f.name, f.method, comp, orig);
    localParts.push(lh, comp);
    metas.push({ name: f.name, method: f.method, comp, orig, localOffset: offset });
    offset += lh.length + comp.length;
  }

  const cdParts = metas.map(m => centralDir(m.name, m.method, m.comp, m.orig, m.localOffset));
  const cdBuf   = Buffer.concat(cdParts);
  const cdSize  = cdBuf.length;
  const cdOff   = offset;

  return Buffer.concat([...localParts, cdBuf, eocd(files.length, cdSize, cdOff)]);
}

// ── Tests ────────────────────────────────────────────────────────────────────

console.log(C('\n=== ZIP INGEST — COMPREHENSIVE TESTS ===\n'));

// Section 1: ZIP builder sanity
console.log(C('[1] ZIP builder sanity'));
{
  const zip = buildZip([{ name: 'hello.txt', content: 'hello world', method: 0 }]);
  t('zip builder produces bytes',   zip.length > 0, `${zip.length} bytes`);
  t('zip starts with PK\\x03\\x04', zip.readUInt32LE(0) === 0x04034b50);
  // EOCD at the end
  const eocdSig = zip.readUInt32LE(zip.length - 22);
  t('zip ends with EOCD',           eocdSig === 0x06054b50);
}

// Section 2: listContents on stored file
console.log(C('\n[2] listContents — stored method'));
{
  const files = [
    { name: 'README.md', content: '# Hello', method: 0 },
    { name: 'src/index.js', content: 'console.log("hi")', method: 0 },
    { name: 'subdir/', content: '', method: 0 },  // directory entry
  ];
  const zip = buildZip(files);
  const b64 = zip.toString('base64');
  const zi = new ZipIngest({});
  const r = await zi.listContents({ content_b64: b64 });
  t('listContents ok',                r.ok, JSON.stringify(r).slice(0,60));
  t('finds 2 files (not dir)',         r.total_files === 2, `got ${r.total_files}`);
  t('finds 1 dir',                     r.total_dirs === 1,  `got ${r.total_dirs}`);
  t('returns file paths',              r.files.some(f => f.path === 'README.md'));
  t('returns nested path',             r.files.some(f => f.path === 'src/index.js'));
  t('byte counts correct',             r.files[0].bytes === 7 || r.files[1].bytes === 7, `README bytes=${r.files.find(f=>f.path==='README.md')?.bytes}`);
  t('has total_bytes',                 typeof r.total_bytes === 'number');
}

// Section 3: listContents on deflated file
console.log(C('\n[3] listContents — deflated method'));
{
  const longText = 'A'.repeat(1000);
  const zip = buildZip([{ name: 'big.txt', content: longText, method: 8 }]);
  const r = await new ZipIngest({}).listContents({ content_b64: zip.toString('base64') });
  t('deflated list ok',               r.ok);
  t('reports uncompressed size',      r.files[0].bytes === 1000, `got ${r.files[0]?.bytes}`);
  t('reports compression method',     r.files[0].method === 'deflated', `got ${r.files[0]?.method}`);
  t('compressed smaller than orig',   r.total_compressed_bytes < 1000, `compressed=${r.total_compressed_bytes}`);
  t('has ratio',                      typeof r.ratio === 'number' && r.ratio > 0);
}

// Section 4: ingestBuffer — text files → vault entries
console.log(C('\n[4] ingestBuffer → vault entries (stored)'));
{
  const vault = new MedinaVault({ operatorId: 'tester' });
  const zi = new ZipIngest({ vault });
  const zip = buildZip([
    { name: 'main.py', content: 'print("hello")', method: 0 },
    { name: 'config.json', content: '{"version":"1.0"}', method: 0 },
    { name: 'notes/README.md', content: '# Notes', method: 0 },
  ]);
  const r = await zi.ingestBuffer({ content_b64: zip.toString('base64'), agent_id: 'tester', vault_prefix: 'test_zip', tier: 'PRIVATE' });
  t('ingestBuffer ok',                r.ok, JSON.stringify(r).slice(0,80));
  t('3 files extracted',              r.files_extracted === 3, `got ${r.files_extracted}`);
  t('0 failed',                       r.files_failed === 0);
  t('vault_prefix set',               r.vault_prefix === 'test_zip');
  // Verify vault entries exist
  const e1 = vault.retrieve('test_zip/main.py', 'tester');
  const e2 = vault.retrieve('test_zip/config.json', 'tester');
  const e3 = vault.retrieve('test_zip/notes/README.md', 'tester');
  t('main.py in vault',               e1.ok, `key=test_zip/main.py`);
  t('main.py content correct',        e1.ok && e1.entry.value === 'print("hello")', `got ${e1.entry?.value}`);
  t('config.json in vault',           e2.ok);
  t('config.json content correct',    e2.ok && e2.entry.value === '{"version":"1.0"}');
  t('nested path in vault',           e3.ok, `test_zip/notes/README.md`);
  t('results list correct',           r.results.some(x => x.path === 'main.py'));
  t('result has vault_key',           r.results[0].vault_key.startsWith('test_zip/'));
  t('result has bytes',               r.results[0].bytes > 0);
}

// Section 5: ingestBuffer — deflated files
console.log(C('\n[5] ingestBuffer → vault entries (deflated)'));
{
  const vault = new MedinaVault({ operatorId: 'tester' });
  const zi = new ZipIngest({ vault });
  const content = 'the quick brown fox jumps over the lazy dog '.repeat(20);
  const zip = buildZip([{ name: 'words.txt', content, method: 8 }]);
  const r = await zi.ingestBuffer({ content_b64: zip.toString('base64'), agent_id: 'tester', vault_prefix: 'deflate_test', tier: 'PRIVATE' });
  t('deflate ingest ok',              r.ok, `extracted=${r.files_extracted}`);
  t('file extracted',                 r.files_extracted === 1);
  const e = vault.retrieve('deflate_test/words.txt', 'tester');
  t('entry in vault',                 e.ok);
  t('content decompressed correctly', e.ok && e.entry.value.includes('quick brown fox'), `got ${e.entry?.value?.slice(0,40)}`);
  t('content length correct',         e.ok && e.entry.value.length === content.length, `got ${e.entry?.value?.length} want ${content.length}`);
}

// Section 6: Directory entries skipped
console.log(C('\n[6] Directory entries skipped'));
{
  const vault = new MedinaVault({ operatorId: 'tester' });
  const zi = new ZipIngest({ vault });
  const zip = buildZip([
    { name: 'src/', content: '', method: 0 },
    { name: 'src/app.js', content: 'const x = 1;', method: 0 },
    { name: 'tests/', content: '', method: 0 },
  ]);
  const r = await zi.ingestBuffer({ content_b64: zip.toString('base64'), agent_id: 'tester', vault_prefix: 'dirs', tier: 'PRIVATE' });
  t('ok with dirs',                   r.ok);
  t('only 1 file extracted',          r.files_extracted === 1, `got ${r.files_extracted}`);
  t('2 dirs skipped',                 r.files_skipped === 2, `got ${r.files_skipped}`);
}

// Section 7: Mixed stored + deflated
console.log(C('\n[7] Mixed stored + deflated in one ZIP'));
{
  const vault = new MedinaVault({ operatorId: 'tester' });
  const zi = new ZipIngest({ vault });
  const zip = buildZip([
    { name: 'small.txt', content: 'small', method: 0 },
    { name: 'large.txt', content: 'x'.repeat(500), method: 8 },
  ]);
  const r = await zi.ingestBuffer({ content_b64: zip.toString('base64'), agent_id: 'tester', vault_prefix: 'mixed', tier: 'SHARED' });
  t('mixed zip ok',                   r.ok);
  t('both files extracted',           r.files_extracted === 2, `got ${r.files_extracted}`);
  const small = vault.retrieve('mixed/small.txt', 'tester');
  const large = vault.retrieve('mixed/large.txt', 'tester');
  t('stored file correct',            small.ok && small.entry.value === 'small');
  t('deflated file correct',          large.ok && large.entry.value.length === 500);
  t('tier SHARED applied',            small.ok && small.entry.tier === 'SHARED');
}

// Section 8: Binary file detection
console.log(C('\n[8] Binary file detection'));
{
  const vault = new MedinaVault({ operatorId: 'tester' });
  const zi = new ZipIngest({ vault });
  // Create a fake binary: lots of null bytes
  const binaryContent = Buffer.alloc(100, 0);
  binaryContent[0] = 0xFF; binaryContent[1] = 0xFE; // non-printable
  const zip = buildZip([
    { name: 'data.bin', content: binaryContent, method: 0 },
    { name: 'text.txt', content: 'readable text', method: 0 },
  ]);
  const r = await zi.ingestBuffer({ content_b64: zip.toString('base64'), agent_id: 'tester', vault_prefix: 'bintest', tier: 'PRIVATE' });
  t('binary zip ok',                  r.ok, `extracted=${r.files_extracted}`);
  t('both files extracted',           r.files_extracted === 2);
  const bin = r.results.find(x => x.path === 'data.bin');
  const txt = r.results.find(x => x.path === 'text.txt');
  t('binary detected',                bin?.binary === true, `binary=${bin?.binary}`);
  t('text detected',                  txt?.binary === false, `binary=${txt?.binary}`);
  const binEntry = vault.retrieve('bintest/data.bin', 'tester');
  t('binary stored as object',        binEntry.ok && typeof binEntry.entry.value === 'object' && binEntry.entry.value._binary === true);
  t('binary has base64 field',        binEntry.ok && typeof binEntry.entry.value?.base64 === 'string');
}

// Section 9: Error cases
console.log(C('\n[9] Error cases'));
{
  const zi = new ZipIngest({});
  const notZip = await zi.listContents({ content_b64: Buffer.from('not a zip file').toString('base64') });
  t('not-zip returns NOT_A_ZIP',      !notZip.ok && notZip.reason === 'NOT_A_ZIP', `reason=${notZip.reason}`);
  const noArgs = await zi.listContents({});
  t('no content returns error',       !noArgs.ok && noArgs.reason === 'CONTENT_OR_DEP_ID_REQUIRED');
  // Node.js silently ignores non-base64 chars; garbage resolves to NOT_A_ZIP (correct)
  const badB64 = await zi.ingestBuffer({ content_b64: '!!invalid!!' });
  t('garbage input returns error',    !badB64.ok && ['INVALID_BASE64','NOT_A_ZIP'].includes(badB64.reason), `reason=${badB64.reason}`);
  const noDepLedger = await zi.ingestDeposit({ dep_id: 'dep_xxx', agent_id: 'me' });
  t('no deposit ledger returns error', !noDepLedger.ok && noDepLedger.reason === 'NO_DEPOSIT_LEDGER');
}

// Section 10: Large file count
console.log(C('\n[10] Large file count (50 files)'));
{
  const vault = new MedinaVault({ operatorId: 'tester' });
  const zi = new ZipIngest({ vault });
  const files = Array.from({ length: 50 }, (_, i) => ({
    name: `file_${String(i).padStart(3,'0')}.json`,
    content: JSON.stringify({ index: i, data: `value_${i}` }),
    method: i % 2 === 0 ? 0 : 8,
  }));
  const zip = buildZip(files);
  const r = await zi.ingestBuffer({ content_b64: zip.toString('base64'), agent_id: 'bulk', vault_prefix: 'bulk50', tier: 'PRIVATE' });
  t('large zip ok',                   r.ok, `extracted=${r.files_extracted}`);
  t('all 50 extracted',               r.files_extracted === 50, `got ${r.files_extracted}`);
  t('no failures',                    r.files_failed === 0);
  const spot = vault.retrieve('bulk50/file_025.json', 'bulk');
  t('spot check file_025 in vault',   spot.ok, `value=${JSON.stringify(spot.entry?.value).slice(0,40)}`);
  t('spot check content correct',     spot.ok && JSON.parse(spot.entry.value).index === 25);
}

// Section 11: vault_prefix defaults
console.log(C('\n[11] vault_prefix defaulting'));
{
  const vault = new MedinaVault({ operatorId: 'tester' });
  const zi = new ZipIngest({ vault });
  const zip = buildZip([{ name: 'readme.md', content: 'hello', method: 0 }]);
  const r = await zi.ingestBuffer({ content_b64: zip.toString('base64'), agent_id: 'tester', tier: 'PRIVATE' });
  t('default prefix is zip/direct',   r.vault_prefix === 'zip/direct', `got ${r.vault_prefix}`);
  const e = vault.retrieve('zip/direct/readme.md', 'tester');
  t('entry at default prefix',        e.ok);
}

// Section 12: Tier propagation
console.log(C('\n[12] Tier propagation'));
{
  const vault = new MedinaVault({ operatorId: 'op' });
  const zi = new ZipIngest({ vault });
  const zip = buildZip([
    { name: 'a.txt', content: 'public data', method: 0 },
    { name: 'b.txt', content: 'more data', method: 0 },
  ]);
  const r = await zi.ingestBuffer({ content_b64: zip.toString('base64'), agent_id: 'op', vault_prefix: 'tiertest', tier: 'PUBLIC' });
  t('public tier ingest ok',          r.ok);
  const a = vault.retrieve('tiertest/a.txt', 'op');
  t('entry has PUBLIC tier',          a.ok && a.entry.tier === 'PUBLIC', `tier=${a.entry?.tier}`);
}

// ── Summary ──────────────────────────────────────────────────────────────────
const total = pass + fail;
console.log(C('\n=== RESULTS ===\n'));
console.log(`  ${G('PASS')} ${pass}  ·  ${fail > 0 ? R('FAIL') : G('FAIL')} ${fail}  ·  total ${total}`);
if (!fail) console.log(G('\n  ZIP ingest · parse · extract · vault-index · binary-detect — all green\n'));
else        console.log(R('\n  some checks failed\n'));
