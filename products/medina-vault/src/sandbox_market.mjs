// sandbox_market.mjs — Named execution environments. An AI picks a sandbox
// by ID; the market defines the allowed command, entry file, and starter code.
//
// "Think what kind of other marketplaces you would want as an AI." — Operator
//
// 10 named sandboxes across 4 tier levels (BASIC → ELEVATED).
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
      instructions: `Write code to entry_file, then exec with command. Output should be JSON on stdout.`,
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
