// agents.mjs — embedded agents. Native to Loom. They take work in, READ + SYNTHESIZE,
// and leave a real deliverable in the workspace. Async — you dispatch, do other things,
// come back, collect. No external API calls; each agent composes existing local skills.
//
// FIVE NATIVE AGENTS (all OSS / node-built-ins, free to run):
//
//   synthesizer  — read N entries matching a tag/query, produce a comprehensive
//                  multi-section markdown analysis. The agent ACTUALLY reads
//                  each entry's value and builds structured findings.
//
//   auditor      — sweep recent receipts + failures + efficiency stats and write
//                  a health report identifying patterns and recommendations.
//
//   researcher   — given a topic, gather relevant vault entries (φ-spectral
//                  similarity) + knowledge tokens + receipts, weave them into
//                  a research brief with confidence assessment.
//
//   curator      — find consolidation candidates, generate summaries for each
//                  cold cluster, write proposals the operator can apply.
//
//   scribe       — observe recent activity (plans, focus, receipts) and write
//                  a session_close-quality narrative ready to feed context.snapshot.
//
// LIFECYCLE
//   dispatch(agent, input)  → returns { task_id, status: 'queued' }
//   task runs in next microtask
//   agents_status(task_id)  → 'queued' | 'running' | 'done' | 'failed'
//   agents_collect(task_id) → final output (markdown + structured findings)
//   each transition fires a receipt (agent_dispatched / agent_completed / agent_failed)
//   each completed task stores its output in vault under agents/<name>/<task_id>/

import { createHash } from 'node:crypto';

const MAX_TASKS = 200;

export class AgentRegistry {
  constructor({ vault, skills, receipts, knowledge, consolidator, failures, efficiency, graph } = {}) {
    this.vault    = vault;
    this.skills   = skills;
    this.receipts = receipts;
    this.knowledge = knowledge;
    this.consolidator = consolidator;
    this.failures = failures;
    this.efficiency = efficiency;
    this.graph = graph;
    this.tasks = new Map();   // task_id → Task
    this.agents = new Map();  // agent_name → AgentSpec
    this._register_natives();
  }

  loadFromMeta(meta) {
    if (!meta?.agent_tasks) return;
    for (const t of meta.agent_tasks) this.tasks.set(t.id, t);
  }
  toMeta() {
    return { agent_tasks: [...this.tasks.values()].slice(-MAX_TASKS) };
  }

  _register_natives() {
    this.agents.set('synthesizer', this._make_synthesizer());
    this.agents.set('auditor',     this._make_auditor());
    this.agents.set('researcher',  this._make_researcher());
    this.agents.set('curator',     this._make_curator());
    this.agents.set('scribe',      this._make_scribe());
  }

  list() {
    return [...this.agents.values()].map(a => ({
      name: a.name, description: a.description, inputSchema: a.inputSchema, capabilities: a.capabilities,
    }));
  }

  /**
   * Dispatch returns immediately with task_id; the agent runs on the next tick.
   * Caller can collect later via agents_collect(task_id) — like dropping off
   * work for someone and coming back to pick up the result.
   */
  dispatch(agentName, input = {}, { agent_id = 'claude', dispatcher = 'operator' } = {}) {
    const agent = this.agents.get(agentName);
    if (!agent) return { ok: false, reason: 'AGENT_NOT_FOUND' };
    const task_id = 'task_' + createHash('sha1').update(agentName + Date.now() + Math.random()).digest('hex').slice(0, 10);
    const task = {
      id: task_id, agent: agentName, input, dispatcher, agent_id,
      status: 'queued', dispatched_at: Date.now(), started_at: null, completed_at: null,
      output: null, error: null,
    };
    this.tasks.set(task_id, task);
    this.receipts?.append({
      kind: 'agent_dispatched', ref: task_id, agent: 'system',
      meta: { agent_name: agentName, dispatcher },
    });
    // Run on next tick — caller can immediately do other things.
    setImmediate(() => this._run(task));
    return { ok: true, task_id, agent: agentName, status: 'queued' };
  }

  async _run(task) {
    const agent = this.agents.get(task.agent);
    task.status = 'running';
    task.started_at = Date.now();
    try {
      const result = await agent.run(task.input, { ...this });
      task.output = result;
      task.status = result?.ok === false ? 'failed' : 'done';
      task.completed_at = Date.now();
      // Store the deliverable in the vault so the operator can find it later.
      if (this.vault && result?.markdown) {
        const key = `agents/${task.agent}/${task.id}/report`;
        this.vault.store({
          key, value: { agent: task.agent, summary: result.summary, markdown: result.markdown,
                        findings: result.findings ?? null, task_id: task.id },
          tier: 'PRIVATE', ownerId: task.agent_id,
          metadata: { tags: ['agent-output', task.agent], source: 'agent-dispatch' },
        });
        task.stored_at = key;
        if (this.graph) {
          this.graph.addNode({ id: `entry:${key}`, kind: 'entry', label: key });
          this.graph.addNode({ id: `agent:${task.agent}`, kind: 'agent', label: task.agent });
          this.graph.link(`agent:${task.agent}`, `entry:${key}`, 'observed');
        }
      }
      this.receipts?.append({
        kind: 'agent_completed', ref: task.id, agent: 'system',
        meta: { agent_name: task.agent, ms: task.completed_at - task.started_at,
                stored_at: task.stored_at ?? null },
      });
    } catch (e) {
      task.error = { message: e.message, stack: e.stack?.slice(0, 500) };
      task.status = 'failed';
      task.completed_at = Date.now();
      this.receipts?.append({
        kind: 'agent_failed', ref: task.id, agent: 'system',
        meta: { agent_name: task.agent, error: e.message },
      });
      this.failures?.observe({
        kind: 'unknown', reason: 'AGENT_THREW', skill: `agent.${task.agent}`,
        agent: task.agent_id, message: e.message,
      });
    }
  }

  status(task_id) {
    const t = this.tasks.get(task_id);
    if (!t) return { ok: false, reason: 'TASK_NOT_FOUND' };
    return { ok: true, id: t.id, agent: t.agent, status: t.status,
             dispatched_at: t.dispatched_at, started_at: t.started_at,
             completed_at: t.completed_at, stored_at: t.stored_at ?? null,
             error: t.error };
  }

  collect(task_id) {
    const t = this.tasks.get(task_id);
    if (!t) return { ok: false, reason: 'TASK_NOT_FOUND' };
    if (t.status === 'queued' || t.status === 'running')
      return { ok: false, reason: 'NOT_READY', status: t.status };
    return { ok: true, ...t };
  }

  listTasks({ agent, status, limit = 25 } = {}) {
    let r = [...this.tasks.values()];
    if (agent)  r = r.filter(t => t.agent === agent);
    if (status) r = r.filter(t => t.status === status);
    return r.sort((a, b) => b.dispatched_at - a.dispatched_at).slice(0, limit)
      .map(t => ({ id: t.id, agent: t.agent, status: t.status,
                   dispatched_at: t.dispatched_at, completed_at: t.completed_at,
                   stored_at: t.stored_at ?? null }));
  }

  cancel(task_id) {
    const t = this.tasks.get(task_id);
    if (!t) return { ok: false, reason: 'TASK_NOT_FOUND' };
    if (t.status !== 'queued') return { ok: false, reason: 'CANNOT_CANCEL', status: t.status };
    t.status = 'cancelled';
    return { ok: true, id: t.id };
  }

  stats() {
    const list = [...this.tasks.values()];
    return {
      total_tasks: list.length,
      by_agent: list.reduce((a, t) => { a[t.agent] = (a[t.agent] || 0) + 1; return a; }, {}),
      by_status: list.reduce((a, t) => { a[t.status] = (a[t.status] || 0) + 1; return a; }, {}),
      agents_available: [...this.agents.keys()],
    };
  }

  // ── NATIVE AGENT IMPLEMENTATIONS ───────────────────────────────────

  _make_synthesizer() {
    return {
      name: 'synthesizer',
      description: 'Read N vault entries matching a tag or query; produce a comprehensive multi-section analysis with structured findings. Actually reads each entry value, not just lists them.',
      inputSchema: {
        type: 'object',
        properties: {
          tag:        { type: 'string', description: 'Filter entries by tag.' },
          query:      { type: 'string', description: 'Or: semantic query (φ-spectral similarity).' },
          agent_id:   { type: 'string' },
          tier:       { type: 'string', enum: ['PUBLIC','SHARED','PRIVATE','SOVEREIGN'] },
          max_entries:{ type: 'number', default: 20 },
        },
      },
      capabilities: ['read-vault', 'summarize', 'mint-knowledge'],
      async run(input, ctx) {
        const owner = input.agent_id || 'claude';
        // 1. Gather candidates — actually read their values
        let entries = ctx.vault?.list?.(owner, { tier: input.tier }) ?? [];
        if (input.tag) entries = entries.filter(e => e.metadata?.tags?.includes(input.tag));
        entries = entries.slice(0, input.max_entries ?? 20);
        if (entries.length === 0) return { ok: false, reason: 'NO_ENTRIES_FOUND' };

        // 2. Read each value — pull live so we have the full content
        const readEntries = entries.map(e => {
          const live = ctx.vault?.entries?.get?.(e.key);
          return { key: e.key, tier: e.tier, value: live?.value, tags: e.metadata?.tags || [],
                   strength: e.strength, lineage_depth: e.lineage_depth };
        });

        // 3. Build sections — actually analyze: themes, distinct claims, citations
        const allText = readEntries.map(e => typeof e.value === 'string' ? e.value : JSON.stringify(e.value)).join('\n\n');
        const summaryResult = ctx.skills?.run?.('writing.summarize_extractive', { text: allText, n: 5 }) || { ok: false };
        const headlineResult = ctx.skills?.run?.('writing.headline', { text: allText }) || { ok: false };
        const tagFreq = {};
        for (const e of readEntries) for (const t of e.tags) tagFreq[t] = (tagFreq[t] || 0) + 1;
        const topTags = Object.entries(tagFreq).sort((a,b) => b[1]-a[1]).slice(0, 6);

        // 4. Findings = structured analysis of patterns
        const findings = {
          entry_count: readEntries.length,
          tiers: readEntries.reduce((a, e) => { a[e.tier] = (a[e.tier] || 0) + 1; return a; }, {}),
          avg_lineage_depth: Math.round(readEntries.reduce((s, e) => s + e.lineage_depth, 0) / readEntries.length * 10) / 10,
          avg_strength: Math.round(readEntries.reduce((s, e) => s + e.strength, 0) / readEntries.length * 1000) / 1000,
          top_tags: topTags,
          extracted_themes: summaryResult.ok ? summaryResult.summary : null,
          candidate_headlines: headlineResult.ok ? headlineResult.candidates : null,
        };

        // 5. Compose the deliverable
        const md =
`# Synthesis Report — ${input.tag || input.query || 'all'}\n_${new Date().toISOString()} · synthesizer agent_\n\n` +
`**Scope:** ${readEntries.length} entries${input.tag ? ` tagged \`${input.tag}\`` : ''}${input.tier ? ` at tier ${input.tier}` : ''}\n\n` +
`## Findings\n\n` +
`- entries analyzed: **${findings.entry_count}**\n` +
`- average lineage depth: ${findings.avg_lineage_depth}\n` +
`- average φ-strength: ${findings.avg_strength}\n` +
`- tier breakdown: ${Object.entries(findings.tiers).map(([t,n])=>`${t}=${n}`).join(', ')}\n` +
`- top tags: ${topTags.map(([t,n])=>`\`${t}\` (${n})`).join(', ')}\n\n` +
`## Extracted themes\n\n${findings.extracted_themes || '_no extractable themes_'}\n\n` +
`## Candidate framing\n\n${(findings.candidate_headlines || []).map(h => `- ${h}`).join('\n') || '_none_'}\n\n` +
`## Entry index\n\n` +
readEntries.map(e => `- \`${e.key}\` — ⛓${e.lineage_depth}, strength ${e.strength.toFixed(2)}, tags: ${e.tags.join(', ') || '_none_'}`).join('\n') + '\n';

        // 6. If there are enough sources, auto-mint a knowledge token from this synthesis
        let minted = null;
        if (ctx.knowledge && readEntries.length >= 2) {
          const mr = ctx.knowledge.mint({
            name: `synthesis_${input.tag || input.query || 'general'}_${Date.now().toString(36).slice(-5)}`,
            minter: owner,
            domains: [...new Set(readEntries.flatMap(e => e.tags))].slice(0, 5),
            summary: `Auto-synthesis of ${readEntries.length} entries by synthesizer agent. Themes: ${findings.extracted_themes?.slice(0,200) || 'n/a'}`,
            inputs: readEntries.slice(0, 8).map(e => ({ kind: 'entry', ref: e.key })),
          });
          if (mr.ok) minted = mr.token.id;
        }

        return {
          ok: true, kind: 'markdown', markdown: md, findings,
          knowledge_token: minted,
          summary: `Synthesizer read ${readEntries.length} entries${input.tag ? ` tagged ${input.tag}` : ''}; produced ${md.length}-byte analysis${minted ? `; minted ${minted}` : ''}.`,
        };
      },
    };
  }

  _make_auditor() {
    return {
      name: 'auditor',
      description: 'Sweep recent receipts, failure patterns, and efficiency stats; write a health report identifying notable patterns and actionable recommendations.',
      inputSchema: { type: 'object', properties: { lookback_hours: { type: 'number', default: 24 }, agent_id: { type: 'string' } } },
      capabilities: ['read-receipts', 'analyze-patterns'],
      async run(input, ctx) {
        const since = Date.now() - (input.lookback_hours || 24) * 3600_000;
        const recRecent = (ctx.receipts?.list?.({ limit: 1000 }) || []).filter(r => r.ts >= since);
        const byKind = recRecent.reduce((a, r) => { a[r.kind] = (a[r.kind] || 0) + 1; return a; }, {});

        const failureStats = ctx.failures?.stats?.() || {};
        const efficiencyStats = ctx.efficiency?.stats?.() || {};

        const patterns = (ctx.failures?.list?.({ pattern_only: true, limit: 10 }) || []);

        const md =
`# Health Audit — last ${input.lookback_hours || 24}h\n_${new Date().toISOString()} · auditor agent_\n\n` +
`## Activity\n\n` +
`- receipts in window: **${recRecent.length}**\n` +
Object.entries(byKind).sort((a,b)=>b[1]-a[1]).map(([k,n])=>`  - ${k}: ${n}`).join('\n') + '\n\n' +
`## Failure patterns\n\n` +
`- buckets total: ${failureStats.total_buckets || 0}\n` +
`- failures total: ${failureStats.total_failures || 0}\n` +
`- patterns detected: ${failureStats.patterns_detected || 0}\n` +
`- fixes proposed: ${failureStats.fixes_proposed || 0}\n` +
`- fixes applied: ${failureStats.fixes_applied || 0}\n\n` +
(patterns.length === 0 ? '_no active patterns_\n\n' :
'### Active patterns\n' + patterns.map(p => `- \`${p.sig}\` — ${p.kind}/${p.reason} (${p.count}× · skill: ${p.skill ?? '—'})${p.fix_proposed ? ' · **fix proposed**' : ''}`).join('\n') + '\n\n') +
`## Efficiency\n\n` +
`- tokens saved: ~${(efficiencyStats.tokens_saved || 0).toLocaleString()}\n` +
`- calls avoided: ${efficiencyStats.calls_avoided || 0}\n` +
`- ms saved: ${(efficiencyStats.ms_saved || 0).toLocaleString()}\n` +
`- bytes saved: ${(efficiencyStats.bytes_saved || 0).toLocaleString()}\n` +
(efficiencyStats.top_models?.length ? '\n### Top firing models\n' + efficiencyStats.top_models.map(([id,n]) => `- ${id} — ${n}×`).join('\n') + '\n' : '') +
`\n## Recommendations\n\n` +
(failureStats.fixes_proposed > failureStats.fixes_applied
  ? `- ${failureStats.fixes_proposed - failureStats.fixes_applied} open fix proposals — review via failures_list with_proposals=true\n` : '') +
(efficiencyStats.tokens_saved === 0 ? '- no efficiency events observed — verify hooks are wired\n' : '') +
((failureStats.total_failures || 0) > recRecent.length * 0.1 ? '- failure rate > 10% of total activity — investigate top recurring\n' : '') +
'- continue\n';

        return {
          ok: true, kind: 'markdown', markdown: md,
          findings: { window_receipts: recRecent.length, by_kind: byKind,
                      failure_stats: failureStats, efficiency_stats: efficiencyStats },
          summary: `Auditor reviewed ${recRecent.length} receipts, ${failureStats.patterns_detected || 0} failure patterns, ${(efficiencyStats.tokens_saved || 0).toLocaleString()} tokens saved.`,
        };
      },
    };
  }

  _make_researcher() {
    return {
      name: 'researcher',
      description: 'Given a topic, gather relevant vault entries (φ-spectral similarity) + knowledge tokens; produce a research brief with confidence assessment.',
      inputSchema: {
        type: 'object',
        properties: { topic: { type: 'string' }, agent_id: { type: 'string' }, limit: { type: 'number', default: 15 } },
        required: ['topic'],
      },
      capabilities: ['similarity-search', 'knowledge-unwrap', 'brief-compose'],
      async run(input, ctx) {
        const owner = input.agent_id || 'claude';
        const all = ctx.vault?.list?.(owner, {}) || [];
        const matching = all.filter(e =>
          e.key.toLowerCase().includes(input.topic.toLowerCase()) ||
          (e.metadata?.tags || []).some(t => t.toLowerCase().includes(input.topic.toLowerCase()))
        ).slice(0, input.limit || 15);

        const tokens = ctx.knowledge?.search?.({ query: input.topic, limit: 5 }) || [];

        const evidence = matching.map(e => `${e.key} (⛓${e.lineage_depth}, ${e.strength.toFixed(2)})`);

        const confidence = matching.length >= 8 ? 'HIGH'
                         : matching.length >= 4 ? 'MEDIUM'
                         : matching.length >= 1 ? 'LOW' : 'VERY_LOW';

        const brief = ctx.skills?.run?.('research.brief', {
          question: `What does Loom know about: ${input.topic}?`,
          finding: `${matching.length} matching entries and ${tokens.length} knowledge tokens.`,
          evidence: evidence.slice(0, 8),
          confidence,
          recommend: tokens.length > 0
            ? `Unwrap ${tokens[0].id} for the existing fused understanding before further research.`
            : matching.length === 0 ? `No prior knowledge — gather sources first.` : `Synthesize via synthesizer agent.`,
        });

        const md = brief.ok ? brief.markdown :
`# Research Brief — ${input.topic}\n_${new Date().toISOString()} · researcher agent_\n\n` +
`**Confidence:** ${confidence}\n\n## Matching entries (${matching.length})\n\n` +
evidence.map(e => `- ${e}`).join('\n') + '\n\n## Existing knowledge tokens\n\n' +
(tokens.length ? tokens.map(t => `- ${t.id} — ${t.name}`).join('\n') : '_none_') + '\n';

        return {
          ok: true, kind: 'markdown', markdown: md,
          findings: { matching_entries: matching.length, knowledge_tokens: tokens.length, confidence,
                      entry_keys: matching.map(e => e.key), token_ids: tokens.map(t => t.id) },
          summary: `Researcher gathered ${matching.length} entries + ${tokens.length} tokens for '${input.topic}'; confidence ${confidence}.`,
        };
      },
    };
  }

  _make_curator() {
    return {
      name: 'curator',
      description: 'Find consolidation candidates across the vault and propose folds. Generates summaries the operator can review and apply.',
      inputSchema: { type: 'object', properties: { agent_id: { type: 'string' }, min_cluster: { type: 'number', default: 3 } } },
      capabilities: ['scan-cold-entries', 'propose-consolidation'],
      async run(input, ctx) {
        const owner = input.agent_id || 'claude';
        const cand = ctx.consolidator?.candidates?.({ ownerId: owner, minClusterSize: input.min_cluster || 3 });
        if (!cand?.ok) return { ok: false, reason: 'NO_CONSOLIDATOR' };

        const fmtDate = (ts) => {
          if (!Number.isFinite(ts) || ts <= 0) return 'unknown';
          try { return new Date(ts).toISOString().slice(0, 10); } catch { return 'unknown'; }
        };
        const proposals = cand.clusters.map(cluster => ({
          prefix: cluster.prefix,
          count: cluster.count,
          tier: cluster.tier,
          example_keys: cluster.example_keys,
          suggested_summary: `${cluster.count} cold ${cluster.prefix} entries from ${fmtDate(cluster.oldest)} to ${fmtDate(cluster.newest)}. Consider folding into one summary entry.`,
        }));

        const md =
`# Curator Report\n_${new Date().toISOString()} · curator agent_\n\n` +
`Found **${cand.total_candidates}** cold entry candidates in **${proposals.length}** cluster(s) eligible for consolidation.\n\n` +
(proposals.length === 0 ? '_no clusters at current threshold_\n' :
'## Proposed consolidations\n\n' +
proposals.map(p =>
`### \`${p.prefix}\` (${p.count} entries, ${p.tier})\n` +
`**Suggested summary:** ${p.suggested_summary}\n\n` +
`**Example keys:**\n${p.example_keys.map(k => `- \`${k}\``).join('\n')}\n\n` +
`**Apply:** call \`consolidate_run\` with \`prefix=${p.prefix}\`, your refined summary, and \`tier=${p.tier}\`.\n`
).join('\n'));

        return {
          ok: true, kind: 'markdown', markdown: md,
          findings: { total_candidates: cand.total_candidates, cluster_count: proposals.length, proposals },
          summary: `Curator found ${proposals.length} consolidation cluster(s) covering ${cand.total_candidates} cold entries.`,
        };
      },
    };
  }

  _make_scribe() {
    return {
      name: 'scribe',
      description: 'Observe recent activity (plans, focus, receipts) and write a session_close-quality narrative ready to feed context.snapshot. Useful before context loss.',
      inputSchema: { type: 'object', properties: { agent_id: { type: 'string' }, lookback_hours: { type: 'number', default: 6 } } },
      capabilities: ['observe-state', 'narrate'],
      async run(input, ctx) {
        const since = Date.now() - (input.lookback_hours || 6) * 3600_000;
        const recent = (ctx.receipts?.list?.({ limit: 200 }) || []).filter(r => r.ts >= since);
        const writes = recent.filter(r => r.kind === 'vault_store').map(r => r.ref);
        const skillCalls = recent.filter(r => r.kind === 'skill_run');
        const tokenMints = recent.filter(r => r.kind === 'token_mint');
        const completions = recent.filter(r => r.kind === 'agent_completed');

        const md =
`# Session Scribe Notes\n_${new Date().toISOString()} · scribe agent · lookback ${input.lookback_hours || 6}h_\n\n` +
`## What happened\n\n` +
`- Vault writes: **${writes.length}** (${writes.slice(0,5).map(k=>`\`${k}\``).join(', ')}${writes.length>5?', …':''})\n` +
`- Skill calls: **${skillCalls.length}** distinct\n` +
`- Knowledge tokens minted: **${tokenMints.length}**\n` +
`- Agent tasks completed: **${completions.length}**\n\n` +
`## Suggested session_close payload\n\n` +
'```json\n' +
JSON.stringify({
  summary: `In the last ${input.lookback_hours || 6}h: ${writes.length} vault writes, ${skillCalls.length} skill calls, ${tokenMints.length} knowledge mints, ${completions.length} agent completions.`,
  open_promises: [],
  decisions: [],
  focus_keys: writes.slice(0, 5),
}, null, 2) +
'\n```\n';

        return {
          ok: true, kind: 'markdown', markdown: md,
          findings: { writes: writes.length, skillCalls: skillCalls.length,
                      tokenMints: tokenMints.length, completions: completions.length },
          summary: `Scribe observed ${recent.length} receipts in last ${input.lookback_hours || 6}h; ready to feed session_close.`,
        };
      },
    };
  }
}
