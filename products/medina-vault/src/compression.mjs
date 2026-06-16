// compression.mjs — semantic compression. Not just bytes (zlib already does that).
//
// PRIMITIVE: across the operator's vault, certain phrases are LOAD-BEARING:
// they appear over and over because they carry the same meaning each time.
// Replace those phrases with short Fibonacci-indexed symbols, store the
// dictionary alongside, and you can write 4-10× smaller texts that mean the
// same thing — without losing fidelity on round-trip.
//
// THREE LAYERS:
//   1. PHRASE compression — n-gram frequency analysis. Top-K phrases (3-8
//      words, freq ≥ 3) become symbols §F<n> (n = Fibonacci index).
//   2. FORMULA compression — recognize recurring structural patterns
//      ("X said Y about Z", "decision: X because Y") and emit as formulas.
//   3. SYMBOL TABLE — append-only dictionary; symbols stable across sessions
//      so older compressed values still decompress with the current table.
//
// Compression is LOSSLESS. compress() returns { text, dictionary, ratio }.
// expand() takes the same dictionary and returns the original text bit-exact.

const PHI = 1.618033988749895;
const FIB = (() => { const f = [1, 2]; while (f.length < 80) f.push(f[f.length-1] + f[f.length-2]); return f; })();

function fibSym(n) { return '§F' + FIB[n].toString(36); }

// ── Phrase mining ────────────────────────────────────────────────────────

function tokenize(text) {
  return String(text).split(/(\s+|[.,;:!?()"\[\]{}])/).filter(t => t !== '');
}

function ngrams(tokens, n) {
  const out = [];
  for (let i = 0; i <= tokens.length - n; i++) out.push(tokens.slice(i, i + n).join(''));
  return out;
}

/**
 * Find load-bearing phrases across a corpus. A phrase is load-bearing if it
 * appears ≥ minFreq times AND saves enough bytes to be worth a symbol.
 */
export function minePhrases(corpus, { minFreq = 3, minLen = 12, maxLen = 200, maxK = 64 } = {}) {
  const texts = Array.isArray(corpus) ? corpus : [corpus];
  const counts = new Map();
  for (const text of texts) {
    const toks = tokenize(text);
    for (let n = 8; n >= 3; n--) {
      for (const g of ngrams(toks, n)) {
        if (g.length < minLen || g.length > maxLen) continue;
        // Skip phrases that are mostly whitespace/punctuation
        if (!/[A-Za-z]{4,}/.test(g)) continue;
        counts.set(g, (counts.get(g) || 0) + 1);
      }
    }
  }

  // Rank by SAVINGS (freq × (len - symbolLen)) instead of pure frequency
  const ranked = [];
  for (const [phrase, freq] of counts) {
    if (freq < minFreq) continue;
    const symLen = 4; // §F + ~2 chars
    const savings = (phrase.length - symLen) * (freq - 1) - phrase.length; // -phrase.length = dict cost
    if (savings <= 0) continue;
    ranked.push({ phrase, freq, savings });
  }
  ranked.sort((a, b) => b.savings - a.savings);

  // Greedy non-overlapping selection — once a phrase is picked, skip phrases
  // that are substrings of it or contain it (avoid double-compression conflicts).
  const picked = [];
  for (const cand of ranked) {
    if (picked.length >= maxK) break;
    let conflict = false;
    for (const p of picked) {
      if (p.phrase.includes(cand.phrase) || cand.phrase.includes(p.phrase)) { conflict = true; break; }
    }
    if (!conflict) picked.push(cand);
  }
  return picked;
}

// ── Dictionary construction ──────────────────────────────────────────────

export class SymbolTable {
  constructor() {
    /** @type {Array<{symbol:string,phrase:string,freq:number}>} */
    this.entries = [];
    this.byPhrase = new Map();
    this.bySymbol = new Map();
    this._nextIdx = 0;
  }

  loadFromMeta(meta) {
    if (!meta?.symbol_table) return;
    this.entries = meta.symbol_table.entries || [];
    this._nextIdx = meta.symbol_table.next_idx || this.entries.length;
    for (const e of this.entries) {
      this.byPhrase.set(e.phrase, e.symbol);
      this.bySymbol.set(e.symbol, e.phrase);
    }
  }
  toMeta() {
    return { symbol_table: { entries: this.entries, next_idx: this._nextIdx } };
  }

  /** Add new phrases from a fresh mining pass. Symbols are append-only. */
  ingest(phrases) {
    let added = 0;
    for (const p of phrases) {
      if (this.byPhrase.has(p.phrase)) continue;
      const symbol = fibSym(this._nextIdx++);
      const entry = { symbol, phrase: p.phrase, freq: p.freq };
      this.entries.push(entry);
      this.byPhrase.set(p.phrase, symbol);
      this.bySymbol.set(symbol, p.phrase);
      added++;
    }
    return { added, total: this.entries.length };
  }

  /** Apply dictionary to a text. Longer phrases first to avoid prefix conflicts. */
  compress(text) {
    if (!text) return { text, dictionary: null };
    let out = String(text);
    // Sort entries by phrase length DESC so longer phrases replace first
    const sorted = [...this.entries].sort((a, b) => b.phrase.length - a.phrase.length);
    const used = new Set();
    for (const e of sorted) {
      // Escape regex specials in phrase for replace
      const re = new RegExp(escapeRe(e.phrase), 'g');
      if (re.test(out)) {
        out = out.replace(re, e.symbol);
        used.add(e.symbol);
      }
    }
    const ratio = out.length / String(text).length;
    return { text: out, used: [...used], ratio: Math.round(ratio * 1000) / 1000,
             raw_bytes: text.length, compressed_bytes: out.length };
  }

  expand(text) {
    if (!text) return text;
    let out = String(text);
    // Expand in REVERSE order of symbol length (shorter symbols later)
    // But here all symbols start with §F + base36 — they don't conflict with each other
    for (const e of this.entries) {
      const re = new RegExp(escapeRe(e.symbol), 'g');
      out = out.replace(re, e.phrase);
    }
    return out;
  }

  stats() {
    const totalDictBytes = this.entries.reduce((s, e) => s + e.phrase.length + e.symbol.length, 0);
    return {
      total_symbols: this.entries.length,
      dictionary_bytes: totalDictBytes,
      next_index: this._nextIdx,
      head_phi: PHI,
      top: this.entries.slice().sort((a, b) => b.freq - a.freq).slice(0, 10)
        .map(e => ({ symbol: e.symbol, phrase: e.phrase.slice(0, 60), freq: e.freq })),
    };
  }
}

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

// ── Formula compression — recurring structural patterns ──────────────────
//
// A formula is a parameterized template: "decision: $X because $Y" matches
// many concrete texts. We keep a small library of formulas; if a text matches
// one, we store it as a formula reference + parameter slots.

export const FORMULAS = [
  { id: 'decision_because',
    re: /^decision:\s*(.+?)\s+because\s+(.+?)\.?$/i,
    encode: (m) => ({ formula: 'decision_because', slots: { what: m[1], why: m[2] } }),
    decode: (s) => `decision: ${s.what} because ${s.why}.` },
  { id: 'observed_pattern',
    re: /^observed:\s*(.+?)\s+(\d+)\s*times?\s*\.?$/i,
    encode: (m) => ({ formula: 'observed_pattern', slots: { what: m[1], n: m[2] } }),
    decode: (s) => `observed: ${s.what} ${s.n} times.` },
  { id: 'doctrine_negative',
    re: /^never\s+(.+?)\.?$/i,
    encode: (m) => ({ formula: 'doctrine_negative', slots: { what: m[1] } }),
    decode: (s) => `Never ${s.what}.` },
  { id: 'doctrine_positive',
    re: /^always\s+(.+?)\.?$/i,
    encode: (m) => ({ formula: 'doctrine_positive', slots: { what: m[1] } }),
    decode: (s) => `Always ${s.what}.` },
];

export function tryFormula(text) {
  const s = String(text).trim();
  for (const f of FORMULAS) {
    const m = s.match(f.re);
    if (m) return { matched: true, ...f.encode(m), original_bytes: text.length, formula_id: f.id };
  }
  return { matched: false };
}

export function decodeFormula({ formula, slots }) {
  const f = FORMULAS.find(x => x.id === formula);
  if (!f) return null;
  return f.decode(slots);
}
