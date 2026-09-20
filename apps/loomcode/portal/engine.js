/**
 * engine.js — Loom Code's pipeline, in the browser.
 *
 * This is a real implementation, not a mock: the same four stages the service
 * runs, over whatever files the visitor pastes in. It exists because a product
 * page that says "here is how it works" and then shows a recording is asking
 * for trust it has not earned. Paste your own code and the numbers move.
 *
 * Two honest differences from the service, both stated on the page:
 *
 *   1. Python only. The service parses ten languages through tree-sitter
 *      grammars; shipping those to a browser is megabytes of WASM for a
 *      playground. Here the extractor is indentation-aware rather than a real
 *      AST, which is exact for ordinary Python and will mis-span a file that
 *      does something exotic with line continuations.
 *   2. No persistence, no account, no network. Nothing leaves the page.
 *
 * Everything else — confidence tiers, confidence-weighted PageRank, RRF over
 * three signals, priority-filled packs with per-tier caps — is the same
 * algorithm, ported from loomcode/{parse,graph,rank,pack}.py.
 */

// --- tokenisation -------------------------------------------------------------

const STOP = new Set(["the", "a", "an", "of", "to", "for", "and", "or", "is", "it",
  "this", "that", "with", "from", "in", "on", "as", "by", "be", "are", "was", "at",
  "so", "not", "self", "return", "returns", "none", "true", "false"]);

export function tokens(text) {
  const out = [];
  for (const raw of String(text).split(/[^A-Za-z0-9]+/)) {
    if (!raw) continue;
    const low = raw.toLowerCase();
    if (!STOP.has(low) && low.length > 1) out.push(low);
    // camelCase / snake_case splits, so `optimalPrice` answers "optimal price"
    for (const part of raw.match(/[A-Z]+(?![a-z])|[A-Z][a-z]+|[a-z]+|\d+/g) || []) {
      const pl = part.toLowerCase();
      if (pl !== low && !STOP.has(pl) && pl.length > 2) out.push(pl);
    }
  }
  return out;
}

// --- 01 · parse ---------------------------------------------------------------

const DEF_RE = /^(\s*)(?:(async)\s+)?(def|class)\s+([A-Za-z_]\w*)\s*(\([^)]*\))?/;
const CONST_RE = /^([A-Z][A-Z0-9_]*)\s*=/;

// Python keywords that take a parenthesis and would otherwise read as calls:
// `return (a - b)` is not a call to a function named `return`.
const KEYWORDS = new Set(["return", "if", "elif", "while", "for", "with", "assert",
  "yield", "await", "raise", "del", "not", "and", "or", "in", "is", "lambda",
  "else", "try", "except", "finally", "import", "from", "class", "def", "print"]);

/**
 * Blank out comments and string literals, preserving offsets.
 *
 * Without this the call scanner reads prose. The docstring phrase "demand is
 * elastic (e < -1)" registers an edge to a function named `elastic`, and every
 * example written in a comment becomes a dependency. Offsets are preserved by
 * substituting spaces, so line numbers derived from the result still point at
 * the right place.
 */
function blankStringsAndComments(src) {
  const out = src.split("");
  const TRIPLES = ['"""', "'''"];
  let i = 0;
  while (i < src.length) {
    const three = src.slice(i, i + 3);
    if (TRIPLES.includes(three)) {
      const close = src.indexOf(three, i + 3);
      const end = close === -1 ? src.length : close + 3;
      for (let j = i; j < end; j++) if (out[j] !== "\n") out[j] = " ";
      i = end;
      continue;
    }
    const ch = src[i];
    if (ch === '"' || ch === "'") {
      let j = i + 1;
      while (j < src.length && src[j] !== ch && src[j] !== "\n") {
        if (src[j] === "\\") j++;
        j++;
      }
      for (let k = i; k <= Math.min(j, src.length - 1); k++) {
        if (out[k] !== "\n") out[k] = " ";
      }
      i = j + 1;
      continue;
    }
    if (ch === "#") {
      let j = i;
      while (j < src.length && src[j] !== "\n") { out[j] = " "; j++; }
      i = j;
      continue;
    }
    i++;
  }
  return out.join("");
}

/**
 * The parameter list as bare names, matching `_py_sig` in loomcode/parse.py.
 *
 * The service records `(a, b, c)`; lifting the annotated source text instead
 * feeds the ranker every type name as if it were part of the symbol's
 * vocabulary, so a file full of `: float` starts answering queries about
 * floats. Handles signatures wrapped across lines, which a single-line regex
 * silently returns empty for — and an empty signature means that symbol
 * contributes nothing to the doubled signature/docstring field.
 */
function signatureOf(lines, headerIdx) {
  let depth = 0, started = false, buf = "";
  for (let j = headerIdx; j < lines.length; j++) {
    const code = lines[j].split("#")[0];
    for (const ch of code) {
      if (ch === "(") { depth++; started = true; if (depth === 1) continue; }
      else if (ch === ")") { depth--; if (depth === 0) { started = false; break; } }
      if (started && depth >= 1) buf += ch;
    }
    if (started === false && buf) break;
    if (!started && depth === 0 && j > headerIdx) break;
  }
  if (!buf.trim()) return "()";

  // split on top-level commas only, so `dict[str, int]` and `f(a, b)` defaults
  // do not fragment into bogus parameters
  const parts = [];
  let cur = "", d = 0;
  for (const ch of buf) {
    if ("([{".includes(ch)) d++;
    else if (")]}".includes(ch)) d--;
    if (ch === "," && d === 0) { parts.push(cur); cur = ""; continue; }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur);

  const names = parts
    .map((p) => p.split("=")[0].split(":")[0].trim())
    .filter((p) => p && p !== "self" && p !== "cls" && /^[*\w]+$/.test(p));
  return "(" + names.join(", ") + ")";
}

function indentOf(line) {
  const m = line.match(/^(\s*)/);
  return m ? m[1].replace(/\t/g, "    ").length : 0;
}

/**
 * Symbols with real line spans, found by indentation.
 *
 * The end of a block is the last line before something returns to an indent at
 * or below the header's. Blank lines and comments do not end a block — treating
 * them as terminators is the classic way to truncate a function at its first
 * paragraph break.
 */
export function parseFile(path, text) {
  const lines = text.split("\n");
  const symbols = [];
  const calls = [];
  const imports = new Set();

  const headers = [];
  lines.forEach((line, i) => {
    const im = line.match(/^\s*(?:from\s+([\w.]+)\s+import|import\s+([\w.,\s]+))/);
    if (im) {
      (im[1] ? [im[1]] : im[2].split(",")).forEach((m) => imports.add(m.trim()));
    }
    const m = line.match(DEF_RE);
    if (m) {
      headers.push({ line: i, indent: m[1].replace(/\t/g, "    ").length,
                     kind: m[3] === "class" ? "class" : "function",
                     name: m[4],
                     signature: m[3] === "class" ? "" : signatureOf(lines, i) });
      return;
    }
    const c = line.match(CONST_RE);
    if (c && indentOf(line) === 0) {
      symbols.push({ path, name: c[1], kind: "const", lineStart: i + 1, lineEnd: i + 1,
                     signature: "", intent: "", parent: null });
    }
  });

  headers.forEach((h, idx) => {
    // A block ends at the first line indented at or below the header. Blank
    // lines neither end it nor extend it; a comment is judged by its indent
    // like anything else. Treating every comment as "inside" swept the
    // top-level `# --- section ---` banner that follows a function into that
    // function's span, which then quotes four lines that are not its own.
    let end = h.line;
    for (let j = h.line + 1; j < lines.length; j++) {
      const s = lines[j];
      if (!s.trim()) continue;
      if (indentOf(s) <= h.indent) break;
      end = j;
    }

    // the enclosing class, if this header sits inside one
    let parent = null;
    for (let k = idx - 1; k >= 0; k--) {
      if (headers[k].indent < h.indent) {
        if (headers[k].kind === "class") parent = headers[k].name;
        break;
      }
    }

    const body = lines.slice(h.line, end + 1).join("\n");
    symbols.push({
      path, name: h.name,
      kind: h.kind === "class" ? "class" : (parent ? "method" : "function"),
      lineStart: h.line + 1, lineEnd: end + 1,
      signature: h.signature, intent: docstringOf(lines, h.line, h.indent), parent,
      complexity: (body.match(/\b(if|for|while|try|except|with|elif)\b/g) || []).length,
    });

    // call sites attributed to the innermost enclosing def
    if (h.kind !== "class") {
      const re = /([A-Za-z_]\w*)\s*\(/g;
      let m;
      const bodyOnly = blankStringsAndComments(lines.slice(h.line + 1, end + 1).join("\n"));
      while ((m = re.exec(bodyOnly)) !== null) {
        const name = m[1];
        if (name === h.name) continue;                 // direct recursion is not an edge
        if (KEYWORDS.has(name)) continue;
        const before = bodyOnly.slice(Math.max(0, m.index - 1), m.index);
        if (/\w/.test(before)) continue;
        const line = h.line + 1 + bodyOnly.slice(0, m.index).split("\n").length;
        calls.push({ path, caller: h.name, callee: name, line });
      }
    }
  });

  symbols.sort((a, b) => a.lineStart - b.lineStart);
  return { path, lines: lines.length, bytes: new TextEncoder().encode(text).length,
           symbols, calls, imports: [...imports].sort(),
           moduleIntent: moduleIntent(lines) };
}

function docstringOf(lines, headerIdx, indent) {
  // Find where the `def` header actually ends first. A signature wrapped over
  // several lines put the scan inside the parameter list, so any function with
  // more than a line of arguments came back with no intent at all — and intent
  // is most of what natural-language search has to match on.
  let j = headerIdx;
  let depth = 0;
  for (; j < lines.length; j++) {
    const code = lines[j].split("#")[0];
    for (const ch of code) {
      if (ch === "(" || ch === "[") depth++;
      else if (ch === ")" || ch === "]") depth--;
    }
    if (depth <= 0 && /:\s*$/.test(code)) break;
  }

  for (let k = j + 1; k < Math.min(j + 3, lines.length); k++) {
    const s = lines[k].trim();
    if (!s) continue;
    const m = s.match(/^(?:"""|''')(.*)/);
    if (!m) return "";
    const first = (m[1] || "").replace(/("""|''')\s*$/, "").trim();
    return (first || (lines[k + 1] || "").trim()).slice(0, 120);
  }
  return "";
}

/** The module docstring's first line, which heads every profile card. */
function moduleIntent(lines) {
  for (let i = 0; i < Math.min(5, lines.length); i++) {
    const s = lines[i].trim();
    if (!s) continue;
    const m = s.match(/^(?:"""|''')(.*)/);
    if (!m) return "";
    const first = (m[1] || "").replace(/("""|''')\s*$/, "").trim();
    return (first || (lines[i + 1] || "").trim()).slice(0, 120);
  }
  return "";
}

// --- 02 · resolve -------------------------------------------------------------

export const CONFIDENCE_WEIGHT = { exact: 1.0, likely: 0.75, ambiguous: 0.4, external: 0.0 };

// Calls nobody would follow. On a real module these outnumber the real edges
// about four to one and bury the dependencies that matter.
// Generated from loomcode/graph.py's BUILTIN_NOISE by portal/sync.py — do not
// hand-edit. The playground and the service have to agree on what counts as an
// edge, or the numbers on the page stop describing the product.
const BUILTIN_NOISE = new Set([
  "JSON", "abs", "add", "all", "any", "append", "as_str", "bool", "clear", "clone",
  "concat", "console", "copy", "count", "decode", "dict", "encode", "endswith",
  "enumerate", "equals", "extend", "filter", "find", "float", "forEach", "format",
  "frozenset", "get", "getattr", "hasattr", "hashCode", "index", "insert", "int",
  "into", "isinstance", "issubclass", "items", "iter", "join", "keys", "len", "list",
  "log", "lower", "lstrip", "make", "map", "max", "min", "next", "open", "panic",
  "parseFloat", "parseInt", "pop", "print", "printf", "println", "push", "range",
  "reduce", "remove", "replace", "repr", "require", "reverse", "reversed", "round",
  "rstrip", "set", "setattr", "setdefault", "shift", "slice", "sort", "sorted",
  "splice", "split", "sprintf", "startswith", "str", "stringify", "strip", "sum",
  "toString", "to_string", "tuple", "type", "unshift", "unwrap", "update", "upper",
  "values", "zip"
]);

export function resolveCalls(files) {
  const defsByName = new Map();
  for (const f of files) {
    for (const s of f.symbols) {
      if (s.kind === "const") continue;
      if (!defsByName.has(s.name)) defsByName.set(s.name, []);
      defsByName.get(s.name).push(s);
    }
  }
  const edges = [];
  for (const f of files) {
    for (const c of f.calls) {
      const candidates = defsByName.get(c.callee) || [];
      if (BUILTIN_NOISE.has(c.callee) && candidates.length === 0) continue;
      const local = candidates.filter((d) => d.path === c.path);
      if (local.length === 1) {
        edges.push({ ...c, toPath: local[0].path, confidence: "exact" });
      } else if (candidates.length === 1) {
        edges.push({ ...c, toPath: candidates[0].path, confidence: "likely" });
      } else if (candidates.length > 1) {
        for (const d of candidates) {
          edges.push({ ...c, toPath: d.path, confidence: "ambiguous",
                       candidates: candidates.length });
        }
      } else {
        edges.push({ ...c, toPath: null, confidence: "external" });
      }
    }
  }
  return edges;
}

/**
 * PageRank weighted by confidence, with dangling rank redistributed.
 *
 * A guessed edge moves less rank than a resolved one, so a hub does not form
 * purely because the name `get` is popular. Leaves are the majority of any real
 * codebase, so leaking their rank instead of redistributing it would deflate
 * every score and make the ordering depend on how many leaves got indexed.
 */
export function pagerank(edges, nodes, damping = 0.85, iterations = 40, tol = 1e-9) {
  if (!nodes.length) return new Map();
  const idx = new Map(nodes.map((n, i) => [n, i]));
  const n = nodes.length;
  const adj = Array.from({ length: n }, () => []);
  const outW = new Array(n).fill(0);

  for (const e of edges) {
    if (!e.toPath) continue;
    const src = `${e.path}:${e.caller}`, dst = `${e.toPath}:${e.callee}`;
    if (!idx.has(src) || !idx.has(dst) || src === dst) continue;
    const w = CONFIDENCE_WEIGHT[e.confidence];
    if (w <= 0) continue;
    adj[idx.get(src)].push([idx.get(dst), w]);
    outW[idx.get(src)] += w;
  }

  let rank = new Array(n).fill(1 / n);
  const base = (1 - damping) / n;
  for (let it = 0; it < iterations; it++) {
    const next = new Array(n).fill(base);
    let dangling = 0;
    for (let i = 0; i < n; i++) {
      if (outW[i] <= 0) { dangling += rank[i]; continue; }
      const share = (damping * rank[i]) / outW[i];
      for (const [j, w] of adj[i]) next[j] += share * w;
    }
    if (dangling) {
      const spread = (damping * dangling) / n;
      for (let i = 0; i < n; i++) next[i] += spread;
    }
    // Stop when it has converged, matching graph.py. Running the full forty
    // iterations regardless does not make the answer better — it just makes it
    // a different answer, several digits down, from the one the service gives.
    let delta = 0;
    for (let i = 0; i < n; i++) delta += Math.abs(next[i] - rank[i]);
    rank = next;
    if (delta < tol) break;
  }
  return new Map(nodes.map((k, i) => [k, rank[i]]));
}

// --- 03 · rank ----------------------------------------------------------------

export function bm25(docs, queryTerms, k1 = 1.5, b = 0.75) {
  const n = docs.length;
  if (!n || !queryTerms.size) return new Array(n).fill(0);
  const lens = docs.map((d) => d.length || 1);
  const avgdl = lens.reduce((a, c) => a + c, 0) / n;
  const counts = docs.map((d) => {
    const m = new Map();
    for (const t of d) m.set(t, (m.get(t) || 0) + 1);
    return m;
  });
  const scores = new Array(n).fill(0);
  for (const t of queryTerms) {
    let df = 0;
    for (const c of counts) if (c.has(t)) df++;
    if (!df) continue;
    const idf = Math.log(1 + (n - df + 0.5) / (df + 0.5));
    for (let i = 0; i < n; i++) {
      const tf = counts[i].get(t) || 0;
      if (tf) scores[i] += idf * (tf * (k1 + 1)) / (tf + k1 * (1 - b + (b * lens[i]) / avgdl));
    }
  }
  return scores;
}

export function nameMatchBoost(name, query) {
  const q = query.trim().toLowerCase(), nm = name.toLowerCase();
  if (!q || !nm) return 0;
  if (nm === q || nm === q.replace(/ /g, "_") || nm === q.replace(/ /g, "")) return 1;
  const parts = q.split(/[\s_]+/).filter(Boolean);
  if (!parts.length) return 0;
  const hits = parts.filter((p) => nm.includes(p)).length;
  let covered = hits / parts.length;
  if (nm.startsWith(parts[0]) || nm.endsWith(parts[parts.length - 1])) {
    covered = Math.min(1, covered + 0.15);
  }
  return Number((covered * 0.8).toFixed(4));
}

/**
 * Reciprocal Rank Fusion: combine positions, never scores.
 *
 * A BM25 score of 7.4 and a PageRank of 0.003 have no defensible exchange rate,
 * and any weighted sum of them is really a weighting of their variances. k=60
 * damps each list's head so a result has to place well across several signals
 * rather than winning on one ranker's confident first pick.
 */
export function rrf(rankings, k = 60, topK = null) {
  const fused = new Map(), where = new Map();
  for (const [name, [weight, ids]] of Object.entries(rankings)) {
    if (weight <= 0) continue;
    ids.forEach((id, pos) => {
      fused.set(id, (fused.get(id) || 0) + weight / (k + pos + 1));
      if (!where.has(id)) where.set(id, {});
      where.get(id)[name] = pos + 1;
    });
  }
  // Ties break on the document id, matching loomcode/rank.py. Without an
  // explicit rule the winner depends on insertion order, so the same query
  // could rank differently here than in the service.
  const out = [...fused.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  return (topK ? out.slice(0, topK) : out)
    .map(([id, score]) => ({ id, score, signals: where.get(id) }));
}

const order = (scores, limit) =>
  scores.map((s, i) => [i, s]).sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .slice(0, limit).filter(([, s]) => s > 0).map(([i]) => i);

// --- 04 · pack ----------------------------------------------------------------

const BYTES_PER_TOKEN = 4;
export const estimateTokens = (t) =>
  Math.ceil(new TextEncoder().encode(t).length / BYTES_PER_TOKEN);

// Priority alone is not enough: one hot utility with sixty callers would eat an
// entire budget on tier three and leave nothing for the file map.
const TIER_CAP = { primary: 1.0, callee: 0.35, caller: 0.25, sibling: 0.12, map: 0.2 };
const TIER_ORDER = ["primary", "callee", "caller", "sibling", "map"];

class Pack {
  constructor(budget) {
    this.budget = budget; this.used = 0;
    this.elements = []; this.omitted = [];
    this.tierUsed = Object.fromEntries(TIER_ORDER.map((t) => [t, 0]));
  }
  add(tier, sym, text, why, confidence, centrality) {
    const cost = estimateTokens(text);
    const e = { tier, path: sym.path, name: sym.name,
                citation: `${sym.path}:L${sym.lineStart}-L${sym.lineEnd}`,
                lineStart: sym.lineStart, lineEnd: sym.lineEnd, tokens: cost, why,
                confidence, centrality };
    if (this.used + cost > this.budget) {
      this.omitted.push({ ...e, reason: "budget exhausted" }); return false;
    }
    if (tier !== "primary" &&
        this.tierUsed[tier] + cost > Math.floor(this.budget * TIER_CAP[tier])) {
      this.omitted.push({ ...e, reason: `${tier} tier cap reached` }); return false;
    }
    this.elements.push({ ...e, text });
    this.used += cost; this.tierUsed[tier] += cost;
    return true;
  }
}

// A certain edge to a peripheral function beats a guessed edge to a hub: the
// highest-PageRank thing reachable from here is often reached by an ambiguous
// edge precisely *because* its name is common.
const CONF_ORDER = { exact: 0, likely: 1, ambiguous: 2, external: 3 };
const sortRelations = (rows, central) =>
  rows.slice().sort((a, b) =>
    (CONF_ORDER[a.confidence] ?? 3) - (CONF_ORDER[b.confidence] ?? 3) ||
    (central.get(`${b.path}:${b.name}`) || 0) - (central.get(`${a.path}:${a.name}`) || 0) ||
    a.name.localeCompare(b.name));

// --- the whole pipeline -------------------------------------------------------

export function run(sources, query, budgetTokens = 1200) {
  const files = Object.entries(sources).map(([p, t]) => parseFile(p, t));
  const edges = resolveCalls(files);
  // Constants are searchable — the service selects every indexed node, and a
  // query for "tax rate" should find TAX_RATE. They are excluded from the call
  // graph instead (a constant calls nothing), which resolveCalls already does.
  const allSymbols = files.flatMap((f) => f.symbols);
  const nodes = allSymbols
    .filter((s) => s.kind !== "const")
    .map((s) => `${s.path}:${s.name}`);
  const central = pagerank(edges, nodes);

  // Field weighting: the name four times, signature and docstring twice, the
  // path once. Without it a generic helper in a plausibly named file outranks
  // the function actually being searched for, purely on the filename.
  const docs = allSymbols.map((s) => [
    ...Array(4).fill(tokens(s.name)).flat(),
    ...Array(2).fill(tokens(`${s.signature} ${s.intent}`)).flat(),
    ...tokens(`${s.parent || ""} ${s.path.replace(/\.py$/, "")}`),
  ]);

  const q = new Set(tokens(query));
  const pool = Math.max(40, 8 * 6);
  const lexical = bm25(docs, q);
  const names = allSymbols.map((s) => nameMatchBoost(s.name, query));
  const rankings = { lexical: [1.0, order(lexical, pool)] };
  if (names.some(Boolean)) rankings.name = [0.9, order(names, pool)];

  // Centrality only votes among what the text signals already surfaced.
  // Unconstrained it returns the same hub functions for every query, which
  // reads as the index being broken.
  const eligible = new Set([...order(lexical, pool),
                            ...names.map((v, i) => (v > 0 ? i : -1)).filter((i) => i >= 0)]);
  // Quantise before ranking. PageRank agreeing to eleven decimal places is
  // agreement; letting the twelfth decide which of two symbols ranks higher
  // makes the result depend on summation order, which differs between any two
  // implementations and even between machines.
  const cvals = allSymbols.map((s) =>
    Number((central.get(`${s.path}:${s.name}`) || 0).toFixed(9)));
  const cranked = order(cvals, allSymbols.length).filter((i) => eligible.has(i));
  if (cranked.length) rankings.central = [0.35, cranked.slice(0, pool)];

  // Break remaining ties on file then line, not on array position: position is
  // an implementation detail that differs between this and the service, and a
  // ranking that depends on it is not reproducible.
  const fused = rrf(rankings, 60, null);
  const hits = fused
    .map((f) => ({ ...allSymbols[f.id], score: f.score, signals: f.signals,
                   centrality: cvals[f.id] }))
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path) ||
                    a.lineStart - b.lineStart)
    .slice(0, 8);

  const stats = {
    files: files.length,
    lines: files.reduce((a, f) => a + f.lines, 0),
    symbols: files.reduce((a, f) => a + f.symbols.length, 0),
    edges: edges.length,
    byConfidence: edges.reduce((acc, e) => ({ ...acc, [e.confidence]: (acc[e.confidence] || 0) + 1 }), {}),
    important: [...central.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
      .map(([k, v]) => ({ key: k, centrality: v })),
  };
  if (!hits.length) return { found: false, stats, query };

  const slice = (sym, pad = 0) => {
    const lines = (sources[sym.path] || "").split("\n");
    const lo = Math.max(1, sym.lineStart - pad), hi = Math.min(lines.length, sym.lineEnd + pad);
    return lines.slice(lo - 1, hi)
      .map((l, i) => String(lo + i).padStart(5) + " | " + l).join("\n");
  };

  const pk = new Pack(budgetTokens);
  const top = hits[0];
  pk.add("primary", top, slice(top, 1), "matched the query", null,
         central.get(`${top.path}:${top.name}`));

  const byKey = new Map(allSymbols.map((s) => [`${s.path}:${s.name}`, s]));
  const callees = [], callers = [];
  for (const e of edges) {
    if (e.path === top.path && e.caller === top.name && e.toPath) {
      callees.push({ name: e.callee, path: e.toPath, confidence: e.confidence });
    } else if (e.toPath === top.path && e.callee === top.name) {
      callers.push({ name: e.caller, path: e.path, confidence: e.confidence });
    }
  }
  const dedupe = (rows) => {
    const seen = new Set();
    return rows.filter((r) => {
      const k = `${r.path}:${r.name}`;
      if (seen.has(k) || k === `${top.path}:${top.name}`) return false;
      seen.add(k); return true;
    });
  };

  for (const [tier, rows, why] of [
    ["callee", dedupe(callees), "called by the match"],
    ["caller", dedupe(callers), "calls the match"],
  ]) {
    for (const r of sortRelations(rows, central)) {
      const sym = byKey.get(`${r.path}:${r.name}`);
      if (!sym) continue;
      pk.add(tier, sym, slice(sym), why, r.confidence,
             central.get(`${r.path}:${r.name}`));
    }
  }

  const siblings = allSymbols.filter((s) => s.path === top.path && s.name !== top.name);
  if (siblings.length) {
    const cap = Math.floor(budgetTokens * TIER_CAP.sibling);
    const ranked = siblings.slice().sort((a, b) =>
      (central.get(`${b.path}:${b.name}`) || 0) - (central.get(`${a.path}:${a.name}`) || 0));
    // Measure the joined body, not the sum of per-line estimates. Summing
    // rounded line costs and then admitting the assembled text lets the builder
    // and the cap disagree by the newlines, which is how an entire tier
    // disappears two tokens over the line.
    // The "… N more" footer is part of the body, so it has to be part of the
    // measurement. Appending it after the fill loop is what silently pushed
    // this tier two tokens past its cap and discarded the whole thing.
    const render = (rows) => {
      let body = rows.slice().sort((a, b) => a[0] - b[0]).map(([, l]) => l).join("\n");
      if (rows.length < siblings.length) {
        body += `\n  … ${siblings.length - rows.length} more, lowest-centrality omitted`;
      }
      return body;
    };
    const kept = [];
    for (const s of ranked) {
      const line = `  L${s.lineStart}-${s.lineEnd} ${s.kind.padEnd(8)} ${s.name}` +
                   (s.intent ? ` — ${s.intent}` : "");
      if (estimateTokens(render([...kept, [s.lineStart, line]])) > cap) break;
      kept.push([s.lineStart, line]);
    }
    if (kept.length) {
      const body = render(kept);
      pk.add("sibling", { path: top.path, name: `${kept.length} of ${siblings.length} other symbols`,
                          lineStart: 1, lineEnd: top.lineStart },
             body, "same file, names only");
    }
  }

  for (const h of hits.slice(1)) {
    if (h.path === top.path) continue;
    const f = files.find((x) => x.path === h.path);
    if (!f || pk.elements.some((e) => e.tier === "map" && e.path === h.path)) continue;
    // Same shape as Card.render in loomcode/index.py, down to the leading
    // complexity marker — the page quotes byte counts, so the rendering the
    // numbers come from has to be the rendering the service produces.
    const card = [`# ${f.path}  [python, ${f.lines} lines]`,
      f.moduleIntent ? `  ${f.moduleIntent}` : "",
      f.imports.length ? `  imports: ${f.imports.slice(0, 12).join(", ")}` : "",
      ...f.symbols.slice(0, 30).map((s) =>
        ` ${(s.complexity || 0) >= 8 ? "!" : " "}L${s.lineStart}-${s.lineEnd} ` +
        `${s.kind.padEnd(8)} ${(s.parent ? s.parent + "." : "")}${s.name}` +
        (s.intent ? `  — ${s.intent}` : "")),
      f.symbols.length > 30 ? `  … ${f.symbols.length - 30} more symbols` : "",
    ].filter(Boolean).join("\n");
    pk.add("map", { path: f.path, name: f.path, lineStart: 1, lineEnd: f.lines },
           card, "also matched — file shape only");
  }

  const fullBytes = Object.values(sources)
    .reduce((a, t) => a + new TextEncoder().encode(t).length, 0);
  const fullTokens = Math.ceil(fullBytes / BYTES_PER_TOKEN);

  return {
    found: true, query, stats, hits,
    pack: { budget: pk.budget, used: pk.used, elements: pk.elements, omitted: pk.omitted,
            tiers: pk.tierUsed },
    fullTokens,
    reduction: pk.used ? Number((fullTokens / pk.used).toFixed(2)) : null,
    tierOrder: TIER_ORDER,
  };
}
