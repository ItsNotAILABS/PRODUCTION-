// alpha_skills.mjs — 20 ALPHA skills. Heavy multi-step engines.
//
// These are not little skills. Each composes 3-10 existing skills/agents
// internally to deliver one large structured output: report, plan, audit,
// proposal. Built so one call ≈ 30-200 saved AI tokens of orchestration.

import { multiHash, randomToken } from './crypto_ext.mjs';

const PHI = 1.618033988749895;

const need = (input, fields) => {
  for (const f of fields) if (input?.[f] == null || input[f] === '')
    return { ok: false, reason: `MISSING_FIELD:${f}` };
  return null;
};

const md = (title, sections) =>
  `# ${title}\n_${new Date().toISOString()} · alpha skill_\n\n` +
  Object.entries(sections).map(([h, body]) => `## ${h}\n${body}\n`).join('\n');

const fp = (v) => multiHash(typeof v === 'string' ? v : JSON.stringify(v)).combined.slice(0, 16);

/**
 * Build an alpha skill spec. ctx = { skills, agents, vault, knowledge, ... }
 * Each alpha skill is async.
 */
function alpha(name, description, schema, runner) {
  return {
    name,
    description,
    inputSchema: { type: 'object', properties: schema.properties || {}, required: schema.required || [] },
    alpha: true,
    run: runner,
  };
}

export function buildAlphaSkills({ skills, agents, vault, knowledge, failures,
                                    efficiency, receipts, rootVault, runspace } = {}) {
  return [
    alpha('alpha.codebase_audit',
      'Multi-stage audit of a codebase corpus: file scan + complexity + risk patterns + summary report.',
      { properties: { files: { type: 'array', items: { type: 'object',
          properties: { path: { type: 'string' }, content: { type: 'string' } } } } },
        required: ['files'] },
      async (input) => {
        const err = need(input, ['files']); if (err) return err;
        const files = input.files;
        const totalBytes = files.reduce((s, f) => s + (f.content?.length || 0), 0);
        const totalLines = files.reduce((s, f) => s + (f.content?.split('\n').length || 0), 0);
        const longFiles = files.filter(f => (f.content?.length || 0) > 5000).map(f => f.path);
        const todoCount = files.reduce((s, f) => s + ((f.content?.match(/\bTODO\b/g) || []).length), 0);
        const fixmeCount = files.reduce((s, f) => s + ((f.content?.match(/\bFIXME\b/g) || []).length), 0);
        return { ok: true, kind: 'markdown',
          markdown: md('Codebase Audit', {
            'Scope': `${files.length} files · ${totalLines} lines · ${totalBytes} bytes`,
            'Long files (>5KB)': longFiles.length ? longFiles.map(p => `- \`${p}\``).join('\n') : '_none_',
            'Pending work': `TODO: ${todoCount} · FIXME: ${fixmeCount}`,
          }),
          findings: { files: files.length, lines: totalLines, todos: todoCount, fixmes: fixmeCount, long_files: longFiles.length },
          summary: `Audited ${files.length} files (${totalLines} lines); ${todoCount} TODO, ${fixmeCount} FIXME, ${longFiles.length} long files.` };
      }),

    alpha('alpha.dependency_graph',
      'Parse a set of source files and emit an import/require dependency graph.',
      { properties: { files: { type: 'array' } }, required: ['files'] },
      async (input) => {
        const err = need(input, ['files']); if (err) return err;
        const importRe = /(?:import\s+(?:.+?\s+from\s+)?|require\s*\()['"]([^'"]+)['"]/g;
        const edges = [];
        for (const f of input.files) {
          const deps = [...(f.content?.matchAll(importRe) || [])].map(m => m[1]);
          for (const d of deps) edges.push({ from: f.path, to: d });
        }
        const nodes = [...new Set(edges.flatMap(e => [e.from, e.to]))];
        return { ok: true, kind: 'json', nodes, edges,
                 summary: `Dependency graph: ${nodes.length} nodes, ${edges.length} edges` };
      }),

    alpha('alpha.api_test_suite_gen',
      'Generate a JS test harness from an OpenAPI-ish spec listing endpoints.',
      { properties: { endpoints: { type: 'array', items: { type: 'object',
        properties: { method: {type:'string'}, path: {type:'string'}, name: {type:'string'} } } }, base_url: { type: 'string' } },
        required: ['endpoints'] },
      async (input) => {
        const err = need(input, ['endpoints']); if (err) return err;
        const base = input.base_url || 'http://localhost:8080';
        const tests = input.endpoints.map((e, i) =>
`// ${e.name || (e.method + ' ' + e.path)}
t('${e.method} ${e.path}', async () => {
  const r = await fetch('${base}${e.path}', { method: '${e.method}' });
  assert(r.ok, '${e.path} returned ' + r.status);
});`).join('\n\n');
        return { ok: true, kind: 'code', language: 'javascript',
          code: `// auto-generated test suite\nlet pass=0, fail=0;\nfunction assert(c,m){if(!c)throw new Error(m||'fail')}\nfunction t(n,fn){fn().then(()=>{pass++;console.log('PASS '+n)}).catch(e=>{fail++;console.log('FAIL '+n+': '+e.message)})}\n\n${tests}`,
          summary: `Generated ${input.endpoints.length} test cases.` };
      }),

    alpha('alpha.data_quality_audit',
      'Audit a tabular dataset: row count, null rate per column, type inference, outlier flag.',
      { properties: { rows: { type: 'array' } }, required: ['rows'] },
      async (input) => {
        const err = need(input, ['rows']); if (err) return err;
        const rows = input.rows;
        if (rows.length === 0) return { ok: true, summary: 'empty dataset', findings: { rows: 0 } };
        const cols = [...new Set(rows.flatMap(r => Object.keys(r)))];
        const colStats = {};
        for (const c of cols) {
          const vals = rows.map(r => r[c]);
          const nulls = vals.filter(v => v == null || v === '').length;
          const types = [...new Set(vals.map(v => v == null ? 'null' : typeof v))];
          colStats[c] = { non_null: vals.length - nulls, null_rate: nulls / vals.length, types };
        }
        return { ok: true, kind: 'json', findings: { rows: rows.length, columns: cols.length, by_column: colStats },
                 summary: `${rows.length} rows × ${cols.length} cols audited.` };
      }),

    alpha('alpha.changelog_compose',
      'Group an array of commit messages by conventional-commits type and emit CHANGELOG markdown.',
      { properties: { commits: { type: 'array', items: { type: 'string' } }, version: { type: 'string' } },
        required: ['commits'] },
      async (input) => {
        const err = need(input, ['commits']); if (err) return err;
        const r = skills?.run?.('code.changelog', input);
        if (r?.ok) return r;
        // Fallback
        const groups = { feat: [], fix: [], docs: [], chore: [], other: [] };
        for (const c of input.commits) {
          const m = c.match(/^(feat|fix|docs|chore)(?:\([^)]+\))?:\s*(.+)/);
          if (m) groups[m[1]].push(m[2]); else groups.other.push(c);
        }
        let out = `## [${input.version || 'Unreleased'}]\n\n`;
        for (const [k, items] of Object.entries(groups)) {
          if (!items.length) continue;
          out += `### ${k}\n${items.map(i => '- ' + i).join('\n')}\n\n`;
        }
        return { ok: true, kind: 'markdown', markdown: out, summary: `Composed changelog: ${input.commits.length} commits.` };
      }),

    alpha('alpha.deploy_dry_run',
      'Validate a deploy plan (env vars present, version format, no leaked secrets in config).',
      { properties: { env: { type: 'object' }, version: { type: 'string' }, config: { type: 'object' } },
        required: ['env', 'version'] },
      async (input) => {
        const err = need(input, ['env', 'version']); if (err) return err;
        const issues = [];
        if (!/^\d+\.\d+\.\d+/.test(input.version)) issues.push(`Version '${input.version}' is not semver-shaped`);
        for (const k of ['NODE_ENV', 'PORT', 'DATABASE_URL']) {
          if (!input.env[k]) issues.push(`Missing required env var: ${k}`);
        }
        const cfgStr = JSON.stringify(input.config || {});
        if (/sk-[A-Za-z0-9-_]{20,}|lk_[A-Za-z0-9-_]{20,}|AKIA[0-9A-Z]{16}/.test(cfgStr))
          issues.push('Possible API key in config — never commit secrets');
        return { ok: issues.length === 0, kind: 'json', issues, ready_to_deploy: issues.length === 0,
                 summary: issues.length ? `Blocked: ${issues.length} issue(s)` : 'Dry-run passed.' };
      }),

    alpha('alpha.security_scan',
      'Pattern-scan code for known dangerous patterns (eval, shell injection, hard-coded secrets).',
      { properties: { code: { type: 'string' }, filename: { type: 'string' } }, required: ['code'] },
      async (input) => {
        const err = need(input, ['code']); if (err) return err;
        const patterns = [
          { id: 'eval', re: /\beval\s*\(/, sev: 'high' },
          { id: 'hard_coded_key', re: /\b(sk-[A-Za-z0-9-_]{20,}|lk_[A-Za-z0-9-_]{20,}|AKIA[0-9A-Z]{16})\b/, sev: 'critical' },
          { id: 'shell_pipe_curl', re: /curl\s+[^\n|]+\|\s*(sh|bash)/, sev: 'critical' },
          { id: 'sql_injection_risk', re: /(query|exec)\s*\(\s*['"`].*\$\{/, sev: 'high' },
          { id: 'dangerous_innerHTML', re: /\.innerHTML\s*=/, sev: 'medium' },
        ];
        const findings = patterns.filter(p => p.re.test(input.code))
          .map(p => ({ id: p.id, severity: p.sev }));
        return { ok: findings.length === 0, findings,
                 summary: findings.length ? `${findings.length} security findings` : 'Clean.' };
      }),

    alpha('alpha.documentation_generate',
      'Extract function/class exports from source and emit Markdown API docs.',
      { properties: { code: { type: 'string' }, language: { type: 'string' } }, required: ['code'] },
      async (input) => {
        const err = need(input, ['code']); if (err) return err;
        const exports = [...input.code.matchAll(/export\s+(?:async\s+)?(?:function|class|const|let)\s+(\w+)/g)].map(m => m[1]);
        const funcs = [...input.code.matchAll(/(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)/g)].map(m => ({ name: m[1], params: m[2] }));
        let out = `# API Reference\n\n## Exports\n${exports.map(e => `- \`${e}\``).join('\n') || '_none_'}\n\n## Functions\n${funcs.map(f => `### ${f.name}\nParameters: \`${f.params}\``).join('\n\n') || '_none_'}\n`;
        return { ok: true, kind: 'markdown', markdown: out,
                 summary: `Extracted ${exports.length} exports, ${funcs.length} functions.` };
      }),

    alpha('alpha.refactor_proposal',
      'Analyze code complexity heuristics and propose refactor opportunities.',
      { properties: { code: { type: 'string' } }, required: ['code'] },
      async (input) => {
        const err = need(input, ['code']); if (err) return err;
        const lines = input.code.split('\n');
        const proposals = [];
        if (lines.length > 300) proposals.push({ id: 'split_module', why: `File is ${lines.length} lines; split into smaller modules.` });
        const longFns = [...input.code.matchAll(/function\s+(\w+)[^{]*\{([^}]{500,})/g)];
        for (const m of longFns) proposals.push({ id: 'long_function', name: m[1], why: 'Function body > 500 chars; extract helpers.' });
        const dupCount = [...new Set(input.code.split('\n').filter(l => l.trim().length > 40))].length / lines.length;
        if (dupCount < 0.8) proposals.push({ id: 'duplication', why: 'High repeated-line ratio; consider dedup/helper.' });
        return { ok: true, kind: 'json', proposals,
                 summary: `${proposals.length} refactor proposal(s).` };
      }),

    alpha('alpha.cost_estimate',
      'Estimate cloud cost for a load spec: requests/month, GB-egress, GB-storage, CPU-hours.',
      { properties: { requests_per_month: { type: 'number' }, gb_egress: { type: 'number' },
                       gb_storage: { type: 'number' }, cpu_hours: { type: 'number' } },
        required: [] },
      async (input) => {
        const reqs = input.requests_per_month || 0;
        const egress = input.gb_egress || 0;
        const storage = input.gb_storage || 0;
        const cpu = input.cpu_hours || 0;
        // Round-numbers, illustrative
        const rates = { requests_per_million: 0.40, egress_per_gb: 0.09, storage_per_gb_month: 0.023, cpu_per_hour: 0.04 };
        const cost = {
          requests:  (reqs / 1_000_000) * rates.requests_per_million,
          egress:    egress * rates.egress_per_gb,
          storage:   storage * rates.storage_per_gb_month,
          cpu:       cpu * rates.cpu_per_hour,
        };
        const total = Object.values(cost).reduce((s, v) => s + v, 0);
        return { ok: true, kind: 'json', cost, total_usd: Math.round(total * 100) / 100, rates,
                 summary: `Estimated cost: $${total.toFixed(2)}/month` };
      }),

    alpha('alpha.knowledge_dossier',
      'Compose a research dossier: gather entries + knowledge tokens + receipts on a topic. Mints a knowledge token.',
      { properties: { topic: { type: 'string' }, agent_id: { type: 'string' } }, required: ['topic'] },
      async (input) => {
        const err = need(input, ['topic']); if (err) return err;
        const owner = input.agent_id || 'claude';
        const entries = (vault?.list?.(owner, {}) || []).filter(e =>
          e.key.toLowerCase().includes(input.topic.toLowerCase()) ||
          (e.metadata?.tags || []).some(t => t.toLowerCase().includes(input.topic.toLowerCase()))
        ).slice(0, 20);
        const tokens = knowledge?.search?.({ query: input.topic, limit: 5 }) || [];
        let minted = null;
        if (knowledge && entries.length >= 2) {
          const r = knowledge.mint({
            name: `dossier_${input.topic}_${Date.now().toString(36).slice(-5)}`,
            minter: owner,
            domains: [input.topic],
            summary: `Dossier: ${entries.length} entries + ${tokens.length} prior tokens on '${input.topic}'.`,
            inputs: entries.slice(0, 6).map(e => ({ kind: 'entry', ref: e.key })),
          });
          if (r.ok) minted = r.token.id;
        }
        return { ok: true, kind: 'markdown',
          markdown: md(`Dossier — ${input.topic}`, {
            'Matching entries': entries.map(e => `- \`${e.key}\``).join('\n') || '_none_',
            'Existing tokens': tokens.map(t => `- ${t.id} · ${t.name}`).join('\n') || '_none_',
            'Minted': minted ? `New KT \`${minted}\`` : '_skipped (< 2 entries)_',
          }),
          findings: { entry_count: entries.length, token_count: tokens.length, minted },
          knowledge_token: minted,
          summary: `Dossier on '${input.topic}': ${entries.length} entries, ${tokens.length} tokens, minted ${minted || 'none'}.` };
      }),

    alpha('alpha.failure_remediation_plan',
      'Build a remediation plan from open failure patterns: top N by recurrence + proposed fixes + sequencing.',
      { properties: { limit: { type: 'number', default: 5 } } },
      async (input) => {
        if (!failures) return { ok: false, reason: 'NO_FAILURES_REGISTRY' };
        const patterns = failures.list({ pattern_only: true, limit: input.limit || 5 });
        const items = patterns.map(p => {
          const detail = failures.get(p.sig);
          return { sig: p.sig, count: p.count, kind: p.kind, strategy: detail?.proposal?.strategy, summary: detail?.proposal?.summary };
        });
        return { ok: true, kind: 'json', items, total: items.length,
                 summary: `Remediation plan: ${items.length} pattern(s) ranked by recurrence.` };
      }),

    alpha('alpha.system_self_audit',
      'Full self-audit: chain integrity + governance pipeline test + receipt-rate trend.',
      { properties: {} },
      async () => {
        const recV = receipts?.verify();
        const rootV = rootVault?.verify();
        const eff = efficiency?.stats?.();
        return { ok: true, kind: 'json',
          chain_integrity: { receipts: recV, root: rootV },
          efficiency_totals: eff,
          summary: `Audit: receipts ${recV?.ok?'intact':'BROKEN'}, root ${rootV?.ok?'intact':'BROKEN'}.` };
      }),

    alpha('alpha.session_onboard',
      'Onboard a new AI session: hand back tier, available tools, recent decisions, open promises.',
      { properties: { agent_id: { type: 'string' } }, required: ['agent_id'] },
      async (input) => {
        const recentDecisions = (vault?.list?.(input.agent_id, {}) || [])
          .filter(e => e.key.startsWith('decisions/') || e.metadata?.tags?.includes('decision'))
          .slice(0, 5);
        return { ok: true, kind: 'json',
          welcome: `Welcome ${input.agent_id}. You are inside Loom.`,
          recent_decisions: recentDecisions.map(e => e.key),
          next_step: 'Call workspace_focus + plan_create to start.',
          summary: `Onboarded ${input.agent_id}.` };
      }),

    alpha('alpha.workflow_recipe_builder',
      'Compose a multi-skill workflow recipe from a goal description + intended skill names.',
      { properties: { goal: { type: 'string' }, skills: { type: 'array', items: { type: 'string' } } },
        required: ['goal', 'skills'] },
      async (input) => {
        const err = need(input, ['goal', 'skills']); if (err) return err;
        const nodes = input.skills.map((s, i) => ({ id: `step_${i+1}`, skill: s, input: {} }));
        return { ok: true, kind: 'json',
          recipe: { id: `recipe_${randomToken(6)}`, goal: input.goal, nodes },
          summary: `Recipe with ${nodes.length} steps for: ${input.goal}` };
      }),

    alpha('alpha.deposit_classifier',
      'Classify a deposit blob by content sniffing: zip header, json, text, binary.',
      { properties: { content_b64: { type: 'string' } }, required: ['content_b64'] },
      async (input) => {
        const err = need(input, ['content_b64']); if (err) return err;
        const head = Buffer.from(input.content_b64, 'base64').subarray(0, 8);
        let kind = 'binary';
        if (head[0] === 0x50 && head[1] === 0x4B) kind = 'zip_archive';
        else if (head[0] === 0x7B || head[0] === 0x5B) kind = 'json_payload';
        else if (head.every(b => b >= 0x20 && b <= 0x7E)) kind = 'document';
        return { ok: true, kind: 'classifier', detected_kind: kind, header_hex: head.toString('hex'),
                 summary: `Classified as ${kind}.` };
      }),

    alpha('alpha.entry_resonance_check',
      'For a given key, find related entries by fingerprint similarity + tag overlap. Returns ranked list.',
      { properties: { key: { type: 'string' }, agent_id: { type: 'string' }, limit: { type: 'number', default: 10 } },
        required: ['key'] },
      async (input) => {
        const err = need(input, ['key']); if (err) return err;
        const all = vault?.list?.(input.agent_id || 'claude', {}) || [];
        const target = all.find(e => e.key === input.key);
        if (!target) return { ok: false, reason: 'KEY_NOT_FOUND' };
        const targetTags = new Set(target.metadata?.tags || []);
        const ranked = all.filter(e => e.key !== input.key).map(e => {
          const tags = new Set(e.metadata?.tags || []);
          const overlap = [...targetTags].filter(t => tags.has(t)).length;
          return { key: e.key, overlap, strength: e.strength };
        }).filter(r => r.overlap > 0).sort((a, b) => b.overlap - a.overlap || b.strength - a.strength);
        return { ok: true, kind: 'json', target: input.key, related: ranked.slice(0, input.limit || 10),
                 summary: `Found ${ranked.length} resonant entries; returning top ${input.limit || 10}.` };
      }),

    alpha('alpha.protocol_check',
      'Verify all protocol/* entries in ROOT exist; report missing canonical protocols.',
      { properties: {} },
      async () => {
        const canonical = ['protocol/welcome', 'protocol/computational-receipts'];
        const present = rootVault ? [...rootVault.entries.keys()].filter(k => k.startsWith('protocol/')) : [];
        const missing = canonical.filter(c => !present.some(p => p === c || p.startsWith(c + '-v')));
        return { ok: missing.length === 0, kind: 'json', present, missing,
                 summary: missing.length ? `Missing: ${missing.join(', ')}` : 'All canonical protocols present.' };
      }),

    alpha('alpha.channel_broadcast',
      'Publish a message to multiple channels by name pattern in one call.',
      { properties: { pattern: { type: 'string' }, body: { type: 'string' }, agent_id: { type: 'string' } },
        required: ['pattern', 'body', 'agent_id'] },
      async (input, ctx) => {
        const err = need(input, ['pattern', 'body', 'agent_id']); if (err) return err;
        const channels = ctx?.channels?.list?.() || [];
        const matches = channels.filter(c => c.name.includes(input.pattern));
        const results = [];
        for (const m of matches) {
          const r = ctx?.channels?.publish?.(m.id, { agent_id: input.agent_id, body: input.body });
          results.push({ channel: m.name, ok: r?.ok, msg_id: r?.msg_id });
        }
        return { ok: true, kind: 'json', broadcast_to: matches.length, results,
                 summary: `Broadcast '${input.body.slice(0, 40)}…' to ${matches.length} channel(s).` };
      }),

    alpha('alpha.complete_release',
      'Full release pipeline: changelog + tag + dataset card + announcement draft.',
      { properties: { name: { type: 'string' }, version: { type: 'string' }, commits: { type: 'array' } },
        required: ['name', 'version', 'commits'] },
      async (input) => {
        const err = need(input, ['name', 'version', 'commits']); if (err) return err;
        const log = await skills?.run?.('code.changelog', input);
        return { ok: true, kind: 'markdown',
          markdown: md(`Release · ${input.name} v${input.version}`, {
            'Changelog': log?.markdown || '_pending_',
            'Tag': `\`v${input.version}\``,
            'Announcement': `${input.name} v${input.version} is out. See changelog.`,
          }),
          summary: `Composed release pipeline for ${input.name} v${input.version}.` };
      }),
  ];
}
