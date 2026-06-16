// consolidation.mjs — episodic → semantic memory consolidation.
//
// PATTERN (from MedinaMemorySystems): when the vault accumulates many small
// related entries, fold them into a compressed semantic summary. Originals are
// kept for replay but their decay rate jumps; the summary is durable.
//
// HOW IT WORKS
//   1. Find candidate clusters: entries sharing a tag prefix or key prefix,
//      with strength below a threshold (cold), > N members.
//   2. Each cluster produces ONE consolidated entry at the same tier, with:
//      key = consolidated/<prefix>/<hash>
//      value = { summary, source_keys, source_count, time_span }
//      tags = ['consolidated', ...source tags]
//   3. Source entries get their decayRate doubled (faster forgetting), the
//      summary keeps the slow decay.
//   4. Every consolidation appends a receipt + adds a 'supersedes' graph edge
//      from summary → each source.

const DEFAULT_MIN_CLUSTER = 3;

export class MemoryConsolidator {
  constructor({ vault, receipts, graph }) {
    this.vault    = vault;
    this.receipts = receipts;
    this.graph    = graph;
  }

  /** Find candidate clusters (cold + grouped + > minSize). Read-only. */
  candidates({ ownerId, minClusterSize = DEFAULT_MIN_CLUSTER, maxStrength = 0.35, tier } = {}) {
    if (!this.vault) return { ok: false, reason: 'NO_VAULT' };
    const all = this.vault.list(ownerId, { tier });
    const cold = all.filter(e => (e.strength ?? 1) <= maxStrength && !e.metadata?.tags?.includes('consolidated'));
    const clusters = {};
    for (const e of cold) {
      const prefix = (e.metadata?.tags?.[0]) ?? e.key.split('/')[0];
      (clusters[prefix] ||= []).push(e);
    }
    return {
      ok: true,
      total_candidates: cold.length,
      clusters: Object.entries(clusters)
        .filter(([, items]) => items.length >= minClusterSize)
        .map(([prefix, items]) => ({
          prefix, count: items.length,
          tier: items[0].tier,
          oldest: Math.min(...items.map(i => new Date(i.created).getTime())),
          newest: Math.max(...items.map(i => new Date(i.created).getTime())),
          example_keys: items.slice(0, 5).map(i => i.key),
        })),
    };
  }

  /**
   * Run consolidation on a single cluster.
   * summary = a string describing what these entries collectively mean.
   * The caller (AI) supplies the summary — we don't synthesize it ourselves;
   * we just fold the references and accelerate decay on sources.
   */
  consolidate({ ownerId, prefix, summary, tier = 'PRIVATE' }) {
    if (!this.vault) return { ok: false, reason: 'NO_VAULT' };
    if (!summary)    return { ok: false, reason: 'SUMMARY_REQUIRED' };
    const all = this.vault.list(ownerId, { tier });
    const sources = all.filter(e =>
      !e.metadata?.tags?.includes('consolidated') &&
      ((e.metadata?.tags?.[0] === prefix) || e.key.startsWith(prefix + '/')));
    if (sources.length < DEFAULT_MIN_CLUSTER)
      return { ok: false, reason: 'CLUSTER_TOO_SMALL', size: sources.length };

    const key = `consolidated/${prefix}/${Date.now().toString(36)}`;
    const stored = this.vault.store({
      key, value: { summary, source_keys: sources.map(s => s.key), source_count: sources.length,
                    time_span: { from: sources.reduce((m, s) => Math.min(m, new Date(s.created).getTime()), Date.now()),
                                 to:   sources.reduce((m, s) => Math.max(m, new Date(s.created).getTime()), 0) } },
      tier, ownerId,
      metadata: { tags: ['consolidated', prefix], source: 'consolidator' },
    });
    if (!stored.ok) return stored;

    // Bump decay rate on sources (forget faster — they're now superseded)
    if (this.vault.entries) {
      for (const s of sources) {
        const live = this.vault.entries.get?.(s.key);
        if (live) live.decayRate = (live.decayRate || 0) * 2 + 0.001;
      }
    }

    if (this.graph) {
      const sumNodeId = `entry:${key}`;
      this.graph.addNode({ id: sumNodeId, kind: 'entry', label: key, tier });
      for (const s of sources) this.graph.link(sumNodeId, `entry:${s.key}`, 'supersedes');
    }
    this.receipts?.append({
      kind: 'vault_promote', ref: key, agent: ownerId,
      meta: { reason: 'consolidation', source_count: sources.length, prefix },
    });
    return { ok: true, key, source_count: sources.length, hash: stored.head_hash };
  }
}
