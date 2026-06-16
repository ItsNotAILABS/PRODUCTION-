// Smoke for compression.mjs — phrase mining + symbol table + formula matching.

import { SymbolTable, minePhrases, tryFormula, decodeFormula, FORMULAS } from './compression.mjs';

const G=s=>`\x1b[32m${s}\x1b[0m`, R=s=>`\x1b[31m${s}\x1b[0m`,
      Y=s=>`\x1b[33m${s}\x1b[0m`, C=s=>`\x1b[36m${s}\x1b[0m`;
function assert(n,c,d=''){console.log(`  ${c?G('PASS'):R('FAIL')}  ${n}${d?'  '+Y('· '+d):''}`);if(!c)process.exitCode=1;}

console.log(C('\n=== SEMANTIC COMPRESSION — SMOKE ===\n'));

// ── Phrase mining ────────────────────────────────────────────────────
const corpus = [
  'Never seed fake data into operator systems. No fabricated agents.',
  'Never seed fake data into the vault. No invented handoffs.',
  'Never seed fake data into operator systems. Empty state is honest.',
  'The system observes the event and writes the receipt itself.',
  'The system observes the event and writes the receipt without the AI.',
  'The system observes the event and writes the receipt for the operator.',
];
const phrases = minePhrases(corpus, { minFreq: 3, maxK: 10 });
assert('mining finds load-bearing repeated phrases',
  phrases.length > 0 && phrases.some(p => p.phrase.includes('Never seed fake data') || p.phrase.includes('The system observes')),
  phrases.slice(0, 3).map(p => `[${p.freq}× "${p.phrase.slice(0,40)}"]`).join(', '));
assert('phrases ranked by savings (descending)',
  phrases.length < 2 || phrases[0].savings >= phrases[1].savings,
  `top savings=${phrases[0]?.savings}`);

// ── Dictionary ingest ────────────────────────────────────────────────
const st = new SymbolTable();
const ingestResult = st.ingest(phrases);
assert(`ingest adds ${phrases.length} entries`,
  ingestResult.added === phrases.length, `added=${ingestResult.added}`);
assert('Fibonacci-indexed symbols look like §F<base36>',
  st.entries.every(e => /^§F[0-9a-z]+$/.test(e.symbol)),
  st.entries.slice(0, 3).map(e => e.symbol).join(','));

// Re-ingesting same phrases is a no-op
const reingest = st.ingest(phrases);
assert('re-ingest is idempotent (no duplicates)', reingest.added === 0, `added=${reingest.added}`);

// ── Compress + expand round-trip ─────────────────────────────────────
const original = 'Never seed fake data into operator systems. The system observes the event and writes the receipt itself.';
const compressed = st.compress(original);
assert('compression reduces byte count',
  compressed.compressed_bytes < compressed.raw_bytes && compressed.ratio < 1.0,
  `raw=${compressed.raw_bytes} compressed=${compressed.compressed_bytes} ratio=${compressed.ratio}`);

const expanded = st.expand(compressed.text);
assert('expand round-trip is LOSSLESS',
  expanded === original,
  `match=${expanded === original} got="${expanded.slice(0, 80)}..."`);

// ── Persistence round-trip ───────────────────────────────────────────
const meta = st.toMeta();
const st2 = new SymbolTable();
st2.loadFromMeta(meta);
assert('symbol table survives meta round-trip',
  st2.entries.length === st.entries.length);
const expanded2 = st2.expand(compressed.text);
assert('reloaded table can expand prior compressions losslessly',
  expanded2 === original);

// ── Formula compression ──────────────────────────────────────────────
const tests = [
  { text: 'decision: use Loom because every session forgets', formula: 'decision_because' },
  { text: 'observed: vault_dedup 17 times.', formula: 'observed_pattern' },
  { text: 'Never seed fake data into operator systems', formula: 'doctrine_negative' },
  { text: 'always verify input before invocation', formula: 'doctrine_positive' },
];
for (const t of tests) {
  const f = tryFormula(t.text);
  assert(`formula matcher detects "${t.formula}"`,
    f.matched && f.formula === t.formula, `got=${f.formula || 'no-match'}`);
}

// Decode round-trip
const enc = tryFormula('decision: ship Loom because it works');
const dec = decodeFormula({ formula: enc.formula, slots: enc.slots });
assert('formula decode reproduces the original-ish text',
  dec === 'decision: ship Loom because it works.', `got="${dec}"`);

// Unknown formula
const unknown = tryFormula('the quick brown fox jumps');
assert('unmatched text returns matched=false', !unknown.matched);

// Stats
const stats = st.stats();
assert('stats report total_symbols and top by frequency',
  stats.total_symbols === st.entries.length && stats.top.length > 0,
  `total=${stats.total_symbols} top=${stats.top.length}`);

console.log(C('\n=== RESULT ===\n') +
  (process.exitCode === 1 ? R('  failure\n')
                          : G('  Semantic compression online — Fibonacci-indexed dictionary, lossless round-trip, formula matcher\n')));
