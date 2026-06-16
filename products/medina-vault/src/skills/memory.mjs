// skills/memory.mjs — vault-native memory skills. Operates on the live vault.

export function buildMemorySkills({ vault, custos }) {
  const need = (input, fields) => {
    for (const f of fields) if (input[f] == null || input[f] === '')
      return { ok: false, reason: `MISSING_FIELD:${f}` };
    return null;
  };

  return [
    {
      name: 'memory.recall_by_tag',
      description: 'Recall all entries (in tiers visible to the agent) whose metadata.tags includes a given tag. Ranked by φ-strength.',
      inputSchema: {
        type: 'object',
        properties: {
          tag:      { type: 'string' },
          tier:     { type: 'string', enum: ['PUBLIC','SHARED','PRIVATE','SOVEREIGN'] },
          limit:    { type: 'number', default: 20 },
          agent_id: { type: 'string' },
        },
        required: ['tag'],
      },
      run(input, ctx) {
        const err = need(input, ['tag']); if (err) return err;
        const requester = ctx?.agent_id ?? input.agent_id ?? 'operator';
        const hits = vault.search(requester, { tag: input.tag, tier: input.tier, limit: input.limit ?? 20 });
        return { ok: true, count: hits.length, results: hits };
      },
    },

    {
      name: 'memory.summarize_tier',
      description: 'Produce a textual summary of all entries at a tier (visible to the agent). Keys + first-line previews.',
      inputSchema: {
        type: 'object',
        properties: { tier: { type: 'string', enum: ['PUBLIC','SHARED','PRIVATE','SOVEREIGN'] }, agent_id: { type: 'string' } },
        required: ['tier'],
      },
      run(input, ctx) {
        const err = need(input, ['tier']); if (err) return err;
        const requester = ctx?.agent_id ?? input.agent_id ?? 'operator';
        const entries = vault.list(requester, { tier: input.tier });
        const lines = entries.map(e => `• [${e.tier}] ${e.key} — ⛓${e.lineage_depth} — ${e.strength.toFixed(2)}`);
        return { ok: true, kind: 'markdown', summary: `${entries.length} ${input.tier} entries`,
                 markdown: `## ${input.tier} entries (${entries.length})\n\n${lines.join('\n')}\n` };
      },
    },

    {
      name: 'memory.lineage_walk',
      description: 'Walk the full RECITAL_PLUS_ONE chain for a key and return the hash sequence + chain depth.',
      inputSchema: {
        type: 'object',
        properties: { key: { type: 'string' }, agent_id: { type: 'string' } },
        required: ['key'],
      },
      run(input, ctx) {
        const requester = ctx?.agent_id ?? input.agent_id ?? 'operator';
        return vault.lineage(input.key, requester);
      },
    },

    {
      name: 'memory.export_markdown',
      description: 'Export the operator-visible vault as a Markdown document for backup or transport.',
      inputSchema: {
        type: 'object',
        properties: {
          tier:     { type: 'string', enum: ['PUBLIC','SHARED','PRIVATE','SOVEREIGN'] },
          agent_id: { type: 'string' },
        },
      },
      run(input, ctx) {
        const requester = ctx?.agent_id ?? input.agent_id ?? 'operator';
        const tiers = input.tier ? [input.tier] : ['SOVEREIGN', 'PRIVATE', 'SHARED', 'PUBLIC'];
        let md = `# Medina Vault export\n_${new Date().toISOString()}_\n\n`;
        for (const t of tiers) {
          const items = vault.list(requester, { tier: t });
          if (!items.length) continue;
          md += `## ${t} (${items.length})\n\n`;
          for (const i of items) {
            md += `### \`${i.key}\`\nowner: ${i.ownerId} · lineage depth: ${i.lineage_depth} · strength: ${i.strength.toFixed(3)}\n\n`;
          }
        }
        return { ok: true, kind: 'markdown', markdown: md, bytes: md.length };
      },
    },

    {
      name: 'memory.snapshot',
      description: 'Return the entire vault snapshot (entries DUAL_READ-authorized for the agent) as JSON for backup.',
      inputSchema: { type: 'object', properties: { agent_id: { type: 'string' } } },
      run(input, ctx) {
        const requester = ctx?.agent_id ?? input.agent_id ?? 'operator';
        const all = ['SOVEREIGN', 'PRIVATE', 'SHARED', 'PUBLIC'].flatMap(t => vault.list(requester, { tier: t }));
        return { ok: true, kind: 'json', count: all.length, entries: all };
      },
    },

    {
      name: 'memory.tag_audit',
      description: 'Audit which tags are in use across the vault and how many entries carry each.',
      inputSchema: { type: 'object', properties: { agent_id: { type: 'string' } } },
      run(input, ctx) {
        const requester = ctx?.agent_id ?? input.agent_id ?? 'operator';
        const all = vault.list(requester, {});
        const counts = {};
        for (const e of all) for (const t of (e.metadata?.tags ?? [])) counts[t] = (counts[t] || 0) + 1;
        const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([tag, n]) => ({ tag, count: n }));
        return { ok: true, total_tags: ranked.length, tags: ranked };
      },
    },
  ];
}
