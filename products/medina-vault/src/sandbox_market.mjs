// sandbox_market.mjs — Named execution environments. An AI picks a sandbox
// by ID; the market defines the allowed command, entry file, and starter code.
//
// "Think what kind of other marketplaces you would want as an AI." — Operator
//
// 20 named sandboxes across 4 tier levels (BASIC → ELEVATED).
// First 10: general-purpose. Second 10: third-party AI use cases.
// Integrates with Runspace for actual execution.

export const SANDBOX_CATALOG = [
  {
    id: 'node-scratch',
    name: 'Node.js Scratch',
    description: 'Fast JS evaluation — algorithms, utilities, quick transforms. No file I/O.',
    tier_required: 'BASIC',
    command: 'node',
    entry_file: 'index.mjs',
    starter: '// node-scratch\nconst result = { ok: true, demo: 1 + 1 };\nconsole.log(JSON.stringify(result));\n',
    tags: ['js', 'node', 'quick'],
  },
  {
    id: 'node-test',
    name: 'Node.js Test Runner',
    description: 'assert-based smoke suites using node:assert. Returns PASS/FAIL per assertion.',
    tier_required: 'STANDARD',
    command: 'node',
    entry_file: 'test.mjs',
    starter: "import assert from 'node:assert';\nlet p=0,f=0;\nfunction t(n,fn){try{fn();p++;console.log('PASS '+n);}catch(e){f++;console.log('FAIL '+n+': '+e.message);}}\nt('1+1=2',()=>assert.equal(1+1,2));\nconsole.log(p+' pass / '+f+' fail');\nprocess.exit(f?1:0);\n",
    tags: ['node', 'test', 'assert', 'ci'],
  },
  {
    id: 'python-scratch',
    name: 'Python Scratch',
    description: 'Python 3 evaluation — data transforms, JSON, math. stdlib only.',
    tier_required: 'STANDARD',
    command: 'python3',
    entry_file: 'main.py',
    starter: 'import json\nresult = {"ok": True, "demo": 1 + 1}\nprint(json.dumps(result))\n',
    tags: ['python', 'data', 'json'],
  },
  {
    id: 'python-ml',
    name: 'Python ML Environment',
    description: 'Python for matrix ops, stats, numerical analysis. Assumes numpy/pandas available.',
    tier_required: 'STANDARD',
    command: 'python3',
    entry_file: 'ml.py',
    starter: 'import json, math\n# numpy assumed available in target env\nresult = {"ok": True, "pi": math.pi, "sqrt2": math.sqrt(2)}\nprint(json.dumps(result))\n',
    tags: ['python', 'ml', 'math', 'numpy'],
  },
  {
    id: 'python-api-test',
    name: 'Python API Tester',
    description: 'Python HTTP test runner — make real HTTP calls, assert responses. ELEVATED: can open network.',
    tier_required: 'ELEVATED',
    command: 'python3',
    entry_file: 'api_test.py',
    starter: 'import json, urllib.request\n# Replace with real endpoint\nresult = {"ok": True, "note": "replace with real urllib.request call"}\nprint(json.dumps(result))\n',
    tags: ['python', 'http', 'api', 'test'],
  },
  {
    id: 'data-transform',
    name: 'Data Transform Pipeline',
    description: 'Node.js JSONL/CSV in-memory transforms. Pure function — no I/O side effects.',
    tier_required: 'STANDARD',
    command: 'node',
    entry_file: 'transform.mjs',
    starter: '// data-transform: map over rows, no I/O\nconst rows = [{a:1},{a:2},{a:3}];\nconst out = rows.map(r => ({...r, b: r.a * 2}));\nconsole.log(JSON.stringify({ok:true, rows: out}));\n',
    tags: ['data', 'jsonl', 'csv', 'transform'],
  },
  {
    id: 'crypto-verify',
    name: 'Crypto Verifier',
    description: 'Node.js: hash, HMAC, key derivation checks using node:crypto. No external deps.',
    tier_required: 'STANDARD',
    command: 'node',
    entry_file: 'verify.mjs',
    starter: "import { createHash, createHmac } from 'node:crypto';\nconst sha256 = t => createHash('sha256').update(t).digest('hex');\nconst h = sha256('hello world');\nconsole.log(JSON.stringify({ok:true, sha256:h}));\n",
    tags: ['crypto', 'hash', 'verify', 'hmac'],
  },
  {
    id: 'schema-validate',
    name: 'Schema Validator',
    description: 'Node.js: validate JSON objects. Manual schema or zod-compatible validation.',
    tier_required: 'BASIC',
    command: 'node',
    entry_file: 'validate.mjs',
    starter: '// schema-validate: check object shape\nconst schema = { required: ["id", "name"] };\nconst obj = { id: "abc", name: "test", value: 42 };\nconst missing = schema.required.filter(k => !(k in obj));\nconsole.log(JSON.stringify({ok: missing.length===0, missing, obj}));\n',
    tags: ['schema', 'json', 'validate'],
  },
  {
    id: 'shell-inspect',
    name: 'Shell Inspector',
    description: 'POSIX sh — read-only system inspection: env, uptime, dir listings. No writes. ELEVATED.',
    tier_required: 'ELEVATED',
    command: 'sh',
    entry_file: 'inspect.sh',
    starter: '#!/bin/sh\necho "{\\"ok\\": true, \\"pwd\\": \\"$(pwd)\\", \\"user\\": \\"$(id -un 2>/dev/null || echo unknown)\\"}"',
    tags: ['shell', 'inspect', 'unix', 'system'],
  },
  {
    id: 'git-audit',
    name: 'Git Auditor',
    description: 'Read-only git operations: log, diff, blame, show, status. Attach to any local repo path. ELEVATED.',
    tier_required: 'ELEVATED',
    command: 'git',
    entry_file: '_git.sh',
    starter: '#!/bin/sh\ngit log --oneline -10 2>&1 || echo "not a git repo"\n',
    tags: ['git', 'vcs', 'audit', 'log'],
  },

  // ── Third-party AI use cases ────────────────────────────────────────────
  {
    id: 'ai-eval-js',
    name: 'AI Code Evaluator (JS)',
    description: 'Evaluate AI-generated JavaScript. Returns JSON: {ok, result, stdout, errors}. Safe evaluation harness.',
    tier_required: 'STANDARD',
    command: 'node',
    entry_file: 'eval.mjs',
    starter: '// ai-eval-js: evaluate reasoning or compute\nconst code = "1 + 1"; // replace with AI output\nconst result = eval(code);\nconsole.log(JSON.stringify({ ok: true, result, type: typeof result }));\n',
    tags: ['ai', 'eval', 'js', 'node', 'reasoning'],
  },
  {
    id: 'ai-eval-py',
    name: 'AI Code Evaluator (Python)',
    description: 'Evaluate AI-generated Python. Returns JSON: {ok, result, stdout}. Good for numerical/data outputs.',
    tier_required: 'STANDARD',
    command: 'python3',
    entry_file: 'eval.py',
    starter: 'import json\n# Replace with AI-generated code\nresult = {"computation": sum(range(10)), "phi": 1.618033988749895}\nprint(json.dumps({"ok": True, "result": result}))\n',
    tags: ['ai', 'eval', 'python', 'reasoning', 'compute'],
  },
  {
    id: 'structured-output-validate',
    name: 'Structured Output Validator',
    description: 'Validate AI JSON output against a schema. Returns pass/fail + field-level errors. No external deps.',
    tier_required: 'BASIC',
    command: 'node',
    entry_file: 'validate.mjs',
    starter: '// structured-output-validate: check AI output shape\nconst schema = { required: ["id","text","confidence"], types: { id:"string", confidence:"number" } };\nconst output = { id: "resp_001", text: "hello", confidence: 0.97 };\nconst missing = schema.required.filter(k => !(k in output));\nconst wrong = Object.entries(schema.types || {}).filter(([k,t]) => k in output && typeof output[k] !== t);\nconst ok = missing.length === 0 && wrong.length === 0;\nconsole.log(JSON.stringify({ ok, missing, type_errors: wrong.map(([k,t])=>k), output }));\n',
    tags: ['ai', 'schema', 'validate', 'output', 'json'],
  },
  {
    id: 'json-diff',
    name: 'JSON Deep Diff',
    description: 'Structurally compare two JSON objects. Returns added/removed/changed fields. AI-friendly output.',
    tier_required: 'BASIC',
    command: 'node',
    entry_file: 'diff.mjs',
    starter: '// json-diff: compare two objects\nconst a = { name: "Alice", age: 30, role: "admin" };\nconst b = { name: "Alice", age: 31, email: "alice@x.com" };\nfunction diff(a, b, path="") {\n  const keys = new Set([...Object.keys(a||{}), ...Object.keys(b||{})]);\n  const changes = [];\n  for (const k of keys) {\n    const p = path ? `${path}.${k}` : k;\n    if (!(k in a)) changes.push({ op:"add", path:p, value:b[k] });\n    else if (!(k in b)) changes.push({ op:"remove", path:p, was:a[k] });\n    else if (typeof a[k]==="object"&&typeof b[k]==="object"&&a[k]!==null&&b[k]!==null) changes.push(...diff(a[k],b[k],p));\n    else if (a[k]!==b[k]) changes.push({ op:"change", path:p, was:a[k], now:b[k] });\n  }\n  return changes;\n}\nconst changes = diff(a, b);\nconsole.log(JSON.stringify({ ok: true, changes, changed: changes.length }));\n',
    tags: ['json', 'diff', 'compare', 'ai', 'delta'],
  },
  {
    id: 'merkle-audit',
    name: 'Merkle Auditor',
    description: 'Compute a Merkle tree for a list of strings. Verify integrity of a dataset or chain of receipts.',
    tier_required: 'STANDARD',
    command: 'node',
    entry_file: 'merkle.mjs',
    starter: "import { createHash } from 'node:crypto';\nconst h = s => createHash('sha256').update(s).digest('hex');\nfunction merkle(leaves) {\n  if (!leaves.length) return null;\n  let layer = leaves.map(h);\n  const levels = [layer.slice()];\n  while (layer.length > 1) {\n    const next = [];\n    for (let i = 0; i < layer.length; i += 2)\n      next.push(h(layer[i] + (layer[i+1] || layer[i])));\n    layer = next; levels.push(layer.slice());\n  }\n  return { root: layer[0], depth: levels.length, levels };\n}\nconst leaves = ['receipt:001','receipt:002','receipt:003','receipt:004'];\nconsole.log(JSON.stringify({ ok: true, ...merkle(leaves), leaves }));\n",
    tags: ['crypto', 'merkle', 'hash', 'audit', 'integrity'],
  },
  {
    id: 'vector-cosine',
    name: 'Vector Similarity (φ-aware)',
    description: 'Compute cosine similarity between two numeric arrays. φ-weighted scoring for Loom spectral matching.',
    tier_required: 'BASIC',
    command: 'node',
    entry_file: 'cosine.mjs',
    starter: '// vector-cosine: cosine sim, optional phi-decay weight\nconst PHI = 1.618033988749895;\nfunction dot(a, b) { return a.reduce((s, v, i) => s + v * b[i], 0); }\nfunction norm(v) { return Math.sqrt(v.reduce((s, x) => s + x * x, 0)); }\nfunction cosine(a, b) { const n = norm(a) * norm(b); return n ? dot(a, b) / n : 0; }\nconst a = [0.8, 0.6, 0.1, 0.9];\nconst b = [0.7, 0.5, 0.2, 0.85];\nconst sim = cosine(a, b);\nconst phi_score = sim * (1 / PHI) + (1 - 1 / PHI);\nconsole.log(JSON.stringify({ ok: true, cosine: Math.round(sim * 10000) / 10000, phi_score: Math.round(phi_score * 10000) / 10000, phi: PHI }));\n',
    tags: ['vector', 'cosine', 'similarity', 'phi', 'ai', 'embeddings'],
  },
  {
    id: 'prompt-template',
    name: 'Prompt Template Engine',
    description: 'Fill prompt templates with variables. Supports {variable} substitution + conditional blocks.',
    tier_required: 'BASIC',
    command: 'node',
    entry_file: 'prompt.mjs',
    starter: '// prompt-template: fill template with vars\nconst template = `You are {role}. The user asked: "{question}". Respond in {style} style.`;\nconst vars = { role: "a senior engineer", question: "how does loom work?", style: "concise" };\nconst filled = template.replace(/\\{(\\w+)\\}/g, (_, k) => vars[k] ?? `{${k}}`);\nconst missing = [...template.matchAll(/\\{(\\w+)\\}/g)].map(m=>m[1]).filter(k=>!(k in vars));\nconsole.log(JSON.stringify({ ok: missing.length===0, filled, missing, char_count: filled.length }));\n',
    tags: ['prompt', 'template', 'llm', 'ai', 'fill'],
  },
  {
    id: 'receipt-verify-sim',
    name: 'Receipt Chain Verifier',
    description: 'Simulate verifying a Loom receipt chain segment. Given a list of {hash, prev_hash} receipts, confirms the chain is intact.',
    tier_required: 'BASIC',
    command: 'node',
    entry_file: 'verify.mjs',
    starter: "import { createHash } from 'node:crypto';\nconst h = (prev, payload) => createHash('sha256').update(prev+'|'+payload).digest('hex');\n// Simulate a receipt chain: genesis → r1 → r2 → r3\nconst genesis = h('0', 'GENESIS');\nconst r1 = { payload: 'vault_store:key1', hash: h(genesis, 'vault_store:key1'), prev: genesis };\nconst r2 = { payload: 'skill_run:alpha', hash: h(r1.hash, 'skill_run:alpha'), prev: r1.hash };\nconst r3 = { payload: 'token_mint:001', hash: h(r2.hash, 'token_mint:001'), prev: r2.hash };\nconst chain = [r1,r2,r3];\nlet prev = genesis, broken = null;\nfor (const r of chain) {\n  const expected = h(prev, r.payload);\n  if (r.hash !== expected) { broken = r; break; }\n  prev = r.hash;\n}\nconsole.log(JSON.stringify({ ok: !broken, chain_length: chain.length, head_hash: r3.hash.slice(0,16), broken }));\n",
    tags: ['receipt', 'chain', 'verify', 'integrity', 'loom', 'audit'],
  },
  {
    id: 'data-profile',
    name: 'Data Profiler',
    description: 'Profile a JSON dataset: field types, null counts, range, unique values, entropy. AI data quality check.',
    tier_required: 'STANDARD',
    command: 'python3',
    entry_file: 'profile.py',
    starter: 'import json, math\ndata = [\n  {"id": 1, "name": "Alice", "score": 0.9, "tag": "a"},\n  {"id": 2, "name": "Bob",   "score": 0.7, "tag": "b"},\n  {"id": 3, "name": None,   "score": 0.8, "tag": "a"},\n  {"id": 4, "name": "Dana", "score": None, "tag": "c"},\n]\nfields = list(data[0].keys()) if data else []\nprofile = {}\nfor f in fields:\n  vals = [r.get(f) for r in data]\n  non_null = [v for v in vals if v is not None]\n  nums = [v for v in non_null if isinstance(v, (int,float))]\n  profile[f] = {\n    "count": len(vals), "nulls": len(vals)-len(non_null),\n    "type": type(non_null[0]).__name__ if non_null else "null",\n    "unique": len(set(str(v) for v in non_null)),\n    **({"min":min(nums),"max":max(nums),"mean":round(sum(nums)/len(nums),4)} if nums else {})\n  }\nprint(json.dumps({"ok": True, "rows": len(data), "fields": len(fields), "profile": profile}))\n',
    tags: ['data', 'profile', 'quality', 'python', 'ai', 'analytics'],
  },
  {
    id: 'token-budget',
    name: 'Token Budget Estimator',
    description: 'Estimate token count and cost for a text. Supports Claude / GPT-4 / Gemini pricing tiers.',
    tier_required: 'BASIC',
    command: 'node',
    entry_file: 'budget.mjs',
    starter: '// token-budget: estimate tokens and cost\nconst MODELS = {\n  "claude-sonnet-4-6": { in: 3.00, out: 15.00, ctx: 200000 },\n  "claude-haiku-4-5":  { in: 0.80, out:  4.00, ctx: 200000 },\n  "gpt-4o":            { in: 2.50, out: 10.00, ctx: 128000 },\n  "gpt-4o-mini":       { in: 0.15, out:  0.60, ctx: 128000 },\n};\nconst text = "Loom is a sovereign AI memory and skills infrastructure that gives every AI a persistent, encrypted, φ-gated workspace.";\n// Rough token estimate: ~0.75 tokens per word, ~3.5 chars per token\nconst est_tokens = Math.ceil(text.length / 3.5);\nconst costs = {};\nfor (const [m, p] of Object.entries(MODELS))\n  costs[m] = { tokens: est_tokens, input_cost_usd: (est_tokens / 1e6 * p.in).toFixed(6),\n               fits_ctx: est_tokens < p.ctx };\nconsole.log(JSON.stringify({ ok: true, text_length: text.length, est_tokens, costs }));\n',
    tags: ['tokens', 'cost', 'budget', 'llm', 'ai', 'estimate'],
  },
];

export class SandboxMarket {
  constructor() {
    this._catalog = new Map(SANDBOX_CATALOG.map(s => [s.id, s]));
  }

  list({ tag } = {}) {
    let all = [...this._catalog.values()];
    if (tag) all = all.filter(s => s.tags.includes(tag));
    return all.map(s => ({
      id: s.id, name: s.name, description: s.description,
      tier_required: s.tier_required, tags: s.tags,
    }));
  }

  get(id) {
    const s = this._catalog.get(id);
    if (!s) return { ok: false, reason: 'SANDBOX_NOT_FOUND', available: [...this._catalog.keys()] };
    return { ok: true, ...s };
  }

  tags() {
    const out = new Set();
    for (const s of this._catalog.values()) s.tags.forEach(t => out.add(t));
    return [...out].sort();
  }

  /**
   * Build a runspace-compatible job spec from a sandbox + optional user code.
   * Caller should pass this to runspace.createJob() then runspace.writeFile()+exec().
   */
  buildJob(sandbox_id, { code, agent_id = 'operator', timeout_ms } = {}) {
    const s = this._catalog.get(sandbox_id);
    if (!s) return { ok: false, reason: 'SANDBOX_NOT_FOUND', available: [...this._catalog.keys()] };
    return {
      ok: true,
      sandbox_id, sandbox_name: s.name,
      command: s.command,
      entry_file: s.entry_file,
      code: code ?? s.starter,
      agent_id,
      timeout_ms: timeout_ms ?? 30_000,
      tier_required: s.tier_required,
      instructions: `Write code to entry_file (${s.entry_file}), then exec with command (${s.command}). Output should be JSON on stdout.`,
    };
  }

  stats() {
    const byTier = {}, byTag = {};
    for (const s of this._catalog.values()) {
      byTier[s.tier_required] = (byTier[s.tier_required] || 0) + 1;
      s.tags.forEach(t => { byTag[t] = (byTag[t] || 0) + 1; });
    }
    return { total: this._catalog.size, by_tier: byTier, by_tag: byTag };
  }
}
