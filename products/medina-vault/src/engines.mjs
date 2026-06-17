// engines.mjs — NAMED ENGINES. High-level callable workflows.
//
// You don't have to orchestrate. You hit the engine name with input.
// The engine fans out: calls skills, dispatches agents, sweeps registries,
// stores deliverables, leaves you with one structured result.
//
// AVAILABLE ENGINES
//   morning_briefing    — auditor + scribe + auto_doctrine sweep → unified status
//   session_wrapup      — scribe + session_close + ROOT auto-doctrine
//   health_check        — auditor + receipts.verify + root.verify + budget check
//   consolidate_cold    — curator agent + run top consolidations
//   compress_vault      — mine phrases from vault + ingest → savings report
//   train_on_failures   — failures.sweep + auto-apply documentation_entry proposals
//   research_dossier    — researcher + synthesizer + auto-mint knowledge token
//   knowledge_check     — reinforcement.beat + stale eviction + report
//   daily_save          — focus + decisions to ROOT + scribe + close
//   onboard_matter      — legal engagement + NDA + invoice (composed)
//
// Every engine returns { ok, engine, steps: [...], summary, deliverables }
// and fires its own receipts the system attributes to 'engine'.

export class EngineRegistry {
  constructor({ skills, agents, vault, rootVault, receipts, knowledge, failures,
                 efficiency, consolidator, reinforcement, ctxLog, autoDoctrine,
                 symbolTable } = {}) {
    this.ctx = { skills, agents, vault, rootVault, receipts, knowledge, failures,
                 efficiency, consolidator, reinforcement, ctxLog, autoDoctrine,
                 symbolTable };
    this.engines = new Map();
    this.runs = []; // history
    this._register();
  }

  _register() {
    this.engines.set('morning_briefing',  this._morningBriefing());
    this.engines.set('session_wrapup',    this._sessionWrapup());
    this.engines.set('health_check',      this._healthCheck());
    this.engines.set('consolidate_cold',  this._consolidateCold());
    this.engines.set('compress_vault',    this._compressVault());
    this.engines.set('train_on_failures', this._trainOnFailures());
    this.engines.set('research_dossier',  this._researchDossier());
    this.engines.set('knowledge_check',   this._knowledgeCheck());
    this.engines.set('daily_save',        this._dailySave());
    this.engines.set('onboard_matter',    this._onboardMatter());
  }

  list() {
    return [...this.engines.values()].map(e => ({
      name: e.name, description: e.description,
      inputSchema: e.inputSchema, steps: e.steps,
    }));
  }

  async run(name, input = {}, { operator } = {}) {
    const e = this.engines.get(name);
    if (!e) return { ok: false, reason: 'ENGINE_NOT_FOUND' };
    const t0 = Date.now();
    let result;
    try {
      result = await e.run(input, this.ctx, { operator });
      result = { ok: true, ...result };
    } catch (err) {
      result = { ok: false, reason: 'ENGINE_THREW', message: err.message };
    }
    const rec = {
      engine: name, ts: Date.now(), ms: Date.now() - t0,
      ok: !!result.ok, steps_completed: result.steps?.length || 0,
    };
    this.runs.push(rec);
    if (this.runs.length > 100) this.runs.shift();
    this.ctx.receipts?.append({
      kind: 'workflow_run', ref: `engine:${name}`, agent: 'engine',
      meta: { ms: rec.ms, ok: rec.ok, steps: rec.steps_completed },
    });
    return { engine: name, ms: rec.ms, ...result };
  }

  stats() {
    return {
      total_engines: this.engines.size,
      total_runs: this.runs.length,
      by_engine: this.runs.reduce((a, r) => { a[r.engine] = (a[r.engine] || 0) + 1; return a; }, {}),
      recent: this.runs.slice(-10).reverse(),
    };
  }

  // ── ENGINE DEFINITIONS ─────────────────────────────────────────────

  _morningBriefing() {
    return {
      name: 'morning_briefing',
      description: 'Auditor + scribe + auto-doctrine sweep. Returns a unified picture of what happened since last session.',
      inputSchema: { type: 'object', properties: { lookback_hours: { type: 'number', default: 24 }, agent_id: { type: 'string' } } },
      steps: ['agents.dispatch(auditor)', 'agents.dispatch(scribe)', 'auto_doctrine.sweep()'],
      async run(input, ctx, { operator }) {
        const steps = [];
        const audit = ctx.agents?.dispatch('auditor', { lookback_hours: input.lookback_hours || 24 });
        steps.push({ name: 'auditor', task_id: audit?.task_id });
        const scribe = ctx.agents?.dispatch('scribe', { lookback_hours: input.lookback_hours || 24 });
        steps.push({ name: 'scribe', task_id: scribe?.task_id });
        const doctrine = ctx.autoDoctrine ? await ctx.autoDoctrine.sweep({ operator }) : { ok: false, reason: 'NO_AUTO_DOCTRINE' };
        steps.push({ name: 'auto_doctrine', written: doctrine.written?.length || 0 });
        await new Promise(r => setTimeout(r, 80)); // let agent tasks complete
        const auditOut = ctx.agents?.collect(audit?.task_id);
        const scribeOut = ctx.agents?.collect(scribe?.task_id);
        return {
          steps,
          summary: `Morning briefing: ${doctrine.written?.length || 0} new doctrine entries; auditor + scribe deliverables stored.`,
          deliverables: {
            auditor: auditOut?.stored_at,
            scribe:  scribeOut?.stored_at,
            doctrine_written: doctrine.written,
          },
        };
      },
    };
  }

  _sessionWrapup() {
    return {
      name: 'session_wrapup',
      description: 'Scribe writes session notes + writes context snapshot + ROOT auto-doctrine sweep. Prepares clean handoff to next session.',
      inputSchema: {
        type: 'object',
        properties: {
          summary:       { type: 'string' },
          agent_id:      { type: 'string' },
          decisions:     { type: 'array' },
          open_promises: { type: 'array' },
        },
        required: ['summary'],
      },
      steps: ['agents.dispatch(scribe)', 'ctxLog.snapshot', 'auto_doctrine.sweep'],
      async run(input, ctx, { operator }) {
        const steps = [];
        const scribe = ctx.agents?.dispatch('scribe', { lookback_hours: 6 });
        steps.push({ name: 'scribe', task_id: scribe?.task_id });
        const snap = ctx.ctxLog?.snapshot({
          summary: input.summary, agent: input.agent_id || 'claude',
          decisions: input.decisions || [], open_promises: input.open_promises || [],
        });
        steps.push({ name: 'context_snapshot', hash: snap?.snapshot?.hash });
        const doctrine = ctx.autoDoctrine ? await ctx.autoDoctrine.sweep({ operator }) : null;
        steps.push({ name: 'auto_doctrine', written: doctrine?.written?.length || 0 });
        return {
          steps,
          summary: `Session wrapup complete; snapshot ${snap?.snapshot?.hash?.slice(0,12)}; ${doctrine?.written?.length || 0} new doctrine.`,
          deliverables: { snapshot_hash: snap?.snapshot?.hash, doctrine_written: doctrine?.written },
        };
      },
    };
  }

  _healthCheck() {
    return {
      name: 'health_check',
      description: 'Full system health: auditor + receipts.verify + root.verify + agent activity check.',
      inputSchema: { type: 'object', properties: { lookback_hours: { type: 'number', default: 24 } } },
      steps: ['agents.dispatch(auditor)', 'receipts.verify', 'root.verify', 'agents.stats'],
      async run(input, ctx) {
        const steps = [];
        const audit = ctx.agents?.dispatch('auditor', { lookback_hours: input.lookback_hours || 24 });
        steps.push({ name: 'auditor', task_id: audit?.task_id });
        const receiptsCheck = ctx.receipts?.verify();
        steps.push({ name: 'receipts.verify', ok: receiptsCheck?.ok, head: receiptsCheck?.head_hash?.slice(0,16) });
        const rootCheck = ctx.rootVault?.verify();
        steps.push({ name: 'root.verify', ok: rootCheck?.ok, head: rootCheck?.head_hash?.slice(0,16) });
        const agentStats = ctx.agents?.stats();
        steps.push({ name: 'agents.stats', total_tasks: agentStats?.total_tasks });
        await new Promise(r => setTimeout(r, 60));
        const auditOut = ctx.agents?.collect(audit?.task_id);
        const allGreen = receiptsCheck?.ok && rootCheck?.ok;
        return {
          steps, healthy: allGreen,
          summary: allGreen ? 'All systems green; chains verified intact.' : 'Some checks failed; see steps.',
          deliverables: { auditor_report: auditOut?.stored_at, receipts_head: receiptsCheck?.head_hash, root_head: rootCheck?.head_hash },
        };
      },
    };
  }

  _consolidateCold() {
    return {
      name: 'consolidate_cold',
      description: 'Curator agent finds candidates + runs consolidation on each cluster.',
      inputSchema: { type: 'object', properties: { agent_id: { type: 'string' }, min_cluster: { type: 'number', default: 3 }, max_consolidations: { type: 'number', default: 5 } } },
      steps: ['agents.dispatch(curator)', 'consolidator.consolidate (per cluster)'],
      async run(input, ctx) {
        const steps = [];
        const owner = input.agent_id || 'claude';
        const curate = ctx.agents?.dispatch('curator', { min_cluster: input.min_cluster });
        steps.push({ name: 'curator', task_id: curate?.task_id });
        await new Promise(r => setTimeout(r, 60));
        const curateOut = ctx.agents?.collect(curate?.task_id);
        const proposals = curateOut?.output?.findings?.proposals || [];
        const consolidations = [];
        for (const p of proposals.slice(0, input.max_consolidations || 5)) {
          const result = ctx.consolidator?.consolidate({
            ownerId: owner, prefix: p.prefix,
            summary: p.suggested_summary, tier: p.tier,
          });
          if (result?.ok) consolidations.push({ key: result.key, source_count: result.source_count });
          steps.push({ name: 'consolidate', prefix: p.prefix, ok: result?.ok });
        }
        return {
          steps,
          summary: `Consolidated ${consolidations.length} cluster(s).`,
          deliverables: { curator_report: curateOut?.stored_at, consolidations },
        };
      },
    };
  }

  _compressVault() {
    return {
      name: 'compress_vault',
      description: 'Mine phrases from the live vault corpus + ingest into the symbol dictionary. Returns savings preview.',
      inputSchema: { type: 'object', properties: { agent_id: { type: 'string' }, max_k: { type: 'number', default: 32 } } },
      steps: ['vault.list (corpus)', 'compression.mine', 'symbolTable.ingest', 'sample.compress'],
      async run(input, ctx) {
        const steps = [];
        const owner = input.agent_id || 'claude';
        const entries = ctx.vault?.list?.(owner, {}) || [];
        const corpus = entries.map(e => {
          const live = ctx.vault?.entries?.get?.(e.key);
          return typeof live?.value === 'string' ? live.value : JSON.stringify(live?.value || '');
        });
        steps.push({ name: 'corpus', size: corpus.length, total_bytes: corpus.reduce((s,t)=>s+t.length, 0) });
        const { minePhrases } = await import('./compression.mjs');
        const phrases = minePhrases(corpus, { maxK: input.max_k || 32 });
        steps.push({ name: 'mine', candidate_phrases: phrases.length, est_savings: phrases.reduce((s,p)=>s+p.savings, 0) });
        const ingestResult = ctx.symbolTable?.ingest(phrases);
        steps.push({ name: 'ingest', added: ingestResult?.added, total_symbols: ingestResult?.total });
        // Sample compress: pick the longest entry, show ratio
        let sample = null;
        if (corpus.length) {
          const longest = corpus.sort((a,b) => b.length - a.length)[0];
          sample = ctx.symbolTable?.compress(longest);
        }
        return {
          steps,
          summary: `Compressed vault: ${ingestResult?.added || 0} new symbols added (total ${ingestResult?.total || 0}). Sample ratio ${sample?.ratio || 'n/a'}.`,
          deliverables: { sample_ratio: sample?.ratio, sample_raw_bytes: sample?.raw_bytes, sample_compressed_bytes: sample?.compressed_bytes },
        };
      },
    };
  }

  _trainOnFailures() {
    return {
      name: 'train_on_failures',
      description: 'Apply proposed fixes for failure patterns that are documentation_entry strategy (safe to auto-apply).',
      inputSchema: { type: 'object', properties: {} },
      steps: ['failures.list(with_proposals)', 'failures.applyFix (per safe proposal)'],
      async run(input, ctx) {
        const steps = [];
        const open = ctx.failures?.list({ with_proposals: true, limit: 50 }) || [];
        steps.push({ name: 'list_open_proposals', count: open.length });
        const applied = [];
        for (const bucket of open) {
          const full = ctx.failures?.get(bucket.sig);
          // Only auto-apply documentation_entry; sandbox_wrap / validation_precheck need review
          if (full?.proposal?.strategy === 'documentation_entry') {
            const r = ctx.failures?.applyFix(bucket.sig);
            if (r?.ok) applied.push({ sig: bucket.sig, strategy: full.proposal.strategy });
          }
        }
        steps.push({ name: 'applied', count: applied.length });
        return {
          steps,
          summary: `Applied ${applied.length} documentation_entry fix(es) of ${open.length} open proposal(s).`,
          deliverables: { applied, deferred: open.length - applied.length },
        };
      },
    };
  }

  _researchDossier() {
    return {
      name: 'research_dossier',
      description: 'Researcher + synthesizer pipeline. Auto-mints a knowledge token from the fused result.',
      inputSchema: {
        type: 'object',
        properties: { topic: { type: 'string' }, agent_id: { type: 'string' } },
        required: ['topic'],
      },
      steps: ['agents.dispatch(researcher)', 'agents.dispatch(synthesizer)'],
      async run(input, ctx) {
        const steps = [];
        const r1 = ctx.agents?.dispatch('researcher', { topic: input.topic, agent_id: input.agent_id });
        const r2 = ctx.agents?.dispatch('synthesizer', { query: input.topic, agent_id: input.agent_id });
        steps.push({ name: 'researcher', task_id: r1?.task_id });
        steps.push({ name: 'synthesizer', task_id: r2?.task_id });
        await new Promise(r => setTimeout(r, 80));
        const r1Out = ctx.agents?.collect(r1?.task_id);
        const r2Out = ctx.agents?.collect(r2?.task_id);
        return {
          steps,
          summary: `Research dossier on '${input.topic}': researcher confidence ${r1Out?.output?.findings?.confidence || 'n/a'}; synthesizer ${r2Out?.output?.findings?.entry_count || 0} entries; KT ${r2Out?.output?.knowledge_token || 'none'}.`,
          deliverables: { researcher: r1Out?.stored_at, synthesizer: r2Out?.stored_at, knowledge_token: r2Out?.output?.knowledge_token },
        };
      },
    };
  }

  _knowledgeCheck() {
    return {
      name: 'knowledge_check',
      description: 'reinforcement.beat + stale eviction report. Returns what got marked stale this pass.',
      inputSchema: { type: 'object', properties: { min_quiet_ms: { type: 'number', default: 60000 } } },
      steps: ['reinforcement.beat', 'reinforcement.list(stale=true)'],
      async run(input, ctx) {
        const steps = [];
        const beat = ctx.reinforcement?.beat({ minQuietMs: input.min_quiet_ms });
        steps.push({ name: 'beat', decayed: beat?.decayed, marked_stale: beat?.marked_stale });
        const stale = ctx.reinforcement?.list({ stale: true, limit: 50 }) || [];
        steps.push({ name: 'list_stale', count: stale.length });
        return {
          steps,
          summary: `Knowledge check: ${beat?.decayed || 0} decayed; ${beat?.marked_stale || 0} marked stale; ${stale.length} currently stale.`,
          deliverables: { stale_keys: stale.map(s => s.key) },
        };
      },
    };
  }

  _dailySave() {
    return {
      name: 'daily_save',
      description: 'Write decisions + open promises to ROOT, run scribe + close session, sweep auto-doctrine. The end-of-day routine.',
      inputSchema: {
        type: 'object',
        properties: {
          decisions:     { type: 'array' },
          open_promises: { type: 'array' },
          summary:       { type: 'string' },
          agent_id:      { type: 'string' },
        },
      },
      steps: ['rootVault.write (decisions)', 'agents.dispatch(scribe)', 'ctxLog.snapshot', 'auto_doctrine.sweep'],
      async run(input, ctx, { operator }) {
        const steps = [];
        // 1. Decisions to ROOT
        const written = [];
        for (const d of (input.decisions || [])) {
          const r = ctx.rootVault?.write({
            key: `decisions/${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
            kind: 'decision', agent_id: input.agent_id || 'claude', operator,
            value: typeof d === 'string' ? d : JSON.stringify(d),
          });
          if (r?.ok) written.push(r.key);
        }
        steps.push({ name: 'root_writes', count: written.length });
        // 2. Scribe
        const scribe = ctx.agents?.dispatch('scribe', { lookback_hours: 24 });
        steps.push({ name: 'scribe', task_id: scribe?.task_id });
        // 3. Snapshot
        const snap = ctx.ctxLog?.snapshot({
          summary: input.summary || 'daily save', agent: input.agent_id || 'claude',
          decisions: input.decisions || [], open_promises: input.open_promises || [],
        });
        steps.push({ name: 'snapshot', hash: snap?.snapshot?.hash });
        // 4. Doctrine sweep
        const doctrine = ctx.autoDoctrine ? await ctx.autoDoctrine.sweep({ operator }) : null;
        steps.push({ name: 'auto_doctrine', written: doctrine?.written?.length || 0 });
        await ctx.rootVault?.persist?.();
        return {
          steps,
          summary: `Daily save: ${written.length} decisions → ROOT; snapshot ${snap?.snapshot?.hash?.slice(0,12)}; ${doctrine?.written?.length || 0} new doctrine.`,
          deliverables: { root_decisions: written, snapshot_hash: snap?.snapshot?.hash, doctrine_written: doctrine?.written },
        };
      },
    };
  }

  _onboardMatter() {
    return {
      name: 'onboard_matter',
      description: 'Legal: engagement letter + NDA + invoice for a new client matter. Composed of 3 skills.',
      inputSchema: {
        type: 'object',
        properties: {
          firm_name:    { type: 'string' },
          attorney:     { type: 'string' },
          client_name:  { type: 'string' },
          matter:       { type: 'string' },
          fee_basis:    { type: 'string' },
          line_items:   { type: 'array' },
        },
        required: ['firm_name', 'attorney', 'client_name', 'matter', 'fee_basis'],
      },
      steps: ['skills.legal.engagement_letter', 'skills.legal.nda_mutual', 'skills.legal.invoice'],
      async run(input, ctx) {
        const steps = [];
        const eng = await ctx.skills?.run('legal.engagement_letter', {
          firm_name: input.firm_name, attorney: input.attorney,
          client_name: input.client_name, matter: input.matter, fee_basis: input.fee_basis,
        });
        steps.push({ name: 'engagement', ok: eng?.ok, file: eng?.filename });
        const nda = await ctx.skills?.run('legal.nda_mutual', {
          party_a_name: input.firm_name, party_b_name: input.client_name,
          purpose: input.matter, term_years: 3,
        });
        steps.push({ name: 'nda', ok: nda?.ok, file: nda?.filename });
        const inv = await ctx.skills?.run('legal.invoice', {
          from_name: input.firm_name, bill_to_name: input.client_name,
          invoice_number: `INV-${Date.now().toString(36).slice(-6).toUpperCase()}`,
          line_items: input.line_items || [{ description: 'Initial consultation', quantity: 1, rate: 500 }],
        });
        steps.push({ name: 'invoice', ok: inv?.ok, file: inv?.filename });
        return {
          steps,
          summary: `Onboarded ${input.client_name}: engagement + NDA + invoice generated.`,
          deliverables: {
            engagement: eng?.filename,
            nda:        nda?.filename,
            invoice:    inv?.filename,
            engagement_b64: eng?.bytes_base64,
            nda_b64:        nda?.bytes_base64,
            invoice_b64:    inv?.bytes_base64,
          },
        };
      },
    };
  }
}
